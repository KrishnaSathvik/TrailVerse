# Trailie correction-context cost and Zion/Bryce thinness audit — 2026-10-13

## Decision

This read-only audit found two narrow, independent causes:

1. **Correction cost is inflated by exact duplication in the model input.** The rejected proposal is already retained as the model's function-call item, then copied into `correctionFeedback.originalProposal`. The same full grounded-place array is included inside `placeRecovery.groundedPlaces` and again as top-level `groundedPlaces`.
2. **The thin Zion/Bryce plan primarily began as a multi-destination research-identity problem.** The combined destination retained Zion and Bryce as access-rule anchors, but did not give the ordinary NPS activity provider a single park identity. The initial activity pool therefore came from generic web results and explicitly named place resolution, rather than the two parks' official activity collections. Conservative composition was a secondary cause.

No runtime, prompt, guard, fixture, provider, or production configuration was changed. No model/provider calls were made. Reserve discovery remains disabled.

## Evidence and limits

The audit uses the frozen Stage A captures in `artifacts/trailie-full-demo-pilot-2026-10-12/`, the current model-first runtime, the tool schema, the pricing registry, and the full private research captures copied into each case directory.

The telemetry records the exact serialized model-input byte count and provider token usage for every call. It records the exact raw correction-feedback size. Diagnosis capture intentionally sanitizes and overwrites proposal details, so it does not retain the rejected proposal's content. Its exact serialized size can still be derived because every other correction-feedback field is present in telemetry and the feedback object is built deterministically. This audit can prove component sizes and duplication, but cannot replay a candidate narrower correction prompt against the model without a new call.

## Correction-call breakdown

The three corrected turns were the first plan-writing turns for Shenandoah discovery, Yosemite feasibility, and Zion + Bryce. Their saved trip was still `null` when correction began, so an existing canonical plan contributed only the JSON literal `null` (4 bytes) in these cases.

| Component | Shenandoah | Yosemite | Zion + Bryce |
| --- | ---: | ---: | ---: |
| Call 1 input: history + policy + tools + application context | 32,315 B / 6,238 tok | 31,949 B / 6,171 tok | 31,495 B / 6,070 tok |
| Call 2 input after research | 64,075 B / 15,277 tok | 58,530 B / 13,510 tok | 63,359 B / 15,395 tok |
| Research model-context payload | 30,892 B | 25,851 B | 30,867 B |
| Call 3 correction input | 121,638 B / 28,807 tok | 119,667 B / 27,693 tok | 95,242 B / 22,922 tok |
| Added input from Call 2 to Call 3 | 57,563 B | 61,137 B | 31,883 B |
| Raw correction-feedback output | 44,769 B | 50,287 B | 20,134 B |
| `placeRecovery` object | 17,900 B | 21,259 B | 5,770 B |
| Grounded list inside `placeRecovery` | 16,037 B | 19,420 B | 3,900 B |
| Same grounded list repeated at top level | 16,037 B | 19,420 B | 3,900 B |
| Rejected proposal repeated in feedback, inferred exact JSON size | 9,523 B | 7,987 B | 9,095 B |

The rejected proposal is also present once as the retained `propose_trip_update` function-call item. The correction call therefore carries two copies of it: the original function call and `correctionFeedback.originalProposal`. The grounded list is present in the earlier research context, inside `placeRecovery`, and again at the feedback top level. Those are structural repetitions, not safety requirements established by the guard.

Across these three turns:

| Phase | Calls | Input tokens | Output tokens |
| --- | ---: | ---: | ---: |
| Initial decision/research request | 3 | 18,479 | 494 |
| Post-research synthesis | 3 | 44,182 | 6,241 |
| Memory verification | 3 | 2,443 | 338 |
| Correction | 3 | 79,422 | 6,040 |
| **Total** | **12** | **144,526** | **13,113** |

Correction alone accounts for **55.0%** of the input tokens in the corrected turns. The three correction calls account for **19.3%** of all 411,187 input tokens in the complete Stage A suite.

### Baseline context composition

The first call already includes a large fixed base:

| Fixed or conversation component | Shenandoah | Yosemite | Zion + Bryce |
| --- | ---: | ---: | ---: |
| Model-first policy text | 15,976 B | 15,976 B | 15,976 B |
| `propose_trip_update` schema | 9,649 B | 9,649 B | 9,649 B |
| Serialized prior conversation + current request | 3,925 B | 3,559 B | 3,105 B |
| Prior saved plan | 4 B (`null`) | 4 B (`null`) | 4 B (`null`) |
| Prior planning state | 4 B (`null`) | 4 B (`null`) | 4 B (`null`) |

The policy and write schema are material, but they do not explain the correction-specific jump. The post-research increase closely tracks the 25.9–30.9 KB research context. The next increase is caused by retaining the full synthesis function call and appending the large correction feedback.

### What must remain in correction context

A safe correction still needs:

- the traveler's current request and authoritative prior conversation;
- the original proposal once, so the model can repair it;
- exact validation issue codes and traveler-readable meanings;
- active hard restrictions and per-stop restriction findings;
- authoritative evidence references and enough facts to select safe replacements;
- unresolved identities and traveler-required-place provenance;
- the existing canonical plan when correcting an update to a saved plan;
- the strict `propose_trip_update` schema and correction scope.

Safety does not require copying the same proposal or grounded-place value twice.

### Smallest correction-context design to test later

The first offline candidate should change representation only:

1. Remove `originalProposal` from correction feedback because the immediately preceding function-call item already contains it.
2. Keep one grounded-place collection. Retain `placeRecovery.failedPlaces`, provenance, restrictions, unresolved identities, and recovery instructions; reference the single grounded collection rather than embedding it twice.
3. Keep the original research function output in the conversation for authoritative facts. Do not remove closure, access, eligibility, or uncertainty facts.
4. Preserve `existingCanonicalPlan` whenever a saved-plan patch is being corrected. Its contribution happened to be null in these three initial-plan cases and must not be generalized away.

Removing only the two exact feedback duplications would eliminate at least the following raw JSON values before outer request escaping and wrapper overhead:

| Scenario | Repeated proposal + second grounded list | Share of raw correction feedback |
| --- | ---: | ---: |
| Shenandoah | 25,560 B | 57.1% |
| Yosemite | 27,407 B | 54.5% |
| Zion + Bryce | 12,995 B | 64.5% |

These are conservative savings because JSON string escaping expands the embedded feedback in the outer request. The next experiment should reconstruct both current and deduplicated inputs from frozen captures and verify byte/token size, field preservation, and guard invariance before any live comparison.

## Why dollar cost is unknown

The live route correctly records:

- provider route: OpenAI;
- model: `gpt-6.1-sol`;
- input, output, reasoning, uncached, cached, and cache-creation tokens;
- request bytes and call latency.

The versioned registry `server/src/config/trailiePricingRegistry.js` contains `gpt-6-sol` but no `gpt-6.1-sol` entry. `priceProviderCall` therefore returns `cost_unknown`, and runtime telemetry correctly emits `modelCostUsd: null` rather than borrowing another model's price.

There is a second observability gap: per-call telemetry retains `costUsd` but does not retain the model adapter's provider, `costStatus`, pricing version, or component breakdown. The route is recoverable from code and the final response, but the ledger should carry it explicitly when cost instrumentation is implemented.

No reliable dollar estimate should be reported until an authoritative, effective-dated `gpt-6.1-sol` rate is available. The narrow implementation scope would be:

1. add the verified effective-dated model price;
2. propagate provider, `costStatus`, pricing version, and input/cache/output components into every call record;
3. preserve `cost_unknown` whenever any rate or required token category is absent;
4. aggregate per turn and per conversation without converting unknown cost to zero.

The captures show zero cache-read tokens and cache-creation tokens approximately equal to input tokens on these calls. Repeated context did not produce an observed cache-read benefit in this run.

## Zion + Bryce evidence-to-plan trace

### Research request

The model requested one combined destination, `Zion National Park and Bryce Canyon National Park`, and explicitly named:

- Pa'rus Trail
- Riverside Walk
- Bryce Amphitheater
- Sunset Point
- Sunrise Point
- Las Vegas

The request asked for a relaxed five-day loop with easy signature outings, transfers, shuttle rules, and seasonal caveats.

### What research returned

The frozen bundle contained 35 records:

| Topic | Records |
| --- | ---: |
| Activities | 11 |
| Transit | 13 |
| Closures/alerts | 6 |
| Overview | 5 |

The 11 activity records did not represent 11 usable experiences. Six were named identity/location records for the requested names. Five were generic web results with no normalized activity name and empty model-facing activity text. The six named records said only that identity/location was resolved and access/availability remained unconfirmed.

The model context contained 28 facts and omitted seven. Five omitted records were the empty generic activity results. Two omitted records were useful official Zion and Bryce shuttle-page extracts that lost the 36 KB packing competition to other material. There was no reserve pool in this particular provider read (`reserveRecords: 0`).

### Exact architectural loss point

`resolveDestination` correctly found Zion and Bryce as `destinationAnchors`, so `parkAccess` performed park-specific transit/access work for both parks. But the ordinary `fact(..., 'activities')` path receives `s.entity`. A combined multi-park destination deliberately resolves to a query identity rather than one `nps:park:<code>` identity. The NPS provider only supports activity requirements carrying a park code, so no NPS activity-list request ran for either park.

This is visible in the provider outcomes: activity research used Tavily and named-place resolution, with no NPS activities outcome. The system could validate explicitly named places, but it could not discover the two parks' broader official activity collections.

Reserve discovery cannot fix this run because those official candidates were never fetched into the active or reserve collections.

### Planning use

The accepted initial plan used:

- Day 1: Pa'rus Trail
- Day 2: Riverside Walk
- Day 3: transfer only
- Day 4: Sunset Point
- Day 5: return to Las Vegas

The model did not ignore a large set of rich activity facts; it never received one. It did underuse one available named identity: Sunrise Point was grounded but not represented as a separate stop. Day 4 explicitly chose an open afternoon, and the prose said a second hike was unnecessary. This establishes a secondary conservative-composition contribution.

Flight times were unresolved, so caution on Days 1 and 5 was reasonable. The correction was triggered by `day_type_inconsistent`, not by activity eligibility or closure rejection. The frozen diagnosis overwrote the rejected proposal summary with the accepted correction, so it cannot establish whether correction removed an activity.

The later targeted follow-up named the deficiency. A new research pass resolved Red Canyon Visitor Center and added it to Day 3 while preserving Days 1, 2, 4, and 5. That demonstrates the planner can use a suitable activity once the activity is named and grounded.

### Cause allocation

| Candidate cause | Finding |
| --- | --- |
| Missing suitable research | **Primary.** Combined destination anchors supported access research but not per-park NPS activity discovery. |
| Evidence packing | **Secondary.** Two official shuttle extracts were omitted, but the missing activity variety was absent before packing. |
| Conservative planning | **Secondary.** Sunrise Point was available and the model intentionally left part of Day 4 open. Unknown flights reasonably limited Days 1 and 5. |
| Guard rejection | **Not the thinness cause.** The guard rejected inconsistent day type and accepted the correction; no activity was rejected for exposure/access. |
| Reserve visibility | **Not applicable to this run.** The read reported zero reserve records. |

### Smallest architectural candidate to test later

For a combined destination with multiple exact official `destinationAnchors`, allow the existing NPS activity provider to perform one bounded activity read per anchor, then pass the results through the current normalization, evidence budget, eligibility, and guard paths. This is a fan-out of the existing provider, not a second planner or retrieval system.

Before implementation, a frozen/offline test should prove:

- both park codes produce official candidate sets;
- activities retain their park-specific identities and restrictions;
- duplicate broad identities do not imply child-activity eligibility;
- provider-request ceilings remain bounded;
- the 36 KB selector chooses useful facts while preserving closure/access facts;
- the existing guard results do not change for the accepted plan;
- no minimum stop count or Zion/Bryce-specific list is introduced.

## Recommended order

1. Build a frozen correction-input reconstruction and test removal of the two exact duplications. Measure serialized bytes and tokenizer counts; do not make a live call yet.
2. Add complete cost observability only after an authoritative `gpt-6.1-sol` price is available. Do not substitute `gpt-6-sol` pricing.
3. Test multi-anchor NPS activity fan-out offline on the existing Zion/Bryce capture and at least one other multi-park request.
4. Keep reserve discovery off. The Zion/Bryce result shows that reserve visibility cannot recover evidence a provider never collected.
5. Continue to track the shared-plan projection mismatch and real mobile/desktop inspection as separate presentation gates.

The next implementation should be chosen only after the two frozen tests quantify their effect. The evidence supports removing exact correction duplication and repairing multi-park official activity discovery; it does not support a larger prompt, a looser guard, minimum activity counts, or production reserve activation.
