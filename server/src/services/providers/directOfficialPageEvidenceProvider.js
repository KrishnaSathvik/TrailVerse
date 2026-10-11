'use strict';

const { recordExternalProviderHttpRequest } = require('../../config/providerTestPolicy');
const { classifyWebError, defaultStageRaw, hash, officialFollowUrl, officialHostKind } = require('./webEvidenceProviderShared');
const { verifyWebDestinationRelevance } = require('../webDestinationRelevance');
const { officialPageOperationalFacts } = require('../../utils/operationalFactExtraction');
const { officialPageParkRules } = require('../../utils/parkWideAccess');

const OFFICIAL_DOMAINS = Object.freeze(new Set([
  'nps.gov', 'www.nps.gov', 'weather.gov', 'www.weather.gov',
  'airnow.gov', 'www.airnow.gov', 'inciweb.wildfire.gov',
  'recreation.gov', 'www.recreation.gov',
]));

function officialUrl(value, relationship = null) {
  return officialFollowUrl(value, relationship);
}

function defaultClient() { return { async fetchPage(url, { signal } = {}) {
  recordExternalProviderHttpRequest('direct_official_page'); const axios = require('axios');
  const response = await axios.get(url, { timeout: 7000, signal, maxContentLength: 512000, responseType: 'text' });
  const finalUrl = response.request?.res?.responseUrl || url;
  const html = String(response.data || '');
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, ' ').trim() || null;
  // 8000 chars of stripped text: enough that a rule stated after a long nav
  // header still reaches normalization (Glacier's directions.htm states its
  // vehicle limit at ~char 4050). Stored claim text is separately capped.
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
  return { url: finalUrl, title, text, status: response.status };
} }; }

function createDirectOfficialPageEvidenceProvider({ officialPageClient = null, stageRaw = defaultStageRaw, now = () => new Date() } = {}) {
  const client = () => officialPageClient || defaultClient();
  return {
    id: 'direct_official_page',
    supports(requirement) { return Boolean(requirement?.topic && officialUrl(requirement?.webScope?.sourceUrl, requirement?.webScope?.officialRelationship)); },
    estimateCost: () => ({ costStatus: 'known', costUsd: 0, providerAttemptLimit: 1 }),
    buildRequest(requirement) {
      const relationship = requirement?.webScope?.officialRelationship || null;
      const url = officialUrl(requirement?.webScope?.sourceUrl, relationship);
      if (!url) throw new TypeError('Direct official page requires an allowlisted HTTPS URL');
      const pageHash = hash(url.toString());
      // The dedupeKey must include the entity + topic that appear in `parameters`
      // (and drive per-topic normalization). One official page commonly serves
      // several topics (roads, events, alerts); without these, two topics on the
      // same page share a dedupeKey but differ in fingerprint → the broker throws
      // evidence_refresh_dedupe_collision. Mirrors the brave/serper query-hash rule.
      return { provider: 'direct_official_page', operation: 'fetch',
        parameters: { entityId: requirement.entity.entityId, topic: requirement.topic, evidenceType: requirement.evidenceTypes?.[0] || 'fact', sourceUrl: url.toString(), pageHash, requestedDestination: requirement.entity, officialRelationship: relationship },
        dedupeKey: `direct_official_page|fetch|${requirement.entity.entityId}|${requirement.topic}|${pageHash}`,
        publicCanonicalRequest: { provider: 'direct_official_page', operation: 'fetch', entityId: requirement.entity.entityId, topic: requirement.topic, sourceUrl: url.toString() } };
    },
    async fetch(request, { signal } = {}) {
      const raw = await client().fetchPage(request.parameters.sourceUrl, { signal });
      const finalUrl = officialUrl(raw?.url, request.parameters.officialRelationship); if (!finalUrl) throw Object.assign(new Error('Official page redirected outside allowlist'), { code: 'official_page_redirect_rejected' });
      const staged = await stageRaw({ provider: 'direct_official_page', operation: 'fetch', sourceUrl: finalUrl.toString(), payload: { title: raw.title, text: raw.text }, httpStatus: raw.status, now: now() });
      return { raw: { ...raw, url: finalUrl.toString(), _rawPayloadHash: staged?.rawPayloadHash || null }, metadata: { fetchedAt: now().toISOString() }, completeness: { isComplete: false, topics: [], emptyMeans: 'unknown' }, providerAttempts: 1 };
    },
    normalize(raw, request, metadata) {
      if (!raw?.text || !officialUrl(raw.url, request.parameters.officialRelationship)) return [];
      const relevance = verifyWebDestinationRelevance({
        requested: request.parameters.requestedDestination || { entityId: request.parameters.entityId },
        url: raw.url, title: raw.title, text: raw.text,
        officialRelationship: request.parameters.officialRelationship,
      });
      if (!relevance.accepted) return [];
      const hostKind = officialHostKind(new URL(raw.url).hostname, request.parameters.officialRelationship);
      const isOwner = hostKind === 'park_policy'
        && new URL(raw.url).hostname.toLowerCase().endsWith('nps.gov')
        && request.parameters.entityId.startsWith('nps:');
      const sourceClass = isOwner
        ? 'official_owner'
        : hostKind === 'official_state_park' ? 'official_owner'
          : ['reservation_mechanism', 'official_transit', 'official_concessionaire', 'official_operator'].includes(hostKind)
            ? 'official_operator'
            : 'government_partner';
      const qualifiers = ['direct_source_page', hostKind].filter(Boolean);
      // P0-5 — an official owner's page may state a machine-comparable vehicle
      // size limit ("longer than 21 feet ... prohibited"). Parse it HERE, at
      // normalization, so the structured fact freezes into the bundle exactly
      // like the NPS-structured producer's facts — the fit layer never reads
      // page prose. Owner pages only; a partner page is not the rule's author.
      const operationalFacts = isOwner
        ? officialPageOperationalFacts({
          title: raw.title,
          text: raw.text,
          url: raw.url,
          parkCode: (request.parameters.entityId.match(/^nps:park:([a-z0-9_-]+)/i) || [])[1] || '',
          observedAt: metadata.fetchedAt,
        })
        : [];
      // Park-wide rules (shuttle seasons, shuttle-only access, timed entry) belong
      // to the trip, not a stop. Owner pages only, read from the page's own text.
      const parkRules = isOwner
        ? officialPageParkRules({
          title: raw.title, text: raw.text, url: raw.url,
          parkCode: (request.parameters.entityId.match(/^nps:park:([a-z0-9_-]+)/i) || [])[1] || '',
          parkName: request.parameters.requestedDestination?.displayName || null,
          observedAt: metadata.fetchedAt,
        })
        : [];
      return [{
        entityId: request.parameters.entityId, topic: request.parameters.topic, evidenceType: request.parameters.evidenceType,
        claim: { identity: `official-page:${hash(raw.url)}`, text: String(raw.text).slice(0, 4000), normalizedValue: { sourceUrl: raw.url, title: raw.title || null, ...(operationalFacts.length ? { operationalFacts } : {}), ...(parkRules.length ? { parkRules } : {}) }, unit: null, status: 'official_page_content', subjectId: request.parameters.entityId, objectId: raw.url, qualifiers, polarity: 'positive' },
        scope: { geographicEntityIds: [request.parameters.entityId], validFrom: null, validThrough: null, audience: 'public', locale: 'en-US' },
        source: { provider: 'direct_official_page', sourceClass, sourceId: raw.url, url: raw.url, title: raw.title || null, publishedAt: null, sourceUpdatedAt: null },
        observedAt: metadata.fetchedAt,
        quality: { authorityClass: sourceClass, scopeMatch: relevance.scopeMatch, relationshipConfidence: relevance.relationshipConfidence, conflictStatus: 'none' },
        provenance: { extractionMethod: 'direct_official_page', extractorVersion: 'web-evidence-v1', rawPayloadHash: raw._rawPayloadHash || null },
        retention: { class: 'public_stable_1y', licenseClass: 'government_public', storeClaimText: true, deleteAfter: null },
      }];
    },
    classifyError(error) {
      if (error?.code === 'official_page_redirect_rejected') return { code: error.code, retryable: false };
      return classifyWebError(error, 'official_page_not_configured');
    },
  };
}

module.exports = { OFFICIAL_DOMAINS, createDirectOfficialPageEvidenceProvider };
