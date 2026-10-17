'use strict';

const {
  WEB_PROVIDER_BY_TOPIC,
  WEB_PROVIDER_IDS,
  buildPublicWebQuery,
  planWebEvidenceFallbacks,
} = require('../webEvidencePolicyService');
const { createBraveEvidenceProvider } = require('../providers/braveEvidenceProvider');
const { createSerperEvidenceProvider } = require('../providers/serperEvidenceProvider');
const { createTavilyEvidenceProvider } = require('../providers/tavilyEvidenceProvider');

const ENTITY = {
  entityId: 'nps:park:yose', entityType: 'national_park', displayName: 'Yosemite National Park',
  latitude: 37.7459, longitude: -119.5332,
};

function requirement(topic, ordinal = 0, overrides = {}) {
  return {
    requirementId: `req:wp6:${ordinal}:${topic}`, entity: ENTITY, topic,
    evidenceTypes: topic === 'local_business' ? ['fact', 'recommendation_signal'] : ['fact'],
    temporalScope: { mode: 'current', requestedAt: '2026-08-09T12:00:00.000Z', validFrom: null, validThrough: null, timezone: 'UTC' },
    freshnessClass: 'daily', maxAgeSeconds: 3600, maxStaleSeconds: 0,
    criticality: 'required', absenceSemantics: 'unknown',
    minimumAuthorityClass: 'reputable_web', acceptedSourceClasses: ['reputable_web'],
    preferredProviders: ['nps'], allowedFallbackProviders: ['brave'], privacyScope: 'public',
    ...overrides,
  };
}

function bundle(requirements, statuses) {
  return {
    resolutions: requirements.map((item, index) => ({
      requirementId: item.requirementId, status: statuses[index], evidenceIds: [],
    })),
  };
}

describe('WP6 structured-first web fallback policy', () => {
  test('only unresolved structured coverage enters the web pass', () => {
    const requirements = [
      requirement('roads', 0), requirement('events', 1), requirement('trail_conditions', 2),
    ];
    const planned = planWebEvidenceFallbacks({
      requirements, structuredBundle: bundle(requirements, ['satisfied_fresh', 'satisfied_stale_safe', 'missing']),
    });
    expect(planned.map((item) => item.requirementId)).toEqual(['req:wp6:2:trail_conditions']);
    expect(planned[0]).toMatchObject({ preferredProviders: ['brave'], allowedFallbackProviders: [] });
  });

  test.each([
    ['roads', 'brave'], ['alerts_closures', 'brave'], ['wildfire_smoke', 'brave'],
    ['trail_conditions', 'brave'], ['events', 'brave'],
    ['local_business', 'serper'], ['lodging_strategy', 'serper'],
    ['overview', 'tavily'], ['activities', 'tavily'],
    ['transit', 'brave'], ['parking', 'brave'], ['permits_reservations', 'brave'],
  ])('routes %s gaps to %s', (topic, provider) => {
    const req = requirement(topic);
    expect(planWebEvidenceFallbacks({ requirements: [req], structuredBundle: bundle([req], ['missing']) })[0])
      .toMatchObject({ preferredProviders: [provider] });
  });

  test.each(['hotel_live', 'flight_live', 'driving_time', 'weather_current', 'weather_forecast'])
  ('never treats web search as live inventory or structured telemetry for %s', (topic) => {
    const req = requirement(topic);
    expect(planWebEvidenceFallbacks({ requirements: [req], structuredBundle: bundle([req], ['missing']) })).toEqual([]);
  });

  test('builds a bounded public query without copying private request context', () => {
    const req = requirement('roads', 0, {
      rawQuery: 'drive from 123 Private Street',
      routeScope: {
        origin: { entityId: 'private:origin:home', displayName: '123 Private Street', latitude: 1, longitude: 2 },
        destination: ENTITY, travelMode: 'driving', departureTimeBucket: '2026-08-09T12:00:00.000Z',
      },
    });
    const query = buildPublicWebQuery(req);
    expect(query).toBe('Yosemite National Park road conditions closures official 2026');
    expect(query).not.toMatch(/123|private|origin|home/i);
  });

  test('access-decision gaps ask for shuttle, parking, and reservation mechanics without park-specific facts', () => {
    const transit = requirement('transit', 0, { reasonCodes: ['access_decision_support'] });
    const permits = requirement('permits_reservations', 1, { reasonCodes: ['access_decision_support'] });
    expect(buildPublicWebQuery(transit)).toMatch(/Yosemite National Park/i);
    expect(buildPublicWebQuery(transit)).toMatch(/shuttle|parking|transit/i);
    expect(buildPublicWebQuery(permits)).toMatch(/reservation|recreation\.gov|permit/i);
    expect(buildPublicWebQuery(transit)).not.toMatch(/logan pass|glacier/i);
    expect(planWebEvidenceFallbacks({
      requirements: [transit, permits],
      structuredBundle: bundle([transit, permits], ['unsupported', 'missing']),
    }).map((item) => item.topic)).toEqual(['transit', 'permits_reservations']);
  });

  test('web provider IDs are explicit and cannot absorb structured providers', () => {
    expect([...WEB_PROVIDER_IDS].sort()).toEqual(['brave', 'direct_official_page', 'serper', 'tavily']);
  });

  test('every policy topic maps to a provider that mechanically supports it', () => {
    const providers = {
      brave: createBraveEvidenceProvider({ braveClient: {}, stageRaw: jest.fn() }),
      serper: createSerperEvidenceProvider({ serperClient: {}, stageRaw: jest.fn() }),
      tavily: createTavilyEvidenceProvider({ tavilyClient: {}, stageRaw: jest.fn() }),
    };
    for (const [topic, providerId] of Object.entries(WEB_PROVIDER_BY_TOPIC)) {
      expect(providers[providerId].supports(requirement(topic))).toBe(true);
    }
  });

  test('enriches thin decision-critical evidence but not optional thin context', () => {
    const parking = requirement('parking', 0, { criticality: 'required', reasonCodes: ['requested_parking_mechanics'] });
    const optional = requirement('activities', 1, { criticality: 'optional', temporalScope: { mode: 'timeless', requestedAt: '2026-08-09T12:00:00.000Z' } });
    const planned = planWebEvidenceFallbacks({
      requirements: [parking, optional],
      structuredBundle: bundle([parking, optional], ['satisfied_partial', 'satisfied_partial']),
    });
    expect(planned.map((item) => item.topic)).toEqual(['parking']);
  });

  test('enriches stale required permit evidence and adds decision timing to the public query', () => {
    const req = requirement('permits_reservations', 0, {
      criticality: 'required',
      temporalScope: { mode: 'current', requestedAt: '2026-08-09T12:00:00.000Z', validFrom: null, validThrough: null, timezone: 'UTC' },
      reasonCodes: ['explicit_permit_question'],
    });
    expect(planWebEvidenceFallbacks({ requirements: [req], structuredBundle: bundle([req], ['satisfied_stale_safe']) })).toHaveLength(1);
    expect(buildPublicWebQuery(req)).toMatch(/2026/);
  });

  test('uses mobility and difficulty semantics without leaking unrelated private fields', () => {
    const mobility = requirement('accessibility', 0, {
      reasonCodes: ['mobility_short_experience', 'requested_low_walking_candidates'],
      privateTravelerName: 'Secret Person',
      rawQuery: 'home address 123 Private Street',
    });
    const hard = requirement('activities', 1, { reasonCodes: ['requested_hard_hike'] });
    expect(buildPublicWebQuery(mobility)).toMatch(/accessible|short walks/i);
    expect(buildPublicWebQuery(hard)).toMatch(/strenuous|difficult/i);
    expect(buildPublicWebQuery(mobility)).not.toMatch(/Secret|123|Private Street/i);
  });
});
