# Stage 14.7 Live — NOT STARTED: prior token exposure exceeds the revised ceilings

**Zero provider calls. $0.00 spent. Neither remaining scenario consumed.**

```text
LIVE_EXECUTION_NOT_STARTED
cumulative_stage14_7_cap_insufficient
blocking caps: max_input_tokens, max_output_tokens
```

---

## 1. What stopped the run

Stage 14.7 Live §4 requires the cumulative ledger to begin with:

```js
{ priorRequests: 3, priorInputTokens: 60000, priorOutputTokens: 20000,
  priorConservativeCostUsd: 0.32 }
```

and says no paid scenario may start when the prior totals disagree. They
disagreed. `cumulativeExposure()` was seeding:

```js
{ requests: 3, inputTokens: 0, outputTokens: 0, costUsd: 0.32 }
```

It reported the failed run's request count and cost faithfully and its **token
exposure as zero**.

The failed run's own evidence ledger
(`artifacts/private/stage14_7-live/stage147g-msga12h5-30340b/basic-02-three-day.json`):

| phase | attempt | reserved in | reserved out | settled | outcome |
|---|---:|---:|---:|---|---|
| structured | 1 | 20,000 | 6,000 | `settled_reserved` | failed |
| structured | 2 | 20,000 | 6,000 | `settled_reserved` | failed |
| prose | 1 | 20,000 | 8,000 | `settled_reserved` | success |
| **totals** | **3** | **60,000** | **20,000** | | **$0.32** |

No attempt was ever settled with provider-reported usage, so under Stage 13.9's
invariant every reservation stands — missing usage never becomes zero.

---

## 2. Corrected cumulative arithmetic

Stage 14.7 Live §11 requires the ceilings to hold **across the original failed
run and the remaining manifest**:

| Resource | Prior | Plan | Cumulative | Cap | |
|---|---:|---:|---:|---:|---|
| Requests | 3 | 8 | **11** | 12 | ✅ |
| Cost | `$0.32` | `$1.06` | **`$1.38`** | `$1.50` | ✅ |
| Input tokens | 60,000 | 160,000 | **220,000** | 180,000 | ❌ over by 40,000 |
| Output tokens | 20,000 | 74,000 | **94,000** | 80,000 | ❌ over by 14,000 |

Two of the four cumulative ceilings cannot cover the complete plan.

---

## 3. Why Stage 14.7J and 14.7K missed it

Both stages compared **plan-only** token figures (160,000 / 74,000) against
**cumulative** token caps, because the prior token exposure they were adding was
zero. The cost comparison was correct throughout — `$0.32` did carry — which is
why the error was invisible in the number everyone was watching.

This is the third instance of the same defect family in this stage sequence:

| Stage | Prior exposure that failed to carry |
|---|---|
| 14.7I | live run restarted the `$0.75` budget from zero |
| 14.7K | `priorTotals` passed inside `caps`, silently dropped by `createRunLedger` |
| **here** | prior **token** totals seeded as zero while cost and requests carried |

Each was found by asking what the previous stage had assumed rather than
measured. The raise from `$0.75` to `$1.50` fixed exactly the two ceilings the
uncorrected projection said were binding; it could not fix the two that were
binding unseen.

---

## 4. The fix

`cumulativeExposure()` now derives the prior token totals from the failed run's
own evidence ledger, falling back to the reviewed evidence-derived constants
(60,000 / 20,000) — never to zero. `DEFAULT_SEED` carries
`priorInputTokens` / `priorOutputTokens`, and all four projected figures are now
cumulative.

A guard was added so the audit's own rows — which record phase, outcome and
reserved **cost** but no tokens — can never be summed to zero and mistaken for
evidence of no token exposure.

---

## 5. Verified refusal, before any dispatch

Driving the production executor with the exact authorized manifest:

```text
executionStatus : LIVE_EXECUTION_NOT_STARTED
stopReason      : cumulative_stage14_7_cap_insufficient
refusalReasons  : ["max_input_tokens", "max_output_tokens"]
scenariosRun    : 0
providerCalls   : 0    costUsd: 0
```

Scenario availability, unchanged:

```text
consumed   basic-02-three-day
available  basic-02-three-day-model-fix-validation-1
available  basic-03-seven-day
```

The authorization gate independently refuses on
`live_execution_not_ready`, `readiness_receipt_invalid` and
`cumulative_stage14_7_cap_insufficient`.

---

## 6. Minimum ceilings for the complete plan — calculated, NOT applied

```js
{
  minimumCostCapUsdForCompletePlan:      1.38,   // current 1.50  ✅ covered
  minimumRequestCapForCompletePlan:        11,   // current   12  ✅ covered
  minimumInputTokenCapForCompletePlan: 220000,   // current 180000 ❌
  minimumOutputTokenCapForCompletePlan: 94000,   // current  80000 ❌
  applied: false
}
```

No cap, environment value, receipt or command was changed. This is evidence for
a reviewed decision.

---

## 7. What the reviewed decision now is

The cost ceiling is **not** the binding constraint — `$1.50` covers the `$1.38`
worst case with `$0.12` to spare, and 12 requests covers 11. The binding
constraints are the two token ceilings, and they are binding only because the
failed run's 60,000 / 20,000 reservations count against them.

Three options, none of which this stage may choose:

1. **Raise the two token ceilings** to at least 220,000 input / 94,000 output,
   leaving cost and request ceilings as reviewed.
2. **Exclude only the two provider-side 400 rejections** (2 × 20,000 input /
   6,000 output). Those were rejected before generation
   (`providerRejectedBeforeGeneration: true`), so a reviewer could reasonably
   decide they consumed no tokens. The third attempt succeeded and must keep its
   reservation regardless — its usage was simply never captured, which is the
   streaming-settlement defect 14.7I fixed.

   Measured, this is **still not enough**:

   ```text
   input  180,000 / 180,000   exactly at the ceiling, zero margin
   output  82,000 /  80,000   still over by 2,000
   ```

   It would also require moving the `$0.32` cost figure in step, since the same
   rows produced it. This option relaxes the conservative-reservation invariant
   and does not actually unblock the run.
3. **Reduce scope**, which the previous review already declined.

**Recommendation: option 1.** It is the only one that actually unblocks the run,
it changes no accounting invariant, and it is consistent with the reasoning
already applied to the cost ceiling — the ceilings exist to bound worst-case
exposure, and the measured worst case is now known to be 220,000 / 94,000.

---

## 8. Regression

- Server non-network: **2,119 passed**, 5 failed (the long-standing external-API
  set; none references a module this change touched)
- Stage 14.7 manifest/budget/cap suite: all green, including new tests pinning
  the corrected prior token exposure and the refusal it produces

The `14.7K.1` receipt is invalidated by this change (`failedRunAudit.js` and
`fullRunBudgetProjection.js` are both hashed) — the correct fail-closed outcome.

---

## 9. Stop

No provider call was made, no scenario was consumed, no cap was changed, and
neither remaining scenario was executed. Both remain available for a single
confirmation run once the token-ceiling question is decided.
