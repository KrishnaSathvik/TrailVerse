'use strict';

/**
 * Stage 13 §7–§12 — metric aggregation over per-run records.
 *
 * Structural and semantic verifier accuracy are reported SEPARATELY (a
 * marker-format failure is never counted as proof of semantic contradiction
 * detection). Retries and first-pass successes are reported separately. Missing
 * cost is surfaced as `cost_unknown`, never invented.
 */

const { COST_UNKNOWN, getModelPricing } = require('./pricing');
const { SEMANTIC_CODES, STRUCTURAL_CODES } = require('./labeling');

function rate(n, d) { return d > 0 ? n / d : 0; }
function round(x, p = 4) { return Number.isFinite(x) ? Number(x.toFixed(p)) : x; }

function percentiles(values) {
  const arr = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (arr.length === 0) return { count: 0, min: null, median: null, p75: null, p90: null, p95: null, max: null };
  const at = (p) => arr[Math.min(arr.length - 1, Math.floor(p * (arr.length - 1)))];
  return { count: arr.length, min: arr[0], median: at(0.5), p75: at(0.75), p90: at(0.9), p95: at(0.95), max: arr[arr.length - 1] };
}

// ── Structured-generation metrics (§7) ──────────────────────────────────────

function structuredMetrics(records) {
  const required = records.filter((r) => r.structured.requiresStructuredItinerary && r.generationMode === 'tool_first');
  const n = required.length;
  const ready = required.filter((r) => r.structured.itineraryReady);
  const firstAttempt = ready.filter((r) => r.structured.structuredAttemptCount === 1 && !r.structured.structuredRecoveryUsed);
  const retried = required.filter((r) => r.structured.structuredRecoveryUsed);
  const retrySucceeded = retried.filter((r) => r.structured.itineraryReady);
  const failed = required.filter((r) => r.structured.orchestrationOutcome === 'prose_only');

  const terminalStatus = (r) => (r.structured.itineraryReady ? 'complete' : r.structured.structuredStatus);
  const hasErr = (r, code) => (r.structured.validationErrors || []).includes(code);

  return {
    structured_attempts: required.reduce((s, r) => s + (r.structured.structuredAttemptCount || 0), 0),
    structured_first_attempt_success_rate: round(rate(firstAttempt.length, n)),
    structured_retry_rate: round(rate(retried.length, n)),
    structured_retry_success_rate: round(rate(retrySucceeded.length, retried.length)),
    structured_total_failure_rate: round(rate(failed.length, n)),
    final_itinerary_success_rate: round(rate(ready.length, n)),

    missing_tool_rate: round(rate(required.filter((r) => terminalStatus(r) === 'missing_tool').length, n)),
    malformed_tool_rate: round(rate(required.filter((r) => terminalStatus(r) === 'malformed_tool' && !hasErr(r, 'ambiguous_tool_calls')).length, n)),
    truncated_tool_rate: round(rate(required.filter((r) => terminalStatus(r) === 'truncated').length, n)),
    ambiguous_tool_rate: round(rate(required.filter((r) => hasErr(r, 'ambiguous_tool_calls') && !r.structured.itineraryReady).length, n)),
    provider_error_rate: round(rate(required.filter((r) => terminalStatus(r) === 'provider_error').length, n)),

    itinerary_schema_valid_rate: round(rate(ready.filter((r) => r.structured.finalItineraryValid).length, ready.length)),
    constraint_correction_rate: round(rate(ready.filter((r) => r.structured.correctionCount > 0).length, ready.length)),
    final_itinerary_valid_rate: round(rate(required.filter((r) => r.structured.finalItineraryValid).length, n)),
    feasibility_issue_rate: round(rate(ready.filter((r) => r.structured.feasibilityIssueCount > 0).length, ready.length)),

    requiredRunCount: n,
    readyRunCount: ready.length,
  };
}

// ── Prose consistency pipeline metrics (§8) ─────────────────────────────────

function proseMetrics(records) {
  const applicable = records.filter((r) => r.prose.consistencyStatus !== 'not_applicable' && r.structured.itineraryReady);
  const n = applicable.length;
  const status = (s) => applicable.filter((r) => r.prose.consistencyStatus === s);

  const firstPass = status('passed');
  const retryUsed = applicable.filter((r) => r.prose.proseRetryUsed);
  const retryPassed = status('retry_passed');
  const fallback = applicable.filter((r) => r.prose.deterministicFallbackUsed);
  const generationFailure = applicable.filter((r) => r.aborted || r.empty);

  return {
    first_draft_pass_rate: round(rate(firstPass.length, n)),
    first_draft_failure_rate: round(rate(n - firstPass.length, n)),
    retry_rate: round(rate(retryUsed.length, n)),
    retry_pass_rate: round(rate(retryPassed.length, retryUsed.length)),
    deterministic_fallback_rate: round(rate(fallback.length, n)),
    generation_failure_rate: round(rate(generationFailure.length, n)),
    applicableRunCount: n,
  };
}

// ── Verifier quality — structural vs semantic (§8) ──────────────────────────

function verifierMetrics(records) {
  // Only single-draft (verify-mode) labeled runs give a clean verifier verdict.
  const labeled = records.filter((r) => r.verifierEval && r.verifierEval.applicable && r.verifierEval.singleDraft);

  const conf = {
    structural: { tp: 0, fp: 0, fn: 0, tn: 0 },
    semantic: { tp: 0, fp: 0, fn: 0, tn: 0 },
  };
  const classification = { true_positive: 0, true_negative: 0, false_positive: 0, false_negative: 0, partial_detection: 0 };
  let diagnosticUncoveredFn = 0;
  let forbiddenViolations = 0;

  for (const r of labeled) {
    const ve = r.verifierEval;
    classification[ve.classification] = (classification[ve.classification] || 0) + 1;
    if (ve.forbiddenViolation) forbiddenViolations += 1;

    const scDiag = r._diagnosticUncovered === true;
    const detectedStructural = ve.detectedStructural.length > 0;
    const detectedSemantic = ve.detectedSemantic.length > 0;

    if (ve.shouldPass) {
      // Negative sample for BOTH classes.
      if (detectedStructural) conf.structural.fp += 1; else conf.structural.tn += 1;
      if (detectedSemantic) conf.semantic.fp += 1; else conf.semantic.tn += 1;
    } else {
      const positiveStructural = ve.expectedStructural.length > 0;
      const positiveSemantic = ve.expectedSemantic.length > 0;
      // Diagnostic-uncovered known gaps are tracked separately, not as surprise FNs.
      if (scDiag) { diagnosticUncoveredFn += 1; continue; }
      if (positiveStructural) { if (detectedStructural) conf.structural.tp += 1; else conf.structural.fn += 1; }
      if (positiveSemantic) { if (detectedSemantic) conf.semantic.tp += 1; else conf.semantic.fn += 1; }
    }
  }

  const prec = (c) => round(rate(c.tp, c.tp + c.fp));
  const rec = (c) => round(rate(c.tp, c.tp + c.fn));

  // Overall false-positive/negative over the labeled set (excluding diagnostic gaps).
  const negatives = labeled.filter((r) => r.verifierEval.shouldPass);
  const positives = labeled.filter((r) => !r.verifierEval.shouldPass && !r._diagnosticUncovered);
  const fp = negatives.filter((r) => !r.verifierEval.verifierPassed).length;
  const fn = positives.filter((r) => r.verifierEval.verifierPassed).length;

  return {
    labeledRunCount: labeled.length,
    classification,
    structural_precision: prec(conf.structural),
    structural_recall: rec(conf.structural),
    semantic_precision: prec(conf.semantic),
    semantic_recall: rec(conf.semantic),
    false_positive_rate: round(rate(fp, negatives.length)),
    false_negative_rate: round(rate(fn, positives.length)),
    confusion: conf,
    diagnosticUncoveredFalseNegatives: diagnosticUncoveredFn,
    forbiddenCodeViolations: forbiddenViolations,
  };
}

// ── Issue-level detection (§8) ──────────────────────────────────────────────

const ISSUE_DETECTION_MAP = {
  missing_day_detection: 'missing_day',
  missing_stop_detection: 'missing_stop',
  wrong_day_detection: 'wrong_day_assignment',
  wrong_order_detection: 'order_violation',
  removed_stop_detection: 'removed_stop_mention',
  duration_conflict_detection: 'conflicting_duration',
  difficulty_conflict_detection: 'conflicting_difficulty',
  unsupported_addition_detection: 'unsupported_plan_action',
};

function issueLevelDetection(records) {
  const labeled = records.filter((r) => r.verifierEval && r.verifierEval.applicable && r.verifierEval.singleDraft && !r.verifierEval.shouldPass);
  const out = {};
  for (const [metric, code] of Object.entries(ISSUE_DETECTION_MAP)) {
    const expecting = labeled.filter((r) => (r.verifierEval.expectedIssueCodes || []).includes(code));
    const detected = expecting.filter((r) => (r.verifierEval.detectedCodes || []).includes(code));
    out[metric] = { expected: expecting.length, detected: detected.length, rate: round(rate(detected.length, expecting.length)) };
  }
  return out;
}

// ── Latency + cost (§10–§11) ────────────────────────────────────────────────

function latencyMetrics(records) {
  const total = percentiles(records.map((r) => r.timings.totalResponseDurationMs));
  const ttft = percentiles(records.map((r) => r.timings.timeToFirstVisibleTokenMs));
  const structured = percentiles(records.filter((r) => r.structured.itineraryReady).map((r) => r.timings.structuredDurationMs));
  const prose = percentiles(records.map((r) => r.timings.proseDurationMs));
  const verification = percentiles(records.filter((r) => r.prose.consistencyStatus !== 'not_applicable').map((r) => r.timings.verificationDurationMs));
  return {
    note: 'Recorded/mocked runs have deterministic near-zero timings; latency percentiles are structural and are only representative under providerMode=live.',
    totalResponseDurationMs: total,
    timeToFirstVisibleTokenMs: ttft,
    structuredDurationMs: structured,
    proseDurationMs: prose,
    verificationDurationMs: verification,
  };
}

// ── Latency segmentation (§9) ───────────────────────────────────────────────

function segmentOf(r) {
  if (r.generationMode === 'legacy') return 'legacy';
  if (!r.structured.requiresStructuredItinerary) return 'non_itinerary';
  const cm = r.consistencyMode;
  if (cm === 'off') return 'tool_first_off';
  if (cm === 'verify') return 'tool_first_verify';
  // enforce
  if (r.prose.consistencyStatus === 'retry_passed' || r.prose.proseRetryUsed) return 'tool_first_enforce_retry';
  if (r.prose.deterministicFallbackUsed) return 'tool_first_enforce_fallback';
  return 'tool_first_enforce_first_pass';
}

function latencySegments(records) {
  const segments = {};
  for (const r of records) {
    const seg = segmentOf(r);
    (segments[seg] = segments[seg] || { total: [], ttft: [] });
    segments[seg].total.push(r.timings.totalResponseDurationMs);
    segments[seg].ttft.push(r.timings.timeToFirstVisibleTokenMs);
  }
  const out = {};
  for (const [seg, v] of Object.entries(segments)) {
    out[seg] = { totalResponseDurationMs: percentiles(v.total), timeToFirstVisibleTokenMs: percentiles(v.ttft) };
  }
  return {
    note: 'Recorded/mocked timings are deterministic near-zero; segmentation is structural and only meaningful under providerMode=live. TTFT is a PRIMARY gate for buffered Phase B.',
    segments: out,
  };
}

// ── Per-model cost accounting (§10) ─────────────────────────────────────────

function costByModel(records) {
  const byModel = {};
  for (const r of records) {
    const m = r.model;
    (byModel[m] = byModel[m] || { model: m, runs: 0, successfulCosts: [] });
    byModel[m].runs += 1;
    if (r.structured.itineraryReady && r.tokens.estimatedGenerationCostUsd !== COST_UNKNOWN) {
      byModel[m].successfulCosts.push(r.tokens.estimatedGenerationCostUsd);
    }
  }
  const out = {};
  for (const [model, v] of Object.entries(byModel)) {
    const pricing = getModelPricing(model);
    const costs = v.successfulCosts.slice().sort((a, b) => a - b);
    out[model] = {
      priceSource: pricing ? 'configured_price_table' : COST_UNKNOWN,
      priceConfigVersion: pricing ? 'env' : null,
      inputPrice: pricing ? pricing.inputPerMTok : COST_UNKNOWN,
      outputPrice: pricing ? pricing.outputPerMTok : COST_UNKNOWN,
      estimatedCostPerSuccessfulItinerary: costs.length ? round(costs.reduce((s, c) => s + c, 0) / costs.length, 6) : COST_UNKNOWN,
      p95CostPerSuccessfulItinerary: costs.length ? round(costs[Math.floor(0.95 * (costs.length - 1))], 6) : COST_UNKNOWN,
    };
  }
  return out;
}

function costMetrics(records) {
  let totalInput = 0; let totalOutput = 0; let knownCost = 0; let unknown = 0; let known = 0;
  for (const r of records) {
    totalInput += r.tokens.totalInputTokens;
    totalOutput += r.tokens.totalOutputTokens;
    if (r.tokens.estimatedGenerationCostUsd === COST_UNKNOWN) unknown += 1;
    else { knownCost += r.tokens.estimatedGenerationCostUsd; known += 1; }
  }
  const successful = records.filter((r) => r.structured.itineraryReady);
  const avgCostPerSuccessfulItinerary = known > 0 && successful.length > 0
    ? round(knownCost / successful.length, 6)
    : COST_UNKNOWN;
  return {
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    runsWithKnownCost: known,
    runsWithUnknownCost: unknown,
    estimatedTotalCostUsd: known > 0 ? round(knownCost, 6) : COST_UNKNOWN,
    avgCostPerSuccessfulItinerary,
    costModel: known > 0 ? 'configured_price_table' : COST_UNKNOWN,
  };
}

// ── Hard invariants (§9) ────────────────────────────────────────────────────

function invariantSummary(records) {
  const byCode = {};
  let totalViolations = 0;
  for (const r of records) {
    for (const v of r.invariantViolations || []) {
      byCode[v.code] = (byCode[v.code] || 0) + 1;
      totalViolations += 1;
    }
  }
  return { totalViolations, byCode, clean: totalViolations === 0 };
}

function summarize(runResult) {
  const { records, meta } = runResult;
  return {
    meta,
    structured: structuredMetrics(records),
    prose: proseMetrics(records),
    verifier: verifierMetrics(records),
    issueDetection: issueLevelDetection(records),
    latency: latencyMetrics(records),
    latencySegments: latencySegments(records),
    cost: costMetrics(records),
    costByModel: costByModel(records),
    invariants: invariantSummary(records),
  };
}

module.exports = {
  percentiles,
  structuredMetrics,
  proseMetrics,
  verifierMetrics,
  issueLevelDetection,
  latencyMetrics,
  latencySegments,
  costMetrics,
  costByModel,
  segmentOf,
  invariantSummary,
  summarize,
  SEMANTIC_CODES,
  STRUCTURAL_CODES,
};
