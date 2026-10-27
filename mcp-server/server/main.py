"""
TrailVerse MCP Server — OpenAI Apps SDK compatible.

Exposes 5 tools that wrap the TrailVerse Express backend:
  1. plan_trip           — AI-powered itinerary for any US destination
  2. get_park_details    — Live info for any of the 470+ NPS sites
  3. compare_parks       — Side-by-side 2-4 NPS site comparison
  4. search_parks        — Search/filter all 470+ NPS sites
  5. find_events         — Ranger programs and events at NPS sites

No tool requires authentication. Four tools are read-only. plan_trip is not:
it persists the itinerary in an anonymous TrailVerse guest session (48 h TTL)
so revisions can build on it. Trusted MCP traffic (X-TrailVerse-MCP-Key) is
not subject to the website's 5-message guest cap.

By default all tools return full Trailie markdown in text blocks (widgets
disabled — ChatGPT HTML cards are unreliable). Set MCP_ENABLE_WIDGETS=true to
re-enable optional HTML widget resources.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import time

import httpx
from pathlib import Path
from typing import Annotated, Any

from mcp.server.fastmcp import Context, FastMCP
from mcp.server.fastmcp.resources import FunctionResource
from mcp.types import CallToolResult, Icon, TextContent
from pydantic import AnyUrl, Field, ValidationError
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, PlainTextResponse, FileResponse

from .client import TrailVerseAPIError, TrailVerseClient, PLAN_TRIP_TIMEOUT
from .conversations import conversation_store
from .formatters import (
    format_compare,
    format_events,
    format_park_details,
    format_plan_trip,
    format_search,
)
from .host_instructions import MCP_HOST_INSTRUCTIONS
from .plan_trip_schema import (
    ACCOMMODATION,
    ADULTS,
    CHILDREN,
    DAYS,
    DIFFICULTY,
    FITNESS_LEVEL,
    GROUP_SIZE,
    HAS_KIDS,
    INTERESTS,
    LODGING_AREA,
    MAX_HIKE_MILES,
    MESSAGE,
    NUMBER_OF_DAYS,
    PARK_CODE,
    PARK_NAME,
    RELAXED_AFTERNOON,
    REVISION_REQUEST,
    SESSION_ID,
    START_DATE,
    SUNRISE,
    SUNSET,
    TRAVEL_MONTH,
)
from .plan_trip_service import (
    build_plan_trip_form_data,
    build_plan_trip_message,
    slim_plan_trip_structured,
    validate_plan_trip_business_rules,
)
from .rate_limit import plan_trip_limiter, read_tool_limiter
from .tool_metadata import (
    ACTIVITY_FILTER,
    COMPARE_PARK_CODES,
    COMPARE_PARKS_DESCRIPTION,
    EVENTS_CATEGORY,
    EVENTS_LIMIT,
    EVENTS_PARK_CODE,
    FIND_EVENTS_DESCRIPTION,
    GET_PARK_DETAILS_DESCRIPTION,
    GET_PARK_DETAILS_PARK_CODE,
    PLAN_TRIP_DESCRIPTION,
    SEARCH_LIMIT,
    SEARCH_PARKS_DESCRIPTION,
    SEARCH_QUERY,
    STATE_FILTER,
)
from .search_query import count_search_results, expand_search_query
from .park_resolution import ParkResolution, resolve_park
from .search_ranking import normalize_state, rank_catalog_results, rerank_search_results
from .types import (
    CompareParksInput,
    FindEventsInput,
    GetParkDetailsInput,
    PlanTripInput,
    SearchParksInput,
)
from .validation import (
    timeout_error_result,
    validation_error,
    validation_error_from_pydantic,
    validation_error_result,
)

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("trailverse-mcp")
# httpx logs every request URL (search terms, park codes) at INFO. Keep user
# query text out of the hosting logs; errors are still logged by our handlers.
logging.getLogger("httpx").setLevel(os.getenv("HTTPX_LOG_LEVEL", "WARNING"))

# ---------- Optional widget resources (disabled by default) ----------
# ChatGPT Apps SDK widgets are unreliable in production (blank iframes, null
# toolOutput, openai-mcp client skipping resources/read). All tools return full
# Trailie markdown in text blocks. Set MCP_ENABLE_WIDGETS=true to re-enable.

MCP_APPS_MIME = "text/html;profile=mcp-app"
WIDGETS_DIR = Path(__file__).resolve().parent.parent / "widgets"
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
MARKDOWN_ONLY = os.getenv("MCP_MARKDOWN_ONLY", "true").lower() not in ("0", "false", "no")
ENABLE_WIDGETS = (
    not MARKDOWN_ONLY
    and os.getenv("MCP_ENABLE_WIDGETS", "false").lower() in ("1", "true", "yes")
)
# Isolated park UI experiment; does not enable the planner or other widgets.
PARK_BROWSER_POC = os.getenv("MCP_PARK_BROWSER_POC", "false").lower() in ("1", "true", "yes")
PARK_WIDGET_KEYS = {"park-list", "park-details"}

# Public base URL for icon references in MCP server metadata.
# In production this is https://trailverse-mcp.onrender.com (MCP_SERVER_BASE);
# locally it falls back to http://localhost:PORT.
_BASE_URL = os.getenv(
    "MCP_SERVER_BASE",
    f"http://localhost:{os.getenv('PORT', '8000')}",
).rstrip("/")

WIDGET_MAP = {
    "itinerary":     ("ui://widget/itinerary.html",     "itinerary.html"),
    "park-details":  ("ui://widget/park-details.html",  "park-details.html"),
    "compare":       ("ui://widget/compare.html",       "compare.html"),
    "park-list":     ("ui://widget/park-list.html",     "park-list.html"),
    "events":        ("ui://widget/events.html",        "events.html"),
}


def _load_widget(filename: str) -> str:
    path = WIDGETS_DIR / filename
    if not path.exists():
        logger.warning("Widget file %s not found; serving placeholder", path)
        return f"<!doctype html><html><body>Widget {filename} not available.</body></html>"
    return path.read_text(encoding="utf-8")


# ---------- Create the FastMCP server ----------

mcp = FastMCP(
    name="TrailVerse",
    instructions=MCP_HOST_INSTRUCTIONS,
    icons=[
        Icon(src=f"{_BASE_URL}/icon.svg", mimeType="image/svg+xml"),
        Icon(src=f"{_BASE_URL}/icon-512.png", mimeType="image/png", sizes=["512x512"]),
    ],
    host=os.getenv("HOST", "0.0.0.0"),
    port=int(os.getenv("PORT", "8000")),
    # Apps SDK needs streamable-http; json_response=True returns JSON rather than SSE
    json_response=True,
    stateless_http=True,
)


# Register widget resources. We use the low-level resource manager to set
# the MCP Apps MIME type correctly.

def _register_widgets() -> None:
    for key, (uri, filename) in WIDGET_MAP.items():
        if not ENABLE_WIDGETS and key not in PARK_WIDGET_KEYS:
            continue
        park_poc = PARK_BROWSER_POC and key in PARK_WIDGET_KEYS
        html = _load_widget("park-browser-poc.html" if park_poc else filename)
        # Bind key for the closure
        def _make_reader(h: str) -> Any:
            def _reader() -> str:
                return h
            return _reader

        resource = FunctionResource(
            uri=AnyUrl(uri),
            name=f"trailverse-widget-{key}",
            description=f"TrailVerse {key} widget",
            mime_type=MCP_APPS_MIME,
            fn=_make_reader(html),
            meta={"ui": {"prefersBorder": True, "csp": {
                "connectDomains": [], "resourceDomains": [],
            }}} if park_poc else None,
        )
        mcp.add_resource(resource)
        logger.info("Registered widget resource %s -> %s", uri, filename)


if ENABLE_WIDGETS or PARK_BROWSER_POC:
    _register_widgets()
    logger.info("MCP HTML widgets enabled (all=%s, park_poc=%s)", ENABLE_WIDGETS, PARK_BROWSER_POC)
else:
    logger.info("MCP markdown-only mode (widgets disabled)")


# ---------- Prompts ----------
# MCP prompts are predefined message templates that clients can list and
# surface as clickable starters (e.g., ChatGPT's prompt picker).  They don't
# call any APIs — just return canned messages that guide the AI to use the
# right tool.

from mcp.server.fastmcp.prompts.base import UserMessage, AssistantMessage


@mcp.prompt(
    name="welcome",
    title="What is TrailVerse?",
    description="What the TrailVerse tools cover: US trip planning and about 470 NPS sites",
)
def welcome() -> list[AssistantMessage]:
    return [
        AssistantMessage(
            content=(
                "TrailVerse covers US travel planning and about 470 National Park Service "
                "sites: national parks, monuments, seashores, battlefields, historic sites, "
                "and more.\n\n"
                "With current NPS data (alerts, weather, fees, events — cached, refreshed "
                "regularly), the tools can:\n\n"
                "1. **Plan a trip** — day-by-day itineraries for any US destination\n"
                "2. **Explore a park** — current weather, alerts, campgrounds, permits, fees, hours\n"
                "3. **Compare parks** — side-by-side on weather, crowds, fees, activities\n"
                "4. **Search parks** — find the right park by state, activity, or vibe\n"
                "5. **Find events** — ranger programs, guided tours, star parties\n\n"
                "Try asking:\n"
                '- "Plan 3 days at Zion"\n'
                '- "Tell me about Glacier National Park"\n'
                '- "Compare Yellowstone and Grand Teton"\n\n'
                "More on the website: [TrailVerse planner](https://www.nationalparksexplorerusa.com/plan-ai) "
                "and [planning guides](https://www.nationalparksexplorerusa.com/guides)."
            )
        ),
    ]


@mcp.prompt(
    name="plan_my_trip",
    title="Plan a trip",
    description="Build a day-by-day itinerary for any US destination",
)
def plan_my_trip(
    destination: Annotated[str, Field(description="e.g. Yellowstone, Zion, San Diego")],
    days: Annotated[int, Field(description="Number of days (default 3)")] = 3,
) -> list[UserMessage]:
    return [
        UserMessage(content=f"Plan a {days}-day trip to {destination}"),
    ]


@mcp.prompt(
    name="explore_park",
    title="Explore a park",
    description="Get live details for any of the 470+ NPS sites",
)
def explore_park(
    park_name: Annotated[str, Field(description="e.g. Glacier National Park, Zion, Acadia")],
) -> list[UserMessage]:
    return [
        UserMessage(content=f"Tell me everything about {park_name}"),
    ]


@mcp.prompt(
    name="compare",
    title="Compare parks",
    description="Side-by-side comparison of two NPS sites",
)
def compare_prompt(
    park1: Annotated[str, Field(description="First park, e.g. Yellowstone")],
    park2: Annotated[str, Field(description="Second park, e.g. Grand Teton")],
) -> list[UserMessage]:
    return [
        UserMessage(content=f"Compare {park1} and {park2}"),
    ]


@mcp.prompt(
    name="whats_happening",
    title="Ranger programs & events at a park",
    description="Find upcoming ranger programs, tours, and scheduled events at an NPS site",
)
def whats_happening(
    park_name: Annotated[str, Field(description="e.g. Yellowstone, Grand Canyon, Gettysburg")],
) -> list[UserMessage]:
    return [
        UserMessage(content=f"What upcoming ranger programs and scheduled events are at {park_name}?"),
    ]


# ---------- Park code resolution ----------
# Matching rules live in park_resolution.py. Unmatched, ambiguous, and non-NPS
# inputs are reported to the caller — never replaced with a "closest" park.


def _parks_from_search(resp: dict[str, Any]) -> list[dict[str, Any]]:
    parks = resp.get("data", resp) if isinstance(resp, dict) else resp
    if isinstance(parks, dict) and "parks" in parks:
        parks = parks["parks"]
    return parks if isinstance(parks, list) else []


async def _search_for_resolution(query: str) -> list[dict[str, Any]]:
    async with TrailVerseClient() as client:
        resp = await client.search_parks(q=query, limit=10, fields="parkCode,fullName,name,designation")
    return _parks_from_search(resp)


async def _park_display_name(park_code: str) -> str:
    """Resolve NPS display name from a park code (e.g. zion → Zion National Park)."""
    code = (park_code or "").strip().lower()
    if not code:
        return ""
    try:
        async with TrailVerseClient() as client:
            details = await client.get_park_details(code)
        outer = details.get("data") or details
        park = outer.get("park") or outer
        return park.get("fullName") or park.get("name") or ""
    except TrailVerseAPIError:
        return ""


async def _resolve_park(name_or_code: str) -> ParkResolution:
    """Resolve a park name or code with confidence gating (see park_resolution)."""
    return await resolve_park(name_or_code, _search_for_resolution)


async def _resolve_park_code(name_or_code: str) -> str:
    """Resolved NPS code, or "" when the input did not confidently match one park."""
    return (await _resolve_park(name_or_code)).code or ""


def _resolution_error(res: ParkResolution, field: str) -> CallToolResult:
    return validation_error_result(
        validation_error(
            code=res.error_code(),
            message=res.explain(),
            field=field,
            received=res.input,
            expected="NPS park code (e.g. zion) or an unambiguous NPS site name",
        )
        | {"candidates": res.candidates[:5]}
    )


def _unknown_code_error(code: str, field: str) -> CallToolResult:
    return validation_error_result(
        validation_error(
            code="UNKNOWN_PARK_CODE",
            message=(
                f"No NPS site uses the code '{code}'. Use search_parks to find the right "
                "site, or pass the full park name (e.g. 'Bryce Canyon')."
            ),
            field=field,
            received=code,
            expected="known 4-letter NPS park code (e.g. brca, zion, yose)",
        )
    )


def _state_error(value: str, field: str = "state") -> CallToolResult:
    return validation_error_result(
        validation_error(
            code="INVALID_STATE",
            message=(
                f"'{value}' is not a recognized US state. Pass a two-letter code "
                "(e.g. UT, CA, AZ) or a full state name (e.g. Utah)."
            ),
            field=field,
            received=value,
            expected="two-letter US state/territory code or full name",
        )
    )


# ---------- Tool helpers ----------

def _tool_meta(invoking: str, invoked: str, widget: str | None = None) -> dict[str, Any]:
    """Progress strings, plus resource linkage for the opt-in park experiment."""
    meta = {
        "openai/toolInvocation/invoking": invoking,
        "openai/toolInvocation/invoked": invoked,
    }
    if PARK_BROWSER_POC and widget in PARK_WIDGET_KEYS:
        uri = WIDGET_MAP[widget][0]
        meta.update({
            "ui": {"resourceUri": uri, "visibility": ["model", "app"]},
            "openai/outputTemplate": uri,
            "openai/widgetAccessible": True,
        })
    return meta


def _text_content(full_markdown: str) -> list[dict[str, str]]:
    """Single text block — full Trailie markdown for all MCP clients."""
    return [{"type": "text", "text": full_markdown}]


def _markdown_images(image_data: list[dict[str, str | None]], limit: int = 3) -> str:
    """Build markdown image lines from image dicts with url/altText keys."""
    lines = []
    for img in image_data[:limit]:
        url = img.get("url") if isinstance(img, dict) else img
        alt = (img.get("altText") or img.get("title") or "Park photo") if isinstance(img, dict) else "Park photo"
        if url:
            lines.append(f"![{alt}]({url})")
    return "\n\n".join(lines)


def _tool_result(
    structured: dict[str, Any],
    content: str | list[dict[str, str]],
    meta_extra: dict[str, Any],
    *,
    machine_readable: bool = False,
) -> CallToolResult:
    """Return a CallToolResult with TextContent blocks for the LLM.

    content can be a plain text string or a list of {"type": "text", "text": ...}
    dicts. Images are embedded as markdown ![alt](url) in the text itself.

    When machine_readable is True, always attach structuredContent even if HTML
    widgets are disabled — using a slim payload for plan_trip session continuity.
    """
    if isinstance(content, str):
        blocks = [TextContent(type="text", text=content)]
    else:
        blocks = [
            TextContent(type="text", text=block.get("text", ""))
            for block in content
        ]
    kwargs: dict[str, Any] = {"content": blocks, "_meta": meta_extra}
    if ENABLE_WIDGETS or (PARK_BROWSER_POC and structured.get("kind") in {"park_list", "park_details"}):
        kwargs["structuredContent"] = structured
    elif machine_readable:
        kwargs["structuredContent"] = slim_plan_trip_structured(structured)
    return CallToolResult(**kwargs)


def _error_result(message: str) -> CallToolResult:
    return CallToolResult(
        content=[TextContent(type="text", text=f"TrailVerse error: {message}")],
        structuredContent={"kind": "error", "message": message},
        isError=True,
    )


async def _check_rate_limit(bucket: str) -> CallToolResult | None:
    """
    Apply the appropriate in-MCP rate limit bucket. Returns an error ToolResult
    if rate-limited, or None if the request should proceed.

    This is a server-wide fuse to cap damage if the backend bypass key ever
    leaks. Normal traffic should never hit these limits.
    """
    limiter = plan_trip_limiter if bucket == "plan_trip" else read_tool_limiter
    allowed, retry_after = await limiter.allow()
    if allowed:
        return None
    return _error_result(
        f"Global rate limit reached. Please try again in ~{int(retry_after)}s."
    )


# ---------- MCP analytics helpers ----------

def _detect_mcp_client(ctx: Context | None) -> str:
    """Detect whether the connected MCP client is ChatGPT, Claude, or unknown."""
    if ctx is None:
        return "unknown"
    try:
        params = ctx.request_context.session.client_params
        client_info = getattr(params, "clientInfo", None)
        if client_info:
            name = (getattr(client_info, "name", "") or "").lower()
            if "claude" in name:
                return "claude"
            if "chatgpt" in name or "openai" in name:
                return "chatgpt"
        # Fallback: check experimental capabilities for OpenAI keys
        caps = getattr(params, "capabilities", None)
        exp = getattr(caps, "experimental", None)
        if isinstance(exp, dict) and any(k.startswith("openai") for k in exp):
            return "chatgpt"
    except Exception:
        pass
    return "unknown"


def _client_time_zone(ctx: Context | None) -> str | None:
    """IANA zone from ChatGPT's openai/userLocation hint; the backend validates it and falls back."""
    if ctx is None:
        return None
    try:
        meta = ctx.request_context.meta
        location = (meta.model_dump() if meta is not None else {}).get("openai/userLocation") or {}
        zone = location.get("timezone") if isinstance(location, dict) else None
        return zone if isinstance(zone, str) and 0 < len(zone) <= 64 else None
    except Exception:
        return None


def _send_analytics(event: dict[str, Any]) -> None:
    """Fire-and-forget PostHog capture. Never blocks tool execution or sends trip text."""
    token = os.environ.get("POSTHOG_PROJECT_TOKEN")
    if not token:
        return
    meta = event.get("metadata") or {}
    client_name = str(meta.get("mcpClient") or "unknown").lower()
    if client_name not in {"chatgpt", "claude", "unknown"}:
        client_name = "unknown"
    host = (os.environ.get("POSTHOG_HOST") or "https://us.i.posthog.com").rstrip("/")
    payload = {
        "api_key": token,
        "event": "mcp_tool_completed",
        "distinct_id": f"mcp-{client_name}",
        "properties": {
            "tool": meta.get("toolName"),
            "client": client_name,
            "outcome": "success" if meta.get("success") else "failed",
            "duration_ms": meta.get("executionTimeMs"),
        },
    }

    async def _post() -> None:
        try:
            async with httpx.AsyncClient(timeout=2.0) as http:
                await http.post(f"{host}/capture/", json=payload)
        except Exception:
            logger.debug("PostHog capture failed", exc_info=True)

    try:
        asyncio.create_task(_post())
    except RuntimeError:
        pass


# ---------- Tools ----------

# readOnlyHint is False: every call persists the itinerary and messages in an
# anonymous TrailVerse guest session (MongoDB, 48 h TTL) and revisions update
# that saved plan. Per the Apps SDK definitions, persisting artifacts is not
# read-only. destructiveHint stays False: it never deletes or overwrites
# user-owned data, bookings, or third-party records — only the guest plan this
# conversation created.
@mcp.tool(
    name="plan_trip",
    title="Plan a US trip with Trailie",
    description=PLAN_TRIP_DESCRIPTION,
    annotations={
        "title": "Plan a US trip with Trailie",
        "readOnlyHint": False,
        "openWorldHint": True,
        "destructiveHint": False,
        "idempotentHint": False,
    },
    meta=_tool_meta(invoking="Planning your trip with live park data…", invoked="Itinerary ready"),
)
async def plan_trip(
    park_code: Annotated[str | None, Field(description=PARK_CODE)] = None,
    park_name: Annotated[str | None, Field(description=PARK_NAME)] = None,
    start_date: Annotated[str | None, Field(description=START_DATE)] = None,
    travel_month: Annotated[str | None, Field(description=TRAVEL_MONTH)] = None,
    number_of_days: Annotated[int | None, Field(description=NUMBER_OF_DAYS, json_schema_extra={"minimum": 1, "maximum": 14})] = None,
    adults: Annotated[int, Field(description=ADULTS, json_schema_extra={"minimum": 1, "maximum": 20})] = 1,
    children: Annotated[int, Field(description=CHILDREN, json_schema_extra={"minimum": 0, "maximum": 20})] = 0,
    interests: Annotated[list[str] | None, Field(description=INTERESTS)] = None,
    max_hike_miles: Annotated[float | None, Field(description=MAX_HIKE_MILES, json_schema_extra={"minimum": 0.1, "maximum": 30})] = None,
    difficulty: Annotated[list[str] | None, Field(description=DIFFICULTY)] = None,
    lodging_area: Annotated[str | None, Field(description=LODGING_AREA)] = None,
    sunrise: Annotated[bool | None, Field(description=SUNRISE)] = None,
    sunset: Annotated[bool | None, Field(description=SUNSET)] = None,
    relaxed_afternoon: Annotated[bool | None, Field(description=RELAXED_AFTERNOON)] = None,
    session_id: Annotated[str | None, Field(description=SESSION_ID)] = None,
    revision_request: Annotated[str | None, Field(description=REVISION_REQUEST)] = None,
    message: Annotated[str | None, Field(description=MESSAGE)] = None,
    days: Annotated[int | None, Field(description=DAYS, json_schema_extra={"minimum": 1, "maximum": 14})] = None,
    group_size: Annotated[int | None, Field(description=GROUP_SIZE)] = None,
    fitness_level: Annotated[str | None, Field(description=FITNESS_LEVEL)] = None,
    has_kids: Annotated[bool | None, Field(description=HAS_KIDS)] = None,
    accommodation: Annotated[str | None, Field(description=ACCOMMODATION)] = None,
    ctx: Context | None = None,
) -> CallToolResult:
    _start = time.monotonic()
    _success = True
    _error_msg: str | None = None
    _mcp_client = _detect_mcp_client(ctx)
    _park_codes: list[str] = []

    try:
        if (limited := await _check_rate_limit("plan_trip")):
            return limited

        try:
            payload = PlanTripInput(
                park_code=park_code,
                park_name=park_name,
                start_date=start_date,
                travel_month=travel_month,
                number_of_days=number_of_days,
                adults=adults,
                children=children,
                interests=interests,
                max_hike_miles=max_hike_miles,
                difficulty=difficulty,
                lodging_area=lodging_area,
                sunrise=sunrise,
                sunset=sunset,
                relaxed_afternoon=relaxed_afternoon,
                session_id=session_id,
                revision_request=revision_request,
                message=message,
                days=days,
                group_size=group_size,
                fitness_level=fitness_level,
                has_kids=has_kids,
                accommodation=accommodation,
            )
        except ValidationError as exc:
            logger.warning("Validation failed: %s", exc)
            return validation_error_result(validation_error_from_pydantic(exc))

        if business_err := validate_plan_trip_business_rules(payload):
            return validation_error_result(business_err)

        user_message = build_plan_trip_message(payload)

        resolved_park_code = None
        park_lookup = payload.park_code or payload.park_name
        if park_lookup:
            candidate = await _resolve_park_code(park_lookup)
            if re.fullmatch(r"[a-z0-9]{2,10}", candidate):
                resolved_park_code = candidate
                _park_codes = [resolved_park_code]
            elif payload.park_code:
                return validation_error_result(
                    validation_error(
                        code="UNKNOWN_PARK",
                        message=f"Could not resolve park_code '{payload.park_code}' to a known NPS code.",
                        field="park_code",
                        received=payload.park_code,
                        expected="known NPS park code",
                    )
                )

        conv = None
        if payload.session_id:
            conv = conversation_store.get(payload.session_id)
            if not conv:
                return validation_error_result(
                    validation_error(
                        code="SESSION_EXPIRED",
                        message=(
                            "session_id expired or unknown. Start a new itinerary without "
                            "session_id, then pass the returned sessionId for revisions."
                        ),
                        field="session_id",
                        received=payload.session_id,
                    )
                )
        if not conv:
            conv = conversation_store.create()

        conv.append_message("user", user_message)
        form_data = build_plan_trip_form_data(payload)

        try:
            async with TrailVerseClient() as client:
                resp = await client.plan_trip_anonymous(
                    message=user_message,
                    park_code=resolved_park_code,
                    form_data=form_data or None,
                    messages=conv.messages,
                    anonymous_id=conv.anonymous_id,
                    time_zone=_client_time_zone(ctx),
                )
        except TrailVerseAPIError as e:
            logger.exception("plan_trip backend call failed")
            err_text = str(e)
            if "timed out" in err_text.lower():
                partial = {
                    "parkCode": resolved_park_code,
                    "numberOfDays": payload.number_of_days,
                    "message": user_message,
                }
                return timeout_error_result(
                    PLAN_TRIP_TIMEOUT,
                    partial=partial,
                )
            return _error_result(err_text)

        if resp.get("success") is False:
            err = resp.get("error") or {}
            if not isinstance(err, dict):
                err = {"message": str(err), "code": resp.get("code", "PLANNER_ERROR")}
            return validation_error_result(
                validation_error(
                    code=err.get("code", "PLANNER_ERROR"),
                    message=err.get("message", "Itinerary planning failed"),
                    field=err.get("field"),
                )
            )

        resp_data = resp.get("data", resp)
        if isinstance(resp_data, dict) and resp_data.get("success") is False:
            err = resp_data.get("error") or {}
            if not isinstance(err, dict):
                err = {"message": str(err), "code": resp_data.get("code", "PLANNER_ERROR")}
            return validation_error_result(
                validation_error(
                    code=err.get("code", "PLANNER_ERROR"),
                    message=err.get("message", "Itinerary planning failed"),
                    field=err.get("field"),
                )
            )
        if isinstance(resp_data, dict):
            backend_session = resp_data.get("anonymousId")
            if isinstance(backend_session, str) and backend_session:
                # The backend may replace a legacy MCP ID with its bounded
                # bearer ID. Keep that authority for the next planning turn.
                conv.anonymous_id = backend_session
            assistant_content = resp_data.get("content", "")
        if assistant_content:
            conv.append_message("assistant", assistant_content)

        park_name_hint = ""
        if resolved_park_code:
            park_name_hint = await _park_display_name(resolved_park_code)

        structured, text = format_plan_trip(
            resp,
            user_message=user_message,
            park_code_hint=resolved_park_code or "",
            park_name_hint=park_name_hint,
        )

        if not structured.get("park", {}).get("name"):
            code_for_name = (
                structured.get("park", {}).get("code")
                or resolved_park_code
                or ""
            )
            if code_for_name:
                display = await _park_display_name(code_for_name)
                if display:
                    structured.setdefault("park", {})["name"] = display

        structured["sessionId"] = conv.session_id
        structured["session_id"] = conv.session_id
        planner_mode = None
        if isinstance(resp_data, dict):
            planner_mode = resp_data.get("plannerMode") or resp_data.get("planner_mode")
        if planner_mode:
            structured["plannerMode"] = planner_mode
            structured["planner_mode"] = planner_mode

        park_images = structured.get("parkImages") or []
        image_md = _markdown_images(
            [
                {
                    "url": (img.get("url") if isinstance(img, dict) else img),
                    "altText": (img.get("altText") if isinstance(img, dict) else None),
                }
                for img in park_images
            ],
            limit=3,
        )
        text_with_session = (
            text
            + f"\n\n[session_id: {conv.session_id}] — pass this as session_id on follow-up "
            "plan_trip calls to continue the conversation."
        )
        full_text = (image_md + "\n\n" + text_with_session) if image_md else text_with_session
        content_blocks = _text_content(full_text)

        meta = _tool_meta(
            invoking="Planning your trip with live park data…",
            invoked="Trip update not saved" if structured.get("status") == "save_failed" else "Itinerary ready",
        )
        return _tool_result(structured, content_blocks, meta, machine_readable=True)
    except Exception as exc:
        _success = False
        _error_msg = str(exc)
        raise
    finally:
        _send_analytics({
            "eventType": "mcp_tool_call",
            "eventCategory": "technical",
            "metadata": {
                "source": "mcp",
                "toolName": "plan_trip",
                "parkCodes": _park_codes,
                "executionTimeMs": round((time.monotonic() - _start) * 1000),
                "success": _success,
                "mcpClient": _mcp_client,
                "errorMessage": _error_msg,
            },
            "parkCode": _park_codes[0] if _park_codes else None,
            "sessionId": f"mcp-{_mcp_client}",
        })


@mcp.tool(
    name="get_park_details",
    title="Get NPS site details",
    description=GET_PARK_DETAILS_DESCRIPTION,
    annotations={
        "title": "Get NPS site details",
        "readOnlyHint": True,
        "openWorldHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
    },
    meta=_tool_meta(invoking="Looking up park details…", invoked="Park details ready", widget="park-details"),
)
async def get_park_details(
    park_code: Annotated[str, Field(description=GET_PARK_DETAILS_PARK_CODE, json_schema_extra={"minLength": 2, "maxLength": 100})],
    ctx: Context | None = None,
) -> CallToolResult:
    _start = time.monotonic()
    _success = True
    _error_msg: str | None = None
    _mcp_client = _detect_mcp_client(ctx)
    _park_codes: list[str] = []

    try:
        if (limited := await _check_rate_limit("read")):
            return limited

        resolution = await _resolve_park(park_code)
        if not resolution.ok:
            return _resolution_error(resolution, "park_code")
        code = resolution.code
        _park_codes = [code]
        try:
            async with TrailVerseClient() as client:
                # Fan out all calls in parallel; tolerate alerts/weather/feed failures
                # so a flaky sub-API never breaks the core park detail render.
                async def _safe_alerts() -> dict[str, Any] | None:
                    try:
                        return await client.get_park_alerts(code)
                    except TrailVerseAPIError:
                        return None

                async def _safe_weather() -> dict[str, Any] | None:
                    try:
                        return await client.get_park_weather(code)
                    except TrailVerseAPIError:
                        return None

                async def _safe_campgrounds() -> dict[str, Any] | None:
                    try:
                        return await client.get_park_campgrounds(code)
                    except TrailVerseAPIError:
                        return None

                async def _safe_permits() -> dict[str, Any] | None:
                    try:
                        return await client.get_park_permits(code)
                    except TrailVerseAPIError:
                        return None

                async def _safe_feed() -> dict[str, Any] | None:
                    try:
                        return await client.get_park_of_day(code)
                    except TrailVerseAPIError:
                        return None

                details, alerts, weather, campgrounds, permits, park_of_day = await asyncio.gather(
                    client.get_park_details(code),
                    _safe_alerts(),
                    _safe_weather(),
                    _safe_campgrounds(),
                    _safe_permits(),
                    _safe_feed(),
                )
        except TrailVerseAPIError as e:
            if getattr(e, "status", None) in (400, 404):
                return _unknown_code_error(code, "park_code")
            logger.exception("get_park_details backend call failed")
            return _error_result(str(e))

        structured, text = format_park_details(details, alerts, weather, campgrounds, permits, park_of_day)

        content_blocks = _text_content(text)

        meta = _tool_meta(
            invoking=f"Looking up {code.upper()} on the National Park Service…",
            invoked="Park details ready",
        )
        return _tool_result(structured, content_blocks, meta)
    except Exception as exc:
        _success = False
        _error_msg = str(exc)
        raise
    finally:
        _send_analytics({
            "eventType": "mcp_tool_call",
            "eventCategory": "technical",
            "metadata": {
                "source": "mcp",
                "toolName": "get_park_details",
                "parkCodes": _park_codes,
                "executionTimeMs": round((time.monotonic() - _start) * 1000),
                "success": _success,
                "mcpClient": _mcp_client,
                "errorMessage": _error_msg,
            },
            "parkCode": _park_codes[0] if _park_codes else None,
            "sessionId": f"mcp-{_mcp_client}",
        })


def _compare_park_codes(resp: dict[str, Any]) -> list[str]:
    data = resp.get("data") or resp.get("parks") or []
    if isinstance(data, dict):
        data = data.get("parks") or []
    out = []
    for p in data if isinstance(data, list) else []:
        code = (p.get("parkCode") or p.get("code") or "").lower() if isinstance(p, dict) else ""
        if code:
            out.append(code)
    return out


def _compare_needs_two(unresolved: list[dict[str, Any]], matched: list[str]) -> CallToolResult:
    details = "; ".join(f"'{u['input']}' — {u['reason']}" for u in unresolved)
    matched_text = f" Matched: {', '.join(matched)}." if matched else ""
    error = validation_error(
        code="COMPARE_NEEDS_TWO_PARKS",
        message=(
            f"Need at least 2 recognized NPS sites to compare; only {len(matched)} matched."
            f"{matched_text} Not matched: {details}. No comparison was produced — ask the "
            "user which park they meant, or use search_parks to find the correct site."
        ),
        field="park_codes",
        received=[u["input"] for u in unresolved],
        expected="2–4 NPS park codes or unambiguous NPS site names",
    )
    error["unresolved"] = unresolved
    error["matched"] = matched
    return validation_error_result(error)


@mcp.tool(
    name="compare_parks",
    title="Compare NPS sites",
    description=COMPARE_PARKS_DESCRIPTION,
    annotations={
        "title": "Compare NPS sites",
        "readOnlyHint": True,
        "openWorldHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
    },
    meta=_tool_meta(invoking="Comparing parks…", invoked="Comparison ready"),
)
async def compare_parks(
    park_codes: Annotated[
        list[str],
        Field(description=COMPARE_PARK_CODES, json_schema_extra={"minItems": 2, "maxItems": 4}),
    ],
    ctx: Context | None = None,
) -> CallToolResult:
    _start = time.monotonic()
    _success = True
    _error_msg: str | None = None
    _mcp_client = _detect_mcp_client(ctx)
    _park_codes: list[str] = []

    try:
        if (limited := await _check_rate_limit("read")):
            return limited

        try:
            CompareParksInput(park_codes=park_codes)
        except ValidationError:
            return validation_error_result(
                validation_error(
                    code="INVALID_PARK_COUNT",
                    message=(
                        f"compare_parks needs 2 to 4 parks; received {len(park_codes or [])}. "
                        "For a single park use get_park_details."
                    ),
                    field="park_codes",
                    received=park_codes,
                    expected="list of 2–4 park codes or names",
                )
            )

        resolutions = await asyncio.gather(*(_resolve_park(c) for c in park_codes))
        codes: list[str] = []
        code_inputs: dict[str, str] = {}
        unresolved: list[dict[str, Any]] = []
        for res in resolutions:
            if res.ok:
                if res.code not in codes:
                    codes.append(res.code)
                    code_inputs[res.code] = res.input
            else:
                unresolved.append({
                    "input": res.input,
                    "status": res.status,
                    "reason": res.explain(),
                    "candidates": res.candidates[:5],
                })
        _park_codes = codes

        if len(codes) < 2:
            return _compare_needs_two(unresolved, codes)

        try:
            async with TrailVerseClient() as client:
                try:
                    compare = await client.compare_parks(codes)
                except TrailVerseAPIError as e:
                    if getattr(e, "status", None) != 404:
                        raise
                    compare = {"data": {"parks": []}}
                found = _compare_park_codes(compare)
                missing = [c for c in codes if c not in found]
                for c in missing:
                    unresolved.append({
                        "input": code_inputs.get(c, c),
                        "status": "unknown_code",
                        "reason": f"no NPS site uses the code '{c}'",
                        "candidates": [],
                    })
                if missing:
                    codes = [c for c in codes if c in found]
                    _park_codes = codes
                    if len(codes) < 2:
                        return _compare_needs_two(unresolved, codes)
                    # Re-request with only valid codes so per-park fields
                    # (e.g. review stats) stay aligned with the right park.
                    compare = await client.compare_parks(codes)
                try:
                    summary = await client.compare_summary(codes)
                except TrailVerseAPIError:
                    summary = None
        except TrailVerseAPIError as e:
            logger.exception("compare_parks backend call failed")
            return _error_result(str(e))

        structured, text = format_compare(compare, summary, unresolved=unresolved)

        parks_data = structured.get("parks", [])
        compare_images = [
            {"url": p.get("heroImage"), "altText": p.get("name", "Park photo")}
            for p in parks_data
            if p.get("heroImage")
        ]
        image_md = _markdown_images(compare_images, limit=4)
        full_text = (image_md + "\n\n" + text) if image_md else text
        content_blocks = _text_content(full_text)

        meta = _tool_meta(
            invoking=f"Comparing {len(codes)} parks…",
            invoked="Comparison ready",
        )
        return _tool_result(structured, content_blocks, meta)
    except Exception as exc:
        _success = False
        _error_msg = str(exc)
        raise
    finally:
        _send_analytics({
            "eventType": "mcp_tool_call",
            "eventCategory": "technical",
            "metadata": {
                "source": "mcp",
                "toolName": "compare_parks",
                "parkCodes": _park_codes,
                "executionTimeMs": round((time.monotonic() - _start) * 1000),
                "success": _success,
                "mcpClient": _mcp_client,
                "errorMessage": _error_msg,
            },
            "parkCode": _park_codes[0] if _park_codes else None,
            "sessionId": f"mcp-{_mcp_client}",
        })


# Fields format_search needs; used for filter-only searches that pull the whole
# state/activity set so it can be ranked before truncation.
_SEARCH_FIELDS = (
    "parkCode,fullName,name,designation,states,description,latitude,longitude,"
    "images,matchReason,matchedTraits,rating"
)


@mcp.tool(
    name="search_parks",
    title="Search NPS sites",
    description=SEARCH_PARKS_DESCRIPTION,
    annotations={
        "title": "Search NPS sites",
        "readOnlyHint": True,
        "openWorldHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
    },
    meta=_tool_meta(invoking="Searching NPS sites…", invoked="Results ready", widget="park-list"),
)
async def search_parks(
    query: Annotated[str | None, Field(description=SEARCH_QUERY, json_schema_extra={"maxLength": 100})] = None,
    state: Annotated[str | None, Field(description=STATE_FILTER, json_schema_extra={"maxLength": 30})] = None,
    activity: Annotated[str | None, Field(description=ACTIVITY_FILTER, json_schema_extra={"maxLength": 40})] = None,
    limit: Annotated[int, Field(description=SEARCH_LIMIT, json_schema_extra={"minimum": 1, "maximum": 50})] = 20,
    ctx: Context | None = None,
) -> CallToolResult:
    _start = time.monotonic()
    _success = True
    _error_msg: str | None = None
    _mcp_client = _detect_mcp_client(ctx)

    try:
        if (limited := await _check_rate_limit("read")):
            return limited
        state_code, state_ok = normalize_state(state)
        if not state_ok:
            return _state_error(str(state))
        try:
            payload = SearchParksInput(
                query=query.strip() if isinstance(query, str) and query.strip() else None,
                state=state_code,
                activity=activity.strip() if isinstance(activity, str) and activity.strip() else None,
                limit=limit,
            )
        except ValidationError as e:
            logger.warning("Validation failed: %s", e)
            return validation_error_result(validation_error_from_pydantic(e))

        if not any([payload.query, payload.state, payload.activity]):
            return validation_error_result(
                validation_error(
                    code="MISSING_SEARCH_CRITERIA",
                    message="Provide at least one of: query, state, or activity.",
                    field="query",
                )
            )

        try:
            async with TrailVerseClient() as client:
                raw_query = payload.query
                expanded_query: str | None = None
                expanded_count = 0
                used_expanded = False

                if raw_query:
                    resp = await client.search_parks(
                        q=raw_query,
                        state=payload.state,
                        activity=payload.activity,
                        limit=payload.limit,
                    )
                else:
                    # Filter-only: fetch the whole filtered set (catalog order is
                    # alphabetical) and rank it before applying the limit.
                    resp = await client.search_parks(
                        state=payload.state,
                        activity=payload.activity,
                        limit=500,
                        fields=_SEARCH_FIELDS,
                    )
                    resp = rank_catalog_results(resp, payload.limit)
                raw_count = count_search_results(resp)

                if raw_query:
                    expanded_query = expand_search_query(raw_query)
                    # Only retry when expansion added intent synonyms. Re-ordering
                    # the user's own words ("Paris France" → "france paris") is
                    # not a better query and produced false matches.
                    raw_tokens = set(re.findall(r"[a-z0-9]+", raw_query.lower()))
                    added = set((expanded_query or "").split()) - raw_tokens
                    if raw_count < 3 and expanded_query and added:
                        retry = await client.search_parks(
                            q=expanded_query,
                            state=payload.state,
                            activity=payload.activity,
                            limit=payload.limit,
                        )
                        expanded_count = count_search_results(retry)
                        if expanded_count > raw_count:
                            resp = retry
                            used_expanded = True

                    logger.info(
                        "search_parks query expansion | expanded=%s raw_count=%s "
                        "expanded_count=%s used_expanded=%s",
                        bool(added) if raw_query else False,
                        raw_count,
                        expanded_count,
                        used_expanded,
                    )
        except TrailVerseAPIError as e:
            logger.exception("search_parks backend call failed")
            return _error_result(str(e))

        resp = rerank_search_results(resp, raw_query)

        structured, text = format_search(resp, query=raw_query or query)

        parks_data = structured.get("parks", [])
        search_images = [
            {"url": p.get("heroImage"), "altText": p.get("name", "Park photo")}
            for p in parks_data[:3]
            if p.get("heroImage")
        ]
        image_md = _markdown_images(search_images, limit=3)
        full_text = (image_md + "\n\n" + text) if image_md else text
        content_blocks = _text_content(full_text)

        meta = _tool_meta(
            invoking="Searching NPS sites…",
            invoked="Results ready",
        )
        return _tool_result(structured, content_blocks, meta)
    except Exception as exc:
        _success = False
        _error_msg = str(exc)
        raise
    finally:
        _send_analytics({
            "eventType": "mcp_tool_call",
            "eventCategory": "technical",
            "metadata": {
                "source": "mcp",
                "toolName": "search_parks",
                "parkCodes": [],
                "executionTimeMs": round((time.monotonic() - _start) * 1000),
                "success": _success,
                "mcpClient": _mcp_client,
                "errorMessage": _error_msg,
            },
            "parkCode": None,
            "sessionId": f"mcp-{_mcp_client}",
        })


@mcp.tool(
    name="find_events",
    title="Find NPS events",
    description=FIND_EVENTS_DESCRIPTION,
    annotations={
        "title": "Find NPS events",
        "readOnlyHint": True,
        "openWorldHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
    },
    meta=_tool_meta(invoking="Fetching park events…", invoked="Events ready"),
)
async def find_events(
    park_code: Annotated[str | None, Field(description=EVENTS_PARK_CODE, json_schema_extra={"maxLength": 100})] = None,
    state: Annotated[str | None, Field(description=STATE_FILTER, json_schema_extra={"maxLength": 30})] = None,
    category: Annotated[str | None, Field(description=EVENTS_CATEGORY, json_schema_extra={"maxLength": 60})] = None,
    limit: Annotated[int, Field(description=EVENTS_LIMIT, json_schema_extra={"minimum": 1, "maximum": 20})] = 10,
    ctx: Context | None = None,
) -> CallToolResult:
    _start = time.monotonic()
    _success = True
    _error_msg: str | None = None
    _mcp_client = _detect_mcp_client(ctx)
    _park_codes: list[str] = []

    try:
        if (limited := await _check_rate_limit("read")):
            return limited

        state_code, state_ok = normalize_state(state)
        if not state_ok:
            return _state_error(str(state))
        try:
            FindEventsInput(park_code=park_code, state=state_code, category=category, limit=limit)
        except ValidationError as e:
            return validation_error_result(validation_error_from_pydantic(e))

        resolved_code: str | None = None
        resolution: ParkResolution | None = None
        if park_code and park_code.strip():
            resolution = await _resolve_park(park_code)
            if not resolution.ok:
                return _resolution_error(resolution, "park_code")
            resolved_code = resolution.code
            _park_codes = [resolved_code]

        park_label = resolution.name if resolution and resolution.name else None
        try:
            async with TrailVerseClient() as client:
                resp = await client.list_events(
                    park_code=resolved_code,
                    state=state_code,
                    category=category,
                    limit=limit,
                )
                if resolved_code and not _events_list(resp):
                    # An empty feed for an unverified code may mean the code is
                    # wrong; confirm the park exists before saying "no events".
                    try:
                        details = await client.get_park_details(resolved_code)
                        outer = details.get("data") or details
                        park = outer.get("park") or outer
                        park_label = park_label or park.get("fullName") or park.get("name")
                    except TrailVerseAPIError as e:
                        if getattr(e, "status", None) in (400, 404):
                            return _unknown_code_error(resolved_code, "park_code")
        except TrailVerseAPIError as e:
            logger.exception("find_events backend call failed")
            return _error_result(str(e))

        structured, text = format_events(resp, park_name=park_label)

        content_blocks = _text_content(text)

        meta = _tool_meta(
            invoking="Fetching park events…",
            invoked="Events ready",
        )
        return _tool_result(structured, content_blocks, meta)
    except Exception as exc:
        _success = False
        _error_msg = str(exc)
        raise
    finally:
        _send_analytics({
            "eventType": "mcp_tool_call",
            "eventCategory": "technical",
            "metadata": {
                "source": "mcp",
                "toolName": "find_events",
                "parkCodes": _park_codes,
                "executionTimeMs": round((time.monotonic() - _start) * 1000),
                "success": _success,
                "mcpClient": _mcp_client,
                "errorMessage": _error_msg,
            },
            "parkCode": _park_codes[0] if _park_codes else None,
            "sessionId": f"mcp-{_mcp_client}",
        })


def _events_list(resp: dict[str, Any]) -> list[Any]:
    events = resp.get("data") or resp.get("events") or [] if isinstance(resp, dict) else []
    if isinstance(events, dict):
        events = events.get("events") or []
    return events if isinstance(events, list) else []


# ---------- Health / root routes (so Render and connector wizards don't 502) ----------

@mcp.custom_route("/", methods=["GET"])
async def root(_request: Request) -> HTMLResponse:
    return HTMLResponse(
        "<!doctype html><html><head>"
        "<title>TrailVerse MCP</title>"
        f'<link rel="icon" href="{_BASE_URL}/icon-512.png" type="image/png" sizes="512x512">'
        f'<link rel="icon" href="{_BASE_URL}/icon.svg" type="image/svg+xml">'
        f'<link rel="apple-touch-icon" href="{_BASE_URL}/icon-512.png">'
        "</head><body>"
        "<p>TrailVerse MCP server is running. MCP endpoint: /mcp</p>"
        "</body></html>"
    )


@mcp.custom_route("/health", methods=["GET"])
async def health(_request: Request) -> JSONResponse:
    return JSONResponse({"status": "ok", "service": "trailverse-mcp"})


@mcp.custom_route("/icon.svg", methods=["GET"])
async def icon_svg(_request: Request) -> FileResponse:
    return FileResponse(STATIC_DIR / "icon.svg", media_type="image/svg+xml")


@mcp.custom_route("/icon-512.png", methods=["GET"])
async def icon_png(_request: Request) -> FileResponse:
    return FileResponse(STATIC_DIR / "icon-512.png", media_type="image/png")


@mcp.custom_route("/favicon.ico", methods=["GET"])
async def favicon(_request: Request) -> FileResponse:
    return FileResponse(STATIC_DIR / "icon-512.png", media_type="image/png")


@mcp.custom_route("/.well-known/openai-apps-challenge", methods=["GET"])
async def openai_verification(_request: Request) -> PlainTextResponse:
    return PlainTextResponse(os.getenv("OPENAI_VERIFICATION_TOKEN", ""))


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
