# Stage 12 — Verified Prose ↔ Frozen-Itinerary Consistency

**Status:** Implemented TDD-first. **Not committed, not pushed.** Consistency is
OFF by default (`TRAILIE_PROSE_CONSISTENCY_MODE=off`); tool-first stays off by
default; no reviewer enforcement, no Plan AI redesign.

**The core rule holds: contradictory itinerary prose is never shown and then
replaced. Verification, retry, and fallback all happen before the first visible
itinerary-prose chunk.**

---

## 1. Buffer-before-display architecture

When consistency mode is active AND Phase A produced a finalized itinerary, the
shared seam (`services/trailieItineraryTurn.js`) does NOT stream Phase B deltas.
Instead:

```text
generate Phase B into a server buffer (no SSE)
→ verify against the frozen-itinerary manifest
→ (enforce) one bounded retry or deterministic fallback
→ strip alignment markers
→ replay the SELECTED prose as normal chunks
```

Off mode / non-itinerary / legacy / prose-only keep Stage 11.1 direct streaming.
Buffered generation uses `generateBufferedLLM` (a non-streaming provider call);
`replayProseToSse` emits the selected prose in bounded 240-char chunks with no
artificial delay. Time-to-first-visible-token increases by the buffered Phase B
duration plus a few ms of verification (`verificationDurationMs` is recorded).

## 2. Manifest & alignment-marker contract

`utils/itineraryProseManifest.js` → `buildItineraryProseManifest(...)`: a pure,
deterministic, stably-ordered projection of the FROZEN itinerary
(days/stops/identity/critical fields + `removedStopAliases` from the correction
ledger), tied to the exact `itineraryHash`. No pre-correction stops, no
prompts/conversation, no profile data.

`utils/proseAlignmentMarkers.js`: `<!--TRAILIE_DAY:id-->`,
`<!--TRAILIE_STOP:id-->`, optional `<!--TRAILIE_INTRO-->`. `parseAlignmentMarkers`
groups stops under days and flags malformed structure (stop-before-day,
missing id, text before first marker). `stripAlignmentMarkers` removes them
entirely. Markers never reach SSE, canonical content, hashing, persistence, or
the review snapshot (the seam returns marker-free selected prose; the
`preFinalized` canonical path strips again as defense in depth).

## 3. Deterministic verification rules

`utils/proseConsistencyVerifier.js` → `verifyProseAgainstItinerary(...)` — pure,
model-free. Fails on: missing/duplicate/unknown day or stop markers, wrong
day assignment, day/stop order violations, removed-stop recommendations,
conflicting difficulty, conflicting duration, strong unsupported additive
instructions, and malformed marker structure. Returns typed issue arrays +
`sanitizedProse`.

## 4. False-positive protections

- **Concise prose passes** — only marker presence + critical fields are required;
  descriptive detail is optional.
- **Generic advice passes** — "bring water / arrive early / check current
  conditions" is never flagged.
- **Additive detector is conservative** — only strong phrases ("add a stop at",
  "detour to", "also visit"…) with a Capitalized proper-noun destination, matched
  by EXACT alias membership (a generic word like "canyon" can't absorb "Bryce
  Canyon").
- **Removed-stop historical explanations allowed** — a removed alias in a sentence
  with removal context ("removed", "unavailable", "instead of"…) passes; a bare
  recommendation fails.
- **Duration tolerance** is generous (max(20 min, 30%)) and scoped to the stop's
  own segment; unrelated numbers aren't treated as durations.

## 5. Retry behavior

`enforce`: first draft fails → exactly ONE regeneration with a compact hint
(sanitized issue codes + missing/duplicate/misplaced ids, never the invalid
prose, reasoning, or profile data) → verify again. No unbounded loop
(`proseRetryUsed` records the single retry; `TRAILIE_PROSE_RETRY_ENABLED=false`
skips straight to fallback).

## 6. Deterministic fallback renderer

`utils/deterministicItineraryRenderer.js` — model-free. Renders the frozen
itinerary (days, ordered stops, times/durations/difficulty where present, drive
times, overnight, corrections, final feasibility warnings once). Invents nothing,
omits unavailable values, never lists removed stops. Output is canonical-ready.
Used when both prose attempts fail, or prose fails after Phase A succeeded.

## 7. SSE behavior & time-to-first-token

`enforce` lifecycle: `thinking(building) → thinking(validating) →
thinking(writing) → thinking(checking_response_matches_plan) → chunk(verified or
deterministic prose) → stream_end → done`. No invalid draft chunks, no retry
draft flashes, no markers, no raw issue codes. Client disconnect (`signal`)
aborts the first Phase B generation, the retry, and prevents replay. `done` never
waits for async shadow review. Non-streaming routes return the same selected prose
in one response (no replay).

## 8. Canonical hashing & persistence

Only the SELECTED prose (first verified / retry-verified / deterministic fallback)
becomes canonical. It is marker-free before hashing, so `contentHash` is over
marker-free content. Retry/fallback change only canonical content + `contentHash`;
the **frozen `itineraryHash` never changes**. The canonical assistant message and
plan remain one atomic unit; the review snapshot receives the selected canonical
prose; rejected drafts are never persisted or logged in full.

## 9. Authenticated / anonymous parity

`runTrailieItineraryTurn` owns buffer → verify → retry/fallback → canonical for
ALL FOUR routes — a structural test asserts the routes never call
`verifyProseAgainstItinerary` / `renderDeterministicItineraryResponse` directly.
Streaming routes provide buffered `deliverProse` + `replayProse`; non-streaming
routes' `deliverProse` is already buffered and need no replay. Anonymous quota is
unchanged: one turn = one message; a prose retry or fallback consumes no extra
message; conversion/limit responses skip the whole pipeline.

## 10. Focused and full-suite results

New suites (all pass): `utils/__tests__/proseConsistency.test.js` (manifest,
markers, verifier, fallback — 17), `config/__tests__/proseConsistencyConfig.test.js`,
`services/__tests__/trailieItineraryTurnConsistency.test.js` (verify/enforce/
retry/fallback/replay/off/frozen — 7), plus `trailieRouteContract` structural
tests. Focused Stage 12 + regression: **11 suites / 85 tests pass**.

Full suite (`server/`): **89 suites / 805 tests pass** excluding the 7
pre-existing failing suites (`npsParkAdapter`, `npsParkConditions`,
`parkChatImages`, `trailieFetchPlanner`, `blogController`, `auth`/`parks`
integration — email-JSX-transform + live-NPS/network, identical without these
changes). **Zero new failures.**

## 11. Known limitations in detecting unsupported prose

- Detection of "invented content" relies on markers + a conservative additive-verb
  detector; freeform embellishment that adds no named destination and no
  conflicting field can pass. This is intentional to avoid false positives.
- Duration/date conflict checks are deliberately lenient; subtle numeric drift
  within tolerance is not flagged.
- Removed-stop detection is alias-based; a paraphrased reference without an alias
  match is not caught.
- Markers depend on model compliance; non-compliance surfaces as a verification
  failure (→ retry/fallback), which is safe but can raise fallback rate.

## 12. Remaining Stage 13 evaluation requirements

- Measure real buffered-Phase-B latency, retry rate, fallback rate, and token cost
  across scenario fixtures before enabling `tool_first + enforce` beyond testing.
- Tune the additive/duration detectors against a labeled scenario set to quantify
  false-positive / false-negative rates.
- Frontend rendering of the new `thinking(checking…)` stage and
  `proseConsistencyMeta` is a presentation task.
- Stage 13 rollout gates decide whether `tool_first` + prose enforcement is safe
  to enable in production.
