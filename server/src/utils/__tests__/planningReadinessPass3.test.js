'use strict';

/**
 * Planning Readiness Pass #3 — offline matrix (no providers / models / network).
 */

const {
  resolveDestinationsFromMessage,
  resolveOriginFromMessage,
} = require('../genericDestinationResolver');
const {
  buildTripScopeFromMessage,
  buildRouteLegs,
  parseMaxDailyDriveMinutes,
  detectRouteShape,
  drivingRouteScopesFromTripScope,
} = require('../roadTripContract');
const {
  validateDestinationCoverage,
  validateDestinationSequence,
  validateMaxDailyDrive,
  validateRouteLegCoverage,
  validateDayDriveActivityFeasibility,
  validateRoadTripContract,
  refineTripScopeAddDestination,
  refineTripScopeRemoveDestination,
  refineTripScopeRouteShape,
  collectPlanDestinationIds,
} = require('../roadTripValidators');
const { parseConstraints, buildConstraintBlock, validateItineraryConstraints } = require('../constraintEngine');
const { buildTripState } = require('../tripStateBuilder');
const { planEvidenceRequirements } = require('../../services/evidencePlannerService');
const { resolveEntitiesFromContext } = require('../../services/trailieV2RouteBridge');
const { classifyTrailieIntent } = require('../../services/trailieIntentClassifier');
const { PARK_NAME_TO_CODE } = require('../parkExtractor');

function fakeDest(id, order, coords = true) {
  return {
    entityId: `test:dest:${id}`,
    entityType: 'test_destination',
    parkCode: null,
    displayName: `Destination ${id.toUpperCase()}`,
    latitude: coords ? 40 + order : null,
    longitude: coords ? -105 - order : null,
    resolutionConfidence: coords ? 1 : 0.4,
    order,
    status: coords ? 'resolved' : 'unresolved_coords',
  };
}

function fakeOrigin() {
  return {
    entityId: 'place:city:test-origin',
    entityType: 'city',
    parkCode: null,
    displayName: 'Origin',
    latitude: 39.74,
    longitude: -104.99,
    resolutionConfidence: 0.95,
    order: -1,
    status: 'resolved',
  };
}

describe('Planning Readiness Pass #3 — multi-destination + road-trip', () => {
  test('CASE A — two destinations → multi_destination', () => {
    const scope = buildTripScopeFromMessage('Plan Destination A and Destination B over five days.', {
      destinations: [fakeDest('a', 0), fakeDest('b', 1)],
      origin: null,
    });
    expect(scope.type).toBe('multi_destination');
    expect(scope.destinations.map((d) => d.entityId)).toEqual(['test:dest:a', 'test:dest:b']);
  });

  test('CASE B — three destinations ordered', () => {
    const scope = buildTripScopeFromMessage('Visit A, B and C', {
      destinations: [fakeDest('a', 0), fakeDest('b', 1), fakeDest('c', 2)],
    });
    expect(scope.destinations).toHaveLength(3);
    expect(scope.destinations.map((d) => d.order)).toEqual([0, 1, 2]);
  });

  test('CASE C — explicit road trip with origin + legs', () => {
    const origin = fakeOrigin();
    const destinations = [fakeDest('a', 0), fakeDest('b', 1), fakeDest('c', 2)];
    const scope = buildTripScopeFromMessage(
      'Road trip from Origin through A, B and C.',
      { origin, destinations }
    );
    expect(scope.type).toBe('road_trip');
    expect(scope.origin.entityId).toBe(origin.entityId);
    expect(scope.transportMode).toBe('drive');
    expect(scope.routeLegs.map((l) => `${l.fromEntityId}->${l.toEntityId}`)).toEqual([
      'place:city:test-origin->test:dest:a',
      'test:dest:a->test:dest:b',
      'test:dest:b->test:dest:c',
    ]);
  });

  test('CASE D — loop adds return leg', () => {
    const origin = fakeOrigin();
    const destinations = [fakeDest('a', 0), fakeDest('b', 1), fakeDest('c', 2)];
    const scope = buildTripScopeFromMessage(
      'Make it a loop back to Origin through A, B and C road trip from Origin.',
      { origin, destinations }
    );
    expect(scope.routeShape).toBe('loop');
    const last = scope.routeLegs[scope.routeLegs.length - 1];
    expect(last.isLoopReturn).toBe(true);
    expect(last.fromEntityId).toBe('test:dest:c');
    expect(last.toEntityId).toBe(origin.entityId);
  });

  test('CASE E — one_way route shape', () => {
    expect(detectRouteShape('Start at Origin and finish at C.')).toBe('one_way');
    const scope = buildTripScopeFromMessage(
      'Road trip from Origin start at Origin and finish at C through A and B.',
      { origin: fakeOrigin(), destinations: [fakeDest('a', 0), fakeDest('b', 1), fakeDest('c', 2)] }
    );
    expect(scope.routeShape).toBe('one_way');
  });

  test('CASE F — destination_sequence_violation', () => {
    const tripScope = {
      type: 'road_trip',
      destinations: [fakeDest('a', 0), fakeDest('b', 1), fakeDest('c', 2)],
      destinationOrderExplicit: true,
      userSuppliedOrder: true,
      optimizationRequested: false,
    };
    const plan = {
      days: [
        { dayNumber: 1, destinationEntityId: 'test:dest:a', stops: [] },
        { dayNumber: 2, destinationEntityId: 'test:dest:c', stops: [] },
        { dayNumber: 3, destinationEntityId: 'test:dest:b', stops: [] },
      ],
    };
    const issues = validateDestinationSequence(plan, tripScope);
    expect(issues.some((i) => i.reasonCode === 'destination_sequence_violation')).toBe(true);
  });

  test('CASE G — missing_requested_destination', () => {
    const tripScope = {
      type: 'multi_destination',
      destinations: [fakeDest('a', 0), fakeDest('b', 1), fakeDest('c', 2)],
    };
    const plan = {
      days: [
        { dayNumber: 1, destinationEntityId: 'test:dest:a', stops: [] },
        { dayNumber: 2, destinationEntityId: 'test:dest:b', stops: [] },
      ],
    };
    const issues = validateDestinationCoverage(plan, tripScope);
    expect(issues).toHaveLength(1);
    expect(issues[0].reasonCode).toBe('missing_requested_destination');
    expect(issues[0].entityId).toBe('test:dest:c');
  });

  test('CASE H — drive limit fail', () => {
    const tripScope = { maxDailyDriveMinutes: 240, type: 'road_trip', destinations: [] };
    const plan = {
      days: [{
        dayNumber: 2,
        stops: [{ name: 'Drive', duration: 30, drivingTimeFromPreviousMin: 320 }],
      }],
    };
    const issues = validateMaxDailyDrive(plan, tripScope);
    expect(issues.some((i) => i.reasonCode === 'max_daily_drive_exceeded')).toBe(true);
  });

  test('CASE I — drive limit pass', () => {
    const tripScope = { maxDailyDriveMinutes: 240, type: 'road_trip', destinations: [] };
    const plan = {
      days: [{
        dayNumber: 2,
        stops: [{ name: 'Drive', duration: 60, drivingTimeFromPreviousMin: 200 }],
      }],
    };
    expect(validateMaxDailyDrive(plan, tripScope)).toHaveLength(0);
  });

  test('CASE J — unknown route evidence cannot claim verified feasibility', () => {
    const destinations = [fakeDest('a', 0), fakeDest('b', 1)];
    const { routeLegs, unresolvedRouteLegs } = buildRouteLegs({
      origin: null,
      destinations,
      routeShape: 'unknown',
    });
    const tripScope = {
      type: 'road_trip',
      destinations,
      routeLegs,
      unresolvedRouteLegs,
    };
    const issues = validateRouteLegCoverage(tripScope, { drivingEvidenceLegs: [] });
    expect(issues.some((i) => i.reasonCode === 'missing_route_evidence')).toBe(true);
    expect(issues.every((i) => i.verifiedFeasible === false)).toBe(true);
  });

  test('CASE K — coordinate hydration → Evidence Planner driving_time', () => {
    const tripScope = buildTripScopeFromMessage(
      'Road trip from Origin through A and B.',
      { origin: fakeOrigin(), destinations: [fakeDest('a', 0), fakeDest('b', 1)] }
    );
    const entities = tripScope.destinations.map((d) => ({
      entityId: d.entityId,
      displayName: d.displayName,
      latitude: d.latitude,
      longitude: d.longitude,
    }));
    const reqs = planEvidenceRequirements({
      turnId: 'pass3-k',
      userPrompt: 'Road trip from Origin through A and B over 5 days',
      intent: {
        primaryIntent: 'full_trip',
        entities: [],
        verticals: ['itinerary'],
        depth: 'planning',
        freshness: 'planning',
        actionability: 'planning',
        scope: 'multi_destination',
      },
      resolvedEntities: entities,
      tripScope,
      constraints: { interests: [] },
    });
    const driving = reqs.filter((r) => r.topic === 'driving_time' && r.routeScope);
    expect(driving.length).toBeGreaterThanOrEqual(2);
    const pairs = driving.map(
      (r) => `${r.routeScope.origin.entityId}->${r.routeScope.destination.entityId}`
    );
    expect(pairs).toContain('place:city:test-origin->test:dest:a');
    expect(pairs).toContain('test:dest:a->test:dest:b');
  });

  test('CASE L — no coordinates → unresolved route, no fabricated driving_time scopes', () => {
    const destinations = [fakeDest('a', 0, false), fakeDest('b', 1, false)];
    const tripScope = buildTripScopeFromMessage('Road trip through A and B', {
      origin: null,
      destinations,
    });
    expect(tripScope.unresolvedRouteLegs.length).toBeGreaterThan(0);
    expect(drivingRouteScopesFromTripScope(tripScope)).toHaveLength(0);
  });

  // Updated 2026-08-23 (planning entry reliability pass). This case previously
  // asserted `multi_destination`, which is what made a two-park COMPARISON look
  // like a two-park TRIP: it demanded an inter-destination identity contract and
  // stonewalled the traveler before the model was ever called. `comparison_set`
  // keeps both candidates while asserting no trip shape — which is what the
  // case name ("compare is not road_trip") always meant.
  test('CASE M — compare is a comparison, not a trip shape', () => {
    const scope = buildTripScopeFromMessage('Compare Destination A and Destination B', {
      destinations: [fakeDest('a', 0), fakeDest('b', 1)],
    });
    expect(scope.type).toBe('comparison_set');
    expect(scope.type).not.toBe('road_trip');
    expect(scope.type).not.toBe('multi_destination');
    expect(scope.routeLegs).toHaveLength(0);
  });

  test('CASE N — optimization requested → userSuppliedOrder false', () => {
    const scope = buildTripScopeFromMessage(
      'Visit A, B, C in the most efficient order.',
      { destinations: [fakeDest('a', 0), fakeDest('b', 1), fakeDest('c', 2)] }
    );
    expect(scope.optimizationRequested).toBe(true);
    expect(scope.userSuppliedOrder).toBe(false);
  });

  test('CASE O — drive + activities exceed global 14h guard', () => {
    const plan = {
      days: [{
        dayNumber: 1,
        bufferMinutes: 120,
        stops: [
          { name: 'Drive', duration: 0, drivingTimeFromPreviousMin: 5 * 60 },
          { name: 'Hike', duration: 7 * 60, drivingTimeFromPreviousMin: 0 },
        ],
      }],
    };
    // 5h drive + 7h activities + 2h buffer = 14h exactly is OK; push over with 5+7+2.5
    plan.days[0].bufferMinutes = 150;
    const issues = validateDayDriveActivityFeasibility(plan);
    expect(issues.some((i) => i.reasonCode === 'drive_activity_day_overflow')).toBe(true);

    const viaEngine = validateItineraryConstraints(plan, {
      hasConstraints: true,
      dates: {},
      interests: [],
    });
    expect(viaEngine.some((i) => i.type === 'schedule_overflow')).toBe(true);
  });

  test('CASE P — validation uses entity ids not display names', () => {
    const tripScope = {
      type: 'multi_destination',
      destinations: [
        { ...fakeDest('a', 0), displayName: 'Ambiguous Park' },
        { ...fakeDest('b', 1), displayName: 'Ambiguous Park' },
      ],
      destinationOrderExplicit: true,
      userSuppliedOrder: true,
    };
    const plan = {
      days: [
        { destinationEntityId: 'test:dest:a', stops: [{ name: 'Ambiguous Park' }] },
        { destinationEntityId: 'test:dest:b', stops: [{ name: 'Ambiguous Park' }] },
      ],
    };
    // Day-level ids used only because stops lack entity ids.
    expect(collectPlanDestinationIds(plan)).toEqual(['test:dest:a', 'test:dest:b']);
    expect(validateDestinationCoverage(plan, tripScope)).toHaveLength(0);
  });

  test('sequence prefers stop collapse over day majority label', () => {
    // Day labeled as B, but stops visit A then B — sequence must be A→B.
    const tripScope = {
      type: 'multi_destination',
      destinations: [fakeDest('a', 0), fakeDest('b', 1)],
      destinationOrderExplicit: true,
      userSuppliedOrder: true,
    };
    const plan = {
      days: [{
        dayNumber: 1,
        destinationEntityId: 'test:dest:b',
        stops: [
          { name: 'Morning at A', destinationEntityId: 'test:dest:a', duration: 120 },
          { name: 'Drive', duration: 60, drivingTimeFromPreviousMin: 90 },
          { name: 'Evening at B', destinationEntityId: 'test:dest:b', duration: 120 },
        ],
      }],
    };
    expect(collectPlanDestinationIds(plan)).toEqual(['test:dest:a', 'test:dest:b']);
    expect(validateDestinationSequence(plan, tripScope)).toHaveLength(0);

    const wrong = {
      days: [{
        stops: [
          { destinationEntityId: 'test:dest:a' },
          { destinationEntityId: 'test:dest:a' },
          { destinationEntityId: 'test:dest:c' },
          { destinationEntityId: 'test:dest:b' },
        ],
      }],
    };
    expect(collectPlanDestinationIds(wrong)).toEqual([
      'test:dest:a',
      'test:dest:c',
      'test:dest:b',
    ]);
  });

  test('PART 20 — real catalog resolves parks outside tiny PARK_CODES', () => {
    // romo / blca / meve were classic PARK_CODES misses; yell was present.
    expect(PARK_NAME_TO_CODE.has('rocky mountain')).toBe(true);
    expect(PARK_NAME_TO_CODE.has('black canyon')).toBe(true);
    expect(PARK_NAME_TO_CODE.has('mesa verde')).toBe(true);

    const msg =
      'Road trip from Denver through Rocky Mountain, Black Canyon, and Mesa Verde over 7 days.';
    const destinations = resolveDestinationsFromMessage(msg);
    const codes = destinations.map((d) => d.parkCode);
    expect(codes).toEqual(['romo', 'blca', 'meve']);
    for (const d of destinations) {
      expect(d.entityId).toMatch(/^nps:park:/);
      expect(d.latitude).not.toBeNull();
      expect(d.longitude).not.toBeNull();
      expect(d.status).toBe('resolved');
    }

    const origin = resolveOriginFromMessage(msg);
    expect(origin?.displayName?.toLowerCase()).toContain('denver');
    expect(origin?.latitude).not.toBeNull();

    const scope = buildTripScopeFromMessage(msg);
    expect(scope.type).toBe('road_trip');
    expect(scope.destinations.map((d) => d.parkCode)).toEqual(['romo', 'blca', 'meve']);
    expect(scope.origin?.entityId).toMatch(/denver/);
    expect(scope.routeLegs.length).toBeGreaterThanOrEqual(3);

    // Also resolve a previously-known park without adding to PARK_CODES path.
    const yellGrte = resolveDestinationsFromMessage(
      'Plan Yellowstone and Grand Teton in five days.'
    );
    expect(yellGrte.map((d) => d.parkCode).sort()).toEqual(['grte', 'yell']);
  });

  test('PART 21 — Evidence Planner multi-entity adjacent driving_time', () => {
    const msg =
      'Road trip from Denver through Rocky Mountain, Black Canyon, and Mesa Verde over 7 days.';
    const scope = buildTripScopeFromMessage(msg);
    const entities = scope.destinations.map((d) => ({
      entityId: d.entityId,
      displayName: d.displayName,
      latitude: d.latitude,
      longitude: d.longitude,
    }));
    const reqs = planEvidenceRequirements({
      turnId: 'pass3-21',
      userPrompt: msg,
      intent: {
        primaryIntent: 'full_trip',
        entities: [],
        verticals: ['itinerary'],
        depth: 'planning',
        freshness: 'planning',
        actionability: 'planning',
        scope: 'multi_destination',
      },
      resolvedEntities: entities,
      tripScope: scope,
      constraints: { interests: ['hiking'] },
    });

    for (const code of ['romo', 'blca', 'meve']) {
      expect(reqs.some((r) => r.entity?.entityId === `nps:park:${code}` && r.topic === 'activities')).toBe(true);
    }
    const drivingPairs = reqs
      .filter((r) => r.topic === 'driving_time' && r.routeScope)
      .map((r) => `${r.routeScope.origin.entityId}->${r.routeScope.destination.entityId}`);
    expect(drivingPairs.some((p) => p.includes('romo') && p.includes('blca'))).toBe(true);
    expect(drivingPairs.some((p) => p.includes('blca') && p.includes('meve'))).toBe(true);
    expect(drivingPairs.some((p) => p.includes('denver') && p.includes('romo'))).toBe(true);
  });

  test('PART 23 — refinement add / remove / routeShape', () => {
    let scope = buildTripScopeFromMessage('Road trip from Origin through A and B over 5 days.', {
      origin: fakeOrigin(),
      destinations: [fakeDest('a', 0), fakeDest('b', 1)],
    });
    scope = refineTripScopeAddDestination(scope, fakeDest('c', 2));
    expect(scope.destinations.map((d) => d.entityId)).toEqual([
      'test:dest:a',
      'test:dest:b',
      'test:dest:c',
    ]);
    expect(scope.routeLegs.some((l) => l.fromEntityId === 'test:dest:b' && l.toEntityId === 'test:dest:c')).toBe(true);

    scope = refineTripScopeRemoveDestination(scope, 'test:dest:b');
    expect(scope.destinations.map((d) => d.entityId)).toEqual(['test:dest:a', 'test:dest:c']);
    expect(scope.routeLegs.some((l) => l.fromEntityId === 'test:dest:a' && l.toEntityId === 'test:dest:c')).toBe(true);
    expect(scope.routeLegs.some((l) => l.toEntityId === 'test:dest:b' || l.fromEntityId === 'test:dest:b')).toBe(false);

    scope = refineTripScopeRouteShape(scope, 'one_way');
    expect(scope.routeShape).toBe('one_way');
    expect(scope.routeLegs.every((l) => !l.isLoopReturn)).toBe(true);
  });

  test('unrelated constraints survive tripScope attach', () => {
    const c = parseConstraints(
      { formData: { budget: 800, fitnessLevel: 'moderate', accommodation: 'camping' } },
      'Road trip from Denver through Rocky Mountain and Mesa Verde. Four friends. Keep driving under 4 hours/day. We love hiking.'
    );
    expect(Number(c.budget)).toBe(800);
    expect(c.fitnessLevel).toBe('moderate');
    expect(c.accommodation).toBe('camping');
    expect(c.travelParty).toBe('friends');
    expect(c.groupSize).toBe(4);
    expect(c.interests).toContain('hiking');
    expect(c.maxDailyDriveMinutes).toBe(240);
    expect(c.tripScope.type).toBe('road_trip');
    expect(c.tripScope.destinations.map((d) => d.parkCode)).toEqual(['romo', 'meve']);

    const block = buildConstraintBlock(c);
    expect(block).toMatch(/TRIP SCOPE/);
    expect(block).toMatch(/Maximum daily driving/);
    expect(block).toMatch(/romo|Rocky/i);

    const state = buildTripState({
      constraints: c,
      allExtractedParks: c.tripScope.destinations.map((d) => ({
        parkCode: d.parkCode,
        parkName: d.displayName,
        lat: d.latitude,
        lon: d.longitude,
      })),
      lastUserMessage: 'Road trip from Denver through Rocky Mountain and Mesa Verde.',
    });
    expect(state.tripScope?.type).toBe('road_trip');
    expect(state.preferences.maxDailyDriveMinutes).toBe(240);
    expect(Number(state.preferences.budget)).toBe(800);
    expect(state.travelers.groupType).toBe('friends');
  });

  test('route bridge hydrates entities from tripScope / catalog', () => {
    const msg = 'Plan Rocky Mountain and Mesa Verde over five days.';
    const c = parseConstraints({}, msg);
    const entities = resolveEntitiesFromContext({
      constraints: c,
      lastUserMessage: msg,
      allExtractedParks: [
        { parkCode: 'romo', parkName: 'Rocky Mountain', lat: null, lon: null },
        { parkCode: 'meve', parkName: 'Mesa Verde', lat: null, lon: null },
      ],
    });
    expect(entities.map((e) => e.entityId)).toEqual(['nps:park:romo', 'nps:park:meve']);
    expect(entities.every((e) => e.latitude != null && e.longitude != null)).toBe(true);
  });

  test('classifier multi-dest uses catalog (not tiny PARK_CODES only)', () => {
    const intent = classifyTrailieIntent({
      userPrompt: 'Plan a 7 day itinerary for Rocky Mountain, Black Canyon, and Mesa Verde',
    });
    expect(intent.scope).toBe('multi_destination');
    const ids = intent.entities
      .filter((e) => e.type === 'destination')
      .map((e) => e.canonicalId);
    expect(ids).toEqual(expect.arrayContaining([
      'park:nps:romo',
      'park:nps:blca',
      'park:nps:meve',
    ]));
  });

  test('parseMaxDailyDriveMinutes only when explicit', () => {
    expect(parseMaxDailyDriveMinutes('road trip through parks')).toBeNull();
    expect(parseMaxDailyDriveMinutes('no more than 4 hours driving per day')).toBe(240);
    expect(parseMaxDailyDriveMinutes('keep driving under 5 hours/day')).toBe(300);
  });

  test('validateItineraryConstraints wires road-trip issues', () => {
    const tripScope = {
      type: 'multi_destination',
      destinations: [fakeDest('a', 0), fakeDest('b', 1), fakeDest('c', 2)],
      destinationOrderExplicit: true,
      userSuppliedOrder: true,
      maxDailyDriveMinutes: 240,
      routeLegs: [],
      unresolvedRouteLegs: [],
    };
    const plan = {
      days: [
        {
          dayNumber: 1,
          destinationEntityId: 'test:dest:a',
          stops: [{ name: 'A', duration: 60, drivingTimeFromPreviousMin: 0 }],
        },
        {
          dayNumber: 2,
          destinationEntityId: 'test:dest:c',
          stops: [{ name: 'C', duration: 60, drivingTimeFromPreviousMin: 300 }],
        },
        {
          dayNumber: 3,
          destinationEntityId: 'test:dest:b',
          stops: [{ name: 'B', duration: 60, drivingTimeFromPreviousMin: 0 }],
        },
      ],
    };
    const issues = validateItineraryConstraints(plan, {
      hasConstraints: true,
      dates: {},
      interests: [],
      maxDailyDriveMinutes: 240,
      tripScope,
    });
    expect(issues.some((i) => i.reasonCode === 'destination_sequence_violation')).toBe(true);
    expect(issues.some((i) => i.reasonCode === 'max_daily_drive_exceeded')).toBe(true);
  });

  test('validateRoadTripContract exports composite', () => {
    const issues = validateRoadTripContract(
      { days: [{ destinationEntityId: 'test:dest:a', stops: [] }] },
      {
        type: 'multi_destination',
        destinations: [fakeDest('a', 0), fakeDest('b', 1)],
      }
    );
    expect(issues.some((i) => i.reasonCode === 'missing_requested_destination')).toBe(true);
  });
});
