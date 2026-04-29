# TrailVerse MCP Server

A ChatGPT app (MCP server) that brings TrailVerse's AI-powered national park
planner into ChatGPT conversations. Built for the [OpenAI Apps SDK](https://developers.openai.com/apps-sdk)
using Python + FastMCP.

**Live TrailVerse site:** https://www.nationalparksexplorerusa.com

---

## What this is

TrailVerse already has:

- 470+ NPS sites (parks, monuments, historic sites) with live NPS API data
- A sophisticated **AI trip planner** with dual-model personas (The Planner on
  GPT-5.4 Mini, The Local on Claude), constraint engine, intent detection, conflict
  detection, post-generation validation, smart replacement, plan scoring, and
  regeneration — documented in `article-ai-architecture.md` in the main repo.
- Side-by-side park comparison, events, daily nature feed, reviews, blog.

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
   MongoDB · NPS API · Claude · GPT-5.4 Mini · OpenWeatherMap
```

## The five tools

| Tool | Purpose | Backend endpoint |
|---|---|---|
| `plan_trip` | AI-powered constraint-aware itinerary — the crown jewel | `POST /api/ai/chat-anonymous` |
| `get_park_details` | Rich park info with live alerts + weather | `GET /api/parks/:code/details` + `/alerts` + `/weather` |
| `compare_parks` | Side-by-side 2–4 park comparison | `POST /api/parks/compare` + `/compare/summary` |
| `search_parks` | Search/filter by name, state, activity | `GET /api/parks/search` |
| `find_events` | Ranger programs and park events | `GET /api/events/` |

All tools are **read-only** (`readOnlyHint: true`) and use the **anonymous AI
endpoint** (no auth required, 5 messages per 48h per IP). This is intentional:
it makes the OpenAI review process trivial (no demo account needed) and
funnels power users back to nationalparksexplorerusa.com for unlimited access.

## Project structure

```
trailverse-mcp/
├── server/
│   ├── __init__.py
│   ├── main.py              # FastMCP server, tool registration, widget resources
│   ├── client.py            # Async httpx client for the TrailVerse backend
│   ├── types.py             # Pydantic input schemas
│   └── formatters.py        # Backend response → widget structuredContent
├── widgets/                 # Self-contained HTML for ChatGPT inline rendering
│   ├── itinerary.html       # Trip plan with confidence + score pills
│   ├── park-details.html    # Hero + weather + alerts + activities
│   ├── compare.html         # Side-by-side table
│   ├── park-list.html       # Search results grid
│   └── events.html          # Events list
├── scripts/
│   ├── test_local.py        # Smoke-test all 5 tools against live backend
│   └── generate_previews.py # Generate static HTML previews with mock data
├── docs/
│   ├── SUBMISSION_CHECKLIST.md  # OpenAI app submission walkthrough
│   └── preview-*.html       # Generated widget previews (after running script)
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
- The app does **not** sell digital goods — free 5 msg/48h is just a rate
  limit. Unlimited access requires signing up on TrailVerse.com, which is
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

The backend limits anonymous AI chat to 5 messages per 48h per IP. In
production, ChatGPT calls will come from many different IPs (the model's
infra), so this shouldn't be an issue. For local dev, cycle IPs or use a
VPN if needed — or temporarily bypass the limit in your dev backend.

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
Weather from OpenWeatherMap. AI from Anthropic Claude and OpenAI GPT-5.4 Mini.
