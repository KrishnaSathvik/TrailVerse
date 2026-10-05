'use strict';

const { buildPublicWebQuery } = require('../webEvidencePolicyService');
const { recordExternalProviderHttpRequest } = require('../../config/providerTestPolicy');
const { classifyWebError, createQueryCache, defaultStageRaw, hash, searchCandidate, officialFollowUrl } = require('./webEvidenceProviderShared');

const TOPICS = new Set([
  'alerts_closures', 'roads', 'trail_conditions', 'wildfire_smoke', 'events',
  'transit', 'parking', 'permits_reservations', 'vehicle_restrictions',
]);
const OFFICIAL_ONLY_TOPICS = new Set(['transit', 'parking', 'permits_reservations', 'vehicle_restrictions']);

/**
 * SEARCH DISCOVERY RECENCY is not EVIDENCE CLAIM FRESHNESS.
 *
 * Every Brave request used to carry `freshness: 'pw'`, which restricts results
 * to pages EDITED in the past week. Canonical official pages — a park's parking,
 * shuttle, road-status or permit page — carry today's operational rules at a URL
 * that may not have been touched in months, so they were filtered out and the
 * engine returned whichever unrelated NPS pages happened to change that week.
 * Destination ownership then (correctly) rejected all of them, and a
 * decision-critical requirement resolved to `missing`.
 *
 * Discovery's job is to FIND the canonical official source. Whether the claim on
 * that source is current enough is decided later, after the official follow, by
 * the requirement's own freshness policy — not by a search parameter.
 *
 * null = no recency filter (find the canonical page, however old the URL is).
 * Every topic in TOPICS must appear here, asserted by contract test.
 */
const DISCOVERY_FRESHNESS_BY_TOPIC = Object.freeze({
  // Recency-sensitive: the page's own recency IS the signal being discovered.
  alerts_closures: 'pw',
  wildfire_smoke: 'pw',
  events: 'pm',
  // Stable-canonical: the official page is the target; its edit date is noise.
  parking: null,
  transit: null,
  roads: null,
  permits_reservations: null,
  trail_conditions: null,
  // P0-5 — stable park policy page (vehicle size limits); edit date is noise.
  vehicle_restrictions: null,
});

function getBraveDiscoveryFreshness(topic) {
  return Object.prototype.hasOwnProperty.call(DISCOVERY_FRESHNESS_BY_TOPIC, topic)
    ? DISCOVERY_FRESHNESS_BY_TOPIC[topic]
    : null;
}

function defaultClient() {
  return { async search(parameters, { signal } = {}) {
    const key = process.env.BRAVE_SEARCH_API_KEY;
    if (!key) throw Object.assign(new Error('Brave is not configured'), { code: 'brave_not_configured' });
    recordExternalProviderHttpRequest('brave');
    const axios = require('axios');
    // `freshness` is omitted entirely rather than sent as undefined — the two are
    // not equivalent to every HTTP client, and an unfiltered search is the point.
    const params = { q: parameters.query, count: parameters.count };
    if (parameters.freshness) params.freshness = parameters.freshness;
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      headers: { 'X-Subscription-Token': key, Accept: 'application/json' },
      params, timeout: 5000, signal,
    });
    return { results: response.data?.web?.results || [] };
  } };
}

function createBraveEvidenceProvider({ braveClient = null, stageRaw = defaultStageRaw, queryCache = null, now = () => new Date() } = {}) {
  const client = () => braveClient || defaultClient();
  const cache = queryCache || createQueryCache();
  return {
    id: 'brave', supports: (requirement) => TOPICS.has(requirement?.topic) && Boolean(buildPublicWebQuery(requirement)),
    estimateCost: () => ({ costStatus: 'unknown', costUsd: null, providerAttemptLimit: 2 }),
    buildRequest(requirement) {
      if (!TOPICS.has(requirement?.topic)) throw new TypeError('Unsupported Brave evidence requirement');
      const baseQuery = buildPublicWebQuery(requirement); if (!baseQuery) throw new TypeError('Brave requires a public entity query');
      const query = OFFICIAL_ONLY_TOPICS.has(requirement.topic)
        ? `${baseQuery} (site:nps.gov OR site:recreation.gov)`
        : baseQuery;
      const freshness = getBraveDiscoveryFreshness(requirement.topic);
      // Freshness is part of request IDENTITY: a cached `pw` result answers a
      // different question than an unfiltered one, and reusing it across the two
      // would silently reintroduce the defect this policy removes.
      const queryHash = hash(`brave|${requirement.entity.entityId}|${requirement.topic}|${query}|freshness=${freshness || 'none'}`);
      const parameters = {
        entityId: requirement.entity.entityId, topic: requirement.topic,
        requestedDestination: requirement.entity,
        evidenceType: requirement.evidenceTypes?.[0] || 'fact', query, queryHash,
        count: 5, ...(freshness ? { freshness } : {}),
      };
      return { provider: 'brave', operation: 'search', parameters, dedupeKey: `brave|search|${queryHash}`,
        publicCanonicalRequest: { provider: 'brave', operation: 'search', entityId: parameters.entityId, topic: parameters.topic, queryHash, count: 5, ...(freshness ? { freshness } : {}) } };
    },
    async fetch(request, { signal } = {}) {
      const cached = cache.get(request.parameters.queryHash);
      if (cached) return { raw: cached, metadata: { fetchedAt: now().toISOString(), queryCacheStatus: 'hit' }, completeness: { isComplete: false, topics: [], emptyMeans: 'unknown' }, providerAttempts: 0 };
      const response = await client().search(request.parameters, { signal });
      const results = [];
      for (const result of (response?.results || []).slice(0, request.parameters.count)) {
        if (!result?.url) continue;
        if (OFFICIAL_ONLY_TOPICS.has(request.parameters.topic) && !officialFollowUrl(result.url)) continue;
        const staged = await stageRaw({ provider: 'brave', operation: 'search', sourceUrl: result.url, payload: { title: result.title, snippet: result.description || result.snippet || null }, now: now() });
        results.push({ ...result, _rawPayloadHash: staged?.rawPayloadHash || null });
      }
      const raw = { results }; cache.set(request.parameters.queryHash, raw);
      return { raw, metadata: { fetchedAt: now().toISOString(), queryCacheStatus: 'miss' }, completeness: { isComplete: false, topics: [], emptyMeans: 'unknown' }, providerAttempts: 1 };
    },
    normalize(raw, request, metadata) {
      return (raw?.results || []).map((result) => searchCandidate({
        provider: 'brave', sourceClass: 'reputable_web', result, request, metadata,
        evidenceType: request.parameters.evidenceType, status: 'search_discovery',
        normalizedValue: { title: result.title || null, url: result.url, snippetAvailable: Boolean(result.description || result.snippet) },
        qualifiers: ['search_result_does_not_prove_absence', 'verify_source_page'],
      })).filter(Boolean);
    },
    classifyError: (error) => classifyWebError(error, 'brave_not_configured'),
  };
}

module.exports = {
  createBraveEvidenceProvider,
  getBraveDiscoveryFreshness,
  DISCOVERY_FRESHNESS_BY_TOPIC,
  BRAVE_TOPICS: TOPICS,
};
