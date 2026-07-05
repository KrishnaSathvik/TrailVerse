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

- [ ] "Plan a 3-day trip to Zion for a beginner" → itinerary widget renders
- [ ] "Tell me about Bryce Canyon" → park details widget renders with weather
- [ ] "Compare Zion and Bryce Canyon" → compare widget renders
- [ ] "Find parks in Utah" → park list widget renders
- [ ] "What ranger programs are coming up?" → events widget renders
- [ ] Deep links in each widget actually open on TrailVerse
- [ ] Dark mode and light mode both look right
- [ ] Widgets render correctly on mobile ChatGPT

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
TrailVerse brings your universe of national parks exploration into ChatGPT.

Deep live data for 470+ US national parks, monuments, and historic sites —
plus day-by-day trip planning for any US destination, including state parks,
cities, beaches, and road trips. Tell Trailie you're a beginner with kids
visiting Zion in July and it can steer you toward family-friendly trails, flag
timed-entry and permit requirements, and build a pace-matched plan grounded in
live NPS alerts and weather. Always confirm safety-critical details on NPS.gov
before you go.

Five focused capabilities:

• Plan a trip — Constraint-aware day-by-day itineraries with confidence
  scoring. Post-validates plans for fitness level, family pacing, and
  feasibility. Works for NPS sites and beyond (state parks, cities, mixed road
  trips). Powered by **Trailie** on Claude Sonnet 5.

• Park details — Rich live info for NPS sites: current weather, 5-day forecast
  when available, active alerts, entrance fees, and top activities.

• Compare parks — Side-by-side 2–4 NPS parks with auto-computed highlights:
  best overall, warmest right now, and lower-crowd option.

• Search parks — Find NPS sites by state, activity, or free-text query across
  the full catalog.

• Find events — Upcoming ranger programs, guided tours, and park-hosted events
  at NPS sites.

Read tools pull from the official National Park Service API and live weather;
itineraries run through TrailVerse's constraint validation pipeline. Free to
use in ChatGPT with generous limits on park lookup tools. For saved trips,
PDF export, the visual Plan Workspace, and your full Trailie history, continue
free at nationalparksexplorerusa.com/plan-ai.
```

(~1,450 characters — within typical store limits)

### Full description (short variant)

Use if the submission form has a tighter character cap:

```
TrailVerse puts 470+ NPS parks and sites inside ChatGPT with live data — not
stale training answers. Plan a trip works for any US destination (national
parks, state parks, cities, road trips); the other four tools are NPS-focused
for live weather, alerts, compare, search, and events.

Ask for a Zion trip with kids in July and get family-paced itineraries, permit
warnings, and plans grounded in live alerts and weather. Five tools: Plan a
trip (constraint-aware, confidence-scored; Trailie on Claude Sonnet 5), Park
details, Compare (2–4 parks), Search, and Find events.

Data comes from the NPS API, live weather, and TrailVerse's validation
pipeline. Free in ChatGPT. Save trips, export PDFs, and use the full Plan
Workspace at nationalparksexplorerusa.com/plan-ai.
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
Mocked or idealized screenshots are a rejection reason. Take real ones:

- [ ] **Screenshot 1 — Itinerary in action**: user asks "Plan 3 days in Zion for beginner with kids", show the itinerary widget rendered in ChatGPT
- [ ] **Screenshot 2 — Park details**: user asks "Tell me about Yellowstone", show park details widget with weather + alerts
- [ ] **Screenshot 3 — Compare**: user asks "Zion vs Bryce Canyon", show compare widget
- [ ] **Screenshot 4 — Search**: user asks "Parks in Utah", show park list widget
- [ ] **Screenshot 5 — Events**: user asks "Upcoming ranger programs at Yellowstone", show events widget

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
| `plan_trip` | ✓ true | ✓ true | false | ✓ false |
| `get_park_details` | ✓ true | ✓ true | ✓ true | ✓ false |
| `compare_parks` | ✓ true | ✓ true | ✓ true | ✓ false |
| `search_parks` | ✓ true | ✓ true | ✓ true | ✓ false |
| `find_events` | ✓ true | ✓ true | ✓ true | ✓ false |

**Justification for each** (paste in the submission form if asked):

See per-tool blocks below. All five tools set **`destructiveHint: false`** — none delete
data, cancel bookings, or overwrite user-owned records.

### `plan_trip`

| Annotation | Value | Justification |
|---|---|---|
| **readOnlyHint** | `true` | Returns a generated itinerary only. Does not create or modify user accounts, saved trips, NPS records, reservations, or any third-party system. The backend may append messages to an ephemeral anonymous session (TTL ~48h) for multi-turn follow-ups like “add day 4”; that is internal session state, not a user-visible write or booking action. |
| **openWorldHint** | `true` | Calls the TrailVerse Express API, which fetches live NPS facts, weather (OpenWeatherMap), and optionally web search for non-NPS destinations. Also stores short-lived conversation context in MCP memory. All inputs/outputs depend on external live data outside ChatGPT. |
| **destructiveHint** | `false` | Does not delete, overwrite, or irreversibly change any user data, park data, or external resource. Cannot cancel reservations, remove saved trips, or mutate NPS content — it only returns planning text. |
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

The submission form will ask what data the app accesses. Answer honestly:

```
Data accessed from the user:
- The natural-language prompt the user types in ChatGPT
- No personal information, no location, no ChatGPT account data

Data sent to third parties:
- User prompts are sent to the TrailVerse backend
  (trailverse.onrender.com) for AI trip planning
- TrailVerse forwards prompts to Anthropic (**Claude Sonnet 5**) for AI trip planning
- No data is stored server-side for anonymous users beyond ephemeral session state

Data retained:
- Backend logs retain request metadata (IP, timestamp, park code) for
  48-hour rate limiting
- No message content is retained beyond the response
- No user profiles are created
- No tracking, no analytics forwarded from ChatGPT
```

Link the existing TrailVerse privacy policy at
`https://www.nationalparksexplorerusa.com/privacy`.

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
Hallucination mitigation: All park data is grounded in the NPS API. AI
itineraries are post-validated against constraint rules and live data —
see article-ai-architecture.md for full detail.
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
- [ ] Tool annotations are correct ✓ (all readOnlyHint: true)
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
4. **The moat is still visible.** The constraint engine, plan scoring, and
   post-validation all work via the anonymous endpoint.
   Production MCP uses `MCP_BYPASS_KEY` (skips the website 5-msg/48h cap and
   enables web search for `plan_trip`). What's still *website-only* is
   **trip persistence, share links, PDF export, and the Plan Workspace**.

V2 can add OAuth later without rejection risk since the app will already
be approved and live.
