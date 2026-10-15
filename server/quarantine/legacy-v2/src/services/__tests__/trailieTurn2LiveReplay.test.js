'use strict';

/**
 * PHASE 2 — replay of the three REAL 2026-08-20 Turn 2 generations through the
 * current post-generation validation/finalization chain. No model is called;
 * the provider boundary replays the captured tool call.
 *
 * Source: `artifacts/trailie-turn2-confirmation-2026-08-20/thread-M1/
 *          T2-zion-two-days-exposure-plan-stage-attempt-{1,2,3}.json`
 *
 * ONE FIELD IS NOT REPLAYABLE. The plan-stage capture's `sanitizePlan` retained
 * only `days` and the contingency lists, so the model's `intro` — the sole
 * input to the last two validators in the chain — was never written for any
 * attempt. Where an intro is needed below it is stated as such, never presented
 * as live output.
 */

const { executeTrailieV2Turn } = require('../../../../../src/services/trailieV2ExecutionService');
const { summarizeV2Telemetry } = require('../../../../../src/services/trailieV2RouteBridge');
const { buildEvidenceBundle } = require('../../../../../src/utils/evidenceBundle');
const {
  getProviderTestSummary,
  resetProviderTestSummary,
} = require('../../../../../src/config/providerTestPolicy');

const LIVE_PROMPT =
  'Plan two full days for us at Zion in late September. We’re mainly there for the '
  + 'scenery and the photography and we’d like to take it fairly easy. One of us really '
  + 'hates trails with drop-offs or exposed cliff sections, so please steer us clear of those.';

/** The turn's extracted constraints, verbatim from the live artifact. */
const LIVE_CONSTRAINTS = {
  avoidExposure: true,
  preferences: {
    interests: ['hiking', 'photography', 'scenic-drives'],
    fitness: 'easy',
    pace: null,
    riskTolerance: null,
    avoidExposure: true,
    maxDailyDriveMinutes: null,
  },
  mobility: {
    maxWalkMilesPerSegment: null,
    walkingTolerance: null,
    requiresFrequentBreaks: null,
    wheelchair: null,
    stroller: null,
    avoidStairs: null,
  },
  dates: { numDays: 2 },
};

let stopId = 0;
const stop = (order, type, name, note, duration, extra = {}) => ({
  id: `s${(stopId += 1)}`,
  order,
  type,
  name,
  note,
  startTime: '',
  duration,
  exposureLevel: 'low',
  difficulty: 'easy',
  ...extra,
});

/** Attempt 1 — terra, primary. Live: rejected, duplicate_base_experience on Day 2. */
const ATTEMPT_1_DAYS = [
  {
    id: 'd1',
    dayNumber: 1,
    label: 'Day 1',
    stops: [
      stop(1, 'visitor_center', 'Zion Canyon Visitor Center', 'Begin with a brief orientation and a same-day check on access and conditions.', 30),
      stop(2, 'trail', 'Lower Emerald Pool Trail', 'Make this easy, low-exposure walk your morning anchor.', 120),
      stop(3, 'museum', 'Human History Museum', 'Indoor exhibits and the orientation film.', 60),
    ],
  },
  {
    id: 'd2',
    dayNumber: 2,
    label: 'Day 2',
    stops: [
      stop(1, 'trail', "Pa'rus Trail", 'Use this paved Virgin River walk as the day’s main easy outing.', 120),
      stop(2, 'visitor_center', 'Zion Canyon Visitor Center', 'A practical stop for current park information.', 30),
      stop(3, 'photography', 'Pa’rus Trail — late-afternoon Watchman photography', "Return to a favorite river-side section of Pa'rus for softer light on the Watchman.", 90),
    ],
  },
];

/** Attempt 2 — terra, same-model retry. Live: cleared completeness, rejected later. */
const ATTEMPT_2_DAYS = [
  {
    id: 'd1',
    dayNumber: 1,
    label: 'Day 1',
    stops: [
      stop(1, 'trail', 'Lower Emerald Pool Trail', 'Make this the day’s main outing: an easy, rough paved walk to the Lower Emerald Pool.', 120),
      stop(2, 'lodge', 'Zion Lodge', 'Use the facilities here for a relaxed break after the trail.', 45),
      stop(3, 'museum', 'Human History Museum', 'Spend the afternoon with the indoor exhibits and the 22-minute orientation film.', 90),
    ],
  },
  {
    id: 'd2',
    dayNumber: 2,
    label: 'Day 2',
    stops: [
      stop(1, 'trail', "Pa'rus Trail", 'Use the paved trail for an easy, self-paced walk along the Virgin River.', 120),
      stop(2, 'visitor_center', 'Zion Nature Center', 'Take a shaded, low-key break with interactive exhibits.', 60),
      stop(3, 'visitor_center', 'Zion Canyon Visitor Center', 'Finish by the South Entrance with outdoor exhibits and a ranger check-in.', 45),
    ],
  },
];

/** Attempt 3 — sol escalation. Live: rejected, duplicate_base_experience on Day 1. */
const ATTEMPT_3_DAYS = [
  {
    id: 'd1',
    dayNumber: 1,
    label: 'Day 1',
    stops: [
      stop(1, 'visitor_center', 'Zion Canyon Visitor Center', 'Start with orientation and current conditions.', 45),
      stop(2, 'trail', 'Pa’rus Trail', 'The trail is rated easy and low-exposure, with a paved surface along the river.', 120),
      stop(3, 'museum', 'Human History Museum and Towers of the Virgin views', 'Cultural context plus a distinct, low-effort photography setting outside.', 90),
      stop(4, 'photography', 'Pa’rus Trail golden-hour photography', 'The Watchman views make this a natural photography finish.', 60),
    ],
  },
  {
    id: 'd2',
    dayNumber: 2,
    label: 'Day 2',
    stops: [
      stop(1, 'trail', 'Lower Emerald Pool Trail', 'An easy walk to the pools; stay away from cliff edges and do not enter the pools.', 120),
      stop(2, 'lodge', 'Zion Lodge area', 'A relaxed midday base with shade and facilities.', 75),
      stop(3, 'visitor_center', 'Kolob Canyons Visitor Center', 'A geographically distinct setting for the second day.', 90),
    ],
  },
];

/**
 * A neutral, constraint-compliant companion answer. The live intros were never
 * captured, so this stands in wherever the chain needs one; it asserts nothing
 * about what the model actually wrote.
 */
const NEUTRAL_INTRO =
  'Two unhurried days on the canyon floor, built around the paved river walks and '
  + 'the indoor stops, with room to slow down between them.';

function classification() {
  return {
    version: 'trailie-intent-v2.0.0',
    source: 'deterministic',
    primaryIntent: 'simple_itinerary',
    verticals: ['itinerary'],
    depth: 'planning',
    freshness: 'current',
    actionability: 'planning',
    scope: 'single_destination',
    entities: [{ type: 'destination', role: 'target', canonicalId: 'park:nps:zion', confidence: 1 }],
    confidence: 0.97,
    reasonCodes: ['compound_request', 'explicit_itinerary_request', 'short_trip_duration'],
    compound: false,
    requiresLunaShadow: false,
    travelerJob: 'day_by_day_itinerary',
    structurePolicy: 'required',
    understanding: {
      contractVersion: 2,
      taskFamily: 'itinerary',
      taskStrength: 'explicit',
      confidence: 0.98,
      requestedArtifact: 'itinerary',
      forbiddenArtifacts: [],
      structurePolicy: 'required',
      destinationRelationship: 'single',
      destinationRefs: [{ entityId: 'nps:park:zion', parkCode: 'zion', displayName: 'Zion' }],
      temporalScope: { visitWindow: 'late september', durationDays: 2, durationSource: 'explicit_day_count' },
      operationalSubjects: [],
      explicitConstraints: [{ field: 'avoidExposure', value: true, source: 'current_message' }],
      softPreferences: [{ field: 'photography', value: true, source: 'current_message' }],
      underspecified: false,
      continuationOfActiveDecision: false,
      priorJob: null,
      topicShift: false,
      understandingSource: 'deterministic',
      reasonCodes: ['explicit_itinerary_request', 'explicit_day_count'],
    },
  };
}

async function replay(days, intro = NEUTRAL_INTRO) {
  const input = { intro, days };
  return executeTrailieV2Turn({
    userMessage: LIVE_PROMPT,
    conversationContext: { history: [] },
    tripState: null,
    constraints: LIVE_CONSTRAINTS,
    resolvedContext: {},
  }, {
    enabled: true,
    classifyIntent: () => classification(),
    planRequirements: () => [],
    resolveDeterministicRender: () => ({ eligible: false }),
    detectContradiction: () => [],
    resolveEvidence: async ({ requestId }) => buildEvidenceBundle({
      requestId, resolutions: [], candidates: [],
    }),
    now: () => new Date('2026-08-21T12:00:00.000Z'),
    newTurnId: () => 'turn-2-live-replay',
    streamGeneration: false,
    responseAdapters: {},
    executeResponses: async () => ({
      provider: 'openai',
      model: 'gpt-5.6-terra',
      outputText: '',
      toolCalls: [{ name: 'create_itinerary', id: 'call_1', input, rawArgs: JSON.stringify(input) }],
      completionStatus: 'complete',
      stopReason: 'stop',
      refusal: null,
      usage: { inputTokens: 4574, outputTokens: 1380, reasoningTokens: 230, cachedInputTokens: 0 },
    }),
  });
}

beforeEach(() => resetProviderTestSummary());

describe('Turn 2 live attempts through the real validation/finalization chain', () => {
  test('attempt 1 now finalizes into an accepted canonical plan', async () => {
    const result = await replay(ATTEMPT_1_DAYS);
    const telemetry = summarizeV2Telemetry(result);

    expect(result.status).toBe('complete');
    expect(telemetry.hasPlan).toBe(true);
    expect(telemetry.canonicalPlanState).toBe('accepted');
    expect(telemetry.itineraryHash).toEqual(expect.any(String));
    expect(telemetry.artifactFulfillment.fulfilled).toBe(true);
    expect(telemetry.attempts).toHaveLength(1);
    expect(telemetry.attempts[0].validationStatus).toBe('pass');
    expect(telemetry.attempts[0].validationReasonCodes).toEqual([]);
    expect(result.canonicalPlan.days).toHaveLength(2);
  });

  test('attempt 2 finalizes cleanly — day diversity was never its problem', async () => {
    const result = await replay(ATTEMPT_2_DAYS);
    const telemetry = summarizeV2Telemetry(result);

    expect(result.status).toBe('complete');
    expect(telemetry.canonicalPlanState).toBe('accepted');
    expect(telemetry.attempts[0].validationReasonCodes).toEqual([]);
  });

  test('attempt 3 now finalizes into an accepted canonical plan', async () => {
    const result = await replay(ATTEMPT_3_DAYS);
    const telemetry = summarizeV2Telemetry(result);

    expect(result.status).toBe('complete');
    expect(telemetry.canonicalPlanState).toBe('accepted');
    expect(telemetry.attempts[0].validationStatus).toBe('pass');
  });

  test('the structured plans are NOT what a post-completeness validator can reject', async () => {
    // Every attempt above clears completeness, mobility, prose safety, traveler
    // language and the budget gate on its structured content alone. Under this
    // turn's constraint set (`avoidExposure` only, no walking limit, no budget)
    // the reachable late-stage reason codes are exhausted by the intro/prose.
    for (const days of [ATTEMPT_1_DAYS, ATTEMPT_2_DAYS, ATTEMPT_3_DAYS]) {
      const result = await replay(days);
      expect(result.validation.status).toBe('pass');
    }
  });

  test('an intro that certifies absence of exposure still fails, at the named stage', async () => {
    // The one un-replayable field, exercised directly. This is the class of
    // failure the live attempt 2 must have hit; the exact wording is unknown.
    const result = await replay(
      ATTEMPT_2_DAYS,
      'The Pa’rus Trail walk has no drop-offs, so it is perfect for you.',
    );
    const telemetry = summarizeV2Telemetry(result);

    expect(result.status).toBe('failed');
    expect(telemetry.attempts[0].validationStage).toBe('prose_constraint_safety');
    expect(telemetry.attempts[0].validationReasonCodes)
      .toContain('unsupported_exposure_suitability_claim');
    expect(telemetry.canonicalPlanState).toBe('rejected');
  });

  test('no live provider was constructed or dispatched', () => {
    const summary = getProviderTestSummary();
    expect(summary.liveOpenAiConstructors).toBe(0);
    expect(summary.liveAnthropicConstructors).toBe(0);
    expect(summary.liveProviderDispatches).toBe(0);
    expect(summary.externalProviderHttpRequests).toBe(0);
  });
});
