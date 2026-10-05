'use strict';

const { isConsumed } = require('./scenarioConsumption');
const {
  ORIGINAL_SCENARIO_ID, ORIGINAL_RUN_ID, MODEL_FIX_SCENARIO_ID, MODEL_FIX_RUN_ID,
  REPLACEMENT_SCENARIO_ID, REPLACEMENT_SCENARIO,
} = require('./replacementScenario');
const { readAndValidateThreeDayAdjudication } = require('./threeDayAdjudication');
const { readAndValidateSevenDayAdjudication } = require('./sevenDayAdjudication');

const SEVEN_DAY_SCENARIO_ID = 'basic-03-seven-day';
const FAILED = 'STAGE14_7_LIVE_CONFIRMATION_FAILED';

const AGGREGATE_CONFIRMATION_MANIFEST = Object.freeze({
  manifestId: 'stage14_7-final-aggregate-confirmation-v1',
  historicalLiveRunDecisions: Object.freeze([
    Object.freeze({ scenarioId: ORIGINAL_SCENARIO_ID, sourceRunId: ORIGINAL_RUN_ID, decision: FAILED, consumed: true }),
    Object.freeze({ scenarioId: MODEL_FIX_SCENARIO_ID, sourceRunId: MODEL_FIX_RUN_ID, decision: FAILED, consumed: true }),
    Object.freeze({ scenarioId: SEVEN_DAY_SCENARIO_ID, sourceRunId: 'stage147g-mshyixvk-52ed4e', decision: FAILED, consumed: true }),
  ]),
  completedLiveEvidence: Object.freeze([
    Object.freeze({
      scenarioId: MODEL_FIX_SCENARIO_ID,
      sourceRunId: MODEL_FIX_RUN_ID,
      status: 'adjudicated_correct',
      providerExecutionAlreadyConsumed: true,
    }),
    Object.freeze({
      scenarioId: SEVEN_DAY_SCENARIO_ID,
      sourceRunId: 'stage147g-mshyixvk-52ed4e',
      status: 'adjudicated_correct_after_evidence_contract_repair',
      providerExecutionAlreadyConsumed: true,
    }),
  ]),
  remainingLiveExecution: Object.freeze([]),
  executionOrderFixed: true,
  threeDayRerunRequired: false,
  sevenDayExecutionAuthorized: false,
  secondReplacement: Object.freeze({
    scenarioId: REPLACEMENT_SCENARIO_ID,
    defined: true,
    executionAuthorized: false,
    consumed: false,
    requiredForFinalConfirmation: false,
  }),
});

function aggregateManifestStatus({
  isConsumedFn = isConsumed,
  adjudicationValidator = readAndValidateThreeDayAdjudication,
  sevenDayAdjudicationValidator = readAndValidateSevenDayAdjudication,
} = {}) {
  const adjudication = adjudicationValidator();
  const sevenDayAdjudication = sevenDayAdjudicationValidator();
  const originalConsumed = isConsumedFn(ORIGINAL_SCENARIO_ID);
  const modelFixConsumed = isConsumedFn(MODEL_FIX_SCENARIO_ID);
  const replacementConsumed = isConsumedFn(REPLACEMENT_SCENARIO_ID);
  const sevenDayConsumed = isConsumedFn(SEVEN_DAY_SCENARIO_ID);
  const refusals = [];
  if (!adjudication.valid) refusals.push('three_day_adjudication_invalid');
  if (!sevenDayAdjudication.valid) refusals.push('seven_day_adjudication_invalid');
  if (!originalConsumed) refusals.push('original_failed_scenario_not_preserved');
  if (!modelFixConsumed) refusals.push('model_fix_failed_scenario_not_preserved');
  if (REPLACEMENT_SCENARIO.executionAuthorized || replacementConsumed) refusals.push('second_replacement_not_retired');
  if (!sevenDayConsumed) refusals.push('seven_day_historical_consumption_missing');
  return {
    ...AGGREGATE_CONFIRMATION_MANIFEST,
    historicalDecisionsPreserved: originalConsumed && modelFixConsumed,
    threeDayAdjudicationPassed: adjudication.valid,
    sevenDayAdjudicationPassed: sevenDayAdjudication.valid,
    sevenDayPaidRerunRequired: sevenDayAdjudication.adjudication?.requiresPaidSevenDayRerun !== false,
    secondReplacementConsumed: replacementConsumed,
    sevenDayScenarioAvailable: !sevenDayConsumed,
    sevenDayExecutionAuthorized: AGGREGATE_CONFIRMATION_MANIFEST.sevenDayExecutionAuthorized,
    executionAuthorized: false,
    refusals,
  };
}

module.exports = {
  SEVEN_DAY_SCENARIO_ID,
  AGGREGATE_CONFIRMATION_MANIFEST,
  aggregateManifestStatus,
};
