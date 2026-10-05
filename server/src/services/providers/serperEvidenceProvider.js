'use strict';

const { buildPublicWebQuery } = require('../webEvidencePolicyService');
const { recordExternalProviderHttpRequest } = require('../../config/providerTestPolicy');
const { classifyWebError, createQueryCache, defaultStageRaw, hash, searchCandidate } = require('./webEvidenceProviderShared');

const TOPICS = new Set(['local_business', 'lodging_strategy']);

function defaultClient() { return { async searchPlaces(parameters, { signal } = {}) {
  const key = process.env.SERPER_API_KEY;
  if (!key) throw Object.assign(new Error('Serper is not configured'), { code: 'serper_not_configured' });
  recordExternalProviderHttpRequest('serper');
  const axios = require('axios');
  const response = await axios.post('https://google.serper.dev/places', { q: parameters.query, num: 5 }, {
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, timeout: 5000, signal,
  });
  return { places: response.data?.places || [], organic: response.data?.organic || [] };
} }; }

function createSerperEvidenceProvider({ serperClient = null, stageRaw = defaultStageRaw, queryCache = null, now = () => new Date() } = {}) {
  const client = () => serperClient || defaultClient(); const cache = queryCache || createQueryCache();
  return {
    id: 'serper', supports: (requirement) => TOPICS.has(requirement?.topic) && Boolean(buildPublicWebQuery(requirement)),
    estimateCost: () => ({ costStatus: 'unknown', costUsd: null, providerAttemptLimit: 1 }),
    buildRequest(requirement) {
      if (!TOPICS.has(requirement?.topic)) throw new TypeError('Unsupported Serper evidence requirement');
      const query = buildPublicWebQuery(requirement); const queryHash = hash(`serper|${requirement.entity.entityId}|${requirement.topic}|${query}`);
      return { provider: 'serper', operation: 'places_search',
        parameters: { entityId: requirement.entity.entityId, topic: requirement.topic, evidenceType: 'recommendation_signal', query, queryHash, requestedDestination: requirement.entity },
        dedupeKey: `serper|places_search|${queryHash}`,
        publicCanonicalRequest: { provider: 'serper', operation: 'places_search', entityId: requirement.entity.entityId, topic: requirement.topic, queryHash } };
    },
    async fetch(request, { signal } = {}) {
      const cached = cache.get(request.parameters.queryHash);
      if (cached) return { raw: cached, metadata: { fetchedAt: now().toISOString(), queryCacheStatus: 'hit' }, completeness: { isComplete: false, topics: [], emptyMeans: 'unknown' }, providerAttempts: 0 };
      const response = await client().searchPlaces(request.parameters, { signal }); const results = [];
      for (const item of [...(response?.places || []), ...(response?.organic || [])].slice(0, 6)) {
        const url = item.link || item.url; if (!url) continue;
        const staged = await stageRaw({ provider: 'serper', operation: 'places_search', sourceUrl: url, payload: item, now: now() });
        results.push({ ...item, url, _rawPayloadHash: staged?.rawPayloadHash || null });
      }
      const raw = { results }; cache.set(request.parameters.queryHash, raw);
      return { raw, metadata: { fetchedAt: now().toISOString(), queryCacheStatus: 'miss' }, completeness: { isComplete: false, topics: [], emptyMeans: 'unknown' }, providerAttempts: 1 };
    },
    normalize(raw, request, metadata) {
      return (raw?.results || []).map((result) => searchCandidate({
        provider: 'serper', sourceClass: 'commercial_structured', result, request, metadata,
        evidenceType: 'recommendation_signal', status: 'listing_only',
        normalizedValue: {
          placeId: result.placeId || null, title: result.title || null, address: result.address || null,
          rating: Number.isFinite(Number(result.rating)) ? Number(result.rating) : null,
          listingExists: true, currentAvailability: null, hotelAvailability: null, flightAvailability: null,
        },
        qualifiers: ['listing_existence_only', 'availability_unknown', 'not_live_inventory'],
      })).filter(Boolean);
    },
    classifyError: (error) => classifyWebError(error, 'serper_not_configured'),
  };
}

module.exports = { createSerperEvidenceProvider };
