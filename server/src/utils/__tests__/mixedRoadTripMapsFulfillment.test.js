'use strict';

/**
 * Offline mixed road-trip Maps fulfillment gate (Case 7 contract).
 * Uses injected fake Google Maps client — ZERO network/model/provider calls.
 */

const { buildEvidenceKeys } = require('../evidenceKey');
const { evaluateRequirementCoverage } = require('../../services/evidenceCoverageEvaluator');
const { createEvidenceBroker, materializeCandidate } = require('../../services/evidenceBrokerService');
const {
  createMapsEvidenceProvider,
  interpretDistanceMatrixResponse,
} = require('../../services/providers/mapsEvidenceProvider');
const { planEvidenceRequirements } = require('../../services/evidencePlannerService');
const { isRoutableEndpoint, normalizeRoutingEndpoint } = require('../routingEndpoint');
const {
  validateMaxDailyDrive,
  validateDayDriveActivityFeasibility,
} = require('../roadTripValidators');
const { drivingRouteScopesFromTripScope } = require('../roadTripContract');

const NOW = new Date('2026-08-12T12:00:00.000Z');
const BUCKET = '2026-08-12T13:00:00.000Z';

const CITY = {
  entityId: 'place:city:denver',
  entityType: 'city',
  displayName: 'Denver',
  latitude: 39.74,
  longitude: -104.99,
};
const PARK_A = {
  entityId: 'nps:park:romo',
  entityType: 'national_park',
  displayName: 'Rocky Mountain National Park',
  latitude: 40.343,
  longitude: -105.684,
  parkCode: 'romo',
};
const PARK_B = {
  entityId: 'nps:park:dino',
  entityType: 'national_park',
  displayName: 'Dinosaur National Monument',
  latitude: 40.50739742,
  longitude: -108.9333714,
  parkCode: 'dino',
};
const KNOWN = {
  entityId: 'place:known:flaming-gorge',
  entityType: 'known_place',
  displayName: 'Flaming Gorge',
  latitude: 40.9147,
  longitude: -109.421,
};
const PARK_C = {
  entityId: 'nps:park:cany',
  entityType: 'national_park',
  displayName: 'Canyonlands',
  latitude: 38.326,
  longitude: -109.875,
  parkCode: 'cany',
};
const PARK_D = {
  entityId: 'nps:park:arch',
  entityType: 'national_park',
  displayName: 'Arches',
  latitude: 38.733,
  longitude: -109.592,
  parkCode: 'arch',
};

function routeRequirement(origin, destination, {
  ordinal = 0,
  criticality = 'hard',
  bucket = BUCKET,
} = {}) {
  return {
    requirementId: `req:mixed:${ordinal}:${destination.entityId}`,
    entity: {
      entityId: destination.entityId,
      entityType: destination.entityType || 'unknown',
      displayName: destination.displayName || '',
      parentEntityId: null,
      latitude: destination.latitude,
      longitude: destination.longitude,
      resolutionConfidence: 1,
    },
    topic: 'driving_time',
    evidenceTypes: ['fact'],
    temporalScope: {
      mode: 'timeless',
      requestedAt: NOW.toISOString(),
      validFrom: null,
      validThrough: null,
      timezone: 'UTC',
    },
    freshnessClass: 'hourly',
    maxAgeSeconds: 1800,
    maxStaleSeconds: 21600,
    criticality,
    absenceSemantics: 'unknown',
    minimumAuthorityClass: 'commercial_structured',
    acceptedSourceClasses: ['commercial_structured'],
    preferredProviders: ['google_maps'],
    allowedFallbackProviders: [],
    privacyScope: 'public',
    routeScope: {
      origin: normalizeRoutingEndpoint(origin),
      destination: normalizeRoutingEndpoint(destination),
      travelMode: 'driving',
      departureTimeBucket: bucket,
    },
  };
}

function fakeRoute({ durationSeconds = 7200, distanceMeters = 100000 } = {}) {
  return {
    distanceMeters,
    durationSeconds,
    durationInTrafficSeconds: durationSeconds,
    providerStatus: 'OK',
  };
}

function harness({ getRoute }) {
  const docs = [];
  const refreshEvents = [];
  const mapsClient = { getRoute: jest.fn(getRoute) };
  const provider = createMapsEvidenceProvider({ mapsClient, now: () => NOW });
  const broker = createEvidenceBroker({
    providers: [provider],
    queryEvidence: async (req) => docs.filter(
      (item) => item.entityId === req.entity.entityId && item.topic === req.topic && item.isCurrent
    ),
    persistCandidate: async ({ candidate }) => {
      const keys = buildEvidenceKeys(candidate);
      const evidence = {
        ...candidate,
        ...keys,
        isCurrent: true,
        provenance: { ...candidate.provenance, contentHash: keys.contentHash },
      };
      docs.push(evidence);
      return { outcome: 'created', evidence };
    },
    acquireLease: async ({ leaseKey, ownerId }) => ({
      outcome: 'acquired',
      lease: { leaseKey, ownerId, fencingToken: 1 },
    }),
    releaseLease: async () => ({ released: true }),
    waitForRefresh: async () => ({ outcome: 'coalesced_store_update' }),
    recordRefreshEvent: async (event) => { refreshEvents.push(event); },
    refreshHashSecret: 'mixed-maps-offline-secret',
    now: () => NOW,
  });
  return { broker, docs, refreshEvents, mapsClient, provider };
}

function case7TripScope() {
  return {
    type: 'road_trip',
    origin: CITY,
    destinations: [PARK_A, PARK_B, KNOWN],
    destinationOrderExplicit: true,
    userSuppliedOrder: true,
    transportMode: 'drive',
    maxDailyDriveMinutes: 240,
    routeLegs: [
      {
        ordinal: 0,
        fromEntityId: CITY.entityId,
        toEntityId: PARK_A.entityId,
        fromDisplayName: CITY.displayName,
        toDisplayName: PARK_A.displayName,
        fromHasCoordinates: true,
        toHasCoordinates: true,
        driveDurationMinutes: null,
        status: 'requires_driving_evidence',
      },
      {
        ordinal: 1,
        fromEntityId: PARK_A.entityId,
        toEntityId: PARK_B.entityId,
        fromDisplayName: PARK_A.displayName,
        toDisplayName: PARK_B.displayName,
        fromHasCoordinates: true,
        toHasCoordinates: true,
        driveDurationMinutes: null,
        status: 'requires_driving_evidence',
      },
      {
        ordinal: 2,
        fromEntityId: PARK_B.entityId,
        toEntityId: KNOWN.entityId,
        fromDisplayName: PARK_B.displayName,
        toDisplayName: KNOWN.displayName,
        fromHasCoordinates: true,
        toHasCoordinates: true,
        driveDurationMinutes: null,
        status: 'requires_driving_evidence',
      },
    ],
    unresolvedRouteLegs: [],
  };
}

describe('routingEndpoint — routable endpoints (not park-type)', () => {
  test('city / national_park / nps_site / known_place with coords are routable', () => {
    expect(isRoutableEndpoint(CITY)).toBe(true);
    expect(isRoutableEndpoint(PARK_A)).toBe(true);
    expect(isRoutableEndpoint({
      entityId: 'nps:park:dino',
      entityType: 'nps_site',
      latitude: 40.5,
      longitude: -108.9,
    })).toBe(true);
    expect(isRoutableEndpoint(KNOWN)).toBe(true);
  });

  test('missing coordinates and unresolved destinations are not routable', () => {
    expect(isRoutableEndpoint({
      entityId: 'place:city:denver',
      entityType: 'city',
      latitude: null,
      longitude: null,
    })).toBe(false);
    expect(isRoutableEndpoint({
      entityId: 'unresolved:somewhere',
      entityType: 'unresolved_destination',
      latitude: 1,
      longitude: 2,
    })).toBe(false);
  });
});

describe('interpretDistanceMatrixResponse — no silent auth/quota swallow', () => {
  test('REQUEST_DENIED throws maps_not_configured', () => {
    expect(() => interpretDistanceMatrixResponse({
      status: 'REQUEST_DENIED',
      error_message: 'denied',
    })).toThrow(/REQUEST_DENIED/);
    try {
      interpretDistanceMatrixResponse({ status: 'REQUEST_DENIED' });
    } catch (error) {
      expect(error.code).toBe('maps_not_configured');
    }
  });

  test('traffic-only duration without base duration is malformed', () => {
    expect(() => interpretDistanceMatrixResponse({
      status: 'OK',
      rows: [{
        elements: [{
          status: 'OK',
          distance: { value: 50000 },
          duration_in_traffic: { value: 3600 },
        }],
      }],
    })).toThrow(expect.objectContaining({ code: 'maps_invalid_response' }));
  });

  test('ZERO_RESULTS remains null (fail-closed, no fabrication)', () => {
    expect(interpretDistanceMatrixResponse({
      status: 'OK',
      rows: [{ elements: [{ status: 'ZERO_RESULTS' }] }],
    })).toBeNull();
  });
});

describe('Mixed road-trip Maps dispatch (Cases A–H)', () => {
  async function expectDispatch(origin, destination) {
    const h = harness({ getRoute: async () => fakeRoute({ durationSeconds: 5400 }) });
    const req = routeRequirement(origin, destination);
    expect(h.provider.supports(req)).toBe(true);
    const bundle = await h.broker.resolveEvidence({
      requirements: [req],
      requestId: `dispatch-${destination.entityId}`,
    });
    expect(h.mapsClient.getRoute).toHaveBeenCalledTimes(1);
    expect(bundle.resolutions[0].status).toBe('satisfied_fresh');
    expect(bundle.evidence[0].source.provider).toBe('google_maps');
    return bundle;
  }

  test('CASE A — city → national_park dispatches Maps', async () => {
    await expectDispatch(CITY, PARK_A);
  });

  test('CASE B — national_park → nps_site dispatches Maps', async () => {
    await expectDispatch(PARK_A, { ...PARK_B, entityType: 'nps_site' });
  });

  test('CASE C — nps_site → known_place dispatches Maps', async () => {
    await expectDispatch({ ...PARK_B, entityType: 'nps_site' }, KNOWN);
  });

  test('CASE D — known_place → national_park dispatches Maps', async () => {
    await expectDispatch(KNOWN, PARK_A);
  });

  test('CASE E — missing coordinates: no Maps fulfillment; hard remains unmet', async () => {
    const broken = { ...CITY, latitude: null, longitude: null };
    const h = harness({ getRoute: async () => fakeRoute() });
    const req = routeRequirement(broken, PARK_A);
    expect(h.provider.supports(req)).toBe(false);
    const bundle = await h.broker.resolveEvidence({
      requirements: [req],
      requestId: 'missing-coords',
    });
    expect(h.mapsClient.getRoute).not.toHaveBeenCalled();
    expect(bundle.resolutions[0].status).toBe('unsupported');
    expect(bundle.evidence).toHaveLength(0);
  });

  test('CASE F — unresolved_destination is not routable', async () => {
    const unresolved = {
      entityId: 'unresolved:mystery',
      entityType: 'unresolved_destination',
      displayName: 'Mystery',
      latitude: 40,
      longitude: -105,
    };
    const h = harness({ getRoute: async () => fakeRoute() });
    const req = routeRequirement(PARK_A, unresolved);
    expect(h.provider.supports(req)).toBe(false);
    expect(h.mapsClient.getRoute).not.toHaveBeenCalled();
  });

  test('CASE G — three-leg road trip → exactly 3 Maps dispatches (no N²)', async () => {
    const calls = [];
    const h = harness({
      getRoute: async (parameters) => {
        calls.push(`${parameters.origin.entityId}->${parameters.destination.entityId}`);
        return fakeRoute({ durationSeconds: 6000 + calls.length });
      },
    });
    const requirements = [
      routeRequirement(CITY, PARK_A, { ordinal: 0 }),
      routeRequirement(PARK_A, PARK_B, { ordinal: 1 }),
      routeRequirement(PARK_B, KNOWN, { ordinal: 2 }),
    ];
    const bundle = await h.broker.resolveEvidence({
      requirements,
      requestId: 'three-leg',
    });
    expect(calls).toEqual([
      'place:city:denver->nps:park:romo',
      'nps:park:romo->nps:park:dino',
      'nps:park:dino->place:known:flaming-gorge',
    ]);
    expect(h.mapsClient.getRoute).toHaveBeenCalledTimes(3);
    expect(bundle.resolutions.every((r) => r.status === 'satisfied_fresh')).toBe(true);
    expect(bundle.evidence).toHaveLength(3);
    expect(new Set(bundle.evidence.map((e) => e.source.provider))).toEqual(new Set(['google_maps']));
  });

  test('CASE H — Case-6-like park→park path remains green', async () => {
    await expectDispatch(PARK_C, PARK_D);
  });
});

describe('Case 7 offline replay + coverage', () => {
  test('planner emits 3 hard adjacent driving_time requirements including city origin', () => {
    const tripScope = case7TripScope();
    expect(drivingRouteScopesFromTripScope(tripScope)).toHaveLength(3);
    const reqs = planEvidenceRequirements({
      turnId: 'case7-offline',
      userPrompt: 'Plan a 6-day road trip starting in Denver through Rocky Mountain National Park, Dinosaur National Monument, and Flaming Gorge.',
      intent: { primaryIntent: 'full_trip', entities: [], verticals: ['itinerary'], depth: 'deep', freshness: 'current', actionability: 'planning', scope: 'multi_destination' },
      resolvedEntities: [PARK_A, PARK_B, KNOWN],
      constraints: { tripScope, interests: ['hiking'], maxDailyDriveMinutes: 240 },
      now: NOW,
    });
    const driving = reqs.filter((r) => r.topic === 'driving_time' && r.routeScope);
    const pairs = driving.map(
      (r) => `${r.routeScope.origin.entityId}->${r.routeScope.destination.entityId}`
    );
    expect(pairs).toEqual(expect.arrayContaining([
      'place:city:denver->nps:park:romo',
      'nps:park:romo->nps:park:dino',
      'nps:park:dino->place:known:flaming-gorge',
    ]));
    expect(driving.filter((r) => r.criticality === 'hard').length).toBeGreaterThanOrEqual(3);
  });

  test('fake Maps fulfills all 3 hard legs; coverage complete; google_maps present', async () => {
    const h = harness({
      getRoute: async () => fakeRoute({ durationSeconds: 9000 }),
    });
    const requirements = [
      routeRequirement(CITY, PARK_A, { ordinal: 0 }),
      routeRequirement(PARK_A, PARK_B, { ordinal: 1 }),
      routeRequirement(PARK_B, KNOWN, { ordinal: 2 }),
    ];
    const bundle = await h.broker.resolveEvidence({
      requirements,
      requestId: 'case7-replay',
    });
    expect(bundle.resolutions.every((r) => r.status === 'satisfied_fresh')).toBe(true);
    const publicSources = [...new Set(bundle.evidence.map((e) => e.source.provider))];
    expect(publicSources).toContain('google_maps');

    for (const req of requirements) {
      const candidates = bundle.evidence.filter((e) => e.entityId === req.entity.entityId);
      const coverage = evaluateRequirementCoverage(req, candidates, { now: NOW });
      expect(coverage.status).toBe('satisfied_fresh');
    }
  });

  test('provider timeout/error keeps hard requirement unmet — no fabricated duration', async () => {
    const h = harness({
      getRoute: async () => {
        throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
      },
    });
    const bundle = await h.broker.resolveEvidence({
      requirements: [routeRequirement(CITY, PARK_A)],
      requestId: 'maps-timeout',
    });
    expect(bundle.resolutions[0].status).not.toMatch(/^satisfied_/);
    expect(bundle.evidence).toHaveLength(0);
  });

  test('null route response remains unmet (fail-closed)', async () => {
    const h = harness({ getRoute: async () => null });
    const bundle = await h.broker.resolveEvidence({
      requirements: [routeRequirement(CITY, PARK_A)],
      requestId: 'maps-null',
    });
    expect(bundle.resolutions[0].status).toBe('missing');
    expect(bundle.evidence).toHaveLength(0);
  });
});

describe('Maps duration → max-drive + day feasibility (same evidence shape)', () => {
  function durationMinutesFromMapsEvidence(evidence) {
    const seconds = Number(evidence?.claim?.normalizedValue?.durationSeconds);
    if (!Number.isFinite(seconds)) return null;
    return Math.max(1, Math.round(seconds / 60));
  }

  test('220 min Maps duration under 240 max is allowed; 260 triggers max_daily_drive_exceeded', () => {
    const under = {
      claim: { normalizedValue: { durationSeconds: 220 * 60 } },
    };
    const over = {
      claim: { normalizedValue: { durationSeconds: 260 * 60 } },
    };
    const underMin = durationMinutesFromMapsEvidence(under);
    const overMin = durationMinutesFromMapsEvidence(over);
    expect(underMin).toBe(220);
    expect(overMin).toBe(260);

    const tripScope = { type: 'road_trip', maxDailyDriveMinutes: 240, destinations: [] };
    const ok = validateMaxDailyDrive({
      days: [{ dayNumber: 1, stops: [{ drivingTimeFromPreviousMin: underMin, duration: 60 }] }],
    }, tripScope);
    const bad = validateMaxDailyDrive({
      days: [{ dayNumber: 1, stops: [{ drivingTimeFromPreviousMin: overMin, duration: 60 }] }],
    }, tripScope);
    expect(ok.some((i) => i.reasonCode === 'max_daily_drive_exceeded')).toBe(false);
    expect(bad.some((i) => i.reasonCode === 'max_daily_drive_exceeded')).toBe(true);
  });

  test('drive 210 + activities breach global 14h day feasibility', () => {
    const mapsMinutes = durationMinutesFromMapsEvidence({
      claim: { normalizedValue: { durationSeconds: 210 * 60 } },
    });
    // 210 drive + 600 activity = 810; with buffers the validator uses drive+activity vs 14h.
    // Push activity so drive+activity exceeds 14h (840).
    const issues = validateDayDriveActivityFeasibility({
      days: [{
        dayNumber: 1,
        stops: [
          { drivingTimeFromPreviousMin: mapsMinutes, duration: 400 },
          { drivingTimeFromPreviousMin: 0, duration: 280 },
        ],
      }],
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => /feasib|overflow|schedule|drive/i.test(
      `${i.reasonCode || ''} ${i.type || ''} ${i.details || ''}`
    ))).toBe(true);
  });
});

describe('evidenceKey route identity for mixed inbound legs', () => {
  test('two routes into the same destination do not share a logical key', () => {
    const provider = createMapsEvidenceProvider({ mapsClient: {}, now: () => NOW });
    const a = provider.normalize(
      fakeRoute({ durationSeconds: 1000 }),
      provider.buildRequest(routeRequirement(CITY, PARK_A, { ordinal: 0 })),
      { observedAt: NOW.toISOString() }
    )[0];
    const b = provider.normalize(
      fakeRoute({ durationSeconds: 2000 }),
      provider.buildRequest(routeRequirement(PARK_B, PARK_A, { ordinal: 1 })),
      { observedAt: NOW.toISOString() }
    )[0];
    const keyA = buildEvidenceKeys(materializeCandidate(a, { now: NOW }));
    const keyB = buildEvidenceKeys(materializeCandidate(b, { now: NOW }));
    expect(keyA.logicalKey).not.toBe(keyB.logicalKey);
  });
});
