# Trailie Stage 14.7N — Provider-disabled regression isolation

Date: 2026-08-05 (America/Chicago)

Status: **technically passed; live scenarios not executed**

## 1. Incident reconciliation

The accidental regression exposure is recorded separately at
`artifacts/private/stage14_7N-accidental-provider-incident.json`:

```json
{
  "incidentType": "unexpected_live_provider_calls_from_regression_suite",
  "sourceSuite": "factsWebSearch.live.test.js",
  "providerCallsObserved": 4,
  "provider": "claude",
  "usageKnown": false,
  "costKnown": false,
  "stage14_7ScenarioCalls": 0,
  "stage14_7ScenarioConsumptionChanged": false
}
```

Local logs and private artifacts contained no recoverable request IDs, model
identifiers, timestamps, token usage, cache-token usage, or provider cost for
the four calls. Each call therefore retains `null` for those fields. No zero
usage or zero cost was fabricated, and no provider request was made to obtain
additional metadata.

The two exposure ledgers remain independent:

```json
{
  "stage14_7CumulativeExposure": {
    "requests": 3,
    "conservativeCostUsd": 0.32,
    "reservedInputTokens": 60000,
    "reservedOutputTokens": 20000
  },
  "incidentalRegressionExposure": {
    "requests": 4,
    "actualInputTokens": null,
    "actualOutputTokens": null,
    "actualCostUsd": null
  }
}
```

Consequently, the overall development session includes four known accidental
provider calls with unknown spend. Only Stage 14.7N itself is a verified
zero-provider, zero-cost stage.

## 2. Containment implementation

Ordinary Jest discovery now excludes `*.live.test.js`, `*.live.spec.js`, and
all `live/**` test directories. Live tests use a separate Jest configuration
and refuse before Jest/provider construction unless both exact values exist:

```text
TRAILIE_ALLOW_LIVE_TESTS=true
TRAILIE_LIVE_TEST_ACK=I_UNDERSTAND_THIS_MAKES_REAL_PROVIDER_CALLS
```

`TRAILIE_TEST_PROVIDER_MODE=deny_live` is installed before ordinary test
modules. It outranks provider keys loaded from `.env`; live Anthropic/OpenAI
construction, dispatch, or provider HTTP fails locally with
`live_provider_forbidden_in_test`. Synthetic adapters are explicitly tagged
and accounted separately.

The authoritative ordinary server command is:

```bash
cd server
npm run test:non-network
```

It sets deny mode, removes live-test acknowledgements, uses structural Jest
exclusions, installs outbound-network isolation, and prints this terminal
tripwire object:

```json
{
  "liveAnthropicConstructors": 0,
  "liveOpenAiConstructors": 0,
  "liveProviderDispatches": 0,
  "externalProviderHttpRequests": 0
}
```

## 3. Safe reproduction

Broad ordinary discovery found 169 test files and found zero live tests.
`factsWebSearch.live.test.js` was absent. Invoking the explicit live runner
without acknowledgements returned `live_tests_not_authorized` before Jest or a
provider client started.

The real deterministic Stage 14.7 subprocess was also run under deny mode. Its
recorded Anthropic adapter was recognized as synthetic, while the real SDK
remained forbidden. The focused network/real-subprocess qualification passed
69/69 tests and ended with all four live tripwire counters at zero.

## 4. Composite-preflight isolation

Composite preflight now contains phase
`S_regression_provider_isolation`. Structural tests prove that phases A–S use
synthetic providers, recorded transcripts, and provider-denied regression
tests only. No `*.live.test.js` file is reachable from the composite command.

The deterministic preflight-only runner completed static configuration and all
nineteen phases A–S. It did not enter live execution. Final gates were:

```text
preflightVersion                         14.7N.1
compositePreflightPassed                 true
readinessReceiptValid                    true
evaluationIdentityContractPassed         true
regressionProviderIsolationPassed        true
liveTestsExplicitlyOptIn                 true
dotenvCannotEnableProvidersInDeniedMode true
compositePreflightExcludesLiveTests      true
liveExecutorTechnicalReady              true
liveScenarioManifestReady               true
cumulativeExposureResolved              true
cumulativeBudgetFeasible                true
liveExecutionReady                      true
replacementScenarioAvailable            true
sevenDayScenarioAvailable                true
providerCallsDuringStage14_7N            0
providerCostDuringStage14_7N             0
```

The private receipt is
`artifacts/private/stage14_7-readiness-receipt.json`. It fingerprints the deny
guard, live authorization bootstrap, Jest configurations and scripts, provider
tripwires, outbound isolation, composite manifest, incident record, relevant
tests, and both lockfiles.

## 5. Regression results

- Focused provider-policy and composite tests: 77/77 passed.
- Focused real subprocess and network containment: 69/69 passed, exact zero
  tripwire summary.
- Full provider-disabled server suite: 160 suites passed, 5 failed; 2,194 tests
  passed and 5 failed. The terminal provider tripwire summary was exactly zero.
  The failures were the existing branch drift in `trailieFetchPlanner`,
  `astroFacts`, and `npsParkAdapter`, plus the two external-NPS-dependent tests
  `parkChatImages` and `npsParkConditions`, which the new non-network command
  correctly blocked from reaching NPS.
- Exact full frontend suite: 65 files passed, 4 failed; 744 tests passed and 11
  failed. This exactly matches the established baseline in `Header.test.jsx`,
  `useParkExploreIndex.test.js`, `WeatherWidget.test.jsx`, and
  `buildDayByDayPlanFollowUp.test.js`. All Stage 14 integration files passed.
- Complete deterministic composite preflight: static configuration plus phases
  A–S passed; fresh receipt validation passed.

No Stage 14 lifecycle, identity, persistence, restore, replay, cleanup,
accounting, manifest, dispatch-policy, or provider-isolation regression failed.

## 6. Scenario state before and after

The scenario and cumulative accounting state did not change:

```text
Original three-day:       consumed (provider_attempt_settled), preserved
Replacement three-day:    available
Seven-day:                available

Prior Stage 14.7:         3 requests / <=$0.32 / 60,000 input / 20,000 output
Reviewed cumulative caps: 12 requests / $1.50 / 240,000 input / 100,000 output
Projected complete total: 11 requests / $1.38 / 220,000 input / 94,000 output
```

Stage 14.7N wrote no scenario-consumption marker and did not alter the Stage
14.7 cumulative ledger. The four accidental regression calls remain solely in
the separate incident record.

## 7. Stop boundary

Stage 14.7N made zero provider calls and incurred $0.00. Neither
`basic-02-three-day-model-fix-validation-1` nor `basic-03-seven-day` was run.
Atlas, production flags, internal acceptance tests, commits, and pushes were
not used. The next live confirmation requires a new explicit authorization.

