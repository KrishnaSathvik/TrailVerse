# TrailVerse MCP — Golden Eval Set (30 prompts)

Two kinds of checks, kept separate:

- **Tool-level (verified locally, 2026-10-26).** The local MCP server
  (`python -m server.main`, port 8765) pointed at the production API
  (`https://trailverse.onrender.com`, read-only calls only) was driven over
  streamable HTTP with the expected tool + args. `plan_trip` was **never** sent
  to the production planner; only its local validation paths were exercised.
  Resolution of plan_trip destinations was checked with `_resolve_park` against
  production search. Unit/regression coverage is in `tests/test_park_accuracy.py`
  and `tests/test_tool_metadata.py`.
- **Routing (needs manual client testing).** Whether ChatGPT / Claude pick the
  expected tool (or no tool) depends on the host model. Not verifiable here.

Legend for "Locally verifiable?": **Yes** = tool behavior checked;
**Partial** = args/resolution/validation checked but not the planner output;
**No** = routing or planner output only.

## Direct (D)

| ID | Prompt | Expected tool + args | Locally verifiable? | Result |
|---|---|---|---|---|
| D1 | Use TrailVerse to tell me about Glacier | `get_park_details(park_code="Glacier")` → glac | Yes | PASS — "Glacier" resolves to Glacier National Park, not Glacier Bay |
| D2 | TrailVerse: plan 3 days in Zion for a beginner with kids | `plan_trip(park_code="zion", number_of_days=3, children≥1, difficulty=["easy"])` | Partial | Schema documents difficulty enum + 1–14 range; zion resolves. Planner output not run (production). |
| D3 | @TrailVerse compare Zion and Bryce | `compare_parks(["zion","brca"])` | Yes | PASS — "Bryce" → brca, full 2-park table, no partial warning |
| D4 | With TrailVerse, find parks in Utah | `search_parks(state="UT")` | Yes | PASS — state="Utah", limit=5 → Arches, Bryce Canyon, Canyonlands, Capitol Reef, Zion (no historic trail) |
| D5 | TrailVerse ranger programs at Yellowstone | `find_events(park_code="yell")` | Yes | PASS — upcoming-only; currently "No upcoming scheduled events are listed at Yellowstone National Park" (off-season). Previously listed May–June 2026 events as current. |

## Indirect (I)

| ID | Prompt | Expected tool + args | Locally verifiable? | Result |
|---|---|---|---|---|
| I1 | Compare national parks for a family trip in June | `search_parks(query="family")` then `compare_parks` | No (routing) | Tools individually verified (search, compare). Manual. |
| I2 | Where should I go for fall colors in the East? | `search_parks(query="fall color")` | No (routing) | Manual. Note: no "East" region filter exists; model may add state. |
| I3 | Zion or Grand Canyon for a first trip? | `compare_parks(["zion","grca"])` | Partial | "Grand Canyon" → grca (not Parashant) verified via resolver. Routing manual. |
| I4 | Is Yosemite good in late October? | `get_park_details("yose")` | Partial | Tool verified (C1 run). Routing manual. |
| I5 | Dark-sky parks near Las Vegas | `search_parks(query="dark sky", state="NV")` | No (routing) | Manual. No distance/"near" filter exists in search_parks — expect state filter or broader list. |
| I6 | Weekend in San Diego with a day in Joshua Tree | `plan_trip(park_name=…)` | Partial | Free-text name does not force-resolve to a park code (old resolver could guess); planner output manual. |
| I7 | 3-day Valley of Fire State Park trip | `plan_trip(park_name="Valley of Fire State Park", number_of_days=3)`, NOT get_park_details | Partial | PASS (resolution) — classified `non_nps`, plan_trip sends **no** park_code (old resolver sent Valley Forge `vafo`). get_park_details on it returns `NOT_AN_NPS_SITE` pointing to plan_trip. Routing manual. |

## Follow-ups (F)

| ID | Prompt | Expected tool + args | Locally verifiable? | Result |
|---|---|---|---|---|
| F1 | Make day 2 lighter | `plan_trip(session_id=<prev>, revision_request="Make day 2 lighter")` | Partial | PASS — without session_id returns `MISSING_SESSION_ID`. Session reuse covered by existing `test_mcp_followup_keeps_backend_session_authority`. Manual for real follow-up. |
| F2 | Add a sunrise at Canyon Overlook | `plan_trip(session_id, revision_request=…, sunrise=true)` | No | Manual. |
| F3 | OK, plan 2 days at the winner | `plan_trip(park_code="zion", number_of_days=2)` | No | Manual (depends on prior compare). Note compare now only names a lead when one park is strictly less crowded/warmer. |
| F4 | What about campgrounds? | reuse prior result or `get_park_details` | No | Manual. |

## Current data (C)

| ID | Prompt | Expected tool + args | Locally verifiable? | Result |
|---|---|---|---|---|
| C1 | Any alerts at Yosemite right now? | `get_park_details("yose")` | Yes | PASS — alerts section returned (cached ≤30 min). |
| C2 | Weather at Acadia today? | `get_park_details("acad")` | Yes | PASS — "Acadia" → acad (not Maine Acadian Culture). |
| C3 | Is Going-to-the-Sun Road open? | `get_park_details("glac")` | Partial | glac verified (D1). Whether the model maps the road to glac is manual; passing "Going-to-the-Sun Road" as a name returns UNKNOWN_PARK (no guess). |
| C4 | Star parties at Bryce this month? | `find_events(park_code="brca")` | Yes | PASS — "Bryce Canyon" → brca; upcoming events listed (ranger talks Nov 1+). No star party currently listed. |
| C5 | Do I need a permit for Half Dome? | `get_park_details("yose")`; must say lottery | Yes | PASS — Permits section now reads "Half Dome Permits [Permit] — Recreation.gov lists this as a lottery permit" (derived from Recreation.gov text; previously absent). |

## Negative — should NOT call TrailVerse (N)

| ID | Prompt | Expected | Locally verifiable? | Result |
|---|---|---|---|---|
| N1 | Plan a trip to Paris | no call (non-US) | Partial | If called anyway: search_parks("Paris France") → "No National Park Service sites matched" (was Frances Perkins NM). Routing manual. |
| N2 | Book me a flight to Denver | no call | No | Manual. Descriptions say bookings unsupported. |
| N3 | Why am I getting a Python KeyError? | no call | No | Manual. Host instructions no longer claim all outdoor/travel questions or redirect off-topic chat. |
| N4 | Best ramen in Tokyo | no call | No | Manual. |
| N5 | I loved the Zion scene in that movie | no call | No | Manual (mention of a park name without a travel request). |

## Unsupported (U)

| ID | Prompt | Expected | Locally verifiable? | Result |
|---|---|---|---|---|
| U1 | Reserve Upper Pines campground | explain no reservations; optionally get_park_details(yose) for booking link | Partial | Descriptions state reservations unsupported. "Upper Pines" as a park name → UNKNOWN_PARK (old resolver: Upper Delaware river). |
| U2 | Banff road trip | no NPS tools (Canada) | Partial | "Banff" → UNKNOWN_PARK. plan_trip description says US only. Routing manual. |
| U3 | Is the Watchman campground available next week? | explain no availability data | No | Manual. |
| U4 | Plan 20 days in Alaska | plan_trip rejects >14 days | Yes | PASS — `INVALID_NUMBER_OF_DAYS: number_of_days must be between 1 and 14` (schema advertises max 14). |

## Summary

- Locally verified tool-level checks: 19 calls, 19 pass (D1, D3, D4, D5, C1, C2,
  C4, C5, U4, F1-validation, plus regressions: Valley of Fire ×2, zion+brch,
  zion+qqqq, 3-way tie, CA/AZ state, Paris France, bad park code, bad events code).
- Needs manual ChatGPT + Claude testing: all routing rows (I1–I7, F1–F4 real
  follow-ups, N1–N5, U1–U3) and planner output for D2/I6/I7/F1–F3.
