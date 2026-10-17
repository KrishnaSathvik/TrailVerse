"""
plan_trip business logic: validation helpers, message building, structured output.
"""
from __future__ import annotations

import re
from copy import deepcopy
from datetime import datetime
from typing import Any

from .types import DIFFICULTY_VALUES, PlanTripInput
from .validation import validation_error

ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MONTH_NAMES = {
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
    "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
}

DEFAULT_UNVERIFIED = [
    "campground availability",
    "permit inventory",
    "real-time parking capacity",
]


def validate_plan_trip_business_rules(payload: PlanTripInput) -> dict[str, Any] | None:
    """Return a validation_error dict when business rules fail, else None."""
    if payload.revision_request:
        if not payload.session_id:
            return validation_error(
                code="MISSING_SESSION_ID",
                message="revision_request requires session_id from a prior plan_trip response.",
                field="session_id",
                expected="session_id returned by a previous plan_trip call",
            )
        return None

    if not payload.park_code and not payload.park_name:
        return validation_error(
            code="MISSING_PARK",
            message="Provide park_code or park_name to plan a new itinerary.",
            field="park_code",
            expected="NPS code (e.g. shen) or full park name",
        )

    if payload.number_of_days is None:
        return validation_error(
            code="MISSING_NUMBER_OF_DAYS",
            message="number_of_days is required for a new itinerary (1–14).",
            field="number_of_days",
            expected="integer between 1 and 14",
        )

    if payload.start_date:
        if not ISO_DATE_RE.match(payload.start_date):
            return validation_error(
                code="INVALID_START_DATE",
                message="start_date must use YYYY-MM-DD format.",
                field="start_date",
                received=payload.start_date,
                expected="YYYY-MM-DD",
            )
        try:
            datetime.strptime(payload.start_date, "%Y-%m-%d")
        except ValueError:
            return validation_error(
                code="INVALID_START_DATE",
                message="start_date must be a valid calendar date in YYYY-MM-DD format.",
                field="start_date",
                received=payload.start_date,
                expected="YYYY-MM-DD",
            )

    if payload.travel_month and payload.start_date:
        return validation_error(
            code="CONFLICTING_DATES",
            message="Provide either start_date or travel_month, not both.",
            field="start_date",
            expected="only one date field",
        )

    if not payload.start_date and not payload.travel_month:
        return validation_error(
            code="MISSING_TRAVEL_DATE",
            message="Provide start_date (YYYY-MM-DD) or travel_month for seasonal planning.",
            field="start_date",
            expected="YYYY-MM-DD or month name such as October",
        )

    if payload.travel_month:
        month = payload.travel_month.strip().lower()
        if month not in MONTH_NAMES and not re.match(r"^\d{4}-\d{2}$", month):
            return validation_error(
                code="INVALID_TRAVEL_MONTH",
                message="travel_month must be a month name (e.g. October) or YYYY-MM.",
                field="travel_month",
                received=payload.travel_month,
                expected="October or 2026-10",
            )

    return None


def build_plan_trip_message(payload: PlanTripInput) -> str:
    """Compose the natural-language user message sent to the anonymous AI endpoint."""
    if payload.revision_request:
        base = payload.revision_request.strip()
        if payload.message:
            return f"{base}\n\nAdditional context: {payload.message.strip()}"
        return base

    park_label = payload.park_name or payload.park_code or "the destination"
    days = payload.number_of_days or 1
    parts = [f"Plan a {days}-day itinerary for {park_label}"]

    if payload.start_date:
        parts.append(f"starting {payload.start_date}")
    elif payload.travel_month:
        parts.append(f"in {payload.travel_month}")

    traveler_bits = []
    if payload.adults:
        traveler_bits.append(f"{payload.adults} adult{'s' if payload.adults != 1 else ''}")
    if payload.children:
        traveler_bits.append(f"{payload.children} child{'ren' if payload.children != 1 else ''}")
    if traveler_bits:
        parts.append(f"for {', '.join(traveler_bits)}")

    if payload.difficulty:
        parts.append(f"with {', '.join(payload.difficulty)} hikes")
    if payload.max_hike_miles is not None:
        miles = (
            int(payload.max_hike_miles)
            if payload.max_hike_miles == int(payload.max_hike_miles)
            else payload.max_hike_miles
        )
        parts.append(f"keeping hikes at or under {miles} miles")
    if payload.interests:
        parts.append(f"focused on {', '.join(payload.interests)}")
    if payload.lodging_area:
        parts.append(f"staying near {payload.lodging_area}")

    prefs = []
    if payload.sunrise:
        prefs.append("sunrise photography")
    if payload.sunset:
        prefs.append("sunset photography")
    if payload.relaxed_afternoon:
        prefs.append("one relaxed afternoon")
    if prefs:
        parts.append(f"with {', '.join(prefs)}")

    if payload.message:
        parts.append(payload.message.strip())

    return ". ".join(parts) + "."


def build_plan_trip_form_data(payload: PlanTripInput) -> dict[str, Any]:
    """Map MCP fields to backend metadata.formData."""
    form: dict[str, Any] = {}

    if payload.number_of_days is not None:
        form["days"] = payload.number_of_days
        form["numDays"] = payload.number_of_days
    if payload.start_date:
        form["startDate"] = payload.start_date
    if payload.travel_month:
        form["travelMonth"] = payload.travel_month
    if payload.adults is not None:
        form["groupSize"] = payload.adults + (payload.children or 0)
        form["adults"] = payload.adults
    if payload.children:
        form["children"] = payload.children
        form["hasKids"] = True
    elif payload.children == 0:
        form["hasKids"] = False
    if payload.difficulty:
        form["fitnessLevel"] = payload.difficulty[0]
        form["difficulty"] = payload.difficulty
    if payload.max_hike_miles is not None:
        form["maxHikeMiles"] = payload.max_hike_miles
    if payload.interests:
        form["interests"] = payload.interests
    if payload.lodging_area:
        form["lodgingArea"] = payload.lodging_area
        form["accommodation"] = "hotel"
    if payload.sunrise:
        form["sunrise"] = True
    if payload.sunset:
        form["sunset"] = True
    if payload.relaxed_afternoon:
        form["relaxedAfternoon"] = True

    return form


def transform_itinerary_days(itinerary: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Preserve accepted days verbatim. Planning belongs to Trailie, not MCP."""
    return deepcopy(itinerary.get("days", [])) if isinstance(itinerary, dict) else []


def slim_plan_trip_structured(structured: dict[str, Any]) -> dict[str, Any]:
    """Machine-readable plan_trip payload when HTML widgets are disabled."""
    session_id = structured.get("sessionId") or structured.get("session_id")
    planner_mode = structured.get("plannerMode") or structured.get("planner_mode")

    slim: dict[str, Any] = {
        "kind": structured.get("kind", "itinerary"),
        "status": structured.get("status", "success"),
    }
    if session_id:
        slim["session_id"] = session_id
        slim["sessionId"] = session_id
    if planner_mode:
        slim["planner_mode"] = planner_mode
        slim["plannerMode"] = planner_mode
    # Slim only presentation chrome. Never slim the planning or mutation contract.
    for key in ("canonicalPlan", "itinerary", "days", "hasItinerary", "park", "error",
                "artifactStatus", "mutationStatus", "mutationIssues", "correctionAttempted",
                "correctionIssues", "replyStatus", "critical_notices", "unverified"):
        if key in structured:
            slim[key] = deepcopy(structured[key])
    return slim


def build_plan_trip_structured(
    *,
    status: str,
    park_code: str,
    park_name: str | None,
    itinerary: dict[str, Any] | None,
    critical_notices: list[str] | None = None,
    unverified: list[str] | None = None,
    session_id: str | None = None,
    live_data_timestamps: dict[str, str] | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    days = transform_itinerary_days(itinerary)
    payload: dict[str, Any] = {
        "status": status,
        "kind": "itinerary",
        "park": {
            "code": park_code or None,
            "name": park_name,
        },
        "critical_notices": critical_notices or [],
        "days": days,
        "unverified": unverified or list(DEFAULT_UNVERIFIED),
        "liveDataTimestamps": live_data_timestamps or {},
    }
    if session_id:
        payload["sessionId"] = session_id
    if extra:
        payload.update(extra)
    return payload


def normalize_difficulty_values(values: list[str] | None) -> list[str] | None:
    if not values:
        return None
    synonyms = {
        "beginner": "easy",
        "low": "easy",
        "intermediate": "moderate",
        "medium": "moderate",
        "hard": "challenging",
        "strenuous": "challenging",
        "advanced": "challenging",
    }
    normalized: list[str] = []
    for raw in values:
        token = raw.strip().lower()
        token = synonyms.get(token, token)
        if token not in DIFFICULTY_VALUES:
            raise ValueError(token)
        if token not in normalized:
            normalized.append(token)
    return normalized or None
