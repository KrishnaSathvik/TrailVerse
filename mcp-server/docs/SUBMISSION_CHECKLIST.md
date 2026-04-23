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
Plan your next US national park trip with live park data.
```

### Full description

```
TrailVerse brings your universe of national parks exploration into ChatGPT.

Plan a trip to any of 470+ US national parks, monuments, and historic sites
with an AI planner that understands constraints. Tell it you're a beginner
with kids visiting Zion in July and it won't send you up Angels Landing —
it'll swap in an appropriate trail, warn you about timed-entry permits, and
build a pace-matched itinerary grounded in live NPS alerts and weather.

Five focused capabilities:

• Plan a trip — Constraint-aware day-by-day itineraries with confidence
  scoring. Validates fitness, group size, and kids against every trail.
  Choose The Planner (structured, thorough) or The Local (casual,
  opinionated insider picks).

• Park details — Rich info for any park with current weather, 5-day
  forecast, active NPS alerts, entrance fees, and top activities.

• Compare parks — Side-by-side up to 4 parks with auto-computed
  highlights: best overall, warmest right now, fewer crowds.

• Search parks — Find parks by state, activity, or free-text query.

• Find events — Upcoming ranger programs, guided tours, and festivals.

All data is grounded in the official National Park Service API, live
weather, and TrailVerse's own constraint validation pipeline. The AI
planner is limited to 5 messages per 48 hours for free; for unlimited
planning, web search integration, and trip saving, continue at
nationalparksexplorerusa.com.
```

(~1,200 characters — within typical store limits)

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
| `plan_trip` | ✓ true | ✓ true | false | — |
| `get_park_details` | ✓ true | ✓ true | ✓ true | — |
| `compare_parks` | ✓ true | ✓ true | ✓ true | — |
| `search_parks` | ✓ true | ✓ true | ✓ true | — |
| `find_events` | ✓ true | ✓ true | ✓ true | — |

**Justification for each** (paste in the submission form if asked):

- **readOnlyHint: true** — all tools read data and render it. None create,
  update, or delete anything on TrailVerse or any external system.
- **openWorldHint: true** — tools interact with external systems (the
  National Park Service API, OpenWeatherMap) that are outside ChatGPT and
  TrailVerse's direct control.
- **idempotentHint: true** — for the four read-only lookup tools, calling
  them multiple times with the same arguments produces equivalent results
  (modulo live data changes like weather).
- **idempotentHint: false** — for `plan_trip` only, because the AI planner
  returns varied creative output even with identical inputs.

No destructive tools. No write operations. No user data stored server-side.

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
- TrailVerse forwards the prompt to OpenAI (GPT-4.1) or Anthropic
  (Claude) depending on the persona
- No data is stored server-side for anonymous users

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

The 5-message/48h free tier is a rate limit, not a paywall. Unlimited
access requires creating a free account on TrailVerse.com — no payment,
no subscription in-app. This stays inside the App Submission Guidelines
rule that **digital goods and subscriptions cannot be sold through
ChatGPT apps**.

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
  - OAuth-gated authenticated mode for logged-in TrailVerse users (lifts
    the 5 msg/48h limit, enables save & share)
  - Additional tools: `get_daily_feed`, `get_local_take` (Claude persona
    as a separate tool)
  - Web search integration (requires authenticated mode)

---

## 10. Notes on the anonymous-only V1 strategy

This app ships with **only the anonymous AI endpoint** — no OAuth, no
authenticated tools. That's deliberate:

1. **Faster approval.** Zero friction for reviewers. Biggest single
   rejection vector eliminated.
2. **Cleaner story.** "Free tier in ChatGPT, unlimited on our site" is
   the same playbook Canva, Figma, and Notion use for ChatGPT apps.
3. **Top-of-funnel for TrailVerse.** Every user who hits the 5-msg limit
   is directly invited to continue at nationalparksexplorerusa.com —
   this makes ChatGPT an acquisition channel, not a replacement.
4. **The moat is still visible.** The constraint engine, dual personas,
   plan scoring, and smart replacement all work in anonymous mode. What's
   *gated* is web search, unlimited messages, and save/share — exactly
   the features worth signing up for.

V2 can add OAuth later without rejection risk since the app will already
be approved and live.
