'use strict';

const SCHEMA_VERSION = 'trailie-evidence-bundle-v1';
const BROKER_VERSION = 'evidence-broker-v1.0.0';
const STATUS_SUMMARY_KEYS = Object.freeze({
  satisfied_fresh: 'satisfiedFresh',
  satisfied_stale_safe: 'satisfiedStaleSafe',
  satisfied_partial: 'satisfiedPartial',
  missing: 'missing',
  conflicted: 'conflicted',
  unsupported: 'unsupported',
  cancelled: 'cancelled',
});

function plainValue(value, seen = new WeakSet()) {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (value instanceof Map) return plainValue(Object.fromEntries(value), seen);
  if (value instanceof Set) return plainValue([...value], seen);
  if (Array.isArray(value)) return value.map((item) => plainValue(item, seen));
  if (typeof value === 'function') return undefined;
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) throw new TypeError('bundle_circular_value');
  seen.add(value);
  const source = typeof value.toObject === 'function'
    ? value.toObject({ depopulate: true, flattenMaps: true })
    : value;
  const output = {};
  for (const [key, item] of Object.entries(source)) {
    const normalized = plainValue(item, seen);
    if (normalized !== undefined) output[key] = normalized;
  }
  seen.delete(value);
  return output;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function buildEvidenceBundle({ requestId, createdAt = new Date(), resolutions = [], candidates = [] } = {}) {
  if (!requestId || !Array.isArray(resolutions) || !Array.isArray(candidates)) {
    throw new TypeError('EvidenceBundle requires requestId, resolutions, and candidates');
  }
  const normalizedResolutions = resolutions.map((resolution) => {
    const { selectedEvidence: _selectedEvidence, ...retained } = resolution || {};
    return plainValue({ ...retained, evidenceIds: [...new Set(retained.evidenceIds || [])].sort() });
  });
  const referencedIds = new Set(normalizedResolutions.flatMap((item) => item.evidenceIds || []));
  const candidateById = new Map();
  for (const candidate of candidates) {
    const normalized = plainValue(candidate);
    if (!normalized?.evidenceId) continue;
    if (candidateById.has(normalized.evidenceId)) throw new Error('bundle_duplicate_evidence_id');
    candidateById.set(normalized.evidenceId, normalized);
  }
  for (const evidenceId of referencedIds) {
    if (!candidateById.has(evidenceId)) throw new Error('bundle_dangling_evidence_id');
  }
  const evidence = [...referencedIds].sort().map((evidenceId) => candidateById.get(evidenceId));
  const summary = {
    requirementCount: normalizedResolutions.length,
    satisfiedFresh: 0,
    satisfiedStaleSafe: 0,
    satisfiedPartial: 0,
    missing: 0,
    conflicted: 0,
    unsupported: 0,
    cancelled: 0,
  };
  for (const resolution of normalizedResolutions) {
    const key = STATUS_SUMMARY_KEYS[resolution.status];
    if (!key) throw new TypeError(`bundle_status_invalid:${resolution.status}`);
    summary[key] += 1;
  }
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) throw new TypeError('bundle_created_at_invalid');
  return deepFreeze({
    schemaVersion: SCHEMA_VERSION,
    brokerVersion: BROKER_VERSION,
    requestId: String(requestId),
    createdAt: created.toISOString(),
    resolutions: normalizedResolutions,
    evidence,
    summary,
  });
}

module.exports = {
  BROKER_VERSION,
  SCHEMA_VERSION,
  buildEvidenceBundle,
  deepFreeze,
  plainValue,
};
