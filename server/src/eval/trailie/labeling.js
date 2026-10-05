'use strict';

/**
 * Stage 13 §5 — ground-truth verifier labeling.
 *
 * Classifies the deterministic verifier's verdict on a prose-consistency scenario
 * against its stored label into: true_positive, true_negative, false_positive,
 * false_negative, partial_detection. Structural and semantic accuracy are tracked
 * SEPARATELY (a marker-format failure is not proof of semantic contradiction
 * detection).
 *
 * Labeling is only meaningful on runs where the verifier actually ran and did NOT
 * retry (so the detected issue codes reflect a single first draft) — i.e.
 * consistencyMode 'verify'. For other modes we still classify pass/fail but flag
 * `singleDraft:false` so metrics can restrict to clean samples.
 */

const STRUCTURAL_CODES = new Set([
  'missing_day', 'duplicate_day', 'unknown_day',
  'missing_stop', 'duplicate_stop', 'unknown_stop',
  'order_violation', 'wrong_day_assignment',
  'oversized_or_empty_output', 'forbidden_itinerary_artifact',
  'day_marker_missing_id', 'stop_marker_missing_id', 'stop_before_day', 'text_before_first_marker',
]);

const SEMANTIC_CODES = new Set([
  'removed_stop_mention', 'conflicting_duration', 'conflicting_difficulty',
  'conflicting_date', 'conflicting_transition', 'conflicting_overnight',
  'unsupported_plan_action',
]);

// Stage 13.7 — non-blocking diagnostics. Emitted for telemetry only: they never
// flip the verifier to 'failed', never trigger a retry, and are neither
// structural nor semantic confusion signals.
const NON_BLOCKING_CODES = new Set([
  'ambiguous_difficulty_context', 'ambiguous_duration_context',
]);

function codeClass(code) {
  if (STRUCTURAL_CODES.has(code)) return 'structural';
  if (SEMANTIC_CODES.has(code)) return 'semantic';
  if (NON_BLOCKING_CODES.has(code)) return 'non_blocking';
  return 'other';
}

/**
 * @param {Object} params
 * @param {Object} params.scenario  fixture with optional expected.consistency
 * @param {Object} params.record    per-run record from the runner
 * @returns {Object} classification (applicable:false when not a labeled scenario)
 */
function classifyVerifierOutcome({ scenario, record }) {
  const label = scenario?.expected?.consistency;
  const status = record?.prose?.consistencyStatus;

  if (!label || status === 'not_applicable' || record?.consistencyMode === 'off') {
    return { applicable: false };
  }

  const detectedCodes = Object.keys(record.prose.issueTypeCounts || {});
  // First-pass clean acceptance is the only "verifier passed" outcome; retry_passed
  // and fallback_used both mean the first draft was rejected.
  const verifierPassed = status === 'passed';
  const singleDraft = status === 'passed' || status === 'failed_observed';

  const shouldPass = label.shouldPass === true;
  const expectedIssueCodes = label.expectedIssueCodes || [];
  const forbiddenIssueCodes = label.forbiddenIssueCodes || [];

  const forbiddenDetected = forbiddenIssueCodes.filter((c) => detectedCodes.includes(c));
  const expectedDetected = expectedIssueCodes.filter((c) => detectedCodes.includes(c));
  const expectedMissed = expectedIssueCodes.filter((c) => !detectedCodes.includes(c));

  let classification;
  if (shouldPass && verifierPassed) classification = 'true_negative';
  else if (shouldPass && !verifierPassed) classification = 'false_positive';
  else if (!shouldPass && !verifierPassed) {
    classification =
      expectedIssueCodes.length > 1 && expectedMissed.length > 0
        ? 'partial_detection'
        : 'true_positive';
  } else classification = 'false_negative'; // !shouldPass && verifierPassed

  return {
    applicable: true,
    singleDraft,
    shouldPass,
    verifierPassed,
    classification,
    detectedCodes,
    expectedIssueCodes,
    expectedDetected,
    expectedMissed,
    forbiddenDetected,
    forbiddenViolation: forbiddenDetected.length > 0,
    // Split the expected codes by kind so metrics can compute structural vs
    // semantic recall without re-deriving classes.
    expectedStructural: expectedIssueCodes.filter((c) => codeClass(c) === 'structural'),
    expectedSemantic: expectedIssueCodes.filter((c) => codeClass(c) === 'semantic'),
    detectedStructural: detectedCodes.filter((c) => codeClass(c) === 'structural'),
    detectedSemantic: detectedCodes.filter((c) => codeClass(c) === 'semantic'),
  };
}

/**
 * Per-class (structural | semantic) confusion outcome for ONE run, so every
 * metric derives from the same row. One of:
 *   'true_positive' | 'false_negative' | 'true_negative' | 'false_positive'
 *   | 'not_applicable' (this run does not test that class)
 */
function perClassOutcome(ve, klass) {
  if (!ve || !ve.applicable) return 'not_applicable';
  const expected = klass === 'structural' ? ve.expectedStructural : ve.expectedSemantic;
  const detected = klass === 'structural' ? ve.detectedStructural : ve.detectedSemantic;
  const detectedAny = detected.length > 0;
  if (ve.shouldPass) return detectedAny ? 'false_positive' : 'true_negative';
  // Adversarial run: only scores the class it actually tests.
  if (expected.length === 0) return 'not_applicable';
  return detectedAny ? 'true_positive' : 'false_negative';
}

function perClassOutcomes(ve) {
  return {
    structuralOutcome: perClassOutcome(ve, 'structural'),
    semanticOutcome: perClassOutcome(ve, 'semantic'),
  };
}

module.exports = {
  STRUCTURAL_CODES,
  SEMANTIC_CODES,
  NON_BLOCKING_CODES,
  codeClass,
  classifyVerifierOutcome,
  perClassOutcome,
  perClassOutcomes,
};
