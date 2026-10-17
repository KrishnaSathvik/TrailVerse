'use strict';

/**
 * Stage 14.7J §6/§7/§11 — the EXACT remaining Stage 14.7 confirmation plan, and
 * the separation between "the executor works" and "this paid run may start".
 *
 * WHY THIS EXISTS
 * ---------------
 * After 14.7I the receipt said `liveExecutionReady: true`. Every technical gate
 * was genuinely green. But the scenario set behind that flag was no longer the
 * reviewed one:
 *
 *   basic-02-three-day      permanently consumed by the failed run
 *   replacement             defined, NOT authorized
 *   approved list           still named the consumed original
 *
 * A live command in that state would have skipped the consumed original and run
 * `basic-03-seven-day` alone — technically executable, and reportable as
 * "Stage 14.7 confirmation complete" while proving nothing about the model-
 * resolution fix. That is the failure mode this module exists to make
 * impossible: a seven-day-only invocation is never a two-scenario confirmation.
 *
 * Stage 14.7K — the reviewed decision RETAINED the full two-scenario scope
 * (running only the seven-day case would leave the model-resolution fix
 * unverified against the three-day case that originally failed) and raised the
 * cumulative ceilings to cover the measured $1.38 worst case. So
 * `replacementScenarioExecutionAuthorized` is now true, and the executor's
 * approved list is DERIVED from this manifest rather than sitting beside it.
 *
 * Authorization is still not consumption, and it is still not permission to run
 * something else: the gate below refuses any set that is not exactly these two,
 * in this order, before a marker is written.
 */

const { isConsumed } = require('./scenarioConsumption');
const {
  REPLACEMENT_SCENARIO_ID, ORIGINAL_SCENARIO_ID, ORIGINAL_RUN_ID, MODEL_FIX_SCENARIO_ID,
  REPLACEMENT_SCENARIO,
} = require('./replacementScenario');
const { readAndValidateThreeDayAdjudication } = require('./threeDayAdjudication');
const { readAndValidateSevenDayAdjudication } = require('./sevenDayAdjudication');

const SEVEN_DAY_SCENARIO_ID = 'basic-03-seven-day';
const CONSUMED_MODEL_FIX_SCENARIO_ID = 'basic-02-three-day-model-fix-validation-1';

/** §6 — refusal codes. Returned before consumption, never after. */
const MANIFEST_CODES = {
  NOT_STARTED: 'LIVE_EXECUTION_NOT_STARTED',
  MANIFEST_NOT_AUTHORIZED: 'live_scenario_manifest_not_authorized',
  /**
   * Stage 14.7K §2 — the requested SET is not the reviewed one.
   *
   * Distinct from `…not_authorized`, which means the reviewed set itself is not
   * yet cleared to run. The two demand different responses: a mismatch is a
   * caller error, an unauthorized manifest is a review decision.
   */
  MANIFEST_MISMATCH: 'live_scenario_manifest_mismatch',
  REPLACEMENT_NOT_AUTHORIZED: 'replacement_scenario_execution_not_authorized',
  ORIGINAL_NOT_PRESERVED: 'original_failed_scenario_not_preserved',
  REPLACEMENT_ALREADY_CONSUMED: 'replacement_scenario_already_consumed',
  SEVEN_DAY_UNAVAILABLE: 'seven_day_scenario_unavailable',
  PARTIAL_MANIFEST: 'partial_manifest_refused',
  THREE_DAY_ADJUDICATION_INVALID: 'three_day_adjudication_invalid',
  SEVEN_DAY_NOT_AUTHORIZED: 'seven_day_execution_not_authorized',
  NO_FURTHER_LIVE_EXECUTION: 'stage14_7_complete_no_live_execution_authorized',
};

/**
 * §6 — the ONE manifest describing the proposed remaining confirmation.
 *
 * The order is fixed and is part of the contract: the replacement re-validates
 * the model-resolution fix on the same prompt that exposed it, and only a run
 * that has done so may spend the seven-day scenario.
 */
const LIVE_SCENARIO_MANIFEST = Object.freeze({
  manifestId: 'stage14_7-final-aggregate-confirmation-v1',
  // The new replacement is intentionally absent until a separate review
  // authorizes it. Keeping the consumed model-fix slot here makes every paid
  // invocation fail closed without silently authorizing the new identifier.
  scenarios: Object.freeze([]),

  originalFailedScenario: ORIGINAL_SCENARIO_ID,
  originalFailedScenarioRunId: ORIGINAL_RUN_ID,
  originalFailedScenarioConsumed: true,
  replacementScenario: REPLACEMENT_SCENARIO_ID,
  replacementScenarioDefined: true,
  // Stage 14.7K §2 — authorized by the reviewed cap-and-scope decision.
  replacementScenarioExecutionAuthorized: false,
  sevenDayScenario: SEVEN_DAY_SCENARIO_ID,
  sevenDayScenarioAvailable: false,
  sevenDayExecutionAuthorized: false,
  threeDayAdjudicationRequired: true,
  threeDayRerunRequired: false,
  executionOrderFixed: true,

  // The consumed original is EXCLUDED from the runnable set but named here, so
  // a report cannot quietly present a shorter list as the whole plan.
  excludedConsumedScenarios: Object.freeze([ORIGINAL_SCENARIO_ID, CONSUMED_MODEL_FIX_SCENARIO_ID]),
  requiredScenarioCount: 0,
});

/**
 * The manifest's live status, measured rather than asserted.
 *
 * `matchesReviewedManifest` is the question that matters: is the set that would
 * actually run the set that was reviewed?
 */
function manifestStatus({
  isConsumedFn = isConsumed,
  adjudicationValidator = readAndValidateThreeDayAdjudication,
  sevenDayAdjudicationValidator = readAndValidateSevenDayAdjudication,
} = {}) {
  const originalConsumed = isConsumedFn(ORIGINAL_SCENARIO_ID);
  const modelFixConsumed = isConsumedFn(MODEL_FIX_SCENARIO_ID);
  const replacementConsumed = isConsumedFn(REPLACEMENT_SCENARIO_ID);
  const sevenDayConsumed = isConsumedFn(SEVEN_DAY_SCENARIO_ID);
  const replacementAuthorized = REPLACEMENT_SCENARIO.executionAuthorized === true;
  const adjudication = adjudicationValidator();
  const sevenDayAdjudication = sevenDayAdjudicationValidator();

  const refusals = [];
  // The original must still read as consumed. If it ever read as available, the
  // permanent record of the failed run would have been lost.
  if (!originalConsumed) refusals.push(MANIFEST_CODES.ORIGINAL_NOT_PRESERVED);
  if (!modelFixConsumed) refusals.push('model_fix_failed_scenario_not_preserved');
  if (!adjudication.valid) refusals.push(MANIFEST_CODES.THREE_DAY_ADJUDICATION_INVALID);
  if (!sevenDayAdjudication.valid) refusals.push('seven_day_adjudication_invalid');
  if (replacementAuthorized || replacementConsumed) refusals.push(MANIFEST_CODES.REPLACEMENT_ALREADY_CONSUMED);

  return {
    manifestId: LIVE_SCENARIO_MANIFEST.manifestId,
    scenarios: [...LIVE_SCENARIO_MANIFEST.scenarios],
    originalFailedScenario: ORIGINAL_SCENARIO_ID,
    originalFailedScenarioConsumed: originalConsumed,
    originalFailedScenarioResetPermitted: false,
    modelFixFailedScenarioConsumed: modelFixConsumed,
    threeDayAdjudicationPassed: adjudication.valid,
    threeDayRerunRequired: false,
    sevenDayAdjudicationPassed: sevenDayAdjudication.valid,
    sevenDayPaidRerunRequired: sevenDayAdjudication.adjudication?.requiresPaidSevenDayRerun !== false,
    replacementScenarioDefined: true,
    replacementScenarioExecutionAuthorized: replacementAuthorized,
    replacementScenarioConsumed: replacementConsumed,
    sevenDayScenarioAvailable: !sevenDayConsumed,
    sevenDayExecutionAuthorized: LIVE_SCENARIO_MANIFEST.sevenDayExecutionAuthorized,
    executionOrderFixed: true,
    matchesReviewedManifest: refusals.length === 0,
    liveExecutionReady: false,
    refusals,
  };
}

/**
 * §6/§11 — the gate the runner must call BEFORE consuming anything.
 *
 * Refuses when the exact reviewed manifest is not authorized, and refuses
 * SPECIFICALLY when the requested set is a subset of it: a runner that silently
 * drops the consumed original and proceeds with what is left is the case this
 * function exists to catch.
 *
 * @param {string[]} [requestedScenarios] what the caller intends to run
 * @returns {{authorized: boolean, decision: ?string, boundedCode: ?string, refusals: string[], status: Object}}
 */
function assertLiveScenarioManifestAuthorized({
  requestedScenarios = null, isConsumedFn = isConsumed,
  adjudicationValidator = readAndValidateThreeDayAdjudication,
} = {}) {
  const status = manifestStatus({ isConsumedFn, adjudicationValidator });
  const refusals = [...status.refusals];
  refusals.push(MANIFEST_CODES.NO_FURTHER_LIVE_EXECUTION);

  /**
   * Stage 14.7K §2 — the requested set must be EXACTLY the reviewed one, in
   * order. One comparison covers every case the review enumerated: seven-day
   * alone, replacement alone, reversed order, the consumed original, a third
   * scenario, and any unreviewed replacement identifier.
   */
  let mismatched = false;
  if (Array.isArray(requestedScenarios)) {
    const requested = requestedScenarios.map(String);
    const expected = LIVE_SCENARIO_MANIFEST.scenarios;
    mismatched = requested.length !== expected.length
      || !requested.every((id, i) => id === expected[i]);
    if (mismatched) {
      refusals.push(MANIFEST_CODES.MANIFEST_MISMATCH);
      // Retained so an operator reading either vocabulary sees the same fact:
      // running a subset is never "close enough" to the confirmation.
      refusals.push(MANIFEST_CODES.PARTIAL_MANIFEST);
    }
  }

  return {
    authorized: false,
    decision: MANIFEST_CODES.NOT_STARTED,
    // A wrong SET is a mismatch; a right set that is not yet cleared to run is
    // an authorization refusal. They are not the same problem.
    boundedCode: refusals.includes(MANIFEST_CODES.THREE_DAY_ADJUDICATION_INVALID)
      ? MANIFEST_CODES.THREE_DAY_ADJUDICATION_INVALID
      : (mismatched ? MANIFEST_CODES.MANIFEST_MISMATCH : MANIFEST_CODES.NO_FURTHER_LIVE_EXECUTION),
    refusals,
    status,
  };
}

/**
 * §7 — technical readiness and paid-manifest readiness, reported SEPARATELY.
 *
 * A technically functional executor is not a licence to spend. `liveExecutionReady`
 * is the conjunction and nothing else; it is never read from a file, and never
 * true because two of the three parts are.
 */
function calculatePaidExecutionReadiness({
  liveExecutorTechnicalReady = false,
  manifest = null,
  budgetProjection = null,
} = {}) {
  const liveScenarioManifestReady = Boolean(manifest && manifest.matchesReviewedManifest === true);
  /**
   * Stage 14.7L §10 — resolving the prior exposure is its OWN answer.
   *
   * Folding it into `cumulativeBudgetFeasible` would let "we could not measure
   * the prior exposure" and "we measured it and it does not fit" report
   * identically — and the first of those is the condition that produced two
   * wrong feasibility verdicts.
   */
  const cumulativeExposureResolved = Boolean(
    budgetProjection && budgetProjection.cumulativeExposureResolved === true,
  );
  const cumulativeBudgetFeasible = Boolean(budgetProjection && budgetProjection.cumulativeBudgetFeasible === true);
  const noRemainingLiveExecution = LIVE_SCENARIO_MANIFEST.scenarios.length === 0;

  return {
    liveExecutorTechnicalReady: Boolean(liveExecutorTechnicalReady),
    liveScenarioManifestReady,
    cumulativeExposureResolved,
    cumulativeBudgetFeasible,
    threeDayAdjudicationPassed: manifest?.threeDayAdjudicationPassed === true,
    threeDayRerunRequired: false,
    sevenDayScenarioAvailable: manifest?.sevenDayScenarioAvailable === true,
    sevenDayExecutionAuthorized: manifest?.sevenDayExecutionAuthorized === true,
    liveExecutionReady: false,
    // Why it is not ready, in the reviewer's terms rather than a boolean soup.
    blockedBy: [
      ...(liveExecutorTechnicalReady ? [] : ['live_executor_not_technically_ready']),
      ...(liveScenarioManifestReady ? [] : [MANIFEST_CODES.MANIFEST_NOT_AUTHORIZED]),
      ...(cumulativeExposureResolved ? [] : ['prior_cumulative_exposure_unresolved']),
      ...(cumulativeBudgetFeasible ? [] : ['cumulative_stage14_7_cap_insufficient']),
      ...(noRemainingLiveExecution ? [MANIFEST_CODES.NO_FURTHER_LIVE_EXECUTION] : []),
    ],
  };
}

module.exports = {
  SEVEN_DAY_SCENARIO_ID,
  MANIFEST_CODES,
  LIVE_SCENARIO_MANIFEST,
  manifestStatus,
  assertLiveScenarioManifestAuthorized,
  calculatePaidExecutionReadiness,
};
