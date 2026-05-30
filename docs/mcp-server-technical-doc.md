# TrailVerse MCP Server — Technical Documentation

## Overview

The TrailVerse MCP (Model Context Protocol) server is a Python service that exposes 5 read-only tools wrapping the TrailVerse Express backend. It allows AI assistants like ChatGPT and Claude to access real-time National Park Service data — weather, alerts, campgrounds, permits, events, and AI-powered trip planning — through a standardized protocol.

The server covers all **470+ NPS sites**: not just the 63 national parks, but also national monuments, seashores, lakeshores, recreation areas, historic sites, battlefields, memorials, and preserves.

**Live deployment:** `https://trailverse-mcp.onrender.com`
**MCP endpoint:** `https://trailverse-mcp.onrender.com/mcp`
**Health check:** `https://trailverse-mcp.onrender.com/health`

---

## Architecture

```
┌──────────────┐     MCP (JSON/HTTP)     ┌──────────────────┐     REST      ┌──────────────────────┐
│  ChatGPT /   │ ──────────────────────> │  TrailVerse MCP  │ ──────────> │  TrailVerse Express  │
│  Claude      │ <────────────────────── │  (Python/FastMCP) │ <────────── │  Backend (Node.js)   │
│              │  structuredContent +    │  Port 8000       │             │  Port 5001 / Render  │
│              │  text + images          │                  │             │                      │
└──────────────┘                         └──────────────────┘             └──────────┬───────────┘
                                              │                                      │
                                              │ SSRF-safe image fetch                │
                                              │ (nps.gov, unsplash, wikimedia)       │
                                              ▼                                      ▼
                                         ┌──────────┐                    ┌─────────────────────┐
                                         │  Pillow   │                   │  NPS API / Weather   │
                                         │  resize   │                   │  Recreation.gov      │
                                         └──────────┘                   │  OpenAI / Claude     │
                                                                         │  MongoDB             │
                                                                         └─────────────────────┘
```

### Design Principles

1. **Thin adapter** — The MCP server is stateless (except in-memory conversation cache). All data and business logic lives in the Express backend.
2. **Dual output** — Every tool returns both `structuredContent` (JSON for ChatGPT widget rendering) and `text` (rich Markdown for Claude and LLMs without widget support).
3. **Graceful degradation** — Sub-API failures (alerts, weather, campgrounds, permits, editorial feed) never break the core response. Each is wrapped in a `_safe_*` async call.
4. **Defense-in-depth rate limiting** — MCP-side global fuse + backend bypass key + per-session limits.
5. **SSRF prevention** — Image fetching only from whitelisted domains (nps.gov, unsplash.com, wikimedia.org).

---

## Tech Stack

| Component | Technology |
|---|---|
| Framework | FastMCP (Python MCP SDK) |
| Transport | Streamable HTTP (JSON responses, not SSE) |
| ASGI Server | Uvicorn |
| HTTP Client | httpx (async, connection pooling) |
| Validation | Pydantic v2 |
| Image Processing | Pillow |
| Runtime | Python 3.12.7 |
| Hosting | Render.com (Starter plan, Oregon region) |

### Dependencies (`requirements.txt`)

```
mcp[cli]>=1.2.0
fastmcp>=3.2.0
httpx>=0.27.0
pydantic>=2.6.0
python-dotenv>=1.0.0
uvicorn>=0.30.0
starlette>=0.37.0
Pillow>=10.0.0
```

---

## Directory Structure

```
mcp-server/
├── server/
│   ├── __init__.py
│   ├── main.py              # FastMCP server, 5 tools, widget resources, custom routes
│   ├── client.py             # Async HTTP client for TrailVerse backend + image fetching
│   ├── formatters.py         # Response formatting (structuredContent + text) for all 5 tools
│   ├── conversations.py      # In-memory multi-turn session management
│   ├── types.py              # Pydantic input schemas (flat, OpenAI-compatible)
│   └── rate_limit.py         # Global rate limiting (token bucket, async-safe)
├── widgets/
│   ├── itinerary.html        # Trip plan widget (day blocks, confidence pill, plan score)
│   ├── park-details.html     # Park detail widget (hero image, weather, alerts, activities)
│   ├── compare.html          # Side-by-side comparison table widget
│   ├── park-list.html        # Search results grid widget
│   └── events.html           # Events list widget
├── static/
│   ├── icon.svg              # MCP server icon (SVG)
│   └── icon-512.png          # MCP server icon (512px PNG)
├── scripts/
│   ├── test_local.py         # Smoke-test all 5 tools locally
│   ├── generate_previews.py  # Generate HTML widget previews
│   └── build_widgets.py      # Widget builder utility
├── docs/
│   ├── SUBMISSION_CHECKLIST.md  # OpenAI App Directory submission guide
│   ├── BACKEND_CHANGES.md       # Required backend middleware (~10 lines)
│   └── QUICK_REFERENCE.md       # Tool quick reference
├── render.yaml               # Render.com deployment blueprint
├── requirements.txt          # Python dependencies
├── .env.example              # Environment variable template
└── README.md                 # Project README
```

---

## The 5 Tools

### 1. `plan_trip` — AI-Powered Trip Itinerary

Builds a day-by-day itinerary for any US trip destination. Works for national parks, state parks, cities, road trips, or mixed destinations.

**When the LLM should call it:**
- "Plan 3 days in Zion"
- "Weekend trip to San Diego"
- "Road trip from LA to Vegas"
- "What should I do at Yellowstone for 2 days?"
- "I'm visiting Yosemite next week"

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `message` | string (3-1000 chars) | Yes | Natural language trip request |
| `park_code` | string | No | NPS park code (e.g., "zion"); auto-resolved from message |
| `persona` | "planner" \| "local" | No | AI voice: "planner" = structured (GPT), "local" = casual (Claude) |
| `days` | int (1-14) | No | Trip length |
| `group_size` | int (1-20) | No | Number of travelers |
| `fitness_level` | "easy" \| "moderate" \| "challenging" | No | Affects trail recommendations |
| `has_kids` | bool | No | Limits stops per day, flags kid-friendly trails |
| `interests` | list[string] | No | e.g., ["hiking", "photography", "wildlife"] |
| `accommodation` | "camping" \| "hotel" \| "mixed" | No | Lodging preference |
| `session_id` | string | No | For multi-turn conversation continuity |

**Backend endpoint:** `POST /api/ai/chat-anonymous`

**How it works:**
1. Validates input with Pydantic
2. Resolves park name to NPS code if needed (via search API)
3. Manages conversation continuity — retrieves or creates a session, appends the user message
4. Calls the Express backend anonymous AI planner with conversation history
5. Backend auto-routes to OpenAI (structured itineraries) or Claude (casual responses) based on the `persona` parameter
6. Formats the response into widget JSON + Markdown text
7. Fetches hero image (base64, SSRF-safe) for inline rendering in Claude
8. Appends Google Maps direction links per itinerary day
9. Returns `sessionId` in structured content for follow-up turns

**Rate limit:** 120 calls/60s (global MCP fuse — plan_trip bucket)

**Multi-turn conversation:**
- Session IDs follow the format `mcp-<24 random bytes>`
- 20-message window with auto-summarization of older messages
- Summarization extracts key context: park name, dates, group size, budget, interests, accommodation
- Sessions expire after 2 hours; max 1000 concurrent sessions (LRU eviction)
- Data loss on restart is acceptable — backend has MongoDB copy

---

### 2. `get_park_details` — Real-Time Park Information

Returns live data for any of the 470+ NPS sites: current weather, alerts, campgrounds, permits, fees, hours, and activities.

**When the LLM should call it:**
- Any time a user mentions a specific NPS site by name — even for general queries like "tell me about Glacier"
- Weather, conditions, alerts, closures, road status, fees, hours, best time to visit, what to pack, camping info, permit questions

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `park_code` | string (2-60 chars) | Yes | Park name or NPS code (e.g., "Yellowstone", "yell", "Grand Canyon", "grca") |

**Backend endpoints (all called in parallel with graceful degradation):**

| Endpoint | Data | Failure behavior |
|---|---|---|
| `GET /api/parks/{code}/details` | Core park info (name, description, fees, hours, activities, images) | **Fatal** — if this fails, tool returns error |
| `GET /api/parks/{code}/alerts` | NPS alerts, road closures | Non-fatal — omitted if fails |
| `GET /api/parks/{code}/weather` | Current weather + 5-day forecast or seasonal temps | Non-fatal — shows "unavailable" message |
| `GET /api/parks/{code}/campgrounds` | Campground data from NPS API | Non-fatal — section omitted |
| `GET /api/parks/{code}/permits` | Timed-entry, backcountry permits from Recreation.gov | Non-fatal — section omitted |
| `GET /api/feed/park-of-day` | Editorial insight (insider tip) | Non-fatal — section omitted |

**Response sections (text output):**
1. Park name + state
2. Alerts & closures (high-priority flagged with ⚠️)
3. Current weather (exact temp, conditions, humidity, wind, UV)
4. 5-day forecast or seasonal temps
5. Crowd level (from editorial feed)
6. Park description
7. Activities
8. Entrance fees
9. Operating hours
10. Campgrounds (top 5 by size, with fees and Recreation.gov booking links)
11. Permits & reservations (with timed-entry status warnings)
12. Getting there (Google Maps link + directions info)
13. Insider tip (from editorial feed)
14. TrailVerse links
15. Section checklist manifest (tells LLM which sections were provided)

**Rate limit:** 300 calls/60s (global MCP fuse — read bucket)

---

### 3. `compare_parks` — Side-by-Side Comparison

Compares 2-4 NPS sites on current weather, crowd levels, entrance fees, top activities, and driving distance.

**When the LLM should call it:**
- "Zion or Grand Canyon?"
- "Should I go to Glacier or Yellowstone?"
- "Which is better for families, Acadia or Shenandoah?"

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `park_codes` | list[string] (2-4 items) | Yes | Park names or NPS codes to compare |

**Backend endpoints:**
- `POST /api/parks/compare` — Comparison data for all parks
- `POST /api/parks/compare/summary` — Decision recommendation + highlights (non-fatal on failure)

**Response sections (text output):**
1. Decision lead — winner with reasoning ("Go with Zion.")
2. Comparison table (temp, crowds, entry fee, top activities, location)
3. Driving directions (Google Maps link between parks)
4. The Verdict (best-if-you-want for each park)
5. Shared highlights
6. TrailVerse compare page + road trip planning links

**Rate limit:** 300 calls/60s (read bucket)

---

### 4. `search_parks` — Search/Filter NPS Sites

Searches all 470+ NPS sites by keyword, state, or activity.

**When the LLM should call it:**
- "Parks in Utah"
- "Best parks for stargazing"
- "Least crowded parks"
- "Parks near Denver"
- "Where should I go?" / "Suggest parks for hiking"

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string (max 100 chars) | No* | Keyword (park name, feature, etc.) |
| `state` | string (2 chars) | No* | Two-letter US state code (e.g., "UT") |
| `activity` | string (max 40 chars) | No* | Activity filter (e.g., "hiking", "stargazing") |
| `limit` | int (1-50) | No | Max results (default: 20) |

*At least one of `query`, `state`, or `activity` is required.

**Backend endpoint:** `GET /api/parks/search?q=...&state=...&activity=...&limit=...`

**Response sections (text output):**
1. Top 3 picks (name, state, summary, TrailVerse detail link, Google Maps link)
2. Also worth a look (remaining parks)
3. TrailVerse explore-all footer link

Results are sorted with outdoor designations (National Parks, Recreation Areas, Seashores, Monuments) prioritized over historic trails/sites.

**Rate limit:** 300 calls/60s (read bucket)

---

### 5. `find_events` — Ranger Programs & Park Events

Returns upcoming ranger-led programs, guided tours, star parties, junior ranger activities, and special events with live dates, times, and locations.

**When the LLM should call it:**
- "Ranger talks at Yellowstone this weekend"
- "Star parties at Bryce Canyon"
- "Guided tours at Mesa Verde"
- "Events at Gettysburg"

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `park_code` | string | No | Filter to specific park |
| `state` | string (2 chars) | No | Two-letter state code |
| `category` | string | No | "ranger-program", "guided-tour", "festival" |
| `limit` | int (1-20) | No | Max events (default: 10) |

**Backend endpoint:** `GET /api/events/?parkCode=...&stateCode=...&category=...&limit=...`

**Response sections (text output):**
1. Ongoing Programs (recurring daily/weekly with date range)
2. One-time events (grouped by date)
3. For each event: title, free/paid tag, time, location (Google Maps link), registration URL
4. TrailVerse browse-all events link

**Rate limit:** 300 calls/60s (read bucket)

---

## Park Code Resolution

The MCP server accepts both park codes (e.g., "zion") and full park names (e.g., "Zion National Park"). Resolution logic in `_resolve_park_code()`:

1. If input is ≤4 alphanumeric chars and not a common English word (e.g., "utah", "mesa", "bend", "park", "lake", "cave", "reef", "arch"), treat it as a park code directly
2. Otherwise, search the backend (`GET /api/parks/search`) with the input
3. Score results: prefer shortest name that starts with the query (e.g., "Glacier National Park" over "Glacier Bay National Park and Preserve")
4. Fall back to first search result if no startsWith match

---

## Widget System (ChatGPT Inline Rendering)

Each tool has an associated HTML widget registered as an MCP resource with MIME type `text/html+skybridge` (MCP Apps UI standard). ChatGPT renders these inline in the conversation.

| Tool | Widget File | Resource URI |
|---|---|---|
| plan_trip | itinerary.html | `ui://widget/itinerary.html` |
| get_park_details | park-details.html | `ui://widget/park-details.html` |
| compare_parks | compare.html | `ui://widget/compare.html` |
| search_parks | park-list.html | `ui://widget/park-list.html` |
| find_events | events.html | `ui://widget/events.html` |

Widgets receive data via the MCP Apps bridge (structuredContent JSON) and render as visual cards inside ChatGPT conversations. Claude and other LLMs without widget support receive the rich Markdown text instead.

### Tool invocation metadata

Each tool result includes `_meta` with:
- `ui.resourceUri` — which widget template to render
- `openai/outputTemplate` — same URI (OpenAI SDK convention)
- `openai/toolInvocation/invoking` — progress text shown while tool runs (e.g., "Looking up ZION on the National Park Service...")
- `openai/toolInvocation/invoked` — completion text (e.g., "Park details ready")
- `openai/widgetAccessible` — indicates the widget is ready for rendering

---

## Response Formatting (`formatters.py`)

Each tool has a dedicated formatter that converts raw backend JSON into a `(structured_content_dict, text_for_llm)` tuple.

### Key formatting features:

**Dual output:**
- `structuredContent` — JSON matching the widget's expected schema (ChatGPT renders this)
- `text` — Rich Markdown in the Trailie persona voice (Claude and widget-less LLMs use this)

**Image handling:**
- Extracts hero images from park data
- Downloads, resizes to 600px wide (Pillow), JPEG compresses to ~30-80KB
- Returns as base64-encoded `ImageContent` blocks in the MCP response
- SSRF-safe: only fetches from `nps.gov`, `unsplash.com`, `wikimedia.org`
- Max download size: 15MB

**Data integrity manifest:**
- Appends a section checklist to text output: `Sections provided: [alerts] [weather] [5-day forecast] [campgrounds] [permits] [Google Maps] — include every one.`
- Prevents the LLM from summarizing away critical sections

**Relay instruction:**
- Every tool output ends with: "Include EVERY section in your response — do not summarize, skip, or collapse any section. Preserve all links, numbers, fees, and weather data exactly as shown."

**Trailing offer removal:**
- Regex strips "Want me to...?", "Should I...?", "Let me know if..." from backend AI responses
- Prevents ChatGPT from interpreting these as tool call triggers

**Google Maps integration:**
- Single points: `_google_maps_point_url(lat, lng, name)`
- Multi-point directions: `_google_maps_directions_url(parks)`
- Day-by-day itinerary stops: `_build_day_maps_url(stops)`
- Event locations: formatted with short name + park context

**Alert prioritization:**
- Keywords: closure, closed, fire, flood, permit required, danger, warning, hazard, restricted, evacuation, avalanche, rescue
- High-priority alerts sorted to top, flagged with ⚠️
- Lower-priority alerts collapsed to count

**Timed-entry caution:**
- Timed-entry listings from Recreation.gov are flagged with `STATUS UNKNOWN`
- Warning text explains that many parks dropped timed entry for 2026
- Tells LLM to say "check Recreation.gov" instead of asserting it's required

---

## Conversation Management (`conversations.py`)

In-memory session store for multi-turn `plan_trip` conversations.

```python
Conversation = {
    session_id: str,          # "mcp-<24 random bytes>"
    anonymous_id: str,        # stable identity for backend session lookup
    messages: list[dict],     # [{role: "user"|"assistant"|"system", content: str}]
    created_at: float,
    last_active: float,
}
```

### Behavior:

| Feature | Detail |
|---|---|
| Session ID format | `mcp-<24 random bytes>` (cryptographically random via `secrets.token_urlsafe`) |
| Max session age | 2 hours (lazy pruning on each access) |
| Max concurrent sessions | 1000 (LRU eviction when full) |
| Max messages per session | 20 |
| Auto-summarization | When >20 messages, older messages are summarized into a `[CONVERSATION CONTEXT]` system message keeping the last 15 verbatim |

### Summarization extracts:
- Park name (regex: "going to / visiting / trip to / plan for")
- Travel dates
- Group size
- Budget
- Interests (hiking, camping, photography, stargazing, etc.)
- Accommodation preference

Only user messages are summarized — assistant messages are excluded to avoid self-reinforcing hallucination loops.

**Data loss on restart is acceptable** — the Express backend has a MongoDB copy of sessions. Worst case: user gets a fresh session.

---

## Rate Limiting (`rate_limit.py`)

Defense-in-depth rate limiting at the MCP server level, independent of backend limits.

### Two separate buckets:

| Bucket | Default Limit | Purpose |
|---|---|---|
| `plan_trip` | 120 calls / 60s | Expensive (hits Claude/GPT for AI generation) |
| `read` | 300 calls / 60s | Cheap (cached NPS data) |

### Implementation:
- Fixed-window token bucket using `collections.deque` of timestamps
- Async-safe with `asyncio.Lock`
- Returns `(allowed: bool, retry_after: float)` — if denied, `retry_after` says when the oldest hit expires

### Configurable via environment:
```
MCP_PLAN_TRIP_LIMIT=120
MCP_PLAN_TRIP_WINDOW=60
MCP_READ_LIMIT=300
MCP_READ_WINDOW=60
```

### Why this exists:
This is NOT a per-user limit (ChatGPT doesn't expose a stable per-user identifier in anonymous tool calls). It's a **global fuse** that caps total MCP → backend throughput. If the `MCP_BYPASS_KEY` ever leaks, this prevents unlimited traffic from hitting the backend.

---

## HTTP Client (`client.py`)

Async HTTP wrapper using httpx with connection pooling.

### Configuration:

| Setting | Default | Env Var |
|---|---|---|
| Base URL | `https://trailverse.onrender.com` | `TRAILVERSE_API_BASE` |
| Timeout | 120s | `BACKEND_TIMEOUT` |
| User-Agent | `TrailVerse-MCP/1.0` | `BACKEND_USER_AGENT` |
| Max connections | 50 | — |
| Max keepalive | 20 | — |

### MCP Bypass Key:
All requests include `X-TrailVerse-MCP-Key` header if `MCP_BYPASS_KEY` is set. The Express backend checks this header to bypass the anonymous 60 req/15min rate limit. Without it, all ChatGPT traffic through the MCP server would self-DOS almost immediately.

### Park Code Validation:
Every park code is validated before being used in a URL path — must be alphanumeric, max 10 chars. URL-quoted to prevent path traversal.

### Error Handling:
- 429 → "Rate limit exceeded, please try again later"
- 5xx → "Backend service temporarily unavailable"
- Network error → "Backend service unreachable"

### Image Fetching (SSRF-safe):

```python
ALLOWED_IMAGE_HOSTS = {
    "www.nps.gov", "nps.gov", "home.nps.gov",
    "npgallery.nps.gov", "developer.nps.gov",
    "upload.wikimedia.org", "images.unsplash.com",
}
```

- Only fetches from whitelisted domains
- Scheme must be http or https
- Max download: 15MB
- Resize to 600px wide (Pillow LANCZOS)
- Convert to RGB JPEG at 75% quality
- Return as base64-encoded MCP `ImageContent`
- Redirects disabled (`follow_redirects=False`)
- 10s timeout per image

---

## Input Validation (`types.py`)

Pydantic v2 models with flat structure (OpenAI's tool schema works best with simple top-level fields, not nested objects).

| Model | Key Validations |
|---|---|
| `PlanTripInput` | message: 3-1000 chars; days: 1-14; group_size: 1-20; interests: max 10 items |
| `GetParkDetailsInput` | park_code: 2-60 chars |
| `CompareParksInput` | park_codes: 2-4 items |
| `SearchParksInput` | query: max 100 chars; state: exactly 2 chars; activity: max 40 chars; limit: 1-50 |
| `FindEventsInput` | state: 2 chars; limit: 1-20 |

---

## System Instructions (Trailie Persona)

The MCP server includes ~150 lines of instructions that shape how ChatGPT/Claude respond when using the tools. These are set in `FastMCP(instructions=...)`.

### Key directives:

**Identity:** "Trailie" — an opinionated, experienced travel buddy who knows every park.

**Voice rules:**
- Use contractions, direct address
- Be opinionated: "Skip the South Rim tourist trap — Lipan Point at sunrise is the real deal."
- Concrete over abstract: "4-hour drive" not "a manageable distance"
- Tell what to SKIP as much as what to DO
- Honest about downsides
- No fluff, no trailing offers ("Want me to...?")

**Live data rules:**
- Tool data OVERRIDES training knowledge
- Always cite actual numbers (temp, humidity, wind, UV)
- Surface alerts/closures prominently
- Never invent URLs, permit windows, reservation dates, or seasonal date ranges
- If data is missing, say "check NPS.gov"

**Decision authority (comparisons):**
- First sentence must be the pick: "Go with [X]"
- Never open neutral ("both are great", "it depends")
- Priority: SAFETY → FEASIBILITY → TIME → FITNESS → BUDGET → PREFERENCE

**Constraint correction:**
- Flag physically impossible plans (Going-to-the-Sun Road in March)
- Flag unrealistic timelines (5 major hikes in one day)
- Never plan around known closures

**Trail details (mandatory):**
- Every trail mention must include: distance (mi RT), elevation gain (ft), estimated time, difficulty rating
- Format: "**Angels Landing** — 5.4mi RT, 1,488ft gain, ~4hr, Strenuous (exposed chains section)"

**Linking (mandatory):**
- Every response must end with a TrailVerse link
- Park page: `https://www.nationalparksexplorerusa.com/parks/{parkCode}`
- Trip planner: `https://www.nationalparksexplorerusa.com/plan-ai`
- Compare: `https://www.nationalparksexplorerusa.com/compare?parks={code1},{code2}`

---

## Custom Routes

Beyond the MCP protocol endpoint, the server exposes:

| Route | Method | Purpose |
|---|---|---|
| `/` | GET | Landing page ("TrailVerse MCP server is running") |
| `/health` | GET | Health check: `{"status": "ok", "service": "trailverse-mcp"}` |
| `/mcp` | GET | MCP protocol endpoint (auto-registered by FastMCP) |
| `/icon.svg` | GET | Server icon (SVG) |
| `/icon-512.png` | GET | Server icon (512px PNG) |
| `/favicon.ico` | GET | Favicon (serves icon-512.png) |
| `/.well-known/openai-apps-challenge` | GET | OpenAI App Directory verification token |

---

## Deployment

### Render.com Blueprint (`render.yaml`)

```yaml
Service: trailverse-mcp
Type: Web service (Python)
Plan: Starter (~$7/mo) or Free (cold starts)
Region: Oregon (close to TrailVerse backend)
Build: pip install -r requirements.txt
Start: python -m server.main
Health check: /health
Auto-deploy: on git push to master
Root directory: mcp-server/
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TRAILVERSE_API_BASE` | Yes | Backend URL (e.g., `https://trailverse.onrender.com`) |
| `MCP_SERVER_BASE` | Yes | This server's public URL (e.g., `https://trailverse-mcp.onrender.com`) |
| `TRAILVERSE_WEB_BASE` | Yes | Website URL for links (e.g., `https://www.nationalparksexplorerusa.com`) |
| `PORT` | No | Default: 8000 |
| `BACKEND_TIMEOUT` | No | Default: 120 (seconds) |
| `BACKEND_USER_AGENT` | No | Default: `TrailVerse-MCP/1.0` |
| `LOG_LEVEL` | No | Default: INFO |
| `MCP_BYPASS_KEY` | **Critical** | Shared secret with Express backend. Set manually, never committed. |
| `OPENAI_VERIFICATION_TOKEN` | For submission | OpenAI App Directory verification |
| `MCP_PLAN_TRIP_LIMIT` | No | Default: 120 |
| `MCP_PLAN_TRIP_WINDOW` | No | Default: 60 (seconds) |
| `MCP_READ_LIMIT` | No | Default: 300 |
| `MCP_READ_WINDOW` | No | Default: 60 (seconds) |

### Critical: MCP Bypass Key

The `MCP_BYPASS_KEY` must be set to the same value on both the MCP server and the Express backend. The Express backend checks the `X-TrailVerse-MCP-Key` header to bypass the anonymous 60 req/15min rate limit.

**Without it:** All ChatGPT traffic flows through a single MCP server IP, hitting the anonymous rate limit almost immediately. The app self-DOSes at any scale.

**Generate a key:**
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### Backend Middleware Required

The Express backend needs ~10 lines of middleware to check the MCP bypass key header. See `mcp-server/docs/BACKEND_CHANGES.md` for the exact code.

---

## Security

### SSRF Prevention
- Image fetching restricted to whitelisted domains only
- URL scheme must be http/https
- `follow_redirects=False` on image downloads
- Max download size: 15MB

### Path Traversal Prevention
- All park codes validated: alphanumeric only, max 10 chars
- URL-quoted before use in path segments

### Rate Limiting (3 layers)
1. **MCP-side global fuse** — 120/min for plan_trip, 300/min for reads
2. **Backend bypass key** — MCP traffic skips anonymous rate limit
3. **Backend per-session limits** — 5 messages/48h per anonymous session (in MongoDB)

### No Authentication Required
All 5 tools are read-only and use public NPS data. The AI planner uses the anonymous endpoint (5 msg/48h per IP). No OAuth or API keys needed from users.

### Input Sanitization
- Pydantic validation on all inputs
- HTML tag stripping on event descriptions
- Park code validation prevents injection

### Log Sanitization
- Error messages logged without user PII
- Bypass key never logged

---

## Tool Annotations

All tools include MCP annotations for client introspection:

```python
annotations={
    "title": "Human-readable tool name",
    "readOnlyHint": True,      # All tools are read-only
    "openWorldHint": True,      # Tools access external APIs
    "idempotentHint": True/False,  # plan_trip is not idempotent (AI responses vary)
}
```

---

## Data Flow Examples

### Example 1: "Tell me about Zion"

```
User → ChatGPT → MCP: get_park_details(park_code="Zion")
                  │
                  ├─ _resolve_park_code("Zion") → "zion"
                  │
                  ├─ Parallel backend calls:
                  │   ├─ GET /api/parks/zion/details     ✓ (core — required)
                  │   ├─ GET /api/parks/zion/alerts       ✓ (non-fatal)
                  │   ├─ GET /api/parks/zion/weather       ✓ (non-fatal)
                  │   ├─ GET /api/parks/zion/campgrounds   ✓ (non-fatal)
                  │   ├─ GET /api/parks/zion/permits        ✓ (non-fatal)
                  │   └─ GET /api/feed/park-of-day?parkCode=zion ✓ (non-fatal)
                  │
                  ├─ format_park_details() → (structuredContent, text)
                  │
                  ├─ fetch_image_as_base64(hero_url) → base64 JPEG
                  │
                  └─ Return: CallToolResult {
                       content: [ImageContent(hero), TextContent(markdown)],
                       structuredContent: { kind: "park_details", ... },
                       _meta: { ui, invoking/invoked text }
                     }

ChatGPT renders → park-details.html widget (or Claude uses the markdown text)
```

### Example 2: Multi-turn trip planning

```
Turn 1: "Plan 3 days in Yellowstone"
  MCP: plan_trip(message="Plan 3 days in Yellowstone")
  → Creates session mcp-abc123
  → Backend returns structured itinerary
  → Response includes sessionId: "mcp-abc123"

Turn 2: "Add a day at Grand Teton"
  MCP: plan_trip(message="Add a day at Grand Teton", session_id="mcp-abc123")
  → Retrieves session mcp-abc123 (has previous messages)
  → Appends new message to conversation
  → Backend receives full history → generates Day 4
  → Response continues with same sessionId
```

---

## OpenAI App Directory Submission

The server is designed for submission to the OpenAI App Directory. Key submission details are in `mcp-server/docs/SUBMISSION_CHECKLIST.md`:

- **Category:** Travel & Tourism
- **Auth:** None (public read-only tools)
- **Privacy:** No PII collected; data sent to TrailVerse backend, OpenAI, and Anthropic for AI generation
- **Safety:** Age-appropriate, AI moderation, hallucination mitigation via live data + data integrity manifests
- **Commerce:** No digital goods (5 msg/48h is a rate limit, not a paywall)
- **Verification:** `/.well-known/openai-apps-challenge` endpoint serves the verification token

---

## Local Development

### Setup
```bash
cd mcp-server
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your TRAILVERSE_API_BASE, etc.
```

### Run
```bash
python -m server.main
# Server starts on http://localhost:8000
# MCP endpoint: http://localhost:8000/mcp
# Health check: http://localhost:8000/health
```

### Test
```bash
python scripts/test_local.py
# Smoke-tests all 5 tools against the backend
```

### Using with Claude Desktop
Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "trailverse": {
      "url": "http://localhost:8000/mcp"
    }
  }
}
```

---

## Key Architectural Decisions

1. **Why a separate Python MCP server instead of adding MCP to the Express backend?**
   - FastMCP (Python) is the most mature MCP SDK with built-in widget resource support
   - Separation of concerns: Express handles data + AI, MCP handles protocol + formatting
   - Independent scaling and deployment

2. **Why dual output (structuredContent + text)?**
   - ChatGPT renders widgets from structuredContent; Claude uses the text
   - Text includes section checklists that prevent the LLM from dropping data

3. **Why in-memory conversation store instead of a database?**
   - MCP server is stateless by design — the backend has MongoDB for persistence
   - In-memory is simpler, faster, and acceptable loss on restart
   - 2-hour expiry + 1000-session cap keeps memory bounded

4. **Why module-level rate limiting instead of per-user?**
   - ChatGPT doesn't expose stable per-user identifiers in anonymous tool calls
   - Global fuse is defense-in-depth against bypass key leakage
   - Per-session limits are handled by the backend

5. **Why SSRF-safe image fetching?**
   - NPS serves 5-10MB full-res photos; MCP responses need to be small
   - Untrusted URLs could be used for SSRF attacks against internal services
   - Whitelist + resize + compress keeps responses at ~30-80KB per image
