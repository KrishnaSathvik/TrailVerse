'use strict';

/** Stage 14.7R — one declarative inventory for aggregate evidence. */
const REQUIRED_EVIDENCE_MANIFEST = Object.freeze({
  manifestVersion: 'stage14_7R.1',
  providerAttemptFields: Object.freeze([
    'scenarioId', 'phase', 'attemptNumber', 'provider', 'model', 'reservationId',
    'dispatchAuthorizationId', 'ledgerAttemptId', 'providerRequestId',
    'reservedInputTokens', 'reservedOutputTokens', 'actualInputTokens', 'actualOutputTokens',
    'cacheCreationInputTokens', 'cacheReadInputTokens', 'estimatedCostUsd',
    'settlementStatus', 'outcome', 'usageSource', 'cacheUsageEvidence',
  ]),
  identityComponents: Object.freeze([
    'responseIdentityStable', 'numericMessageIdStable', 'messageTimestampStable',
    'assistantSlotStable', 'identityEvidenceComplete',
  ]),
  requiredIdentitySources: Object.freeze([
    'revision_1_persistence_payload', 'stored_revision_1_trip',
    'revision_2_persistence_payload', 'stored_revision_2_trip',
    'authenticated_restore', 'frontend_selected_restored_state',
  ]),
});

function present(value) {
  return value !== undefined && value !== null && value !== '';
}

function evaluateRequiredEvidence({ sevenDay = null } = {}) {
  const failures = [];
  const rows = sevenDay?.ledger?.entries;
  if (!Array.isArray(rows) || rows.length === 0) failures.push('provider_attempt_rows_missing');
  else rows.forEach((row, index) => {
    for (const field of REQUIRED_EVIDENCE_MANIFEST.providerAttemptFields) {
      if (!present(row?.[field])) failures.push(`provider_attempt_${index}_${field}_missing`);
    }
  });

  const identity = sevenDay?.identityEvidence;
  if (!identity || typeof identity !== 'object') failures.push('identity_component_evidence_missing');
  else {
    for (const component of REQUIRED_EVIDENCE_MANIFEST.identityComponents) {
      if (identity[component] !== true) failures.push(`${component}_not_proven`);
    }
    const sources = new Set((identity.snapshots || []).map((snapshot) => snapshot.source));
    for (const source of REQUIRED_EVIDENCE_MANIFEST.requiredIdentitySources) {
      if (!sources.has(source)) failures.push(`identity_source_missing:${source}`);
    }
  }

  return {
    passed: failures.length === 0,
    evidenceContractPassed: failures.length === 0,
    failures: [...new Set(failures)],
    manifestVersion: REQUIRED_EVIDENCE_MANIFEST.manifestVersion,
  };
}

module.exports = { REQUIRED_EVIDENCE_MANIFEST, evaluateRequiredEvidence };
