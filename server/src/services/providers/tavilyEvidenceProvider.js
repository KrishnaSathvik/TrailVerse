'use strict';

const { buildPublicWebQuery } = require('../webEvidencePolicyService');
const { recordExternalProviderHttpRequest } = require('../../config/providerTestPolicy');
const { classifyWebError, createQueryCache, defaultStageRaw, hash, searchCandidate } = require('./webEvidenceProviderShared');

const { resourceQuery, verifiedResourcePage, selectResourceUrls } = require('../../utils/travelResourceLinks');

const TOPICS = new Set(['overview', 'activities', 'accessibility', 'pet_policy', 'visitor_services']);
const SUFFICIENT_SNIPPET_LENGTH = 160;

function defaultClient() { return {
  async search(parameters, { signal } = {}) {
    const key = process.env.TAVILY_API_KEY;
    if (!key) throw Object.assign(new Error('Tavily is not configured'), { code: 'tavily_not_configured' });
    recordExternalProviderHttpRequest('tavily'); const axios = require('axios');
    const response = await axios.post('https://api.tavily.com/search', {
      api_key: key, query: parameters.query, max_results: 5, search_depth: 'basic', include_answer: false,
    }, { timeout: 7000, signal });
    return { results: response.data?.results || [] };
  },
  async extract(urls, { signal } = {}) {
    const key = process.env.TAVILY_API_KEY;
    if (!key) throw Object.assign(new Error('Tavily is not configured'), { code: 'tavily_not_configured' });
    recordExternalProviderHttpRequest('tavily'); const axios = require('axios');
    const response = await axios.post('https://api.tavily.com/extract', { api_key: key, urls }, { timeout: 7000, signal });
    return { results: response.data?.results || [] };
  },
}; }

function createTavilyEvidenceProvider({ tavilyClient = null, stageRaw = defaultStageRaw, queryCache = null, now = () => new Date() } = {}) {
  const client = () => tavilyClient || defaultClient(); const cache = queryCache || createQueryCache();
  return {
    id: 'tavily', supports: (requirement) => (TOPICS.has(requirement?.topic) && Boolean(buildPublicWebQuery(requirement))) || (requirement?.topic === 'local_business' && Boolean(resourceQuery(requirement.webScope?.resource))),
    estimateCost: () => ({ costStatus: 'unknown', costUsd: null, providerAttemptLimit: 2 }),
    buildRequest(requirement) {
      const resource = requirement.webScope?.resource || null;
      if (!TOPICS.has(requirement?.topic) && !(requirement?.topic === 'local_business' && resourceQuery(resource))) throw new TypeError('Unsupported Tavily evidence requirement');
      const query = resource ? resourceQuery(resource) : buildPublicWebQuery(requirement); const queryHash = hash(`tavily|${requirement.entity.entityId}|${requirement.topic}|${query}${resource ? `|${JSON.stringify(resource)}` : ''}`);
      return { provider: 'tavily', operation: 'search',
        parameters: { entityId: requirement.entity.entityId, topic: requirement.topic, evidenceType: requirement.evidenceTypes?.[0] || 'fact', query, queryHash, requestedDestination: requirement.entity, resource },
        dedupeKey: `tavily|search|${queryHash}`,
        publicCanonicalRequest: { provider: 'tavily', operation: 'search', entityId: requirement.entity.entityId, topic: requirement.topic, queryHash, depth: 'basic' } };
    },
    async fetch(request, { signal } = {}) {
      const cached = cache.get(request.parameters.queryHash);
      if (cached) return { raw: cached, metadata: { fetchedAt: now().toISOString(), queryCacheStatus: 'hit' }, completeness: { isComplete: false, topics: [], emptyMeans: 'unknown' }, providerAttempts: 0 };
      const response = await client().search(request.parameters, { signal });
      let results = (response?.results || []).slice(0, 5); let attempts = 1;
      for (const result of results) {
        if (result.url) await stageRaw({ provider: 'tavily', operation: 'search', sourceUrl: result.url, payload: { title: result.title, snippet: result.content || null }, now: now() });
      }
      const sufficient = results.some((result) => String(result.content || '').length >= SUFFICIENT_SNIPPET_LENGTH);
      if ((request.parameters.resource || !sufficient) && results.length > 0) {
        const urls = request.parameters.resource ? selectResourceUrls(results, request.parameters.resource)
          : [...new Set(results.map(result => result.url).filter(Boolean))].slice(0, 2);
        if (urls.length) {
          const extracted = await client().extract(urls, { signal }); attempts += 1;
          const byUrl = new Map((extracted?.results || []).map((item) => [item.url, item]));
          results = await Promise.all(results.map(async (result) => {
            const page = byUrl.get(result.url); if (!page) return result;
            const staged = await stageRaw({ provider: 'tavily', operation: 'extract', sourceUrl: result.url, payload: { content: page.raw_content || page.rawContent || page.content || null }, now: now() });
            return { ...result, extracted: true, _extractedText: String(page.raw_content || page.rawContent || page.content || '').replace(/\s+/g, ' ').trim().slice(0, request.parameters.resource ? 12000 : 1600), _rawPayloadHash: staged?.rawPayloadHash || null };
          }));
        }
      }
      const raw = { results }; cache.set(request.parameters.queryHash, raw);
      return { raw, metadata: { fetchedAt: now().toISOString(), queryCacheStatus: 'miss' }, completeness: { isComplete: false, topics: [], emptyMeans: 'unknown' }, providerAttempts: attempts };
    },
    normalize(raw, request, metadata) {
      if (request.parameters.resource) return (raw?.results || []).flatMap(result => {
        const resourceLink = verifiedResourcePage(result, request.parameters.resource);
        if (!resourceLink) return [];
        const row = searchCandidate({ provider: 'tavily', sourceClass: 'reputable_web', result, request, metadata,
          evidenceType: 'fact', status: 'verified_resource_link', normalizedValue: resourceLink,
          qualifiers: ['exact_resource_page', 'listing_existence_only', 'availability_unknown', 'not_live_inventory'] });
        return row ? [row] : [];
      });
      return (raw?.results || []).map((result) => searchCandidate({
        provider: 'tavily', sourceClass: 'reputable_web', result, request, metadata,
        evidenceType: request.parameters.evidenceType, status: 'source_discovery',
        normalizedValue: { title: result.title || null, url: result.url, extractedForInspection: result.extracted === true },
        claimText: result._extractedText || null,
        qualifiers: ['source_discovery_only', 'search_result_does_not_prove_absence', 'verify_source_page'],
      })).filter(Boolean);
    },
    classifyError: (error) => classifyWebError(error, 'tavily_not_configured'),
  };
}

module.exports = { createTavilyEvidenceProvider };
