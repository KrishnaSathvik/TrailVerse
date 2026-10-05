# Trailie Stage 13.9 — Multi-attempt accounting and Phase A trip-length sizing

**Status:** offline hardening complete. **Zero provider calls made.**
Nothing committed, pushed, enabled, or promoted. `tool_first` and enforcement
remain disabled; production defaults are unchanged.

---

## 1. Multi-attempt usage and cost accounting

### The defect

`toolFirstItineraryOrchestrator.js` assigned Phase A usage once per attempt:

```js
if (structured?.usage) metadata.structuredUsage = structured.usage;   // OVERWRITE
```

A retry replaced the discarded attempt's usage outright, so the Stage 13.8B
seven-day run's first attempt (15,552 in / 6,000 out ≈ $0.0911) was excluded from
Phase A totals, run cost, remaining budget, and both cost and token cap
enforcement. The `$2` cap was therefore **not enforceable whenever Phase A
retried**.

### The fix

Every real provider attempt is now accumulated and published:

| Field | Semantics |
|---|---|
| `structuredUsageAttempts[]` | one row per real attempt: `attempt`, `inputTokens`, `outputTokens`, `cacheCreationInputTokens`, `cacheReadInputTokens`, `usageKnown`, `maxTokens`, `status` |
| `structuredUsage` | the **sum** of those rows (`attemptCount`, `attemptsWithUnknownUsage` included) |
| `usageAccountingVersion` | `multi_attempt_v1` |

The aggregate equals the sum of the attempts by construction, and a test asserts
it. Per-attempt USD is attached by the evaluation layer
(`eval/trailie/usageAccounting.js` → `priceStructuredAttempts`) rather than the
orchestrator, preserving the existing rule that pricing never lives in generation
business logic.

Cache token categories are now captured from both adapters
(`cache_creation_input_tokens` / `cache_read_input_tokens`, and OpenAI's
`prompt_tokens_details.cached_tokens`). They count against the input-token cap.
Because the price table has no cache rates, a nonzero cache figure yields
`cost_unknown` — conservative, never silently free.

---

## 2. Reservation reconciliation per provider call

`createRunLedger()` gives every provider call exactly one ledger entry:

```
reserve()  → commit that call's conservative maximum; REFUSE the call if the
             reservation could breach any active cap
settle()   → replace ONLY that call's reservation with its own actual usage
```

Guaranteed behaviours (each has a test):

- First-attempt cost remains counted after a retry.
- Retry cost is added independently; earlier entries are never touched.
- A failed call **with** usage counts actual usage.
- A failed call **without** usage keeps its conservative reservation.
- Missing usage never becomes zero cost — and still consumes the request and
  token caps.
- Request caps count every provider request; token caps count every attempt.
- A retry whose reservation would breach a cap is blocked *before execution*, and
  the blocking cap is named (`max_requests`, `max_input_tokens`,
  `max_output_tokens`, `max_total_cost_usd_reservation`,
  `smoke_hard_request_ceiling`).

The ledger is threaded as an **optional** `budgetGuard` through
`runOneVariant → runTrailieItineraryTurn → orchestrateToolFirstItinerary`, and
around the live Phase B deliverer. Production routes pass nothing and are
byte-for-byte unaffected — asserted by test.

The ledger — not the record's final-attempt view — is now the source of truth for
cumulative spend in `runLiveSmoke`, and totals carry forward between runs so caps
bind across the whole smoke.

---

## 3. Corrected Stage 13.8B cost reconstruction

Produced offline from the recorded artifact by
`node eval/run-stage13_9-counterfactual.js`:

| | |
|---|---|
| Reported run cost | **$0.480448** |
| True run cost (all attempts) | **$0.571552** |
| Under-counted | **$0.091104** |
| Configured cap | $2.00 |
| Reported remaining | $1.519552 |
| **Corrected remaining** | **$1.428448** |

Per scenario:

| Scenario | Attempts | Reported | True | Missing |
|---|---|---|---|---|
| basic-02-three-day | 1 | $0.110142 | $0.110142 | $0 |
| correction-08-exceeds-difficulty | 1 | $0.102502 | $0.102502 | $0 |
| prose-33-removed-active | 1 | $0.092284 | $0.092284 | $0 |
| basic-03-seven-day | 2 | $0.175520 | $0.266624 | **$0.091104** |

The entire gap is the discarded seven-day attempt.

### Backward compatibility

`phaseAInputTokens`, `phaseAOutputTokens`, and `phaseAEstimatedCostUsd` are
published with **corrected semantics**: they now include discarded and failed
attempts. `readUsageAccounting()` reads an artifact without the
`multi_attempt_v1` marker as `final_attempt_only` rather than crashing or
inventing attempts.

---

## 4. Trip-length resolver policy

One pure resolver, `server/src/utils/tripLengthResolver.js`. No LLM, no network,
no clock, no I/O.

```js
resolveExpectedTripDays({ structuredConstraints, dates, userRequest })
  → { days, source, confidence }
```

Precedence, first hit wins:

1. `structured_num_days` — explicit validated `numDays`
2. `date_range` — valid **inclusive** start/end
3. `explicit_numeric_phrase` / `explicit_word_phrase` / `explicit_week_phrase`
4. `unknown`

Resolves: `7-day trip`, `7 day itinerary`, `seven-day itinerary`, `for 7 days`,
`for seven days`, `a week`, `one week`, `week-long trip`, `two weeks` (14).

Never resolves: `next week`, `sometime this week`, `the week of September 1`,
`during the weekend`, `a few days`, `several days`, `leaving in a week`,
`a week from Tuesday` — unless another structured source supplies the duration.
Ambiguous calendar references are masked out **before** any duration scan, so
they cannot leak into a match.

Fail-closed rules: conflicting explicit counts in one request → `unknown`;
reversed or unparseable date ranges do not resolve (they fall through, they never
guess); conflicting structured sources follow documented precedence (`numDays`
wins) and record `notes: ['date_range_conflict']`.

Sanitation: the resolver never mutates its inputs, and the request text never
appears in the result — only a day count and a source label.

---

## 5. "Plan a week" budget selection

```js
tripLengthResolution: { days: 7, source: 'explicit_week_phrase', confidence: 'exact' }
structuredTokenBudgetSelection: {
  expectedDays: 7,
  selectedMaxTokens: 12000,
  reason: 'long_budget:resolved_7_days_via_explicit_week_phrase'
}
```

The existing bounded policy is unchanged: 1–4 days → 6,000; ≥5 days → 12,000;
hard cap 16,000. Phase B token limits are untouched. The truncation retry is
retained as a bounded recovery for genuinely unexpected output sizes.

Previously `expectedDays` came only from `constraints.dates.numDays`, which was
`null` for this request, so Phase A started at 6,000 and paid for a truncated
attempt to discover it was a seven-day trip.

---

## 6. Counterfactual latency projection (§9)

Labeled `counterfactual_from_recorded_attempt`. **Not a new measurement.** It
reuses the recorded second attempt verbatim as the stand-in for a correctly-sized
first attempt, so it is a lower bound on the saving.

| basic-03-seven-day | Recorded | Projected |
|---|---|---|
| Structured attempts | 2 (6,000 → 12,000) | 1 (12,000) |
| Phase A duration | 118,470 ms | **68,160 ms** |
| Total response | 151,441 ms | **101,131 ms** |
| Run cost | $0.266624 | $0.175520 |

Avoided: **50,310 ms**, 6,000 output tokens, 15,552 input tokens, **$0.091104**.

Even corrected, the seven-day path is still ~101 s end to end, and the other
scenarios remain 35–47 s. **Early itinerary delivery is still required** — this
change only removes an avoidable 50-second distortion from the baseline the
latency architecture will be designed against.

---

## 7 & 8. Test coverage

`src/eval/trailie/__tests__/usageAccounting.test.js` — 34 tests
`src/utils/__tests__/tripLengthResolver.test.js` — 36 tests
`src/eval/trailie/__tests__/counterfactual.test.js` — 11 tests

Accounting: single-attempt success; truncated-then-retry with both attempts in
token/cost/cap totals; retry blocked by USD, input, output and request caps;
session-cumulative caps; failure with usage; failure without usage; cache-token
handling (counted, and `cost_unknown` when unpriced); remaining-budget
reconciliation; full run reconciliation across Phase A + Phase B + prose retry;
legacy single-attempt artifacts still readable; the Stage 13.8B example
reproduced with an assertion that the discarded attempt cannot disappear.

Resolver: every listed phrase form; every listed ambiguous form; structured
`numDays` overriding prose; date range overriding prose; invalid/reversed dates;
conflicting sources; non-mutation of the request and constraints; determinism;
no request text in metadata; and that token selection receives the resolved count.

---

## 9. Proposed next live validation (§10) — NOT RUN

`server/eval/run-stage13_9-two-scenario.js`, fail-closed to exactly:

```
basic-02-three-day
basic-03-seven-day
```

### Preflight (zero provider calls)

```bash
cd server
TRAILIE_EVAL_PREFLIGHT_ONLY=true \
TRAILIE_EVAL_LIVE_PROVIDERS=true \
TRAILIE_EVAL_MODEL_ALLOWLIST=claude:claude-sonnet-5 \
CLAUDE_PRIMARY_MODEL=claude-sonnet-5 \
TRAILIE_EVAL_MAX_TOTAL_COST_USD=0.75 \
TRAILIE_EVAL_MAX_REQUESTS=8 \
TRAILIE_EVAL_MAX_INPUT_TOKENS=150000 \
TRAILIE_EVAL_MAX_OUTPUT_TOKENS=45000 \
node eval/run-stage13_9-two-scenario.js
```

### Live (only after the preflight prints ✅)

```bash
cd server
TRAILIE_EVAL_LIVE_PROVIDERS=true \
TRAILIE_EVAL_MODEL_ALLOWLIST=claude:claude-sonnet-5 \
CLAUDE_PRIMARY_MODEL=claude-sonnet-5 \
TRAILIE_EVAL_MAX_TOTAL_COST_USD=0.75 \
TRAILIE_EVAL_MAX_REQUESTS=8 \
TRAILIE_EVAL_MAX_INPUT_TOKENS=150000 \
TRAILIE_EVAL_MAX_OUTPUT_TOKENS=45000 \
TRAILIE_EVAL_CAPTURE_PRIVATE_DRAFTS=true \
node eval/run-stage13_9-two-scenario.js
```

### Projected cost

| | Basis | Projected |
|---|---|---|
| basic-02-three-day | recorded 13.8B | $0.1101 |
| basic-03-seven-day | recorded 13.8B, single attempt | $0.1755 |
| **Expected total** | | **≈ $0.286** |
| Conservative cap | 2.6× headroom | **$0.75** |

Worst case if both scenarios still retry Phase A: ≈ $0.47 — inside the cap.
Cap set at $0.75 so a genuine anomaly aborts rather than silently spends.
`TRAILIE_EVAL_MAX_REQUESTS=8` = 2 scenarios × (2 structured + 2 prose).

### What the run must prove

1. `basic-02-three-day` still starts at 6,000.
2. `basic-03-seven-day` starts at 12,000, with
   `tripLengthResolution.source === 'explicit_week_phrase'`.
3. Seven-day completes in **one** structured attempt.
4. Cost and token totals include every attempt (`usageAccountingVersion` present).
5. The ledger reconciles exactly against the configured cap.
6. Phase B stays clean: one prose attempt, no fallback, no artifact leak.

The runner asserts 1–6 against the produced artifact and prints a pass/fail line
per scenario.

---

## Verification results (offline, no network)

```
src/eval/trailie + src/services/__tests__/structuredAttempt*
  + src/services/__tests__/toolFirst* + src/utils/__tests__/tripLengthResolver
  + src/config/__tests__
  → 24 suites, 238 tests, all passing

Full server suite: 125 suites, 1,164 tests
  → 120 suites / 1,159 tests passing
  → 5 pre-existing failures, all live-data dependent and unrelated:
     npsParkAdapter, astroFacts, npsParkConditions, parkChatImages,
     trailieFetchPlanner
     (verified failing on the unmodified baseline as well)
```

One existing test was updated, not weakened:
`structuredAttemptTelemetry.test.js` — the sanitized attempt-record field list
now includes `cacheCreationInputTokens`, `cacheReadInputTokens`, `usageKnown`.

---

## Files

**New**
- `server/src/utils/tripLengthResolver.js`
- `server/src/eval/trailie/usageAccounting.js`
- `server/src/eval/trailie/counterfactual.js`
- `server/eval/run-stage13_9-counterfactual.js`
- `server/eval/run-stage13_9-two-scenario.js`
- `server/src/utils/__tests__/tripLengthResolver.test.js`
- `server/src/eval/trailie/__tests__/usageAccounting.test.js`
- `server/src/eval/trailie/__tests__/counterfactual.test.js`
- `artifacts/trailie-stage13_9-counterfactual.json`

**Modified**
- `server/src/services/toolFirstItineraryOrchestrator.js`
- `server/src/services/structuredItineraryGenerator.js`
- `server/src/services/trailieItineraryTurn.js`
- `server/src/eval/trailie/index.js`
- `server/src/eval/trailie/liveEvaluation.js`
- `server/src/services/__tests__/structuredAttemptTelemetry.test.js`
