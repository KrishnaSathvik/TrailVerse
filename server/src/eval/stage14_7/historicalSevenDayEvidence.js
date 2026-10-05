'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { estimateCostUsd } = require('../trailie/pricing');

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const LIVE_EVIDENCE_PATH = path.join(REPO_ROOT, 'artifacts/private/stage14_7-live/stage147g-mshyixvk-52ed4e/basic-03-seven-day.json');
const CONSUMPTION_PATH = path.join(REPO_ROOT, 'artifacts/private/stage14_7-consumption/basic-03-seven-day.json');
const CUMULATIVE_PATH = path.join(REPO_ROOT, 'artifacts/private/stage14_7R-cumulative-exposure.json');
const CACHE_RECONCILIATION_PATH = path.join(REPO_ROOT, 'artifacts/private/stage14_7R-cache-reconciliation.json');
const IDENTITY_RECONCILIATION_PATH = path.join(REPO_ROOT, 'artifacts/private/stage14_7R-identity-reconciliation.json');

const PRIOR = Object.freeze({ requests: 5, inputTokens: 97714, outputTokens: 27733, costUsd: 0.472758 });
const REVIEWED_CURRENT = Object.freeze({ requests: 2, inputTokens: 36805, outputTokens: 12469, costUsd: 0.1983 });
const REVIEWED_CUMULATIVE = Object.freeze({ requests: 7, inputTokens: 134519, outputTokens: 40202, costUsd: 0.671058 });

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const round6 = (value) => Number(Number(value).toFixed(6));

function readJson(file) {
  const bytes = fs.readFileSync(file);
  return { value: JSON.parse(bytes.toString('utf8')), sha256: sha256(bytes) };
}

function buildHistoricalSevenDayReconciliation({ liveEvidence = null, consumption = null } = {}) {
  const liveSource = liveEvidence
    ? { value: liveEvidence, sha256: sha256(Buffer.from(JSON.stringify(liveEvidence))) }
    : readJson(LIVE_EVIDENCE_PATH);
  const markerSource = consumption
    ? { value: consumption, sha256: sha256(Buffer.from(JSON.stringify(consumption))) }
    : readJson(CONSUMPTION_PATH);
  const live = liveSource.value;
  const marker = markerSource.value;
  const current = live.ledger?.currentRun || {};
  const cumulative = live.ledger?.cumulative || {};
  const exactReconciliation = ['requests', 'inputTokens', 'outputTokens', 'costUsd'].every(
    (field) => Number(current[field]) === REVIEWED_CURRENT[field]
      && Number(cumulative[field]) === REVIEWED_CUMULATIVE[field]
      && round6(PRIOR[field] + REVIEWED_CURRENT[field]) === REVIEWED_CUMULATIVE[field],
  );

  const conservativeCurrentCostUsd = round6((live.ledger?.entries || []).reduce((sum, row) => {
    const cost = estimateCostUsd({
      model: row.model,
      inputTokens: row.reservedInputTokens,
      outputTokens: row.reservedOutputTokens,
      atDate: live.startedAt,
    });
    return sum + (Number.isFinite(cost) ? cost : 0);
  }, 0));

  const cacheAttempt = (phase) => ({
    phase,
    cacheCreationInputTokens: null,
    cacheReadInputTokens: null,
    evidenceSource: 'historical_not_retained',
    recovered: false,
    inspectedSources: [
      'raw_anthropic_terminal_usage_events', 'wrapped_stream_terminal_metadata',
      'private_provider_attempt_artifacts', 'child_parent_settlement_ipc',
      'sdk_completion_metadata', 'bounded_raw_usage_snapshots',
    ],
  });
  const cacheReconciliation = {
    schemaVersion: 'stage14_7R.1',
    sourceRunId: live.runId,
    scenarioId: live.scenarioId,
    structuredAttempt: cacheAttempt('structured'),
    proseAttempt: cacheAttempt('prose'),
    historicalArtifactRewritten: false,
  };
  const identityReconciliation = {
    schemaVersion: 'stage14_7R.1',
    sourceRunId: live.runId,
    scenarioId: live.scenarioId,
    responseId: null,
    responseVersion: null,
    assistantMessageId: null,
    assistantMessageTimestamp: null,
    identityEvidenceComplete: false,
    evidenceSource: 'historical_not_retained',
    inspectedSources: [
      'revision_1_persistence_payload', 'revision_2_persistence_payload',
      'stored_revision_snapshots', 'restore_response_snapshot',
      'frontend_lifecycle_effects', 'persistence_journal', 'http_request_response_captures',
    ],
    inferenceFromBroadBooleanProhibited: true,
    historicalArtifactRewritten: false,
  };

  return {
    schemaVersion: 'stage14_7R.1',
    scenarioId: live.scenarioId,
    sourceRunId: live.runId,
    historicalDecision: 'STAGE14_7_LIVE_CONFIRMATION_FAILED',
    failureCategory: 'evidence_contract_incomplete',
    consumed: marker.status === 'provider_attempt_settled' && marker.providerAttemptStarted === true,
    providerDispatches: live.dispatchAuthorizations,
    providerRequests: live.providerCorrelation?.providerHttpRequests,
    priorExposure: { ...PRIOR },
    currentRun: { ...REVIEWED_CURRENT },
    cumulativeExposure: { ...REVIEWED_CUMULATIVE },
    exactReconciliation,
    conservativeCapProof: {
      currentRunReservationCostUsd: conservativeCurrentCostUsd,
      cumulativeConservativeCostUsd: round6(PRIOR.costUsd + conservativeCurrentCostUsd),
      cumulativeCostCapUsd: 1.5,
      capUnderstatementRiskBounded: round6(PRIOR.costUsd + conservativeCurrentCostUsd) <= 1.5,
    },
    cacheReconciliation,
    identityReconciliation,
    sourceEvidenceHashes: {
      liveEvidenceSha256: liveSource.sha256,
      consumptionMarkerSha256: markerSource.sha256,
    },
  };
}

function writeHistoricalSevenDayReconciliation() {
  const record = buildHistoricalSevenDayReconciliation();
  fs.mkdirSync(path.dirname(CUMULATIVE_PATH), { recursive: true });
  fs.writeFileSync(CUMULATIVE_PATH, `${JSON.stringify({
    schemaVersion: record.schemaVersion,
    sourceRunId: record.sourceRunId,
    scenarioId: record.scenarioId,
    priorExposure: record.priorExposure,
    currentRun: record.currentRun,
    cumulativeExposure: record.cumulativeExposure,
    exactReconciliation: record.exactReconciliation,
    conservativeCapProof: record.conservativeCapProof,
    sourceEvidenceHashes: record.sourceEvidenceHashes,
  }, null, 2)}\n`);
  fs.writeFileSync(CACHE_RECONCILIATION_PATH, `${JSON.stringify(record.cacheReconciliation, null, 2)}\n`);
  fs.writeFileSync(IDENTITY_RECONCILIATION_PATH, `${JSON.stringify(record.identityReconciliation, null, 2)}\n`);
  return record;
}

module.exports = {
  LIVE_EVIDENCE_PATH, CONSUMPTION_PATH, CUMULATIVE_PATH, CACHE_RECONCILIATION_PATH,
  IDENTITY_RECONCILIATION_PATH, PRIOR, REVIEWED_CURRENT, REVIEWED_CUMULATIVE,
  buildHistoricalSevenDayReconciliation, writeHistoricalSevenDayReconciliation,
};
