# OpenAI Apps SDK — Submission Checklist for TrailVerse

Complete, prescriptive walkthrough for getting TrailVerse into the ChatGPT
App Directory. Follow in order. Every section flags common rejection
reasons and how to avoid them.

Submission portal: https://platform.openai.com/apps-manage

---

## 0. Prerequisites (do these first)

### Identity verification

Per OpenAI's submission guidelines, this is enforced at review time.
Publishing under an unverified name is an automatic rejection.

- [ ] Decide: publish under your name ("Krishna Sathvik") or a business name ("TrailVerse")?
- [ ] **If individual:** complete **individual verification** in the OpenAI platform dashboard (ID verification)
- [ ] **If business:** complete **business verification** (requires a legal entity; more paperwork but cleaner for a real product. Recommended.)
- [ ] Make sure the verified name matches what appears in your app listing

### Required URLs — create these before submitting

| What | Suggested URL | Notes |
|---|---|---|
| Privacy Policy | https://www.nationalparksexplorerusa.com/privacy | You already have this ✓ |
| Terms of Service | https://www.nationalparksexplorerusa.com/terms | You already have this ✓ |
| Support / Contact | https://www.nationalparksexplorerusa.com/about | Your About page works |
| App homepage / marketing | https://www.nationalparksexplorerusa.com | Main TrailVerse site |
| MCP server URL | https://trailverse-mcp.onrender.com/mcp | After deploy |

All must be reachable without authentication.

### Deploy the MCP server

- [ ] **CRITICAL PREREQUISITE:** apply the backend changes in
      [BACKEND_CHANGES.md](BACKEND_CHANGES.md) first. Without the rate-limit
      bypass middleware on the main TrailVerse Express backend, the MCP
      server will self-DOS within minutes of any ChatGPT traffic.
- [ ] Generate a strong `MCP_BYPASS_KEY` (48+ random bytes)
- [ ] Set `MCP_BYPASS_KEY` on both Render services (main backend + MCP server)
- [ ] Verify the key works: `curl -H "X-TrailVerse-MCP-Key: ..." https://trailverse.onrender.com/api/parks/search` bypasses rate limiting
- [ ] Deploy `trailverse-mcp` to Render (see README.md)
- [ ] Verify `GET https://trailverse-mcp.onrender.com/health` returns 200
- [ ] Verify MCP endpoint responds via `npx @modelcontextprotocol/inspector`
- [ ] If your TrailVerse backend has a CORS/host allowlist beyond the rate limiter, add `https://trailverse-mcp.onrender.com` to it

### Test end-to-end in ChatGPT developer mode

Don't submit until these all work smoothly in developer mode:

Production runs with `MCP_MARKDOWN_ONLY=true` (the default): every tool returns
markdown text, no HTML widgets. Test the text responses:

- [ ] "Plan a 3-day trip to Zion for a beginner" → itinerary text with session_id
- [ ] "Tell me about Bryce Canyon" → park details text with alerts + weather
- [ ] "Compare Zion and Bryce Canyon" → comparison table
- [ ] "Find parks in Utah" → ranked list that includes Zion, Arches, Bryce, Canyonlands, Capitol Reef
- [ ] "What ranger programs are coming up at Yellowstone?" → events list (or a clear "none listed")
- [ ] Links in each response open on TrailVerse
- [ ] Run the full golden set in [GOLDEN_EVAL_SET.md](GOLDEN_EVAL_SET.md) (manual rows)

---

## 1. App metadata (the stuff you paste into the submission form)

### Name

```
TrailVerse
```

**Why this works:** Distinctive, brand-tied, not a single dictionary word.
OpenAI's guidelines explicitly flag generic names like "Parks" or "Travel"
for rejection. "TrailVerse" is specific and trademarkable.

### Tagline / short description (one line)

```
Live NPS data and AI trip planning for 470+ sites — plus any US destination.
```

### Full description

```
TrailVerse brings National Park Service data and the Trailie trip planner into
ChatGPT.

Look up about 470 US National Park Service sites — national parks, monuments,
seashores, and historic sites — and plan day-by-day trips to US destinations,
including state parks, cities, and road trips. Tell Trailie you're visiting
Zion with kids in July and it builds a day-by-day plan using NPS alerts,
weather, and place data. Always confirm safety-critical details on NPS.gov
before you go.

Five tools:

• Plan a trip — Day-by-day itineraries and revisions from Trailie, TrailVerse's
  planner (runs on an OpenAI model through the TrailVerse backend). Works for
  NPS sites and other US destinations. Each plan is kept in a temporary
  anonymous TrailVerse session (48 hours) so you can revise it.

• Park details — Alerts and closures, current weather and forecast, entrance
  fees, hours, activities, campgrounds, and permits for an NPS site. Data is
  cached (alerts and weather refresh about every 30 minutes).

• Compare parks — 2–4 NPS sites side by side: temperature, estimated crowd
  level, entrance fee, activities, and a Google Maps route link.

• Search parks — Find NPS sites by state, activity, or trip style.

• Find events — Upcoming ranger programs, guided tours, and park events from
  the NPS events feed.

Park data comes from the National Park Service API and OpenWeather via the
TrailVerse backend. The app does not book or reserve anything.
```

### Full description (short variant)

```
TrailVerse puts National Park Service data and the Trailie trip planner in
ChatGPT. Plan a trip works for US destinations (national parks, state parks,
cities, road trips); the other four tools cover about 470 NPS sites: park
details (alerts, weather, fees, campgrounds, permits), compare 2–4 parks,
search by state or activity, and upcoming ranger events. Trailie runs on an
OpenAI model through the TrailVerse backend. No bookings or reservations.
```

### Category

```
Travel
```

(Alternatives: Lifestyle, Productivity — but Travel is the closest fit.)

### Supported countries

```
United States
```

(Park data is US-only. Don't claim coverage you don't have — rejection risk.)

### Logo

- File: `/next-frontend/public/logo.png` (1024×1024, you already have this)
- Requirements: 1024×1024 square, PNG, transparent background preferred

### Screenshots (required)

OpenAI requires screenshots that **accurately represent functionality**.
Mocked or idealized screenshots are a rejection reason. Production is
markdown-only (no widgets), so screenshots must show the text responses:

- [ ] **Screenshot 1 — Itinerary**: "Plan 3 days in Zion for a beginner with kids" — Trailie's text itinerary in ChatGPT
- [ ] **Screenshot 2 — Park details**: "Tell me about Yellowstone" — alerts + weather text
- [ ] **Screenshot 3 — Compare**: "Zion vs Bryce Canyon" — comparison table
- [ ] **Screenshot 4 — Search**: "Parks in Utah" — ranked list
- [ ] **Screenshot 5 — Events**: "Upcoming ranger programs at Grand Canyon" — events list

Do not reuse old widget screenshots.

Resolution: match OpenAI's current requirements (they change; check the
submission form for the exact dimensions). Capture on both desktop and
mobile if the form asks for both.

### Demo prompts (3–5 suggested prompts for discovery)

Copy these into the "suggested prompts" field if asked:

```
Plan a 3-day trip to Zion for a beginner with kids
Compare Zion and Bryce Canyon
Tell me about Acadia National Park
Find parks in Utah with good stargazing
What ranger programs are happening at Yellowstone this month?
```

---

## 2. Tool annotations (already set in code — verify before submission)

Per OpenAI's submission guidelines, **incorrect action labels are a common
cause of rejection**. Each tool in `server/main.py` has:

| Tool | readOnlyHint | openWorldHint | idempotentHint | destructiveHint |
|---|---|---|---|---|
| `plan_trip` | **false** | ✓ true | false | ✓ false |
| `get_park_details` | ✓ true | ✓ true | ✓ true | ✓ false |
| `compare_parks` | ✓ true | ✓ true | ✓ true | ✓ false |
| `search_parks` | ✓ true | ✓ true | ✓ true | ✓ false |
| `find_events` | ✓ true | ✓ true | ✓ true | ✓ false |

**Justification for each** (paste in the submission form if asked):

See per-tool blocks below. All five tools set **`destructiveHint: false`** — none delete
data, cancel bookings, or overwrite user-owned records.

> **Changed 2026-10-26:** `plan_trip` `readOnlyHint` went from `true` to `false`.
> Changing annotations on a published app will likely require re-review; ChatGPT
> may also start asking the user to confirm `plan_trip` calls.

### `plan_trip`

| Annotation | Value | Justification |
|---|---|---|
| **readOnlyHint** | `false` | Each call creates or updates an anonymous TrailVerse guest session (MongoDB, expires 48 h after last activity) holding the conversation messages and the canonical itinerary, and revisions update that saved plan. OpenAI's guidelines say to use `false` for "persisting artifacts" and "external-state changes". It does not touch user accounts, reservations, NPS data, or third-party systems. |
| **openWorldHint** | `true` | Arbitrary US destinations; the backend fetches NPS facts, weather, and other evidence sources for them. |
| **destructiveHint** | `false` | Additive only: it writes to a guest session created for this conversation and never deletes or overwrites user-owned data, bookings, or external records. A revision replaces the previous plan only inside that same guest session. |
| **idempotentHint** | `false` | Same inputs can yield different AI-generated itineraries (creative LLM output, live weather/alerts may change between calls). |

### `get_park_details`

| Annotation | Value | Justification |
|---|---|---|
| **readOnlyHint** | `true` | Issues parallel **GET** requests only: park details, alerts, weather, campgrounds, permits, and optional daily feed. No POST/PUT/PATCH/DELETE to TrailVerse, NPS, or user data. |
| **openWorldHint** | `true` | Aggregates live data from the National Park Service API and OpenWeatherMap via TrailVerse backend proxies. Results change as real-world conditions change. |
| **destructiveHint** | `false` | Read-only lookup. Cannot modify park records, alerts, or user preferences. |
| **idempotentHint** | `true` | Repeated calls with the same `park_code` perform the same read operations; output may differ only because upstream live data (weather, alerts) changed. |

### `compare_parks`

| Annotation | Value | Justification |
|---|---|---|
| **readOnlyHint** | `true` | Calls `POST /api/parks/compare` and `/compare/summary`, which **compute** a side-by-side view from existing park data. These endpoints do not persist comparison results to user accounts or alter source records — they are stateless aggregation reads. |
| **openWorldHint** | `true` | Pulls current weather, crowd signals, fees, and activities for 2–4 parks from live backend/NPS/OpenWeather sources. |
| **destructiveHint** | `false` | No deletes or updates. Cannot change park data or user saved lists — only returns a comparison table and recommendation text. |
| **idempotentHint** | `true` | Same park codes trigger the same comparison logic; live fields (temperature, crowd level) may drift between calls. |

### `search_parks`

| Annotation | Value | Justification |
|---|---|---|
| **readOnlyHint** | `true` | Single **GET** to `/api/parks/search` with optional query expansion retry. Returns ranked NPS catalog matches only — no writes. |
| **openWorldHint** | `true` | Searches TrailVerse’s live NPS catalog (470+ sites) with trait scoring; results depend on current catalog and query intent, not closed-world training data. |
| **destructiveHint** | `false` | Search is read-only. Does not add/remove favorites, modify profiles, or change any stored data. |
| **idempotentHint** | `true` | Identical query/state/activity/limit parameters hit the same search endpoint; ranking is deterministic for a given catalog snapshot. |

### `find_events`

| Annotation | Value | Justification |
|---|---|---|
| **readOnlyHint** | `true` | **GET** `/api/events` with optional park, state, and category filters. Lists upcoming ranger programs and park events — does not register, cancel, or modify events. |
| **openWorldHint** | `true` | Event listings come from TrailVerse’s live events feed (NPS/RIDB-sourced data), which updates as schedules change. |
| **destructiveHint** | `false` | Cannot cancel event registrations or alter event records — read-only listing. |
| **idempotentHint** | `true` | Same filters return the same query; event lists may change as new programs are published or dates pass. |

No destructive tools. No user-account writes. No bookings or reservations.

---

## 3. Authentication

```
Authentication type: None (public read-only)
```

**This is the strategic win** — per submission guidelines, "Apps requiring
any additional steps for login — such as requiring new account sign-up or
2FA — will be rejected." We avoid this entire rejection vector by using
the anonymous AI chat endpoint.

No demo credentials needed. No OAuth flow. Reviewers can test immediately
on the live MCP URL without any account setup.

---

## 4. Privacy & data handling disclosure

The submission form will ask what data the app accesses. Verified against
code on 2026-10-26 (`mcp-server/server/main.py`, `client.py`,
`conversations.py`; `server/src/routes/ai.js`, `modelFirstTrailie.js`,
`trailieSimpleRuntime.js`, `models/AnonymousSession.js`):

```
Data received from ChatGPT/Claude:
- Tool arguments the model fills in (park names/codes, dates, trip length,
  traveler counts, preferences, revision text).
- MCP client name (used only to label the client as chatgpt / claude / unknown).
- For plan_trip only: the IANA time zone from ChatGPT's coarse
  openai/userLocation hint (e.g. "America/Denver"). No other location field
  (city, region, coordinates) is read. The zone is forwarded to the TrailVerse
  backend, which uses it only to tell the planner today's date in the
  traveler's zone (falls back to America/New_York). The MCP server does not log
  or store it.

Data sent to third parties:
- All tool calls go to the TrailVerse backend (trailverse.onrender.com).
- plan_trip: the trip request and conversation history are sent by the
  backend to OpenAI (Trailie's production runtime is model_first:
  OpenAI gpt-6.1-sol, low reasoning). Park lookups call the NPS API and
  OpenWeather; trip planning may also query the backend's evidence
  providers (NPS, Recreation.gov/RIDB, maps/geocoding, weather, astronomy, and
  web search via Brave/Serper/Tavily when configured). Search queries are
  derived from the trip request.
- Usage analytics (only when POSTHOG_PROJECT_TOKEN is configured): one PostHog
  event "mcp_tool_completed" per tool call with tool name, client
  (chatgpt/claude/unknown), outcome (success/failed), and duration in ms.
  distinct_id is the shared label "mcp-<client>", not a per-user id. No prompt
  text, park codes, arguments, or location are sent.

Data retained:
- MCP server memory: plan_trip conversation messages (up to 20 per session,
  up to 1,000 sessions) for 2 hours; lost on restart.
- TrailVerse backend: an anonymous guest session (messages, latest itinerary,
  the connecting IP — which is the MCP server's, not the end user's — and user
  agent) that expires 48 hours after last activity.
- Hosting logs (Render): tool errors and validation warnings, which can include
  the rejected argument values. Request URLs/search terms are not logged at the
  default log level.
- No user accounts or profiles are created; no cross-session tracking.
```

Link the existing TrailVerse privacy policy at
`https://www.nationalparksexplorerusa.com/privacy` — confirm it covers the
OpenAI processing, PostHog usage analytics, and 48-hour guest sessions above.

---

## 5. Commerce & monetization

```
Does this app sell anything? No.
Does it link to paid products? No.
```

The website guest tier (5 messages / 48h on TrailVerse.com) is a rate limit,
not a paywall. ChatGPT traffic uses the trusted MCP bypass and does not share
that per-session website cap. Upsell on the website is for **saved trips,
PDF export, and the Plan Workspace** — no payment, no subscription in-app.
This stays inside the App Submission Guidelines rule that **digital goods and
subscriptions cannot be sold through ChatGPT apps**.

---

## 6. Safety / content

```
Age-appropriate: Yes, all audiences.
Content generation: AI generates trip plans from structured backend data.
Moderation: TrailVerse backend has content filtering on AI output.
Hallucination mitigation: Park facts come from the NPS API. Trailie's
canonical TripPlan persistence, evidence-grounded places and routes, and trip
mutation guards are enforced in code; answer quality still depends on the
model following policy (docs/TRAILIE-CAPABILITIES-ACCURACY.md). Park tools
refuse to guess when a park name is unknown or ambiguous.
```

---

## 7. Final submission walkthrough

1. Go to https://platform.openai.com/apps-manage
2. Click **Create new app**
3. Paste metadata from sections 1–6 above
4. Upload the logo and screenshots
5. Enter MCP server URL: `https://trailverse-mcp.onrender.com/mcp`
6. Enter authentication type: **None**
7. Add privacy policy URL, terms URL, support URL
8. Select supported countries: **United States**
9. Review all tool annotations one more time
10. Click **Submit for review**
11. Save the Case ID from the confirmation email — required for all future support

---

## 8. What happens next

Per OpenAI (current as of Dec 2025):

- Review timelines vary (beta — no published SLA)
- Do NOT contact support to expedite — OpenAI explicitly says these
  requests cannot be accommodated
- You'll be notified by email as the app moves through review
- If approved, you must still click **Publish** in your dashboard for the
  app to appear in the directory
- If rejected, you can Cancel review, fix issues, and resubmit

Common rejection reasons to double-check one more time:

- [ ] App name is not overly generic ✓ ("TrailVerse" is fine)
- [ ] Tool annotations are correct (plan_trip readOnlyHint: false; the four read tools true)
- [ ] Reviewer can connect to MCP server without auth ✓ (anonymous)
- [ ] Screenshots match actual functionality (verify before uploading)
- [ ] Privacy policy link is reachable ✓
- [ ] Description explains what the app does clearly ✓
- [ ] No digital goods for sale ✓
- [ ] App is complete, not a trial or demo ✓

---

## 9. Post-launch

Once published:

- [ ] Monitor Render logs for errors (Render dashboard → Logs)
- [ ] Watch the 403 rate — if your backend's CORS allowlist rejects
      requests from ChatGPT IPs, every call fails silently from user's POV
- [ ] Track which prompts trigger which tools — refine tool descriptions
      if discovery is poor
- [ ] Respond to user reports promptly (OpenAI reviews reports and may
      restrict apps with repeated complaints)
- [ ] Consider V2 features:
  - OAuth-gated authenticated mode for logged-in TrailVerse users (saved
    trips, share links, and Plan Workspace inside ChatGPT)
  - Additional tools: `get_daily_feed`, `get_local_take`

---

## 10. Notes on the anonymous-only V1 strategy

This app ships with **only the anonymous AI endpoint** — no OAuth, no
authenticated tools. That's deliberate:

1. **Faster approval.** Zero friction for reviewers. Biggest single
   rejection vector eliminated.
2. **Cleaner story.** "Free in ChatGPT; save and workspace on our site" is
   the same playbook Canva, Figma, and Notion use for ChatGPT apps.
3. **Top-of-funnel for TrailVerse.** ChatGPT users who want saved trips,
   PDF export, or the visual Plan Workspace continue at
   nationalparksexplorerusa.com — acquisition channel, not a replacement.
4. **The planner is the same.** MCP uses the same Trailie runtime as the
   website via the anonymous endpoint.
   Production MCP uses `MCP_BYPASS_KEY` (skips the website 5-msg/48h cap and
   enables web search for `plan_trip`). What's still *website-only* is
   **trip persistence, share links, PDF export, and the Plan Workspace**.

V2 can add OAuth later without rejection risk since the app will already
be approved and live.
