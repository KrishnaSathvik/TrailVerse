'use strict';

/**
 * The discovery → official-follow handoff.
 *
 * Live execution has never reached this boundary: web candidates died at
 * persistence (undeclared `quality.relationshipConfidence` on a `strict: 'throw'`
 * subdocument), so no candidate was ever eligible for the follow. These tests
 * exercise it end to end with mocked providers.
 *
 * Note the official-follow result sets `relationshipConfidence` too, so it would
 * have failed the same way even if discovery had survived.
 *
 * Offline: mocked clients, no network, no DB write, no model.
 */

const { materializeCandidate } = require('../evidenceBrokerService');
const { buildEvidenceKeys } = require('../../utils/evidenceKey');
const TrailieEvidence = require('../../models/TrailieEvidence');
const { createBraveEvidenceProvider } = require('../providers/braveEvidenceProvider');
const { createDirectOfficialPageEvidenceProvider } = require('../providers/directOfficialPageEvidenceProvider');
const { createLayeredEvidenceResolver } = require('../layeredEvidenceBroker');

const ENTITY = { entityId: 'nps:park:yose', entityType: 'national_park', parkCode: 'yose', displayName: 'Yosemite National Park' };
const NOW = new Date('2026-08-17T00:00:00.000Z');
const OFFICIAL_URL = 'https://www.nps.gov/yose/planyourvisit/publictransportation.htm';
const WRONG_PARK_URL = 'https://www.nps.gov/grca/planyourvisit/shuttle-buses.htm';
const PAGE_TEXT =
  'Yosemite Valley shuttle buses operate daily year-round. Day-use parking in '
  + 'Yosemite Village fills by mid-morning during summer; accessible parking is '
  + 'available near the Visitor Center.';

function validateAsPersisted(candidate) {
  const materialized = materializeCandidate(candidate, { now: NOW });
  const keys = buildEvidenceKeys(materialized);
  return new TrailieEvidence({
    ...materialized,
    evidenceId: keys.evidenceId, logicalKey: keys.logicalKey, canonicalKey: keys.canonicalKey,
    provenance: { ...(materialized.provenance || {}), contentHash: keys.contentHash }, isCurrent: true,
  }).validateSync() || null;
}

const officialProvider = () => createDirectOfficialPageEvidenceProvider({
  officialPageClient: {
    async fetchPage(url) {
      return { url, finalUrl: url, title: 'Public Transportation - Yosemite National Park', text: PAGE_TEXT, status: 200 };
    },
  },
  stageRaw: async () => ({ rawPayloadHash: 'staged' }),
  now: () => NOW,
});

describe('official follow materializes real page content', () => {
  test('a followed official page produces persistable evidence with real claim text', async () => {
    const provider = officialProvider();
    const requirement = {
      topic: 'transit', entity: ENTITY, evidenceTypes: ['fact'], requirementId: 'r-transit',
      webScope: { sourceUrl: OFFICIAL_URL },
    };
    expect(provider.supports(requirement)).toBe(true);

    const request = provider.buildRequest(requirement);
    const fetched = await provider.fetch(request, {});
    const [candidate] = provider.normalize(fetched.raw, request, fetched.metadata);

    // The thing the whole chain exists to produce.
    expect(candidate.claim.text).toContain('shuttle');
    expect(candidate.claim.text.length).toBeGreaterThan(60);
    expect(candidate.claim.status).toBe('official_page_content');
    expect(candidate.quality.scopeMatch).toBe('exact');

    // And it must survive the boundary that previously discarded it.
    expect(validateAsPersisted(candidate)).toBeNull();
  });

  test('the follow result carries owner-class authority, unlike discovery', async () => {
    const provider = officialProvider();
    const request = provider.buildRequest({
      topic: 'transit', entity: ENTITY, evidenceTypes: ['fact'], requirementId: 'r-transit',
      webScope: { sourceUrl: OFFICIAL_URL },
    });
    const fetched = await provider.fetch(request, {});
    const [candidate] = provider.normalize(fetched.raw, request, fetched.metadata);
    expect(candidate.quality.authorityClass).not.toBe('reputable_web');
    expect(candidate.claim.qualifiers).toEqual(expect.arrayContaining(['direct_source_page']));
  });

  test('a wrong-destination page is not eligible for follow selection', async () => {
    const brave = createBraveEvidenceProvider({
      braveClient: { async search() { return { results: [{ url: WRONG_PARK_URL, title: 'Shuttle Buses - Grand Canyon', description: 'Grand Canyon shuttles.' }] }; } },
      stageRaw: async () => ({ rawPayloadHash: 'staged' }), now: () => NOW,
    });
    const request = brave.buildRequest({ topic: 'transit', entity: ENTITY, evidenceTypes: ['fact'], reasonCodes: [], requirementId: 'r-t' });
    const fetched = await brave.fetch(request, {});
    const [candidate] = brave.normalize(fetched.raw, request, fetched.metadata);
    expect(candidate.quality.scopeMatch).not.toBe('exact');
  });
});

describe('layered resolver: discovery survives and triggers the follow', () => {
  /** Broker stub that routes by preferredProviders and records every pass. */
  function stubBroker() {
    const passes = [];
    const brave = createBraveEvidenceProvider({
      braveClient: { async search() { return { results: [{ url: OFFICIAL_URL, title: 'Public Transportation - Yosemite National Park', description: 'Shuttle service.' }] }; } },
      stageRaw: async () => ({ rawPayloadHash: 'staged' }), now: () => NOW,
    });
    const official = officialProvider();

    return {
      passes,
      async resolveEvidence({ requirements, requestId }) {
        const kind = String(requestId).split(':').slice(1).join(':') || 'structured';
        passes.push({ kind, topics: requirements.map((r) => r.topic) });

        if (kind === 'structured') {
          return {
            evidence: [],
            resolutions: requirements.map((r) => ({ requirementId: r.requirementId, status: 'missing', evidenceIds: [], selectedEvidence: [] })),
          };
        }

        const provider = kind === 'official-pages' ? official : brave;
        const evidence = [];
        for (const requirement of requirements) {
          if (!provider.supports(requirement)) continue;
          const request = provider.buildRequest(requirement);
          const fetched = await provider.fetch(request, {});
          for (const candidate of provider.normalize(fetched.raw, request, fetched.metadata)) {
            // Only schema-valid candidates are allowed to move forward, exactly
            // as real persistence would gate them.
            expect(validateAsPersisted(candidate)).toBeNull();
            evidence.push({ ...candidate, evidenceId: `ev-${evidence.length}` });
          }
        }
        return {
          evidence,
          resolutions: requirements.map((r) => ({
            requirementId: r.requirementId,
            status: kind === 'official-pages' ? 'satisfied_fresh' : 'missing',
            evidenceIds: evidence.map((e) => e.evidenceId),
            selectedEvidence: evidence,
          })),
        };
      },
    };
  }

  test('discovery reaches the official-pages pass and the followed claim enters the bundle', async () => {
    const broker = stubBroker();
    const resolver = createLayeredEvidenceResolver({ broker, now: () => NOW });

    const requirement = {
      requirementId: 'req:transit', topic: 'transit', entity: ENTITY, evidenceTypes: ['fact'],
      temporalScope: { mode: 'current', requestedAt: NOW.toISOString() },
      freshnessClass: 'hourly', maxAgeSeconds: 3600, maxStaleSeconds: 21600,
      criticality: 'required', absenceSemantics: 'unknown',
      minimumAuthorityClass: 'official_owner', acceptedSourceClasses: ['official_owner'],
      privacyScope: 'public', reasonCodes: ['requested_parking_mechanics'],
      preferredProviders: ['brave'], allowedFallbackProviders: [],
    };

    const bundle = await resolver.resolveEvidence({ requirements: [requirement], requestId: 'rq-follow' });

    const kinds = broker.passes.map((p) => p.kind);
    expect(kinds).toContain('web-discovery');
    // The boundary live execution has never reached.
    expect(kinds).toContain('official-pages');

    const texts = (bundle.evidence || []).map((e) => e.claim?.text).filter(Boolean);
    expect(texts.join(' ')).toContain('shuttle');
  });
});
