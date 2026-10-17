'use strict';

const { createKnownPlaceEvidenceProvider } = require('../providers/knownPlaceEvidenceProvider');

const NOW = new Date('2026-08-10T12:00:00.000Z');

describe('known-place evidence provider', () => {
  test('satisfies destination identity for a geocoded non-NPS place', async () => {
    const provider = createKnownPlaceEvidenceProvider({ now: () => NOW });
    const requirement = {
      topic: 'destination_identity',
      entity: {
        entityId: 'place:known:valley-of-fire-state-park',
        displayName: 'Valley of Fire State Park',
        latitude: 36.4819,
        longitude: -114.5311,
      },
    };
    expect(provider.supports(requirement)).toBe(true);
    const request = provider.buildRequest(requirement);
    const fetched = await provider.fetch(request);
    const candidates = provider.normalize(fetched.raw, request, fetched.metadata);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      entityId: 'place:known:valley-of-fire-state-park',
      topic: 'destination_identity',
      source: { provider: 'known_place', sourceClass: 'trusted_specialist' },
    });
  });

  test('does not claim NPS parks', () => {
    const provider = createKnownPlaceEvidenceProvider({ now: () => NOW });
    expect(provider.supports({
      topic: 'destination_identity',
      entity: { entityId: 'nps:park:yose' },
    })).toBe(false);
  });

  test('returns named activity candidates for Valley of Fire', async () => {
    const provider = createKnownPlaceEvidenceProvider({ now: () => NOW });
    const requirement = {
      topic: 'activities',
      entity: {
        entityId: 'place:known:valley-of-fire-state-park',
        displayName: 'Valley of Fire State Park',
      },
    };
    expect(provider.supports(requirement)).toBe(true);
    const request = provider.buildRequest(requirement);
    const fetched = await provider.fetch(request);
    const candidates = provider.normalize(fetched.raw, request, fetched.metadata);
    expect(candidates.length).toBeGreaterThanOrEqual(4);
    expect(candidates.every((c) => c.topic === 'activities')).toBe(true);
    expect(candidates.map((c) => c.claim.normalizedValue.name)).toEqual(
      expect.arrayContaining(["Mouse's Tank Trail", 'Atlatl Rock'])
    );
    expect(candidates[0].claim.normalizedValue.currentStatus).toBe('unknown');
  });

  test('resolves activities when destination resolver used the short known-place entity id', async () => {
    const provider = createKnownPlaceEvidenceProvider({ now: () => NOW });
    const requirement = {
      topic: 'activities',
      entity: {
        entityId: 'place:known:valley-of-fire',
        displayName: 'Valley of Fire State Park',
      },
    };
    const request = provider.buildRequest(requirement);
    const fetched = await provider.fetch(request);
    const candidates = provider.normalize(fetched.raw, request, fetched.metadata);
    expect(candidates.length).toBeGreaterThanOrEqual(4);
    expect(candidates.map((c) => c.claim.normalizedValue.name)).toEqual(
      expect.arrayContaining(["Mouse's Tank Trail"])
    );
  });
});