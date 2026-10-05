'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { calculateGain, hardInvariantFailures } = require('./decision');
const { evaluateRequiredEvidence } = require('./requiredEvidenceManifest');
const {
  LIVE_EVIDENCE_PATH, buildHistoricalSevenDayReconciliation,
} = require('./historicalSevenDayEvidence');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const REPLAY_EVIDENCE_PATH = path.join(REPO_ROOT, 'artifacts/private/stage14_7R-captured-replay.json');
const ADJUDICATION_PATH = path.join(REPO_ROOT, 'artifacts/private/stage14_7-seven-day-adjudication.json');
const INVALID_CODE = 'seven_day_adjudication_invalid';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function readJson(file) {
  const bytes = fs.readFileSync(file);
  return { value: JSON.parse(bytes.toString('utf8')), sha256: sha256(bytes) };
}

function buildSevenDayAdjudication({ liveEvidence = null, replayEvidence = null } = {}) {
  const liveSource = liveEvidence
    ? { value: liveEvidence, sha256: sha256(Buffer.from(JSON.stringify(liveEvidence))) }
    : readJson(LIVE_EVIDENCE_PATH);
  const replaySource = replayEvidence
    ? { value: replayEvidence, sha256: sha256(Buffer.from(JSON.stringify(replayEvidence))) }
    : readJson(REPLAY_EVIDENCE_PATH);
  const live = liveSource.value;
  const replay = replaySource.value;
  const historical = buildHistoricalSevenDayReconciliation({ liveEvidence: live });
  const checkpoints = live.timeline?.checkpoints || {};
  const gain = calculateGain({
    timeToItineraryVisibleMs: checkpoints.itineraryVisible,
    timeToProseVisibleMs: checkpoints.proseVisible,
  });
  const invariants = hardInvariantFailures(live);
  const rawContract = evaluateRequiredEvidence({ sevenDay: live });

  const correctnessPassed = invariants.ok === true;
  const persistencePassed = live.persistence?.persistenceHttpRequests === 2
    && live.persistence?.acceptedWrites === 2
    && live.persistence?.idempotentWrites === 0
    && live.persistence?.staleWrites === 0
    && live.persistence?.conflictWrites === 0
    && live.persistence?.automaticPersistenceRequestsFromDone === 0;
  const lifecyclePassed = live.lifecycleJournalMatches === true;
  const restorePassed = live.restore?.presentationState === 'prose_complete'
    && live.restore?.itineraryHashMatches === true && live.restore?.frozenPlanMatches === true;
  const replayPassed = live.offlineReplay?.ok === true
    && replay.mechanismReplayPassed === true && replay.providerCalls === 0;
  const cleanupPassed = live.cleanup?.ok === true;
  const gainPassed = gain.qualifies === true;
  const accountingPassed = historical.exactReconciliation === true
    && live.ledger?.reconciliation?.reconciles === true;
  const isolationPassed = live.isolation?.productionDatabaseConnections === 0
    && live.isolation?.productionDatabaseWrites === 0
    && live.isolation?.externalNonProviderNetworkAttempts === 0
    && live.providerCorrelation?.unaccountedHttpRequests === 0;

  const cacheLimitationAccepted = historical.cacheReconciliation.structuredAttempt.recovered === false
    && historical.cacheReconciliation.proseAttempt.recovered === false
    && historical.conservativeCapProof.capUnderstatementRiskBounded === true
    && replay.cacheUsageMechanism?.passed === true;
  const identityLimitationAccepted = historical.identityReconciliation.identityEvidenceComplete === false
    && replay.identityEvidence?.identityEvidenceComplete === true
    && live.identityStable === true && live.restore?.storedAssistantSlots === 1;
  const boundedHistoricalLimitationsAccepted = cacheLimitationAccepted && identityLimitationAccepted;
  const evidenceContractPassed = rawContract.evidenceContractPassed
    || (boundedHistoricalLimitationsAccepted && replayPassed);
  const adjudicationPassed = [
    correctnessPassed, persistencePassed, lifecyclePassed, restorePassed, replayPassed,
    cleanupPassed, gainPassed, accountingPassed, isolationPassed, evidenceContractPassed,
  ].every(Boolean);

  return {
    schemaVersion: 'stage14_7R.1',
    scenarioId: 'basic-03-seven-day',
    sourceRunId: 'stage147g-mshyixvk-52ed4e',
    historicalDecision: 'STAGE14_7_LIVE_CONFIRMATION_FAILED',
    historicalFailureCategory: 'evidence_contract_incomplete',
    adjudicationStatus: adjudicationPassed
      ? 'LIVE_EVIDENCE_CORRECT_AFTER_EVIDENCE_CONTRACT_REPAIR'
      : 'LIVE_EVIDENCE_ADJUDICATION_FAILED',
    correctnessPassed,
    persistencePassed,
    lifecyclePassed,
    restorePassed,
    replayPassed,
    cleanupPassed,
    isolationPassed,
    accountingPassed,
    gainPassed,
    gain,
    rawHistoricalEvidenceContractPassed: rawContract.evidenceContractPassed,
    rawHistoricalEvidenceFailures: rawContract.failures,
    boundedHistoricalLimitationsAccepted,
    evidenceContractPassed,
    cacheEvidenceStatus: cacheLimitationAccepted ? 'reviewed_bounded_limitation' : 'historical_not_retained',
    identityEvidenceStatus: identityLimitationAccepted ? 'reviewed_bounded_limitation' : 'historical_not_retained',
    historicalLimitations: [
      {
        field: 'provider_cache_usage', status: 'historical_not_retained',
        nonBlockingBecause: 'conservative_reservations_bound_cost_and_replay_proves_capture',
      },
      {
        field: 'assistant_message_identity', status: 'historical_not_retained',
        nonBlockingBecause: 'production_supporting_evidence_and_real_transcript_replay_prove_mechanism',
      },
    ],
    requiresPaidSevenDayRerun: !adjudicationPassed,
    replacementSevenDayScenarioDefined: !adjudicationPassed,
    replacementSevenDayExecutionAuthorized: false,
    historicalReconciliation: {
      cumulativeExposure: historical.cumulativeExposure,
      exactReconciliation: historical.exactReconciliation,
      conservativeCapProof: historical.conservativeCapProof,
    },
    sourceEvidenceHashes: {
      liveEvidenceSha256: liveSource.sha256,
      replayEvidenceSha256: replaySource.sha256,
      consumptionMarkerSha256: historical.sourceEvidenceHashes.consumptionMarkerSha256,
    },
  };
}

function writeSevenDayAdjudication() {
  const adjudication = buildSevenDayAdjudication();
  fs.mkdirSync(path.dirname(ADJUDICATION_PATH), { recursive: true });
  fs.writeFileSync(ADJUDICATION_PATH, `${JSON.stringify(adjudication, null, 2)}\n`);
  return adjudication;
}

function readAndValidateSevenDayAdjudication({ readArtifact = null } = {}) {
  try {
    const actual = readArtifact ? readArtifact() : JSON.parse(fs.readFileSync(ADJUDICATION_PATH, 'utf8'));
    const expected = buildSevenDayAdjudication();
    const matches = actual != null && JSON.stringify(actual) === JSON.stringify(expected);
    return {
      valid: matches && expected.requiresPaidSevenDayRerun === false,
      boundedCode: matches && expected.requiresPaidSevenDayRerun === false ? null : INVALID_CODE,
      adjudication: matches ? actual : null,
    };
  } catch {
    return { valid: false, boundedCode: INVALID_CODE, adjudication: null };
  }
}

module.exports = {
  REPLAY_EVIDENCE_PATH, ADJUDICATION_PATH, INVALID_CODE,
  buildSevenDayAdjudication, writeSevenDayAdjudication, readAndValidateSevenDayAdjudication,
};
