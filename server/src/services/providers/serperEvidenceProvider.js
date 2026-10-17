'use strict';

const { buildPublicWebQuery } = require('../webEvidencePolicyService');
const { recordExternalProviderHttpRequest } = require('../../config/providerTestPolicy');
const { classifyWebError, createQueryCache, defaultStageRaw, hash, searchCandidate } = require('./webEvidenceProviderShared');

const { resourceUrl, normalized } = require('../../utils/travelResourceLinks');

const TOPICS = new Set(['local_business', 'lodging_strategy']);

// A structured place identity is useful discovery even when it has no website.
// No URL is synthesized from placeId/cid; discovery is never booking inventory.
function lodgingCandidate(item, request, metadata) {
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  const address = typeof item.address === 'string' ? item.address.trim() : '';
  const destination = normalized(request.parameters.requestedDestination?.displayName);
  if (!title || !address) return { reason: 'identity_missing' };
  if (!destination || !` ${normalized(address)} `.includes(` ${destination} `)) return { reason: 'destination_mismatch' };
  const supplied = [item.website, item.link, item.url].filter(Boolean);
  const url = supplied.map(resourceUrl).find(Boolean) || null;
  const id = String(item.placeId || item.cid || hash(`${title}|${address}`));
  return { reason: null, urlState: url ? 'valid_url' : supplied.length ? 'unsupported_url' : 'missing_url', candidate: {
    entityId: request.parameters.entityId, topic: request.parameters.topic, evidenceType: 'recommendation_signal',
    claim: { identity: `serper-place:${id}`, text: null, status: 'listing_only',
      normalizedValue: { placeId: item.placeId || null, cid: item.cid || null, title, address, listingUrl: url, reservationUrl: null,
        listingExists: true, currentAvailability: null, hotelAvailability: null, flightAvailability: null, price: null,
        linkStatus: url ? 'provider_returned_listing' : 'unresolved' },
      unit: null, subjectId: request.parameters.entityId, objectId: `serper:place:${id}`,
      qualifiers: ['listing_existence_only', 'availability_unknown', 'not_live_inventory', ...(url ? [] : ['resource_link_unverified'])] },
    scope: { geographicEntityIds: [request.parameters.entityId], validFrom: null, validThrough: null, audience: 'public', locale: 'en-US' },
    source: { provider: 'serper', sourceClass: 'commercial_structured', sourceId: id, url,
      title, publishedAt: null, sourceUpdatedAt: null },
    observedAt: metadata.fetchedAt,
    quality: { authorityClass: 'commercial_structured', scopeMatch: 'exact', conflictStatus: 'none' },
    provenance: { extractionMethod: 'structured_adapter', extractorVersion: 'serper-lodging-v2', rawPayloadHash: item._rawPayloadHash || null },
  } };
}

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
      if (cached) return { raw: cached, metadata: { fetchedAt: now().toISOString(), queryCacheStatus: 'hit', discoveryDiagnostics: cached.diagnostics }, completeness: { isComplete: false, topics: [], emptyMeans: 'unknown' }, providerAttempts: 0 };
      const response = await client().searchPlaces(request.parameters, { signal }); const results = [];
      const upstream = [...(response?.places || []), ...(response?.organic || [])];
      const diagnostics = { upstreamCount: upstream.length, consideredCount: Math.min(upstream.length, 6), retainedCount: 0,
        missingUrlCount: 0, unsupportedUrlCount: 0, identityMissingCount: 0, destinationMismatchCount: 0, truncatedCount: Math.max(0, upstream.length - 6) };
      for (const item of upstream.slice(0, 6)) {
        let url = item.website || item.link || item.url;
        if (request.parameters.topic === 'lodging_strategy') {
          const checked = lodgingCandidate(item, request, { fetchedAt: now().toISOString() });
          if (checked.reason) { diagnostics[checked.reason === 'identity_missing' ? 'identityMissingCount' : 'destinationMismatchCount']++; continue; }
          url = checked.candidate.source.url;
          if (checked.urlState === 'missing_url') diagnostics.missingUrlCount++;
          if (checked.urlState === 'unsupported_url') diagnostics.unsupportedUrlCount++;
          if (!url) { results.push({ ...item, url: null }); continue; }
        } else if (!url) continue;
        const staged = await stageRaw({ provider: 'serper', operation: 'places_search', sourceUrl: url, payload: item, now: now() });
        results.push({ ...item, url, _rawPayloadHash: staged?.rawPayloadHash || null });
      }
      diagnostics.retainedCount = results.length;
      const raw = { results, diagnostics }; cache.set(request.parameters.queryHash, raw);
      return { raw, metadata: { fetchedAt: now().toISOString(), queryCacheStatus: 'miss', discoveryDiagnostics: diagnostics }, completeness: { isComplete: false, topics: [], emptyMeans: 'unknown' }, providerAttempts: 1 };
    },
    normalize(raw, request, metadata) {
      if (request.parameters.topic === 'lodging_strategy') return (raw?.results || []).map(item => lodgingCandidate(item, request, metadata).candidate).filter(Boolean);
      return (raw?.results || []).map((result) => searchCandidate({
        provider: 'serper', sourceClass: 'commercial_structured', result, request, metadata,
        evidenceType: 'recommendation_signal', status: 'listing_only',
        normalizedValue: {
          placeId: result.placeId || null, title: result.title || null, address: result.address || null,
          rating: Number.isFinite(Number(result.rating)) ? Number(result.rating) : null,
          listingUrl: result.url || result.link || null, reservationUrl: null,
          listingExists: true, currentAvailability: null, hotelAvailability: null, flightAvailability: null,
        },
        qualifiers: ['listing_existence_only', 'availability_unknown', 'not_live_inventory'],
      })).filter(row => row && row.quality.scopeMatch === 'exact');
    },
    classifyError: (error) => classifyWebError(error, 'serper_not_configured'),
  };
}

module.exports = { createSerperEvidenceProvider };
