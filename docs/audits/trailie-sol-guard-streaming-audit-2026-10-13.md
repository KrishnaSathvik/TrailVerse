# Trailie: Sol → guard → saved itinerary audit

Date: 2026-10-13. Scope: existing captures and current working-tree code. No paid calls, provider research, database writes, product changes, agents, commits or deployment. Production holds remain in place.

## Verdict

Keep GPT-6.1 Sol, the existing proposal format and the independent guard. Reject the compact-block candidate. The two fresh rejected proposals demonstrate a localized **representation failure**, not an absent return journey. They do not establish that the whole itinerary is fully feasible or that the historical correction had this same cause.

The audit also found an actual evidence-to-canonical mismatch: a brief Sunrise Point viewpoint visit receives `walkingDistanceMiles: 5.5` from source text about the broader Rim Trail. This occurs in both offline enrichment results and the previously saved accepted plan. It is more concrete than a general claim that the guard or Sol is weakening trips.

Sol demonstrates useful travel judgment in the available scenarios. There is insufficient original-proposal retention to rank Sol, research, correction and presentation as universal causes of weak itineraries. In particular, successful correction is not evidence that correction preserved every original decision.

## Evidence and method

1. Read both complete benchmark proposals, the frozen authoritative research, requests, recorded memory-verifier output and model usage.
2. Re-ran the unchanged `validateSimpleMutation` offline on both proposals, at the original research capture time. Reconstructed memory receipts through the real verifier using recorded output, with an assertion that its complete input matched the captured verifier request. No network client or persistence adapter was used.
3. Diffed each original model plan against the returned enriched candidate. Both reproduced **only** `day_type_inconsistent`. All proposed stops, durations, labels, notes, summaries, bases, ordering and blocks survived unchanged. Differences were canonical identity/source/location/suitability fields, travel edges and contract metadata. Neither candidate was accepted or saved.
4. Read saved plans, proposal summaries, telemetry and available workspace projections for the six requested scenario families. Compared saved day objects before/after scoped follow-ups.
5. Reviewed current guard, imported eligibility/day/patch contracts, correction runtime, canonical enrichment and shared day presentation. Checked Responses streaming support against installed SDK types and official documentation.

Private reproducible artifacts: `artifacts/private/sol-guard-audit-2026-10-13/offline.cjs` and `shadow-results.json`. The folder is gitignored; result capture is mode 0600. Inputs remain in their existing private locations. The report excludes account, trip and conversation identifiers.

Evidence limits:

- The two benchmark proposals retain complete original arguments. Their before/after analysis is exact.
- The successful 65.84-second diagnostic replay retains a structural day projection, not complete original proposal prose.
- Most older `proposal.diagnosis.json` files are sanitized summaries; on corrected turns they were overwritten with the accepted attempt. Original rejected proposals are **not reconstructable** from those summaries.
- Captured workspace JSON is a simplified projection, not a browser rendering of today's React components. Actual desktop/mobile visual verification remains incomplete.
- Current-code offline replay is not a re-execution of every historical runtime version. Historical outcomes and current static findings are distinguished below.

## Day 5: exact conflict and independent quality review

| Capture | Model's Day 5 | Structured blocks | Result |
|---|---|---|---|
| Full-format benchmark | Breakfast/check-out, 45-minute Sunrise Point rim view, Bryce Canyon City → Las Vegas; generous travel/flight buffer, early flight requires revision | `meal` morning; `outing` morning; `transfer` midday–evening; type `departure`, span morning–evening | Missing `departure` block; rejected |
| Compact candidate, decoded losslessly | Breakfast/check-out, 45-minute Sunrise Point view above the rim; return to Vegas with road/meal/rental/flight buffer; no flight time assumed | Same three kinds and periods; type `departure` | Same rejection |
| Earlier accepted live plan | Same essential morning viewpoint and return journey | `meal` morning; `outing` morning; `transfer` midday–afternoon; **`departure` evening** | Accepted after correction; first rejected proposal unavailable |
| Successful diagnostic replay | Retained projection shows morning outing and explicit departure moments | `outing` morning; `departure` morning; `transfer` midday–afternoon; `departure` evening | Accepted first attempt; full original prose unavailable |

In both benchmark proposals departure already exists in day type, title/summary, checkout and return-transfer notes. The continuous transfer span covers afternoon even though its stored endpoints are `midday` and `evening`. This is not a missing-afternoon failure.

The explicit departure block in the older accepted plan describes ending the park trip in Vegas, including optional car/airport logistics or an independent Vegas stay. That is distinguishable from driving there, but need not be a separate attraction or mandatory flight. The rejected notes already include much of that meaning. A label check cannot decide whether an additional traveler action is missing.

**Report-only quality judgment:** both Day 5 plans are plausible, restrained and aligned with a relaxed trip. They avoid forcing a sunrise alarm or canyon descent. Neither invents a flight time. They are conditional plans, not verified connections: no booked flight, date-specific travel conditions or verified inter-base drive duration establishes that this schedule works for every traveler. No additional current guard failure appeared offline. That does not certify all prose claims or geographic feasibility.

Across the whole proposals, baseline has six stops and candidate five. Both retain three Springdale nights and one Bryce-area night, Zion river/canyon outings, a Bryce day and return travel. Candidate omits baseline's Bryce Point and changes other wording/durations. Its smaller output is therefore not a pure encoding comparison. No source here proves every chosen walk is suitable for every interpretation of “easy.”

### Why Sol can miss this contract

The initial policy enumerates day types and block kinds independently. It explicitly calls for transfer blocks for base changes and downtime on rest days, but does not explicitly state the arrival/departure type-to-block dependency. The tool schema likewise does not encode that conditional relationship. Schema descriptions are stripped from plan fields in the exported tool.

The policy also says not to turn every logistical thought into its own block. This is not a formal contradiction, but it creates ambiguity about whether return travel plus departure prose suffices. Only correction feedback states the dependency plainly: “Arrival/departure/transfer/rest days need the corresponding block.”

This supports an undercommunicated contract as a plausible contributor, not a proven causal explanation. It does not explain the overwritten historical failure. No prompt change was made.

Sources: [initial policy](../../server/src/prompts/trailieModelFirstPolicy.js), [tool and guard](../../server/src/services/trailieSimpleGuard.js), [day checks](../../server/src/utils/dayCompleteness.js), [correction meanings](../../server/src/utils/mutationIssueMeanings.js).

## Guard rule assessment

The table groups checks with the same purpose; it covers the model-first mutation boundary and its called validators. A helper's existence elsewhere in the repository is not proof that the current path applies it.

| Rule family / failures | What it protects | Assessment and limits |
|---|---|---|
| Mutation schema; allowed fields/types/enums; response required; plan/patch schema; unsupported trip schema version | Data integrity and safe interpretation | Essential. Local `conforms` is not a complete JSON Schema implementation: it checks types/enums/required/extra fields/max array size, while downstream validators enforce additional semantics. Do not equate advertised schema with universal runtime validation. |
| Multiple plan mutations; accepted plan required for patch; existing plan requires patch; invalid/empty mutation; canonical acceptance/version | Atomic write semantics | Essential. Rejected creation is not an accepted patch base. |
| Patch operation validity, target day/stop identity, duplicate/missing targets/order, authorized day scope, untouched-day preservation/hash | Edit authority and stable identity | Essential. An intentional scoped follow-up is different from corrective regeneration of a rejected new plan. |
| Day identity and requested day count | Data integrity / traveler request | Essential. Creation day count uses admitted duration; it is not a universal natural-language count verifier. |
| Stop identity/name binding; no coordinate-only/destination-only evidence; authoritative freshness; experience/map-anchor relationship | Grounding and map truth | Essential. Name matching is exact/unique, not semantic. Missing research can prevent a good place from qualifying. Missing coordinates may remain explicitly unresolved rather than forcing rejection. |
| Same-day duplicate canonical places | Data integrity / anti-duplication | Useful, but intentional separate visits to one place may need richer representation. No demonstrated harmful rejection here. |
| Cross-day `repeated_place_without_reason` | Planning-quality convention | A nonempty revisit reason is required except for area/base-like places. It does not judge the reason's quality. Yellowstone demonstrates deliberate repetition can pass. It is not a safety rule. |
| Official trail/road/seasonal closure; `candidate_unavailable` | Access safety | Necessary when applicable. Unknown is not automatically closed. Current stop closure branch checks fact types without a direct trip-date applicability test; route access has a separate date-aware resolver. Undated/future closures merit a focused audit before treating every rejection as correct. No false closure rejection established here. |
| Exposure violation versus `constraint_eligibility_unknown`; mobility-distance violation/unknown; walking-minutes grounding | Safety under explicit restrictions | Keep fail-closed when required eligibility lacks support. Unknown means unproven, not inherently unsafe. Source classification and matching must describe the planned activity. Viewpoint distance contamination shows why that distinction matters. |
| Wheelchair, stairs, pets and related access eligibility | Accessibility / traveler restrictions | Retain. Inspect actual propagated fields and activity identity; do not assume the presence of shared helper rules means full coverage. |
| Difficulty/no-hiking checks in shared eligibility helpers | Traveler suitability | **Coverage caveat:** current guard passes only `preferences.avoidExposure` into this eligibility projection; it does not pass fitness/interests. `assessPlaceEligibility` calls constraint evaluation with type `custom`, using actual activity prose for exposure relevance only. Thus “guard passed” does not certify easy-hike compliance or all activity-specific access checks. This is a static boundary finding, not a demonstrated unsafe saved hike. |
| Positive stop duration; duration upper bound from evidence | Numeric integrity / evidence | Useful but only as good as activity-scoped source extraction. A viewpoint visit and the full neighboring trail need different measurements. |
| Unbound drive claims; replace travel edges from trusted route evidence; transportation mode/access reconciliation | Factual travel measurements | Essential. Unknown routes remain unverified. Inter-stop edges do not certify every base/airport transfer in non-place blocks; prose is not a verified measurement. |
| Driving limit exceeded or unverifiable | Explicit traveler limit | Keep conservative handling, but measured edges are not automatically the whole day's driving. Activity grouping suppresses adjacent road edges; grouping is model-owned and does not prove walking continuity. |
| Day structure presence, enums, useful text, bounded arrays | Canonical representation | Necessary for current consumers; size/text conventions are not traveler-safety facts. |
| Ordered periods; blocks inside declared span; complete span coverage | Internal temporal consistency | Useful. Continuous endpoint spans are supported. Dayparts cannot prove duration/daylight feasibility. |
| Outing must bind stops; non-outings cannot bind them; exact once/in-order stop coverage | Map/display identity | Essential to avoid lost/doubled activities. Pinless `experience` blocks are valid. No mandatory attraction count. |
| `sightseeing` must start morning and cover afternoon; no non-evening `outside_trip` | Full-day representation convention | Potentially rigid for a valid late-start sightseeing day. Partial arrival/departure days are already allowed. Do not force a different purpose label solely to pass; review product semantics separately. No measured rejection of a traveler-requested late start in these captures. |
| Arrival/departure/transfer/rest requires corresponding block | Redundant structural declaration | Current failures are correctly rejected under the existing contract. Necessity as a traveler-safety condition is unproven. Keep unchanged pending contract/correction evaluation. |
| Sightseeing with no stops requires an experience | Content presence | Sensible minimum without fixed stop quotas; does not certify that the experience is specific/useful. |
| Clock format/reason; stop daypart; timed commitment duration; total >24h; activity past midnight/overlap; trusted transfer overlap | Arithmetic and honest precision | Essential when applicable, but overnight activities cannot be represented freely within this daily clock model. Nonempty timing rationale is not factual verification. |
| Different normalized overnight base strings require transfer block | Logistics declaration | Useful integrity check, not geographic routing. Aliases can differ; any transfer kind satisfies it; missing/null bases escape comparison. Day 5's null final overnight does not certify return travel. |
| Memory schema/quote/semantic receipt; invalid dates/order/duration; transport enums; atomic rollback; restriction authority | Traveler consent and constraint persistence | Essential. Guard is deterministic, but memory authorization uses a separately bounded model verifier. Optional rejected memory can be removed and the remaining plan revalidated; not every memory error requires full trip correction. |
| Date and no-driving memory transitions | Stale measurement invalidation | Appropriate factual cleanup; can alter prior route metadata even in a memory-only turn. Distinguish this from redesigning activities. |

Detailed implementations: [guard](../../server/src/services/trailieSimpleGuard.js), [day completeness](../../server/src/utils/dayCompleteness.js), [patches](../../server/src/utils/itineraryPlanPatch.js), [eligibility binding](../../server/src/utils/modelFirstPlaceEligibility.js), [candidate checks](../../server/src/utils/candidateViability.js), [hard eligibility](../../server/src/utils/hardConstraintEligibility.js), [memory authority](../../server/src/services/trailieMemoryAuthority.js).

## What processing changes

The guard is not exclusively a boolean filter. It folds a lodging stop matching an overnight base out of a multi-stop day, renumbers remaining stops, removes associated block references and prunes small activity groups. Policy permits an actual activity at lodging, but this folding uses name/type rather than the activity's meaning. This is a potential semantic-loss boundary; it did **not** fire in the two benchmark diffs. An emptied outing may then fail validation rather than being silently repaired.

Enrichment replaces model-authored identity/coordinates/measurements with source-bound fields, rebuilds travel edges, and preserves untouched accepted days. Those are appropriate trust-boundary operations. They can still propagate incorrectly scoped source facts.

**Confirmed example:** both original Day 5 proposals specify a 45-minute rim viewpoint visit and no `walkingDistanceMiles`. Enrichment adds 5.5 miles. The frozen source body attributes 5.5 miles to the Rim Trail, while its normalized Sunrise Point record attaches that number to the place. The older accepted saved Sunrise Point stop has the same value. This is a research normalization/measurement-binding defect propagated by enrichment, not a distance invented in Sol's proposal. Do not repair it by guessing the correct viewpoint walking distance. UI display and any restriction impact require separate verification; no actual mobility-limit rejection from this value was shown here.

Current presentation merges outing blocks with their stops, correctly avoiding double entries. However, `activityCopy` retains at most two text roles, prefers a separate `why` over a second practical note, and uses lexical overlap to suppress apparent repetition. `quietUncertainty` removes some unconfirmed-access/time/conditions clauses; `TripWorkspaceView` substitutes a general confirmation notice. This can lose specific uncertainty even though storage remains intact. These are code-observed risks, not measured browser failures. The simplified historical workspace capture does not execute this text transformation.

Sources: [day presentation](../../next-frontend/src/lib/dayPresentation.js), [workspace notice](../../next-frontend/src/components/itinerary/TripWorkspaceView.jsx), [itinerary rendering](../../next-frontend/src/components/trailie-response/TrailieItinerary.jsx), [public export](../../shared/publicPlanExport.cjs).

## Six-scenario comparison

| Scenario | Model evidence before acceptance | Saved / projected result | Attribution |
|---|---|---|---|
| Zion + Bryce | Two complete new rejected proposals; older creation first attempt overwritten. New proposals retain coherent base progression and return travel. | Neither new proposal saved. Older accepted five-day plan has explicit departure; old cohort's thin three-stop plan later gained a stop. | Exact new failure is representation. Earlier multi-park research delivery defects are documented; old thinness cannot be assigned wholly to correction. Sunrise measurement enrichment is independently defective. |
| Glacier | Accepted proposal summary matches five deliberate areas: west-side forest/lake, alpine-road transfer, St. Mary, Many Glacier, Two Medicine. Full original detail unavailable. | Nine saved stops. Requested Day 3 relaxation removes Saint Mary Falls and keeps Wild Goose Island at 60 min; Days 1, 2, 4, 5 remain byte-content equivalent as parsed objects. | Evidence of useful model choices and preserved scoped edit. Not proof all initial prose survived enrichment. Seasonal road assumption remains conditional. |
| Yellowstone | Accepted summary; intentional second Lamar Valley morning has explicit wildlife/photography revisit reason. | Two Lamar mornings and Hayden Valley retained. Last-day edit removes Grand Prismatic and reduces Norris from 90 to 60 min; Days 1–3 identical. | Repeat rule did not force artificial variety. Relaxation is traveler-authorized model change, not guard damage. |
| Yosemite feasibility | Conversation declines the rushed three-park premise and proposes Yosemite. Creation required correction, original rejected payload unavailable. | Arrival/Tunnel View, full Yosemite day, departure/El Capitan Meadow. After-lunch San Francisco departure removes Day 1 stop; Days 2–3 identical. | Good feasibility judgment and permitted partial arrival day. Initial correction quality preservation unresolved. |
| Shenandoah discovery | Discovery/comparison leads to four-day plan. Creation required correction; original rejection unavailable. | Limberlost/Crescent Rock, Big Meadows, Bearfence Viewpoint, Blackrock. Requested drive-home Day 4 becomes departure with no mapped stop; Days 1–3 identical. | Saved scoped change reflects new traveler constraint. No basis to say the guard made the original trip thin. Difficulty/access not universally certified by acceptance. |
| Zion constrained | Existing eight initial trials and four follow-ups; some rejected choices had unknown exposure eligibility. Original rejected full text generally unavailable. | Six of eight initial trials ultimately saved; all four follow-ups saved. Accepted mix includes Pa'rus, Riverside Walk, museum/history and conditional pinless scenic drive. Captures retain exposure restriction. | Guard properly refuses to turn unknown exposure into known low. Missing activity-level evidence limits supply; not proof the places are unsafe. Correction repaired one of three opportunities; two ended in explanation without a plan. |

Historical correction effects are not reconstructable merely by comparing an accepted final summary with the request. The newly checked follow-up preservation is strong evidence for scoped editing, not for full correction regeneration.

Supporting historical reports: [full conversation pilot](trailie-full-demo-conversation-replay-2026-10-12.md), [constrained eligibility](trailie-eligibility-reliability-2026-10-12.md), [post-fix Zion/Bryce](trailie-zion-bryce-live-release-readiness-2026-10-13.md).

## Correction-delta assessment

A bounded model-selected correction is worth investigating for the two fresh omissions. It is not implemented or benchmarked. Preserve the immutable rejected proposal, give the model exact day/block diagnostics and frozen evidence, restrict allowed edits to the necessary structure, apply its returned delta in memory, then run the **full unchanged guard** on the merged proposal. Require unchanged unrelated days/stops/notes/durations/bases, complete acceptance and separate traveler-quality review. Do not automatically insert a departure block, relabel a transfer, or mandate final-day departure.

Current `plan_patch` targets an **accepted** canonical plan, so it cannot simply be repurposed as a correction of a rejected creation. Full correction remains necessary for coupled logistics/safety changes or any case that cannot satisfy the bounded edit contract. No evidence yet demonstrates correction-delta latency savings or preservation.

The current full-correction path can regenerate a new plan when creation fails. Frozen research and correction instructions constrain it, but there is no unchanged-day invariant against that rejected creation analogous to accepted-plan patch protection. Capture every round immutably before a future experiment; do not infer damage or preservation from overwritten diagnostics.

## Streaming assessment

The recommendation is technically plausible, but not yet a demonstrated Trailie improvement. The current model adapter awaits a non-streaming Responses result. The route emits progress and 15-second keepalives, then canonical content after runtime/store completion. Server event timing is not browser paint timing.

Official Responses documentation defines partial function-call argument events with item identity and sequence number: [function-call argument deltas](https://developers.openai.com/api/reference/resources/responses/streaming-events#response.function_call_arguments.delta). Installed SDK types also include argument-done and output-text delta events. This establishes API capability, not measured behavior of this exact Sol proposal.

Trailie's itinerary is inside `propose_trip_update` arguments, not necessarily ordinary text. A day object becoming syntactically complete is not a validated or independently final itinerary. An incremental parser must handle escaping, nested arrays/objects, multiple output items, interruption/refusal/incomplete responses and final-response reconciliation. Later day/base/memory constraints can invalidate an earlier day. Non-streamed raw JSON cannot establish arrival timing.

If a later isolated streaming experiment is authorized, keep schema/model/evidence/settings/guard fixed and measure first argument delta, first complete parseable day, each day boundary, final model completion, memory/guard completion, total accepted-plan time, tokens/cache/service tier/cost and rejection/cancellation behavior. One sample establishes feasibility only, not a reliable latency distribution.

An internal stream buffer with honest stage progress preserves today's boundary, but by itself does not deliver an earlier itinerary to the traveler. Draft preview is a separate product decision: current policy says the traveler sees only the final answer and never the rejected proposal. A preview needs explicit provisional status, withdrawal/replacement on failure and no partial persistence/share/export/navigation as an accepted trip. No UI or policy changes are authorized by this audit.

“Verified information immediately” also needs qualification: retrieved evidence may be conditional, dated, unavailable or only partially supported. Expose only approved traveler-facing facts with their relevant scope, not raw tool payloads or the model's private reasoning. Streaming conversational text also does not automatically ground factual claims.

## Performance conclusions and next decisions

- Baseline 65.87 s versus candidate 61.16 s is a 7.1% single-pair difference, confounded by different content and cache state. Both failed acceptance. Reject this candidate; do not claim that every possible output reduction has been disproved.
- The 8.1% lossless token reduction is an `o200k_base` proxy estimate, not exact Sol field-level billing. Actual candidate output reduction also includes changed content.
- Baseline recorded 15,416 cached input tokens. Caching works for this fixed-input case; it did not eliminate the roughly 66-second generation. This does not establish production cache hit rates.
- Keep faster service tiers as a separate future experiment. No account availability, price premium or speed benefit was established in this audit.
- First preserve per-attempt evidence and address activity-scoped measurement accuracy in a separately authorized change. Then consider the smallest model-owned correction-delta pilot for the confirmed structural omission. Maintain the current guard until such work is reviewed.
- Review presentation's loss of specific caveats and complete actual mobile/desktop checks before production readiness claims. Conversational factual grounding remains a separate incomplete requirement.

Audit verification: two exact offline guard replays passed their expected-result assertions; recorded verifier inputs matched; five historical scoped follow-up comparisons preserved the unaffected days listed above. No new paid test, product test-suite claim, production activation or general safety certification is implied.
