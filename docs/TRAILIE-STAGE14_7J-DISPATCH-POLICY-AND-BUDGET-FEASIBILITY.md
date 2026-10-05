# Stage 14.7J — Dispatch model policy and cumulative live-manifest feasibility

**Zero provider calls. $0.00 spent. No scenario consumed. No cap changed. No live run authorized.**

Stage 14.7I repaired the production model-resolution defect at the input
boundary and was approved as a repair stage. Two things it left open are closed
here, and one question it never asked is now answered with a number.

---

## 1. Historical state — preserved, untouched

Nothing in this stage modifies the record of the failed run.

| Fact | Value |
|---|---|
| Failed scenario | `basic-02-three-day` |
| Run id | `stage147g-msga12h5-30340b` |
| Decision | `STAGE14_7_LIVE_CONFIRMATION_FAILED` |
| Consumption marker | `provider_attempt_settled` (unchanged) |
| Provider attempts | 3 (2 structured 400s, 1 prose) |
| Conservative exposure | `$0.32` |
| Reset permitted | **no** |

The marker, the three attempt records, the reconciliation and the audit file are
byte-identical to before this stage. `basic-02-three-day` remains permanently
consumed.

---

## 2. The allowlist deviation, closed

### What 14.7I actually shipped

```js
assertDispatchableModel({ model, provider, enforceAllowlist: false })
```

The deep check existed and was **switched off on the only path that spends
money**. Its reasoning — that `resolveProviderModel` had already vetted a
client-supplied model — was true and insufficient: `prepareChatContext` is one
caller, not the only way into the orchestrator.

### What 14.7J enforces

`server/src/config/providerDispatchPolicy.js`:

```js
assertProviderDispatchModel({ provider, model, allowedModels })
```

For Claude, all three must hold:

```text
allowedModels is a nonempty list          else claude_model_policy_missing
model is a nonempty string                else claude_model_not_resolved
model ∈ allowedModels                     else claude_model_not_allowlisted
```

Run **immediately before every reservation and every dispatch**, at five points:

| Where | When |
|---|---|
| `toolFirstItineraryOrchestrator` | once before the attempt loop, then before **every** reservation |
| `structuredItineraryGenerator` | on the assembled request object, immediately before `messages.create` |
| `scenarioChild` — live instrumentation | before the reserve ask, and again before the SDK call |
| `scenarioChild` — deterministic stand-in | before the dispatch handshake |
| `stage14_7gLiveScenarioDriver` (parent) | before `ledger.beginAttempt` |

A failure occurs before reservation creation, before consumption
authorization, before dispatch acknowledgement, before SDK construction and
before network access.

### No permissive default

There is no `skipAllowlist`, `allowAnyModel`, `disableModelValidation` or
`testModeAllowsEverything`, and no environment-dependent bypass — asserted by a
source-level test. A missing or empty policy is a refusal, never a pass.

The paid-run allowlist is the **intersection** of the configured provider models
with the receipt-covered `TRAILIE_EVAL_MODEL_ALLOWLIST="claude:claude-sonnet-5"`.
An intersection can only narrow, so a misconfigured evaluation allowlist yields
`[]` and refuses rather than widening.

A dispatch refusal is **not** laundered into a retryable `provider_error` — the
generator rethrows it and the orchestrator returns `configuration_error` with
zero further attempts. Retrying a locally-decidable refusal is precisely how one
misconfiguration became two paid 400s.

---

## 3. Test-policy injection — no fixture was renamed

The 32 synthetic fixtures keep their model ids. Each suite declares its own
policy:

```js
allowedModels: ['synthetic-claude', 'test-model']
```

| Suite | Injection |
|---|---|
| `trailieItineraryTurn` / `…Consistency` | `['m']` |
| `phaseBPromptContract` | `['test-model']` |
| `structuredAttemptTelemetry` | `['test-model']` |
| `eval/trailie/index.js` (recorded/mocked) | the matrix entry being exercised |
| `eval/trailie/index.js` (live) | receipt-covered configuration — injection refused |
| `scenarioChild` (deterministic) | injected at boot |
| `scenarioChild` (live) | receipt-covered configuration — injection refused |

Fixtures that exist to prove **rejection** (`unlisted`, `some-unlisted-model`,
`gpt-x`) simply omit their model from the injected list and continue to prove
bounded rejection.

---

## 4. Resolution / reservation / dispatch identity

`createDispatchModelGuard({ provider, resolvedModel, allowedModels })` binds the
model identity at context preparation and carries it forward:

```text
resolved model == reservation model == dispatch model
```

A mismatch fails before network access with `provider_model_identity_changed`.
The two assertion points read the model at genuinely different moments —
`assertReservation` from the value about to be reserved, `assertDispatch` from
the request object the SDK is about to receive — so a substitution between them
is observable, including one that swaps in another *authorized* model.

---

## 5. The exact proposed live manifest

```text
1. basic-02-three-day-model-fix-validation-1
2. basic-03-seven-day
```

```js
{
  originalFailedScenario: "basic-02-three-day",
  originalFailedScenarioConsumed: true,
  replacementScenarioDefined: true,
  replacementScenarioExecutionAuthorized: false,
  sevenDayScenarioAvailable: true,
  executionOrderFixed: true
}
```

The replacement is **not** added to the approved list. The executor refuses any
set that is not exactly this one, in this order, with:

```text
LIVE_EXECUTION_NOT_STARTED
live_scenario_manifest_not_authorized
```

before consumption. A seven-day-only invocation is refused as
`partial_manifest_refused` and can never be described as completing the
two-scenario Stage 14.7 confirmation.

---

## 6. Whole-plan worst-case projection

Computed with the **production** reservation code (`createRunLedger().reserve()`)
and the production price config. Seeded with the failed run's real exposure.

### Bounded attempts counted per scenario

| Phase | Attempts | Output ceiling |
|---|---|---|
| Structured (initial) | 1 | 6,000 (3-day) / 12,000 (7-day) |
| Structured (bounded retry, modelled after truncation) | 1 | 12,000 |
| Prose (initial) | 1 | 8,000 |
| Prose (enforce-mode verifier retry) | 1 | 8,000 |

The verifier itself is deterministic and costs nothing. The deterministic
renderer is **not** counted as a provider attempt.

### Result

| Metric | Value |
|---|---|
| `priorConservativeExposureUsd` | **$0.32** |
| `replacementWorstCaseExposureUsd` | **$0.50** |
| `sevenDayWorstCaseExposureUsd` | **$0.56** |
| `remainingPlanWorstCaseExposureUsd` | **$1.06** |
| `cumulativeProjectedWorstCaseUsd` | **$1.38** |
| `cumulativeCostCapUsd` | $0.75 |
| `requestsRemainingBeforePlan` / `maximumPlannedRequests` | 9 / **8** ✅ |
| `inputTokensRemainingBeforePlan` / `maximumPlannedInputTokens` | 180,000 / **160,000** ✅ |
| `outputTokensRemainingBeforePlan` / `maximumPlannedOutputTokens` | 50,000 / **74,000** ❌ |
| `cumulativeBudgetFeasible` | **false** |
| `blockingCaps` | `max_total_cost_usd`, `max_output_tokens` |

**$0.43 is not enough.** The replacement scenario alone has a $0.50 worst case,
so the plan cannot even begin — let alone finish.

The projection is validated against reality: it reproduces the failed run's own
recorded reservations ($0.10 / $0.10 / $0.12) exactly.

### Minimum caps for the complete plan — calculated, NOT applied

```js
{
  minimumCostCapUsdForCompletePlan:        1.38,
  minimumRequestCapForCompletePlan:          11,
  minimumInputTokenCapForCompletePlan:   160000,
  minimumOutputTokenCapForCompletePlan:   74000,
  applied: false
}
```

No cap, environment value, receipt configuration or live command was changed.
This is evidence for a reviewed decision, not authorization.

---

## 7. Technical readiness ≠ paid-manifest readiness

```js
liveExecutionReady =
  liveExecutorTechnicalReady
  AND liveScenarioManifestReady
  AND cumulativeBudgetFeasible
```

| Flag | This stage |
|---|---|
| `liveExecutorTechnicalReady` | **true** |
| `liveScenarioManifestReady` | **false** — replacement not authorized |
| `cumulativeBudgetFeasible` | **false** — cap insufficient |
| `liveExecutionReady` | **false** |

The runner exits **0** on a zero-cost run: the remaining state needs a reviewed
authorization/cap decision, not a repair. It still refuses to spend.

---

## 8. Receipt

`preflightVersion: 14.7J.1`, 61 hashed files, 0 unresolved, no secrets.

`validateReceipt` now returns **two** answers, mirroring §7:

| Field | Meaning | Now |
|---|---|---|
| `valid` | the receipt faithfully describes THIS tree, and every technical gate passed | **true** |
| `liveExecutionAuthorized` | a paid run may proceed | **false** |

`authorizationRefusals`: `receipt_not_live_ready`,
`live_scenario_manifest_not_authorized`, `cumulative_stage14_7_cap_insufficient`.

`evaluateLiveAuthorization` consumes `liveExecutionAuthorized`, not `valid` —
so a truthful receipt cannot authorize a run the manifest and the caps refuse.
An invalid receipt authorizes nothing regardless of what it records.

The `14.7I.1` receipt is now **invalid**:

```text
receipt_does_not_show_dispatch_model_policy
receipt_does_not_show_provider_model_identity
receipt_does_not_show_budget_projection
receipt_does_not_show_original_failed_scenario_preserved
```

New hashes cover the dispatch policy, the identity assertion, the scenario
manifest, the budget projector, the structured generator, the turn service, and
the new policy/manifest test suites. The manifest and the projection travel
inside the receipt, so both questions are answered by one artifact.

## 8a. Composite preflight

18 phases, all green, including the new
`R_dispatch_policy_and_manifest_feasibility`. Exit code **0**.

```text
liveProviderCalls: 0
liveProviderCostUsd: 0
failedPhases: []
```

---

## 9. Next decision

Not "is $0.43 enough" — it is measured, and it is not. The reviewed decision is
whether to raise the Stage 14.7 cumulative caps to at least **$1.38 / 11 requests
/ 160,000 input / 74,000 output** and authorize
`basic-02-three-day-model-fix-validation-1`, or to reduce the remaining
confirmation's scope.

Until then: no scenario is consumed, no cap is changed, and no live run is
authorized.
