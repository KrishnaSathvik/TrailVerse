"""
Typed input/output models for the TrailVerse MCP tools.

Kept deliberately flat — OpenAI's tool schema works best with simple
top-level fields rather than deeply nested objects.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Fitness = Literal["easy", "moderate", "challenging"]
Accommodation = Literal["camping", "hotel", "mixed"]
Persona = Literal["planner", "local"]


# ---------- plan_trip ----------

class PlanTripInput(BaseModel):
    """Input for the plan_trip tool."""

    message: str = Field(
        ...,
        description=(
            "Natural-language request describing the trip. Example: "
            "'Plan 3 days in Zion in May for a beginner with kids'. "
            "Mention the park name somewhere in the message so it can be detected."
        ),
        min_length=3,
        max_length=1000,
    )
    park_code: str | None = Field(
        None,
        description=(
            "Optional 4-letter NPS park code (e.g. 'zion', 'yell', 'grca'). "
            "If omitted, the backend extracts the park from the message."
        ),
    )
    persona: Persona = Field(
        "planner",
        description=(
            "Which AI voice to use. 'planner' (default) produces a structured, "
            "time-blocked itinerary. 'local' gives casual, opinionated insider picks."
        ),
    )
    days: int | None = Field(
        None, ge=1, le=14, description="Trip length in days."
    )
    group_size: int | None = Field(
        None, ge=1, le=20, description="Number of people in the group."
    )
    fitness_level: Fitness | None = Field(
        None, description="Fitness level — affects which trails are recommended."
    )
    has_kids: bool | None = Field(
        None, description="Whether children are in the group (limits stops per day)."
    )
    interests: list[str] | None = Field(
        None,
        description=(
            "Interests like 'hiking', 'photography', 'wildlife', 'history', "
            "'astrophotography', 'family-friendly'."
        ),
        max_length=10,
    )
    accommodation: Accommodation | None = Field(
        None, description="Preferred accommodation style."
    )
    session_id: str | None = Field(
        None,
        description=(
            "Session ID for multi-turn conversation continuity. "
            "Returned in the previous plan_trip response as 'sessionId'. "
            "Pass it back to continue the same conversation (e.g. 'now add day 4'). "
            "Omit for a new trip planning session."
        ),
    )


# ---------- get_park_details ----------

class GetParkDetailsInput(BaseModel):
    park_code: str = Field(
        ...,
        description="NPS park code, typically 4 letters. Examples: 'zion', 'yell', 'grca', 'acad'.",
        min_length=2,
        max_length=10,
        pattern=r"^[a-zA-Z0-9]+$",
    )


# ---------- compare_parks ----------

class ComparePartsInput(BaseModel):
    park_codes: list[str] = Field(
        ...,
        description="2 to 4 NPS park codes to compare side-by-side. Example: ['zion', 'bryc'].",
        min_length=2,
        max_length=4,
    )


# ---------- search_parks ----------

class SearchParksInput(BaseModel):
    query: str | None = Field(
        None,
        description=(
            "Search term matched against park names and descriptions. "
            "Use specific keywords like park names ('Yellowstone'), states ('Utah'), "
            "or features ('canyon', 'coast'). Do NOT pass full natural-language questions."
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
        12, ge=1, le=24, description="Maximum number of parks to return."
    )


# ---------- find_events ----------

class FindEventsInput(BaseModel):
    park_code: str | None = Field(
        None, description="Filter events to a specific park by NPS code."
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
