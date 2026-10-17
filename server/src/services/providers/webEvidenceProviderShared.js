'use strict';

const { createHash } = require('crypto');
const { stageWebRawEvidence } = require('../webRawStagingService');
const { verifyWebDestinationRelevance } = require('../webDestinationRelevance');

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function createQueryCache({ ttlMs = 15 * 60 * 1000, maxEntries = 200, now = () => Date.now() } = {}) {
  const values = new Map();
  return {
    get(key) {
      const entry = values.get(key);
      if (!entry || now() - entry.createdAt > ttlMs) {
        if (entry) values.delete(key);
        return undefined;
      }
      values.delete(key); values.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      values.delete(key); values.set(key, { createdAt: now(), value });
      while (values.size > maxEntries) values.delete(values.keys().next().value);
    },
  };
}

function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch { return null; }
}

const OFFICIAL_POLICY_HOSTS = Object.freeze(new Set([
  'nps.gov', 'www.nps.gov', 'weather.gov', 'www.weather.gov',
  'airnow.gov', 'www.airnow.gov', 'inciweb.wildfire.gov',
]));
const OFFICIAL_RESERVATION_HOSTS = Object.freeze(new Set([
  'recreation.gov', 'www.recreation.gov',
]));

const VERIFIED_RELATIONSHIP_CLASSES = new Set(['official_state_park', 'official_transit', 'official_concessionaire', 'official_operator']);

function officialHostKind(hostname, relationship = null) {
  const host = String(hostname || '').toLowerCase();
  if (OFFICIAL_POLICY_HOSTS.has(host) || host.endsWith('.nps.gov')) return 'park_policy';
  if (OFFICIAL_RESERVATION_HOSTS.has(host) || host.endsWith('.recreation.gov')) return 'reservation_mechanism';
  if (relationship?.verified === true
    && VERIFIED_RELATIONSHIP_CLASSES.has(relationship.sourceClass)
    && String(relationship.hostname || '').toLowerCase() === host) return relationship.sourceClass;
  return null;
}

function officialFollowUrl(value, relationship = null) {
  const url = validHttpUrl(value);
  if (!url || url.protocol !== 'https:' || url.username || url.password) return null;
  return officialHostKind(url.hostname, relationship) ? url : null;
}

function pickOfficialFollowCandidate(candidates = []) {
  const accepted = candidates.map((item) => {
    const officialRelationship = item?.source?.officialRelationship || null;
    const url = officialFollowUrl(item?.source?.url, officialRelationship);
    return url ? { url, officialRelationship } : null;
  }).filter(Boolean);
  const selected = accepted.find((item) => /(?:^|\.)nps\.gov$/i.test(item.url.hostname))
    || accepted.find((item) => /(?:^|\.)recreation\.gov$/i.test(item.url.hostname))
    || accepted[0];
  return selected ? { sourceUrl: selected.url.toString(), officialRelationship: selected.officialRelationship } : null;
}

function pickOfficialFollowUrl(candidates = []) {
  return pickOfficialFollowCandidate(candidates)?.sourceUrl || null;
}

/**
 * P0-5 — bounded MULTI-page follow. Discovery ranking cannot know which
 * official page states a specific rule (Glacier's top result for vehicle
 * restrictions is the entry-reservation page; the size limit lives on
 * directions/gtsrinfo). For topics that need a parsed rule, follow up to
 * `limit` distinct official pages and let the deterministic extractor decide
 * which page actually carries it. nps.gov first, then recreation.gov, then
 * the rest — same ordering as the single picker.
 */
function pickOfficialFollowCandidates(candidates = [], limit = 3) {
  const accepted = candidates.map((item) => {
    const officialRelationship = item?.source?.officialRelationship || null;
    const url = officialFollowUrl(item?.source?.url, officialRelationship);
    return url ? { url, officialRelationship } : null;
  }).filter(Boolean);
  const ranked = [
    ...accepted.filter((item) => /(?:^|\.)nps\.gov$/i.test(item.url.hostname)),
    ...accepted.filter((item) => /(?:^|\.)recreation\.gov$/i.test(item.url.hostname)),
    ...accepted,
  ];
  const seen = new Set();
  const picked = [];
  for (const item of ranked) {
    const key = item.url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push({ sourceUrl: key, officialRelationship: item.officialRelationship });
    if (picked.length >= limit) break;
  }
  return picked;
}

function searchCandidate({ provider, sourceClass, result, request, metadata, evidenceType, status, normalizedValue, qualifiers, claimText = null }) {
  const url = validHttpUrl(result.url || result.link);
  if (!url) return null;
  const observedAt = metadata.fetchedAt;
  const relevance = verifyWebDestinationRelevance({
    requested: request.parameters.requestedDestination || { entityId: request.parameters.entityId },
    url: url.toString(), title: result.title, text: `${result.description || result.snippet || result.content || ''} ${claimText || ''}`,
    coordinates: result.coordinates || null,
  });
  return {
    entityId: request.parameters.entityId,
    topic: request.parameters.topic,
    evidenceType,
    claim: {
      identity: `${provider}-discovery:${hash(url.toString())}`,
      text: relevance.accepted && claimText ? String(claimText).slice(0, 1600) : null,
      normalizedValue,
      unit: null, status,
      subjectId: request.parameters.entityId, objectId: url.toString(), qualifiers,
      polarity: 'positive',
    },
    scope: {
      geographicEntityIds: [request.parameters.entityId], validFrom: null, validThrough: null,
      audience: 'public', locale: 'en-US',
    },
    source: {
      provider, sourceClass, sourceId: result.placeId || hash(url.toString()), url: url.toString(),
      title: result.title || null, publishedAt: null, sourceUpdatedAt: null,
    },
    observedAt,
    quality: { authorityClass: sourceClass, scopeMatch: relevance.scopeMatch, relationshipConfidence: relevance.relationshipConfidence, conflictStatus: 'none' },
    provenance: {
      extractionMethod: 'search_result_discovery', extractorVersion: 'web-evidence-v1',
      rawPayloadHash: result._rawPayloadHash || null,
    },
    retention: {
      class: 'public_dynamic_30d', licenseClass: claimText ? 'bounded_extracted_web_text' : 'search_metadata_only', storeClaimText: Boolean(relevance.accepted && claimText),
      deleteAfter: new Date(new Date(observedAt).getTime() + 30 * 86400000),
    },
  };
}

function defaultStageRaw(args) { return stageWebRawEvidence(args); }

function classifyWebError(error, notConfiguredCode) {
  const status = error?.response?.status;
  if (error?.code === notConfiguredCode || status === 401 || status === 403) return { code: 'provider_not_configured', retryable: false };
  if (status === 429) return { code: 'provider_rate_limited', retryable: false };
  if (error?.code === 'ABORT_ERR' || error?.code === 'ERR_CANCELED') return { code: 'provider_cancelled', retryable: false };
  if (['ETIMEDOUT', 'ECONNABORTED'].includes(error?.code)) return { code: 'provider_timeout', retryable: true };
  return { code: 'provider_unavailable', retryable: status >= 500 || !status };
}

module.exports = {
  classifyWebError, createQueryCache, defaultStageRaw, hash, searchCandidate, validHttpUrl,
  officialFollowUrl, officialHostKind, pickOfficialFollowCandidate, pickOfficialFollowCandidates, pickOfficialFollowUrl,
  OFFICIAL_POLICY_HOSTS, OFFICIAL_RESERVATION_HOSTS,
};
