"""Park accuracy regressions (Fix 2) — resolution, compare completeness, ties,
state ranking, error messages. HTTP is replaced by an in-memory fake backend
that reproduces the production search behavior observed 2026-10-26
(token-prefix OR matching, alphabetical catalog order for filter-only queries).
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from server import main
from server.client import TrailVerseAPIError, TrailVerseClient
from server.park_resolution import rank_candidates, resolve_park
from server.search_ranking import normalize_state

CATALOG: list[dict[str, Any]] = [
    {"parkCode": "arch", "fullName": "Arches National Park", "designation": "National Park", "states": "UT"},
    {"parkCode": "blrv", "fullName": "Blackstone River Valley National Historical Park", "designation": "National Historical Park", "states": "MA,RI"},
    {"parkCode": "brca", "fullName": "Bryce Canyon National Park", "designation": "National Park", "states": "UT"},
    {"parkCode": "cali", "fullName": "California National Historic Trail", "designation": "National Historic Trail", "states": "CA,CO,ID,KS,MO,NE,NV,OR,UT,WY"},
    {"parkCode": "cany", "fullName": "Canyonlands National Park", "designation": "National Park", "states": "UT"},
    {"parkCode": "care", "fullName": "Capitol Reef National Park", "designation": "National Park", "states": "UT"},
    {"parkCode": "cebr", "fullName": "Cedar Breaks National Monument", "designation": "National Monument", "states": "UT"},
    {"parkCode": "cuva", "fullName": "Cuyahoga Valley National Park", "designation": "National Park", "states": "OH"},
    {"parkCode": "deva", "fullName": "Death Valley National Park", "designation": "National Park", "states": "CA,NV"},
    {"parkCode": "dino", "fullName": "Dinosaur National Monument", "designation": "National Monument", "states": "CO,UT"},
    {"parkCode": "elis", "fullName": "Ellis Island Part of Statue of Liberty National Monument", "designation": "Part of Statue of Liberty National Monument", "states": "NJ,NY"},
    {"parkCode": "frpe", "fullName": "Frances Perkins National Monument", "designation": "National Monument", "states": "ME"},
    {"parkCode": "glac", "fullName": "Glacier National Park", "designation": "National Park", "states": "MT"},
    {"parkCode": "glba", "fullName": "Glacier Bay National Park & Preserve", "designation": "National Park & Preserve", "states": "AK"},
    {"parkCode": "glca", "fullName": "Glen Canyon National Recreation Area", "designation": "National Recreation Area", "states": "AZ,UT"},
    {"parkCode": "grca", "fullName": "Grand Canyon National Park", "designation": "National Park", "states": "AZ"},
    {"parkCode": "grte", "fullName": "Grand Teton National Park", "designation": "National Park", "states": "WY"},
    {"parkCode": "jotr", "fullName": "Joshua Tree National Park", "designation": "National Park", "states": "CA"},
    {"parkCode": "kova", "fullName": "Kobuk Valley National Park", "designation": "National Park", "states": "AK"},
    {"parkCode": "mopi", "fullName": "Mormon Pioneer National Historic Trail", "designation": "National Historic Trail", "states": "IL,IA,NE,UT,WY"},
    {"parkCode": "olsp", "fullName": "Old Spanish National Historic Trail", "designation": "National Historic Trail", "states": "AZ,CA,CO,NV,NM,UT"},
    {"parkCode": "redw", "fullName": "Redwood National and State Parks", "designation": "National and State Parks", "states": "CA"},
    {"parkCode": "seki", "fullName": "Sequoia & Kings Canyon National Parks", "designation": "National Parks", "states": "CA"},
    {"parkCode": "stli", "fullName": "Statue Of Liberty National Monument", "designation": "National Monument", "states": "NJ,NY"},
    {"parkCode": "vafo", "fullName": "Valley Forge National Historical Park", "designation": "National Historical Park", "states": "PA"},
    {"parkCode": "waca", "fullName": "Walnut Canyon National Monument", "designation": "National Monument", "states": "AZ"},
    {"parkCode": "yell", "fullName": "Yellowstone National Park", "designation": "National Park", "states": "ID,MT,WY"},
    {"parkCode": "yose", "fullName": "Yosemite National Park", "designation": "National Park", "states": "CA"},
    {"parkCode": "zion", "fullName": "Zion National Park", "designation": "National Park", "states": "UT"},
]
BY_CODE = {p["parkCode"]: p for p in CATALOG}

# Per-park live fields used by the compare fake.
LIVE = {
    "zion": ("Low", 71), "brca": ("Moderate", 48), "grca": ("High", 66),
    "yell": ("Moderate", 39), "grte": ("Moderate", 41), "glac": ("Moderate", 37),
    "yose": ("Moderate", 60),
}


def _words(name: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", name.lower())


class FakeBackend:
    """Async stand-in for TrailVerseClient with call recording."""

    def __init__(self, crowd_overrides: dict[str, str] | None = None) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.crowd = {k: v[0] for k, v in LIVE.items()} | (crowd_overrides or {})

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return None

    async def search_parks(self, q=None, state=None, activity=None, limit=12, fields=None):
        self.calls.append(("search_parks", {"q": q, "state": state, "limit": limit}))
        parks = [p for p in CATALOG if not state or state in p["states"].split(",")]
        if q:
            tokens = [t for t in _words(q) if len(t) >= 3 and t not in {"the", "and", "national", "park"}]
            # Observed production behavior: the first content token must
            # prefix-match a name word ("paris france" → 0 results, while
            # "france paris" → Frances Perkins; "valley of fire" → every Valley park).
            first = tokens[:1]
            parks = [p for p in parks if first and any(w.startswith(first[0]) for w in _words(p["fullName"]))]
        return {"success": True, "count": len(parks), "data": [dict(p) for p in parks[: int(limit)]]}

    async def get_park_details(self, code):
        self.calls.append(("get_park_details", {"code": code}))
        if code not in BY_CODE:
            raise TrailVerseAPIError("Request failed (status 404)", status=404)
        return {"data": {**BY_CODE[code], "description": "Recorded description"}}

    async def _empty(self, code):
        return {}

    get_park_alerts = get_park_weather = get_park_campgrounds = get_park_permits = get_park_of_day = _empty

    async def compare_parks(self, codes):
        self.calls.append(("compare_parks", {"codes": list(codes)}))
        found = [c for c in codes if c in BY_CODE]
        if not found:
            raise TrailVerseAPIError("Request failed (status 404)", status=404)
        parks = []
        for c in found:
            crowd = self.crowd.get(c, "Moderate")
            temp = LIVE.get(c, ("Moderate", 50))[1]
            parks.append({
                **BY_CODE[c],
                "crowdLevel": {"level": crowd},
                "weather": {"current": {"temperature": temp}},
                "entranceFees": [{"cost": "35.00"}],
                "activities": [{"name": "Hiking"}, {"name": "Camping"}],
                "latitude": "40.0", "longitude": "-110.0",
            })
        return {"success": True, "data": {"parks": parks}}

    async def compare_summary(self, codes):
        self.calls.append(("compare_summary", {"codes": list(codes)}))
        first = BY_CODE[codes[0]]
        # Backend picks the first park on ties — the formatter must not trust it.
        return {"data": {
            "bestOverall": {"parkName": first["fullName"]},
            "crowdComparison": {"leastCrowded": {"parkName": first["fullName"]}},
            "commonActivities": ["Hiking", "Camping"],
        }}

    async def list_events(self, park_code=None, state=None, category=None, limit=10):
        self.calls.append(("list_events", {"park_code": park_code}))
        return {"success": True, "data": []}

    async def plan_trip_anonymous(self, **kwargs):
        self.calls.append(("plan_trip_anonymous", kwargs))
        return {"success": True, "data": {"content": "Trip.", "anonymousId": "guest-x"}}


def run_tool(coro_fn, *args, backend: FakeBackend | None = None, **kwargs):
    backend = backend or FakeBackend()

    async def _run():
        with patch("server.main.TrailVerseClient", return_value=backend), \
             patch("server.main._check_rate_limit", AsyncMock(return_value=None)), \
             patch("server.main._send_analytics"), \
             patch("server.main.ENABLE_WIDGETS", False):
            return await coro_fn(*args, **kwargs)

    return asyncio.run(_run()), backend


def _text(result) -> str:
    return "\n".join(block.text for block in result.content)


def _err(result) -> dict[str, Any]:
    return result.structuredContent["error"]


# ---------- (a) never substitute an unrelated park ----------

def test_valley_of_fire_is_not_resolved_to_valley_forge():
    result, backend = run_tool(main.get_park_details, "Valley of Fire")
    assert result.isError
    assert _err(result)["code"] == "UNKNOWN_PARK"
    assert "Valley of Fire" in _text(result)
    assert "Valley Forge" not in _text(result)  # not even offered as a suggestion
    assert "plan_trip" in _text(result)
    assert not any(name == "get_park_details" for name, _ in backend.calls)


def test_valley_of_fire_state_park_is_reported_as_non_nps():
    result, _ = run_tool(main.get_park_details, "Valley of Fire State Park")
    assert result.isError
    assert _err(result)["code"] == "NOT_AN_NPS_SITE"
    assert "plan_trip" in _text(result)


def test_plan_trip_for_state_park_sends_no_park_code():
    result, backend = run_tool(
        main.plan_trip, park_name="Valley of Fire State Park", number_of_days=3, travel_month="November"
    )
    assert not result.isError
    call = next(kw for name, kw in backend.calls if name == "plan_trip_anonymous")
    assert call["park_code"] is None


def test_ambiguous_name_returns_candidates_not_a_guess():
    result, backend = run_tool(main.get_park_details, "Canyon")
    assert result.isError
    assert _err(result)["code"] == "AMBIGUOUS_PARK"
    assert len(_err(result)["candidates"]) >= 2
    assert not any(name == "get_park_details" for name, _ in backend.calls)


def test_bad_code_gives_useful_message_not_bare_status():
    result, _ = run_tool(main.get_park_details, "qqqq")
    assert result.isError
    assert _err(result)["code"] == "UNKNOWN_PARK_CODE"
    text = _text(result)
    assert "qqqq" in text and "search_parks" in text
    assert "status 404" not in text


def test_paris_france_search_does_not_return_frances_perkins():
    result, backend = run_tool(main.search_parks, query="Paris France")
    assert "Frances Perkins" not in _text(result)
    assert "No National Park Service sites matched" in _text(result)
    # No re-ordered "expansion" retry when expansion adds no intent synonyms.
    assert sum(1 for name, _ in backend.calls if name == "search_parks") == 1


def test_find_events_invalid_code_is_an_error_not_empty_list():
    result, _ = run_tool(main.find_events, park_code="zzzz")
    assert result.isError
    assert _err(result)["code"] == "UNKNOWN_PARK_CODE"
    assert "No upcoming" not in _text(result)


def test_find_events_valid_park_with_no_events_names_the_park():
    result, _ = run_tool(main.find_events, park_code="yell")
    assert not result.isError
    assert "Yellowstone National Park" in _text(result)


def test_find_events_requests_upcoming_only():
    seen = []

    def handle(request):
        seen.append(request)
        return httpx.Response(200, json={"success": True, "data": []})

    async def go():
        client = TrailVerseClient(base_url="http://backend.test")
        async with httpx.AsyncClient(base_url=client.base_url, transport=httpx.MockTransport(handle)) as http:
            client._client = http
            await client.list_events(park_code="brca")

    asyncio.run(go())
    assert seen[0].url.params["upcoming"] == "true"


def test_client_error_carries_http_status():
    async def go():
        client = TrailVerseClient(base_url="http://backend.test")
        transport = httpx.MockTransport(lambda r: httpx.Response(404, json={}))
        async with httpx.AsyncClient(base_url=client.base_url, transport=transport) as http:
            client._client = http
            await client.get_park_details("qqqq")

    with pytest.raises(TrailVerseAPIError) as info:
        asyncio.run(go())
    assert info.value.status == 404


# ---------- (b) incomplete comparisons ----------

@pytest.mark.parametrize("bad", ["brch", "qqqq"])
def test_compare_with_one_unknown_code_is_an_error(bad):
    result, _ = run_tool(main.compare_parks, ["zion", bad])
    assert result.isError
    err = _err(result)
    assert err["code"] == "COMPARE_NEEDS_TWO_PARKS"
    assert bad in _text(result)
    assert "less crowded right now than ." not in _text(result)


def test_compare_with_one_unknown_name_is_an_error():
    result, backend = run_tool(main.compare_parks, ["Zion", "Valley of Fire"])
    assert result.isError
    assert _err(result)["code"] == "COMPARE_NEEDS_TWO_PARKS"
    assert not any(name == "compare_parks" for name, _ in backend.calls)


def test_compare_partial_three_parks_reports_the_missing_one():
    result, backend = run_tool(main.compare_parks, ["zion", "brca", "brch"])
    assert not result.isError
    text = _text(result)
    assert "Partial comparison" in text and "brch" in text
    # The final compare call only contains codes that exist.
    compare_calls = [kw["codes"] for name, kw in backend.calls if name == "compare_parks"]
    assert compare_calls[-1] == ["zion", "brca"]


def test_compare_rejects_single_park():
    result, _ = run_tool(main.compare_parks, ["zion"])
    assert result.isError
    assert _err(result)["code"] == "INVALID_PARK_COUNT"


def test_compare_dedupes_same_park_given_twice():
    result, _ = run_tool(main.compare_parks, ["zion", "Zion National Park"])
    assert result.isError
    assert _err(result)["code"] == "COMPARE_NEEDS_TWO_PARKS"


# ---------- (c) ties and N-park wording ----------

def test_three_way_crowd_tie_does_not_crown_a_winner():
    result, _ = run_tool(main.compare_parks, ["yell", "grte", "glac"])
    assert not result.isError
    text = _text(result)
    assert "Go with" not in text
    assert "less crowded" not in text.lower()
    assert "Lightest crowds" not in text
    assert "same right now" in text
    assert "hitting both" not in text and "covering both" not in text
    assert "covering these parks" in text
    assert "All 3 offer" in text


def test_unique_lowest_crowd_is_called_out():
    result, _ = run_tool(main.compare_parks, ["zion", "brca"])
    text = _text(result)
    assert "Lightest crowds right now: Zion National Park" in text
    assert "covering both" in text
    assert "Both offer" in text


def test_compare_text_does_not_claim_drive_time():
    result, _ = run_tool(main.compare_parks, ["zion", "brca"])
    assert "does not compute" in _text(result)


# ---------- (d) state search ranking ----------

def test_state_ut_limit_5_returns_the_five_utah_national_parks():
    result, backend = run_tool(main.search_parks, state="UT", limit=5)
    text = _text(result)
    for name in ["Zion", "Arches", "Bryce Canyon", "Canyonlands", "Capitol Reef"]:
        assert name in text, name
    assert "California National Historic Trail" not in text
    call = next(kw for name, kw in backend.calls if name == "search_parks")
    assert call["limit"] >= 100  # whole state set fetched before ranking


def test_state_full_name_and_case_are_accepted():
    result, _ = run_tool(main.search_parks, state="Utah", limit=5)
    assert not result.isError and "Zion" in _text(result)
    result, _ = run_tool(main.search_parks, state="California", limit=5)
    assert not result.isError and "Yosemite" in _text(result)
    assert normalize_state("az") == ("AZ", True)
    assert normalize_state("New Mexico") == ("NM", True)


def test_invalid_state_gets_specific_error():
    result, _ = run_tool(main.search_parks, state="Narnia")
    assert result.isError
    assert _err(result)["code"] == "INVALID_STATE"
    assert "Invalid input" not in _text(result)


def test_state_ca_and_az_rank_national_parks_first():
    result, _ = run_tool(main.search_parks, state="CA", limit=4)
    text = _text(result)
    assert "California National Historic Trail" not in text
    assert "Yosemite" in text or "Joshua Tree" in text
    result, _ = run_tool(main.search_parks, state="AZ", limit=1)
    assert "Grand Canyon National Park" in _text(result)


# ---------- normal cases still work ----------

@pytest.mark.parametrize("given,expected", [
    ("yose", "yose"),
    ("Glacier National Park", "glac"),
    ("Glacier", "glac"),
    ("Statue of Liberty", "stli"),
    ("Zion", "zion"),
    ("Kings Canyon", "seki"),
    ("yellowstone-national-park", "yell"),
])
def test_get_park_details_resolves_normal_names(given, expected):
    result, backend = run_tool(main.get_park_details, given)
    assert not result.isError, _text(result)
    assert ("get_park_details", {"code": expected}) in backend.calls


def test_compare_zion_and_bryce_normal():
    result, _ = run_tool(main.compare_parks, ["zion", "brca"])
    assert not result.isError
    assert "Partial comparison" not in _text(result)
    assert "Zion National Park" in _text(result) and "Bryce Canyon National Park" in _text(result)


def test_three_park_compare_by_name():
    result, backend = run_tool(main.compare_parks, ["Yellowstone", "Grand Teton", "Glacier"])
    assert not result.isError
    compare_call = next(kw for name, kw in backend.calls if name == "compare_parks")
    assert compare_call["codes"] == ["yell", "grte", "glac"]


def test_rank_candidates_rules():
    parks = CATALOG
    assert rank_candidates("Glacier Bay", parks).code == "glba"
    assert rank_candidates("Redwood National and State Parks", parks).code == "redw"
    assert rank_candidates("Grand Canyon", parks).code == "grca"
    assert rank_candidates("Canyon", parks).status == "ambiguous"
    assert rank_candidates("Valley of Fire", parks).status == "not_found"
    assert rank_candidates("Custer State Park", parks).status == "non_nps"


def test_resolver_lookup_failure_is_not_a_guess():
    async def boom(_q):
        raise TrailVerseAPIError("Backend service unreachable")

    res = asyncio.run(resolve_park("Glacier", boom))
    assert res.status == "lookup_failed" and res.code is None


def test_permit_lottery_is_surfaced_from_recreation_gov_text():
    from server.formatters import format_park_details

    details = {"data": {"parkCode": "yose", "fullName": "Yosemite National Park", "states": "CA"}}
    permits = {"data": [
        {"name": "Half Dome Permits", "type": "Permit", "reservationUrl": "https://www.recreation.gov/permits/234652",
         "description": "Daily Lottery Only: if your application is selected through the lottery..."},
        {"name": "Wilderness Permits", "type": "Permit", "reservationUrl": "https://www.recreation.gov/permits/445859",
         "description": "A wilderness permit is required year-round."},
    ]}
    _, text = format_park_details(details, None, None, None, permits, None)
    half_dome = next(line for line in text.splitlines() if "Half Dome Permits" in line)
    wilderness = next(line for line in text.splitlines() if "Wilderness Permits" in line)
    assert "lottery" in half_dome
    assert "lottery" not in wilderness
    assert "dropped timed entry" not in text
