# Stage 14.7L — Correct cumulative token exposure and final cap authorization

**Zero provider calls. $0.00 spent. Neither remaining scenario executed. No commit, no push.**

---

## 1. Historical evidence — preserved

Untouched, hashes identical:

```js
{ scenarioId: "basic-02-three-day", runId: "stage147g-msga12h5-30340b",
  decision: "STAGE14_7_LIVE_CONFIRMATION_FAILED",
  providerRequests: 3, conservativeCostUsd: 0.32,
  reservedInputTokens: 60000, reservedOutputTokens: 20000,
  resetPermitted: false }
```

Availability unchanged: original **consumed**, replacement and seven-day
**available**.

---

## 2. One canonical prior-exposure record

New module `priorCumulativeExposure.js`. One resolver, four dimensions,
answered together:

```js
{ priorRequests: 3, priorConservativeCostUsd: 0.32,
  priorReservedInputTokens: 60000, priorReservedOutputTokens: 20000 }
```

Derived from the failed run's own evidence ledger
(`artifacts/private/stage14_7-live/…/basic-02-three-day.json`) and cross-checked
against the audit reconciliation. `REVIEWED_PRIOR_EXPOSURE` is not a second
source of truth — the resolver **requires the evidence to agree with it** on
every dimension, so a silent change to the historical record is caught rather
than adopted.

**The two-seed problem is gone.** Previously requests and cost came from the
audit record while tokens came from nothing at all. `cumulativeExposure()`,
`defaultSeed()`, the projector, the executor, the provider ledger and the
per-dispatch check now all read the same resolver. A source-level test asserts
no literal prior figure survives outside it.

---

## 3. Fail closed when evidence is incomplete

`known zero` and `unknown` are different answers:

| Condition | Result |
|---|---|
| finite `0` present in evidence | **known zero** — usable |
| field absent | `prior_cumulative_exposure_unresolved` |
| field non-finite (`NaN`) | `prior_cumulative_exposure_unresolved` |
| tokenless ledger summary | unresolved on `inputTokens`, `outputTokens` |
| unreadable / malformed evidence | unresolved on all four |
| `costKnown: false` | unresolved |
| evidence disagrees with the reviewed record | unresolved, naming the dimension |
| reconciliation missing or failed | unresolved |

The refusal is returned **before** manifest authorization, marker creation,
reservation, dispatch authorization and network access. The executor emits it
ahead of every other gate, with `totals: null` — there is deliberately no
`priorTotals` object to reach for and find zeros in.

---

## 4. Reviewed cumulative ceilings

```text
TRAILIE_EVAL_MAX_TOTAL_COST_USD=1.50
TRAILIE_EVAL_MAX_REQUESTS=12
TRAILIE_EVAL_MAX_INPUT_TOKENS=240000
TRAILIE_EVAL_MAX_OUTPUT_TOKENS=100000
```

Cumulative across the failed original attempt plus both remaining scenarios.
`CUMULATIVE_CAPS` is the single reviewed source; the static preflight's labels
and thresholds are both derived from it, so a label can no longer disagree with
the threshold it describes. The preflight additionally requires the environment
caps to equal the projector's caps.

The two 400-rejected attempts keep their reservations. Provider billing was
probably zero for them, but the existing rule stands: **unknown usage stays
conservatively reserved.**

---

## 5. Complete-manifest projection

Production reservation and pricing code throughout.

| | Prior | Remaining plan | Cumulative | Cap | Headroom |
|---|---:|---:|---:|---:|---:|
| Requests | 3 | 8 | **11** | 12 | 1 |
| Cost | `$0.32` | `$1.06` | **`$1.38`** | `$1.50` | `$0.12` |
| Input tokens | 60,000 | 160,000 | **220,000** | 240,000 | 20,000 |
| Output tokens | 20,000 | 74,000 | **94,000** | 100,000 | 6,000 |

```js
{ cumulativeExposureResolved: true, cumulativeBudgetFeasible: true, blockingCaps: [] }
```

---

## 6. Manifest unchanged

```text
1. basic-02-three-day-model-fix-validation-1
2. basic-03-seven-day
```

Original consumed and excluded from every executable list; replacement
authorized; order fixed. Any other set → `live_scenario_manifest_mismatch`.

---

## 7. Propagation, proven at every handoff

```text
historical ledger → reconciliation → cumulativeExposure → defaultSeed
→ manifest projector → live runner → provider ledger → per-dispatch cap check
```

Exact equality asserted on all four dimensions at each step. Mutation tests
prove that dropping — or corrupting — **any single field** produces a bounded
failure rather than a zero default (8 cases: one drop and one `NaN` per
dimension).

---

## 8. Old caps refuse, revised caps accept

| Ceiling set | Result |
|---|---|
| 180,000 / 80,000 (previous) | blocked: `max_input_tokens`, `max_output_tokens` |
| **240,000 / 100,000 (revised)** | **feasible, `blockingCaps: []`** |
| 219,999 input | blocked `max_input_tokens` |
| 93,999 output | blocked `max_output_tokens` |
| 10 requests | blocked `max_requests` |
| `$1.37` cost | blocked `max_total_cost_usd` |
| 220,000 / 94,000 (exact minimums) | feasible |

---

## 9. Per-dispatch enforcement preserved

Whole-plan feasibility does not replace the per-attempt check. Proven: an
attempt that would breach a revised cap is refused before the call and never
enters the ledger; a settlement far above its reservation stops the next
dispatch with `capsRespected()` still true; the request ceiling counts the
failed run's 3. No cap is raised and no reservation shrunk automatically.

---

## 10. Readiness — five independent answers

```js
{ liveExecutorTechnicalReady: true,
  liveScenarioManifestReady:  true,
  cumulativeExposureResolved: true,
  cumulativeBudgetFeasible:   true,
  liveExecutionReady:         true }
```

`cumulativeExposureResolved` is deliberately **not** folded into
`cumulativeBudgetFeasible`: "we could not measure the prior exposure" and "we
measured it and it does not fit" must not report identically — the first is the
condition that produced two wrong feasibility verdicts.

---

## 11. Receipt `14.7L.1`

`14.7K.1` is invalidated by the corrected source and the revised ceilings. The
`reviewedDecisionFingerprint` now digests the prior exposure on **all four**
dimensions plus a `priorCumulativeExposureResolved` flag — the 14.7K
fingerprint carried only requests and cost, which is exactly why drift in the
token dimension went unrecorded. `priorCumulativeExposure.js` and its test are
hashed.

---

## 12. Future live command

The §12 preflight command with `TRAILIE_EVAL_PREFLIGHT_ONLY=false`,
`TRAILIE_EVAL_EXECUTE_LIVE=true`, `TRAILIE_EVAL_MAX_INPUT_TOKENS=240000`,
`TRAILIE_EVAL_MAX_OUTPUT_TOKENS=100000` and `ANTHROPIC_API_KEY` in the process
environment. Not run in this stage.

---

## 13. Stop

Both remaining scenarios are authorized, feasible and **not executed**. The
replacement three-day plus seven-day confirmation may now be authorized once
more.
