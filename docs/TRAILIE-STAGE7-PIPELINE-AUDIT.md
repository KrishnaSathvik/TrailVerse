# Stage 7 — Trailie End-to-End Pipeline Audit

**Status:** Evidence-based static code trace. No code changed, nothing committed/pushed.
**Reviewer mode at time of audit:** `SHADOW` (default — see F-PERF-1).
**Method note:** This audit traces the *actual* production code paths (`/chat-stream`, `/chat`, anonymous variants) with `file:line` evidence. The 16 scenario fixtures and the shadow-review precision sample (spec §2, §14) require **dynamic execution** and are **not** fabricated here — they are called out as the required next step. Every claim below is grounded in a code reference, not inferred behavior.

---

## 1. End-to-end pipeline diagram (as actually implemented)

```
User input (TripPlannerChat.jsx)
  → aiService.chatStream / chatAnonymousStream          [frontend, SSE]
  → POST /chat-stream (protect, trackTokenUsage)         ai.js:2709
      → attachClientDisconnectAbort(req)                 ai.js:2718  (AbortSignal)
      → SSE: thinking event                              ai.js:2721
      → prepareChatContext(body)                         ai.js:705–1572
          ├─ resolve metadata / park extraction          (parkExtractor, resolvedMetadata)
          ├─ parseConstraints / detectConflicts /
          │  detectHypothetical / detectIntent           constraintEngine.js
          ├─ planTrailieFetches(fetchPlan)               ai.js:1014
          ├─ fetchRelevantFacts(...)                      ai.js:1032  → factsService
          │     weather / web / astro / feeFree
          ├─ NPS facts (per-park, parallel if >1)         ai.js:1055–1082
          ├─ canonicalFactBundle + canonicalFactStatus    ai.js:1067 / 1080 / 1091
          ├─ buildTrailieContext / system prompt assembly trailieContextBuilder.js
          └─ returns preparedContext (40+ fields)         ai.js:1572
      → appendUserContextToPrompt                         ai.js:2777
      → SSE: thinking (sources, parkImages)               ai.js:2787
      → streamRawLLMToSse(res, {...})                     aiProviderStream.js:12
          └─ RAW token deltas streamed as {type:'chunk'}  aiProviderStream.js:63–65   (NO tool support)
      → SSE: stream_end                                   ai.js:2818
      → processPreparedTrailieResponse                    ai.js:2374
          → processAssistantResponse                      ai.js:2002
              ├─ conflict retry (extra LLM call)          ai.js:2050
              ├─ extractItineraryFromResponse             claudeResponseParser.js:28
              │     (toolItinerary | [ITINERARY_JSON])
              ├─ fallback extraction (extra Claude call)   ai.js:2129
              ├─ validateItineraryConstraints             constraintEngine.js
              ├─ correctItinerary (≤2 passes)             itineraryCorrector.js  → ai.js:2179
              ├─ regeneration (extra LLM call)            ai.js:2216
              ├─ enrichItineraryDrivingTimes              ai.js:2278
              ├─ validateItineraryFeasibility             extractItineraryJSON.js:74
              ├─ scoreItinerary                           ai.js:2288
              ├─ enrichItineraryParkIdentity              ai.js:2291
              ├─ runTrailieReviewPipeline (SHADOW)        ai.js:2305  ← detector-only, discarded
              │     └─ per-section Claude calls,          trailieReviewPipeline.js:360
              │        policy → verification → fail-safe
              ├─ append formatCorrectionNotice            ai.js:2331
              └─ stripAnyItineraryJsonArtifacts           ai.js:2347
      → saveStreamItineraryToTrip (void, fire-and-forget) ai.js:2877  → TripPlan.plan
      → finalizeParkImagesAndMetadata                     ai.js:2884
      → computeContentUnchanged(processed, strippedStream) trailiePipelineUtils.js:204
      → SSE: done { contentUnchanged, [content], itineraryData, planScore, ... }  ai.js:2898
      → res.end()
  → frontend onDone: keep streamed text OR replace        TripPlannerChat.jsx:1628–1682
  → frontend auto-save conversation + plan                TripPlannerChat.jsx:2424/2446  (updateTrip/createTrip)
  → share: /trips/shared/:shareId (strips reviewMeta/auditTrail)  trips.js:30, 15–21
```

**Key structural facts:**
- The reviewer runs **after `stream_end` and before `done`** (ai.js:2818 → 2827 → 2898). Prose is already visible; the **itinerary card, planScore, images, and persistence are gated behind the reviewer's runtime.**
- Streaming uses **raw text only** — no `create_itinerary` tool (aiProviderStream.js has no `tools`). The tool exists only on non-streaming `/chat` (ai.js:2439) and `/chat-anonymous` (ai.js:3572).
- All four chat routes funnel post-processing through `processPreparedTrailieResponse` (ai.js:2374), which is the single seam that injects canonical evidence — this is a genuinely good invariant (prevents the Stage 6A plumbing regression).

---

## 2. Request/response mutation table (streaming path)

| Stage | Input shape | Output shape | File:line | Mutation / risk |
|---|---|---|---|---|
| Raw stream | tokens | `fullContent` (raw, incl. `[ITINERARY_JSON]`) | aiProviderStream.js:63 | Streamed verbatim; JSON block flows to client |
| Frontend display | raw chunk | `stripItineraryJsonForDisplay(raw)` | streamDisplayContent.js:4 | **Weaker strip than server** (F-STREAM-1) |
| Extract itinerary | `content`,`toolItinerary` | `{cleanContent, itineraryData}` | claudeResponseParser.js:28 | Tool wins over inline |
| Discard-if-unrequested | itineraryData | maybe `null` | ai.js:2101 | Silent drop if `!userRequestedItinerary` |
| Fallback extraction | prose | itineraryData (invented coords) | ai.js:2122–2144 | **Extra Claude call; lat/lon "estimate if needed"** (F-ACC-2) |
| Constraint correction | itineraryData | corrected itineraryData + corrections | ai.js:2179–2214 | Stops removed; prose NOT re-synced |
| Driving enrichment | itineraryData | itineraryData + drive times | ai.js:2278 | Timeout race → partial |
| Feasibility | itineraryData | warnings[] | extractItineraryJSON.js:74 | **Computed, never shown** (F-QUAL-1) |
| Shadow review | content + facts | content (unchanged in shadow) + reviewMeta | trailieReviewPipeline.js:269 | Structurally can't alter content in shadow (good) |
| Correction notice | content | content + notice | ai.js:2331 | Appended only when corrections applied |
| JSON artifact strip | content | content | extractItineraryJSON.js:11 | Final server strip (stronger) |
| `contentUnchanged` gate | processed vs strippedStream | bool | trailiePipelineUtils.js:204 | Assumes server/client strippers equivalent (F-STREAM-1) |
| Persist (server) | itineraryData | `TripPlan.plan` | ai.js:573–591 | Fire-and-forget; races frontend (F-PERSIST-1) |
| Persist (frontend) | messages + plan | trip.conversation + trip.plan | TripPlannerChat.jsx:2424 | Authoritative for prose; may drop reviewMeta (F-PERSIST-1) |

---

## 3. Scenario coverage table

Legend: ✅ statically traceable & handled · ⚠️ handled with a caveat/finding · ❓ requires dynamic run to judge quality/precision.

| # | Scenario | Coverage | Notes |
|---|---|---|---|
| 1 | Single-park weekend | ✅ | Single-park canonical bundle via `factsResult` (ai.js:1080) |
| 2 | 7-day long itinerary | ⚠️ | Many sections → many reviewer Claude calls (F-PERF-1); token/JSON truncation risk mid-`[ITINERARY_JSON]` (F-ACC-1) |
| 3 | Multi-park road trip | ⚠️ | Multi-park bundle **omits astro/feeFree canonical facts** (F-DATA-1); NPS facts merged per-park (ai.js:1067) |
| 4 | Non-NPS destination | ⚠️ | Itinerary stripped unless `webSearchFacts || isTravelRelated` (ai.js:2150) |
| 5 | Active NPS closure | ❓ | Canonical `ACTIVE_CLOSURE` facts exist; correctness needs dynamic run |
| 6 | Rec.gov unknown permit | ✅ | Reviewer prompt: "Rec.gov listing never proves a permit is required" (trailieReviewPipeline.js:62); `LISTING_ONLY` status |
| 7 | Confirmed permit | ❓ | `CONFIRMED_REQUIRED` status modeled; needs dynamic verification |
| 8 | Near-term forecast | ✅ | `makeWeatherFact` FORECAST kind (canonicalFacts.js:153) |
| 9 | Distant climate estimate | ✅ | `CLIMATE_ESTIMATE` kind separated from live (canonicalFacts.js) |
| 10 | Family + easy hike | ⚠️ | Constraints validated + corrected (ai.js:2170); prose not re-synced (F-INT-1) |
| 11 | Accessibility request | ❓ | Constraint capture exists; deterministic validation coverage unverified (F-CONSTRAINT-1) |
| 12 | Over-packed itinerary | ⚠️ | Feasibility computed but **not surfaced** (F-QUAL-1) |
| 13 | Conflicting constraints | ✅ | `detectConflicts` → Option A/B retry (ai.js:2050) |
| 14 | Provider/fetch timeout | ⚠️ | `canonicalFactStatus=FETCH_FAILED` on throw (ai.js:1091); reviewer timeout per-section (trailieReviewPipeline.js:242) |
| 15 | Follow-up modifying itinerary | ❓ | Context resolution exists; needs dynamic run |
| 16 | Saved-trip regeneration | ❓ | Needs dynamic run |

**No dynamic fixtures were executed.** Building the deterministic fixtures in spec §2 and running the §14 precision sample is the required precondition for any enforcement decision.

---

## 4. Prioritized findings

Grouped per spec §15. Severity reflects user impact + enforcement risk.

### Accuracy and safety

**F-ACC-1 — Streaming has no structured-output tool; itineraries depend on inline `[ITINERARY_JSON]` that can truncate.** `high`
- Stage: raw generation → extraction. Streaming path never passes `tools` (aiProviderStream.js:12–100); the tool is only on non-streaming routes (ai.js:2439). The buddy prompt makes `[ITINERARY_JSON]` MANDATORY (claudeBuddyPrompt.js:50). A long 7-day plan can hit `max_tokens` (8000) mid-block → malformed JSON → extraction fails → fallback Claude call (ai.js:2129) → if that also fails, **no itinerary card** despite a planning request.
- Evidence: aiProviderStream.js:1–5 (TODO acknowledges legacy `[ITINERARY_JSON]`), ai.js:2113–2148.
- User impact: silent loss of the structured plan on the *primary* (streaming) path.
- Recommended fix: stream with `create_itinerary` tool (tool-use streaming), or emit the JSON block first / cap prose length; add a truncated-`[ITINERARY_JSON]` detector that forces regeneration rather than fallback-inventing.
- Enforcement blocker: **yes** — reviewer cannot audit an itinerary that was dropped.

**F-ACC-2 — Fallback extraction invents coordinates.** `medium`
- The fallback prompt instructs "Include latitude/longitude (estimate if needed)" (ai.js:2123–2125). Estimated coords feed `validateItineraryFeasibility` haversine backtracking/overnight-distance checks (extractItineraryJSON.js:110–142) and the map. Invented lat/lon can produce false feasibility warnings or wrong map pins.
- Recommended fix: null coordinates when unknown; never synthesize; let enrichment/geocode fill them.
- Enforcement blocker: no (but pollutes evidence the reviewer scopes on).

### Structured itinerary integrity

**F-INT-1 — Constraint corrections mutate `itineraryData` but not the prose.** `high`
- When `correctItinerary` removes/adjusts stops (ai.js:2179–2214), only a short `formatCorrectionNotice` is appended (ai.js:2331). The **original prose still describes the removed stop** ("prose vs JSON mismatch" — the exact class the reviewer flags as `prose_json_mismatch`). The saved itinerary and the visible narrative disagree.
- Evidence: ai.js:2200 (itinerary replaced), 2331 (notice only); reviewer type `prose_json_mismatch` (trailieReviewPipeline.js:71).
- User impact: user reads a stop in the text that isn't in the saved plan.
- Recommended fix: when corrections change stops, either regenerate prose for affected days or explicitly strike the removed stops in-text.
- Enforcement blocker: **yes** — this is the primary correctness gap the reviewer is meant to catch; enforcing on top of an already-inconsistent prose baseline is unsafe.

### Live-data grounding

**F-DATA-1 — Multi-park canonical bundle omits non-NPS/non-weather facts.** `medium`
- Single-park uses the full `factsResult.canonicalFactBundle` (ai.js:1080). The multi-park branch rebuilds the bundle from **only** per-park NPS facts + primary-park weather (ai.js:1067–1070), dropping any astro/fee-free canonical facts the single-park path would include. On road trips the reviewer sees a thinner evidence set than generation did.
- Recommended fix: merge all canonical fact sources (incl. astro/feeFree) in the multi-park branch; assert bundle parity with the prompt facts.
- Enforcement blocker: no, but weakens multi-park review coverage.

**F-DATA-2 — Weather facts are primary-park-only on multi-park trips.** `low`
- ai.js:1069 attaches only `weatherCanonicalFacts` (primary park). Secondary parks have no weather evidence for the reviewer to check date/forecast claims against.
- Recommended fix: fetch/attach weather per park or scope-tag reviewer expectations accordingly.

### Streaming / frontend

**F-STREAM-1 — Server and client itinerary-JSON strippers diverge, yet `contentUnchanged` assumes they're equivalent.** `medium`
- `contentUnchanged` (trailiePipelineUtils.js:204) returns true when `processed.cleanContent === strippedStreamContent`, in which case the server **omits `content`** and the client keeps its own `stripItineraryJsonForDisplay(raw)` (TripPlannerChat.jsx:1632–1634). But the client stripper only removes the well-formed `[ITINERARY_JSON]…[/ITINERARY_JSON]` bracket form + trailing open marker (streamDisplayContent.js:4–17), while the server's `stripAnyItineraryJsonArtifacts` also removes orphan closing markers, fenced ```` ```json ITINERARY_JSON ```` blocks, and bare `ITINERARY_JSON:` labels (extractItineraryJSON.js:11–35). If the model emits any of those variants, the server considers them stripped (→ `contentUnchanged=true`, no content sent) but the **client leaves the artifact visible**, and the same artifact is then **persisted** (F-PERSIST-1).
- Recommended fix: share one stripper (ship the server regex set to the client), or send `content` whenever the server strip changed anything.
- Enforcement blocker: no.

**F-STREAM-2 — Shadow review delays the `done` event (itinerary card / images / persistence).** `high` (UX/latency)
- See F-PERF-1. The prose streams immediately, but the itinerary card, planScore, park images, and trip save are all in the `done` payload emitted only after `processAssistantResponse` — which awaits the full per-section reviewer run. A section timeout is 12s (trailieReviewPipeline.js:52). Users can wait seconds after the text finishes for the plan card to appear, for zero user-visible benefit in shadow mode.

### Persistence / share / export

**F-PERSIST-1 — Two uncoordinated writers to `trip.plan`; frontend content (not server-validated content) is authoritative.** `high`
- Server writes `TripPlan.plan` fire-and-forget with `reviewMeta`+`auditTrail` (ai.js:2877 → 573–591). The frontend independently writes `trip.plan = planToSave` (no reviewMeta/auditTrail) and `trip.conversation = persistedMessages` (TripPlannerChat.jsx:2424/2446). Last-writer-wins is unordered, so `reviewMeta`/`auditTrail` may or may not survive. Worse, in the `contentUnchanged=true` case the **persisted prose is the client's weaker-stripped stream** (F-STREAM-1), not `response.content`.
- Recommended fix: single writer. Either server persists the message + plan authoritatively (return canonical content the client echoes), or the client saves and the server never double-writes `plan`.
- Enforcement blocker: **yes** — "what user saw = what was saved" cannot be guaranteed today.

**F-PERSIST-2 — Sharing exposes the entire conversation, not just the itinerary.** `low`
- `/trips/shared/:shareId` correctly strips `reviewMeta`/`auditTrail` from `plan` (trips.js:15–21, 55) — good — but returns `trip.conversation` in full (trips.js:54), including every user message. Any private detail a user typed becomes public on share.
- Recommended fix: confirm this is intended; consider sharing only the plan + assistant turns, or a share-scope toggle.

### Performance and reliability

**F-PERF-1 — Reviewer defaults to SHADOW and runs Claude calls on every planning request; output is discarded.** `high` (cost/latency)
- `TRAILIE_REVIEWER_MODE` is unset in all `.env*` files → `resolveReviewerMode` defaults to `SHADOW` (reviewerFailSafe.js:49). `runTrailieReviewPipeline` is called unconditionally in `processAssistantResponse` (ai.js:2305) and issues **one Claude call per section window** (up to 4 concurrent, 12s timeout each; trailieReviewPipeline.js:216–246, 360). For every user planning message this adds N discarded Claude calls + latency to the `done` event.
- Recommended fix: gate shadow sampling (e.g., run on X% of traffic or async out-of-band after `done`) until enforcement; move review off the request's critical path so it never delays the card.
- Enforcement blocker: no for correctness, but a hard cost/latency blocker for always-on operation.

### Response quality

**F-QUAL-1 — Feasibility warnings and `correctionSummary` are computed but never shown.** `medium`
- `correctionSummary` (ai.js:2165) is assigned the "📍 Adjusted…" and "⏱️ After adjustment" feasibility text (ai.js:2206, 2212) then **never appended** to output (only `formatCorrectionNotice` is, ai.js:2331). `validateItineraryFeasibility` results (`feasibilityIssues`) are returned but not placed in the `done` payload. Over-packed-day, excessive-driving, and backtracking warnings never reach the user.
- Recommended fix: surface feasibility warnings in the itinerary card or append them; delete the dead `correctionSummary` accumulation.
- Enforcement blocker: no.

**F-QUAL-2 — Prompt duplicates the "MANDATORY `[ITINERARY_JSON]`" instruction 3×.** `low`
- claudeBuddyPrompt.js:50, 163, 223 all restate the same mandatory-block rule, plus a 4th runtime reminder (ai.js:1531/1536). Redundant prompt mass; no contradiction found, but consolidate.

---

## 5. Enforcement blockers (must clear before `ENFORCE`)

1. **F-ACC-1** — structured plan can be silently dropped on the streaming path; reviewer can't audit what isn't produced.
2. **F-INT-1** — prose/JSON mismatch after correction is unresolved in the baseline; enforcing on an inconsistent baseline is unsafe.
3. **F-PERSIST-1** — "what user saw = saved = restored" is not guaranteed (two writers + client-authoritative weak-stripped content).
4. **Missing dynamic evidence** — the §14 precision sample (false-positive/false-negative classification on real fixtures) has **not** been produced. Enforcement requires it.

Not blockers but required for healthy operation: F-PERF-1 (take review off the critical path), F-STREAM-1/F-DATA-1 (evidence + display parity).

---

## 6. Quick fixes vs architectural fixes

**Quick (localized, low-risk):**
- F-DATA-1/F-DATA-2: include all canonical sources in the multi-park merge (ai.js:1067).
- F-QUAL-1: append/surface feasibility warnings; delete dead `correctionSummary`.
- F-QUAL-2: dedupe prompt itinerary instructions.
- F-STREAM-1: ship the server stripper regexes to the client (single source).
- F-ACC-2: stop synthesizing coordinates in fallback extraction.

**Architectural (cross-cutting):**
- F-ACC-1: tool-use streaming (or JSON-first ordering) for structured output.
- F-INT-1: prose re-sync after itinerary correction.
- F-PERSIST-1: single authoritative writer / server-returned canonical content.
- F-PERF-1/F-STREAM-2: move shadow review off the request critical path (async, post-`done`).

---

## 7. Recommended implementation order

1. **F-PERF-1 / F-STREAM-2** — move review off the critical path (async sampling). Unblocks always-on shadow data collection without latency cost. *No behavior change to users.*
2. **F-PERSIST-1** — one writer; persist server-validated content. Establishes the "saw = saved" invariant every later stage depends on.
3. **F-STREAM-1 + F-ACC-2 + F-DATA-1/2 + F-QUAL-1/2** — the quick-fix batch (display parity, evidence completeness, surfaced warnings).
4. **F-ACC-1** — structured-output streaming. Largest generation change; do it deliberately with evals.
5. **F-INT-1** — prose re-sync after correction.
6. **Only then**: build §2 fixtures, run §14 precision sample, evaluate enforcement.

---

## 8. Missing test coverage

- Streaming truncated-`[ITINERARY_JSON]` → assert no invented plan, forced regeneration (F-ACC-1).
- Server vs client stripper equivalence property test over artifact variants (F-STREAM-1).
- `contentUnchanged` round-trip: streamed display === server `response.content` === persisted `conversation` content (F-PERSIST-1).
- Multi-park canonical bundle parity: reviewer bundle facts ⊇ prompt facts (F-DATA-1).
- Post-correction prose/JSON consistency assertion (F-INT-1).
- Persistence ordering test: server + frontend writes converge with reviewMeta retained (F-PERSIST-1).
- The 16 deterministic scenario fixtures (spec §2) — none exist yet for this trace.

## 9. What is working correctly — do not change

- **Shadow-mode is structurally incapable of mutating the response.** If the fail-safe ever produces a diff in shadow, it's discarded and flagged `error` (trailieReviewPipeline.js:429–435). This is the core safety property and it holds.
- **Itinerary is frozen before review and restored if touched** (ai.js:2303, 2324–2327). Review is detector-only.
- **Single canonical-evidence injection seam** (`processPreparedTrailieResponse`, ai.js:2374) makes the Stage 6A plumbing regression structurally impossible across all four routes.
- **Verification pass is genuinely read-only** and separates "resolves conflict" from "introduces unsupported claim" (reviewVerification.js:46–91).
- **Evidence-reason taxonomy keeps "not requested" / "fetch failed" / "no relevant fact" distinct** (trailieReviewPipeline.js:40–48) — prevents empty feeds from being read as proof of absence.
- **`canonicalFactStatus` fails safe to `FETCH_FAILED`** on any threading error (ai.js:1091–1093).
- **Shadow metadata never persists fact text** — only counts/ids (trailieReviewPipeline.js:497–513).
- **Share endpoint strips `reviewMeta`/`auditTrail`** from the plan (trips.js:15–21).
- **Frontend hides `[ITINERARY_JSON]` during streaming** so raw JSON doesn't visibly flash (streamDisplayContent.js; TripPlannerChat.jsx:1593) — modulo the divergence in F-STREAM-1.
- **Client disconnect aborts the provider stream** (ai.js:2718, aiProviderStream.js:59–62).

---

*Reminder: reviewer stays in SHADOW. Do not enable enforcement, commit, or push until §5 blockers clear and the §14 dynamic precision sample is produced.*
