# Stage 14.7R — Seven-day evidence-contract repair

Stage 14.7R completed deterministically with zero provider calls and zero provider cost. It preserves the historical `basic-03-seven-day` run `stage147g-mshyixvk-52ed4e` as consumed with decision `STAGE14_7_LIVE_CONFIRMATION_FAILED` and category `evidence_contract_incomplete`.

## Findings and repair

The retained seven-day artifact proves the production flow, persistence, lifecycle, restore, replay, cleanup, isolation, and a 64.2-second / 52.47% visibility gain. The historical artifact did not retain Anthropic cache-creation/cache-read counters or component-level numeric assistant-message ID and timestamp snapshots. Repository-wide inspection found no raw terminal usage events or persistence/restore snapshots from which those exact historical values could be recovered. Both limitations are recorded as `historical_not_retained`; neither is fabricated as zero or inferred from the broad historical `identityStable` boolean.

The provider ledger now preserves input, output, cache-creation, and cache-read tokens independently. Missing cache fields remain `null`, receive an explicit evidence status, and force conservative settlement. Fully actual pricing is used only when all required provider usage dimensions were reported.

The identity contract now captures six attributable snapshots: both persistence payloads, both stored revisions, authenticated restore, and frontend-selected restored state. It independently checks response identity, numeric message ID, timestamp, and assistant slot. Missing component evidence fails closed.

The aggregate adjudicator now calculates production correctness, gain, and evidence-contract completeness separately through a required-evidence manifest. Correctness plus gain with incomplete raw evidence remains `STAGE14_7_LIVE_CONFIRMATION_FAILED` until a valid post-run adjudication explicitly accounts for any bounded historical limitation.

## Replay and bounded adjudication

The preserved seven-day transcript was replayed through the real SSE parser, coordinator/reducers, persistence payload builders, isolated persistence, authenticated restore, and presentation resolver. The replay produced the exact ten-event lifecycle, two accepted writes, no automatic write from `done`, stable frozen-plan hashes, successful restore and cleanup, component-level stable numeric message identity, explicit recorded cache evidence, and `mechanism_replay_passed`. Replay identifiers are mechanism evidence only and are not represented as historical live identifiers.

The bounded historical limitations do not affect production correctness and cannot understate caps: the historical run's known $0.198300 cost is supplemented by a conservative $0.280000 reservation bound, and cumulative conservative exposure remains $0.752758 below the reviewed $1.50 ceiling. The real transcript replay proves the repaired capture mechanisms. The receipt-covered seven-day adjudication therefore records `LIVE_EVIDENCE_CORRECT_AFTER_EVIDENCE_CONTRACT_REPAIR`, `evidenceContractPassed: true`, and `requiresPaidSevenDayRerun: false` without altering the historical failure.

## Cumulative exposure and final state

Canonical cumulative exposure reconciles exactly to 7 requests, 134,519 input tokens, 40,202 output tokens, and $0.671058. It is the sum of the prior five requests / 97,714 input / 27,733 output / $0.472758 and the preserved seven-day two requests / 36,805 input / 12,469 output / $0.198300.

Both the three-day and seven-day adjudications validate. The final aggregate decision is `READY_FOR_STAGE14_INTERNAL_ACCEPTANCE_TESTING`, while `liveExecutionReady` remains false with `stage14_7_complete_no_live_execution_authorized`. No seven-day replacement was defined because historical adjudication passed; the older unused three-day replacement remains unauthorized and unconsumed.

## Verification

- Stage 14.7 provider-disabled server suite: 13 files and 302 tests passed; provider constructors, dispatches, and external provider HTTP requests were all zero.
- Captured seven-day replay: 1 test passed with zero provider calls.
- Exact full frontend suite: 746 passed and 11 unrelated existing failures in four files. Every Stage 14.7 integration and replay file passed, including the new Stage 14.7R replay.
- Complete deterministic composite preflight: all phases A–U passed; zero live calls, zero cost, no stale evaluation children.
- Receipt: `14.7R.1`, valid as an integrity receipt and explicitly unauthorized for further paid execution.

Internal acceptance testing, Atlas access, production flags, replacement execution, commit, and push were not performed.
