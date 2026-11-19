'use strict';

/**
 * Context.dev web search — discovery provider, a drop-in for the Brave and
 * Tavily discovery roles (selected by TRAILIE_WEB_SEARCH_PROVIDER=contextdev).
 *
 * Same contract as those providers: results are `reputable_web` SOURCE
 * DISCOVERY. They never prove a rule or an absence on their own; the official
 * follow (`direct_official_page`) reads the discovered nps.gov / recreation.gov
 * page and the deterministic extractors decide what it says.
 *
 * What it adds over Brave: `includeDomains` restricts official-only topics to
 * the official hosts at the search engine (instead of `site:` operators), and
 * highlight passages give the reviewer bounded page text without a second
 * extract call (the Tavily search+extract pair).
 */

const { buildPublicWebQuery } = require('../webEvidencePolicyService');
const { classifyWebError, createQueryCache, defaultStageRaw, hash, searchCandidate, officialFollowUrl } = require('./webEvidenceProviderShared');
const { searchWeb, NOT_CONFIGURED } = require('../contextDev/contextDevClient');
const { getBraveDiscoveryFreshness } = require('./braveEvidenceProvider');
const { CONTEXT_DEV_SEARCH_TOPICS: TOPICS } = require('../contextDev/contextDevConfig');
const OFFICIAL_ONLY_TOPICS = new Set(['transit', 'parking', 'permits_reservations', 'vehicle_restrictions']);
const OFFICIAL_DOMAINS = Object.freeze(['nps.gov', 'recreation.gov']);
const RESULT_COUNT = 5;
// Passages cost latency (each result page is read). Only the Tavily-role
// topics use them — there they replace Tavily's second `extract` call. For
// Brave-role topics the official follow reads the page anyway.
const PASSAGE_TOPICS = new Set(['overview', 'activities', 'accessibility', 'pet_policy', 'visitor_services']);
const CLAIM_TEXT_LIMIT = 1600;

// Brave freshness codes → Context.dev freshness enum. Same policy: recency is
// only a discovery filter for topics whose page recency IS the signal.
const FRESHNESS = Object.freeze({ pw: 'last_week', pm: 'last_month', py: 'last_year', pd: 'last_24_hours' });

function defaultClient() {
  return { search: (parameters, { signal } = {}) => searchWeb({
    query: parameters.query,
    numResults: parameters.count,
    includeDomains: parameters.includeDomains,
    freshness: parameters.freshness,
    highlights: parameters.highlights === true,
  }, { signal }) };
}

function createContextDevEvidenceProvider({ contextDevClient = null, stageRaw = defaultStageRaw, queryCache = null, now = () => new Date() } = {}) {
  const client = () => contextDevClient || defaultClient();
  const cache = queryCache || createQueryCache();
  return {
    id: 'context_dev',
    supports: (requirement) => TOPICS.has(requirement?.topic) && Boolean(buildPublicWebQuery(requirement)),
    // 1 credit per 10 results + 1 per 10 for highlights. Dollar price per credit
    // depends on plan, so cost stays `unknown` like the other web providers.
    estimateCost: () => ({ costStatus: 'unknown', costUsd: null, providerAttemptLimit: 1 }),
    buildRequest(requirement) {
      if (!TOPICS.has(requirement?.topic)) throw new TypeError('Unsupported Context.dev evidence requirement');
      const query = buildPublicWebQuery(requirement);
      if (!query) throw new TypeError('Context.dev requires a public entity query');
      const officialOnly = OFFICIAL_ONLY_TOPICS.has(requirement.topic);
      const braveFreshness = getBraveDiscoveryFreshness(requirement.topic);
      const freshness = braveFreshness ? FRESHNESS[braveFreshness] || null : null;
      const includeDomains = officialOnly ? [...OFFICIAL_DOMAINS] : null;
      const queryHash = hash(`context_dev|${requirement.entity.entityId}|${requirement.topic}|${query}|freshness=${freshness || 'none'}|domains=${(includeDomains || []).join(',')}|passages=${PASSAGE_TOPICS.has(requirement.topic)}`);
      const parameters = {
        entityId: requirement.entity.entityId, topic: requirement.topic,
        requestedDestination: requirement.entity,
        evidenceType: requirement.evidenceTypes?.[0] || 'fact',
        query, queryHash, count: RESULT_COUNT, highlights: PASSAGE_TOPICS.has(requirement.topic),
        ...(freshness ? { freshness } : {}),
        ...(includeDomains ? { includeDomains } : {}),
      };
      return { provider: 'context_dev', operation: 'search', parameters, dedupeKey: `context_dev|search|${queryHash}`,
        publicCanonicalRequest: { provider: 'context_dev', operation: 'search', entityId: parameters.entityId, topic: parameters.topic, queryHash, count: RESULT_COUNT, ...(freshness ? { freshness } : {}) } };
    },
    async fetch(request, { signal } = {}) {
      const cached = cache.get(request.parameters.queryHash);
      if (cached) return { raw: cached, metadata: { fetchedAt: now().toISOString(), queryCacheStatus: 'hit' }, completeness: { isComplete: false, topics: [], emptyMeans: 'unknown' }, providerAttempts: 0 };
      const response = await client().search(request.parameters, { signal });
      const results = [];
      for (const result of (response?.results || []).slice(0, request.parameters.count)) {
        if (!result?.url) continue;
        // Belt and braces: includeDomains already limits these, but the official
        // follow contract is enforced here too, exactly as for Brave.
        if (OFFICIAL_ONLY_TOPICS.has(request.parameters.topic) && !officialFollowUrl(result.url)) continue;
        if (result.relevance === 'low') continue;
        const passage = (result.highlights || []).join(' … ').replace(/\s+/g, ' ').trim();
        const staged = await stageRaw({ provider: 'context_dev', operation: 'search', sourceUrl: result.url, payload: { title: result.title, snippet: result.description || null, content: passage || null }, now: now() });
        results.push({ ...result, _passage: passage ? passage.slice(0, CLAIM_TEXT_LIMIT) : null, _rawPayloadHash: staged?.rawPayloadHash || null });
      }
      const raw = { results, creditsUsed: response?.creditsUsed ?? null };
      cache.set(request.parameters.queryHash, raw);
      return { raw, metadata: { fetchedAt: now().toISOString(), queryCacheStatus: 'miss' }, completeness: { isComplete: false, topics: [], emptyMeans: 'unknown' }, providerAttempts: 1 };
    },
    normalize(raw, request, metadata) {
      return (raw?.results || []).map((result) => searchCandidate({
        provider: 'context_dev', sourceClass: 'reputable_web', result, request, metadata,
        evidenceType: request.parameters.evidenceType, status: 'search_discovery',
        normalizedValue: { title: result.title || null, url: result.url, snippetAvailable: Boolean(result.description || result._passage), relevance: result.relevance || null },
        claimText: result._passage || null,
        qualifiers: ['search_result_does_not_prove_absence', 'verify_source_page'],
      })).filter(Boolean);
    },
    classifyError: (error) => classifyWebError(error, NOT_CONFIGURED),
  };
}

module.exports = {
  createContextDevEvidenceProvider,
  CONTEXT_DEV_TOPICS: TOPICS,
  CONTEXT_DEV_OFFICIAL_ONLY_TOPICS: OFFICIAL_ONLY_TOPICS,
};
