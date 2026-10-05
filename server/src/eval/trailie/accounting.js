'use strict';

/**
 * Stage 13.1 §1/§5 — evaluation metric ACCOUNTING.
 *
 * Every headline number is reconciled to an explicit denominator. All metrics are
 * derived from the single canonical result-row schema (see runner). Issue types
 * are labeled with one of:
 *
 *   detected | missed | not_applicable | not_supported | not_executed
 *
 * `not_supported` (no deterministic detector) and `not_executed` (detector exists
 * but no fixture) are NEVER counted as true negatives, and never inflate recall.
 */

const { codeClass } = require('./labeling');

// The audit's issue taxonomy and whether the verifier has a deterministic detector.
const ISSUE_TAXONOMY = {
  missing_day: { detectorSupported: true },
  missing_stop: { detectorSupported: true },
  duplicate_day: { detectorSupported: true },
  duplicate_stop: { detectorSupported: true },
  unknown_day: { detectorSupported: true },
  unknown_stop: { detectorSupported: true },
  order_violation: { detectorSupported: true },
  wrong_day_assignment: { detectorSupported: true },
  removed_stop_mention: { detectorSupported: true },
  conflicting_duration: { detectorSupported: true },
  conflicting_difficulty: { detectorSupported: true },
  conflicting_overnight: { detectorSupported: true }, // added Stage 13.1
  unsupported_plan_action: { detectorSupported: true },
  // No deterministic detector wired — must be reported not_supported, not TN.
  conflicting_date: { detectorSupported: false },
  conflicting_transition: { detectorSupported: false },
};

function ratio(numerator, denominator) {
  return { numerator, denominator, rate: denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null };
}

/** Labeled, single-draft (verify-mode) runs — the only clean verifier verdicts. */
function labeledRuns(records) {
  return records.filter((r) => r.verifierEval && r.verifierEval.applicable && r.verifierEval.singleDraft);
}

/** Per-class confusion with explicit denominators, derived from per-row outcomes. */
function classConfusion(records, klass) {
  const key = klass === 'structural' ? 'structuralOutcome' : 'semanticOutcome';
  const c = { true_positive: 0, false_positive: 0, false_negative: 0, true_negative: 0, not_applicable: 0 };
  for (const r of records) c[r[key]] = (c[r[key]] || 0) + 1;
  const precision = ratio(c.true_positive, c.true_positive + c.false_positive);
  const recall = ratio(c.true_positive, c.true_positive + c.false_negative);
  return {
    confusion: c,
    precision,
    recall,
    // A class with no positives is not_applicable, NOT a free 1.0.
    precisionStatus: precision.denominator > 0 ? 'measured' : 'not_applicable',
    recallStatus: recall.denominator > 0 ? 'measured' : 'not_applicable',
  };
}

/** Per-issue-type detection status with the 5-label scheme + denominators. */
function perIssueAccounting(records) {
  const labeled = labeledRuns(records);
  const out = {};
  for (const [code, meta] of Object.entries(ISSUE_TAXONOMY)) {
    const expectingRuns = labeled.filter(
      (r) => !r.verifierEval.shouldPass && (r.verifierEval.expectedIssueCodes || []).includes(code)
    );
    if (!meta.detectorSupported) {
      out[code] = { class: 'unknown', status: 'not_supported', probedFixtures: expectingRuns.length, detected: 0, denominator: expectingRuns.length, countedAsTrueNegative: false };
      continue;
    }
    if (expectingRuns.length === 0) {
      out[code] = { class: codeClass(code), status: 'not_executed', probedFixtures: 0, detected: 0, denominator: 0, countedAsTrueNegative: false };
      continue;
    }
    const detected = expectingRuns.filter((r) => (r.observedIssueCodes || []).includes(code)).length;
    out[code] = {
      class: codeClass(code),
      status: detected === expectingRuns.length ? 'detected' : (detected === 0 ? 'missed' : 'partial'),
      probedFixtures: expectingRuns.length,
      detected,
      denominator: expectingRuns.length,
      ...ratio(detected, expectingRuns.length),
    };
  }
  return out;
}

/**
 * Full reconciliation report with explicit subsets and denominators.
 * @param {Array} records  verify-mode records (both providers, single route)
 */
function reconcile(records) {
  const labeled = labeledRuns(records);
  const excludedNotApplicable = records.filter((r) => !(r.verifierEval && r.verifierEval.applicable));
  const excludedMultiDraft = records.filter((r) => r.verifierEval && r.verifierEval.applicable && !r.verifierEval.singleDraft);

  const structural = classConfusion(labeled, 'structural');
  const semantic = classConfusion(labeled, 'semantic');

  // Overall FP/FN with explicit denominators (excluding not_supported probes).
  const supportedCodes = new Set(Object.entries(ISSUE_TAXONOMY).filter(([, m]) => m.detectorSupported).map(([c]) => c));
  const negatives = labeled.filter((r) => r.verifierEval.shouldPass);
  const positives = labeled.filter((r) => !r.verifierEval.shouldPass
    && (r.verifierEval.expectedIssueCodes || []).some((c) => supportedCodes.has(c)));
  const notSupportedProbes = labeled.filter((r) => !r.verifierEval.shouldPass
    && (r.verifierEval.expectedIssueCodes || []).length > 0
    && !(r.verifierEval.expectedIssueCodes || []).some((c) => supportedCodes.has(c)));

  const fp = negatives.filter((r) => r.verifierVerdict === 'fail').length;
  const fn = positives.filter((r) => r.verifierVerdict === 'pass').length;

  const perIssue = perIssueAccounting(records);

  return {
    denominators: {
      totalRecords: records.length,
      labeledSingleDraft: labeled.length,
      excludedNotApplicable: { count: excludedNotApplicable.length, reason: 'no consistency label OR consistencyMode=off (verifier did not run)' },
      excludedMultiDraft: { count: excludedMultiDraft.length, reason: 'retry/fallback occurred — verdict not a clean single draft' },
      positiveSamples: positives.length,
      negativeSamples: negatives.length,
      notSupportedProbes: { count: notSupportedProbes.length, reason: 'issue type has no deterministic detector (not_supported); excluded from precision/recall, never counted as TN' },
    },
    subsets: {
      fullLabeledSet: { size: labeled.length },
      structuralSubset: { size: labeled.filter((r) => r.structuralOutcome !== 'not_applicable').length, ...structural },
      semanticSubset: { size: labeled.filter((r) => r.semanticOutcome !== 'not_applicable').length, ...semantic },
      headlineSupportedIssueSubset: {
        positives: positives.length,
        excludedNotSupported: notSupportedProbes.length,
        falsePositiveRate: ratio(fp, negatives.length),
        falseNegativeRate: ratio(fn, positives.length),
      },
    },
    perIssue,
    supportedIssueTypes: [...supportedCodes],
    unsupportedIssueTypes: Object.entries(ISSUE_TAXONOMY).filter(([, m]) => !m.detectorSupported).map(([c]) => c),
    integrityChecks: {
      // A disclosed FN, if present, MUST show up in the denominator: recall < 1.
      semanticRecallConsistent: semantic.recall.denominator === 0 || (fn === 0) === (semantic.recall.rate === 1),
      noFalsePositives: fp === 0,
      falseNegativeCount: fn,
    },
  };
}

module.exports = { ISSUE_TAXONOMY, reconcile, perIssueAccounting, classConfusion, labeledRuns };
