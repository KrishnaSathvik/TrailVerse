'use strict';

/**
 * Stage 13 §15–§17, §22.13–16 — rollout gates.
 *
 * Combines measured evaluation metrics with the synthetic scenario expectations
 * to produce a provisional gate report. Critically distinguishes:
 *   - `pass` / `fail`         : measured on the fixture set
 *   - `not_collected`         : requires live providers or manual labeling
 *   - `budget_unset`          : no configured budget → treated as UNMET
 *   - `insufficient_data`     : no samples to measure the gate
 *
 * A gate passing on the fixture set is NOT the same as production-safe. The
 * recommended status is capped accordingly.
 */

const { summarize } = require('./metrics');
const { getTrailieRolloutBudgets } = require('../../config/trailieRolloutConfig');

const STATUS = {
  NOT_READY: 'NOT_READY',
  INTERNAL_ONLY: 'READY_FOR_INTERNAL_ONLY',
  SMALL_CANARY: 'READY_FOR_SMALL_CANARY',
  EXPANDED_CANARY: 'READY_FOR_EXPANDED_CANARY',
  BROAD_ROLLOUT: 'READY_FOR_BROAD_ROLLOUT',
};

function rate(n, d) { return d > 0 ? n / d : 0; }
function round(x, p = 4) { return Number.isFinite(x) ? Number(x.toFixed(p)) : x; }

/** Records whose scenario was DESIGNED to produce a valid itinerary. */
function successExpected(records) {
  return records.filter((r) => r.expected && r.expected.expectedStructuredOutcome === 'itinerary_ready' && r.structured.requiresStructuredItinerary);
}

function gate(id, target, measured, status, note = '') {
  return { id, target, measured, status, note };
}

/**
 * @param {Object} params
 * @param {{records, meta}} params.verifyRun     recorded run, consistencyMode 'verify'
 * @param {{records, meta}} params.enforceRun     recorded run, consistencyMode 'enforce'
 * @param {Object[]} params.parityReports         checkRouteParity outputs
 * @param {boolean} [params.liveCompleted=false]  live provider evaluation done?
 * @param {boolean} [params.manualCollected=false] blinded manual labels collected?
 */
function computeGateReport({ verifyRun, enforceRun, parityReports = [], liveCompleted = false, manualCollected = false, executionAccountingConsistent = true } = {}) {
  const v = summarize(verifyRun);
  const e = summarize(enforceRun);
  const budgets = getTrailieRolloutBudgets();

  // Structured success on success-expected scenarios.
  const se = successExpected(verifyRun.records);
  const seReady = se.filter((r) => r.structured.itineraryReady);
  const structuredSuccess = round(rate(seReady.length, se.length));

  const criticalCats = new Set(['basic_itinerary', 'structured_failure', 'constraint_correction']);
  const seCrit = se.filter((r) => criticalCats.has(r.category));
  const seCritReady = seCrit.filter((r) => r.structured.itineraryReady);
  const criticalSuccess = round(rate(seCritReady.length, seCrit.length));

  // First-draft prose pass over scenarios that SHOULD pass.
  const shouldPass = verifyRun.records.filter((r) => r.verifierEval && r.verifierEval.applicable && r.verifierEval.shouldPass);
  const shouldPassPassed = shouldPass.filter((r) => r.prose.consistencyStatus === 'passed');
  const firstDraftPass = round(rate(shouldPassPassed.length, shouldPass.length));

  // Enforce: success after one retry (passed OR retry_passed) over should-pass scenarios.
  const enfShouldPass = enforceRun.records.filter((r) => r.expected?.consistency?.shouldPass === true && r.structured.itineraryReady);
  const enfSuccess = enfShouldPass.filter((r) => ['passed', 'retry_passed'].includes(r.prose.consistencyStatus));
  const retrySuccess = enfShouldPass.length ? round(rate(enfSuccess.length, enfShouldPass.length)) : null;

  // Deterministic fallback rate is a REALISTIC-behavior gate: measured over
  // should-pass prose (what a well-behaved model produces), NOT over the
  // adversarial contradiction fixtures. Those SHOULD fall back — correct handling
  // of contradictory prose is a feature, reported separately below.
  const fallbackOnRealistic = enfShouldPass.length ? round(rate(enfShouldPass.filter((r) => r.prose.deterministicFallbackUsed).length, enfShouldPass.length)) : null;
  const enfAdversarial = enforceRun.records.filter((r) => r.expected?.consistency && r.expected.consistency.shouldPass === false && !r.expected.consistency.diagnosticUncovered && r.structured.itineraryReady);
  const adversarialCorrectlyContained = enfAdversarial.filter((r) => r.prose.deterministicFallbackUsed || r.prose.consistencyStatus === 'retry_passed').length;
  const adversarialFallbackHandling = enfAdversarial.length ? round(rate(adversarialCorrectlyContained, enfAdversarial.length)) : null;

  const parityAllPass = parityReports.length > 0 && parityReports.every((p) => p.parity);

  const gates = [
    gate('structured_final_success', '>= 0.98', structuredSuccess, structuredSuccess >= 0.98 ? 'pass' : 'fail', 'fixture set; success-expected scenarios'),
    gate('critical_structured_success', '>= 0.95', criticalSuccess, criticalSuccess >= 0.95 ? 'pass' : 'fail', 'fixture set; critical categories'),
    gate('first_draft_prose_pass', '>= 0.90', firstDraftPass, firstDraftPass >= 0.90 ? 'pass' : 'fail', 'fixture set; should-pass consistency scenarios'),
    gate('success_after_one_retry', '>= 0.98', retrySuccess, retrySuccess == null ? 'insufficient_data' : (retrySuccess >= 0.98 ? 'pass' : 'fail'), 'enforce mode; should-pass scenarios'),
    gate('deterministic_fallback_rate', '<= 0.02', fallbackOnRealistic, fallbackOnRealistic == null ? 'insufficient_data' : (fallbackOnRealistic <= 0.02 ? 'pass' : 'fail'), 'enforce mode; realistic should-pass prose only (adversarial fixtures excluded — see adversarialFallbackHandling)'),
    gate('semantic_false_positive_rate', '<= 0.03', v.verifier.semantic_precision === 1 ? 0 : round(1 - v.verifier.semantic_precision), (v.verifier.false_positive_rate <= 0.03) ? 'pass' : 'fail', 'fixture set; excludes diagnostic gaps'),
    gate('semantic_false_negative_rate', '<= 0.03', v.verifier.false_negative_rate, v.verifier.false_negative_rate <= 0.03 ? 'pass' : 'fail', `fixture set; ${v.verifier.diagnosticUncoveredFalseNegatives} residual disclosed coverage gap(s) (missing_day + overnight detectors closed in Stage 13.1)`),
    gate('major_critical_manual_inconsistency', '== 0', manualCollected ? 0 : 'not_collected', manualCollected ? 'pass' : 'not_collected', 'requires blinded manual evaluation of live outputs'),
    gate('canonical_persistence_equality', '== 1.0', parityAllPass ? 1 : (parityReports.length ? 0 : 'insufficient_data'), parityReports.length ? (parityAllPass ? 'pass' : 'fail') : 'insufficient_data', 'route parity content/itinerary hash equality'),
    gate('route_contract_parity', '== 1.0', parityAllPass ? 1 : (parityReports.length ? 0 : 'insufficient_data'), parityReports.length ? (parityAllPass ? 'pass' : 'fail') : 'insufficient_data', 'four-route parity'),
  ];

  // Budget gates (§17) — unset budgets are UNMET; recorded latency is not live.
  const budgetGates = [
    gate('p95_total_latency', budgets.maxP95TotalMs == null ? 'budget_unset' : `<= ${budgets.maxP95TotalMs}ms`, liveCompleted ? v.latency.totalResponseDurationMs.p95 : 'not_measured_live', budgets.maxP95TotalMs == null ? 'budget_unset' : (liveCompleted ? 'pending_live' : 'not_collected'), 'recorded timings are near-zero; requires live measurement'),
    gate('p95_ttft', budgets.maxP95TtftMs == null ? 'budget_unset' : `<= ${budgets.maxP95TtftMs}ms`, liveCompleted ? v.latency.timeToFirstVisibleTokenMs.p95 : 'not_measured_live', budgets.maxP95TtftMs == null ? 'budget_unset' : 'not_collected', 'requires live measurement'),
    gate('avg_cost_per_itinerary', budgets.maxAvgCostUsd == null ? 'budget_unset' : `<= ${budgets.maxAvgCostUsd}`, v.cost.avgCostPerSuccessfulItinerary, budgets.maxAvgCostUsd == null ? 'budget_unset' : (v.cost.avgCostPerSuccessfulItinerary === 'cost_unknown' ? 'not_collected' : 'pending_live'), 'requires configured price table + live tokens'),
  ];

  // Hard rollout blockers (§15).
  const invariantViolations = v.invariants.totalViolations + e.invariants.totalViolations;
  const blockers = [];
  if (invariantViolations > 0) blockers.push({ code: 'hard_invariant_violation', count: invariantViolations });
  // §13 gate: execution accounting must be internally consistent.
  if (!executionAccountingConsistent) blockers.push({ code: 'execution_accounting_inconsistent', detail: 'derived execution count or inventory partition does not reconcile' });
  if (!liveCompleted) blockers.push({ code: 'live_provider_evaluation_incomplete', detail: 'providerMode=live not run' });
  if (!manualCollected) blockers.push({ code: 'manual_evaluation_not_collected', detail: 'blinded manual labels required for canary+' });
  if (!parityAllPass) blockers.push({ code: 'route_parity_incomplete' });
  for (const g of gates) if (g.status === 'fail') blockers.push({ code: `quality_gate_failed:${g.id}`, measured: g.measured, target: g.target });
  for (const g of budgetGates) if (budgets[({ p95_total_latency: 'maxP95TotalMs', p95_ttft: 'maxP95TtftMs', avg_cost_per_itinerary: 'maxAvgCostUsd' })[g.id]] == null) {
    blockers.push({ code: `budget_unset:${g.id}` });
  }

  // Recommended status (§22.14) — honest and capped.
  const fixtureGatesPass = gates.every((g) => g.status === 'pass' || g.status === 'not_collected' || g.status === 'insufficient_data');
  const fixtureGatesHardFail = gates.some((g) => g.status === 'fail');
  let recommendedStatus;
  if (invariantViolations > 0 || fixtureGatesHardFail || !executionAccountingConsistent) {
    recommendedStatus = STATUS.NOT_READY;
  } else if (!liveCompleted) {
    // Deterministic evidence only supports internal-eval readiness (Stage A).
    recommendedStatus = STATUS.INTERNAL_ONLY;
  } else if (!manualCollected) {
    recommendedStatus = STATUS.INTERNAL_ONLY;
  } else {
    recommendedStatus = STATUS.SMALL_CANARY;
  }

  return {
    recommendedStatus,
    fixtureGatesPass,
    qualityGates: gates,
    budgetGates,
    blockers,
    budgetsConfigured: budgets,
    measured: {
      structuredSuccess, criticalSuccess, firstDraftPass, retrySuccess,
      deterministicFallbackRate: fallbackOnRealistic,
      adversarialFallbackHandling,
      semanticFalsePositiveRate: v.verifier.false_positive_rate,
      semanticFalseNegativeRate: v.verifier.false_negative_rate,
      routeParity: parityAllPass,
      invariantViolations,
    },
    caveat: 'Gates evaluated on a small synthetic fixture set. Fixture-set pass ≠ production-safe with high confidence. Live-provider and blinded-manual evidence are required before any production cohort.',
  };
}

module.exports = { STATUS, computeGateReport, successExpected };
