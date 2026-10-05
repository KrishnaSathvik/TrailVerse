# Stage 10 — Localized Pipeline Correctness Fixes

**Status:** Implemented TDD-first. **Not committed, not pushed.** No reviewer
enforcement, no Plan AI redesign, no structured streaming, no prose
regeneration. Closes the contained Stage 7 findings plus the Stage 9
canonical-envelope cleanup.

Findings closed: **F-ACC-2, F-DATA-1, F-DATA-2, F-QUAL-1, F-QUAL-2**, and the
**Stage 9 metadata-mutation cleanup**.

---

## 1. Coordinate provenance and fallback behavior (F-ACC-2)

New deterministic validator `server/src/utils/coordinateValidation.js`:

```js
normalizeCoordinates({ latitude, longitude, source })
// → { latitude|null, longitude|null, coordinateSource, valid, reason }
```

Rules: non-numeric → null; latitude ∉ [-90,90] → null; longitude ∉ [-180,180] →
null; one coordinate without the other → both null; `0,0` is never
auto-valid (`null_island`); `model_estimate`/`estimate`/`guess`/`inferred` →
rejected (`untrusted_source`). Trusted `coordinateSource ∈ {tool,
resolved_metadata, geocoder, stored}`; anything else → `unknown` provenance.

- The **fallback extractor prompt** no longer asks for coordinates ("Do NOT
  include latitude or longitude — omit those fields entirely. Never guess…").
- `stripUntrustedExtractedCoordinates` nulls every coordinate the extractor
  emits anyway (it is a model estimate) and marks provenance `unknown`.
- Base buddy/architect prompts no longer say "estimate if exact coords unknown".

**Downstream:** distance-dependent feasibility checks skip stops without trusted
coordinates and never compute distance from `0,0`/defaults. When a check could
not run, one low-severity `insufficient_coordinates` **uncertainty notice** is
surfaced — never a confirmed failure. Missing coordinates do not break
correction, park-identity enrichment, serialization, persistence, or rendering
(they stay null).

## 2. Multi-park canonical-fact parity (F-DATA-1)

`server/src/utils/auxiliaryCanonicalFacts.js` converts **already-fetched**
fee-free and astronomy data into canonical facts (SECONDARY authority — never
able to back a closure/permit) with **no new provider calls**.

Both `prepareChatContext` branches now merge the full source set:

- **multi-park:** every park's NPS facts + primary weather + auxiliary
  (fee-free, astronomy).
- **single-park:** `factsResult.canonicalFactBundle` (NPS + weather) + auxiliary.

`mergeCanonicalFactBundles` dedupes by id, so duplicates collapse
deterministically. Because the Stage 9 snapshot is built from this exact bundle,
the invariant holds and is tested:

```text
canonical fact IDs available to generation ⊆ IDs available to async review
```

Facts are only ever scoped away later by section-level relevance selection —
never dropped before that stage.

## 3. Weather coverage behavior and provider-call impact (F-DATA-2)

`server/src/utils/weatherCoverage.js`:

```js
computeWeatherCoverage({ requestedParkCodes, weatherCanonicalFacts, weatherRequested })
// → { requestedParkCodes, coveredParkCodes, uncoveredParkCodes,
//     status: 'complete'|'partial'|'unavailable'|'not_requested' }
```

Attached to both `done` payloads as `weatherCoverage`. It never implies all
parks have weather when only the primary was fetched: secondary parks with no
fetched forecast appear in `uncoveredParkCodes` and the status is `partial`.
Missing secondary weather is **never** converted into a climate/current
assertion. No additional provider calls are introduced (weather is still fetched
per the existing planner/date-eligibility rules for the primary destination;
coverage is computed from what was already fetched). Reviewer scope reasons are
enumerated: `weather_not_requested_for_scope`, `weather_unavailable_for_scope`,
`weather_coverage_partial`, `no_relevant_weather_fact`.

## 4. Feasibility-warning data flow and display location (F-QUAL-1)

`validateItineraryFeasibility` now returns **structured** issues (no longer dead
strings):

```js
{ id, type, severity, dayNumber, stopIds, message, basis }
```

Types: `excessive_activity`, `excessive_driving`, `backtracking`,
`unrealistic_overnight`, `insufficient_coordinates` (severity `info`).

Data flow: `processAssistantResponse` (recomputed on the FINAL corrected
itinerary) → `done` payload (`feasibilityIssues`) → persisted plan
(`buildPlanDocument` adds `feasibilityIssues`) → restore/share/export (travels
with the plan). **One rendering location:** the prose "After adjustment"
duplication was removed; warnings are surfaced once as structured data for a
single "Things to double-check" section. Corrections re-run feasibility on the
corrected plan, so a resolved issue never lingers. Issue ids are stable and
deduplicable. Missing-coordinate gaps are uncertainty notices, not confirmed
failures.

## 5. Prompt deduplication results (F-QUAL-2)

`server/src/prompts/itineraryOutputInstruction.js` is the **single** authoritative
itinerary-output mandate, carrying a normalized sentinel
(`STRUCTURED_ITINERARY_OUTPUT_REQUIRED`) so tests can count occurrences.

- Removed the duplicate "MANDATORY … [ITINERARY_JSON] block" bullet from both
  base prompts.
- Reframed the format-block rule to a **format** instruction (schema only),
  keeping exactly one `[ITINERARY_JSON]` schema block for extraction
  compatibility.
- The mandate is injected once, only when `userRequestedItinerary` is true, via
  `buildItineraryOutputInstruction(...)`. Non-itinerary follow-ups receive zero
  copies. Assembled itinerary prompt → mandate count = **1**.

Persona/recommendation prompt was not rewritten. Existing extraction stays
intact (inline `[ITINERARY_JSON]` fallback preserved until structured streaming
replaces it).

## 6. Canonical-envelope immutability proof (Stage 9 cleanup)

`scheduleShadowReview` is now **pure** with respect to the canonical response: it
reads the envelope and returns separate `reviewScheduling` metadata rather than
mutating a shared `reviewMeta` reference.

```js
buildCanonicalOutbound(...) → { envelope, identity, canonicalPlan, reviewScheduling }
```

- The canonical `envelope.reviewMeta` is a **stable, content-independent marker**
  (`reviewerMode`, `reviewExecution`, `repaired:false`, `patchesApplied:0`) — it
  never contains the dynamic queue status.
- `reviewScheduling` (`reviewQueueStatus`, sample rate/bucket, enqueue duration)
  is attached to the outbound API payload only; the internal job id is logged,
  never returned.

Proven identical before/after enqueue (disabled / success / failure): canonical
response values, canonical plan values, content hash, itinerary hash, response
identity/version.

## 7. Focused tests

| Suite | Finding |
|---|---|
| `utils/__tests__/coordinateValidation.test.js` | F-ACC-2 validator |
| `utils/__tests__/feasibilityIssues.test.js` | F-QUAL-1 structured issues, coord-skip |
| `utils/__tests__/auxiliaryCanonicalFacts.test.js` | F-DATA-1 aux facts + dedupe |
| `utils/__tests__/reviewSnapshotFactParity.test.js` | F-DATA-1 generation ⊆ review invariant |
| `utils/__tests__/weatherCoverage.test.js` | F-DATA-2 coverage statuses |
| `prompts/__tests__/itineraryOutputInstruction.test.js` | F-QUAL-2 single mandate |
| `routes/__tests__/requestPathReviewScheduling.test.js` | envelope immutability across enqueue outcomes |
| `routes/__tests__/trailieRouteContract.test.js` | request path makes no reviewer call |

Focused Stage 9+10 surface: **17 suites / 141 tests pass**.

## 8. Full-suite results

`npx jest` (from `server/`): **80 suites / 741 tests pass.** The 7 failing
suites (`npsParkAdapter`, `trailieFetchPlanner`, `parkChatImages`,
`npsParkConditions`, `blogController`, `parks`/`auth` integration) fail
identically with Stage 10 changes stashed — pre-existing email-JSX-transform and
live-NPS/network issues. **Stage 10 introduces zero new failures and fixes one
previously-failing suite** (`prompts`, whose assertions were stale against the
current wording).

## 9. Remaining blockers for structured streaming & prose synchronization

- **Inline `[ITINERARY_JSON]` fallback still exists** (extraction compat). Stage
  11 should replace it with reliable structured tool-use streaming; the single
  canonical output fragment is now the one place to evolve.
- **Trusted coordinates are still sparse.** With estimation removed, most stops
  carry null coordinates until a deterministic geocoder / stored-record
  enrichment path populates them. Backtracking/overnight checks stay conservative
  until then — a geocoding source is the real unblock for distance feasibility.
- **Prose ↔ itinerary drift after correction** is untouched (Stage 12). Feasibility
  warnings are now structured and single-sourced, which Stage 12 can render
  alongside resynchronized prose.
- **Frontend rendering** of `feasibilityIssues` / `weatherCoverage` / the async
  `reviewScheduling` status is carried in the payload and persisted plan but not
  yet displayed — a thin presentation-layer task for the Stage 14 UI work (or a
  small earlier follow-up), needing no further backend change.
```
