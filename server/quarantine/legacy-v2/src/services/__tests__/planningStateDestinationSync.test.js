'use strict';

/**
 * WP-TU Phase 3 Task 7 — `planningState.destination` becomes a CONSUMER of
 * the same single authoritative classification `tripScope` already reads
 * (Task 4), gated by the SAME `activeContextAction` field:
 *
 *   current user turn
 *         |
 *   classifyIntent (once, Task 3)
 *         |
 *   understanding.primaryDestination + tripContext.activeContextAction
 *         |
 *   syncPlanningStateDestinationFromIntent  (exact sibling of Task 4's
 *                                            syncTripScopeDestinationFromIntent)
 *
 * All 8 acceptance rows driven through the REAL `classifyTrailieIntent` (no
 * intent-object mocks), calling the REAL `syncPlanningStateDestinationFromIntent`
 * directly — same convention as `tripScopeIntentSync.test.js`.
 */

const { classifyTrailieIntent } = require('../../../../../src/services/trailieIntentClassifier');
const {
  executeTrailieV2Turn,
  __testables: { syncPlanningStateDestinationFromIntent, syncTripScopeDestinationFromIntent },
} = require('../../../../../src/services/trailieV2ExecutionService');
const { emptyPlanningState } = require('../../../../../src/utils/planningState');
const { buildEvidenceBundle } = require('../../../../../src/utils/evidenceBundle');

function planningStateWith(destination, extra = {}) {
  return { ...emptyPlanningState(), destination, ...extra };
}

const REDWOOD_PS = planningStateWith(
  { parkCode: 'redw', parkName: 'Redwood National Park', region: 'west', state: 'CA' },
  { dates: { startDate: '2026-05-01', endDate: '2026-05-05', durationDays: 5 }, lastTravelerJob: 'day_by_day_itinerary' }
);
const BADLANDS_PS = planningStateWith(
  { parkCode: 'badl', parkName: 'Badlands National Park', region: null, state: null }
);

describe('Task 7 — syncPlanningStateDestinationFromIntent, real classifier, all 8 acceptance rows', () => {
  test('Row 1: no active -> "Plan 3 days in Zion" -> destination becomes Zion', () => {
    const intent = classifyTrailieIntent({ userPrompt: 'Plan 3 days in Zion', priorTripState: null });
    expect(intent.tripContext.activeContextAction).toBe('set');
    const result = syncPlanningStateDestinationFromIntent(null, intent);
    expect(result.destination.parkCode).toBe('zion');
  });

  test('Row 2: Redwood active -> "Is October good in Acadia?" -> destination stays Redwood', () => {
    const intent = classifyTrailieIntent({
      userPrompt: 'Is October good in Acadia?',
      priorTripState: { primaryDestination: { parkCode: 'redw', name: 'Redwood' }, hasItinerary: true },
    });
    expect(intent.tripContext.activeContextAction).toBe('preserve');
    const result = syncPlanningStateDestinationFromIntent(REDWOOD_PS, intent);
    expect(result.destination.parkCode).toBe('redw');
    expect(result).toBe(REDWOOD_PS); // identity no-op, not just equal value
  });

  test('Row 3: -> "What about November?" -> destination STILL stays Redwood', () => {
    const intent = classifyTrailieIntent({
      userPrompt: 'What about November?',
      priorTripState: {
        primaryDestination: { parkCode: 'redw', name: 'Redwood' },
        hasItinerary: true,
        lastConversationalSubject: {
          subjectDestinations: [{ name: 'Acadia', parkCode: 'acad' }],
          primaryDestination: { name: 'Acadia', parkCode: 'acad' },
          destinationRelationship: 'single',
        },
      },
    });
    expect(intent.tripContext.activeContextAction).toBe('preserve');
    const result = syncPlanningStateDestinationFromIntent(REDWOOD_PS, intent);
    expect(result.destination.parkCode).toBe('redw');
    expect(result).toBe(REDWOOD_PS);
  });

  test('Row 4: Redwood active -> "Actually plan Badlands instead" -> destination becomes Badlands, region/state cleared', () => {
    const intent = classifyTrailieIntent({
      userPrompt: 'Actually plan Badlands instead',
      priorTripState: { primaryDestination: { parkCode: 'redw', name: 'Redwood' }, hasItinerary: true },
    });
    expect(intent.tripContext.activeContextAction).toBe('set');
    const result = syncPlanningStateDestinationFromIntent(REDWOOD_PS, intent);
    expect(result.destination.parkCode).toBe('badl');
    // region/state described Redwood — must not be carried over to Badlands.
    expect(result.destination.region).toBeNull();
    expect(result.destination.state).toBeNull();
  });

  test('Row 5: Badlands active -> "For my Redwood trip, change Day 2" -> destination stays Badlands', () => {
    const intent = classifyTrailieIntent({
      userPrompt: 'For my Redwood trip, change Day 2',
      priorTripState: { primaryDestination: { parkCode: 'badl', name: 'Badlands' }, hasItinerary: true },
    });
    expect(intent.tripContext.activeContextAction).toBe('preserve');
    const result = syncPlanningStateDestinationFromIntent(BADLANDS_PS, intent);
    expect(result.destination.parkCode).toBe('badl');
    expect(result).toBe(BADLANDS_PS);
  });

  test('Row 6: Badlands active -> "Make Day 2 easier" -> destination stays Badlands', () => {
    const intent = classifyTrailieIntent({
      userPrompt: 'Make Day 2 easier',
      priorTripState: { primaryDestination: { parkCode: 'badl', name: 'Badlands' }, hasItinerary: true },
    });
    expect(intent.tripContext.activeContextAction).toBe('preserve');
    const result = syncPlanningStateDestinationFromIntent(BADLANDS_PS, intent);
    expect(result.destination.parkCode).toBe('badl');
    expect(result).toBe(BADLANDS_PS);
  });

  test('Row 7: fresh -> "Plan Yellowstone and Grand Teton." -> destination = Yellowstone (primary) ONLY; tripScope (separate, untouched machinery) still carries BOTH', () => {
    const intent = classifyTrailieIntent({ userPrompt: 'Plan Yellowstone and Grand Teton.', priorTripState: null });
    expect(intent.tripContext.activeContextAction).toBe('set');
    expect(intent.understanding.subjectDestinations.map((d) => d.parkCode)).toEqual(['yell', 'grte']);

    const planningStateResult = syncPlanningStateDestinationFromIntent(null, intent);
    // Singular, per the existing schema — never redesigned into an array.
    expect(planningStateResult.destination.parkCode).toBe('yell');
    expect(planningStateResult.destination).not.toHaveProperty('destinations');

    // tripScope is Task 4's own machinery — this task reads primaryDestination
    // only and never touches it. Proven here by calling it independently.
    const tripScopeResult = syncTripScopeDestinationFromIntent(null, intent);
    expect(tripScopeResult.destinations.map((d) => d.parkCode)).toEqual(['yell', 'grte']);
  });

  test('Row 8: a preserve turn leaves every OTHER planningState field byte-identical, not just destination', () => {
    const intent = classifyTrailieIntent({
      userPrompt: 'Is October good in Acadia?',
      priorTripState: { primaryDestination: { parkCode: 'redw', name: 'Redwood' }, hasItinerary: true },
    });
    expect(intent.tripContext.activeContextAction).toBe('preserve');
    const result = syncPlanningStateDestinationFromIntent(REDWOOD_PS, intent);
    expect(result).toEqual(REDWOOD_PS);
    expect(result.dates).toEqual({ startDate: '2026-05-01', endDate: '2026-05-05', durationDays: 5 });
    expect(result.lastTravelerJob).toBe('day_by_day_itinerary');
  });

  // ── Structural assertion ──────────────────────────────────────────────
  test('structural: the helper takes only (planningState, intent) — no raw-message parameter, no independent destination re-derivation', () => {
    expect(syncPlanningStateDestinationFromIntent.length).toBe(2);
    // Forcing activeContextAction to preserve blocks a destination change
    // even when primaryDestination names a different park — mirrors Task 4's
    // own structural test.
    const intent = {
      understanding: { primaryDestination: { name: 'Badlands', parkCode: 'badl', lat: 43.75, lon: -102.5 } },
      tripContext: { relationship: 'new', activeContextAction: 'preserve' },
    };
    const result = syncPlanningStateDestinationFromIntent(REDWOOD_PS, intent);
    expect(result.destination.parkCode).toBe('redw');
  });

  test('a "set" with a null input planningState still produces a fully-shaped record (every other field intact, not a sparse patch)', () => {
    const intent = classifyTrailieIntent({ userPrompt: 'Plan 3 days in Zion', priorTripState: null });
    const result = syncPlanningStateDestinationFromIntent(null, intent);
    expect(result.dates).toEqual({ startDate: null, endDate: null, durationDays: null });
    expect(result.travelers).toBeDefined();
    expect(result.lodging).toBeDefined();
  });

  test('a "set" with no primaryDestination is a defensive no-op (malformed input never trusted blind)', () => {
    const intent = {
      understanding: { primaryDestination: null },
      tripContext: { relationship: 'new', activeContextAction: 'set' },
    };
    expect(syncPlanningStateDestinationFromIntent(REDWOOD_PS, intent)).toBe(REDWOOD_PS);
  });
});

describe('Task 7 — real wiring: the corrected planningState reaches BOTH resolveNeeds and buildLogistics', () => {
  function classification(overrides = {}) {
    return {
      version: 'trailie-intent-v2.0.0',
      source: 'deterministic',
      primaryIntent: 'general_qa',
      verticals: ['parks'],
      depth: 'quick',
      freshness: 'stable',
      actionability: 'informational',
      scope: 'single_destination',
      entities: [],
      confidence: 0.9,
      reasonCodes: ['general_travel_question'],
      compound: false,
      requiresLunaShadow: false,
      travelerJob: null,
      understanding: { primaryDestination: null, subjectDestinations: [] },
      tripContext: { relationship: 'continuation', activeContextAction: 'preserve' },
      ...overrides,
    };
  }

  test('a "set" turn (Redwood -> Badlands) reaches resolveLogisticsNeeds AND buildTravelLogisticsForTurn with the corrected destination', async () => {
    const capturedNeedsPlanningState = [];
    const capturedLogisticsPlanningState = [];
    const executeResponses = jest.fn(async () => ({
      provider: 'openai',
      model: 'gpt-5.6-terra',
      outputText: 'A complete, validated prose answer well over the fallback length threshold.',
      toolCalls: [],
      completionStatus: 'complete',
      stopReason: 'stop',
      refusal: null,
      usage: { inputTokens: 800, outputTokens: 150, cachedInputTokens: 0 },
    }));
    const resolveEvidence = jest.fn(async ({ requirements = [], requestId }) => buildEvidenceBundle({
      requestId,
      resolutions: requirements.map((r) => ({ requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: [] })),
      candidates: [],
    }));

    const deps = {
      classifyIntent: jest.fn(() => classification({
        travelerJob: 'day_by_day_itinerary',
        understanding: {
          primaryDestination: { name: 'Badlands National Park', parkCode: 'badl', lat: 43.75, lon: -102.50 },
          subjectDestinations: [{ name: 'Badlands National Park', parkCode: 'badl', lat: 43.75, lon: -102.50 }],
        },
        tripContext: { relationship: 'new', activeContextAction: 'set' },
      })),
      planRequirements: jest.fn(() => []),
      resolveDeterministicRender: jest.fn(() => ({ eligible: false })),
      detectContradiction: jest.fn(() => []),
      now: () => new Date('2026-09-04T12:00:00.000Z'),
      newTurnId: () => 'turn-task7',
      streamGeneration: false,
      responseAdapters: {},
      executeResponses,
      resolveEvidence,
      resolveLogisticsNeeds: jest.fn((args) => {
        capturedNeedsPlanningState.push(args.planningState);
        return {};
      }),
      buildTravelLogisticsForTurn: jest.fn(async (args) => {
        capturedLogisticsPlanningState.push(args.planningState);
        return {
          schemaVersion: 1,
          inventoryMode: 'planning',
          transport: { airportsStatus: 'not_requested', airports: [], routeLegsStatus: 'not_requested', routeLegs: [] },
          stays: {
            insidePark: { status: 'not_requested', properties: [] },
            gateway: { status: 'not_requested', properties: [] },
            campgrounds: { status: 'not_requested', properties: [] },
            vacationRentalHint: null,
          },
        };
      }),
    };

    const result = await executeTrailieV2Turn({
      userMessage: 'Actually plan Badlands instead',
      conversationContext: { history: [] },
      tripState: null,
      constraints: null,
      planningState: REDWOOD_PS,
      resolvedContext: {},
    }, { ...deps, enabled: true });

    expect(result.status).toBe('complete');
    expect(capturedNeedsPlanningState).toHaveLength(1);
    expect(capturedNeedsPlanningState[0].destination.parkCode).toBe('badl');
    expect(capturedLogisticsPlanningState).toHaveLength(1);
    expect(capturedLogisticsPlanningState[0].destination.parkCode).toBe('badl');
    // Every other field survived the correction untouched.
    expect(capturedNeedsPlanningState[0].dates).toEqual(REDWOOD_PS.dates);
  });
});
