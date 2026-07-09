"""Pytest suite for TrailVerse MCP plan_trip and validation."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from server.plan_trip_service import (
    build_plan_trip_form_data,
    build_plan_trip_message,
    transform_itinerary_days,
    validate_plan_trip_business_rules,
)
from server.search_ranking import rerank_search_results
from server.types import PlanTripInput
from server.validation import validation_error_from_pydantic


def test_valid_shenandoah_payload_message():
    payload = PlanTripInput(
        park_code="shen",
        number_of_days=3,
        adults=2,
        children=0,
        travel_month="October",
        difficulty=["easy", "moderate"],
        max_hike_miles=3,
        interests=["photography", "wildlife", "scenic-drives"],
        sunrise=True,
        sunset=True,
        relaxed_afternoon=True,
        lodging_area="Luray, Virginia",
    )
    msg = build_plan_trip_message(payload)
    assert "3-day" in msg
    assert "shen" in msg.lower() or "Shenandoah" in msg
    assert "3.0 miles" in msg or "3 miles" in msg
    assert "sunrise" in msg.lower()


def test_missing_number_of_days_error():
    payload = PlanTripInput(park_code="shen", adults=2)
    err = validate_plan_trip_business_rules(payload)
    assert err is not None
    assert err["code"] == "MISSING_NUMBER_OF_DAYS"
    assert err["field"] == "number_of_days"


def test_missing_travel_date_error():
    payload = PlanTripInput(park_code="shen", number_of_days=3, adults=2)
    err = validate_plan_trip_business_rules(payload)
    assert err is not None
    assert err["code"] == "MISSING_TRAVEL_DATE"
    assert err["field"] == "start_date"


def test_invalid_start_date_error():
    with pytest.raises(ValidationError):
        PlanTripInput(park_code="acad", number_of_days=3, start_date="October")


def test_invalid_date_validation_error_message():
    try:
        PlanTripInput(park_code="acad", number_of_days=3, start_date="2026-13-40")
    except ValidationError as exc:
        err = validation_error_from_pydantic(exc)
        assert err["code"] == "INVALID_START_DATE"
        assert err["field"] == "start_date"
    else:
        raise AssertionError("expected ValidationError")


def test_revision_requires_session_id():
    payload = PlanTripInput(revision_request="Make Day 2 a relaxed afternoon")
    err = validate_plan_trip_business_rules(payload)
    assert err is not None
    assert err["code"] == "MISSING_SESSION_ID"


def test_difficulty_synonyms_normalized():
    payload = PlanTripInput(
        park_code="shen",
        number_of_days=2,
        difficulty=["beginner", "intermediate"],
    )
    assert payload.difficulty == ["easy", "moderate"]


def test_legacy_days_alias():
    payload = PlanTripInput(park_code="shen", days=3, group_size=2, fitness_level="easy")
    assert payload.number_of_days == 3
    assert payload.adults == 2
    assert payload.difficulty == ["easy"]


def test_form_data_maps_max_hike_miles():
    payload = PlanTripInput(park_code="shen", number_of_days=3, max_hike_miles=3)
    form = build_plan_trip_form_data(payload)
    assert form["maxHikeMiles"] == 3
    assert form["days"] == 3


def test_transform_itinerary_blocks():
    itinerary = {
        "days": [
            {
                "dayNumber": 1,
                "label": "Day 1",
                "stops": [
                    {"name": "Sunrise Point", "type": "landmark", "startTime": "6:30 AM", "duration": 60},
                    {"name": "Afternoon Drive", "type": "custom", "startTime": "2:00 PM", "duration": 90},
                    {"name": "Dinner", "type": "restaurant", "startTime": "7:00 PM", "duration": 60},
                ],
            }
        ]
    }
    days = transform_itinerary_days(itinerary)
    assert len(days) == 1
    assert len(days[0]["morning"]) >= 1
    assert len(days[0]["afternoon"]) >= 1
    assert len(days[0]["evening"]) >= 1


def test_search_rerank_prefers_exact_acadia():
    resp = {
        "data": {
            "parks": [
                {"parkCode": "foo", "fullName": "Saint Croix Acadian Site"},
                {"parkCode": "acad", "fullName": "Acadia National Park"},
            ]
        }
    }
    ranked = rerank_search_results(resp, "Acadia")
    parks = ranked["data"]["parks"]
    assert parks[0]["parkCode"] == "acad"


@pytest.mark.asyncio
async def test_plan_trip_timeout_returns_controlled_error():
    from server.main import plan_trip
    from server.client import TrailVerseAPIError

    with patch("server.main.TrailVerseClient") as client_cls:
        client = MagicMock()
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=None)
        client.plan_trip_anonymous = AsyncMock(
            side_effect=TrailVerseAPIError("Request timed out after 30 seconds")
        )
        client_cls.return_value = client

        result = await plan_trip(
            park_code="shen",
            number_of_days=3,
            adults=2,
            travel_month="October",
            difficulty=["easy", "moderate"],
            max_hike_miles=3,
        )

    assert result.isError is True
    structured = result.structuredContent or {}
    assert structured.get("status") == "error"
    assert structured["error"]["code"] == "UPSTREAM_TIMEOUT"


@pytest.mark.asyncio
async def test_plan_trip_missing_park_validation():
    from server.main import plan_trip

    result = await plan_trip(number_of_days=3, adults=2)
    assert result.isError is True
    structured = result.structuredContent or {}
    assert structured["error"]["code"] == "MISSING_PARK"
