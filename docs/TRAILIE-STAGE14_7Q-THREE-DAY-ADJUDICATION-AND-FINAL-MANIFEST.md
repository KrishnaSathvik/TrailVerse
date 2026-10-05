# Stage 14.7Q — Three-day evidence adjudication and final manifest

Stage 14.7Q completed deterministically with zero provider calls and zero provider cost. The subsequent reviewed instruction authorizes exactly one execution of `basic-03-seven-day` under the same `14.7Q.1` receipt contract; no three-day scenario is authorized.

## Chronology and terminology

Live execution occurred, the evaluator falsely reported canonical mismatches, offline diagnosis repaired the evaluator, the captured live evidence was separately adjudicated correct, and the seven-day scenario remained as the final provider-backed test.

The historical live-run decisions are unchanged. Both `basic-02-three-day` (`stage147g-msga12h5-30340b`) and `basic-02-three-day-model-fix-validation-1` (`stage147g-mshqzkal-cda9db`) remain consumed with `STAGE14_7_LIVE_CONFIRMATION_FAILED`. The post-repair evidence adjudication is `LIVE_EVIDENCE_CORRECT_AFTER_EVALUATOR_REPAIR`; it is not a retroactive edit to either historical decision. The final aggregate Stage 14.7 decision does not yet exist because the seven-day run has not started.

## Three-day adjudication

The receipt-covered private record is `artifacts/private/stage14_7-three-day-adjudication.json`. Its validator re-derives the record from the preserved live artifact and Stage 14.7P replay and rejects a missing or changed record as `LIVE_EXECUTION_NOT_STARTED / three_day_adjudication_invalid`.

The evidence proves a valid provider itinerary, one stable frozen plan across all eight A–I transitions, the exact lifecycle journal, two accepted persistence writes, matching restore hash and plan, successful offline replay and cleanup, unchanged foreign records, and available local MongoDB. Early visibility gain was 46,213.150 ms / 55.17%, passing both thresholds. No production itinerary defect was found; evaluator defects were found. A third paid three-day call is not required.

The historical provider request IDs and SDK request model were not retained and remain explicitly reported as `historical_not_retained`. The retained evidence independently proves two authorized and ledgered attempts, two provider HTTP requests, zero unaccounted requests, stable `claude-sonnet-5` resolution/reservation/dispatch identity, and two successful settled responses.

## Final aggregate confirmation manifest

Completed evidence is the adjudicated, already-consumed model-fix three-day run. Remaining live execution is exactly `basic-03-seven-day`. Order is fixed, a three-day rerun is not required, and the reviewed final-live instruction authorizes that seven-day scenario exactly once through its permanent consumption marker.

`basic-02-three-day-canonical-fix-validation-2` remains a defined historical slot. It is unauthorized, unconsumed, not required for final confirmation, and absent from executable manifests.

## Exposure and projection

Canonical prior exposure remains 5 requests, $0.472758, 97,714 input tokens, and 27,733 output tokens. The production reservation/retry/pricing path projects the seven-day scenario at 4 requests, $0.56, 80,000 input tokens, and 40,000 output tokens.

The cumulative projection is 9 requests, $1.032758, 177,714 input tokens, and 67,733 output tokens. It fits the unchanged reviewed caps of 12 requests, $1.50, 240,000 input tokens, and 100,000 output tokens with no blocking cap. Whole-plan projection does not replace the provider ledger’s per-dispatch enforcement.

## Aggregate decision semantics

A future aggregate result always combines the validated three-day adjudication with the new seven-day evidence. A dispatched seven-day hard-invariant failure returns `STAGE14_7_LIVE_CONFIRMATION_FAILED`. Correct evidence with either scenario below an absolute or relative gain threshold returns `STAGE14_7_CORRECT_BUT_GAIN_INSUFFICIENT`. Only valid adjudication plus seven-day correctness, safety, at least 10 seconds and 20% gain, cumulative caps, restore, replay, and cleanup returns `READY_FOR_STAGE14_INTERNAL_ACCEPTANCE_TESTING`.

## Stage state

The executor is technically ready; the three-day adjudication, canonical identity, lifecycle, restore, gain, cumulative exposure, budget projection, and aggregate decision logic pass. The second replacement remains unauthorized. The reviewed final-live instruction makes `sevenDayExecutionAuthorized` and `liveExecutionReady` true only while the seven-day scenario remains available and all receipt-covered gates continue to pass.

Receipt version `14.7Q.1` covers the adjudication and validator, captured live/replay evidence and A–I comparison, final aggregate manifest, seven-day-only projection, cumulative exposure, aggregate decision calculator, authoritative runner, registry, ledger/caps, relevant tests, and lockfiles.
