'use strict';

const fs = require('fs');
const path = require('path');
const fixture = require('./fixtures/maps-yosemite-sequoia.json');
const { createMapsEvidenceProvider } = require('../providers/mapsEvidenceProvider');

const NOW = new Date('2026-08-09T12:00:00.000Z');
const points = {
  yose: { entityId: 'nps:park:yose', displayName: 'Yosemite National Park', latitude: 37.7459, longitude: -119.5332 },
  sequ: { entityId: 'nps:park:sequ', displayName: 'Sequoia National Park', latitude: 36.4864, longitude: -118.5658 },
  deva: { entityId: 'nps:park:deva', displayName: 'Death Valley National Park', latitude: 36.5054, longitude: -117.0794 },
};

function requirement({ destination = points.sequ, mode = 'driving', bucket = NOW.toISOString() } = {}) {
  return {
    requirementId: `req:maps:${destination.entityId}:${mode}:${bucket}`,
    entity: destination,
    topic: 'driving_time',
    routeScope: {
      origin: points.yose,
      destination,
      travelMode: mode,
      departureTimeBucket: bucket,
    },
    preferredProviders: ['google_maps'],
  };
}

describe('WP5C Maps evidence provider', () => {
  test('supports only fully scoped driving-time requirements', () => {
    const provider = createMapsEvidenceProvider({ mapsClient: {} });
    expect(provider.supports(requirement())).toBe(true);
    expect(provider.supports({ ...requirement(), routeScope: null })).toBe(false);
    expect(provider.supports({ ...requirement(), topic: 'weather_forecast' })).toBe(false);
  });

  test('physical identity includes origin, destination, mode, and departure bucket', () => {
    const provider = createMapsEvidenceProvider({ mapsClient: {} });
    const base = provider.buildRequest(requirement());
    const otherDestination = provider.buildRequest(requirement({ destination: points.deva }));
    const otherMode = provider.buildRequest(requirement({ mode: 'walking' }));
    const otherBucket = provider.buildRequest(requirement({ bucket: '2026-08-09T18:00:00.000Z' }));

    expect(base.dedupeKey).toBe('google_maps|route|nps:park:yose|nps:park:sequ|driving|2026-08-09T12:00:00.000Z');
    expect(new Set([base.dedupeKey, otherDestination.dedupeKey, otherMode.dedupeKey, otherBucket.dedupeKey]).size).toBe(4);
    expect(base.publicCanonicalRequest).toMatchObject({
      originEntityId: 'nps:park:yose', destinationEntityId: 'nps:park:sequ',
      travelMode: 'driving', departureTimeBucket: NOW.toISOString(),
    });
  });

  test('normalizes one route response into exactly scoped evidence', async () => {
    const mapsClient = { getRoute: jest.fn().mockResolvedValue(fixture) };
    const provider = createMapsEvidenceProvider({ mapsClient, now: () => NOW });
    const request = provider.buildRequest(requirement());
    const fetched = await provider.fetch(request, { signal: new AbortController().signal });
    const candidates = provider.normalize(fetched.raw, request, fetched.metadata);

    expect(mapsClient.getRoute).toHaveBeenCalledTimes(1);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      topic: 'driving_time', evidenceType: 'fact',
      claim: {
        identity: 'google-maps-route:nps:park:yose:nps:park:sequ:driving:2026-08-09T12:00:00.000Z',
        subjectId: 'nps:park:yose', objectId: 'nps:park:sequ',
        normalizedValue: {
          distanceMeters: 220480, durationSeconds: 14220, durationInTrafficSeconds: 15180,
          travelMode: 'driving', departureTimeBucket: NOW.toISOString(),
        },
      },
      source: { provider: 'google_maps', sourceClass: 'commercial_structured' },
    });
    expect(candidates[0].scope.route).toMatchObject({
      originEntityId: 'nps:park:yose', destinationEntityId: 'nps:park:sequ', travelMode: 'driving',
    });
  });

  test('adapter imports no broker, store, model, prompt, or legacy formatter', () => {
    const source = fs.readFileSync(path.join(__dirname, '../providers/mapsEvidenceProvider.js'), 'utf8');
    expect(source).not.toMatch(/mongoose|models\/|evidenceStore|evidenceCoverage|factsService|drivingTimesContextService|prompt/i);
  });
});
