"""
Async HTTP client for the TrailVerse Express backend.

All methods call public (unauthenticated) endpoints except plan_trip,
which uses /api/ai/plan-itinerary (rate-limited but no auth needed).
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import urllib.parse
from typing import Any

import httpx

logger = logging.getLogger(__name__)

API_BASE = os.getenv("TRAILVERSE_API_BASE", "https://trailverse.onrender.com").rstrip("/")
TIMEOUT = float(os.getenv("BACKEND_TIMEOUT", "30"))
PLAN_TRIP_TIMEOUT = float(os.getenv("PLAN_TRIP_TIMEOUT", "30"))
USER_AGENT = os.getenv("BACKEND_USER_AGENT", "TrailVerse-MCP/1.0")
MCP_BYPASS_KEY = os.getenv("MCP_BYPASS_KEY", "")


class TrailVerseAPIError(Exception):
    """Raised when the TrailVerse backend returns an error or is unreachable."""


class TrailVerseClient:
    """Thin async wrapper around the TrailVerse public API."""

    def __init__(
        self,
        base_url: str = API_BASE,
        timeout: float = TIMEOUT,
        plan_trip_timeout: float = PLAN_TRIP_TIMEOUT,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.plan_trip_timeout = plan_trip_timeout
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
            logger.error("GET %s returned %s", path, e.response.status_code)
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
            logger.error("POST %s returned %s", path, e.response.status_code)
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

    async def _post_with_timeout(
        self,
        path: str,
        body: dict[str, Any],
        *,
        timeout: float,
    ) -> dict[str, Any]:
        assert self._client is not None, "Use 'async with TrailVerseClient()'"
        try:
            resp = await self._client.post(path, json=body, timeout=timeout)
            resp.raise_for_status()
        except httpx.TimeoutException as e:
            logger.error("POST %s timed out after %ss", path, timeout)
            raise TrailVerseAPIError(f"Request timed out after {int(timeout)} seconds") from e
        except httpx.HTTPStatusError as e:
            logger.error("POST %s returned %s", path, e.response.status_code)
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

    async def get_park_campgrounds(self, park_code: str) -> dict[str, Any]:
        safe_code = self._validate_park_code(park_code)
        return await self._get(f"/api/parks/{safe_code}/campgrounds")

    async def get_park_permits(self, park_code: str) -> dict[str, Any]:
        safe_code = self._validate_park_code(park_code)
        return await self._get(f"/api/parks/{safe_code}/permits")

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
            stateCode=state,
            category=category,
            limit=limit,
        )

    # ---------- Analytics ----------

    async def track_mcp_event(self, event: dict[str, Any]) -> None:
        """Fire-and-forget POST to /api/analytics/track with an MCP tool call event."""
        try:
            await self._post("/api/analytics/track", {
                "events": [event],
                "sessionId": event.get("sessionId", "mcp-unknown"),
            })
        except Exception:
            # Analytics must never break tool execution
            logger.debug("Failed to send MCP analytics event", exc_info=True)

    # ---------- AI Planner (anonymous) ----------

    async def plan_trip_anonymous(
        self,
        message: str,
        park_code: str | None = None,
        form_data: dict[str, Any] | None = None,
        messages: list[dict[str, str]] | None = None,
        anonymous_id: str | None = None,
    ) -> dict[str, Any]:
        """
        Call the anonymous AI planner (Trailie on Claude Sonnet 5).

        form_data: optional structured constraints (dates, groupSize, budget, etc.).
        messages: full conversation history for multi-turn continuity.
        anonymous_id: stable session identity for backend session lookup.
        """
        metadata: dict[str, Any] = {
            "skipUserContext": True,
            "source": "mcp",
        }
        if park_code:
            metadata["parkCode"] = self._validate_park_code(park_code)
        if form_data:
            metadata["formData"] = form_data
        body: dict[str, Any] = {
            "messages": messages if messages else [{"role": "user", "content": message}],
            "provider": "claude",
            "metadata": metadata,
        }
        if anonymous_id:
            body["anonymousId"] = anonymous_id
        return await self._post_with_timeout(
            "/api/ai/plan-itinerary",
            body,
            timeout=self.plan_trip_timeout,
        )


# ---------- Image fetching for MCP inline images ----------

_IMAGE_TIMEOUT = 10.0  # seconds per image fetch
_IMAGE_MAX_DOWNLOAD = 15_000_000  # skip downloads larger than 15MB
_IMAGE_RESIZE_WIDTH = 600  # resize to this width (maintain aspect ratio)
_IMAGE_JPEG_QUALITY = 75  # JPEG compression quality

# Only fetch images from these trusted domains (SSRF prevention).
_ALLOWED_IMAGE_HOSTS = {
    "www.nps.gov",
    "nps.gov",
    "home.nps.gov",
    "npgallery.nps.gov",
    "developer.nps.gov",
    "upload.wikimedia.org",
    "images.unsplash.com",
}


def _is_allowed_image_url(url: str) -> bool:
    """Check if an image URL is from a trusted host."""
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        host = (parsed.hostname or "").lower()
        return host in _ALLOWED_IMAGE_HOSTS
    except Exception:
        return False


async def fetch_image_as_base64(url: str) -> dict[str, str] | None:
    """
    Download an image URL, resize to ~600px wide, and return an MCP ImageContent dict.
    Returns: {"type": "image", "data": "<base64>", "mimeType": "image/jpeg"}
    NPS serves full-res photos (5-10MB), so we resize to keep responses small (~30-80KB).
    """
    if not url:
        return None
    if not _is_allowed_image_url(url):
        logger.warning("Image blocked by allowlist: %s", url)
        return None
    try:
        from io import BytesIO
        from PIL import Image

        async with httpx.AsyncClient(timeout=_IMAGE_TIMEOUT, follow_redirects=True) as c:
            resp = await c.get(url)
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
            if not content_type.startswith("image/"):
                logger.warning("URL is not image content: %s content_type=%s", url, content_type)
                return None
            body = resp.content
            if len(body) > _IMAGE_MAX_DOWNLOAD:
                logger.warning("Image too large: %s size=%d", url, len(body))
                return None

            # Resize and compress
            img = Image.open(BytesIO(body))
            if img.width > _IMAGE_RESIZE_WIDTH:
                ratio = _IMAGE_RESIZE_WIDTH / img.width
                new_size = (int(img.width * ratio), int(img.height * ratio))
                img = img.resize(new_size, Image.LANCZOS)
            # Convert to RGB JPEG (handles PNG/RGBA)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
            buf = BytesIO()
            img.save(buf, format="JPEG", quality=_IMAGE_JPEG_QUALITY, optimize=True)
            compressed = buf.getvalue()

            return {
                "type": "image",
                "data": base64.b64encode(compressed).decode("ascii"),
                "mimeType": "image/jpeg",
            }
    except Exception:
        logger.warning("Failed to fetch/resize image: %s", url, exc_info=True)
        return None


async def fetch_images_as_base64(urls: list[str]) -> list[dict[str, str] | None]:
    """Fetch multiple images concurrently. Returns list parallel to input (None on failure)."""
    return await asyncio.gather(*(fetch_image_as_base64(u) for u in urls))


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
