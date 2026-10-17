'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const LIVE_EVIDENCE_PATH = path.join(
  REPO_ROOT,
  'artifacts/private/stage14_7-live/stage147g-mshqzkal-cda9db/basic-02-three-day-model-fix-validation-1.json',
);
const REPLAY_EVIDENCE_PATH = path.join(REPO_ROOT, 'artifacts/private/stage14_7P-captured-replay.json');
const ADJUDICATION_PATH = path.join(REPO_ROOT, 'artifacts/private/stage14_7-three-day-adjudication.json');

const INVALID_CODE = 'three_day_adjudication_invalid';
const SCENARIO_ID = 'basic-02-three-day-model-fix-validation-1';
const RUN_ID = 'stage147g-mshqzkal-cda9db';
const HISTORICAL_DECISION = 'STAGE14_7_LIVE_CONFIRMATION_FAILED';

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readJsonWithHash(file) {
  const bytes = fs.readFileSync(file);
  return { value: JSON.parse(bytes.toString('utf8')), sha256: sha256Bytes(bytes) };
}

function round(value, digits) {
  return Number(Number(value).toFixed(digits));
}

/**
 * Derive the adjudication exclusively from the preserved paid-run artifact and
 * the provider-disabled 14.7P replay. The historical evaluator verdict is kept
 * separate because it remains an accurate record of what that invocation said.
 */
function buildThreeDayAdjudication({ liveEvidence = null, replayEvidence = null } = {}) {
  const liveSource = liveEvidence
    ? { value: liveEvidence, sha256: sha256Bytes(Buffer.from(JSON.stringify(liveEvidence))) }
    : readJsonWithHash(LIVE_EVIDENCE_PATH);
  const replaySource = replayEvidence
    ? { value: replayEvidence, sha256: sha256Bytes(Buffer.from(JSON.stringify(replayEvidence))) }
    : readJsonWithHash(REPLAY_EVIDENCE_PATH);
  const live = liveSource.value;
  const replay = replaySource.value;
  const checkpoints = live.timeline?.checkpoints || {};
  const absoluteGainMs = round(checkpoints.proseVisible - checkpoints.itineraryVisible, 3);
  const relativeGain = round(absoluteGainMs / checkpoints.proseVisible, 4);
  const entries = live.ledger?.entries || [];
  const model = live.ledger?.model || null;
  const correlation = live.providerCorrelation || {};
  const replayResult = replay.result || {};
  const canonical = replay.canonicalIdentityDiff || {};

  const providerItineraryValid = replay.itineraryValidation?.valid === true;
  const frozenPlanStable = canonical.allEightTransitionsMatch === true
    && Array.isArray(canonical.prohibitedMismatches)
    && canonical.prohibitedMismatches.length === 0;
  const lifecycleJournalMatches = replayResult.lifecycleJournalMatches === true;
  const persistencePassed = replayResult.persistenceHttpRequests === 2
    && replayResult.acceptedWrites === 2
    && replayResult.automaticPersistenceRequestsFromDone === 0
    && live.persistence?.sameTrip === true;
  const restoreHashMatches = replayResult.restoreHashMatches === true;
  const restorePlanMatches = replayResult.restorePlanMatches === true;
  const offlineReplayPassed = live.offlineReplay?.ok === true && live.offlineReplay?.providerCalls === 0;
  const cleanupPassed = live.cleanup?.ok === true;
  const foreignRecordPreservationPassed = replay.foreignRecordPreservation?.unchanged === true;
  const localMongoAvailabilityPassed = replay.mongoAvailability?.beforeCleanup?.localMongoStillAvailable === true
    && replay.mongoAvailability?.afterCleanup?.localMongoStillAvailable === true;
  const providerEvidencePassed = correlation.ledgeredProviderAttempts === 2
    && correlation.dispatchAuthorizations === 2
    && correlation.providerHttpRequests === 2
    && correlation.unaccountedHttpRequests === 0
    && correlation.correlated === true
    && entries.length === 2
    && entries.every((entry) => entry.model === model
      && entry.outcome === 'success' && entry.settlementStatus === 'settled_actual')
    && live.childReadiness?.resolvedModel === model
    && live.effectiveConfig?.resolvedDispatchModel === model;
  const gainThresholdPassed = absoluteGainMs >= 10000 && relativeGain >= 0.20;
  const adjudicationPassed = [
    providerItineraryValid, frozenPlanStable, lifecycleJournalMatches,
    persistencePassed, restoreHashMatches, restorePlanMatches, offlineReplayPassed,
    cleanupPassed, foreignRecordPreservationPassed, localMongoAvailabilityPassed,
    providerEvidencePassed, gainThresholdPassed,
  ].every(Boolean);

  return {
    schemaVersion: 'stage14_7Q.1',
    scenarioId: SCENARIO_ID,
    sourceRunId: RUN_ID,
    historicalDecision: HISTORICAL_DECISION,
    postRepairEvidenceAdjudication: adjudicationPassed
      ? 'LIVE_EVIDENCE_CORRECT_AFTER_EVALUATOR_REPAIR' : 'LIVE_EVIDENCE_ADJUDICATION_FAILED',
    adjudicationStatus: adjudicationPassed
      ? 'LIVE_EVIDENCE_CORRECT_AFTER_EVALUATOR_REPAIR' : 'LIVE_EVIDENCE_ADJUDICATION_FAILED',
    providerItineraryValid,
    frozenPlanStable,
    lifecycleJournalMatches,
    persistencePassed,
    restoreHashMatches,
    restorePlanMatches,
    offlineReplayPassed,
    cleanupPassed,
    foreignRecordPreservationPassed,
    localMongoAvailabilityPassed,
    absoluteGainMs,
    relativeGain,
    gainThresholdPassed,
    productionItineraryDefectFound: !providerItineraryValid,
    evaluatorDefectsFound: replay.itineraryValidation?.category === 'evaluator_comparison_bug'
      && replay.mongoAvailability?.historicalFailureClassification === 'diagnostic_bug',
    requiresPaidThreeDayRerun: !adjudicationPassed,
    evidenceLimitations: {
      providerRequestIds: 'historical_not_retained',
      sdkRequestModel: 'historical_not_retained',
    },
    providerCorrelation: {
      authorizedProviderAttempts: correlation.dispatchAuthorizations ?? null,
      ledgeredProviderAttempts: correlation.ledgeredProviderAttempts ?? null,
      providerHttpRequests: correlation.providerHttpRequests ?? null,
      unaccountedHttpRequests: correlation.unaccountedHttpRequests ?? null,
      ledgerModel: model,
      resolvedModel: live.childReadiness?.resolvedModel ?? null,
      dispatchModel: live.effectiveConfig?.resolvedDispatchModel ?? null,
      modelStable: providerEvidencePassed,
      successfulProviderResponses: entries.filter((entry) => entry.outcome === 'success').length,
    },
    canonicalEvidence: {
      frozenPlanHash: canonical.frozenPlanHash ?? null,
      comparisons: Array.isArray(canonical.comparisons) ? canonical.comparisons.length : 0,
      allEightTransitionsMatch: canonical.allEightTransitionsMatch === true,
      prohibitedMismatches: canonical.prohibitedMismatches || [],
    },
    sourceEvidenceHashes: {
      liveEvidenceSha256: liveSource.sha256,
      replayEvidenceSha256: replaySource.sha256,
    },
  };
}

function readAndValidateThreeDayAdjudication({ readArtifact = null } = {}) {
  try {
    const actual = readArtifact ? readArtifact() : JSON.parse(fs.readFileSync(ADJUDICATION_PATH, 'utf8'));
    const expected = buildThreeDayAdjudication();
    const matches = actual != null && JSON.stringify(actual) === JSON.stringify(expected);
    return {
      valid: matches && expected.requiresPaidThreeDayRerun === false,
      boundedCode: matches && expected.requiresPaidThreeDayRerun === false ? null : INVALID_CODE,
      adjudication: matches ? actual : null,
    };
  } catch (error) {
    return { valid: false, boundedCode: INVALID_CODE, adjudication: null };
  }
}

module.exports = {
  LIVE_EVIDENCE_PATH,
  REPLAY_EVIDENCE_PATH,
  ADJUDICATION_PATH,
  INVALID_CODE,
  buildThreeDayAdjudication,
  readAndValidateThreeDayAdjudication,
};
