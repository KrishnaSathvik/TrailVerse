# Trailie Stage 13 — End-to-End Evaluation

**Status:** Evaluation & rollout-readiness stage. **No rollout cohort is enabled.**
Tool-first, prose-enforcement, and reviewer enforcement remain OFF by default.

> **Stage 13.1 update** — this revision (a) reconciles every accuracy metric to an
> explicit denominator from one result-row schema, (b) closes the missing-day and
> overnight detector gaps with real detectors + positive/negative fixtures, (c)
> adds an exact execution matrix, (d) reclassifies transport 41–44 as referenced
> regression evidence, and (e) adds live-smoke (cost-capped) and blinded-manual
> infrastructure. Recommended status is unchanged: **`READY_FOR_INTERNAL_ONLY`**.

> **Stage 13.2 update** — (1) the execution denominator is now fully reconciled:
> the 54-entry inventory partitions into **50 executable + 4 referenced + 0 other**,
> the runner **physically excludes** the 4 referenced regressions, and the matrix
> asserts `derived === actual = 500` with failing invariants (§6a). (2) Live-cost
> safety is hardened with request/token ceilings, an explicit model allowlist, and
> an unknown-pricing **smoke-only** policy (§11a). (3) `overnightLocation` schema
> backward-compatibility is proven (optional, older payloads validate, restore/
> share safe — `overnightSchemaCompat.test.js`). **Live-provider execution and
> blinded human labels remain uncollected** (require real credentials + human
> labelers); the status therefore stays **`READY_FOR_INTERNAL_ONLY`**.

> **Stage 13.3 scope** — routing inspection confirms Trailie planning/chat is
> **Claude-only** (`autoRouteProvider → 'claude'`; structured + prose paths are
> provider-gated with no cross-provider fallback). The live smoke/matrix and
> rollout gates are therefore scoped to **`claude-sonnet-5`**; OpenAI stays as a
> deterministic/synthetic compatibility adapter only (no live OpenAI calls, no
> OpenAI cost). `run-live-smoke.js` now loads the server's `.env` (reusing the
> existing `ANTHROPIC_API_KEY`, never new key vars) and warns if OpenAI is
> allowlisted.

> **Stage 13.3A — faithful live-path wiring** (no live calls made). Live mode now
> exercises the **same production seams** as the chat route: (a) the base system
> prompt is built via a shared `buildBaseSystemPrompt` (`src/prompts/trailieSystemPrompt.js`,
> extracted from `routes/ai.js` so production and eval cannot drift) — the literal
> `'BASE_SYSTEM_PROMPT'` placeholder is impossible in live mode; (b) Phase B prose
> uses the real `generateBufferedLLM` path (never the synthetic deliverer or fixture
> `proseResponses`), guarded by a structural assertion; (c) the Stage 12 buffer →
> verify → one retry → deterministic-fallback lifecycle runs unchanged on real prose;
> (d) latency is segmented, distinguishing `phaseBProviderTimeToFirstTokenMs` (null
> for buffered) from **`timeToFirstVisibleProseMs`** (the rollout TTFT gate); (e)
> Phase A / first Phase B / retry token usage are aggregated separately from real
> `usage`; (f) runs are classified `live_end_to_end` vs `live_with_fault_injection`
> (scripted-fault fixtures are excluded from headline live reliability). Proven by
> `liveWiring.test.js` with mocked clients — zero network calls.

> **Stage 13.3B — versioned pricing + enforceable cost cap** (no live calls). A
> date-aware `PRICE_CONFIG` prices `claude-sonnet-5` (introductory $2/$10 →
> standard $3/$15) so the USD cap is enforceable via a pre-request cost
> reservation; `phaseBProviderTimeToFirstTokenMs` is stored as `not_applicable`
> (buffered, non-streaming) and excluded from percentiles; the rollout TTFT gate
> uses `timeToFirstVisibleProseMs`. A `TRAILIE_EVAL_PREFLIGHT_ONLY=true` mode proves
> a *passing* preflight (`known_pricing`, `costCapEnforceable: true`) without
> spending. Proven by `pricing.test.js`. **No harness blocker remains before the
> Claude-only smoke.**

This document reports objective evidence on whether `tool_first + prose
consistency enforcement` is reliable, accurate, and safe enough for a *controlled*
rollout. It is an evidence gate, not a launch.

## 0. Evidence classes (read this first)

Every number below is tagged with how it was obtained. Do not conflate them.

| Class | Collected here? | What it proves |
|---|---|---|
| **Deterministic recorded** | ✅ yes | The production seam behaves as designed under synthetic provider outputs, including every failure mode. |
| **Live provider** | ❌ not collected | How reliably *real* models follow the contract, and real latency/cost. |
| **Manual blinded labels** | ❌ not collected | Human judgement of end-to-end usability. |
| **Inference** | marked inline | Reasoning beyond the measured data. |

> A gate passing on the synthetic fixture set is **not** the same as
> "production-safe with high confidence." The recommended status is capped
> accordingly (see §14 and the rollout-gates doc).

## 1. What the harness exercises

The evaluation drives the **same production orchestration seam** the four chat
routes use — there is no simplified parallel pipeline:

```
runTrailieItineraryTurn
  → orchestrateToolFirstItinerary   (Phase A: generate + finalize + FREEZE)
  → runProseConsistency             (Phase B: buffer → verify → retry → fallback)
  → processAssistantResponse        (injected; mirrors processPreparedTrailieResponse)
→ buildCanonicalTrailieResponse     (canonical identity: content/itinerary hashes)
```

Only the network boundary is synthetic. Recorded/mocked mode injects
`anthropic`/`openai` clients that expose the exact `.messages.create` /
`.chat.completions.create` shapes the real structured adapters consume, so the
**real** orchestrator, finalizer, deterministic verifier, and consistency state
machine all run unchanged.

*Scoping note:* the harness computes canonical identity with
`buildCanonicalTrailieResponse` (the hashing core of `buildCanonicalOutbound`)
rather than the full route wrapper, to avoid booting Mongo/auth/SSE. The wrapper's
extra behavior (async shadow-review scheduling, plan-document assembly) is
canonical-neutral by construction (Stage 10) and is covered by its own route/
persistence tests.

Code:

```
server/src/eval/trailie/
  index.js            runTrailiePipelineEvaluation (Part A)
  syntheticProviders.js  recorded/mocked provider + prose replay + failure injection
  scenarios/          50 synthetic fixtures + ground-truth labels (Part B/C)
  labeling.js         verifier outcome classification (Part C)
  metrics.js          structured / prose / verifier / latency / cost (Part D/E)
  invariants.js       hard correctness invariants (Part D §9)
  routeParity.js      four-route parity (Part F §13)
  gates.js            provisional quality/budget gates + recommended status (Part G)
server/eval/run-trailie-stage13.js   artifact generator
```

Run: `node server/eval/run-trailie-stage13.js` →
`artifacts/trailie-stage13-eval-results.json` + `.csv`.

## 2. Provider / model matrix

Recorded mode runs every eligible production generation provider, since Claude and
OpenAI tool-call behavior differ and must be validated independently.

| Provider | Model (recorded label) | Adapter tested |
|---|---|---|
| claude | `synthetic-claude` | anthropic structured adapter |
| openai | `synthetic-openai` | openai structured adapter |

Live mode (`providerMode:'live'`) is gated behind `TRAILIE_EVAL_LIVE_PROVIDERS=true`
**and** caller-supplied real clients; missing/invalid config throws before any live
call. Live runs are **not** part of this deterministic report.

## 3. Scenario inventory (fixtures)

**54** synthetic, versioned scenarios (`scenarioVersion` `2026-07-28.1`) — no
production conversation is used. Coverage maps 1:1 to the original 50-item audit,
plus 4 Stage 13.1 detector-gap fixtures (missing-day + 3 overnight negatives):

| Category | IDs | Count |
|---|---|---|
| Basic itinerary quality | 1–6 | 6 |
| Constraint correction | 7–12 | 6 |
| Canonical evidence | 13–18 | 6 |
| Structured-generation failures | 19–24 | 6 |
| Prose consistency | 25–36 (+ 26b, 32b/c/d) | 16 |
| Persistence & transport | 37–44 | 8 |
| Non-itinerary regression | 45–50 | 6 |

Transport 41–44 are **referenced regression evidence** (not executed here): each
carries an `evidenceType: referenced_regression` pointer to its owning Stage 8 /
route test suite and is excluded from the executed-run total (§6a).

## 4. Structured-generation results — deterministic recorded

Measured over the 88 required-itinerary runs (44 scenarios × 2 providers).

| Metric | Value |
|---|---|
| Final itinerary success (success-expected subset) | **100%** |
| Final itinerary success (all required, incl. designed failures) | 93.2% |
| First-attempt success rate | 86.4% |
| Retry rate | 6.8% |
| Retry success rate | 66.7% * |
| Total structured failure → safe prose-only | 6.8% |
| missing_tool / malformed_tool / ambiguous_tool | 2.3% each |
| truncated / provider_error (terminal) | 0% (recovered) |
| Itinerary schema-valid rate (of ready) | 100% |
| Constraint-correction rate (of ready) | 14.6% |
| Feasibility-issue rate (of ready) | 2.4% |

\* The three deliberate failure fixtures (missing-tool-twice, malformed, ambiguous)
resolve to a **safe prose-only fallback** — never inline JSON, never an invented
plan. The truncated→retry and timeout→retry fixtures both recover to a frozen
itinerary. Retry success < 100% is *by design*: missing-tool-on-both-attempts is a
scenario meant to fail past recovery.

A prose-only fallback is **not** counted as structured success.

## 5. Prose-consistency verifier — reconciled accounting (Stage 13.1)

> **Metric-integrity fix.** The prior report headlined `1.00/1.00` while placing a
> known false negative (overnight) in a limitations section — those cannot both be
> true for the same dataset. Stage 13.1 (a) reconciles every metric to an explicit
> denominator derived from **one** result-row schema, and (b) closes the two
> detector gaps (§6) so the false negative genuinely no longer exists — it is not
> merely excluded.

Labeled over **108** total verify-mode records; **all are single-draft** (no
retry/fallback), so every verdict is clean. Structural and semantic accuracy are
computed **separately** from the per-row `structuralOutcome` / `semanticOutcome`
fields. A run only scores the class it actually tests (`not_applicable`
otherwise); a class with a zero denominator is reported `not_applicable`, never a
free 1.0.

| Class | Precision (num/den) | Recall (num/den) |
|---|---|---|
| Structural | 10 / 10 = **1.00** | 10 / 10 = **1.00** |
| Semantic | 10 / 10 = **1.00** | 10 / 10 = **1.00** |

Headline supported-issue subset: positive samples 20, negative samples (should-pass)
per class, **false-positive rate 0** (0/negatives), **false-negative rate 0**
(0/20). **Integrity check `semanticRecallConsistent = true`**: recall 1.00 ⇔ zero
false negatives on this set.

Explicit exclusions (never silently dropped):

| Excluded set | Reason |
|---|---|
| off-mode / unlabeled runs | verifier does not run → not a verdict |
| multi-draft runs | retry/fallback occurred → not a clean single draft |
| `not_supported` probes | issue type has no detector → excluded from P/R, **never counted as TN** |

Per-issue detection with the 5-label scheme (`detected` / `missed` /
`not_applicable` / `not_supported` / `not_executed`):

| Issue | Status | Detected/Denominator |
|---|---|---|
| missing_day | detected | 2/2 |
| missing_stop | detected | 4/4 |
| wrong_day_assignment | detected | 4/4 |
| order_violation | detected | 2/2 |
| removed_stop_mention | detected | 2/2 |
| conflicting_duration | detected | 2/2 |
| conflicting_difficulty | detected | 2/2 |
| conflicting_overnight | detected | 2/2 |
| unsupported_plan_action | detected | 2/2 |
| duplicate_day / duplicate_stop / unknown_day / unknown_stop | not_executed | detector exists, no fixture |
| conflicting_date / conflicting_transition | **not_supported** | no detector — **not** counted as TN |

Forbidden-code violations: 0 (generic safety advice never triggers
`unsupported_plan_action`; correct overnight, drive-through, and generic lodging
never trigger `conflicting_overnight`).

## 6. Detector-gap closure — before / after (Stage 13.1)

Two audit issue types were previously uncovered. Both are now closed with real
deterministic detectors plus positive **and** negative fixtures:

**Missing itinerary day** — a required frozen-itinerary day omitted from prose now
fails via the manifest's required day IDs (`prose-26b-missing-day` → `missing_day`).

**Conflicting overnight location** — a new conservative detector in
`proseConsistencyVerifier.js`. It fires only when the frozen itinerary defines
overnight ground truth **and** the prose uses explicit overnight language
("spend the night in X", "overnight in X", …) naming a place unrelated (no shared
distinctive token) to any defined overnight location. Fixtures:

- `prose-32-wrong-overnight` → **fails** (`conflicting_overnight`) — retained as the
  closure regression test (formerly the disclosed false negative; **relabeled only
  because the detector actually works now**).
- `prose-32b-correct-overnight` → passes (Springdale matches).
- `prose-32c-drive-through` → passes ("drive through Las Vegas" is not an overnight).
- `prose-32d-generic-lodging` → passes (no named conflicting place).

`overnightLocation` was added to the `create_itinerary` tool schema so real models
can populate it (making the detector functional in production, not just in fixtures).

**Before → after (semantic recall, full set):** with overnight uncovered, the
honest full-set semantic recall was **8/9 ≈ 0.889** (the overnight positive was a
false negative). After closure it is **10/10 = 1.00** with the overnight and
missing-day positives now genuine true positives.

Residual uncovered: `duplicate_*` / `unknown_*` codes have detectors but no
fixtures (`not_executed`); `conflicting_date` / `conflicting_transition` have no
detector (`not_supported`). Neither is counted as a pass or a true negative.

## 6a. Execution matrix — how the run total is derived (Stage 13.1/13.2 §1)

The inventory of **54** entries partitions into three **disjoint** sets, and the
executed total is derived only from the **executable** set — the referenced
regressions are *never executed here* and *never counted* (Interpretation B).
The matrix now asserts this reconciliation with failing invariants; a leak or a
count mismatch aborts artifact generation.

| Field | Value |
|---|---|
| `totalInventoryEntries` | **54** |
| `executableScenarioCount` | **50** |
| `referencedRegressionCount` | **4** (transport 41–44) |
| `notExecutedScenarioCount` | **0** |
| `expectedExecutionCount` | **500** |
| `actualExecutionCount` | **500** |

Exact derivation (`artifacts/trailie-stage13-execution-matrix.csv`):

```
verify:  50 executable × 2 providers × 1 route (authenticated_non_streaming) × verify × 1 rep = 100
enforce: 50 executable × 2 providers × 4 routes × enforce × 1 rep                              = 400
total executed harness runs                                                                    = 500
```

**Reconciliation invariants (fail loudly):**
- `execution_count_consistent`: `expectedExecutionCount (500) === actualExecutionCount (500)`.
- `inventory_partition_consistent`: `50 executable + 4 referenced + 0 other === 54 total`.
- `no_referenced_executions`: **0** `REF|…` scenarios appear as executed rows.
- `executed_matches_executable`: exactly the 50 executable scenarios ran.

Intentionally **not** run (marked, not hidden): transport 41–44 (below); verify ×
{streaming, anonymous} routes (the verifier verdict is route-invariant, proven by
route parity); and off-mode verifier runs (the verifier does not run in off mode).

**Referenced regression, not executed here (not double-counted):** transport 41–44
(duplicate terminal submit, stale-save conflict, restore, share/export) carry an
`evidenceType: referenced_regression` pointer to their owning Stage 8/route test
suites. They appear as `REF|…` rows in the matrix CSV, are excluded from the 500
executed total, and — as of Stage 13.2 — are physically excluded from the runner
(the pipeline harness receives only the 50 executable scenarios).

## 7. Prose-pipeline behavior (enforce mode, recorded)

Over 320 consistency-applicable enforce runs:

- Realistic (should-pass) fallback rate: **0%**.
- Adversarial contradiction containment: **100%** — every scenario designed to
  produce contradictory prose is caught and either regenerated or replaced by the
  deterministic fallback; contradictory prose is **never** displayed then replaced.
- Aggregate first-draft pass 80% and fallback 20% across the enforce run reflect
  that the suite is *deliberately loaded* with adversarial fixtures; those are not
  representative of expected traffic and are excluded from the fallback gate.

## 8. Hard correctness invariants (§9)

Checked on every run (500 runs: verify 100 + enforce 400, both providers, all four
routes — see §6a). **Zero violations of every checkable invariant:**

- raw tool arguments / tool JSON visible → 0
- `[ITINERARY_JSON]` visible in tool-first → 0
- alignment markers visible (user content or canonical) → 0
- rejected prose persisted as canonical (enforce) → 0
- invalid draft streamed then replaced → 0
- `0,0` pins / invented coordinates → 0
- itinerary mutated after freeze (not deep-frozen) → 0
- user message in default canonical content → 0
- anonymous multi-version response → 0

Invariants that live at the transport / persistence / async-review layer
(stale-write races, `done` waiting on async review, cross-document version
coupling) are asserted by the Stage 8/9/10 test suites and are listed as
`coveredElsewhere`.

## 9. Four-route parity (§13)

For identical synthetic provider outputs, the seam is canonically identical across
**authenticated/anonymous × streaming/non-streaming** — 12 parity reports (4
anchor scenarios × `off`/`verify`/`enforce`), **all pass**. Compared for exact
equality: content hash, itinerary hash, sanitized-prose hash, consistency status,
feasibility issue types, final-itinerary validity, correction count.

Intentional, documented differences (excluded from comparison): the route label,
the streaming replay count (streaming replays the selected prose once;
non-streaming does not), and anonymous quota/conversion metadata (never part of
canonical identity).

## 10. Latency (§10) — segmented, structural only

Recorded/mocked runs have deterministic near-zero timings; percentiles are
captured structurally but are **not representative**. The harness now segments
latency (`summary.latencySegments`) so live measurement lands in the right buckets:

```
legacy · tool_first_off · tool_first_verify ·
tool_first_enforce_first_pass · tool_first_enforce_retry ·
tool_first_enforce_fallback · non_itinerary
```

Each segment reports min/median/p75/p90/p95/max for `totalResponseDurationMs` and
`timeToFirstVisibleTokenMs`. Because buffered Phase B delays first visible prose,
**TTFT is a primary gate**, not merely total duration. Real p50/p90/p95 require
`providerMode:live` and are **not collected**.

## 11. Token & cost (§11) — per-model, cost_unknown

Phase A / Phase B / retry token counts are aggregated separately, plus a per-model
cost block (`summary.costByModel`) with `priceSource`, `priceConfigVersion`,
`inputPrice`, `outputPrice`, `estimatedCostPerSuccessfulItinerary`, and
`p95CostPerSuccessfulItinerary`. With **no configured price table**
(`TRAILIE_PRICE__<MODEL>__INPUT/OUTPUT_PER_MTOK`), every field is `cost_unknown`
rather than invented, and the cost gate cannot pass. Shadow-review cost is kept
separate by design. Recorded token totals are synthetic (plumbing only).

**Provider scope (Stage 13.3):** only the live-eligible Claude model
(`CLAUDE_PRIMARY_MODEL`) needs pricing + a cost budget. OpenAI pricing is reported
as **`not_applicable_to_trailie_live_rollout`** (not `missing`/`cost_unknown`),
because Trailie plan/prose does not route to OpenAI. See `results.providerScope`.

**Versioned pricing + enforceable cost cap (Stage 13.3B):** `claude-sonnet-5` now
has a versioned, date-aware price (`priceConfigVersion 2026-07-29`): introductory
**$2/$10** per 1M through 2026-08-31, standard **$3/$15** from 2026-09-01 — the run
date picks the period. With a resolvable price the preflight reports
`pricingMode: known_pricing` and `costCapEnforceable: true`, and the smoke performs
a **forward-looking cost reservation**: before each call it refuses to proceed if
the call's conservative maximum could push estimated spend past
`TRAILIE_EVAL_MAX_TOTAL_COST_USD` (`bindingCap: max_total_cost_usd_reservation`),
so the dollar cap binds *before* spending. Unpriced cache tokens force
`cost_unknown`. Cost figures are **estimated**, never a billed amount.

## 11a. Internal live-provider smoke (§6/§7) — infrastructure ready, not executed

A bounded live smoke runner exists (`src/eval/trailie/liveEvaluation.js`) with
**layered hard caps** and multi-gate refusal. As of Stage 13.2 §2 it will not make
a live call unless **all** of the following hold:

- `TRAILIE_EVAL_LIVE_PROVIDERS=true`
- real caller-supplied clients (credentials are **never** read, logged, or persisted here)
- `TRAILIE_EVAL_MAX_TOTAL_COST_USD` (USD ceiling)
- `TRAILIE_EVAL_MAX_REQUESTS` (hard request ceiling)
- `TRAILIE_EVAL_MAX_INPUT_TOKENS` (hard input-token ceiling)
- `TRAILIE_EVAL_MAX_OUTPUT_TOKENS` (hard output-token ceiling)
- `TRAILIE_EVAL_MODEL_ALLOWLIST` (explicit `provider:model` / `model` allowlist; every model in the matrix must be listed)

**Pricing policy** (the USD cap alone is not trustworthy while pricing is unknown):

- **Known pricing** → enforce both the USD cap **and** the request/token ceilings.
- **Unknown pricing** → a **small smoke only**, bounded by the request/token
  ceilings (plus a hard 64-request smoke ceiling); the cost rollout gate stays
  **`not_passed`**, and the **full repetition matrix is refused** until priced.
- Execution **stops before the next provider request** when any cap would be
  exceeded; the report names the binding cap in `bindingCap` / `constrainedBy`.

It records **adapter-level success separately from pipeline success** (a provider
failure recovered by a retry is `primary adapter failure` + `pipeline success`,
never counted as primary success). The full-matrix path (`runLiveMatrix`) shares
the same cap loop and refuses unknown pricing outright.

Current status: **`not_executed`** — no live clients/keys are configured in this
environment. Reasons are captured verbatim in the artifact
(`liveEvaluation.smoke.reasons`). The smoke set covers basic 3-day/7-day/multi-park,
constraint correction, structured retry, removed-stop + wrong-day consistency, and
prose fallback.

## 11b. Blinded manual labels (§8) — schema ready, not collected

`src/eval/trailie/manualLabels.js` produces a **blinded** labeling sheet
(`artifacts/trailie-stage13-manual-labels.csv`) whose evaluator view shows only the
user request, frozen itinerary, final prose, synthetic facts, and feasibility
warnings — and **omits** provider, model, first-attempt-vs-retry, fallback status,
the automated verdict, and issue codes (the verifier must never be its own ground
truth). Rows are seeded from synthetic fixtures for schema readiness with every
label empty and `labelStatus=not_collected`; regenerate from live outputs before
labeling. Protocol: two independent labels on critical scenarios, report agreement/
disagreement/resolution, **gate = 0 major/critical inconsistencies**.

## 12. Legacy vs tool-first comparison (§12)

The comparison is **modeled**, not measured live. The honest framing the harness
enforces: the legacy path can *silently lose or truncate* the structured itinerary
and still return prose quickly — a fast response with a missing/degraded plan must
**not** be ranked above a correct tool-first itinerary. Tool-first trades a bounded
second phase (structured generation + deterministic finalize + buffered
verification) for a guaranteed frozen, validated, prose-consistent plan. A truthful
latency/cost delta requires live measurement (not collected).

## 13. Frontend thin support (§14)

Minimum presentation only — no Plan AI redesign:

- New buffered-verification thinking state renders **"Checking that the response
  matches your plan…"** (`checking_response_matches_plan`), via
  `next-frontend/src/utils/thinkingStageCopy.js` (focused test included).
- Deterministic fallback content arrives through `replayProse` as normal chunks and
  renders as ordinary assistant content.
- Feasibility warnings continue to render in their existing location.
- No internal consistency issue codes, queue/job IDs, or a "reviewed" label (async
  review being merely queued is not "reviewed") are ever surfaced.
- `sync-needed` is resolved accurately by the existing
  `saveStateFromPersistence.js`. Mobile safe-area and streaming behavior unchanged.

## 14. Provisional gate results & recommended status

All fixture-set quality gates **pass**; manual is `not_collected`:

| Gate | Target | Measured | Status |
|---|---|---|---|
| Structured final success (success-expected) | ≥ 0.98 | 1.00 | pass |
| Critical-scenario structured success | ≥ 0.95 | 1.00 | pass |
| First-draft prose consistency pass | ≥ 0.90 | 1.00 | pass |
| Success after one prose retry | ≥ 0.98 | 1.00 | pass |
| Deterministic fallback rate (realistic) | ≤ 0.02 | 0.00 | pass |
| Semantic verifier false-positive rate | ≤ 0.03 | 0.00 | pass |
| Semantic verifier false-negative rate | ≤ 0.03 | 0.00 | pass |
| Major/critical manual inconsistency | 0 | — | not_collected |
| Canonical persistence equality | 1.0 | 1.0 | pass |
| Route contract parity | 1.0 | 1.0 | pass |

**Recommended rollout status: `READY_FOR_INTERNAL_ONLY`.**

## 15. Exact blockers preventing the next status

To reach `READY_FOR_SMALL_CANARY`:

1. **Live provider evaluation not completed** — run `providerMode:'live'` for both
   providers (≥5 reps/critical scenario, ≥3/general) and re-report §4–§7, §10, §11.
2. **Manual blinded evaluation not collected** — run the §6 protocol in the
   rollout-gates doc; major/critical inconsistency must be 0%.
3. **Latency/cost budgets unset** — configure `TRAILIE_ROLLOUT_MAX_P95_TOTAL_MS`,
   `TRAILIE_ROLLOUT_MAX_P95_TTFT_MS`, `TRAILIE_ROLLOUT_MAX_AVG_COST_USD` (and a
   price table) and verify live p95/cost fall within them.

Any hard-invariant violation, a failed quality gate, or incomplete route parity
would instead force `NOT_READY`.

## 16. Limitations & sample-size caveats

- **Small synthetic dataset.** 54 fixtures; most issue types have 1–2 scenarios per
  provider. Precision/recall of 1.00 here means "no error observed on this set,"
  **not** a tight statistical bound — it is a `fixture-set result`, not
  `production-safe with high confidence`.
- **Uncovered-by-detector types remain.** `duplicate_*` / `unknown_*` have detectors
  but no fixture (`not_executed`); `conflicting_date` / `conflicting_transition`
  have no detector (`not_supported`). These are reported explicitly and never
  counted as passes/TNs.
- **Recorded ≠ live.** Real model tool-call reliability, prose marker discipline,
  latency, and cost are unmeasured. The verifier's zero false-positive rate on clean
  synthetic prose may not hold on the messier distribution of real model prose.
- **Modeled legacy comparison.** No live A/B was run.
- Unit/eval tests passing is **not** proof of production readiness — this stage
  establishes *how the architecture behaves*, and how much remains (live + manual +
  budgets) before any user cohort.
