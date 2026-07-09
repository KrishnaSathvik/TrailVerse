"""
Typed input/output models for the TrailVerse MCP tools.

Kept deliberately flat — OpenAI's tool schema works best with simple
top-level fields rather than deeply nested objects.
"""
from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

DIFFICULTY_VALUES = frozenset({"easy", "moderate", "challenging"})
DIFFICULTY_SYNONYMS = {
    "beginner": "easy",
    "low": "easy",
    "intermediate": "moderate",
    "medium": "moderate",
    "hard": "challenging",
    "strenuous": "challenging",
    "advanced": "challenging",
}


# ---------- plan_trip ----------

class PlanTripInput(BaseModel):
    """Structured input for the plan_trip tool."""

    park_code: str | None = Field(
        None,
        description=(
            "NPS park code (e.g. shen, acad, yell). Prefer 4-letter codes. "
            "Required for new itineraries unless park_name is provided."
        ),
        min_length=2,
        max_length=10,
    )
    park_name: str | None = Field(
        None,
        description=(
            "Full park name when code is unknown (e.g. Shenandoah National Park). "
            "Required for new itineraries unless park_code is provided."
        ),
        min_length=2,
        max_length=80,
    )
    start_date: str | None = Field(
        None,
        description="Trip start date in ISO format YYYY-MM-DD (e.g. 2026-10-15).",
        pattern=r"^\d{4}-\d{2}-\d{2}$",
    )
    travel_month: str | None = Field(
        None,
        description=(
            "Month-level travel timing when exact start_date is unknown "
            "(e.g. October or 2026-10). Do not use with start_date."
        ),
        max_length=20,
    )
    number_of_days: int | None = Field(
        None,
        ge=1,
        le=14,
        description="Trip length in destination days (1–14). Required for new itineraries.",
    )
    adults: int = Field(
        1,
        ge=1,
        le=20,
        description="Number of adult travelers.",
    )
    children: int = Field(
        0,
        ge=0,
        le=20,
        description="Number of child travelers.",
    )
    interests: list[str] | None = Field(
        None,
        description=(
            "Trip interests such as photography, wildlife, scenic-drives, history."
        ),
        max_length=10,
    )
    max_hike_miles: float | None = Field(
        None,
        ge=0.1,
        le=30,
        description="Maximum hike distance in miles for any single hike.",
    )
    difficulty: list[str] | None = Field(
        None,
        description="Allowed hike difficulties: easy, moderate, challenging.",
        max_length=3,
    )
    lodging_area: str | None = Field(
        None,
        description="Preferred lodging town or park entrance (e.g. Luray, Virginia).",
        max_length=80,
    )
    sunrise: bool | None = Field(
        None,
        description="Include sunrise photography or viewing when practical.",
    )
    sunset: bool | None = Field(
        None,
        description="Include sunset photography or viewing when practical.",
    )
    relaxed_afternoon: bool | None = Field(
        None,
        description="Keep at least one afternoon lighter with fewer stops.",
    )
    session_id: str | None = Field(
        None,
        description=(
            "Session ID from a previous plan_trip response. Pass with revision_request "
            "to refine an existing itinerary instead of starting over."
        ),
    )
    revision_request: str | None = Field(
        None,
        description=(
            "Natural-language change request for an existing itinerary "
            "(e.g. 'Make Day 2 a relaxed afternoon'). Requires session_id."
        ),
        max_length=500,
    )
    message: str | None = Field(
        None,
        description="Optional extra trip context not covered by structured fields.",
        max_length=1000,
    )

    # Legacy aliases accepted for backward compatibility during client migration.
    days: int | None = Field(None, ge=1, le=14)
    group_size: int | None = Field(None, ge=1, le=20)
    fitness_level: str | None = Field(None)
    has_kids: bool | None = Field(None)
    accommodation: str | None = Field(None)

    @field_validator("difficulty", mode="before")
    @classmethod
    def _normalize_difficulty(cls, value: list[str] | str | None) -> list[str] | None:
        if value is None:
            return None
        if isinstance(value, str):
            value = [value]
        normalized: list[str] = []
        for raw in value:
            token = DIFFICULTY_SYNONYMS.get(raw.strip().lower(), raw.strip().lower())
            if token not in DIFFICULTY_VALUES:
                raise ValueError(
                    f"difficulty must be one of {sorted(DIFFICULTY_VALUES)}; received {raw!r}"
                )
            if token not in normalized:
                normalized.append(token)
        return normalized

    @field_validator("park_code")
    @classmethod
    def _normalize_park_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip().lower()
        if not re.fullmatch(r"[a-z0-9]{2,10}", cleaned):
            raise ValueError("park_code must be 2–10 alphanumeric characters")
        return cleaned

    @field_validator("start_date")
    @classmethod
    def _validate_start_date(cls, value: str | None) -> str | None:
        if value is None:
            return None
        from datetime import datetime
        try:
            datetime.strptime(value, "%Y-%m-%d")
        except ValueError as exc:
            raise ValueError("start_date must be a valid calendar date in YYYY-MM-DD format") from exc
        return value

    @model_validator(mode="before")
    @classmethod
    def _apply_legacy_fields(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        merged = dict(data)
        if merged.get("number_of_days") is None and merged.get("days") is not None:
            merged["number_of_days"] = merged["days"]
        if merged.get("adults", 1) == 1 and merged.get("group_size") is not None:
            merged["adults"] = merged["group_size"]
        if merged.get("difficulty") is None and merged.get("fitness_level"):
            merged["difficulty"] = [merged["fitness_level"]]
        if merged.get("children", 0) == 0 and merged.get("has_kids"):
            merged["children"] = 1
        if merged.get("lodging_area") is None and merged.get("accommodation"):
            merged["lodging_area"] = merged["accommodation"]
        return merged


# ---------- get_park_details ----------

class GetParkDetailsInput(BaseModel):
    park_code: str = Field(
        ...,
        description=(
            "Park name or NPS park code. Examples: 'Yellowstone', 'yell', "
            "'Grand Canyon', 'grca', 'Zion', 'zion', 'Acadia', 'acad'. "
            "Full park names are resolved automatically."
        ),
        min_length=2,
        max_length=60,
    )


# ---------- compare_parks ----------

class CompareParksInput(BaseModel):
    park_codes: list[str] = Field(
        ...,
        description=(
            "2 to 4 park names or NPS codes to compare side-by-side. "
            "Example: ['Zion', 'Grand Canyon'] or ['zion', 'grca']. "
            "Full park names are resolved automatically."
        ),
        min_length=2,
        max_length=4,
    )


# ---------- search_parks ----------

class SearchParksInput(BaseModel):
    query: str | None = Field(
        None,
        description=(
            "Search term matched against park names and descriptions. "
            "Accepts park names, keywords, activities, or natural-language travel intent "
            "such as 'relaxing ocean parks', 'easy hikes with waterfalls', or "
            "'parks for photography'."
        ),
        max_length=100,
    )
    state: str | None = Field(
        None,
        description="Two-letter US state code (e.g. 'UT', 'CA', 'WY') to filter by state.",
        min_length=2,
        max_length=2,
    )
    activity: str | None = Field(
        None,
        description="Filter by activity. Examples: 'hiking', 'camping', 'stargazing', 'fishing'.",
        max_length=40,
    )
    limit: int = Field(
        20, ge=1, le=50, description="Maximum number of parks to return. Default 20."
    )


# ---------- find_events ----------

class FindEventsInput(BaseModel):
    park_code: str | None = Field(
        None, description="Filter events to a specific park by name or NPS code. Example: 'Yellowstone' or 'yell'."
    )
    state: str | None = Field(
        None, description="Two-letter US state code to filter events.",
        min_length=2, max_length=2,
    )
    category: str | None = Field(
        None,
        description="Event category like 'ranger-program', 'guided-tour', 'festival'.",
    )
    limit: int = Field(
        10, ge=1, le=20, description="Maximum number of events to return."
    )
