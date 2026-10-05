# Trailie Stage 13 — Rollout Gates & Controlled-Rollout Design

**Nothing in this document is enabled.** It defines the gates, the deterministic
cohort assignment, the staged rollout plan, and the operational metrics. No cohort
is activated in Stage 13; production defaults remain `legacy` generation and `off`
consistency.

## 1. Configuration surface

### Cohort rates (`server/src/config/trailieRolloutConfig.js`)

| Env var | Meaning | Default |
|---|---|---|
| `TRAILIE_ROLLOUT_TOOL_FIRST_RATE` | fraction of eligible itinerary turns in the tool-first cohort | `0` |
| `TRAILIE_ROLLOUT_ENFORCE_RATE` | fraction in the enforce subset (⊆ tool-first) | `0` |
| `TRAILIE_ROLLOUT_KILL_SWITCH` | `true` forces both rates to 0 | `false` |

The rates are additionally forced to 0 unless `TRAILIE_ITINERARY_GENERATION_MODE=tool_first`
(nothing to roll out otherwise). The effective enforce rate is clamped to the
tool-first rate. Invalid values fail safe to 0; rates > 1 clamp to 1.

### Rollout budgets (unset ⇒ gate UNMET, never "ready")

| Env var | Gate |
|---|---|
| `TRAILIE_ROLLOUT_MAX_P95_TOTAL_MS` | p95 total latency < route timeout |
| `TRAILIE_ROLLOUT_MAX_P95_TTFT_MS` | p95 time-to-first-visible-token |
| `TRAILIE_ROLLOUT_MAX_AVG_COST_USD` | avg cost per successful itinerary |
| `TRAILIE_ROLLOUT_MAX_FALLBACK_RATE` | deterministic-fallback ceiling |
| `TRAILIE_ROLLOUT_MAX_FALSE_NEGATIVE_RATE` | semantic verifier FN ceiling |

### Cost price table (`server/src/eval/trailie/pricing.js`)

Two sources, resolved in order:

1. **Env override** — `TRAILIE_PRICE__<MODEL_SLUG>__INPUT_PER_MTOK` /
   `TRAILIE_PRICE__<MODEL_SLUG>__OUTPUT_PER_MTOK` (USD per 1M tokens). `MODEL_SLUG` =
   model id upper-cased, non-alphanumerics → `_`. Used mainly for synthetic/test models.
2. **Versioned, date-aware `PRICE_CONFIG`** (Stage 13.3B) — official Anthropic
   schedule, `priceConfigVersion 2026-07-29`. `claude-sonnet-5`:
   - **introductory** (2026-06-30 … 2026-08-31): **$2 in / $10 out** per 1M
   - **standard** (2026-09-01 …): **$3 in / $15 out** per 1M

   The run date selects the period (boundaries inclusive). A date before the
   schedule → `cost_unknown`; introductory is **never** silently reused after it
   lapses. Unconfigured cache-write/read usage forces `cost_unknown` (never treated
   as free). Unpriced models report `cost_unknown` and cannot pass the cost gate.

### Provider scope (Stage 13.3 — Trailie is Claude-only)

Trailie production planning/chat routes to **Claude only** (`autoRouteProvider()` →
`TRAILIE_DEFAULT_PROVIDER || 'claude'`, unset; website sends `provider:'auto'`;
model `claude-sonnet-5`). The structured (Phase A) and prose (Phase B) paths are
strictly provider-gated with **no cross-provider fallback** — a Claude provider
error stays a Claude error. OpenAI remains only as (a) legacy dual-provider config
in `aiModels.js`, reachable only via an explicit `provider:'openai'`; (b) an
*auxiliary* web-search-digest helper (`trailieLiteLlm.js`, Claude→OpenAI fallback,
not plan/prose generation); and (c) unrelated features (`dailyFeedController.js`).

Classification:

| Provider | Classification | Live rollout | Cost |
|---|---|---|---|
| `claude` (`claude-sonnet-5`, resolved from `CLAUDE_PRIMARY_MODEL`) | **production-live-eligible** | yes | priced + capped |
| `openai` | **compatibility-tested** (deterministic/synthetic + unit) | no | `not_applicable_to_trailie_live_rollout` |
| `openai` via `trailieLiteLlm` | **auxiliary-possible-provider** (digest/refine only) | no | out of Stage 13 scope |

Therefore, for Stage 13:
- **Production-eligible: the resolved `CLAUDE_PRIMARY_MODEL` only** (currently `claude-sonnet-5`). Live smoke allowlist = `claude:claude-sonnet-5`. The live matrix is resolved from production config (`resolveLiveEligibleMatrix()`), so it can't drift from the routed model.
- The Claude-only preflight requires **only** the Anthropic client/key; a missing OpenAI client, key, or price table **never** blocks it, and OpenAI live evaluation is **not** a rollout blocker.
- The OpenAI adapter stays covered by **deterministic (synthetic) compatibility runs and unit tests** — no live OpenAI calls, no OpenAI cost.
- Configuring OpenAI in a future live allowlist would require its client, pricing, and caps **normally** (an OpenAI-only isolated smoke without an OpenAI client returns `not_executed`).

**Accurate claim (do not overstate):** *Trailie itinerary planning and itinerary
prose generation are Claude-only in the current production configuration.* This is
**not** a claim that Trailie is globally free of OpenAI — see the auxiliary caveat.

**Auxiliary caveat (separate product decision).** `trailieLiteLlm.js` may fall back
Claude→OpenAI for web-search **digest / category-refinement** — it is *not* Phase A
structured generation, *not* Phase B itinerary prose, and *not* exercised by the
Stage 13 synthetic-fact harness. It does **not** expand the plan/prose live matrix
and is left unchanged here. Track separately:
> Should auxiliary Trailie fact-refinement remain dual-provider?

Removing OpenAI from `aiModels.js` / `trailieLiteLlm` / unrelated features
(`dailyFeedController`) is a **separate** decision, out of Stage 13 scope.

### Live-evaluation gating (`server/src/eval/trailie/liveEvaluation.js`)

All of the following are **required** before any live call (Stage 13.2 §2):

| Env var | Meaning |
|---|---|
| `TRAILIE_EVAL_LIVE_PROVIDERS` | `true` required for any live call |
| `TRAILIE_EVAL_MAX_TOTAL_COST_USD` | hard USD cost cap |
| `TRAILIE_EVAL_MAX_REQUESTS` | hard request ceiling |
| `TRAILIE_EVAL_MAX_INPUT_TOKENS` | hard input-token ceiling |
| `TRAILIE_EVAL_MAX_OUTPUT_TOKENS` | hard output-token ceiling |
| `TRAILIE_EVAL_MODEL_ALLOWLIST` | explicit `provider:model` / `model` allowlist (every matrix model must be listed) |

Pricing policy: **known pricing** enforces the USD cap *and* the request/token
ceilings; **unknown pricing** permits a **small smoke only** under the request/token
ceilings (plus a hard 64-request smoke ceiling), keeps the cost rollout gate
`not_passed`, and **refuses the full repetition matrix**. Execution **stops before
the next request** when any cap would be exceeded, and the report names the binding
cap. The runner records adapter-level success separately from pipeline success.
Credentials are never read, logged, or persisted by the evaluation code.

## 2. Deterministic cohort assignment

`server/src/utils/trailiePipelineModeSelection.js`:

```js
selectTrailiePipelineMode({ rolloutKey, eligible, toolFirstRate, enforceRate, override })
  → { generationMode, consistencyMode, bucket, reason }
```

Guarantees (unit-tested):

- **Stable hash (FNV-1a), never `Math.random`.** The same `rolloutKey` + rates
  always land in the same bucket → a user/trip stays in one cohort for a planning
  lifecycle. Use the safest non-PII key available (a stable internal trip/session
  id). **Never** hash raw email or profile data.
- **Enforcement ⊆ tool-first**, always — even under misconfiguration
  (`enforceRate > toolFirstRate`).
- Missing/invalid rates → 0. Ineligible turns (non-itinerary, conversion, welcome,
  discovery) → `legacy`/`off`. Anonymous and authenticated both supported.
- Explicit local/dev `override` wins but can only produce a coherent, safe combo
  (enforce cannot exist without tool_first).
- Environment kill switches (via the resolved rates) override cohort selection.

**Not wired into any route in Stage 13.** A future stage passes
`getTrailieRolloutRates()` into this function and threads the result through the
existing generation/consistency config seams.

## 3. Hard rollout blockers (§15)

Tool-first / enforcement must **not** be enabled while any hold:

```
canonical version mismatch                    > 0
invalid prose displayed before verification   > 0
marker / tool-JSON leak                        > 0
itinerary mutation after freeze               > 0
invented coordinate occurrence                > 0
default-share user-message exposure           > 0
unbounded retry occurrence                     > 0
anonymous quota double-count                   > 0
```

Also blocked when: **execution accounting is not internally consistent** (derived
execution count ≠ actual rows, or the inventory partition does not reconcile —
surfaced as `execution_accounting_inconsistent`); live provider evaluation is
incomplete; a supported production provider has no tested adapter; structured
failure is not user-usable; route parity is incomplete; p95 latency exceeds the
route timeout budget; cost cannot be estimated or capped; or the semantic
false-negative rate is materially unsafe.

**Current fixture-set status:** all checkable hard invariants = 0; both provider
adapters tested; structured failure resolves to a usable prose-only fallback; route
parity complete. **Outstanding blockers to canary:** live evaluation, manual
evaluation, and unset latency/cost budgets.

## 4. Provisional quality gates (§16)

| Gate | Threshold | Fixture-set result |
|---|---|---|
| Structured final itinerary success | ≥ 98% | 100% ✅ |
| Critical-scenario structured success | ≥ 95% | 100% ✅ |
| First-draft prose consistency pass | ≥ 90% | 100% ✅ |
| Success after one prose retry | ≥ 98% | 100% ✅ |
| Deterministic fallback rate | ≤ 2% | 0% ✅ |
| Semantic verifier false-positive rate | ≤ 3% | 0% ✅ |
| Semantic verifier false-negative rate | ≤ 3% | 0% ✅ (missing-day + overnight gaps closed in 13.1) |
| Major/critical manual inconsistency | 0% | not collected ⏳ |
| Canonical persistence equality | 100% | 100% ✅ |
| Route contract parity | 100% | 100% ✅ |

> **Fixture-set pass ≠ production-safe.** These thresholds are provisional. The
> synthetic dataset is small and several issue types have a single fixture, so a
> 0%/100% result means "no error observed on this set," not a statistically strong
> bound. Distinguish clearly in any status report:
> `gate passed on fixture set` vs `production-safe with high confidence`.

**Changing a gate** requires documenting: original gate, new gate, reason, and the
risk accepted. Do not lower a gate merely because results are unfavorable.

## 5. Latency & cost budgets (§17)

Derive budgets from the current production request timeout, the legacy baseline,
user-visible responsiveness, provider rate limits, and expected per-plan cost. At
minimum, before canary, confirm on **live** data:

- p95 total latency < configured route timeout;
- p95 time-to-first-visible-token acceptable for an itinerary-mode response;
- average cost per successful itinerary within the product budget;
- retry/fallback tails operationally acceptable.

Missing budgets do **not** declare readiness — the gate report marks them
`budget_unset` and treats them as unmet.

## 6. Manual evaluation protocol (§6)

For live outputs, use a **blinded** evaluation sheet. The evaluator sees the frozen
itinerary, final selected prose, final feasibility issues, and relevant canonical
facts. The evaluator does **not** see whether the output was first-attempt / retry /
fallback, the provider identity, or the automated verifier verdict during initial
labeling.

Labels per sample: `itineraryComplete`, `itineraryConstraintCompliant`,
`proseMatchesItinerary`, `unsupportedStopAdded`, `correctedStopRestored`,
`factualConflict`, `routeOutputComplete`, `userUsable`, `severity`
(`none|minor|major|critical`), `notes`. Label critical samples twice and record
disagreements. **Gate: 0 major/critical inconsistencies.**

## 7. Staged rollout plan (do not activate)

Every stage requires: a kill switch, stable cohorts, **no automatic progression**,
comparison against the legacy cohort, a monitoring window, and documented approval.

| Stage | tool-first | enforce | production |
|---|---|---|---|
| **A — Internal evaluation** | 100% in eval harness | 100% in eval harness | 0% |
| **B — Internal/manual production** | allowlisted sessions only | allowlisted sessions only | — |
| **C — Small canary** | 5% of eligible itinerary turns | 1–5% subset | — |
| **D — Expanded canary** | 25% | 10–25% subset | — |
| **E — Broad rollout** | increase only while all gates hold on a meaningful sample | — | — |

Conversion messages and non-itinerary requests are unaffected at every stage.

**We are at Stage A**, and the deterministic evidence supports **only** Stage A
readiness. Advancing to Stage B/C requires the §3 blockers cleared.

### `READY_FOR_SMALL_CANARY` checklist (all required)

- [x] Zero hard-invariant violations
- [x] Execution accounting internally consistent (`derived === actual = 500`; 50 executable + 4 referenced + 0 other = 54)
- [ ] Live evaluation completed for every eligible production adapter/model
- [ ] No major/critical manual inconsistencies (blinded)
- [x] Missing-day and overnight-location detector gaps closed (Stage 13.1)
- [x] Route parity 100%
- [ ] p95 total latency within configured route timeout
- [ ] p95 buffered TTFT within chosen product budget
- [ ] Cost known and capped (`TRAILIE_ROLLOUT_MAX_AVG_COST_USD` + price table)
- [x] Semantic false-negative rate within gate (fixture set)
- [x] Deterministic fallback remains user-usable
- [x] Kill switches + stable cohorts tested

Any unchecked item ⇒ retain `READY_FOR_INTERNAL_ONLY`. Do not lower a gate merely
because a live result misses it.

## 8. Operational dashboard metrics (§20)

Aggregate-safe metrics to emit (never full prompts/responses, tool args, complete
itinerary payloads, canonical fact text, alignment-marker drafts, or rejected
prose; scenario IDs only in the synthetic eval environment):

```
trailie_pipeline_mode_selected        trailie_consistency_issue_type
trailie_structured_success            trailie_time_to_first_visible_token_ms
trailie_structured_failure            trailie_total_duration_ms
trailie_prose_first_pass              trailie_generation_cost_usd
trailie_prose_retry                   trailie_route_variant
trailie_prose_fallback                trailie_provider_model
```

## 9. Reproducing the evidence

```
# Deterministic recorded evaluation (no credentials, no network):
node server/eval/run-trailie-stage13.js
# → artifacts/trailie-stage13-eval-results.json      (records + summary + accounting + gates)
# → artifacts/trailie-stage13-eval-summary.csv       (one row per run)
# → artifacts/trailie-stage13-execution-matrix.csv   (exact run derivation + REF rows)
# → artifacts/trailie-stage13-manual-labels.csv      (blinded sheet, not_collected)

# Stage 13.3 live-provider SMOKE (§1 preflight → §2 provider-isolated → §3 stop-and-report).
# Prints a SANITIZED preflight and ABORTS (exit 2) before any request when config is
# missing. Requires the six caps + allowlist + real API keys; never logs credentials.
node server/eval/run-live-smoke.js
# → artifacts/trailie-stage13-live-smoke-results.json (preflight + per-provider smoke; full matrix NOT autostarted)

# Preflight-only inspection (Stage 13.3B §6) — proves readiness, spends nothing:
TRAILIE_EVAL_LIVE_PROVIDERS=true TRAILIE_EVAL_MAX_TOTAL_COST_USD=2 \
TRAILIE_EVAL_MAX_REQUESTS=80 TRAILIE_EVAL_MAX_INPUT_TOKENS=400000 TRAILIE_EVAL_MAX_OUTPUT_TOKENS=150000 \
TRAILIE_EVAL_MODEL_ALLOWLIST="claude:claude-sonnet-5" TRAILIE_EVAL_PREFLIGHT_ONLY=true \
node server/eval/run-live-smoke.js   # → known_pricing / introductory / costCapEnforceable:true / exit 0, zero calls

# focused tests
cd server && npx jest src/eval/trailie src/config/__tests__/trailieRolloutConfig.test.js \
  src/utils/__tests__/trailiePipelineModeSelection.test.js \
  src/utils/__tests__/proseOvernightConsistency.test.js \
  src/utils/__tests__/overnightSchemaCompat.test.js
cd next-frontend && npx vitest run src/utils/__tests__/thinkingStageCopy.test.js
```

## 10. Post-Stage-13 stop

Stage 13 is the evidence gate. **Do not enable any rollout cohort.** The next step
is live-provider + blinded-manual evaluation and budget configuration, then a
documented decision to enter Stage B.
