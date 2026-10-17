# Stage 11.1 — Anonymous Route Parity & Tool-First Contract Hardening

**Status:** Implemented TDD-first. **Not committed, not pushed.** Tool-first stays
OFF by default (`TRAILIE_ITINERARY_GENERATION_MODE=legacy`); no reviewer
enforcement, no Plan AI redesign. Closes the Stage 11 gap: all four chat routes
now share one itinerary-generation architecture.

---

## 1. Shared route orchestration flow

New single seam `services/trailieItineraryTurn.js` → `runTrailieItineraryTurn(...)`:

```text
structured-itinerary decision
→ Phase A tool generation + finalization   (tool_first only)   [orchestrateToolFirstItinerary]
→ Phase B prose generation                 (injected deliverProse)
→ processAssistantResponse(preFinalized)    (injected processPrepared)
```

Every route calls this once. Route layers keep ONLY: auth, anonymous
quota/conversion, request metadata, SSE-vs-JSON delivery, and persistence
eligibility. Providers are injected via `deliverProse({ systemPrompt,
toolFirstActive })` (streaming → `streamRawLLMToSse`; non-streaming →
`callClaudeWithFallback`/OpenAI); persistence via `processPrepared` +
`makeProcessorArgs`. `orchestrateToolFirstItinerary` is now invoked in exactly
one production module — asserted by a structural test that scans `services/`.

Structural results (in `ai.js`): `runTrailieItineraryTurn(` × **4**,
`orchestrateToolFirstItinerary(` × **0**, `processAssistantResponse(` × 2
(definition + the single call inside `processPreparedTrailieResponse`).

## 2. Anonymous streaming behavior

`POST /chat-anonymous-stream` now runs the shared seam:

```text
thinking(building_structured_itinerary) → thinking(validating_trip) → thinking(writing_response)
chunk: Phase B prose only → stream_end → done(canonical fields + frozen itinerary + meta)
```

- Anonymous limit is checked BEFORE Phase A (the `canSendMessage()` conversion
  guard returns before the seam runs).
- No tool arguments / itinerary JSON appear in SSE chunks; the first visible
  chunk is Phase B.
- Client disconnect (`signal`) aborts Phase A and Phase B.
- Structured failure → prose-only, `hasItinerary:false`, `disableInlineItineraryExtraction`.
- `done` still does not wait for async shadow review.

## 3. Anonymous non-streaming behavior

`POST /chat-anonymous` uses the same generator, finalizer, and Phase B prompt via
the seam, returning the same normalized itinerary shape + `itineraryGenerationMeta`
as the authenticated routes. The legacy anonymous inline-JSON path is not used
when tool-first is active (its `deliverProse` receives `toolFirstActive` and omits
the legacy tool; `disableInlineItineraryExtraction` guards the prose-only case).

## 4. Quota and conversion-message behavior

- The conversion/limit response (`isConversionMessage`, `provider:'system'`)
  returns before any `prepareChatContext`, Phase A, or Phase B — **zero** provider
  phases for a limited user.
- One user message → one turn: the seam calls `deliverProse` once and
  `processPrepared` once; Phase A is an internal provider call that never touches
  the session, so a structured + prose pair is still one anonymous message for
  quota. `anonymousId`, `messageCount`, `canSendMore`, active trip context, park
  names/images, and signup/save prompts are unchanged (the anonymous session
  handling around the seam was not modified).

## 5. Coordinate provenance clarification (fixed)

Stage 11 over-nulled coordinates. Now, in `finalizeStructuredItinerary`:

- Coordinates captured through the `create_itinerary` SCHEMA default to trusted
  provenance `'tool'` and, after deterministic validation, **survive** as
  `{ latitude, longitude, coordinateSource: 'tool' }`.
- They become `null` only when non-numeric, a partial pair, out of range, `0,0`,
  or the payload explicitly marks the source estimated/uncertain
  (`model_estimate` → rejected).
- This is distinct from the fallback prose extractor, whose coordinates are
  unvalidated model estimates and are nulled in the route.

Tests distinguish an unvalidated model coordinate (nulled) from a schema-captured,
deterministically-validated tool coordinate (kept as `'tool'`).

## 6. Route-parity tests

`services/__tests__/trailieItineraryTurn.test.js` (shared seam, mocked providers):

- tool_first: Phase A completes before visible prose; frozen plan reaches
  processing; valid tool coords survive as `'tool'`.
- non-itinerary request skips Phase A; legacy mode skips Phase A and passes no
  `preFinalized`; legacy tool itinerary passes through.
- structured failure → prose-only with inline extraction disabled, no invented plan.
- one message → one `deliverProse` + one `processPrepared`.
- abort during Phase A / during prose returns `aborted` and stops.

`routes/__tests__/trailieRouteContract.test.js`: all four routes reference the
seam (× 4); `orchestrateToolFirstItinerary` never called from routes; exactly one
production caller of the orchestrator (`trailieItineraryTurn.js`).

`utils/__tests__/finalizeItinerary.test.js`: tool coords kept as `'tool'`;
`0,0`/partial/out-of-range/explicit-estimate → null; frozen & non-mutating.

## 7. Focused and full-suite results

Stage 11 + 11.1 focused surface: **13 suites / 104 tests pass**
(`trailieItineraryTurn`, `toolFirstItineraryOrchestrator`,
`structuredItineraryGenerator`, `finalizeItinerary`, `structuredItineraryDecision`,
`toolFirstIntegration`, `trailieRouteContract`, `requestPathReviewScheduling`,
`coordinateValidation`, and Stage 8–10 regressions).

Full suite: **86 suites / 779 tests pass** (excluding the 7 pre-existing failing
suites — `npsParkAdapter`, `npsParkConditions`, `parkChatImages`,
`trailieFetchPlanner`, `blogController`, `auth`/`parks` integration — which fail
identically without these changes on email-JSX-transform and live-NPS/network).
**Zero new failures.** (`npsParkConditions` live tests time out variably, which is
why the raw failed-test count fluctuates run to run.)

## 8. Remaining latency/cost evaluation work for Stage 13

- Real two-phase latency and token cost are still unmeasured in production;
  `structuredDurationMs`/`proseDurationMs`/`timeToFirstVisibleTokenMs` are emitted
  but need a Stage 13 eval gate before flipping `tool_first` on.
- Frontend rendering of `thinking(stage)`, `itineraryGenerationMeta`,
  `feasibilityIssues`, and `weatherCoverage` remains a presentation-layer task.

Route parity is closed: every Trailie user gets the same itinerary architecture
regardless of authentication state. Ready for **Stage 12 — deterministic prose ↔
frozen-itinerary consistency**.
