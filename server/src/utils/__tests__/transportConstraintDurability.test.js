'use strict';

/**
 * Phase 9C.1F.1 — durable traveler transport constraints.
 *
 * Before any travel edge may acquire a driving mode (9C.1F.2), Trailie needs a
 * durable trip-level answer to ONE question: "may a driving / private-vehicle
 * transfer be assumed for this trip?" Phase 9C.1E found that today only
 * `transportation.mode ∈ {fly, drive}` and `rentalCar=true` survive a turn;
 * "without a car", "no driving", "shuttle only", "walking only", "bike only"
 * are seen by topic routing and then vanish.
 *
 * These tests pin the minimal durable contract:
 *   transportation.drivingPolicy       'prohibited' | null
 *   transportation.drivingPolicyReason 'no_car' | 'no_driving' | 'shuttle_only'
 *                                      | 'walking_only' | 'bike_only' | null
 * plus the parser boundary (explicit trip-level statements only), the merge /
 * override semantics (newest explicit traveler statement wins; silence never
 * clears), the reconciliation with the pre-existing fly/drive/rentalCar
 * fields, and the non-interaction with driving feasibility, travel edges and
 * routing.
 */

jest.mock('node-fetch');
const nodeFetch = require('node-fetch');

const { extractTransportConstraints } = require('../travelerStateExtraction');
const { parseConstraints } = require('../constraintEngine');
const {
  emptyPlanningState,
  normalizePersistedPlanningState,
  buildPlanningStateFromRuntime,
  resolvePlanningStateForWrite,
  planningStateToTripStateLayer,
} = require('../planningState');
const {
  buildTripState,
  emptyTripState,
  layerFromCurrentMessage,
  mergeInto,
} = require('../tripStateBuilder');
const { bindGeneratedItineraryContract } = require('../generationContractBinding');
const { finalizeStructuredItinerary } = require('../finalizeItinerary');
const { normalizeDayTravelEdges } = require('../travelEdgeValidation');
const { enrichItineraryDrivingTimes } = require('../../services/drivingTimesContextService');

const transportOf = (text, previous = null) =>
  parseConstraints({ planningState: previous }, text).planningState.transportation;

const stateAfter = (text, previous = null) =>
  parseConstraints({ planningState: previous }, text).planningState;

// ---------------------------------------------------------------------------
// Contract shape
// ---------------------------------------------------------------------------

describe('durable transport constraint shape', () => {
  test('emptyPlanningState carries drivingPolicy + drivingPolicyReason as null alongside the existing fields', () => {
    const t = emptyPlanningState().transportation;
    expect(t).toEqual({
      mode: null,
      startLocation: null,
      airport: null,
      departureCity: null,
      departureAirportCode: null,
      rentalCar: null,
      drivingPolicy: null,
      drivingPolicyReason: null,
    });
  });

  test('emptyTripState mirrors the same two fields', () => {
    const t = emptyTripState().transportation;
    expect(t.drivingPolicy).toBeNull();
    expect(t.drivingPolicyReason).toBeNull();
  });

  test('normalizePersistedPlanningState round-trips a prohibition and rejects unknown enum values', () => {
    const persisted = emptyPlanningState();
    persisted.transportation.drivingPolicy = 'prohibited';
    persisted.transportation.drivingPolicyReason = 'shuttle_only';
    const n = normalizePersistedPlanningState(persisted);
    expect(n.ok).toBe(true);
    expect(n.state.transportation.drivingPolicy).toBe('prohibited');
    expect(n.state.transportation.drivingPolicyReason).toBe('shuttle_only');

    const bogus = emptyPlanningState();
    bogus.transportation.drivingPolicy = 'maybe';
    bogus.transportation.drivingPolicyReason = 'hovercraft';
    const b = normalizePersistedPlanningState(bogus);
    expect(b.state.transportation.drivingPolicy).toBeNull();
    expect(b.state.transportation.drivingPolicyReason).toBeNull();
  });

  test('a reason without a policy is dropped (reason is meaningless on its own)', () => {
    const persisted = emptyPlanningState();
    persisted.transportation.drivingPolicyReason = 'no_car';
    const n = normalizePersistedPlanningState(persisted);
    expect(n.state.transportation.drivingPolicy).toBeNull();
    expect(n.state.transportation.drivingPolicyReason).toBeNull();
  });

  test('planningStateToTripStateLayer projects the prohibition into the tripState layer', () => {
    const persisted = emptyPlanningState();
    persisted.transportation.drivingPolicy = 'prohibited';
    persisted.transportation.drivingPolicyReason = 'no_car';
    const layer = planningStateToTripStateLayer(persisted);
    expect(layer.transportation.drivingPolicy).toBe('prohibited');
    expect(layer.transportation.drivingPolicyReason).toBe('no_car');
  });
});

// ---------------------------------------------------------------------------
// (1)–(6) explicit trip-level prohibitions persist with a bounded reason
// ---------------------------------------------------------------------------

describe('explicit trip-level prohibitions become durable', () => {
  test('(1) "we won\'t have a car" persists as a driving prohibition with reason no_car', () => {
    const t = transportOf("Plan Yellowstone for 3 days. We won't have a car.");
    expect(t.drivingPolicy).toBe('prohibited');
    expect(t.drivingPolicyReason).toBe('no_car');
  });

  test('(2) "without a car" is the same prohibition', () => {
    const t = transportOf("We're doing Zion for two days without a car.");
    expect(t.drivingPolicy).toBe('prohibited');
    expect(t.drivingPolicyReason).toBe('no_car');
  });

  test('(2b) "we don\'t have a car" is the same prohibition', () => {
    const t = transportOf("We don't have a car for this trip.");
    expect(t.drivingPolicy).toBe('prohibited');
    expect(t.drivingPolicyReason).toBe('no_car');
  });

  test('(3) explicit "no driving" persists with reason no_driving', () => {
    expect(transportOf('Three days in Acadia, no driving please.')).toMatchObject({
      drivingPolicy: 'prohibited',
      drivingPolicyReason: 'no_driving',
    });
    expect(transportOf("Don't make us drive.")).toMatchObject({
      drivingPolicy: 'prohibited',
      drivingPolicyReason: 'no_driving',
    });
    expect(transportOf("We don't want to drive at all.")).toMatchObject({
      drivingPolicy: 'prohibited',
      drivingPolicyReason: 'no_driving',
    });
    expect(transportOf('We want to do this without driving.')).toMatchObject({
      drivingPolicy: 'prohibited',
      drivingPolicyReason: 'no_driving',
    });
  });

  test('(4) "use the shuttle only" prohibits drive but does not create a shuttle edge mode or positive mode', () => {
    const t = transportOf('Plan Zion for 2 days. Use the shuttle only.');
    expect(t.drivingPolicy).toBe('prohibited');
    expect(t.drivingPolicyReason).toBe('shuttle_only');
    expect(t.mode).toBeNull();
    expect(t).not.toHaveProperty('modeIntent');
    expect(t).not.toHaveProperty('allowedModes');
    expect(t).not.toHaveProperty('requiredModes');
  });

  test.each([
    "I don't want to drive much, but I want Denver, Aspen, Great Sand Dunes and Rocky Mountain in four days.",
    "We do not plan to drive more than two hours a day.",
    "I don't want to drive long distances.",
    "We don't want to drive a lot.",
  ])('limited driving is not a driving prohibition: %s', (message) => {
    expect(extractTransportConstraints(message).drivingPolicy).toBeNull();
    expect(transportOf(message).drivingPolicy).toBeNull();
  });

  test('(5) "walking only" prohibits drive but does not create a walking edge mode', () => {
    const t = transportOf("We're walking only for this trip.");
    expect(t.drivingPolicy).toBe('prohibited');
    expect(t.drivingPolicyReason).toBe('walking_only');
    expect(t.mode).toBeNull();
    expect(t).not.toHaveProperty('modeIntent');
  });

  test('(6) "bike only" prohibits drive but does not create a bike edge mode', () => {
    const t = transportOf('Bike only, we are not bringing a car.');
    expect(t.drivingPolicy).toBe('prohibited');
    expect(t.drivingPolicyReason).toBe('bike_only');
    expect(t.mode).toBeNull();
    expect(t).not.toHaveProperty('modeIntent');
  });

  test('the extractor itself is the single parser and reports clearDrivingPolicy=false for prohibitions', () => {
    expect(extractTransportConstraints("we won't have a car")).toEqual({
      drivingPolicy: 'prohibited',
      drivingPolicyReason: 'no_car',
      clearDrivingPolicy: false,
      rentalCar: null,
    });
  });
});

// ---------------------------------------------------------------------------
// (7)–(9) informational / local mentions are NOT trip constraints
// ---------------------------------------------------------------------------

describe('informational questions and local mentions do not create a trip constraint', () => {
  const NONE = { drivingPolicy: null, drivingPolicyReason: null, clearDrivingPolicy: false, rentalCar: null };

  test('(7) "is the shuttle running?" does not', () => {
    expect(extractTransportConstraints('Is the shuttle running in October?')).toEqual(NONE);
    expect(transportOf('Is the shuttle running in October?').drivingPolicy).toBeNull();
  });

  test('(8) "how much walking is there?" does not', () => {
    expect(extractTransportConstraints('How much walking is there on day 2?')).toEqual(NONE);
    expect(transportOf('How much walking is there on day 2?').drivingPolicy).toBeNull();
  });

  test('(9) local "walk to X" does not become walking-only', () => {
    expect(extractTransportConstraints('Can we walk to the viewpoint after lunch?')).toEqual(NONE);
    expect(extractTransportConstraints('We will walk to Inspiration Point from the lot.')).toEqual(NONE);
    expect(transportOf('We will walk to Inspiration Point from the lot.').drivingPolicy).toBeNull();
  });

  test('"where can I park?" and a bare "car" mention are not constraints in either direction', () => {
    expect(extractTransportConstraints('Where can I park at Zion?')).toEqual(NONE);
    expect(extractTransportConstraints('Is the car park at Logan Pass usually full?')).toEqual(NONE);
    expect(extractTransportConstraints('Should we take the shuttle or drive?')).toEqual(NONE);
  });

  test('a question containing a restriction phrase is still a question, not a constraint', () => {
    expect(extractTransportConstraints('Can we do Zion without a car?')).toEqual(NONE);
    expect(extractTransportConstraints('Is walking only realistic here?')).toEqual(NONE);
  });
});

// ---------------------------------------------------------------------------
// (10)(11) existing availability parsing is preserved and stays distinct
// ---------------------------------------------------------------------------

describe('existing fly/drive/rentalCar behaviour is preserved and distinct from edge intent', () => {
  test('(10) road-trip / drive parsing is unchanged absent a contradiction', () => {
    const t = transportOf('Road trip from Denver to Yellowstone, 5 days.');
    expect(t.mode).toBe('drive');
    expect(t.drivingPolicy).toBeNull();
    expect(t.drivingPolicyReason).toBeNull();

    const layer = layerFromCurrentMessage({ lastUserMessage: 'We are driving from Salt Lake City.' });
    expect(layer.transportation.mode).toBe('drive');
    expect(layer.transportation.drivingPolicy).toBeNull();
    expect(layer.transportation.clearDrivingPolicy).toBe(true); // explicit "we are driving" restores
  });

  test('(11) rentalCar=true means driving is available, not a stop-level edge mode', () => {
    const t = transportOf("We'll have a rental car for the whole trip.");
    expect(t.rentalCar).toBe(true);
    expect(t.drivingPolicy).toBeNull();
    expect(t).not.toHaveProperty('modeIntent');
    expect(t).not.toHaveProperty('edgeMode');
  });

  test('"fly" stays independent of the prohibition (arrival mode is not an in-park transfer)', () => {
    // `mode: 'fly'` is stamped by applyDepartureContextToPlanningState, not by
    // parseConstraints, so seed it through previous state.
    const prev = emptyPlanningState();
    prev.transportation.mode = 'fly';
    const t = transportOf("We're flying into Las Vegas and won't have a car at Zion.", prev);
    expect(t.mode).toBe('fly');
    expect(t.drivingPolicy).toBe('prohibited');
    expect(t.drivingPolicyReason).toBe('no_car');
  });
});

// ---------------------------------------------------------------------------
// (12)–(14) cross-turn merge / override semantics
// ---------------------------------------------------------------------------

describe('cross-turn merge and override semantics', () => {
  test('(12) no-car followed by an unrelated refinement preserves the prohibition', () => {
    const turn1 = stateAfter("Plan Yellowstone for 3 days. We won't have a car.");
    const turn2 = stateAfter('Make day 2 lighter.', turn1);
    expect(turn2.transportation.drivingPolicy).toBe('prohibited');
    expect(turn2.transportation.drivingPolicyReason).toBe('no_car');

    const turn3 = stateAfter('Add more wildlife viewing.', turn2);
    expect(turn3.transportation.drivingPolicy).toBe('prohibited');
    expect(turn3.transportation.drivingPolicyReason).toBe('no_car');
  });

  test('(12b) silence never clears: a message that merely mentions driving conditions keeps the prohibition', () => {
    const turn1 = stateAfter("We won't have a car.");
    const turn2 = stateAfter('Are the roads usually icy in May?', turn1);
    expect(turn2.transportation.drivingPolicy).toBe('prohibited');
  });

  test('(13) no-car followed by "actually we\'re renting a car" clears the prohibition and records availability', () => {
    const turn1 = stateAfter("We won't have a car.");
    const turn2 = stateAfter("Actually we're renting a car.", turn1);
    expect(turn2.transportation.drivingPolicy).toBeNull();
    expect(turn2.transportation.drivingPolicyReason).toBeNull();
    expect(turn2.transportation.rentalCar).toBe(true);
  });

  test('(13b) "we will have a car after all" also clears it', () => {
    const turn1 = stateAfter('Use the shuttle only.');
    const turn2 = stateAfter("Change of plans, we'll have a car after all.", turn1);
    expect(turn2.transportation.drivingPolicy).toBeNull();
    expect(turn2.transportation.drivingPolicyReason).toBeNull();
  });

  test('(14) drive/car availability followed by explicit no-driving makes the prohibition authoritative', () => {
    const turn1 = stateAfter("Road trip to Yellowstone, we'll have a rental car.");
    expect(turn1.transportation.mode).toBe('drive');
    expect(turn1.transportation.rentalCar).toBe(true);

    const turn2 = stateAfter("Actually, we won't have a car.", turn1);
    expect(turn2.transportation.drivingPolicy).toBe('prohibited');
    expect(turn2.transportation.drivingPolicyReason).toBe('no_car');
    // Stale state must not keep advertising an unconditional drive assumption.
    expect(turn2.transportation.mode).toBeNull();
    expect(turn2.transportation.rentalCar).toBe(false);
  });

  test('(14b) "no driving" after a rental car withdraws the rentalCar assertion without inventing a false', () => {
    const turn1 = stateAfter("We'll rent a car.");
    const turn2 = stateAfter("We don't want to drive at all.", turn1);
    expect(turn2.transportation.drivingPolicy).toBe('prohibited');
    expect(turn2.transportation.drivingPolicyReason).toBe('no_driving');
    expect(turn2.transportation.rentalCar).toBeNull();
    expect(turn2.transportation.mode).toBeNull();
  });

  test('a newer prohibition replaces an older one rather than accumulating', () => {
    const turn1 = stateAfter("We won't have a car.");
    const turn2 = stateAfter('Use the shuttle only.', turn1);
    expect(turn2.transportation.drivingPolicy).toBe('prohibited');
    expect(turn2.transportation.drivingPolicyReason).toBe('shuttle_only');
  });

  test('the layered tripState builder applies the same reconciliation across layers', () => {
    const persisted = emptyPlanningState();
    persisted.transportation.mode = 'drive';
    persisted.transportation.rentalCar = true;
    const state = buildTripState({
      metadata: { planningState: persisted },
      constraints: { hasConstraints: false },
      resolvedMetadata: { parkCode: 'yell', parkName: 'Yellowstone National Park' },
      allExtractedParks: [{ parkCode: 'yell', parkName: 'Yellowstone National Park' }],
      lastUserMessage: "Actually we won't have a car.",
    });
    expect(state.transportation.drivingPolicy).toBe('prohibited');
    expect(state.transportation.drivingPolicyReason).toBe('no_car');
    expect(state.transportation.mode).toBeNull();
    expect(state.transportation.rentalCar).toBe(false);

    const restored = buildTripState({
      metadata: { planningState: { ...persisted, transportation: { ...persisted.transportation, mode: null, rentalCar: false, drivingPolicy: 'prohibited', drivingPolicyReason: 'no_car' } } },
      constraints: { hasConstraints: false },
      resolvedMetadata: { parkCode: 'yell', parkName: 'Yellowstone National Park' },
      allExtractedParks: [{ parkCode: 'yell', parkName: 'Yellowstone National Park' }],
      lastUserMessage: "Actually we're renting a car.",
    });
    expect(restored.transportation.drivingPolicy).toBeNull();
    expect(restored.transportation.rentalCar).toBe(true);
  });

  test('mergeInto: a lower layer\'s stale drive assumption is reconciled by a higher layer\'s prohibition', () => {
    const target = emptyTripState();
    mergeInto(target, { transportation: { mode: 'drive', rentalCar: true } });
    mergeInto(target, { transportation: { drivingPolicy: 'prohibited', drivingPolicyReason: 'no_car' } });
    expect(target.transportation.mode).toBeNull();
    expect(target.transportation.rentalCar).toBe(false);
    expect(target.transportation.drivingPolicy).toBe('prohibited');
  });

  test('mergeInto: a layer that says nothing about transport leaves the prohibition alone', () => {
    const target = emptyTripState();
    mergeInto(target, { transportation: { drivingPolicy: 'prohibited', drivingPolicyReason: 'walking_only' } });
    mergeInto(target, { preferences: { pace: 'relaxed' } });
    mergeInto(target, { transportation: { startLocation: 'Denver, CO' } });
    expect(target.transportation.drivingPolicy).toBe('prohibited');
    expect(target.transportation.drivingPolicyReason).toBe('walking_only');
  });

  test('the accepted-write path (resolvePlanningStateForWrite) keeps and updates the prohibition from the last user message', () => {
    const prev = stateAfter("We won't have a car.");
    const kept = resolvePlanningStateForWrite({
      previousPlanningState: prev,
      conversation: [
        { role: 'user', content: "We won't have a car." },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: 'Make day 2 lighter.' },
      ],
    });
    expect(kept.transportation.drivingPolicy).toBe('prohibited');

    const cleared = resolvePlanningStateForWrite({
      previousPlanningState: prev,
      conversation: [
        { role: 'user', content: "We won't have a car." },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: "Actually we're renting a car." },
      ],
    });
    expect(cleared.transportation.drivingPolicy).toBeNull();
    expect(cleared.transportation.rentalCar).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (15) driving feasibility (Phase 8D.6.1) stays independent
// ---------------------------------------------------------------------------

describe('(15) driving feasibility is about amount, not permission', () => {
  test('"keep the driving realistic" / max drive hours set no prohibition', () => {
    const a = stateAfter('Road trip Utah parks, keep the driving realistic.');
    expect(a.transportation.drivingPolicy).toBeNull();
    expect(a.tripScope?.drivingFeasibilityRequired ?? null).toBe(true);

    const b = stateAfter('No more than 3 hours of driving per day.');
    expect(b.preferences.maxDailyDriveMinutes).toBe(180);
    expect(b.transportation.drivingPolicy).toBeNull();
  });

  test('a prohibition neither sets nor clears maxDailyDriveMinutes', () => {
    const turn1 = stateAfter('No more than 3 hours of driving per day.');
    const turn2 = stateAfter("Actually we won't have a car.", turn1);
    expect(turn2.preferences.maxDailyDriveMinutes).toBe(180);
    expect(turn2.transportation.drivingPolicy).toBe('prohibited');

    const fresh = stateAfter("We won't have a car.");
    expect(fresh.preferences.maxDailyDriveMinutes).toBeNull();
  });

  test('a feasibility phrase does not restore driving after a prohibition', () => {
    const turn1 = stateAfter("We won't have a car.");
    const turn2 = stateAfter('Keep the driving realistic on day 3.', turn1);
    expect(turn2.transportation.drivingPolicy).toBe('prohibited');
    expect(turn2.transportation.mode).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (16)(17) travel edges untouched, zero routing calls
// ---------------------------------------------------------------------------

describe('(16)(17) travel edges and routing are untouched by the trip-level constraint', () => {
  const T = (s, t) => ({ sourceStopId: s, targetStopId: t, relationship: 'transfer' });
  const artifact = () => ({
    intro: 'A geyser morning.',
    days: [{
      id: 'd1', dayNumber: 1, label: 'Upper Geyser Basin + Midway',
      stops: [
        { id: 'old-faithful', order: 0, type: 'geothermal', name: 'Old Faithful', note: 'n', duration: 60, parkCode: 'yell', parkName: 'Yellowstone', latitude: 44.4605, longitude: -110.8281 },
        { id: 'grand-prismatic', order: 1, type: 'geothermal', name: 'Grand Prismatic Spring', note: 'n', duration: 60, parkCode: 'yell', parkName: 'Yellowstone', latitude: 44.5251, longitude: -110.8382 },
      ],
      travelEdges: [T('old-faithful', 'grand-prismatic')],
    }],
  });

  let savedKey;
  beforeEach(() => {
    savedKey = process.env.GMAPS_SERVER_KEY;
    process.env.GMAPS_SERVER_KEY = 'test-key';
    nodeFetch.mockClear();
  });
  afterEach(() => {
    if (savedKey) process.env.GMAPS_SERVER_KEY = savedKey;
    else delete process.env.GMAPS_SERVER_KEY;
  });

  test('(16) a canonical transfer edge is byte-identical after finalization; no mode field exists', async () => {
    const bound = bindGeneratedItineraryContract({ itineraryData: artifact() });
    const res = await finalizeStructuredItinerary({
      itineraryData: bound,
      enrichDrivingTimes: (data, prefix) => enrichItineraryDrivingTimes(data, prefix),
    });
    const edges = res.itineraryData.days[0].travelEdges;
    expect(edges).toEqual([T('old-faithful', 'grand-prismatic')]);
    expect(Object.keys(edges[0]).sort()).toEqual(['relationship', 'sourceStopId', 'targetStopId']);
    expect(normalizeDayTravelEdges(res.itineraryData.days[0])).toEqual([T('old-faithful', 'grand-prismatic')]);
  });

  test('(17) semantic transfers still make zero Distance Matrix / provider calls', async () => {
    const bound = bindGeneratedItineraryContract({ itineraryData: artifact() });
    await finalizeStructuredItinerary({
      itineraryData: bound,
      enrichDrivingTimes: (data, prefix) => enrichItineraryDrivingTimes(data, prefix),
    });
    expect(nodeFetch).not.toHaveBeenCalled();
  });

  test('the planning-state parse for a prohibition itself performs no network calls', () => {
    stateAfter("Plan Zion for 2 days, use the shuttle only.");
    expect(nodeFetch).not.toHaveBeenCalled();
  });
});
