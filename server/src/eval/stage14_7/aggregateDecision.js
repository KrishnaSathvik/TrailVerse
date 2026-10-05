'use strict';

const { readAndValidateThreeDayAdjudication } = require('./threeDayAdjudication');
const { hardInvariantFailures } = require('./decision');
const { evaluateRequiredEvidence } = require('./requiredEvidenceManifest');

const AGGREGATE_DECISION = Object.freeze({
  FAILED: 'STAGE14_7_LIVE_CONFIRMATION_FAILED',
  CORRECT_BUT_GAIN_INSUFFICIENT: 'STAGE14_7_CORRECT_BUT_GAIN_INSUFFICIENT',
  READY: 'READY_FOR_STAGE14_INTERNAL_ACCEPTANCE_TESTING',
  NOT_STARTED: 'LIVE_EXECUTION_NOT_STARTED',
});

function calculateAggregateDecision({
  sevenDayLiveExecutionStarted = false,
  adjudicationValidation = readAndValidateThreeDayAdjudication(),
  sevenDay = null,
  sevenDayAdjudicationValidation = null,
  cleanup = null,
  offlineReplay = null,
} = {}) {
  if (!adjudicationValidation?.valid) return {
    decision: AGGREGATE_DECISION.NOT_STARTED,
    finalAggregateStage14_7Decision: null,
    boundedCode: 'three_day_adjudication_invalid',
    advancesRollout: false,
    productionCorrectnessPassed: false,
    performanceGainPassed: false,
    evidenceContractPassed: false,
    aggregateDecision: AGGREGATE_DECISION.NOT_STARTED,
  };
  if (!sevenDayLiveExecutionStarted) return {
    decision: AGGREGATE_DECISION.NOT_STARTED,
    finalAggregateStage14_7Decision: null,
    boundedCode: 'seven_day_live_execution_not_started',
    advancesRollout: false,
    productionCorrectnessPassed: false,
    performanceGainPassed: false,
    evidenceContractPassed: false,
    aggregateDecision: AGGREGATE_DECISION.NOT_STARTED,
  };
  const invariantResult = sevenDay && sevenDay.hardInvariantsPassed !== undefined
    ? { ok: sevenDay.hardInvariantsPassed === true }
    : hardInvariantFailures(sevenDay || {});
  const hardFailure = !sevenDay
    || invariantResult.ok !== true
    || (sevenDay.capsRespected !== undefined && sevenDay.capsRespected !== true)
    || (sevenDay.restorePassed !== undefined && sevenDay.restorePassed !== true)
    || (sevenDay.offlineReplayPassed !== undefined && sevenDay.offlineReplayPassed !== true)
    || (sevenDay.cleanupPassed !== undefined && sevenDay.cleanupPassed !== true)
    || (offlineReplay != null && offlineReplay.ok !== true)
    || (cleanup != null && cleanup.ok !== true);
  const productionCorrectnessPassed = !hardFailure;
  const threeDayGainPassed = adjudicationValidation.adjudication?.gainThresholdPassed === true;
  const performanceGainPassed = threeDayGainPassed && sevenDay?.gain?.qualifies === true;
  const rawEvidence = evaluateRequiredEvidence({ sevenDay });
  const adjudicatedEvidencePassed = sevenDayAdjudicationValidation?.valid === true
    && sevenDayAdjudicationValidation.adjudication?.evidenceContractPassed === true;
  const evidenceContractPassed = adjudicatedEvidencePassed || rawEvidence.evidenceContractPassed;

  if (!productionCorrectnessPassed || !evidenceContractPassed) return {
    decision: AGGREGATE_DECISION.FAILED,
    finalAggregateStage14_7Decision: AGGREGATE_DECISION.FAILED,
    aggregateDecision: AGGREGATE_DECISION.FAILED,
    advancesRollout: false,
    productionCorrectnessPassed,
    performanceGainPassed,
    evidenceContractPassed,
    evidenceFailures: evidenceContractPassed ? [] : rawEvidence.failures,
  };
  if (!performanceGainPassed) return {
    decision: AGGREGATE_DECISION.CORRECT_BUT_GAIN_INSUFFICIENT,
    finalAggregateStage14_7Decision: AGGREGATE_DECISION.CORRECT_BUT_GAIN_INSUFFICIENT,
    aggregateDecision: AGGREGATE_DECISION.CORRECT_BUT_GAIN_INSUFFICIENT,
    advancesRollout: false,
    productionCorrectnessPassed,
    performanceGainPassed,
    evidenceContractPassed,
  };
  return {
    decision: AGGREGATE_DECISION.READY,
    finalAggregateStage14_7Decision: AGGREGATE_DECISION.READY,
    aggregateDecision: AGGREGATE_DECISION.READY,
    advancesRollout: false,
    productionCorrectnessPassed,
    performanceGainPassed,
    evidenceContractPassed,
  };
}

function calculateAdjudicatedAggregateDecision({ threeDayValidation, sevenDayValidation } = {}) {
  const three = threeDayValidation?.adjudication || {};
  const seven = sevenDayValidation?.adjudication || {};
  const productionCorrectnessPassed = sevenDayValidation?.valid === true && [
    seven.correctnessPassed, seven.persistencePassed, seven.lifecyclePassed,
    seven.restorePassed, seven.replayPassed, seven.cleanupPassed,
    seven.isolationPassed, seven.accountingPassed,
  ].every((value) => value === true);
  const performanceGainPassed = threeDayValidation?.valid === true
    && three.gainThresholdPassed === true && seven.gainPassed === true;
  const evidenceContractPassed = sevenDayValidation?.valid === true
    && seven.evidenceContractPassed === true;
  let aggregateDecision = AGGREGATE_DECISION.FAILED;
  if (productionCorrectnessPassed && evidenceContractPassed) {
    aggregateDecision = performanceGainPassed
      ? AGGREGATE_DECISION.READY : AGGREGATE_DECISION.CORRECT_BUT_GAIN_INSUFFICIENT;
  }
  return {
    productionCorrectnessPassed,
    performanceGainPassed,
    evidenceContractPassed,
    aggregateDecision,
    decision: aggregateDecision,
    finalAggregateStage14_7Decision: aggregateDecision,
    advancesRollout: false,
  };
}

module.exports = {
  AGGREGATE_DECISION, calculateAggregateDecision, calculateAdjudicatedAggregateDecision,
};
