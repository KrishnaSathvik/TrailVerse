# Stage 14.7K — Replacement-manifest authorization and revised cumulative caps

> **SUPERSEDED IN PART — see §4 correction below and
> `TRAILIE-STAGE14_7-LIVE-BLOCKED-PRIOR-TOKEN-EXPOSURE.md`.**
>
> The feasibility verdict in §4 of this document (`cumulativeBudgetFeasible: true`)
> was computed with the failed run's prior **token** exposure seeded as zero.
> Its real exposure is 60,000 input / 20,000 output. Corrected, the plan needs
> 220,000 input and 94,000 output against ceilings of 180,000 and 80,000 — it
> does **not** fit. The cost and request conclusions in this document are
> unaffected and remain correct.

**Zero provider calls. $0.00 spent. Neither remaining scenario executed. No commit, no push.**

Stage 14.7J measured the complete two-scenario plan at `$1.38` against a `$0.75`
ceiling and refused. The reviewed decision **retained the full scope** and raised
the cumulative ceilings. This stage applies that decision.

---

## 1. The original failed scenario — preserved

Untouched, byte-identical:

```js
{
  scenarioId: "basic-02-three-day",
  runId: "stage147g-msga12h5-30340b",
  decision: "STAGE14_7_LIVE_CONFIRMATION_FAILED",
  providerRequests: 3,
  conservativeExposureUsd: 0.32,
  resetPermitted: false
}
```

The replacement **supplements** this evidence. `REPLACEMENT_SCENARIO.supersedes`
is `null` and `linkedFailedAttempt.resetPermitted` is `false`.

---

## 2. Authorized manifest

```text
1. basic-02-three-day-model-fix-validation-1
2. basic-03-seven-day
```

```js
{
  originalFailedScenario: "basic-02-three-day",
  originalFailedScenarioConsumed: true,
  replacementScenario: "basic-02-three-day-model-fix-validation-1",
  replacementScenarioExecutionAuthorized: true,
  sevenDayScenario: "basic-03-seven-day",
  sevenDayScenarioAvailable: true,
  executionOrderFixed: true
}
```

`APPROVED_SCENARIOS` is now **derived from** the manifest — the consumed original
is removed from every executable paid-scenario list, and a test asserts the two
cannot drift apart.

### The replacement resolves without becoming a new scenario

`scenarios.byId('basic-02-three-day-model-fix-validation-1')` returns the
original's prompt and assertions **verbatim**, carrying the slot's own id plus
`aliasOfScenarioId`. A different prompt would be a different experiment, not a
re-validation. The alias is deliberately absent from `ALL_SCENARIOS` so it
inflates no denominator. Phase A of the preflight now fails closed with
`manifest_scenario_unresolved` if any manifest entry stops resolving.

### Rejection cases

One exact-match comparison covers all of them. Each returns, **before any
marker is written**:

```text
LIVE_EXECUTION_NOT_STARTED
live_scenario_manifest_mismatch
```

| Requested | Result |
|---|---|
| seven-day alone | mismatch |
| replacement alone | mismatch |
| reversed order | mismatch |
| the consumed original | mismatch |
| a third scenario | mismatch |
| an unreviewed replacement id (`…-validation-2`) | mismatch |
| empty set | mismatch |

A *wrong set* (`live_scenario_manifest_mismatch`) and a *right set that may not
run* (`live_scenario_manifest_not_authorized`) are distinct codes — they demand
different fixes.

---

## 3. Revised cumulative caps

```text
TRAILIE_EVAL_MAX_TOTAL_COST_USD=1.50
TRAILIE_EVAL_MAX_REQUESTS=12
TRAILIE_EVAL_MAX_INPUT_TOKENS=180000
TRAILIE_EVAL_MAX_OUTPUT_TOKENS=80000
```

Hard ceilings, not expected spend. The static preflight requires **exact
equality** — an environment that raised a cap beyond what was reviewed fails as
readily as one that lowered it — and additionally requires the environment caps
to equal the projector's seed, so a projection can never describe ceilings the
run would not enforce.

The seed still carries the failed run's exposure:

```js
{ priorRequests: 3, priorConservativeCostUsd: 0.32 }
```

### Defect found and fixed while proving §5

`createLiveProviderLedger` was called by the live driver as
`{ model, caps: { ...caps, priorTotals } }`, but `createRunLedger` takes
`priorTotals` as its **own** parameter. The value arrived inside `caps`, where
nothing read it — **every live ledger started its cap projection from zero.**

Harmless while each run had its own budget; not harmless the moment a
replacement run must inherit 3 requests and `$0.32`. The `$1.50` ceiling would
have been enforced as if `$1.50` remained, and the plan could have overshot by
exactly the prior exposure. Both call shapes are now accepted and forwarded, and
a regression test pins the driver's shape specifically.

---

## 4. Full-manifest feasibility — recalculated

Production reservation and pricing code, seeded with the real prior exposure:

| | Projected | Cap | |
|---|---:|---:|---|
| Cost | `$1.38` | `$1.50` | ✅ `$0.12` buffer |
| Requests | `11` | `12` | ✅ 1 spare |
| Input tokens | `160,000` | `180,000` | ✅ 20,000 spare |
| Output tokens | `74,000` | `80,000` | ✅ 6,000 spare |

```js
{ cumulativeBudgetFeasible: true, blockingCaps: [] }
```

Per-scenario: replacement `$0.50`, seven-day `$0.56`, remaining plan `$1.06`,
prior `$0.32`.

The request figure is now **cumulative** (prior + plan). Requests are the only
resource with a nonzero prior, so a plan-only figure read against a cumulative
cap would understate by exactly the failed run's 3.

**The calculation is not hardcoded in either direction.** Pinned tests prove:

- old `$0.75` / 50,000-output ceilings → `cumulative_stage14_7_cap_insufficient`
- new `$1.50` / 80,000-output ceilings → feasible
- `$1.37` cost cap → blocks on `max_total_cost_usd`
- 73,999 output cap → blocks on `max_output_tokens`
- 10-request cap → blocks on `max_requests`

The projector still reproduces the failed run's own reservations
(`$0.10 / $0.10 / $0.12`).

---

## 5. Per-dispatch cap enforcement — preserved

Whole-plan feasibility clears the plan *before scenario 1*. It does not replace
the per-attempt check. Proven:

- an attempt that would breach a revised cap is refused **before the call**, and
  is not entered in the ledger — nothing spent
- a settlement far above its reservation (75,000 output vs a 6,000 reservation)
  leaves 5,000 of the 80,000 ceiling, and the next 8,000-token dispatch is
  **stopped**, with `capsRespected()` still true — the run stops rather than
  overshooting
- the request ceiling counts the failed run's 3: the 10th attempt of this run is
  refused with `max_requests`
- the ledger has no vocabulary for raising a cap or shrinking a reservation
  mid-run (source-level assertion)

---

## 6. Readiness

```js
{
  liveExecutorTechnicalReady: true,
  liveScenarioManifestReady:  true,
  cumulativeBudgetFeasible:   true,
  liveExecutionReady:         true
}
```

`liveExecutionReady` is the conjunction and nothing else — each of the three
false-cases is pinned individually.

---

## 7. Model policy — unweakened

Re-run and green: missing policy, empty allowlist, missing model, non-allowlisted
model, resolution/reservation/dispatch identity mutation (both directions),
`claude-sonnet-5` accepted, synthetic models requiring explicit injected test
allowlists, no permissive escape hatch, and no model-policy failure creating a
reservation or a consumption marker. Nothing was relaxed to accommodate the new
manifest.

---

## 8. Consumption state — unchanged before and after

```js
{
  "basic-02-three-day":                        "consumed",
  "basic-02-three-day-model-fix-validation-1": "available",
  "basic-03-seven-day":                        "available"
}
```

Authorization is not consumption: `consumptionMarkerCreated` is `false`. Every
qualification test uses temporary marker and evidence directories.

---

## 9. Receipt `14.7K.1`

The `14.7J.1` receipt is invalid — `scenario_ids_changed`, `cost_caps_changed`,
`reviewed_decision_changed`, plus changed file hashes.

New: a `reviewedDecisionFingerprint` digest over the **values** a reviewer
approved (manifest, order, prior-exposure seed, all four ceilings), because
hashing files alone cannot distinguish a refactor from a decision change. Also
`cost_caps_do_not_match_reviewed_ceilings`, so a receipt recording numbers other
than the ones the run enforces cannot gate that run.

`server/src/eval/trailie/scenarios/index.js` is now hashed — it carries the
replacement-slot alias, and therefore *what would run*.

---

## 10. Preflight-only command (revised caps)

```bash
cd server

TRAILIE_EVAL_PREFLIGHT_ONLY=true \
TRAILIE_EVAL_EXECUTE_LIVE=false \
TRAILIE_EVAL_LIVE_PROVIDERS=true \
TRAILIE_EVAL_MODEL_ALLOWLIST="claude:claude-sonnet-5" \
CLAUDE_PRIMARY_MODEL="claude-sonnet-5" \
TRAILIE_ITINERARY_GENERATION_MODE=tool_first \
TRAILIE_ROLLOUT_KILL_SWITCH=false \
TRAILIE_ROLLOUT_TOOL_FIRST_RATE=1 \
TRAILIE_PROSE_CONSISTENCY_MODE=enforce \
TRAILIE_EARLY_ITINERARY_EVENTS=true \
TRAILIE_PROSE_RECOVERY=false \
TRAILIE_REVIEW_ENQUEUE_ENABLED=false \
TRAILIE_EVAL_TEST_MONGODB_URI="mongodb://127.0.0.1:27018/trailverse_eval_14_7" \
TRAILIE_EVAL_MAX_TOTAL_COST_USD=1.50 \
TRAILIE_EVAL_MAX_REQUESTS=12 \
TRAILIE_EVAL_MAX_INPUT_TOKENS=180000 \
TRAILIE_EVAL_MAX_OUTPUT_TOKENS=80000 \
TRAILIE_EVAL_CAPTURE_PRIVATE_DRAFTS=true \
node eval/run-stage14_7-early-visibility-two.js
```

No Anthropic key needed or read.

The future **live** command is this command with
`TRAILIE_EVAL_PREFLIGHT_ONLY=false`, `TRAILIE_EVAL_EXECUTE_LIVE=true` and
`ANTHROPIC_API_KEY` present. It is not run in this stage.

---

## 11. Partial-manifest and cap tests

Every required case, none of which invokes a provider:

| Case | Result |
|---|---|
| exact manifest + revised caps | **ready** — proceeds past both gates to the launch prerequisite check |
| seven-day alone | `LIVE_EXECUTION_NOT_STARTED` / `live_scenario_manifest_mismatch` |
| replacement alone | `LIVE_EXECUTION_NOT_STARTED` / `live_scenario_manifest_mismatch` |
| reversed order | `LIVE_EXECUTION_NOT_STARTED` / `live_scenario_manifest_mismatch` |
| the consumed original | `LIVE_EXECUTION_NOT_STARTED` / `live_scenario_manifest_mismatch` |
| a third scenario | `LIVE_EXECUTION_NOT_STARTED` / `live_scenario_manifest_mismatch` |
| old `$0.75` / 50,000-output caps | `cumulative_stage14_7_cap_insufficient` |
| new `$1.50` / 80,000-output caps | complete plan feasible |
| unexpected mid-plan headroom loss | stops before the unsafe next dispatch |

Every refusal leaves the marker directory unchanged — not even the non-consuming
`launch_attempted`, since the gates precede the loop entirely.

The "exact manifest is ready" case deliberately proves the gates are not simply
refusing everything: execution reaches the **first** thing after them and is
stopped there by an injected prerequisite failure, so nothing spawns.

---

## 12. Frontend regression-count discrepancy — resolved

The Stage J figures were **five partial directory runs**, not the full suite:
`src/utils`, `src/services`, `src/lib`, `src/components/plan-ai`, `src/lib/pdf`
(542 tests) plus five integration files (131). They excluded `src/hooks`,
`src/components/common`, `src/components` and others — which is exactly where
three of the four branch-baseline failures live.

Re-run with the exact baseline command (`npx vitest run`, no path filter):

```text
744 passed / 11 failed (755)
```

**The same exact 11 branch-baseline failures**, in the same four files
classified in Stage 14.7F5 §1:

| file | failing | cause |
|---|---:|---|
| `Header.test.jsx` | 7 | `vi.mock('../ThemeSwitcher')` lacks `SegmentedThemeSkeleton` |
| `useParkExploreIndex.test.js` | 2 | spy called with different arguments than asserted |
| `WeatherWidget.test.jsx` | 1 | `[data-testid="loader-icon"]` not found |
| `buildDayByDayPlanFollowUp.test.js` | 1 | copy drift: `'top pick'` vs `'top recommendation'` |

No new failure in any Stage 14 lifecycle, persistence, replay, projection or
cleanup file. Live authorization is **not** blocked.

---

## 13. Regression

| Suite | Result |
|---|---|
| Server non-network (`npx jest src`) | **2,115 passed**, 5 failed (pre-existing, external-API) |
| Frontend full (`npx vitest run`) | **744 passed**, 11 failed (exact baseline, same 4 files) |
| Composite preflight | static config + 18 phases all green, exit 0 |

The 5 server failures are the long-standing set — `npsParkAdapter`, `astroFacts`,
`npsParkConditions`, `parkChatImages`, `trailieFetchPlanner` — none of which
references any module this stage touched.

Focused suites re-run green: dispatch model policy (33), manifest + budget +
per-dispatch caps (49), model resolution (18), accounting repair (36), executor
qualification + real subprocess (104), composite preflight + receipt (61).

---

## 14. Stop

Both remaining scenarios are authorized, feasible and **not executed**. The
replacement-plus-seven-day live run may now be authorized **once**, in the fixed
order, under the revised cumulative ceilings.
