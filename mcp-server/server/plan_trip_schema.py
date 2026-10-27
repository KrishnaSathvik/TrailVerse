"""
Field descriptions for the plan_trip FastMCP tool schema.

FastMCP advertises these via Annotated[..., Field(description=...)] on the tool
function parameters. Rich descriptions reduce malformed ChatGPT tool calls.
"""

PARK_CODE = (
    "NPS park code (e.g. shen, acad, yell). Prefer 4-letter codes. "
    "Required for new itineraries unless park_name is provided."
)

PARK_NAME = (
    "Destination name when there is no NPS code: an NPS site (e.g. Shenandoah National "
    "Park) or any US destination (e.g. Valley of Fire State Park, San Diego). "
    "Required for new itineraries unless park_code is provided."
)

START_DATE = (
    "Trip start date in YYYY-MM-DD format (e.g. 2026-10-15). When the user gives "
    "an exact date, populate this field rather than placing the date only in message."
)

TRAVEL_MONTH = (
    "Month-level travel timing when exact start_date is unknown "
    "(e.g. October or 2026-10). Do not use together with start_date."
)

NUMBER_OF_DAYS = (
    "Trip length in destination days, integer 1–14 (e.g. 3). Required for new "
    "itineraries; trips longer than 14 days are rejected — suggest splitting them."
)

ADULTS = "Number of adult travelers, 1–20 (default 1)."

CHILDREN = "Number of child travelers, 0–20 (default 0). Use 1 or more when kids are coming."

INTERESTS = (
    "Trip interests such as photography, wildlife, scenic-drives, history. "
    "Pass as an array of strings."
)

MAX_HIKE_MILES = "Maximum hike distance in miles for any single hike, 0.1–30 (e.g. 4)."

DIFFICULTY = (
    'Allowed hike difficulties. Array containing one or more of: easy, moderate, challenging. '
    'Example: ["easy", "moderate"]. Synonyms beginner→easy, intermediate→moderate, '
    'strenuous/hard→challenging are accepted. Do not pass hyphenated strings like "easy-to-moderate".'
)

LODGING_AREA = (
    "Preferred lodging town or park entrance (e.g. Luray, Virginia or Thornton Gap)."
)

SUNRISE = "true to include sunrise photography or viewing when practical."

SUNSET = "true to include sunset photography or viewing when practical."

RELAXED_AFTERNOON = "true to keep at least one afternoon lighter with fewer stops."

SESSION_ID = (
    "Session identifier returned by a previous successful plan_trip response "
    "(structured output session_id or [session_id: ...] in text). "
    "Required when revising an existing itinerary."
)

REVISION_REQUEST = (
    "Explicit natural-language changes to apply to the itinerary identified by "
    "session_id (e.g. move the relaxed afternoon to Day 3)."
)

MESSAGE = (
    "Optional extra trip context not covered by structured fields. "
    "Do not put the travel date here — use start_date or travel_month instead."
)

# Legacy aliases — accepted for backward compatibility.
DAYS = "Legacy alias for number_of_days; prefer number_of_days."
GROUP_SIZE = "Legacy alias for adults; prefer adults."
FITNESS_LEVEL = 'Legacy alias for difficulty; prefer difficulty as an array (e.g. ["easy"]).'
HAS_KIDS = "Legacy alias; prefer children when possible."
ACCOMMODATION = "Legacy alias for lodging_area; prefer lodging_area."
