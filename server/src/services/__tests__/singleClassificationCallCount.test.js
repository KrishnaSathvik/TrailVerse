'use strict';

/**
 * WP-TU Phase 2 Task 3 — one authoritative `classifyTrailieIntent` execution
 * per V2 turn. Drives the REAL `prepareChatContext` (offline — no DB, no
 * network, per the WP12 Phase 4 shared-prep contract already pinned by
 * wp12Phase2Switch.test.js), the REAL `buildResolvedContext`/
 * `buildClassifierPriorTripState` route-bridge builders, and the REAL
 * `executeTrailieV2Turn` — with a scripted, offline generation stub (proven
 * shape, reused from turnUnderstandingContinuity.test.js §18) so no live/paid
 * model call is ever made. `classifyIntent` is injected as a spy WRAPPING the
 * real `classifyTrailieIntent`, matching this codebase's existing DI/call-
 * count convention (see trailieV2ExecutionService.test.js).
 */

const { prepareChatContext } = require('../../routes/ai');
const { buildResolvedContext, buildClassifierPriorTripState } = require('../trailieV2RouteBridge');
const { executeTrailieV2Turn } = require('../trailieV2ExecutionService');
const { classifyTrailieIntent } = require('../trailieIntentClassifier');

// Proven-working, safe, sufficiently-long prose completion (identical shape
// to turnUnderstandingContinuity.test.js §18's scripted response). Returned
// on every call, so an internal structured-artifact retry ladder (if any)
// can call it repeatedly with no extra bookkeeping — this suite measures
// classifyIntent call count and travelerJob/relationship correctness, not
// generation success.
const PROSE_STUB = {
  provider: 'openai',
  model: 'gpt-5.6-terra',
  outputText: 'A complete, validated prose answer about the park that is well over the fallback length threshold and contains no unsupported current claims whatsoever.',
  toolCalls: [],
  completionStatus: 'complete',
  stopReason: 'stop',
  refusal: null,
  usage: { inputTokens: 800, outputTokens: 150, cachedInputTokens: 0 },
};

let turnCounter = 0;

/**
 * Runs one turn through the REAL Phase-2-corrected wiring:
 *   prepareChatContext -> buildClassifierPriorTripState/buildResolvedContext
 *   -> executeTrailieV2Turn (classifyIntent spied, generation scripted).
 */
async function runRealTurn({ userMessage, activeTripContext = null, conversation = [], existingCanonicalPlan = null }) {
  const preparedContext = await prepareChatContext(
    {
      messages: [{ role: 'user', content: userMessage }],
      provider: 'openai',
      metadata: { skipUserContext: true, activeTripContext },
    },
    '[Task3 test]',
    { isAnonymous: true }
  );

  const tripStateSource = {
    ...preparedContext,
    conversation,
    resolvedMetadata: {
      ...preparedContext.resolvedMetadata,
      ...(existingCanonicalPlan ? { existingCanonicalPlan } : {}),
    },
  };
  const tripState = buildClassifierPriorTripState(tripStateSource);
  const resolvedContext = buildResolvedContext(preparedContext);
  const classifyIntentSpy = jest.fn((args) => classifyTrailieIntent(args));

  turnCounter += 1;
  const result = await executeTrailieV2Turn(
    {
      userMessage,
      conversationContext: { history: [] },
      tripState,
      planningState: preparedContext.planningState || null,
      constraints: preparedContext.constraints || null,
      resolvedContext,
      signal: null,
    },
    {
      enabled: true,
      classifyIntent: classifyIntentSpy,
      planRequirements: () => [],
      resolveDeterministicRender: () => ({ eligible: false }),
      detectContradiction: () => [],
      now: () => new Date('2026-09-03T12:00:00.000Z'),
      newTurnId: () => `turn-task3-${turnCounter}`,
      streamGeneration: false,
      responseAdapters: {},
      executeResponses: async () => PROSE_STUB,
    }
  );

  return { preparedContext, tripState, resolvedContext, classifyIntentSpy, result };
}

describe('WP-TU Phase 2 Task 3 — ai.js no longer computes its own classification', () => {
  test('prepareChatContext no longer returns intentV2 / intentShadowInput (structural removal proof)', async () => {
    const { preparedContext } = await runRealTurn({ userMessage: 'Is October good in Zion?' });
    expect(preparedContext.intentV2).toBeUndefined();
    expect(preparedContext.intentShadowInput).toBeUndefined();
    // `intent` (the unrelated legacy field) is untouched by this task.
    expect('intent' in preparedContext).toBe(true);
  });
});

describe('WP-TU Phase 2 Task 3 — classifyTrailieIntent executes exactly once per turn', () => {
  test.each([
    [
      'ordinary Q&A',
      { userMessage: 'Is October good in Zion?' },
    ],
    [
      'new itinerary request',
      { userMessage: 'Plan 3 days in Zion.' },
    ],
    [
      'refinement of an active plan',
      {
        userMessage: 'Make Day 2 easier.',
        activeTripContext: { primaryDestination: { name: 'Badlands National Park', parkCode: 'badl' } },
        existingCanonicalPlan: { days: [{ dayNumber: 1 }, { dayNumber: 2 }] },
      },
    ],
    [
      'conversational-continuation side-query',
      {
        userMessage: 'What about November?',
        activeTripContext: { primaryDestination: { name: 'Redwood National and State Parks', parkCode: 'redw' } },
        conversation: [
          { role: 'user', content: 'Is October good in Acadia?' },
          { role: 'assistant', content: 'October is lovely in Acadia...' },
        ],
      },
    ],
  ])('%s — classifyTrailieIntent runs exactly once', async (_label, turnInput) => {
    const { classifyIntentSpy, result } = await runRealTurn(turnInput);
    expect(classifyIntentSpy).toHaveBeenCalledTimes(1);
    expect(result).toBeTruthy();
    expect(typeof result.status).toBe('string');
  });
});

describe('WP-TU Phase 2 Task 3 — Phase 1 behavior preserved through the real wiring', () => {
  // These five scenarios prove the WIRING (prepareChatContext ->
  // buildClassifierPriorTripState -> classifyTrailieIntent), not only the
  // resolveTravelerJob unit calls Phase 1 already pinned. All five now assert
  // the INTENDED outcome directly — the wiring bug this proof originally
  // surfaced (buildClassifierPriorTripState sourcing "the trip active before
  // this turn" from the CURRENT turn's already-resolved activeTripContext
  // instead of the genuinely pre-turn storedTripContext) is fixed at
  // trailieRouteBridge.js's buildClassifierPriorTripState.
  //
  // `understanding.*` (Task 1a's subjectDestinations/primaryDestination/
  // priorConversationalSubject/destinationRelationship) is captured via
  // `classifyIntentSpy.mock.results[0].value.understanding` — the ACTUAL
  // return value of the real classify call the wiring made — because
  // `executeTrailieV2Turn`'s public `result.intent` (`publicIntent`) redacts
  // `understanding` before returning.
  //
  // `tripContext` (relationship/activeContextAction) is now propagated onto
  // `classifyTrailieIntent`'s own authoritative return object too (Task 3
  // item 2) — captured the same way, via the spy's actual return value,
  // rather than a second direct `resolveTravelerJob` call.

  test('Redwood active -> "Is October good in Acadia?" -> "What about November?"', async () => {
    const activeTripContext = { primaryDestination: { name: 'Redwood National and State Parks', parkCode: 'redw' } };

    const turn1 = await runRealTurn({ userMessage: 'Is October good in Acadia?', activeTripContext });
    expect(turn1.classifyIntentSpy).toHaveBeenCalledTimes(1);
    const turn1Intent = turn1.classifyIntentSpy.mock.results[0].value;
    expect(turn1Intent.understanding.primaryDestination).toEqual(expect.objectContaining({ parkCode: 'acad' }));
    expect(turn1Intent.tripContext).toEqual({ relationship: 'new', activeContextAction: 'preserve' });
    // The active trip stays Redwood — a side question about Acadia does not
    // touch it.
    expect(turn1.tripState.primaryDestination).toEqual(activeTripContext.primaryDestination);

    const turn2 = await runRealTurn({
      userMessage: 'What about November?',
      activeTripContext,
      conversation: [
        { role: 'user', content: 'Is October good in Acadia?' },
        { role: 'assistant', content: 'October is lovely in Acadia...' },
      ],
    });
    expect(turn2.classifyIntentSpy).toHaveBeenCalledTimes(1);
    expect(turn2.tripState.lastConversationalSubject).toEqual({
      subjectDestinations: [{ name: 'Acadia', parkCode: 'acad' }],
      primaryDestination: { name: 'Acadia', parkCode: 'acad' },
      destinationRelationship: 'single',
    });
    // The active trip is STILL Redwood — untouched by turn 1's side question.
    expect(turn2.tripState.primaryDestination).toEqual(activeTripContext.primaryDestination);
    const turn2Intent = turn2.classifyIntentSpy.mock.results[0].value;
    // Continuation of ACADIA (the last conversational subject) — not of
    // Redwood (the active trip, which this turn never mentions).
    expect(turn2Intent.tripContext).toEqual({ relationship: 'continuation', activeContextAction: 'preserve' });
  });

  test('Yosemite vs Sequoia comparison -> follow-up -> continuation/preserve', async () => {
    const turn2 = await runRealTurn({
      userMessage: 'Which one has easier hiking?',
      conversation: [
        { role: 'user', content: 'Yosemite or Sequoia for October?' },
        { role: 'assistant', content: 'Both are great choices for October...' },
      ],
    });
    expect(turn2.classifyIntentSpy).toHaveBeenCalledTimes(1);
    expect(turn2.tripState.lastConversationalSubject).toEqual({
      subjectDestinations: [
        { name: 'Yosemite', parkCode: 'yose' },
        { name: 'Sequoia', parkCode: 'sequ' },
      ],
      primaryDestination: { name: 'Yosemite', parkCode: 'yose' },
      destinationRelationship: 'alternative_choice',
    });
    const turn2Intent = turn2.classifyIntentSpy.mock.results[0].value;
    expect(turn2Intent.tripContext).toEqual({ relationship: 'continuation', activeContextAction: 'preserve' });
  });

  test('Redwood active -> "Actually plan Badlands instead" -> itinerary job / new / set', async () => {
    const activeTripContext = { primaryDestination: { name: 'Redwood National and State Parks', parkCode: 'redw' } };
    const turn = await runRealTurn({
      userMessage: 'Actually plan Badlands instead.',
      activeTripContext,
      existingCanonicalPlan: { days: [{ dayNumber: 1 }, { dayNumber: 2 }] },
    });
    expect(turn.classifyIntentSpy).toHaveBeenCalledTimes(1);
    const intent = turn.classifyIntentSpy.mock.results[0].value;
    expect(intent.travelerJob).toBe('day_by_day_itinerary');
    expect(intent.understanding.primaryDestination).toEqual(expect.objectContaining({ parkCode: 'badl' }));
    // The trip active BEFORE this turn is still Redwood, correctly distinct
    // from this turn's own (Badlands) destination.
    expect(turn.tripState.primaryDestination).toEqual(activeTripContext.primaryDestination);
    expect(intent.tripContext).toEqual({ relationship: 'new', activeContextAction: 'set' });
  });

  test('Badlands active -> "For my Redwood trip..." -> historical_reference / preserve', async () => {
    const activeTripContext = { primaryDestination: { name: 'Badlands National Park', parkCode: 'badl' } };
    const turn = await runRealTurn({
      userMessage: 'For my Redwood trip, change Day 2.',
      activeTripContext,
      existingCanonicalPlan: { days: [{ dayNumber: 1 }, { dayNumber: 2 }] },
    });
    expect(turn.classifyIntentSpy).toHaveBeenCalledTimes(1);
    const intent = turn.classifyIntentSpy.mock.results[0].value;
    // The trip active BEFORE this turn is still Badlands — this turn names a
    // DIFFERENT, prior, non-active trip (Redwood) to operate on.
    expect(turn.tripState.primaryDestination).toEqual(activeTripContext.primaryDestination);
    expect(intent.tripContext).toEqual({ relationship: 'historical_reference', activeContextAction: 'preserve' });
  });
});
