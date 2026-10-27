"""
MCP-side search result re-ranking for park-name queries.
"""
from __future__ import annotations

import re
from typing import Any


def _park_name(park: dict[str, Any]) -> str:
    return (park.get("fullName") or park.get("name") or "").strip()


def _normalize_query(q: str | None) -> str:
    return re.sub(r"\s+", " ", (q or "").strip().lower())


def rerank_search_results(resp: dict[str, Any], query: str | None) -> dict[str, Any]:
    """
    Boost exact / prefix park-name matches and demote substring false positives
    (e.g. Acadian sites when searching for Acadia).
    """
    if not query:
        return resp

    data = resp.get("data", resp)
    parks = data.get("parks") if isinstance(data, dict) else None
    if not isinstance(parks, list) or not parks:
        return resp

    q = _normalize_query(query)
    if not q:
        return resp

    q_tokens = [t for t in re.split(r"[^a-z0-9]+", q) if len(t) >= 3]
    if not q_tokens:
        return resp

    def score(park: dict[str, Any]) -> tuple[int, int, str]:
        name = _park_name(park).lower()
        name_words = [w for w in re.split(r"[^a-z0-9]+", name) if w]
        primary = q_tokens[0]

        if name == q:
            return (0, -len(name), name)
        if name.startswith(q):
            return (1, -len(name), name)
        if any(word == primary for word in name_words):
            return (2, -len(name), name)
        if any(word.startswith(primary) for word in name_words):
            return (3, -len(name), name)
        if primary in name and not _is_false_substring_match(primary, name):
            return (4, -len(name), name)
        return (9, -len(name), name)

    ranked = sorted(parks, key=score)
    if isinstance(data, dict):
        data = {**data, "parks": ranked}
        if "data" in resp:
            return {**resp, "data": data}
        return data
    return resp


def _is_false_substring_match(token: str, name: str) -> bool:
    """Reject token matches where token is a strict substring of a longer word."""
    for word in re.split(r"[^a-z0-9]+", name):
        if token in word and word != token and word.startswith(token):
            return True
    return False


# ---------- State filters ----------

US_STATES: dict[str, str] = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA",
    "colorado": "CO", "connecticut": "CT", "delaware": "DE", "florida": "FL", "georgia": "GA",
    "hawaii": "HI", "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA",
    "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV", "new hampshire": "NH",
    "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
    "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA",
    "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", "tennessee": "TN",
    "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
    "district of columbia": "DC", "washington dc": "DC", "washington d c": "DC",
    "puerto rico": "PR", "us virgin islands": "VI", "virgin islands": "VI", "guam": "GU",
    "american samoa": "AS", "northern mariana islands": "MP",
}
STATE_CODES = frozenset(US_STATES.values())


def normalize_state(value: str | None) -> tuple[str | None, bool]:
    """Return (two-letter code, ok). Accepts 'UT', 'ut', 'Utah', 'New Mexico'."""
    if value is None or not str(value).strip():
        return None, True
    raw = re.sub(r"[^a-z ]+", " ", str(value).strip().lower())
    raw = re.sub(r"\s+", " ", raw).strip()
    if len(raw) == 2 and raw.upper() in STATE_CODES:
        return raw.upper(), True
    code = US_STATES.get(raw)
    if code:
        return code, True
    return None, False


# ---------- Catalog ranking for filter-only searches ----------
# With no text query the backend returns its catalog in alphabetical order, so a
# small limit on state=UT dropped Zion behind a multi-state historic trail.

_FLAGSHIP_RE = re.compile(r"\bnational\s+(and\s+state\s+)?parks?\b", re.IGNORECASE)
_LOW_TIER_RE = re.compile(
    r"\b(trail|heritage|affiliated|wild\s*&?\s*scenic|scenic\s+river|parkway|"
    r"part of|commission|international)\b",
    re.IGNORECASE,
)
_MID_TIER_RE = re.compile(
    r"\b(monument|preserve|seashore|lakeshore|recreation\s+area|national\s+river|reserve)\b",
    re.IGNORECASE,
)


def _designation_tier(park: dict[str, Any]) -> int:
    designation = (park.get("designation") or "").strip()
    name = _park_name(park)
    label = designation or name
    if _FLAGSHIP_RE.search(label) and not re.search(r"historical|military", label, re.IGNORECASE):
        return 0
    if _LOW_TIER_RE.search(label):
        return 3
    if _MID_TIER_RE.search(label):
        return 1
    return 2  # historic sites, memorials, battlefields, historical parks


def _state_count(park: dict[str, Any]) -> int:
    states = park.get("states") or ""
    parts = [s for s in re.split(r"[,\s]+", str(states)) if s]
    return len(parts) or 99


def rank_catalog_results(resp: dict[str, Any], limit: int | None = None) -> dict[str, Any]:
    """Order a filter-only result set: national parks first (by name — there is
    no popularity signal in the catalog), then monuments/preserves/seashores,
    historic sites, and finally trails/heritage areas; outside the national-park
    tier, units located in one state come before multi-state ones. Truncate to
    ``limit`` after ranking."""
    data = resp.get("data", resp)
    parks = data.get("parks") if isinstance(data, dict) else data
    if not isinstance(parks, list):
        return resp
    ranked = sorted(
        parks,
        key=lambda p: (
            _designation_tier(p),
            _designation_tier(p) > 0 and _state_count(p) > 1,
            _park_name(p).lower(),
        ),
    )
    if limit:
        ranked = ranked[:limit]
    if isinstance(data, dict):
        new_data = {**data, "parks": ranked}
        return {**resp, "data": new_data} if "data" in resp else new_data
    return {**resp, "data": ranked}
