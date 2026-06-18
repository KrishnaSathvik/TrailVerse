# Trailie capabilities — public vs internal accuracy

**Purpose:** Keep marketing, demos, and agent handbooks aligned with what the codebase actually does.  
**Related:** [trailie-web-search-product-policy.md](./trailie-web-search-product-policy.md) (web search gates in detail)

Last reviewed: 2026-06-18

---

## Safe public one-liner

Use on `/plan-ai`, `/chatgpt`, press, App Directory:

> **Trailie** on TrailVerse plans outdoor trips — deep live data for **470+ NPS parks and sites**, plus **state parks and local spots** when you sign in. Compare parks, build day-by-day itineraries, and factor in permits, closures, weather, and crowds when TrailVerse has them.

Shorter:

> **Trailie** — choose where to go outdoors, plan day by day, and adjust as dates, budget, or lodging change. NPS-first data; sign in for state parks and local logistics.

---

## Internal one-liner (engineering / sales)

Trailie is an **NPS-first outdoor trip-planning agent** with structured backend context (`STRUCTURED_CONTEXT_JSON`), live fact fetching (NPS, weather, optional web), constraint parsing, itinerary validation, and streaming UI — **not** a guarantee that every reply is complete, live, or optimal (LLM + heuristics).

---

## What the code guarantees vs what prompts ask for

| Layer | Guaranteed by code | Depends on LLM behavior |
|--------|-------------------|------------------------|
| Fetch NPS/weather for catalog parks | Yes (when `parkCode` + query needs it) | — |
| Skip web for anonymous users | Yes | — |
| Web search gates (`needsWebSearch`) | Yes | — |
| `parseConstraints` / message overrides | Yes (regex/heuristic) | — |
| `tripState` merge order | Yes | — |
| `riskFlags`, preflight, itinerary validation | Computed and injected | Model must follow blocks |
| “Pick one park” on compare | — | Prompt policy |
| Realistic pacing / pushback | — | Prompt + validation hints |
| Day-by-day `[ITINERARY_JSON]` | Extracted when present | Model must emit JSON |
| Honest “data missing” copy | Policy in `coreTrailiePolicy.js` | Model must comply |

**Do not claim:** “Trailie always returns X” or “always uses live web” unless the specific query path is verified.

---

## Account tiers (website `/plan-ai`)

| Capability | Guest (anonymous) | Logged in |
|------------|-------------------|-----------|
| Chat with Trailie | Yes (5 user messages / session) | Unlimited |
| NPS + weather facts (catalog parks) | Yes | Yes |
| Web search | **No** (by design) | Yes (when `needsWebSearch` passes) |
| Save trips / chat history | No | Yes |
| My Recommendations button | No | Yes (after **3+ distinct trip `parkCode`s**) |
| Quick Fill (Plan My Trip) | Yes | Yes |

Guests can still plan NPS trips; push sign-up for **live web**, **local logistics**, and **named non-NPS** destinations.

---

## Quick Fill

- **Form:** National Parks only (`QuickFillModal` filters `designation === 'National Park'`).
- **Chat:** Any destination text (including state parks, forests, named places).
- Sends structured `formData`, `parkCode`, coordinates, and auto-built summary message to the API.

---

## My Recommendations

- **Unlock:** `uniqueParksCount >= 3` from saved trips’ `parkCode`s (not favorites alone).
- **UX:** Chat mode only — hidden kickoff message, one clarifying question, then suggestions.
- **Context:** Trip history + DB favorites/visited via `buildUserContext` when logged in.
- **Not built:** Visual card carousel / ranked deck.

---

## Web search (summary)

See [trailie-web-search-product-policy.md](./trailie-web-search-product-policy.md).

**Logged-in examples that should web-search:** Custer State Park itinerary, Valley of Fire, Starved Rock open/closed, Hocking Hills vs Red River Gorge.

**Examples that should not (v1):** “Best state parks near Chicago”, pure 3-day Yosemite itinerary (NPS-first).

**NPS compare (Yosemite vs Sequoia):** Catalog/NPS data — web usually skipped by design.

---

## Source-aware thinking UI

Implemented on `/plan-ai` streaming only (`thinking` SSE events → `TypingIndicator`).  
Not shown on shared trip read-only pages.

---

## Not built yet (do not imply in copy)

1. **Non-NPS destination resolver** — no structured `{ name, type, agency, lat, officialUrl, confidence }`.
2. **Quick Fill for state parks / non-NPS**.
3. **Visual My Recommendations** (cards/slides).
4. **Open-ended state-park discovery via web** (“best near Chicago”).
5. **Deterministic itinerary quality** — validation assists; output varies.

---

## Marketing copy checklist

Before publishing capability claims, verify:

- [ ] Say **470+ NPS parks and sites** (not “64 national parks only” unless that page is scoped).
- [ ] Say **when live data is available** — not “always real-time”.
- [ ] Mention **sign-in** for web search, state parks, saved trips.
- [ ] Quick Fill = **National Parks dropdown**; chat = broader.
- [ ] My Recommendations = **chat**, unlock at **3 planned parks**.
- [ ] ChatGPT/MCP apps = **NPS read tools + anonymous plan limits**; not full logged-in web search stack.

---

## Suggested engineering priorities (accuracy gaps)

1. **Non-NPS resolver** — biggest product gap vs “outdoor agent” positioning.
2. **Quick Fill destination type** — state park / forest picker or free-text geocode.
3. **My Recommendations UI** — cards fed by same backend context.
4. **Open-ended discovery** — candidate parks from catalog + optional web, with source confidence.
5. **Eval harness** — run `factsWebSearchPolicy.test.js` + hard prompts in CI; don’t claim “all passed” without CI artifact.

---

## Demo prompts that match current code

These are reliable demo questions (still LLM-dependent on wording):

- 3-day late-September **Yosemite vs Sequoia** — compare, pick one (NPS-first).
- Realistic **2-day Zion** couple trip, then follow-up “more relaxed, avoid shuttles”.
- **Glacier** one day in July + Logan Pass parking backup.
- **Valley of Fire** weekend from Vegas (**logged-in** for web grounding).
- Quick Fill **Yosemite** → user corrects “solo, camping, cheaper” in chat.

Avoid in guest demos: Custer, Valley of Fire live conditions, restaurants near park (web upsell / no data).
