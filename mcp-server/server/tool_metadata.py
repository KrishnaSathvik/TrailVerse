"""
Model-readable tool metadata for the five TrailVerse tools.

Written to the OpenAI Apps SDK metadata guidance: each description starts with
"Use this when…", says when NOT to use the tool, and describes only behavior
the code actually has. No steering ("ALWAYS", "FIRST", "prefer over web
search"), no comparative or promotional claims, no instructions about other
plugins. tests/test_tool_metadata.py guards these rules.

Facts behind the wording (verified in code, 2026-10-26):
- Park data comes from the NPS API + OpenWeather through the TrailVerse backend,
  which caches it: alerts 30 min, weather 30 min, park detail responses 5 min,
  park catalog (fees, hours, activities) 7 days, campground/permit listings up
  to 30 days, events feed 24 h–3 days.
- compare_parks returns a Google Maps route link; it does not compute drive time.
- plan_trip writes the itinerary and messages to an anonymous TrailVerse guest
  session (MongoDB, expires 48 h after last activity).
"""

PLAN_TRIP_DESCRIPTION = (
    "Use this when the user wants a day-by-day itinerary for a trip in the United States, "
    "or wants to change an itinerary that plan_trip already returned in this conversation. "
    "Works for National Park Service sites and for other US destinations (state parks, "
    "cities, road trips); for a non-NPS place pass park_name and omit park_code. "
    "New trips need park_code or park_name plus number_of_days (1–14 days; longer trips "
    "are rejected). To revise, pass the session_id from the previous plan_trip result plus "
    "revision_request. "
    "Do not use for: facts or current conditions about a park (get_park_details), choosing "
    "between named parks (compare_parks), finding parks (search_parks), reservations, "
    "campsite or permit availability, bookings of any kind (not supported), or trips "
    "outside the US. "
    "Each call sends the request to TrailVerse's Trailie planner and saves the itinerary in "
    "a temporary anonymous TrailVerse session (expires 48 hours after last use) so later "
    "revisions can build on it. Returns Trailie's narrative plus the canonical TripPlan "
    "(days, dayparts, stops, road transfers, save state). Present it as returned, without "
    "adding times, drive durations, meals, budgets, or stops."
)

GET_PARK_DETAILS_DESCRIPTION = (
    "Use this when the user asks about one specific National Park Service site: overview, "
    "active alerts and closures, current weather and forecast, entrance fees, operating "
    "hours, activities, campgrounds, or permits (e.g. 'tell me about Glacier', 'is "
    "Going-to-the-Sun Road open?', 'do I need a permit for Half Dome?'). Covers about 470 "
    "NPS units: national parks, monuments, seashores, lakeshores, historic sites, "
    "battlefields, and recreation areas. "
    "Do not use for: state parks, national forests, or other non-NPS places (no data — "
    "plan_trip can still plan a trip there); comparing parks (compare_parks); scheduled "
    "ranger programs (find_events); itineraries (plan_trip); campsite availability or "
    "reservations (not supported — the response links to Recreation.gov). "
    "Data comes from the NPS API and OpenWeather through the TrailVerse backend and is "
    "cached: alerts and weather refresh about every 30 minutes; fees, hours, activities, "
    "campground, and permit listings can be several days old. If the name is unknown or "
    "matches several sites, the tool returns an error listing candidate parks instead of "
    "guessing."
)

GET_PARK_DETAILS_PARK_CODE = (
    "NPS park code or NPS site name. Examples: 'yose', 'glac', 'Zion', "
    "'Glacier National Park', 'Statue of Liberty'. A name must identify one NPS site; "
    "ambiguous names (e.g. 'Canyon') return an error with candidates."
)

COMPARE_PARKS_DESCRIPTION = (
    "Use this when the user is choosing between 2–4 specific NPS sites (e.g. 'Zion or "
    "Bryce?', 'compare Yellowstone, Grand Teton and Glacier'). Returns a side-by-side table "
    "of current temperature, estimated crowd level, entrance fee, top activities, and "
    "state; a note when exactly one park is less crowded or warmer than all the others; "
    "and a Google Maps route link (drive times are not calculated). "
    "Do not use for: a single park (get_park_details), open-ended discovery without named "
    "parks (search_parks), itineraries (plan_trip), or non-NPS places. "
    "Every requested park must match an NPS site: unmatched names are listed in the "
    "result, and if fewer than 2 match the tool returns an error instead of a comparison."
)

COMPARE_PARK_CODES = (
    "2 to 4 NPS park codes or NPS site names. Examples: ['zion', 'brca'], "
    "['Yellowstone', 'Grand Teton', 'Glacier']."
)

SEARCH_PARKS_DESCRIPTION = (
    "Use this when the user wants to find or shortlist NPS sites by state, activity, trait, "
    "or trip style without naming one park (e.g. 'national parks in Utah', 'dark-sky "
    "parks', 'parks for fall color', 'quiet parks for beginners'). Returns a ranked list "
    "from TrailVerse's catalog of about 470 NPS sites: with a text query, results are "
    "ordered by match strength; with only state or activity filters, national parks are "
    "listed first, then monuments and other units. "
    "Do not use for: details about one named park (get_park_details), non-NPS places, or "
    "destinations outside the US. Provide at least one of query, state, or activity; "
    "combine them when the user gives several."
)

SEARCH_QUERY = (
    "Free-text keywords or trip intent matched against NPS site names, descriptions, and "
    "traits. Examples: 'dark sky', 'waterfalls', 'fall color', 'ocean', 'Acadia'. Omit when "
    "filtering only by state or activity."
)

STATE_FILTER = (
    "US state or territory as a two-letter code or full name. Examples: 'UT', 'CA', "
    "'Arizona', 'New Mexico'. Units that span several states match each of them."
)

ACTIVITY_FILTER = (
    "NPS activity name. Examples: 'hiking', 'camping', 'stargazing', 'fishing', 'kayaking'."
)

SEARCH_LIMIT = "Maximum number of parks to return, 1–50. Default 20."

FIND_EVENTS_DESCRIPTION = (
    "Use this when the user asks about scheduled ranger programs, guided tours, talks, "
    "astronomy or star-party nights, Junior Ranger activities, or special events at NPS "
    "sites (e.g. 'ranger programs at Yellowstone', 'star parties at Bryce this month'). "
    "Returns upcoming listings from the NPS events feed (via TrailVerse; the feed is cached "
    "and can be up to a few days old) with dates, times, locations, and registration links "
    "when provided. "
    "Do not use for: general park information, conditions, or closures (get_park_details); "
    "itineraries (plan_trip); registering or booking (not supported). An empty result "
    "means no events are listed, not that the park is closed."
)

EVENTS_PARK_CODE = (
    "Optional NPS park code or site name to filter by. Examples: 'yell', 'Bryce Canyon'. "
    "Unknown or ambiguous names return an error with candidates."
)

EVENTS_CATEGORY = (
    "Optional exact category for TrailVerse-curated events (e.g. 'ranger-program', "
    "'guided-tour', 'festival'). NPS feed events are not filtered by category, so leave "
    "this empty unless the user asks for a specific category."
)

EVENTS_LIMIT = "Maximum number of events to return, 1–20. Default 10."
