# TrailVerse MCP Server

A ChatGPT app and **Claude MCP connector** that brings TrailVerse's AI trip
planner into ChatGPT and Claude conversations. Built for the
[OpenAI Apps SDK](https://developers.openai.com/apps-sdk) using Python + FastMCP.

**Live TrailVerse site:** https://www.nationalparksexplorerusa.com  
**Claude install guide:** https://www.nationalparksexplorerusa.com/mcp  
**ChatGPT app:** https://www.nationalparksexplorerusa.com/chatgpt

---

## What this is

TrailVerse already has:

- 470+ NPS sites (parks, monuments, historic sites) with live NPS API data
- A unified **Trailie** trip planner on **Claude Sonnet 5**, with constraint engine, intent detection, conflict
  detection, post-generation validation, smart replacement, plan scoring, and
  regeneration — documented in `article-ai-architecture.md` in the main repo.
- Side-by-side park comparison, events, daily nature feed, reviews, blog.
- A **voice assistant** ("Trailie Voice") — talk to Trailie hands-free and
  get answers with live park data. Built with OpenAI Realtime API over
  WebRTC with function calling for real-time NPS data.

This MCP server is a **thin adapter** that exposes five of those capabilities
as tools ChatGPT can call during a conversation, and renders the results
inline using custom HTML widgets styled in TrailVerse's editorial magazine
aesthetic.

**Zero changes to the main TrailVerse backend.** This server sits alongside
it and calls public endpoints.

> **One exception — required before public launch:** the TrailVerse Express
> backend needs a tiny middleware (~10 lines) to recognize a shared secret
> header from the MCP server and bypass the anonymous rate limit. Without
> it, all ChatGPT traffic funnels through one IP and self-DOSes the 60
> req/15min anonymous limit. See **[docs/BACKEND_CHANGES.md](docs/BACKEND_CHANGES.md)**
> for the exact code diff.

## Architecture

```
ChatGPT user
     │
     │ MCP protocol over HTTPS
     ▼
┌─────────────────────────────┐
│  trailverse-mcp.onrender.com │  ← this repo (Python FastMCP)
└──────────────┬──────────────┘
               │ HTTPS
               ▼
┌─────────────────────────────┐
│   trailverse.onrender.com   │  ← your existing Express backend
└──────────────┬──────────────┘
               │
               ▼
   MongoDB · NPS API · Claude Sonnet 5 · OpenWeatherMap
```

## The five tools

| Tool | Purpose | Backend endpoint |
|---|---|---|
| `plan_trip` | Structured constraint-aware itinerary for national parks (MCP) | `POST /api/ai/plan-itinerary` |
| `get_park_details` | Rich **NPS site** info with live alerts, weather, campgrounds, permits | `GET /api/parks/:code/details` + `/alerts` + `/weather` + `/campgrounds` + `/permits` + `/api/feed/park-of-day` |
| `compare_parks` | Side-by-side **2–4 NPS parks** with auto-computed highlights | `POST /api/parks/compare` + `/compare/summary` |
| `search_parks` | Search/filter **NPS catalog** by name, state, activity | `GET /api/parks/search` |
| `find_events` | Ranger programs and **NPS** park events | `GET /api/events/` |

All tools are **read-only** (`readOnlyHint: true`) and use the **anonymous AI
endpoint** (no auth required). Production MCP traffic sends
`X-TrailVerse-MCP-Key` so the backend skips the website guest cap (5 msg/48h)
and enables web search for `plan_trip`. Website upsell is for **saved trips,
PDF export, and the Plan Workspace** — see `/mcp` and `/chatgpt` landing pages.

### `plan_trip` V1 input schema

Structured fields (preferred over a single free-text `message`):

| Field | Required | Notes |
|---|---|---|
| `park_code` or `park_name` | New trips | NPS code (`shen`) or full name |
| `number_of_days` | New trips | 1–14 |
| `start_date` | Optional | `YYYY-MM-DD` |
| `travel_month` | Optional | e.g. `October` when exact date unknown |
| `adults`, `children` | Optional | Traveler counts |
| `interests` | Optional | e.g. `photography`, `wildlife` |
| `max_hike_miles` | Optional | Per-hike distance cap |
| `difficulty` | Optional | `easy`, `moderate`, `challenging` (synonyms accepted) |
| `lodging_area` | Optional | e.g. `Luray, Virginia` |
| `sunrise`, `sunset`, `relaxed_afternoon` | Optional | Preference booleans |
| `session_id` + `revision_request` | Revisions | Pass `sessionId` from prior response |

Validation errors return machine-readable JSON: `{ status: "error", error: { code, message, field, received, expected } }`.

`plan_trip` uses a **30s** bounded timeout (`PLAN_TRIP_TIMEOUT`) and returns `UPSTREAM_TIMEOUT` with optional `partial` context instead of hanging ~70s.

### Canonical tool surface (no duplicates)

The MCP server registers **exactly five tools** in `server/main.py`. MCP **prompts**
(`welcome`, `plan_my_trip`, etc.) are starter templates — not callable tools. If a
client shows two TrailVerse tool families, check for a duplicate MCP connector or
legacy ChatGPT action alongside the published app connector. Only one connector
should point at `https://trailverse-mcp.onrender.com/mcp`.

## Project structure

```
mcp-server/
├── server/
│   ├── __init__.py
│   ├── main.py              # FastMCP server, tool registration, widget resources
│   ├── client.py            # Async httpx client for the TrailVerse backend + image fetching
│   ├── types.py             # Pydantic input schemas
│   ├── formatters.py        # Backend response → widget structuredContent + LLM text
│   ├── conversations.py     # In-memory multi-turn session management
│   └── rate_limit.py        # Global rate limiting (defense-in-depth)
├── widgets/                 # Self-contained HTML for ChatGPT inline rendering
│   ├── itinerary.html       # Trip plan with confidence + score pills
│   ├── park-details.html    # Hero + weather + alerts + activities
│   ├── compare.html         # Side-by-side table
│   ├── park-list.html       # Search results grid
│   └── events.html          # Events list
├── scripts/
│   ├── test_local.py        # Smoke-test all 5 tools against live backend
│   ├── generate_previews.py # Generate static HTML previews with mock data
│   └── build_widgets.py     # Widget builder utility
├── docs/
│   ├── SUBMISSION_CHECKLIST.md  # OpenAI app submission walkthrough
│   ├── BACKEND_CHANGES.md       # Required backend middleware for MCP bypass key
│   └── QUICK_REFERENCE.md       # Tool quick reference
├── requirements.txt
├── render.yaml              # One-click Render deploy config
├── .env.example
└── README.md                # this file
```

---

## Local development

### 1. Clone and install

```bash
git clone <this-repo>
cd trailverse-mcp
python -m venv .venv
source .venv/bin/activate    # or `.venv\Scripts\activate` on Windows
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# edit .env — defaults point at production Render; use localhost for dev
```

If you want the MCP server to talk to a **local** TrailVerse backend instead:

```bash
export TRAILVERSE_API_BASE=http://localhost:5001
```

### 3. Smoke-test the tools

Before spinning up the full MCP server, verify each tool returns valid data:

```bash
python scripts/test_local.py                   # test all tools
python scripts/test_local.py plan_trip         # test just one
python scripts/test_local.py --base http://localhost:5001
```

Each tool call prints a summary like:

```
✓ search_parks
  text: Found 3 parks. Full list rendered above.
  kind: park_list
  parks: [3 item(s)]
  count: 3
```

If any tool returns `✗` with an error, the diagnostic output shows the exact
HTTP status and backend response — fix there before proceeding.

### 4. Preview the widgets visually

```bash
python scripts/generate_previews.py
open docs/preview-index.html    # macOS
# or: xdg-open, start, etc.
```

This renders all 5 widgets with realistic mock data in your browser so you
can verify the design before wiring up ChatGPT.

### 5. Run the MCP server

```bash
python -m server.main
```

You should see:

```
2026-04-22 14:00:00 [INFO] trailverse-mcp: Registered widget resource ui://widget/itinerary.html
... (5 resources)
INFO:     Uvicorn running on http://0.0.0.0:8000
```

MCP endpoint is at `http://localhost:8000/mcp`. Health check at `/health`.

### 6. Test with MCP Inspector (optional but recommended)

```bash
npx @modelcontextprotocol/inspector@latest \
  --server-url http://localhost:8000/mcp \
  --transport http
```

This opens a web UI where you can list tools, inspect schemas, and call each
tool with test arguments.

### 7. Expose to ChatGPT via ngrok (for developer mode testing)

```bash
ngrok http 8000
# → copy the https URL, e.g. https://abc123.ngrok.app
```

Then in ChatGPT:

1. Enable Developer Mode: **Settings → Apps & Connectors → Advanced settings → Developer Mode**
2. Go to **Settings → Connectors → Create**
3. Paste your ngrok URL with the `/mcp` suffix: `https://abc123.ngrok.app/mcp`
4. Name: **TrailVerse**, description: *"Plan national park trips with live NPS data"*
5. Open a new chat, click **+** → **More** → select **TrailVerse**
6. Try prompts like:
   - *"Plan a 3-day trip to Zion for a beginner with kids"*
   - *"Tell me about Bryce Canyon"*
   - *"Compare Zion and Bryce Canyon"*
   - *"Find parks in Utah"*
   - *"Show me upcoming ranger programs"*

After any code change, click **Refresh** on the connector in ChatGPT settings.

---

## Production deploy (Render)

### Option A — Blueprint (one click)

1. Push this repo to GitHub
2. In Render dashboard: **New + → Blueprint → connect repo**
3. Render reads `render.yaml` and provisions the service automatically
4. First build takes ~2 minutes; subsequent deploys are auto on `git push`

Your MCP server will be at `https://trailverse-mcp.onrender.com/mcp`.

### Option B — Manual web service

1. **New + → Web Service → connect this repo**
2. Runtime: **Python 3**
3. Build command: `pip install -r requirements.txt`
4. Start command: `python -m server.main`
5. Environment variables: copy from `.env.example`
6. Health check path: `/health`

### Verify it's up

```bash
curl https://trailverse-mcp.onrender.com/
# → "TrailVerse MCP server is running. MCP endpoint: /mcp"

curl https://trailverse-mcp.onrender.com/health
# → {"status":"ok","service":"trailverse-mcp"}
```

### Add to ChatGPT via developer mode

Same as local step 7 above, but use `https://trailverse-mcp.onrender.com/mcp`
instead of the ngrok URL.

---

## Submitting to the ChatGPT App Directory

Once the app is live and tested in developer mode, follow
**[docs/SUBMISSION_CHECKLIST.md](docs/SUBMISSION_CHECKLIST.md)** for the
complete submission walkthrough.

Key reviewer notes (critical for approval):

- All tools are **read-only** and **unauthenticated** — reviewers can test
  without creating an account, which is the #1 cause of rejections per
  OpenAI's submission guidelines.
- Tools are clearly described and correctly annotated with `readOnlyHint:
  true` and `openWorldHint: true`.
- The app does **not** sell digital goods — free in ChatGPT/Claude. Saved trips
  and the Plan Workspace require a free TrailVerse.com account, which is
  external and compliant.
- No write/destructive operations, no user data collection, no personal
  info accessed.

---

## Troubleshooting

### 403 "Host not in allowlist"

This means your request is hitting an egress or CORS proxy that doesn't
recognize the caller. Check:

- If you're testing from a sandboxed environment (like Claude Code's
  container), the sandbox may be blocking outbound requests to your Render
  backend. Test from your laptop or the deployed MCP server itself.
- If the TrailVerse backend has a CORS allowlist, add the MCP server's
  Render URL to it (`https://trailverse-mcp.onrender.com`).

### Tool returns empty structured content

Check the exact endpoint response shape matches what `server/formatters.py`
expects. Each formatter handles both `{data: ...}` and unwrapped shapes
defensively, but if your backend uses a different envelope, update the
formatter.

### Widget renders blank in ChatGPT

- Open browser devtools → check the widget iframe for JS errors
- Verify the MCP Apps bridge initialized: you should see `ui/initialize`
  in the iframe's console
- Check that `structuredContent` is populated in the tool result (use MCP
  Inspector)

### AI planner rate-limited too aggressively

Website guests are capped at 5 messages per 48h. In production, all ChatGPT
and Claude MCP calls flow through the single MCP server IP, so without the
`MCP_BYPASS_KEY` header the Express anonymous rate limit (60 req/15min) will
be hit almost immediately. Make sure the bypass key is set on both the MCP
server and the Express backend (see [docs/BACKEND_CHANGES.md](docs/BACKEND_CHANGES.md)).
Trusted MCP also skips the website 5-msg session cap for `plan_trip`. For
local dev, point `TRAILVERSE_API_BASE` at your local backend where you can
temporarily relax limits.

---

## Voice Chat ("Trailie Voice")

TrailVerse also ships an in-browser voice assistant built on a completely
different stack from the MCP server. It uses the **OpenAI Realtime API**
over **WebRTC** for voice-to-voice conversation with near-zero latency.

### Architecture

```
User speaks into mic
     │
     │ WebRTC (getUserMedia → RTCPeerConnection)
     ▼
┌────────────────────────────┐
│  OpenAI Realtime API       │  ← gpt-4o-realtime model
│  (voice-to-voice + VAD)    │
└────────────┬───────────────┘
             │ Function call via data channel
             ▼
┌────────────────────────────┐
│  TrailVerse Express        │  ← POST /api/ai/voice-tool
│  Backend                   │
└────────────┬───────────────┘
             │
             ▼
   NPS API · Weather APIs · park data
             │
             ▼
  Result → data channel → model speaks answer
```

### How it works

1. User taps the mic button → browser requests microphone access
2. Frontend calls `POST /api/ai/realtime-session` to get an ephemeral
   OpenAI token (valid for one session)
3. WebRTC peer connection established directly with OpenAI Realtime API
4. User speaks → model processes with semantic VAD (voice activity detection)
5. When the model needs data, it triggers a function call → Express backend
   fetches from NPS/weather APIs → result sent back through the WebRTC data
   channel → model speaks the answer

### Key files

| File | Purpose |
|---|---|
| `next-frontend/src/hooks/useRealtimeVoice.js` | React hook: WebRTC connection, mic management, data channel event handling, function call execution |
| `next-frontend/src/components/voice/` | Voice UI overlay components |
| `server/src/routes/ai.js` | Backend: `/api/ai/realtime-session` (ephemeral token), `/api/ai/voice-tool` (function call execution), voice instructions + tool definitions |

### Voice-specific tools

The voice assistant exposes 4 tools via OpenAI's function calling (not MCP):

| Tool | What it does |
|---|---|
| `get_park_details` | Live weather, alerts, fees, hours for any NPS site |
| `search_parks` | Search 470+ NPS sites by state, activity, keyword |
| `compare_parks` | Side-by-side park comparison |
| `find_events` | Ranger programs and upcoming events |

Tool responses are trimmed for voice — bare essentials only (name, weather,
fee, key alerts) with hard 2-4 sentence limits in the model instructions.

### Echo prevention & mic management

Voice chat had a self-interruption problem: the mic picks up Trailie's
audio from the speaker, VAD detects it as user speech, and the model
interrupts itself mid-sentence.

Solution — strict mic lifecycle:

1. **User speaks** → `speech_started` event → status: `listening`
2. **User stops** → `committed` event → if speech lasted >500ms, send
   `response.create` (filters out noise)
3. **Trailie starts speaking** → mic muted (`track.enabled = false`)
4. **Trailie finishes speaking** → audio stops (mic stays muted)
5. **Response fully done** → `response.done` event → 1200ms cooldown →
   mic re-enabled → status: `connected`

The mic is off for the entire response cycle (`response.create` through
`response.done` + cooldown). All speech events are blocked during this
window via `responseActiveRef` checks.

Additional protections:
- `echoCancellation`, `noiseSuppression`, `autoGainControl` on getUserMedia
- `create_response: false` in session config — client controls when to
  trigger responses, not the server-side VAD
- Speech duration filtering (>500ms) to ignore noise false positives
- `responseActiveRef` prevents duplicate `response.create` calls
- Non-fatal "active response" errors filtered from UI

### Context awareness

- If voice chat opens on a park page, live weather, alerts, and fees are
  injected into the model instructions — first answer is instant (no tool
  call round-trip)
- Geolocation is cached at module level (requested once per page session)
  so "what parks are near me?" works without re-prompting

### Bluetooth speaker support

- Audio element appended to DOM (detached elements don't play on some BT
  devices)
- `playsInline` attribute + `setSinkId('default')` for system audio routing
- Forced `audioEl.play()` on track received

---

## Design notes

The widgets deliberately **don't** look like generic SaaS cards. They use:

- **Serif display type** (Cormorant Garamond) for park names and titles
- **Monospace** (JetBrains Mono) for metadata, labels, and timestamps
- **Sans body** (Inter) sparingly
- Magazine-cover masthead patterns (issue number, date, brand)
- Heavy em-dashes and italic tagline treatments
- Green accent (`#22c55e` dark / `#059669` light) only where it matters
- Dark-theme-first with `@media (prefers-color-scheme: light)` overrides

This matches TrailVerse's Spring 2026 Issue 01 magazine cover aesthetic and
makes the app distinctive in the ChatGPT App Directory, where most entries
default to generic Tailwind-style cards.

---

## License & credits

Built on top of:

- [TrailVerse](https://www.nationalparksexplorerusa.com) — the main product
- [Model Context Protocol](https://modelcontextprotocol.io) by Anthropic
- [OpenAI Apps SDK](https://developers.openai.com/apps-sdk)
- [FastMCP](https://github.com/modelcontextprotocol/python-sdk) Python SDK

Park data from the [National Park Service API](https://www.nps.gov/subjects/developer/).
Weather from OpenWeatherMap. AI trip planning from Trailie on Anthropic Claude Sonnet 5.
