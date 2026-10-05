'use strict';

const { createHash } = require('crypto');

const compactText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const normalizeId = (value) => compactText(value).toLowerCase();
const normalizeDate = (value) => {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid evidence scope date: ${value}`);
  return date.toISOString();
};

function stableValue(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
    );
  }
  return typeof value === 'string' ? compactText(value) : value;
}

const digest = (value) => createHash('sha256')
  .update(JSON.stringify(stableValue(value)))
  .digest('hex');

function normalizedRoute(route) {
  if (!route || typeof route !== 'object') return null;
  return {
    originEntityId: normalizeId(route.originEntityId),
    destinationEntityId: normalizeId(route.destinationEntityId),
    travelMode: normalizeId(route.travelMode),
    departureTimeBucket: normalizeDate(route.departureTimeBucket),
  };
}

function normalizedScope(scope = {}) {
  const route = normalizedRoute(scope.route);
  return {
    geographicEntityIds: [...new Set((scope.geographicEntityIds || []).map(normalizeId))].sort(),
    validFrom: normalizeDate(scope.validFrom),
    validThrough: normalizeDate(scope.validThrough),
    audience: normalizeId(scope.audience || 'public'),
    locale: normalizeId(scope.locale || 'en-US'),
    // Include route so distinct inbound legs to the same destination do not collide.
    ...(route ? { route } : {}),
  };
}

function buildEvidenceKeys(item = {}) {
  const entityId = normalizeId(item.entityId);
  const topic = normalizeId(item.topic);
  const provider = normalizeId(item.source?.provider);
  const sourceId = normalizeId(item.source?.sourceId || item.source?.url);
  const claimIdentity = normalizeId(
    item.claim?.identity || item.claim?.subjectId || item.claim?.objectId
  );

  if (!entityId || !topic || !provider || !sourceId || !claimIdentity) {
    throw new TypeError(
      'Evidence keys require entityId, topic, source.provider, source identity, and claim identity'
    );
  }

  const scopeHash = digest(normalizedScope(item.scope));
  const logicalParts = {
    entityId,
    topic,
    scopeHash,
    source: { provider, sourceId },
    claim: {
      identity: claimIdentity,
      evidenceType: normalizeId(item.evidenceType),
    },
  };
  const logicalHash = digest(logicalParts);
  const contentIdentity = {
    text: compactText(item.claim?.text).toLowerCase(),
    normalizedValue: stableValue(item.claim?.normalizedValue),
    unit: normalizeId(item.claim?.unit),
    status: normalizeId(item.claim?.status),
    subjectId: normalizeId(item.claim?.subjectId),
    objectId: normalizeId(item.claim?.objectId),
    qualifiers: stableValue(item.claim?.qualifiers || []),
  };
  if (item.claim?.polarity === 'negative') contentIdentity.polarity = 'negative';
  if (item.absenceProof) contentIdentity.absenceProof = stableValue(item.absenceProof);
  const contentHash = digest(contentIdentity);
  const canonicalHash = digest({ logicalHash, contentHash });

  return {
    logicalKey: `lek:${logicalHash}`,
    canonicalKey: `evk:${canonicalHash}`,
    evidenceId: `ev:${canonicalHash}`,
    scopeHash,
    contentHash,
  };
}

module.exports = {
  buildEvidenceKeys,
  normalizedScope,
};
