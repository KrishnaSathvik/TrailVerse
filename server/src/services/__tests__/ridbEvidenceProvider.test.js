'use strict';

const fs = require('fs');
const path = require('path');
const { createRidbEvidenceProvider } = require('../providers/ridbEvidenceProvider');

const NOW = new Date('2026-08-09T12:00:00.000Z');
const FIXTURE = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures/ridb-yosemite-facilities.json'),
  'utf8'
));

function requirement(topic, overrides = {}) {
  return {
    requirementId: `req:wp5b:ridb:${topic}`,
    entity: {
      entityId: 'nps:park:yose',
      entityType: 'national_park',
      displayName: 'Yosemite National Park',
    },
    topic,
    evidenceTypes: topic === 'campgrounds' ? ['fact', 'relationship'] : ['fact', 'rule'],
    preferredProviders: ['ridb'],
    ...overrides,
  };
}

describe('WP5B RIDB evidence provider', () => {
  test('supports park campground and permit requirements only', () => {
    const provider = createRidbEvidenceProvider({ ridbClient: {} });
    expect(provider.supports(requirement('campgrounds'))).toBe(true);
    expect(provider.supports(requirement('permits_reservations'))).toBe(true);
    expect(provider.supports(requirement('alerts_closures'))).toBe(false);
    expect(provider.supports({ ...requirement('campgrounds'), entity: { entityId: 'city:yosemite' } })).toBe(false);
  });

  test('coalesces campground and permit requirements onto one physical RIDB request', () => {
    const provider = createRidbEvidenceProvider({ ridbClient: {} });
    const campground = provider.buildRequest(requirement('campgrounds'));
    const permit = provider.buildRequest(requirement('permits_reservations'));

    expect(campground.dedupeKey).toBe('ridb|rec-area-facilities|yose');
    expect(permit.dedupeKey).toBe(campground.dedupeKey);
    expect(permit.publicCanonicalRequest).toEqual(campground.publicCanonicalRequest);
    expect(permit.publicCanonicalRequest).not.toHaveProperty('userId');
  });

  test('maps canonical rec-area and facility identities plus their relationships', async () => {
    const ridbClient = { getRecAreaFacilities: jest.fn().mockResolvedValue(FIXTURE) };
    const provider = createRidbEvidenceProvider({ ridbClient, now: () => NOW });
    const request = provider.buildRequest(requirement('campgrounds'));
    const fetched = await provider.fetch(request, { signal: new AbortController().signal });
    const candidates = provider.normalize(fetched.raw, request, fetched.metadata);

    expect(ridbClient.getRecAreaFacilities).toHaveBeenCalledTimes(1);
    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        topic: 'campgrounds',
        evidenceType: 'relationship',
        claim: expect.objectContaining({
          identity: 'ridb-rec-area:nps:park:yose:ridb:rec_area:2991',
          subjectId: 'nps:park:yose',
          objectId: 'ridb:rec_area:2991',
        }),
      }),
      expect.objectContaining({
        topic: 'campgrounds',
        evidenceType: 'fact',
        claim: expect.objectContaining({
          identity: 'ridb-facility:232447',
          subjectId: 'ridb:facility:232447',
          objectId: 'ridb:rec_area:2991',
          normalizedValue: expect.objectContaining({
            facilityId: 'ridb:facility:232447',
            recAreaId: 'ridb:rec_area:2991',
            name: 'Upper Pines',
          }),
        }),
      }),
    ]));
  });

  test('permit listing metadata never claims current availability', () => {
    const provider = createRidbEvidenceProvider({ ridbClient: {}, now: () => NOW });
    const request = provider.buildRequest(requirement('permits_reservations'));
    const candidates = provider.normalize(FIXTURE, request, { observedAt: FIXTURE.observedAt });
    const permit = candidates.find((candidate) => candidate.topic === 'permits_reservations');

    expect(permit).toMatchObject({
      evidenceType: 'fact',
      claim: {
        status: 'listing_only',
        normalizedValue: {
          facilityId: 'ridb:facility:10086745',
          listingExists: true,
          currentAvailability: null,
        },
      },
      quality: { authorityClass: 'official_structured' },
    });
    expect(JSON.stringify(permit)).not.toMatch(/"(?:available|hasAvailability)":true/i);
  });

  test('adapter imports no broker, store, model, or prompt code', () => {
    const source = fs.readFileSync(path.join(__dirname, '../providers/ridbEvidenceProvider.js'), 'utf8');
    expect(source).not.toMatch(/mongoose|models\/|evidenceStore|evidenceCoverage|factsService|prompt/i);
  });
});
