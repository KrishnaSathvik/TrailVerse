'use strict';

const {
  buildPlanningStateFromRuntime,
  normalizePersistedPlanningState,
  applyDepartureContextToPlanningState,
} = require('../planningState');
const { buildTripState } = require('../tripStateBuilder');
const { extractUserCity } = require('../../services/factsService');
const { parseConstraints } = require('../constraintEngine');

describe('travel logistics persistence', () => {
  test('departureAirportCode and stayPreference survive normalizePersistedPlanningState', () => {
    const { state } = normalizePersistedPlanningState({
      lodging: { type: 'lodging', stayPreference: 'lodge', baseTown: null, booked: null },
      transportation: {
        mode: 'fly',
        startLocation: 'St. Louis',
        airport: 'STL',
        departureCity: 'St. Louis',
        departureAirportCode: 'STL',
        rentalCar: true,
      },
    });

    expect(state.transportation.departureAirportCode).toBe('STL');
    expect(state.transportation.departureCity).toBe('St. Louis');
    expect(state.transportation.rentalCar).toBe(true);
    expect(state.lodging.stayPreference).toBe('lodge');
  });

  test('lastTravelerJob survives persist and runtime rebuild', () => {
    const { state } = normalizePersistedPlanningState({
      lastTravelerJob: 'airport_strategy',
    });
    expect(state.lastTravelerJob).toBe('airport_strategy');

    const rebuilt = buildPlanningStateFromRuntime({
      previous: state,
      constraints: { travelerJob: 'origin_refinement' },
    });
    expect(rebuilt.lastTravelerJob).toBe('origin_refinement');
  });

  test('"make the trip slower" writes a relaxed pace preference', () => {
    const constraints = parseConstraints({}, 'Actually make the trip slower.');
    expect(constraints.pace).toBe('relaxed');
  });

  test('buildPlanningStateFromRuntime retains airport fields from tripState', () => {
    const state = buildPlanningStateFromRuntime({
      tripState: {
        lodging: { type: 'lodging', stayPreference: 'hotel' },
        transportation: {
          mode: 'fly',
          startLocation: 'Kansas City',
          airport: 'MCI',
          departureCity: 'Kansas City',
          rentalCar: true,
        },
      },
    });
    expect(state.transportation.departureCity).toBe('Kansas City');
    expect(state.transportation.airport).toBe('MCI');
    expect(state.transportation.departureAirportCode).toBe('MCI');
    expect(state.transportation.rentalCar).toBe(true);
  });

  test('extractUserCity resolves St. Louis with period and maps display name', () => {
    const city = extractUserCity(
      'Plan 5 days in Yellowstone from St. Louis. We will fly and stay in a lodge.'
    );
    expect(city).toMatchObject({
      name: 'St. Louis',
      state: 'MO',
    });
    expect(Number.isFinite(city.lat)).toBe(true);
    expect(Number.isFinite(city.lon)).toBe(true);
  });

  test('applyDepartureContextToPlanningState sets STL for St. Louis fly cue', () => {
    const base = buildPlanningStateFromRuntime({
      constraints: parseConstraints(
        {},
        'Plan 5 days in Yellowstone from St. Louis. We will fly and stay in a lodge.'
      ),
    });
    const city = extractUserCity(
      'Plan 5 days in Yellowstone from St. Louis. We will fly and stay in a lodge.'
    );
    const next = applyDepartureContextToPlanningState(
      base,
      city,
      'Plan 5 days in Yellowstone from St. Louis. We will fly and stay in a lodge.'
    );
    expect(next.transportation.mode).toBe('fly');
    expect(next.transportation.departureCity).toBe('St. Louis');
    expect(next.transportation.departureAirportCode).toBe('STL');
    expect(next.transportation.airport).toBe('STL');
  });

  test('message day-count overrides seed and prefers the last mention', () => {
    const prior = {
      dates: { startDate: null, endDate: null, durationDays: 5 },
      lodging: { type: 'lodging', stayPreference: 'lodge', baseTown: null, booked: null },
      transportation: {
        mode: 'fly',
        startLocation: 'St. Louis',
        airport: 'STL',
        departureCity: 'St. Louis',
        departureAirportCode: 'STL',
        rentalCar: null,
      },
    };
    const constraints = parseConstraints(
      { planningState: prior },
      'Actually make it 6 days and fly from Kansas City instead.'
    );
    expect(constraints.dates.numDays).toBe(6);
    expect(constraints.planningState.dates.durationDays).toBe(6);
  });

  test('buildTripState keeps departureAirportCode from message airport token', () => {
    const state = buildTripState({
      lastUserMessage: 'We fly out of MCI airport to Yellowstone',
      userCity: { name: 'Kansas City', lat: 39.1, lon: -94.58, state: 'MO' },
      constraints: {},
      metadata: {},
    });
    expect(state.transportation.airport).toBe('MCI');
    expect(state.transportation.departureAirportCode).toBe('MCI');
  });
});
