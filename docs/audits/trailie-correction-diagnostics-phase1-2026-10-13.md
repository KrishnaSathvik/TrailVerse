# Trailie correction diagnostics — Phase 1, 2026-10-13

**Status:** Diagnostic capture implemented and verified offline. Exact historical failure remains unknown. A fresh diagnostic model replay is blocked pending explicit approval to send the captured trip history and research evidence to OpenAI.

## Scope and behavior

GPT-6.1 Sol, reasoning settings, prompts, output schema, research, guard decisions, correction feedback and persistence behavior are unchanged. No caching, service-tier, streaming, grounding, multi-agent or Luna work was performed. All existing production holds, including reserve discovery and Pass 2/Pass 3, remain in place. Nothing was committed or deployed.

Proposal capture now adds `dayTypeDiagnosis` to each rejected and accepted round. It records:

- Zero-based day index and declared day number.
- Declared day type, start/end periods, ordered block kinds and periods.
- Anonymous stop identifiers and block bindings, retaining reference equality without original place identifiers.
- Located conflicts with a rule name, field path, actual declarations and expected declarations.
- A bounded `replayDay` for reproducing **day-type consistency only** using the unchanged `validateDayCompleteness`. It is not a full plan or a full-guard replay fixture. Other issue codes from this deliberately reduced projection must not be treated as original failures.
- Patch operation indices/types/day numbers and the guard's evaluated candidate after patch application. Untouched days are excluded from patch diagnosis. The capture never reapplies a patch or guesses a candidate when none is available.

The diagnostic describes all three branches currently producing `day_type_inconsistent`:

| Rule | Conflict |
| --- | --- |
| `sightseeing_span` | Sightseeing starts after morning or ends before afternoon. |
| `sightseeing_outside_trip` | A sightseeing day has an outside-trip block in a period other than evening. |
| `missing_matching_block` | Arrival/departure/transfer/rest lacks its corresponding arrival/departure/transfer/downtime block. |

The existing validator confirms the issue before the diagnostic explains it. This explanation is private observability, not acceptance logic; it never enters correction feedback or model instructions. There is no automatic relabeling, block insertion or itinerary repair.

Files:

- [Diagnostic projection and explanations](../../server/src/utils/trailieDayTypeDiagnosis.js)
- [Private proposal capture](../../server/src/utils/trailieDiagnosisCapture.js)
- [Runtime capture integration](../../server/src/services/trailieSimpleRuntime.js)
- [Diagnostic tests](../../server/src/utils/__tests__/trailieDayTypeDiagnosis.test.js)
- [Capture tests](../../server/src/utils/__tests__/trailieDiagnosisCapture.test.js)
- [Runtime invariance test](../../server/src/services/__tests__/trailieSimpleRuntime.test.js)

## Privacy and failure behavior

Capture still requires `TRAILIE_DIAGNOSIS_CAPTURE=true`, a non-production environment and the gitignored private destination. Disabled/production capture returns before inspecting the proposal.

The new day-type projection excludes traveler quotes, memory, names, prose, dates, hotel locations, source URLs and coordinates. Text-presence placeholders preserve the relevant validator predicates. Limits are 60 days, 32 blocks/day, 64 stops/day, eight periods/block and 64 stop references/block. Oversized captures explicitly report truncation and do not claim complete reproduction. Missing candidates and unmatched reported failures are explicit rather than guessed. Existing summary/research capture fields are unchanged.

## Verification

Provider-disabled command, from `server/`:

```sh
npm run test:non-network -- --runInBand \
  src/utils/__tests__/trailieDayTypeDiagnosis.test.js \
  src/utils/__tests__/trailieDiagnosisCapture.test.js \
  src/utils/__tests__/dayCompleteness.test.js \
  src/services/__tests__/trailieSimpleRuntime.test.js \
  src/services/__tests__/trailieMemoryRuntime.test.js \
  src/services/__tests__/modelFirstHardGuard.test.js
```

**108 tests passed across six suites.** Provider isolation recorded zero live provider constructors, dispatches and external provider HTTP requests during these tests.

Coverage includes all three day-type rules, valid declarations, exact block/period location, anonymous binding preservation, truncation, applied patch candidates, disabled/production capture and ordered rejected/accepted rounds. The runtime integration test compares capture off/on and filesystem-write failure: model inputs, accepted response content/hash and accepted mutation remain identical (wall-clock response creation timestamp excluded). Existing memory and hard-constraint suites passed unchanged.

## Diagnostic replay and remaining limitation

The historical 103.6-second turn retained only the accepted proposal. Its rejected day periods cannot be recovered from that artifact. Synthetic regression cases establish that the new capture can identify each failure class; they do **not** establish which class caused that historical correction or whether it was merely a redundant declaration.

A bounded local harness was prepared at `artifacts/private/day-type-diagnostic-2026-10-13/replay.cjs`. It uses the original conversation and frozen research, reuses the recorded research request, fixes the evidence clock, permits one live Sol synthesis and optional real memory verification, and prohibits correction generation, live research and persistence. It is a diagnostic reproduction attempt, not an exact replay or a latency/quality benchmark. Private output paths refuse overwrite.

The sandbox attempt failed with `APIConnectionError` before response headers. Automatic approval review rejected the network retry because the captured trip history and evidence would be sent to OpenAI using the locally configured API key without sufficiently explicit authorization for that transfer. No successful generation or fresh day-type finding is available, and no database or production state was changed. The failed attempt is recorded locally; no billable-success or measured-speed claim is made.

**Next authorized decision needed:** Approve that single diagnostic transfer/replay. If the failure recurs, inspect the located declarations and classify it before selecting any generation optimization. If it does not recur, report non-reproduction rather than inferring the historical cause or starting repeated paid experiments. Phase 2 and every broader change remain held.
