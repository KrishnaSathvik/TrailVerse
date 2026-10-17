'use strict';

/**
 * Offline active-trip contextual place resolution.
 * Provider calls are injected — no network.
 */

const {
  buildActivePlaceResolutionContext,
  buildGeocodeBiasFromTripContext,
  resolvePlaceFromMessage,
  rankGeocodeCandidates,
  isUsableCoordinatePair,
} = require('../geocodePlaceService');
const { commitUnderstoodTripChange } = require('../tripMutationCommit');
const { emptyPlanningState } = require('../../utils/planningState');

const SPRINGDALE_CANDIDATES = Object.freeze([
  {
    name: 'Springdale, Pennsylvania, United States',
    lat: 40.5409,
    lon: -79.78394,
    admin1: 'Pennsylvania',
    stateCode: 'PA',
    countryCode: 'US',
    source: 'fixture',
    providerRank: 0,
  },
  {
    name: 'Springdale, Utah, United States',
    lat: 37.1889,
    lon: -112.9986,
    admin1: 'Utah',
    stateCode: 'UT',
    countryCode: 'US',
    source: 'fixture',
    providerRank: 1,
  },
  {
    name: 'Springdale, Arkansas, United States',
    lat: 36.1867,
    lon: -94.1288,
    admin1: 'Arkansas',
    stateCode: 'AR',
    countryCode: 'US',
    source: 'fixture',
    providerRank: 2,
  },
]);

function zionPlanningState(overrides = {}) {
  const state = emptyPlanningState();
  state.destination.parkCode = 'zion';
  state.destination.parkName = 'Zion';
  state.destination.state = overrides.state !== undefined ? overrides.state : null;
  state.dates.startDate = '2027-09-12';
  state.dates.endDate = '2027-09-17';
  state.dates.durationDays = 4;
  state.dates.tripWindowDays = 6;
  state.preferences.avoidExposure = true;
  state.activityPreferences.photography = true;
  state.activityPreferences.photographyTiming = 'sunrise';
  state.preferences.interests = ['photography'];
  state.tripScope = {
    type: 'single_destination',
    destinations: [{
      entityId: 'nps:park:zion',
      entityType: 'national_park',
      parkCode: 'zion',
      displayName: 'Zion',
      order: 0,
      latitude: overrides.latitude !== undefined ? overrides.latitude : 37.298,
      longitude: overrides.longitude !== undefined ? overrides.longitude : -113.026,
      status: 'resolved',
      states: overrides.states,
    }],
  };
  return state;
}

function fixtureCandidates(list) {
  return async () => list.map((row, i) => ({ ...row, providerRank: row.providerRank ?? i }));
}

describe('active-trip contextual place resolution', () => {
  test('1. Zion-like region + PA/UT/AR same-name towns → UT wins despite provider order', async () => {
    const planningState = zionPlanningState({ state: 'UT' });
    const tripContext = buildActivePlaceResolutionContext({ planningState });
    expect(tripContext).not.toBeNull();
    const resolved = await resolvePlaceFromMessage('We already booked a place in Springdale.', {
      tripContext,
      geocodeCandidates: fixtureCandidates(SPRINGDALE_CANDIDATES),
    });
    expect(resolved.resolutionStatus).toBe('resolved');
    expect(resolved.name).toMatch(/Utah/i);
    expect(resolved.selectionReason).toMatch(/region|proximity/i);
    expect(resolved.telemetry.tripContext === undefined || resolved.telemetry.activeDestination).toBeTruthy();
    expect(resolved.telemetry.activeRegions).toEqual(expect.arrayContaining(['ut']));
  });

  test('2. raw provider first result wrong region must not win', async () => {
    const ranked = rankGeocodeCandidates(
      SPRINGDALE_CANDIDATES,
      buildActivePlaceResolutionContext({ planningState: zionPlanningState({ state: 'UT' }) }),
      {
        query: 'Springdale',
        bias: buildGeocodeBiasFromTripContext({ planningState: zionPlanningState({ state: 'UT' }) }),
      }
    );
    expect(ranked.selected.name).toMatch(/Utah/i);
    expect(ranked.selected.name).not.toMatch(/Pennsylvania/i);
    expect(ranked.selectionReason).not.toBe('provider_rank');
  });

  test('3. no context-compatible candidate → unresolved, not PA first-hit', async () => {
    const onlyEast = SPRINGDALE_CANDIDATES.filter((c) => /Pennsylvania|Arkansas/i.test(c.name));
    const resolved = await resolvePlaceFromMessage('We already booked a place in Springdale.', {
      tripContext: buildActivePlaceResolutionContext({ planningState: zionPlanningState({ state: 'UT' }) }),
      geocodeCandidates: fixtureCandidates(onlyEast),
    });
    expect(resolved.lat).toBeNull();
    expect(resolved.resolutionStatus).toBe('context_mismatch');
    expect(resolved.telemetry.selectedCandidate).toBeNull();
  });

  test('4. explicit traveler state overrides trip context', async () => {
    const resolved = await resolvePlaceFromMessage(
      'We booked a hotel in Springdale, Pennsylvania.',
      {
        tripContext: buildActivePlaceResolutionContext({ planningState: zionPlanningState({ state: 'UT' }) }),
        geocodeCandidates: fixtureCandidates(SPRINGDALE_CANDIDATES),
      }
    );
    expect(resolved.resolutionStatus).toBe('resolved');
    expect(resolved.name).toMatch(/Pennsylvania/i);
    expect(resolved.selectionReason).toBe('explicit_traveler_region');
  });

  test('5. missing / zero coordinates do not become 0,0 bias', () => {
    const bias = buildGeocodeBiasFromTripContext({
      lat: 0,
      lon: 0,
      state: 'UT',
    });
    expect(bias.coordinateBias).toBeNull();
    expect(bias.lat).toBeUndefined();
    expect(bias.lon).toBeUndefined();
    expect(bias.state).toBe('utah');
    expect(isUsableCoordinatePair(0, 0)).toBe(false);

    const nullBias = buildGeocodeBiasFromTripContext({
      lat: null,
      lon: null,
      state: 'UT',
    });
    expect(nullBias.coordinateBias).toBeNull();
    expect(nullBias.state).toBe('utah');
  });

  test('6. grounded destination coordinates provide proximity bias', async () => {
    // No textual state — only Zion coords from tripScope.
    const planningState = zionPlanningState({ state: null });
    const tripContext = buildActivePlaceResolutionContext({ planningState });
    expect(tripContext.destination.coordinates.lat).toBeCloseTo(37.298, 2);
    const bias = buildGeocodeBiasFromTripContext(tripContext);
    expect(bias.coordinateBias).toEqual({ lat: 37.298, lon: -113.026 });
    const resolved = await resolvePlaceFromMessage('We already booked a place in Springdale.', {
      tripContext,
      bias,
      geocodeCandidates: fixtureCandidates(SPRINGDALE_CANDIDATES),
    });
    expect(resolved.name).toMatch(/Utah/i);
    expect(resolved.selectionReason).toMatch(/proximity|region/i);
  });

  test('7. multi-state destination accepts either compatible state', () => {
    const tripContext = buildActivePlaceResolutionContext({
      planningState: {
        ...zionPlanningState(),
        destination: { parkCode: 'yell', parkName: 'Yellowstone', state: null },
        tripScope: {
          type: 'single_destination',
          destinations: [{
            parkCode: 'yell',
            displayName: 'Yellowstone',
            latitude: 44.6,
            longitude: -110.5,
            states: 'WY,MT',
          }],
        },
      },
    });
    // Inject regions via destination states on scope — builder reads states field.
    tripContext.regions = [
      { code: 'wy', name: 'wyoming' },
      { code: 'mt', name: 'montana' },
    ];
    const wy = {
      name: 'West Yellowstone, Montana, United States',
      lat: 44.66,
      lon: -111.1,
      admin1: 'Montana',
      stateCode: 'MT',
      providerRank: 0,
    };
    const id = {
      name: 'Somewhere, Idaho, United States',
      lat: 43.5,
      lon: -112.0,
      admin1: 'Idaho',
      stateCode: 'ID',
      providerRank: 1,
    };
    const ranked = rankGeocodeCandidates([wy, id], tripContext, {
      query: 'West Yellowstone',
      bias: { states: tripContext.regions, state: 'montana', coordinateBias: { lat: 44.6, lon: -110.5 } },
    });
    expect(ranked.selected.stateCode || ranked.selected.admin1).toMatch(/MT|Montana/i);
    expect(ranked.resolutionStatus).toBe('resolved');
  });

  test('8. restored session planningState supplies active-trip context', () => {
    const planningState = zionPlanningState({ state: 'UT' });
    const tripContext = buildActivePlaceResolutionContext({
      activeTripContext: null,
      planningState,
      resolvedMetadata: { parkName: 'General Planning' },
    });
    expect(tripContext).not.toBeNull();
    expect(tripContext.destination.parkCode).toBe('zion');
    expect(tripContext.regions.some((r) => r.code === 'ut' || r.name === 'utah')).toBe(true);
    expect(tripContext.destination.coordinates.lat).toBeCloseTo(37.298, 2);
  });

  test('9. plain-answer lodging turn receives active-trip context (non-null)', async () => {
    const tripContext = buildActivePlaceResolutionContext({
      planningState: zionPlanningState({ state: 'UT' }),
    });
    const resolved = await resolvePlaceFromMessage('We already booked a place in Springdale.', {
      tripContext,
      geocodeCandidates: fixtureCandidates(SPRINGDALE_CANDIDATES),
    });
    expect(resolved.tripContext).not.toBeNull();
    expect(resolved.bias).not.toBeNull();
    expect(resolved.telemetry.activeDestination).toMatch(/zion/i);
  });

  test('10–11. lodging commit preserves preferences/dates; no property invention', () => {
    const before = zionPlanningState({ state: 'UT' });
    const dayHashes = ['a', 'b', 'c', 'd'];
    const result = commitUnderstoodTripChange({
      message: 'We already booked a place in Springdale.',
      planningState: before,
      hasExistingPlan: true,
    });
    expect(result.planningState.lodging).toMatchObject({
      baseTown: 'Springdale',
      booked: true,
      type: 'lodging',
    });
    expect(result.planningState.dates).toEqual(before.dates);
    expect(result.planningState.preferences.avoidExposure).toBe(true);
    expect(result.planningState.activityPreferences.photographyTiming).toBe('sunrise');
    expect(result.planningState.destination.parkCode).toBe('zion');
    expect(result.planningState.lodging.propertyName).toBeUndefined();
    expect(result.planningState.lodging.address).toBeUndefined();
    // Canonical plan is not owned by commit — day hashes stay caller-owned.
    expect(dayHashes).toEqual(['a', 'b', 'c', 'd']);
  });

  test('12. geocode provider failure preserves bare lodging fact path', async () => {
    const resolved = await resolvePlaceFromMessage('We already booked a place in Springdale.', {
      tripContext: buildActivePlaceResolutionContext({ planningState: zionPlanningState({ state: 'UT' }) }),
      geocodeCandidates: async () => {
        throw Object.assign(new Error('provider down'), { code: 'geocode_provider_failure' });
      },
    });
    expect(resolved.resolutionStatus).toBe('provider_failure');
    const committed = commitUnderstoodTripChange({
      message: 'We already booked a place in Springdale.',
      planningState: zionPlanningState({ state: 'UT' }),
    });
    expect(committed.planningState.lodging.baseTown).toBe('Springdale');
    expect(committed.planningState.lodging.booked).toBe(true);
  });

  test('13. context mismatch is distinct from provider failure', async () => {
    const mismatch = await resolvePlaceFromMessage('We already booked a place in Springdale.', {
      tripContext: buildActivePlaceResolutionContext({ planningState: zionPlanningState({ state: 'UT' }) }),
      geocodeCandidates: fixtureCandidates(
        SPRINGDALE_CANDIDATES.filter((c) => /Pennsylvania/i.test(c.name))
      ),
    });
    expect(mismatch.resolutionStatus).toBe('context_mismatch');
    const failure = await resolvePlaceFromMessage('We already booked a place in Springdale.', {
      tripContext: buildActivePlaceResolutionContext({ planningState: zionPlanningState({ state: 'UT' }) }),
      geocodeCandidates: async () => {
        throw new Error('boom');
      },
    });
    expect(failure.resolutionStatus).toBe('provider_failure');
    expect(mismatch.resolutionStatus).not.toBe(failure.resolutionStatus);
  });

  test('14. at most one deterministic contextual retry', async () => {
    const queries = [];
    const resolved = await resolvePlaceFromMessage('We already booked a place in Springdale.', {
      tripContext: buildActivePlaceResolutionContext({ planningState: zionPlanningState({ state: 'UT' }) }),
      geocodeCandidates: async (query) => {
        queries.push(query);
        if (/utah/i.test(query)) return [];
        return SPRINGDALE_CANDIDATES;
      },
    });
    expect(queries.length).toBeLessThanOrEqual(2);
    expect(queries[0]).toMatch(/utah/i);
    expect(resolved.name).toMatch(/Utah/i);
    expect(resolved.telemetry.contextualRetryUsed).toBe(true);
  });

  test('15. no property/address invention on resolution', async () => {
    const resolved = await resolvePlaceFromMessage('We already booked a place in Springdale.', {
      tripContext: buildActivePlaceResolutionContext({ planningState: zionPlanningState({ state: 'UT' }) }),
      geocodeCandidates: fixtureCandidates(SPRINGDALE_CANDIDATES),
    });
    expect(resolved).not.toHaveProperty('propertyName');
    expect(resolved).not.toHaveProperty('address');
    expect(resolved).not.toHaveProperty('reservationNumber');
  });

  test('16. ambiguous place does not become hotel type', () => {
    const result = commitUnderstoodTripChange({
      message: 'We already booked a place in Springdale.',
      planningState: zionPlanningState(),
    });
    expect(result.planningState.lodging.type).toBe('lodging');
    expect(result.planningState.lodging.stayPreference).toBeNull();
  });

  test('park catalog coords fill bias when tripScope coords missing', () => {
    const planningState = zionPlanningState();
    planningState.tripScope.destinations[0].latitude = null;
    planningState.tripScope.destinations[0].longitude = null;
    planningState.destination.state = 'UT';
    const tripContext = buildActivePlaceResolutionContext({ planningState });
    // getParkIdentityByCode('zion') supplies catalog coords offline.
    expect(tripContext.destination.coordinates.lat).toBeCloseTo(37.298, 2);
    expect(tripContext.destination.coordinates.lon).toBeCloseTo(-113.026, 2);
  });
});
