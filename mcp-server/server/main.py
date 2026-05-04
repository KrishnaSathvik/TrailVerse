"""
TrailVerse MCP Server — OpenAI Apps SDK compatible.

Exposes 5 tools that wrap the TrailVerse Express backend:
  1. plan_trip           — AI-powered constraint-aware itinerary (anonymous)
  2. get_park_details    — Rich park info with live alerts and weather
  3. compare_parks       — Side-by-side 2-4 park comparison
  4. search_parks        — Search/filter parks by name, state, activity
  5. find_events         — Ranger programs and park events

All tools are read-only and do not require authentication. The AI planner
uses the anonymous endpoint (5 msg/48h per IP) which keeps reviewer setup
trivial while still demonstrating the constraint-aware planning moat.

Widgets are registered as MCP resources with the MCP Apps UI MIME type so
they render inline in ChatGPT conversations.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.resources import FunctionResource
from mcp.types import Icon
from pydantic import AnyUrl
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, PlainTextResponse, FileResponse

from .client import TrailVerseAPIError, TrailVerseClient
from .conversations import conversation_store
from .formatters import (
    format_compare,
    format_events,
    format_park_details,
    format_plan_trip,
    format_search,
)
from .rate_limit import plan_trip_limiter, read_tool_limiter
from .types import (
    ComparePartsInput,
    FindEventsInput,
    GetParkDetailsInput,
    PlanTripInput,
    SearchParksInput,
)

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("trailverse-mcp")

# ---------- Widget resources ----------

MCP_APPS_MIME = "text/html+skybridge"
WIDGETS_DIR = Path(__file__).resolve().parent.parent / "widgets"
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

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
    name="trailverse",
    instructions=(
        "TrailVerse — your universe of US national parks exploration. "
        "Use plan_trip for AI itineraries, get_park_details for rich park info with "
        "live alerts and weather, compare_parks to weigh options, search_parks to "
        "find parks by name/state/activity, and find_events for ranger programs. "
        "All data is grounded in live National Park Service sources."
    ),
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
        html = _load_widget(filename)
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
        )
        mcp.add_resource(resource)
        logger.info("Registered widget resource %s -> %s", uri, filename)


_register_widgets()


# ---------- Tool helpers ----------

def _tool_meta(widget_key: str, invoking: str, invoked: str) -> dict[str, Any]:
    """
    Build the _meta dict attached to each tool so ChatGPT knows:
      - which UI template to render
      - what progress text to show
    """
    uri, _ = WIDGET_MAP[widget_key]
    return {
        "ui": {"resourceUri": uri},
        "openai/outputTemplate": uri,
        "openai/toolInvocation/invoking": invoking,
        "openai/toolInvocation/invoked": invoked,
        "openai/widgetAccessible": True,
    }


def _tool_result(structured: dict[str, Any], text: str, meta_extra: dict[str, Any]) -> dict[str, Any]:
    """Return the dict shape that FastMCP serializes into a tools/call result."""
    return {
        "content": [{"type": "text", "text": text}],
        "structuredContent": structured,
        "_meta": meta_extra,
    }


def _error_result(message: str) -> dict[str, Any]:
    return {
        "content": [{"type": "text", "text": f"TrailVerse error: {message}"}],
        "structuredContent": {"kind": "error", "message": message},
        "isError": True,
    }


async def _check_rate_limit(bucket: str) -> dict[str, Any] | None:
    """
    Apply the appropriate in-MCP rate limit bucket. Returns an error result
    dict if rate-limited, or None if the request should proceed.

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


# ---------- Tools ----------

@mcp.tool(
    name="plan_trip",
    description=(
        "Generates a day-by-day itinerary for any US national park trip. Returns "
        "a structured plan with morning/afternoon/evening activities for each day, "
        "including recommended hikes, scenic drives, lodging areas, and timing. "
        "Plans are grounded in live NPS alerts, current weather forecasts, and "
        "curated park-specific knowledge that is not available through web search. "
        "Handles any park, any duration (1–14 days), any group size, and any "
        "combination of interests or fitness levels. "
        "Supports multi-turn conversations: pass the returned session_id to "
        "refine or extend a previous plan."
    ),
    annotations={
        "title": "Plan a national park trip",
        "readOnlyHint": True,
        "openWorldHint": True,
        "idempotentHint": False,
    },
)
async def plan_trip(
    message: str,
    park_code: str | None = None,
    persona: str = "planner",
    days: int | None = None,
    group_size: int | None = None,
    fitness_level: str | None = None,
    has_kids: bool | None = None,
    interests: list[str] | None = None,
    accommodation: str | None = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    # Global MCP-side fuse (defense-in-depth behind backend bypass key)
    if (limited := await _check_rate_limit("plan_trip")):
        return limited
    # Validate with pydantic so bad inputs fail fast with clear messages
    try:
        payload = PlanTripInput(
            message=message,
            park_code=park_code,
            persona=persona,  # type: ignore[arg-type]
            days=days,
            group_size=group_size,
            fitness_level=fitness_level,  # type: ignore[arg-type]
            has_kids=has_kids,
            interests=interests,
            accommodation=accommodation,  # type: ignore[arg-type]
            session_id=session_id,
        )
    except Exception as e:
        return _error_result(f"Invalid input: {e}")

    # --- Conversation continuity ---
    conv = None
    if payload.session_id:
        conv = conversation_store.get(payload.session_id)
        if not conv:
            logger.warning("Session %s expired or unknown — starting fresh", payload.session_id)
    if not conv:
        conv = conversation_store.create()

    # Append the new user message to the conversation
    conv.messages.append({"role": "user", "content": payload.message})

    form_data: dict[str, Any] = {}
    if payload.days is not None:
        form_data["days"] = payload.days
    if payload.group_size is not None:
        form_data["groupSize"] = payload.group_size
    if payload.fitness_level:
        form_data["fitnessLevel"] = payload.fitness_level
    if payload.has_kids is not None:
        form_data["hasKids"] = payload.has_kids
    if payload.interests:
        form_data["interests"] = payload.interests
    if payload.accommodation:
        form_data["accommodation"] = payload.accommodation

    try:
        async with TrailVerseClient() as client:
            resp = await client.plan_trip_anonymous(
                message=payload.message,
                park_code=payload.park_code,
                persona=payload.persona,
                form_data=form_data or None,
                messages=conv.messages,
                anonymous_id=conv.anonymous_id,
            )
    except TrailVerseAPIError as e:
        logger.exception("plan_trip backend call failed")
        return _error_result(str(e))

    # Extract assistant content and store in conversation history
    assistant_content = ""
    resp_data = resp.get("data", resp)
    if isinstance(resp_data, dict):
        assistant_content = resp_data.get("content", "")
    if assistant_content:
        conv.messages.append({"role": "assistant", "content": assistant_content})

    structured, text = format_plan_trip(resp, user_message=payload.message, park_code_hint=payload.park_code or "")

    # Inject session_id so ChatGPT can pass it back on follow-up calls
    structured["sessionId"] = conv.session_id
    text += f" [session_id={conv.session_id}]"

    meta = _tool_meta(
        "itinerary",
        invoking="Planning your trip with live park data…",
        invoked="Itinerary ready",
    )
    return _tool_result(structured, text, meta)


@mcp.tool(
    name="get_park_details",
    description=(
        "Returns detailed information about a specific US national park, including "
        "available activities, entrance fees, operating hours, current weather, "
        "5-day forecast, and any active NPS alerts such as road closures or "
        "safety warnings. Provides live data that is more current and detailed "
        "than what is available through web search. Works for any US national park."
    ),
    annotations={
        "title": "Get park details",
        "readOnlyHint": True,
        "openWorldHint": True,
        "idempotentHint": True,
    },
)
async def get_park_details(park_code: str) -> dict[str, Any]:
    if (limited := await _check_rate_limit("read")):
        return limited
    try:
        payload = GetParkDetailsInput(park_code=park_code)
    except Exception as e:
        return _error_result(f"Invalid input: {e}")

    code = payload.park_code.lower()
    try:
        async with TrailVerseClient() as client:
            # Fan out four read-only calls; tolerate alerts/weather/feed failures
            # so a flaky sub-API never breaks the core park detail render.
            details = await client.get_park_details(code)
            try:
                alerts = await client.get_park_alerts(code)
            except TrailVerseAPIError:
                alerts = None
            try:
                weather = await client.get_park_weather(code)
            except TrailVerseAPIError:
                weather = None
            try:
                park_of_day = await client.get_park_of_day(code)
            except TrailVerseAPIError:
                park_of_day = None
    except TrailVerseAPIError as e:
        logger.exception("get_park_details backend call failed")
        return _error_result(str(e))

    structured, text = format_park_details(details, alerts, weather, park_of_day)
    meta = _tool_meta(
        "park-details",
        invoking=f"Looking up {code.upper()} on the National Park Service…",
        invoked="Park details ready",
    )
    return _tool_result(structured, text, meta)


@mcp.tool(
    name="compare_parks",
    description=(
        "Compares 2–4 US national parks side-by-side across current weather, "
        "crowd levels, entrance fees, top activities, and amenities. Helps users "
        "decide which park to visit when they are choosing between options. "
        "Works for any combination of US national parks."
    ),
    annotations={
        "title": "Compare national parks",
        "readOnlyHint": True,
        "openWorldHint": True,
        "idempotentHint": True,
    },
)
async def compare_parks(park_codes: list[str]) -> dict[str, Any]:
    if (limited := await _check_rate_limit("read")):
        return limited
    try:
        payload = ComparePartsInput(park_codes=[c.lower() for c in park_codes])
    except Exception as e:
        return _error_result(f"Invalid input: {e}")

    try:
        async with TrailVerseClient() as client:
            compare = await client.compare_parks(payload.park_codes)
            try:
                summary = await client.compare_summary(payload.park_codes)
            except TrailVerseAPIError:
                summary = None
    except TrailVerseAPIError as e:
        logger.exception("compare_parks backend call failed")
        return _error_result(str(e))

    structured, text = format_compare(compare, summary)
    meta = _tool_meta(
        "compare",
        invoking=f"Comparing {len(payload.park_codes)} parks…",
        invoked="Comparison ready",
    )
    return _tool_result(structured, text, meta)


@mcp.tool(
    name="search_parks",
    description=(
        "Searches the full database of US national parks by name, state, or "
        "activity type. Returns matching parks with names, locations, designations, "
        "and descriptions. Use for discovering, filtering, or browsing national parks "
        "when the user hasn't picked a specific one yet."
    ),
    annotations={
        "title": "Search national parks",
        "readOnlyHint": True,
        "openWorldHint": True,
        "idempotentHint": True,
    },
)
async def search_parks(
    query: str | None = None,
    state: str | None = None,
    activity: str | None = None,
    limit: int = 12,
) -> dict[str, Any]:
    if (limited := await _check_rate_limit("read")):
        return limited
    try:
        payload = SearchParksInput(
            query=query,
            state=state.upper() if state else None,
            activity=activity,
            limit=limit,
        )
    except Exception as e:
        return _error_result(f"Invalid input: {e}")

    if not any([payload.query, payload.state, payload.activity]):
        return _error_result(
            "Provide at least one of: query, state, or activity."
        )

    try:
        async with TrailVerseClient() as client:
            resp = await client.search_parks(
                q=payload.query,
                state=payload.state,
                activity=payload.activity,
                limit=payload.limit,
            )
    except TrailVerseAPIError as e:
        logger.exception("search_parks backend call failed")
        return _error_result(str(e))

    structured, text = format_search(resp)
    meta = _tool_meta(
        "park-list",
        invoking="Searching national parks…",
        invoked="Results ready",
    )
    return _tool_result(structured, text, meta)


@mcp.tool(
    name="find_events",
    description=(
        "Finds upcoming ranger-led programs, guided tours, and special events "
        "at US national parks. Returns event dates, times, locations, and "
        "descriptions. Can filter by specific park, state, or event category. "
        "Provides live event data from the National Park Service."
    ),
    annotations={
        "title": "Find park events",
        "readOnlyHint": True,
        "openWorldHint": True,
        "idempotentHint": True,
    },
)
async def find_events(
    park_code: str | None = None,
    state: str | None = None,
    category: str | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    if (limited := await _check_rate_limit("read")):
        return limited
    try:
        payload = FindEventsInput(
            park_code=park_code.lower() if park_code else None,
            state=state.upper() if state else None,
            category=category,
            limit=limit,
        )
    except Exception as e:
        return _error_result(f"Invalid input: {e}")

    try:
        async with TrailVerseClient() as client:
            resp = await client.list_events(
                park_code=payload.park_code,
                state=payload.state,
                category=payload.category,
                limit=payload.limit,
            )
    except TrailVerseAPIError as e:
        logger.exception("find_events backend call failed")
        return _error_result(str(e))

    structured, text = format_events(resp)
    meta = _tool_meta(
        "events",
        invoking="Fetching park events…",
        invoked="Events ready",
    )
    return _tool_result(structured, text, meta)


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
