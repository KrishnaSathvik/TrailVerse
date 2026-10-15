# Trailie frozen correction and multi-park experiments — 2026-10-13

## Decision

Workstream A passed its frozen acceptance gate and received the narrow runtime repair. The first Workstream B fan-out failed because activities displaced access evidence. A bounded classification and selection repair then passed the frozen implementation replay: the model view contains official activities and direct official shuttle evidence from both parks under the existing fact cap, while the complete evidence remains available to the guard.

No model calls, reserve discovery, safety-guard changes, pricing substitutions, commits, deployments, or production activation were used. The only live acquisition was the explicitly authorized bounded Bryce NPS activity capture. Pass 2 and Pass 3 remain held.

## A. Correction efficiency

The experiment reconstructed the complete correction inputs from the three captured corrected turns. It removed two exact repetitions:

- `originalProposal`, because the rejected proposal is already present in the preceding `function_call` item;
- `placeRecovery.groundedPlaces`, while retaining the same catalog once at top-level `groundedPlaces`.

| Case | Current complete input | Conservative saved bytes | Conservative reduction | Deduplicated upper bound |
|---|---:|---:|---:|---:|
| Shenandoah / discovery | 121,638 | 26,476 | 21.8% | 95,162 |
| Yosemite / realistic | 119,667 | 28,275 | 23.6% | 91,392 |
| Zion + Bryce | 95,242 | 13,451 | 14.1% | 81,791 |

These are lower-bound savings. The proposal contribution counts its raw JSON bytes and does not claim the additional bytes removed by outer JSON escaping.

The reconstructed inputs retain the rejected proposal once, research output, issue codes and meanings, failed places, traveler wording, recovery instructions, one grounded-place catalog, the canonical plan when present, active restrictions, restriction findings, unresolved places, and correction purpose.

### Runtime repair

`trailieSimpleRuntime` now omits the repeated proposal from correction feedback and removes the nested grounded-place copy. Validation, evidence, correction instructions, recovery semantics, and the authoritative guard are unchanged.

Focused offline verification passed: 2 suites and 50 tests, with zero live provider dispatches or external provider HTTP requests.

Frozen artifact: `artifacts/trailie-frozen-efficiency-multipark-2026-10-13/correction-results.json`.

## B. Multi-park official activity discovery and balanced delivery

The bounded Bryce capture used the existing NPS provider and source-preservation path. It made one logical provider read, comprising four paginated NPS HTTP requests, and no model, geocoding, routing, or other-provider requests. The direct fallback returned a complete capture of 36 `thingstodo` records and 138 place records. The standard 12 KB provider-read selection admitted four records and held 170 in reserve.

The combined replay then modeled one existing NPS activity read per exact official park anchor, under the existing 32-request ceiling, 12 KB per-read allowance, 28 KB fact allowance, 48-fact ceiling, and disabled reserve discovery.

The destination-independent control passed:

| Control | Available official activities | Model-visible activities |
|---|---:|---:|
| Yellowstone | 4 | 4 |
| Grand Teton | 19 | 15 |

Both parks remained represented, the selected facts used 27,679 bytes, and the source-linked evidence digest was unchanged through fan-out.

The Zion + Bryce replay now proves that official activity evidence can reach the model for both parks:

- the provider reads selected three Zion records and four Bryce records;
- the final selector retained three activities from each park;
- activity provenance and normalized restrictions remained unchanged;
- four retained activities carried access details.

The first combined selection failed:

- total model-visible facts fell from 28 to 19;
- all Zion shuttle entries in the fact list were displaced, while one Bryce shuttle fact survived; the separate Zion park-wide private-vehicle rule remained present;
- fifteen previously visible facts were lost, including ten shuttle records;
- Sunrise Point was normalized as `lodging`, conflicting with the existing official named-place identity of `point_of_interest`. Its NPS description mentions “Lodge visitors,” which triggers the current broad facility classifier;
- the Bryce activity collection contained no explicit closure-status record, so closure preservation was not applicable to this capture and cannot offset the shuttle failure.

That result established that per-anchor fan-out can be destination-independent and bounded, but that unbalanced final selection can trade away practical access information when activity records are added.

### Classification repair

The NPS place classifier now uses record type and title structure before incidental description words. `Sunrise Point` stays a `place` even when its description mentions lodge visitors. Actual lodge, visitor-center, and museum titles retain their categories, while shuttle stops, trailheads, overlooks, points, shelters, parking, bike stands, and charging stations are not reclassified by nearby-facility prose.

Eleven frozen classification cases passed. A guard regression check also confirmed that correcting Sunrise Point's display category does not change its exposure eligibility decision; safety still comes from the authoritative evidence fields.

### Balanced model-facing selection

The final selector now:

- prioritizes exact requested official activities;
- retains direct official transit/access pages when the traveler asks for shuttle or access guidance;
- keeps operational facts ahead of general discovery prose;
- removes alternate model-facing representations of the same named source fact, while preserving distinct facts that share an official collection page;
- keeps the complete active evidence unchanged for validation;
- grounds coordinates during research only for explicitly requested identities. Any newly proposed stop is still grounded at finalization, avoiding geocoder fan-out from discovery records.

This is request-aware ordering and evidence deduplication. It does not allocate fixed park/topic quotas, require a minimum number of activities, or make itinerary decisions.

### Implemented frozen replay

The exact Zion + Bryce replay through the modified runtime passed:

| Check | Result |
|---|---:|
| Official NPS activity reads | 2: Zion and Bryce |
| Model-visible official activities | 2 Zion + 2 Bryce |
| Direct official transit facts | Zion shuttle + Bryce shuttle + Bryce shuttle station |
| Zion park-wide private-vehicle rule | Retained |
| Sunrise Point category | `place` |
| Fact bytes | 27,545 / 28,000 |
| Complete model-context bytes | 30,670 |
| New geocoding calls in replay | 0 |
| Model/external-provider calls in replay | 0 |
| Reserve discovery | Disabled |

The four requested activities reaching the model were Riverside Walk, Pa'rus Trail, Sunrise Point, and Sunset Point. Full active authoritative evidence remained separate from the 22 deduplicated model-selection candidates, so the selector did not become validation authority.

### Parallel provider-boundary verification

The shared request allowance remains effective under parallel park reads. `read()` admits a request and increments the shared counter before its first asynchronous wait, so a nine-park fan-out configured for four provider requests dispatched exactly four broker calls.

The boundary test found one reporting defect: when at least one park succeeded, skipped or timed-out park reads were not individually represented in `unresolved`. The aggregate result could therefore look complete. Each empty park read now produces a park-specific unresolved entry. Allowance exhaustion uses `research_allowance_reached`; a provider failure uses `official_activity_read_incomplete`. A successful sibling park remains usable without hiding the incomplete park.

Focused offline verification passed 6 suites and 96 tests. It covered source preservation, closure enforcement, constraint eligibility, reserve isolation, correction feedback, classification, multi-park fan-out, shared request limits, partial provider failure, fact budgets, direct access retention, and unchanged guard authority. Provider isolation reported zero live provider dispatches and zero external provider HTTP requests.

Workstream B is now implemented locally and uncommitted, with production activation still held pending the traveler-outcome comparison and the existing live gates.

Frozen artifacts:

- `artifacts/trailie-frozen-efficiency-multipark-2026-10-13/bryce-nps-activity-capture.json`
- `artifacts/trailie-frozen-efficiency-multipark-2026-10-13/multipark-results.json`
- `artifacts/trailie-frozen-efficiency-multipark-2026-10-13/classification-results.json`
- `artifacts/trailie-frozen-efficiency-multipark-2026-10-13/balanced-selection-results.json`
- `artifacts/trailie-frozen-efficiency-multipark-2026-10-13/implemented-replay-results.json`

## Remaining release blockers

- `gpt-6.1-sol` still has no verified pricing registry entry, so dollar cost remains unknown and must not be reported as zero or borrowed from another model.
- The required traveler-outcome comparison has not run because it would require a paid model call while that cost-observability gate remains unresolved. Frozen evidence coverage is not proof of a better itinerary.
- The final provider-hardening build still needs its separately authorized live verification.
- Recovery remains a separate behavior problem; correction deduplication reduces input size but does not claim to improve the model's willingness to recover.
