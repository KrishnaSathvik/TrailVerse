# /plan-ai Product & UX Audit — 2026-08-31

Fresh end-to-end manual pass of Trailie at `/plan-ai`, run locally (Express :5001 + Next :3001, Trailie V2 runtime ON, repair defaults as shipped). Five traveler journeys, guest (anonymous) path throughout — the first-time-visitor experience. **No code was changed. Nothing was committed.**

Screenshots referenced below live in this folder.

## How the journeys went (summary)

| # | Journey | What happened |
|---|---------|---------------|
| 1 | "Plan me 3 days in Canyonlands." | Structured itinerary generated (57s), then **the UI destroyed it** (P0-1). Restored only after a page reload. Content is template-y and evasive (P1-2, P1-3). |
| 2 | "3 days in Zion, easy walks, bad knee, sunrise/sunset, no scary exposure." | Classified `general_qa`, **not** an itinerary — traveler gets a (good!) prose answer but loses the whole itinerary product: no day cards, no save, no trip artifact. Response also truncated mid-sentence (P0-3, P1-4). |
| 3 | "Make the second morning more relaxed." | Good conversational answer, but the itinerary cards above **do not visibly change** — traveler must merge prose into the plan mentally (P1-5). |
| 4 | "Should I spend 3 days in Yosemite or Sequoia?" | Correctly gives a comparison verdict (Yosemite), no forced itinerary. But it **fabricates "your stated $3 total budget"** and "solo trip" from hidden form defaults (P0-4). Header says "Planning Sequoia" while recommending Yosemite (P2-3). |
| 5 | Glacier, early Oct, 24-ft RV, permits/GTSR | 2m07s wall clock (P1-1). Caveats exist but only as a 12-line wall of prose; the itinerary still anchors Days 2–3 on Going-to-the-Sun Road for a vehicle over the road's 21-ft limit, with "check current official vehicle restrictions" as a disclaimer (P0-5, P1-6). |

---

## P0 — product-breaking, fix before anything else

### P0-1 · Completed plans are destroyed in front of the traveler
`audit-05-loading-20s.png` → `audit-06-mid-stream.png` (conversation gone)

~60 seconds after each guest send, the whole transcript resets to the empty greeting — reproduced 3/3 times, twice destroying a *finished* plan the backend generated successfully (57.6s turn, `canonicalPlanState: accepted`), once wiping mid-stream. The traveler waits a minute, sees their itinerary, and watches it vanish.

Mechanism (from console traces): a ~60s cache expiry on `/ai/session-status` + `/ai/providers-anonymous` flips `providersLoaded`/restore-status state, which re-runs the init effect in [TripPlannerChat.jsx:1274](../../next-frontend/src/components/plan-ai/TripPlannerChat.jsx#L1274); the "restored session" guards read a stale `messageCount: 0` and call `showWelcomeMessage()`, which resets `messages` even while `isGenerating`. The transcript survives in temp state — a manual page reload brings it back (`audit-09`) — which proves the wipe is pure client state mismanagement. Dev-mode Fast Refresh may amplify the trigger; the guard logic is unsafe regardless (nothing should ever be allowed to clobber a live conversation).

### P0-2 · Guest transcript accumulates invisible duplicate turns
`audit-11-j1-scroll2.png`

Because wiped turns persist server-side, the restored transcript contained **three stacked copies** of "Plan me 3 days in Canyonlands." with three different full plans. A guest who reloads sees a conversation they never had. Same root cause family as P0-1, but needs its own fix (dedupe/reconcile on restore).

### P0-3 · Constraint-heavy phrasing loses the itinerary product entirely
`audit-16-j2-zion-answer.png`

"3 days in Zion, easy walks only, I have a bad knee…" → intent `general_qa` (2.6s classification), while "Plan me 3 days in Canyonlands." → `simple_itinerary`. The traveler who gives you the *most* information gets the *least* product: markdown prose instead of day cards, no plan artifact, no save/share, and the refinement machinery never engages. (This matches the known traveler-job regex resolver gap — but it is now visibly a product bug, not a harness stat.) The prose answer itself was excellent, which makes the asymmetry worse: quality of experience depends on phrasing luck.

Also: this response **ended mid-sentence** ("…the gentlest current conditions for your") with an internal `incomplete` status — truncation shipped to the traveler with no retry affordance.

### P0-4 · Hidden form defaults are voiced as traveler statements
`audit-21-j4-comparison.png`

The comparison answer says: "The main issue is your **stated $3 total budget**: … transportation, food, and lodging would make a three-day trip impossible at that ceiling." The traveler never stated a budget — `formData` defaults (budget, groupSize=1 → "solo trip") leak into the prompt as if the traveler said them, and the model then *argues with the phantom constraint* for a full paragraph. This destroys trust instantly ("it's making things up about me").

### P0-5 · Known hard vehicle limits don't reach the plan
`audit-22-j5-glacier-top.png`, `audit-23-j5-glacier-itinerary.png`

Traveler states a 24-foot RV. Going-to-the-Sun Road has a hard 21-foot vehicle length limit (stable, published NPS fact — not an ephemeral condition). The plan still builds Days 2–3 around driving GTSR, with the vehicle question handled as "I could not verify the applicable … dimension limits … so do not take the 24-foot RV onto that road until you have checked." Internally carrying a requirements pipeline is useless if a stated vehicle constraint can't veto (or restructure) the anchor of the trip. This is the exact `requirements[]`-to-traveler gap the roadmap called out: the fact never became a structured, binding requirement.

---

## P1 — the visible product problems to fix next

### P1-1 · Latency: 26s–127s per answer, with a thin progress strip
Turn wall-clocks observed: 25.7s (Zion QA), 28s (Canyonlands cached), 57.6s (Canyonlands cold), **127.3s (Glacier full_trip)**. The progress stages ("Checking current conditions…", "Building a realistic plan…", NPS Data chip — `audit-04`, `audit-05`) are honest but static for minutes at a time; nothing streams into view until late. At 2+ minutes, travelers will assume it hung. Needs: progressive day-by-day render actually visible (the plumbing exists per the progressive-response work), time expectations set in the UI, and the P0-1 fix so waiting is ever rewarded.

### P1-2 · Itinerary content is defensive scaffolding, not a trip
`audit-09`, `audit-10-j1-itinerary-day1.png`, `audit-12-j1-bottom.png`

Stop titles in the structured path: "Island in the Sky overlook and pullout circuit", "Priority Canyonlands landscape return", "Canyonlands National Park final landscape stop", "Canyonlands district conditions check" (a *stop* that is a conditions check). Zero named viewpoints — no Mesa Arch, no Grand View Point — while the `general_qa` path happily names Pa'rus Trail and Canyon Junction. The evidence-restraint policy is over-applied to naming: the traveler gets a plan that could describe any park, and the "useful vs template-y" test fails.

### P1-3 · Machine reasoning leaks into traveler-facing text everywhere
- Intro: "I haven't assigned named hikes because the trip details don't include a hiking preference, walking limit, vehicle type, or a verified list of route conditions." (`audit-09`)
- Stop notes: "It is included as a clear boundary for a remote-area interest, not as a default activity." (`audit-10`)
- Glacier: "the information provided here does not identify a separate, verified replacement experience, **so I have not invented one**." (`audit-23`)
- Repair-chain artifact as a stop description: "This adds a genuine scenic experience that follows naturally from Apgar and **requires no changes to the existing stop**." (`audit-24-mobile-itinerary.png`) — that's the coverage-repair utility explaining itself to the traveler.

The system prompt's evidence policy and the repair chain's justifications are being rendered verbatim. Trailie sounds like a compliance engine narrating its own guardrails, not a knowledgeable friend. This is the single biggest "feel" problem.

### P1-4 · Responses can end mid-sentence with no recovery
See P0-3. Truncated output renders as-is; no "continue"/retry, no visual indication anything is missing.

### P1-5 · Refinement doesn't visibly change the plan
`audit-19`, `audit-20-j3b-refine-result.png`

"Make the second morning more relaxed" on a structured Canyonlands plan → a good prose reply below the plan ("Make Day 2 a slow Needles morning… Cave Spring Trail or Big Spring Canyon…"), but the Day 2 card above is untouched and nothing marks what changed. The machine-owned refinement chain (resolve referent → bounded patch → persisted revision) was proven live on the backend, yet the traveler experience is "here's a paragraph, please re-read your plan and reconcile it yourself."

### P1-6 · Operational facts arrive as a 12-line wall of prose
`audit-22-j5-glacier-top.png`

The Glacier intro packs road-status uncertainty, 2026 vehicle-reservation policy, entrance requirements, RV limits, and shuttle caveats into one unbroken paragraph *above* the plan. The right facts exist; they're just unshaped. Permit/closure/vehicle requirements need to be structured chips/callouts pinned to the specific day/stop they affect (Day 2: "Road status: check morning NPS report" / "Vehicle: 21-ft limit — your RV exceeds this").

### P1-7 · Errors dead-end the traveler, and upsells sit on top of failures
`audit-02-backend-error-state.png`, `audit-15-j2-zion-fresh.png`

- Backend-down: "Something went wrong on my side. Please try again in a moment." — decent voice, but no retry button; the traveler must retype. Directly beneath the failure: "Want to keep this chat? Save Chat Free" — an upsell attached to a failure.
- Guest limit: Trailie asks "Which park should I plan for?" and in the same breath locks the composer with the 5-message limit — a question the traveler is forbidden to answer. Quota-check should run before emitting a clarifying question, or the limit message should absorb the pending question.
- Limit copy also promises "This conversation stays on your device" — currently false in spirit given P0-1.

### P1-8 · Guest sessions bleed across "fresh" visits, invisibly
`audit-15-j2-zion-fresh.png`

Anonymous identity is `hash(IP + UA + fingerprint)` ([anonymousIdGenerator.js:76](../../server/src/utils/anonymousIdGenerator.js#L76)), so a traveler who cleared site data — or a *different person* on the same NAT/shared computer — inherits someone's trip context: fresh, empty-looking chat, first message answered with "I have this trip set to **Canyonlands**…" referencing a conversation that isn't on screen. Baffling. Server-side context reattachment needs to be gated on the client actually presenting the transcript it refers to.

---

## P2 — polish

- **P2-1 · Suggested prompts read as SEO strings** (`audit-01-opening-desktop.png`): "Plan a relaxed 3-day Zion National Park trip for a first-time visitor with easy walks and scenic viewpoints" — nobody types like this; they teach the keyword-stuffed phrasing that (per P0-3) is also not required. Shorter, human prompts ("3 relaxed days in Zion", "Yosemite or Sequoia?") would set the right tone and exercise real intents. Opening screen otherwise good; large dead zone between suggestions and composer on desktop.
- **P2-2 · No maps anywhere in the journey.** Five journeys, zero map surfaces in chat (a `[tripId]/map` route exists but nothing in the conversation leads there). Stops have no geographic anchoring at all.
- **P2-3 · Header meta mislabels turns**: "Planning Sequoia" on a comparison whose verdict was Yosemite (`audit-21`); "Planning Zion" atop a transcript whose visible content was Canyonlands (`audit-13`, session-bleed variant).
- **P2-4 · Duplicate-question answering**: the three duplicate Canyonlands turns produced three *different* plans (flex-day version, Maze version), silently — no "we already planned this; want me to update it instead?"
- **P2-5 · Quick-fill modal fine on mobile** (`audit-25`), but doesn't close on Escape.
- **P2-6 · Mobile itinerary is solid** (`audit-24`) — timeline collapses well. Main mobile debt is inherited from P1-2/P1-3 (verbose meta-text reads even worse on a phone).
- **P2-7 · Sunrise preference silently dropped in prose refinement** (`audit-18`): "Sleep in … rather than aiming for sunrise" — tradeoff acknowledged in passing, but for a traveler who *led* with "love sunrise and sunset", the plan should say what happens to the other sunrise days.

## What's genuinely good (keep)

- Progress stages are real, not fake (`Checking current conditions…` → `Building a realistic plan…` + NPS Data chip).
- The `general_qa` voice is excellent — warm, specific, constraint-aware ("turn around whenever your knee asks for it"). That's the voice the itinerary path should have.
- Comparison intent works: direct verdict + rationale, no forced itinerary.
- Park disambiguation ("this trip is set to Canyonlands, but you're asking about Zion — which one?") is the right behavior when context is *visible*.
- Timeline itinerary layout (day headers, time-of-day + duration + difficulty) is a clean skeleton; the problem is what fills it.
- Save Trip CTA at plan end; header title updates to "Planning {Park}".

## Environment notes (not product findings, but needed to run this)

- `/plan-ai` (and every non-root route) 404'd until `next-frontend/.next` (stale Aug 16 build from an older Next) was deleted — clean dev start needed.
- Trailie is dead without env: `TRAILIE_V2_RUNTIME_ENABLED=true` and `TRAILIE_EVIDENCE_REFRESH_HASH_SECRET` (503 / `evidence_refresh_hash_secret_missing`). Neither is in `server/.env` — worth adding to `.env` locally and asserting at boot with a clearer message.
- Local `server/.env` points at the **production Atlas cluster** (`trailverseapp.plpij7w`) — this audit deliberately stayed on the guest path and created no accounts, but local dev writing anon sessions to prod is its own risk worth fixing (a dev database).

## Suggested fix order

1. **P0-1/P0-2** — nothing else matters while finished plans evaporate.
2. **P0-4** — stop injecting unstated form defaults as traveler statements (small fix, huge trust win).
3. **P0-3** — route constraint-heavy phrasings into the itinerary product (the known resolver gap, now traveler-visible).
4. **P1-3 + P1-2 together** — one presentation-layer pass: strip machine-reasoning from traveler text, allow named places under the existing evidence rules. This is the "feels like a travel companion" lever.
5. **P0-5 + P1-6** — bind stated vehicle/permit constraints as structured, plan-shaping requirements with per-stop callouts.
6. **P1-5** — render refinements as visible plan changes.
7. **P1-7/P1-8, then P2s.**
