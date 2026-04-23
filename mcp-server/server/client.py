"""
Async HTTP client for the TrailVerse Express backend.

All methods call public (unauthenticated) endpoints except plan_trip,
which uses /api/ai/chat-anonymous (rate-limited but no auth needed).
"""
from __future__ import annotations

import json
import logging
import os
import re
import urllib.parse
from typing import Any

import httpx

logger = logging.getLogger(__name__)

API_BASE = os.getenv("TRAILVERSE_API_BASE", "https://trailverse.onrender.com").rstrip("/")
TIMEOUT = float(os.getenv("BACKEND_TIMEOUT", "120"))
USER_AGENT = os.getenv("BACKEND_USER_AGENT", "TrailVerse-MCP/1.0")
MCP_BYPASS_KEY = os.getenv("MCP_BYPASS_KEY", "")


class TrailVerseAPIError(Exception):
    """Raised when the TrailVerse backend returns an error or is unreachable."""


class TrailVerseClient:
    """Thin async wrapper around the TrailVerse public API."""

    def __init__(self, base_url: str = API_BASE, timeout: float = TIMEOUT) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "TrailVerseClient":
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
        # Shared-secret bypass for the anonymous rate limit. Since every
        # ChatGPT user's request flows through a single MCP server IP, the
        # default 60 req/15min anonymous limit would self-DOS at any scale.
        # The key lives only on two servers we control (this one + Express).
        if MCP_BYPASS_KEY:
            headers["X-TrailVerse-MCP-Key"] = MCP_BYPASS_KEY
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=self.timeout,
            headers=headers,
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
        )
        return self

    async def __aexit__(self, *_exc: Any) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @staticmethod
    def _validate_park_code(park_code: str) -> str:
        """Validate and sanitize a park code to prevent path traversal."""
        if not park_code or not park_code.isalnum() or len(park_code) > 10:
            raise TrailVerseAPIError(f"Invalid park code: must be 2-10 alphanumeric characters")
        return urllib.parse.quote(park_code, safe='')

    async def _get(self, path: str, **params: Any) -> dict[str, Any]:
        assert self._client is not None, "Use 'async with TrailVerseClient()'"
        clean = {k: v for k, v in params.items() if v is not None}
        try:
            resp = await self._client.get(path, params=clean)
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            logger.error("GET %s returned %s: %s", path, e.response.status_code, e.response.text[:200])
            if e.response.status_code >= 500:
                raise TrailVerseAPIError("Backend service temporarily unavailable") from e
            elif e.response.status_code == 429:
                raise TrailVerseAPIError("Rate limit exceeded, please try again later") from e
            else:
                raise TrailVerseAPIError(f"Request failed (status {e.response.status_code})") from e
        except httpx.HTTPError as e:
            logger.error("GET %s failed: %s", path, e)
            raise TrailVerseAPIError("Backend service unreachable") from e
        return resp.json()

    async def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        assert self._client is not None, "Use 'async with TrailVerseClient()'"
        try:
            resp = await self._client.post(path, json=body)
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            logger.error("POST %s returned %s: %s", path, e.response.status_code, e.response.text[:200])
            if e.response.status_code >= 500:
                raise TrailVerseAPIError("Backend service temporarily unavailable") from e
            elif e.response.status_code == 429:
                raise TrailVerseAPIError("Rate limit exceeded, please try again later") from e
            else:
                raise TrailVerseAPIError(f"Request failed (status {e.response.status_code})") from e
        except httpx.HTTPError as e:
            logger.error("POST %s failed: %s", path, e)
            raise TrailVerseAPIError("Backend service unreachable") from e
        return resp.json()

    # ---------- Parks ----------

    async def search_parks(
        self,
        q: str | None = None,
        state: str | None = None,
        activity: str | None = None,
        limit: int = 12,
    ) -> dict[str, Any]:
        return await self._get(
            "/api/parks/search",
            q=q,
            state=state,
            activity=activity,
            limit=limit,
        )

    async def get_park_details(self, park_code: str) -> dict[str, Any]:
        safe_code = self._validate_park_code(park_code)
        return await self._get(f"/api/parks/{safe_code}/details")

    async def get_park_alerts(self, park_code: str) -> dict[str, Any]:
        safe_code = self._validate_park_code(park_code)
        return await self._get(f"/api/parks/{safe_code}/alerts")

    async def get_park_weather(self, park_code: str) -> dict[str, Any]:
        safe_code = self._validate_park_code(park_code)
        return await self._get(f"/api/parks/{safe_code}/weather")

    async def get_park_of_day(self, park_code: str | None = None) -> dict[str, Any]:
        """
        Fetch the Daily Nature Feed's park-of-day editorial content.
        Optionally filter to a specific park; otherwise returns today's featured.
        Safe to call speculatively — failures are non-fatal.
        """
        params: dict[str, Any] = {}
        if park_code:
            params["parkCode"] = self._validate_park_code(park_code)
        return await self._get("/api/feed/park-of-day", **params)

    async def compare_parks(self, park_codes: list[str]) -> dict[str, Any]:
        validated = [self._validate_park_code(c) for c in park_codes]
        return await self._post(
            "/api/parks/compare",
            {"parkCodes": validated},
        )

    async def compare_summary(self, park_codes: list[str]) -> dict[str, Any]:
        validated = [self._validate_park_code(c) for c in park_codes]
        return await self._post(
            "/api/parks/compare/summary",
            {"parkCodes": validated},
        )

    # ---------- Events ----------

    async def list_events(
        self,
        park_code: str | None = None,
        state: str | None = None,
        category: str | None = None,
        limit: int = 10,
    ) -> dict[str, Any]:
        safe_code = self._validate_park_code(park_code) if park_code else None
        return await self._get(
            "/api/events/",
            parkCode=safe_code,
            state=state,
            category=category,
            limit=limit,
        )

    # ---------- AI Planner (anonymous) ----------

    async def plan_trip_anonymous(
        self,
        message: str,
        park_code: str | None = None,
        persona: str = "planner",
        form_data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Call the anonymous AI planner. Limited to 5 messages per 48h per IP.

        persona: "planner" (GPT-4.1, structured) or "local" (Claude, casual).
        form_data: optional structured constraints (dates, groupSize, budget, etc.).
        """
        provider = "openai" if persona == "planner" else "claude"
        metadata: dict[str, Any] = {}
        if park_code:
            metadata["parkCode"] = self._validate_park_code(park_code)
        if form_data:
            metadata["formData"] = form_data
        body: dict[str, Any] = {
            "messages": [{"role": "user", "content": message}],
            "provider": provider,
            "metadata": metadata,
        }
        return await self._post("/api/ai/chat-anonymous", body)


# ---------- Helpers for parsing the AI response ----------

ITINERARY_RE = re.compile(
    r"\[ITINERARY_JSON\](.*?)\[/ITINERARY_JSON\]",
    re.DOTALL,
)


def extract_itinerary(content: str) -> dict[str, Any] | None:
    """
    Pull the [ITINERARY_JSON]...[/ITINERARY_JSON] block out of the AI content.

    The backend strips this block before returning, so we only hit it if an
    unstripped response leaks through. Returns None if no itinerary is found.
    """
    if not content:
        return None
    match = ITINERARY_RE.search(content)
    if not match:
        return None
    try:
        return json.loads(match.group(1).strip())
    except json.JSONDecodeError:
        logger.warning("Failed to parse itinerary JSON block")
        return None


def strip_itinerary_block(content: str) -> str:
    """Remove the itinerary JSON block from content for clean text display."""
    if not content:
        return ""
    return ITINERARY_RE.sub("", content).strip()
