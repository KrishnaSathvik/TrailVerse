"""Step 6 — MCP host is renderer-only for Trailie trip/planning state."""
from __future__ import annotations

import asyncio
import json
from copy import deepcopy
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from server.formatters import format_plan_trip
from server.host_instructions import (
    BANNED_PLANNING_PHRASES,
    MCP_HOST_INSTRUCTIONS,
    REQUIRED_RENDERER_PHRASES,
)
from server.plan_trip_service import slim_plan_trip_structured

# Intentionally unusual canonical fixture so unauthorized reinterpretation is obvious.
UNUSUAL_PLAN = {
    "intro": "One quiet Smokies day.",
    "tripSchemaVersion": 1,
    "futureContractField": {"meaning": 42, "keep": True},
    "days": [
        {
            "id": "d1",
            "dayNumber": 1,
            "label": "River day",
            "overnightLocation": "Cherokee area",
            "stops": [
                {
                    "id": "s1",
                    "order": 1,
                    "type": "viewpoint",
                    "name": "Activity A",
                    "note": "Morning outing at a grounded place.",
                    "duration": 75,
                    "timeWindow": "Morning",
                    "startTime": "",
                    "canonicalPlaceId": "nps:place:activity-a",
                    "canonicalPlaceName": "Activity A",
                    "location": {
                        "status": "resolved",
                        "lat": 35.51,
                        "lon": -83.31,
                        "source": "nps",
                        "authority": "official_owner",
                        "sourceRef": "place-1",
                    },
                },
                {
                    "id": "s2",
                    "order": 2,
                    "type": "viewpoint",
                    "name": "Timed overlook",
                    "note": "Only clock when the clock matters.",
                    "duration": 45,
                    "timeWindow": "Morning",
                    "startTime": "6:42 AM",
                    "timingReason": "sunrise at the overlook",
                    "canonicalPlaceId": "nps:place:overlook",
                    "canonicalPlaceName": "Timed overlook",
                    "location": {
                        "status": "resolved",
                        "lat": 35.52,
                        "lon": -83.32,
                        "source": "nps",
                        "authority": "official_owner",
                        "sourceRef": "place-2",
                    },
                },
            ],
            "travelEdges": [
                {
                    "fromStopId": "s1",
                    "toStopId": "s2",
                    "durationMinutes": 37,
                    "mode": "road",
                    "label": "37 min by road",
                    "operationalAccess": "unknown",
                }
            ],
            "dayStructure": {
                "type": "sightseeing",
                "startPeriod": "morning",
                "endPeriod": "afternoon",
                "summary": "Grounded morning, flexible afternoon.",
                "blocks": [
                    {
                        "kind": "outing",
                        "periods": ["morning"],
                        "label": "Activity A",
                        "note": "Morning — activity A",
                        "stopIds": ["s1"],
                    },
                    {
                        "kind": "outing",
                        "periods": ["morning"],
                        "label": "Timed overlook",
                        "note": "Exact time with timingReason.",
                        "stopIds": ["s2"],
                    },
                    {
                        "kind": "experience",
                        "periods": ["afternoon"],
                        "label": "Easy riverside time",
                        "note": "Afternoon — flexible experience",
                        "stopIds": [],
                        "duration": 90,
                    },
                ],
            },
        }
    ],
}

# Strings that must not appear in adapter output unless Trailie supplied them.
FORBIDDEN_INVENTIONS = (
    "7:00 AM",
    "7:00 am",
    "restaurant",
    "Budget",
    "breakfast",
    "lunch",
    "dinner",
    "37 min drive",
    "37-minute drive",
    "drive time",
)


def _wire_payloads(plan, *, narrative="Here is your quiet day.", outcome=None):
    data = {
        "content": narrative,
        "canonicalPlan": deepcopy(plan),
        "anonymousId": "renderer-fixture",
    }
    if outcome:
        data.update(outcome)
    structured, text = format_plan_trip({"data": data}, user_message="Plan a quiet day")
    return structured, slim_plan_trip_structured(structured), text


def test_host_instructions_ban_old_planning_doctrine():
    for phrase in BANNED_PLANNING_PHRASES:
        assert phrase not in MCP_HOST_INSTRUCTIONS, f"banned doctrine still present: {phrase}"


def test_host_instructions_require_renderer_contract():
    for phrase in REQUIRED_RENDERER_PHRASES:
        assert phrase in MCP_HOST_INSTRUCTIONS, f"missing renderer phrase: {phrase}"


def test_fastmcp_serves_renderer_only_instructions():
    from server.main import mcp

    assert mcp.instructions == MCP_HOST_INSTRUCTIONS
    for phrase in BANNED_PLANNING_PHRASES:
        assert phrase not in mcp.instructions


def test_plan_trip_tool_description_does_not_promise_buffers_or_drive_estimates():
    from server.main import mcp

    tools = asyncio.run(mcp.list_tools())
    plan = next(tool for tool in tools if tool.name == "plan_trip")
    description = plan.description or ""
    assert "buffers" not in description.lower()
    assert "driving estimates" not in description.lower()
    assert "faithfully" in description.lower() or "canonical TripPlan" in description


def test_unusual_canonical_fixture_is_lossless_in_full_and_slim():
    structured, slim, text = _wire_payloads(UNUSUAL_PLAN)
    for wire in (structured, slim):
        assert wire["canonicalPlan"] == UNUSUAL_PLAN
        assert wire["days"] == UNUSUAL_PLAN["days"]
        assert wire["canonicalPlan"]["tripSchemaVersion"] == 1
        assert wire["canonicalPlan"]["futureContractField"] == {"meaning": 42, "keep": True}
    rendered = json.loads(text.split("```json\n")[1].split("\n```")[0])
    assert rendered == UNUSUAL_PLAN
    assert rendered["tripSchemaVersion"] == 1


def test_pinless_experience_survives_without_pin_or_stop():
    _, _, text = _wire_payloads(UNUSUAL_PLAN)
    plan = json.loads(text.split("```json\n")[1].split("\n```")[0])
    experience = next(
        b for b in plan["days"][0]["dayStructure"]["blocks"] if b["kind"] == "experience"
    )
    assert experience["stopIds"] == []
    assert experience["label"] == "Easy riverside time"
    # Adapter must not invent a stop / restaurant / pin for the flexible block.
    stop_names = {s["name"] for s in plan["days"][0]["stops"]}
    assert "Easy riverside time" not in stop_names
    assert not any(s.get("type") == "restaurant" for s in plan["days"][0]["stops"])


def test_road_phrasing_never_becomes_drive():
    structured, slim, text = _wire_payloads(UNUSUAL_PLAN)
    edge = structured["days"][0]["travelEdges"][0]
    assert edge["label"] == "37 min by road"
    assert edge["mode"] == "road"
    assert edge["operationalAccess"] == "unknown"
    assert slim["days"][0]["travelEdges"][0]["label"] == "37 min by road"
    assert "37 min by road" in text
    assert "37 min drive" not in text
    assert "37-minute drive" not in text


def test_exact_time_with_timing_reason_is_preserved():
    structured, _, text = _wire_payloads(UNUSUAL_PLAN)
    timed = next(s for s in structured["days"][0]["stops"] if s["id"] == "s2")
    assert timed["startTime"] == "6:42 AM"
    assert timed["timingReason"] == "sunrise at the overlook"
    assert "6:42 AM" in text
    assert "sunrise at the overlook" in text


def test_no_exact_time_stays_no_exact_time_on_activity_a():
    structured, _, text = _wire_payloads(UNUSUAL_PLAN)
    activity = next(s for s in structured["days"][0]["stops"] if s["id"] == "s1")
    assert activity["startTime"] == ""
    assert "timingReason" not in activity
    # No invented morning clock for the untimed outing.
    assert "7:00 AM" not in text
    assert "Activity A" in text


def test_adapter_text_does_not_invent_planning_chrome():
    _, _, text = _wire_payloads(UNUSUAL_PLAN)
    lowered = text.lower()
    for phrase in FORBIDDEN_INVENTIONS:
        assert phrase.lower() not in lowered, f"adapter invented: {phrase}"
    # No new stop / duration / budget fields injected beside the canonical JSON.
    plan = json.loads(text.split("```json\n")[1].split("\n```")[0])
    assert len(plan["days"][0]["stops"]) == 2
    assert all(s["duration"] in (75, 45) for s in plan["days"][0]["stops"])
    assert "budget" not in json.dumps(plan).lower()


def test_save_failed_remains_visible_and_not_described_as_saved():
    outcome = {
        "artifactStatus": {
            "status": "save_failed",
            "code": "mutation_rejected",
            "notice": "Saved trip unchanged.",
        },
        "mutationStatus": "rejected_answered",
        "mutationIssues": ["stop_identity_unresolved"],
    }
    structured, slim, text = _wire_payloads(UNUSUAL_PLAN, outcome=outcome)
    assert structured["status"] == "save_failed"
    assert slim["status"] == "save_failed"
    assert "Trip save state" in text
    assert "save_failed" in text
    assert structured["artifactStatus"]["status"] == "save_failed"
    # Host instructions must keep the limitation visible.
    assert "preserve that limitation" in MCP_HOST_INSTRUCTIONS
    assert "never describe it as saved" in MCP_HOST_INSTRUCTIONS.lower() or (
        "not saved" in MCP_HOST_INSTRUCTIONS and "save_failed" in MCP_HOST_INSTRUCTIONS
    )


def test_trip_updated_instructions_do_not_imply_untouched_days_changed():
    assert "untouched days changed" in MCP_HOST_INSTRUCTIONS
    assert "do not claim untouched days changed" in MCP_HOST_INSTRUCTIONS.lower()


@pytest.mark.parametrize("widgets", [False, True])
def test_plan_trip_tool_preserves_unusual_plan_and_save_failed(widgets):
    from server.main import plan_trip

    client = MagicMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=None)
    client.plan_trip_anonymous = AsyncMock(
        return_value={
            "success": True,
            "data": {
                "content": "Morning grounded; afternoon flexible.",
                "canonicalPlan": deepcopy(UNUSUAL_PLAN),
                "anonymousId": "renderer-session",
                "artifactStatus": {"status": "save_failed", "notice": "Not saved."},
                "mutationStatus": "rejected_answered",
            },
        }
    )

    async def run():
        with (
            patch("server.main.TrailVerseClient", return_value=client),
            patch("server.main._check_rate_limit", AsyncMock(return_value=None)),
            patch("server.main._resolve_park_code", AsyncMock(return_value="grsm")),
            patch("server.main._park_display_name", AsyncMock(return_value="Great Smoky Mountains")),
            patch("server.main.ENABLE_WIDGETS", widgets),
            patch("server.main._send_analytics"),
        ):
            return await plan_trip(park_code="grsm", number_of_days=1, travel_month="October")

    result = asyncio.run(run())
    assert not result.isError
    assert result.structuredContent["status"] == "save_failed"
    assert result.structuredContent["canonicalPlan"] == UNUSUAL_PLAN
    assert result.structuredContent["days"][0]["travelEdges"][0]["label"] == "37 min by road"
    text = result.content[0].text
    assert "37 min by road" in text
    assert "37 min drive" not in text
    assert "7:00 AM" not in text
    assert "save_failed" in text
