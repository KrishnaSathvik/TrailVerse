'use strict';

/**
 * TIER-1 CONTRACT — WIRING AND VALIDATION ORDER.
 *
 * §E of the offline spec: every field removed from the model contract must
 * exist before its first consumer. These tests drive the real turn pipeline
 * with injected fakes — no provider is ever constructed or dispatched — and
 * assert on (a) the schema that actually leaves for the model and (b) the
 * canonical plan that comes back.
 */

const { executeTrailieV2Turn } = require('../../../../../src/services/trailieV2ExecutionService');
const { buildEvidenceBundle } = require('../../../../../src/utils/evidenceBundle');
const {
  entityFromStop,
  enrichItineraryWithRouteEvidence,
} = require('../../../../../src/utils/routeEvidenceDriveBridge');
const {
  bindGeneratedItineraryContract,
} = require('../../../../../src/utils/generationContractBinding');

// ---------------------------------------------------------------------------
// Harness — injected fakes only.
// ---------------------------------------------------------------------------

function classification(overrides = {}) {
  return {
    version: 'trailie-intent-v2.0.0',
    source: 'deterministic',
    primaryIntent: 'simple_itinerary',
    verticals: ['itinerary'],
    depth: 'planning',
    freshness: 'stable',
    actionability: 'planning',
    scope: 'single_destination',
    entities: [{ type: 'destination', role: 'target', canonicalId: 'park:nps:thro', confidence: 1 }],
    confidence: 0.9,
    reasonCodes: ['itinerary_request'],
    compound: false,
    requiresLunaShadow: false,
    travelerJob: null,
    ...overrides,
  };
}

/**
 * A model artifact authored against the REDUCED contract: no startTime, no
 * coordinates, no drive minutes, no physicalDifficulty, no park identity.
 */
function reducedDays() {
  return [{
    id: 'd1',
    dayNumber: 1,
    label: 'Day 1',
    stops: [
      {
        id: 's1-1',
        order: 0,
        type: 'visitor_center',
        name: 'Painted Canyon Visitor Center',
        note: 'Start with the overlook and the exhibits inside.',
        why: 'It orients the loop drive without any exertion.',
        duration: 45,
        timeWindow: 'Morning',
        difficulty: 'easy',
        exposureLevel: 'low',
      },
      {
        id: 's1-2',
        order: 1,
        type: 'scenic_drive',
        name: 'Scenic Loop Drive',
        note: 'Take the full loop with stops at the pullouts.',
        why: 'It delivers the badlands at large scale from the car.',
        duration: 120,
        timeWindow: 'Late morning',
        difficulty: 'easy',
      },
      {
        id: 's1-3',
        order: 2,
        type: 'picnic',
        name: 'River bend picnic',
        note: 'A shaded break by the water before the drive back.',
        why: 'It keeps the afternoon unhurried.',
        duration: 60,
        timeWindow: 'Midday',
      },
    ],
  }];
}

function itineraryOutputResult(days) {
  const input = { intro: 'One unhurried badlands day.', days };
  return {
    provider: 'openai',
    model: 'gpt-5.6-terra',
    outputText: '',
    toolCalls: [{
      name: 'create_itinerary',
      id: 'call_1',
      input,
      rawArgs: JSON.stringify(input),
    }],
    structuredOutput: null,
    structuredOutputStatus: null,
    completionStatus: 'complete',
    stopReason: 'stop',
    refusal: null,
    usage: { inputTokens: 1200, outputTokens: 300, cachedInputTokens: 0 },
  };
}

function buildDeps(overrides = {}) {
  const dispatches = [];
  const userExec = overrides.executeResponses;
  const defaultExec = async () => itineraryOutputResult(reducedDays());
  const executeResponses = jest.fn(async (request, ctx) => {
    dispatches.push(request);
    return (userExec || defaultExec)(request, ctx);
  });

  const resolveEvidence = jest.fn(async ({ requirements = [], requestId }) => buildEvidenceBundle({
    requestId,
    resolutions: requirements.map((r) => ({
      requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: [],
    })),
    candidates: [],
  }));

  return {
    dispatches,
    deps: {
      classifyIntent: jest.fn(() => classification()),
      planRequirements: jest.fn(() => []),
      resolveDeterministicRender: jest.fn(() => ({ eligible: false })),
      detectContradiction: jest.fn(() => []),
      now: () => new Date('2026-08-26T12:00:00.000Z'),
      newTurnId: () => 'turn-tier1',
      streamGeneration: false,
      ...overrides,
      responseAdapters: {},
      executeResponses,
      resolveEvidence,
    },
  };
}

const SINGLE_DESTINATION_CONTEXT = {
  resolvedEntities: [{
    entityId: 'nps:park:thro',
    displayName: 'Theodore Roosevelt National Park',
    latitude: 46.97,
    longitude: -103.53,
    resolutionConfidence: 1,
  }],
  primaryPark: { parkCode: 'thro', parkName: 'Theodore Roosevelt National Park' },
  destinationCount: 1,
  tripDays: 1,
};

const MULTI_DESTINATION_CONTEXT = {
  resolvedEntities: [
    { entityId: 'nps:park:olym', displayName: 'Olympic National Park', latitude: 47.8, longitude: -123.6, resolutionConfidence: 1 },
    { entityId: 'nps:park:glac', displayName: 'Glacier National Park', latitude: 48.7, longitude: -113.8, resolutionConfidence: 1 },
  ],
  primaryPark: { parkCode: 'olym', parkName: 'Olympic National Park' },
  destinationCount: 2,
  tripDays: 4,
};

function baseInput(overrides = {}) {
  return {
    userMessage: 'Plan me one relaxed day at Theodore Roosevelt National Park.',
    conversationContext: { history: [] },
    tripState: null,
    constraints: null,
    resolvedContext: SINGLE_DESTINATION_CONTEXT,
    ...overrides,
  };
}

function dispatchedStopSchema(request) {
  return request.tools[0].input_schema.properties.days.items.properties.stops.items;
}

function allStops(plan) {
  return (plan?.days || []).flatMap((day) => day.stops || []);
}

// ---------------------------------------------------------------------------
// B / D — what actually leaves for the model
// ---------------------------------------------------------------------------

describe('the generation contract sent to the model', () => {
  test('a single-destination itinerary turn sends the reduced, park-bound contract', async () => {
    const { deps, dispatches } = buildDeps();
    const result = await executeTrailieV2Turn(baseInput(), { ...deps, enabled: true });

    expect(result.status).toBe('complete');
    const stop = dispatchedStopSchema(dispatches[0]);
    for (const field of [
      'startTime', 'drivingTimeFromPreviousMin', 'physicalDifficulty',
      'parkCode', 'parkName',
    ]) {
      expect(stop.properties[field]).toBeUndefined();
    }
    expect(stop.required).not.toContain('startTime');
    // Traveler value and evidence-bound fields are still asked for — and so are
    // coordinates, whose measured catalog coverage does not replace the model.
    for (const field of [
      'note', 'why', 'difficulty', 'exposureLevel', 'walkingDistanceMiles',
      'latitude', 'longitude',
    ]) {
      expect(stop.properties[field]).toBeDefined();
    }
  });

  test('a multi-destination turn keeps model-authored stop-level park identity', async () => {
    const { deps, dispatches } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'full_trip', depth: 'deep', scope: 'multi_destination' }),
    });
    await executeTrailieV2Turn(baseInput({
      userMessage: 'Four days across Olympic and Glacier.',
      resolvedContext: MULTI_DESTINATION_CONTEXT,
    }), { ...deps, enabled: true });

    const stop = dispatchedStopSchema(dispatches[0]);
    expect(stop.properties.parkCode).toEqual({ type: ['string', 'null'] });
    expect(stop.properties.parkName).toEqual({ type: ['string', 'null'] });
    // The rest of Tier 1 is still reduced on a multi-park turn.
    expect(stop.properties.startTime).toBeUndefined();
    expect(stop.properties.drivingTimeFromPreviousMin).toBeUndefined();
    expect(stop.properties.physicalDifficulty).toBeUndefined();
  });

  test('a turn with no resolved destination keeps model-authored park identity', async () => {
    const { deps, dispatches } = buildDeps();
    await executeTrailieV2Turn(baseInput({ resolvedContext: {} }), { ...deps, enabled: true });
    expect(dispatchedStopSchema(dispatches[0]).properties.parkCode).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// C / F / G / H / I — the canonical artifact is unchanged
// ---------------------------------------------------------------------------

describe('the canonical plan built from a reduced artifact', () => {
  let plan;

  beforeAll(async () => {
    const { deps } = buildDeps();
    const result = await executeTrailieV2Turn(baseInput(), { ...deps, enabled: true });
    expect(result.status).toBe('complete');
    plan = result.canonicalPlan;
  });

  test('every stop carries the canonical Tier-1 fields', () => {
    const stops = allStops(plan);
    expect(stops.length).toBe(3);
    for (const stop of stops) {
      expect(stop.startTime).toBe('');
      expect(stop).toHaveProperty('latitude');
      expect(stop).toHaveProperty('longitude');
      expect(stop.drivingTimeFromPreviousMin ?? null).toBeNull();
      expect(stop).toHaveProperty('physicalDifficulty');
    }
  });

  test('finalizeItinerary — not the model — stamps coordinate provenance', () => {
    for (const stop of allStops(plan)) {
      expect(typeof stop.coordinateSource).toBe('string');
      expect(stop.coordinateSource.length).toBeGreaterThan(0);
    }
  });

  test('unresolved coordinates stay canonical nulls', () => {
    const picnic = allStops(plan).find((stop) => stop.name === 'River bend picnic');
    expect(picnic.latitude).toBeNull();
    expect(picnic.longitude).toBeNull();
  });

  test('physicalDifficulty is projected from the difficulty the model still authors', () => {
    const stops = allStops(plan);
    expect(stops[0].physicalDifficulty).toBe('easy');
    expect(stops[1].physicalDifficulty).toBe('easy');
    expect(stops[2].physicalDifficulty).toBeNull();
  });

  test('park identity is injected from the resolved destination', () => {
    for (const stop of allStops(plan)) {
      expect(stop.parkCode).toBe('thro');
      expect(stop.parkName).toBe('Theodore Roosevelt National Park');
    }
  });

  test('note and why survive the reduction untouched', () => {
    const stops = allStops(plan);
    expect(stops.every((stop) => typeof stop.note === 'string' && stop.note.length > 0)).toBe(true);
    expect(stops.filter((stop) => typeof stop.why === 'string' && stop.why.length > 0))
      .toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// E — validation order: the route bridge reads park identity, and it is there
// ---------------------------------------------------------------------------

describe('validation order for the restored fields', () => {
  test('the Maps route bridge sees the same stop entity ids as before the reduction', () => {
    const modelAuthored = {
      days: [{
        id: 'd1',
        dayNumber: 1,
        label: 'Day 1',
        stops: reducedDays()[0].stops.map((stop) => ({
          ...stop,
          startTime: '',
          latitude: null,
          longitude: null,
          drivingTimeFromPreviousMin: null,
          physicalDifficulty: stop.difficulty ?? null,
          parkCode: 'thro',
          parkName: 'Theodore Roosevelt National Park',
        })),
      }],
    };
    const serverBound = bindGeneratedItineraryContract({
      itineraryData: { days: reducedDays() },
      parkIdentityBinding: { parkCode: 'thro', parkName: 'Theodore Roosevelt National Park' },
    });

    // Identity the bridge resolves must be identical…
    expect(serverBound.days[0].stops.map(entityFromStop))
      .toEqual(modelAuthored.days[0].stops.map(entityFromStop));

    // …and so must the bridge's whole result.
    const bundle = buildEvidenceBundle({ requestId: 'r1', resolutions: [], candidates: [] });
    const before = enrichItineraryWithRouteEvidence({
      itineraryData: modelAuthored, tripScope: null, evidenceBundle: bundle,
    });
    const after = enrichItineraryWithRouteEvidence({
      itineraryData: serverBound, tripScope: null, evidenceBundle: bundle,
    });
    expect(after.drivingEvidenceLegs).toEqual(before.drivingEvidenceLegs);
    expect(after.itineraryData.days[0].stops.map((s) => s.drivingTimeFromPreviousMin))
      .toEqual(before.itineraryData.days[0].stops.map((s) => s.drivingTimeFromPreviousMin));
  });

  test('a reduced artifact reaching the bridge unbound would lose park identity', () => {
    // Guards the ordering itself: binding must run BEFORE the bridge, not
    // inside finalizeItinerary afterwards.
    const unbound = { days: reducedDays() };
    expect(unbound.days[0].stops.map(entityFromStop)).toEqual([null, null, null]);
  });
});

// ---------------------------------------------------------------------------
// N — refinement is untouched
// ---------------------------------------------------------------------------

describe('the refinement path is unchanged', () => {
  test('a refinement turn still sends the full patch stop contract', async () => {
    const priorPlan = {
      intro: 'One unhurried badlands day.',
      days: [{
        id: 'd1',
        dayNumber: 1,
        label: 'Day 1',
        stops: reducedDays()[0].stops.map((stop) => ({
          ...stop, startTime: '', latitude: null, longitude: null, parkCode: 'thro',
        })),
      }],
    };
    const { deps, dispatches } = buildDeps({
      classifyIntent: () => classification({ primaryIntent: 'trip_refinement' }),
      executeResponses: async () => ({
        provider: 'openai',
        model: 'gpt-5.6-terra',
        outputText: '',
        toolCalls: [{
          name: 'patch_itinerary',
          id: 'patch_1',
          input: {
            response: 'Shortened the loop drive.',
            operations: [{ op: 'update_stop', dayNumber: 1, stopId: 's1-2', stop: { duration: 90 } }],
          },
          rawArgs: '{}',
        }],
        completionStatus: 'complete',
        stopReason: 'stop',
        refusal: null,
        usage: { inputTokens: 900, outputTokens: 180, cachedInputTokens: 0 },
      }),
    });

    await executeTrailieV2Turn(baseInput({
      userMessage: 'Make the loop drive shorter.',
      tripState: { canonicalPlan: priorPlan },
    }), { ...deps, enabled: true });

    const tool = dispatches[0].tools[0];
    expect(tool.name).toBe('patch_itinerary');
    const patchStop = tool.input_schema.properties.operations.items.properties.stop;
    for (const field of [
      'startTime', 'latitude', 'longitude',
      'drivingTimeFromPreviousMin', 'physicalDifficulty', 'parkCode', 'parkName',
    ]) {
      expect(patchStop.properties[field]).toBeDefined();
    }
  });
});
