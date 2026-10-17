'use strict';

/**
 * WP-TU Phase 4 Task 10 — real WIRING tests. Task 9 already proved
 * `resolveTargetTripId` itself in isolation; these tests prove it is
 * actually consulted inside `executeTrailieV2Turn` at the right seam, that
 * the fail-closed invariant holds (no wrong-plan mutation on
 * ambiguous/not_found/unhydratable-resolved), and that ordinary turns are
 * completely unaffected.
 *
 * Real `classifyTrailieIntent` drives every case (real job/relationship/
 * destination resolution); generation and evidence resolution are scripted/
 * offline — no live provider, no real DB.
 */

const { classifyTrailieIntent } = require('../../../../../src/services/trailieIntentClassifier');
const { executeTrailieV2Turn } = require('../../../../../src/services/trailieV2ExecutionService');
const { resolveTargetTripId, STATUS } = require('../../../../../src/services/targetTripResolver');
const { buildEvidenceBundle } = require('../../../../../src/utils/evidenceBundle');

function proseResult(text = 'A complete, validated prose answer well over the fallback length threshold.') {
  return {
    provider: 'openai',
    model: 'gpt-5.6-terra',
    outputText: text,
    toolCalls: [],
    completionStatus: 'complete',
    stopReason: 'stop',
    refusal: null,
    usage: { inputTokens: 800, outputTokens: 150, cachedInputTokens: 0 },
  };
}

function itineraryResult() {
  const days = [{
    id: 'd1', dayNumber: 1, label: 'Day 1',
    stops: [
      { name: 'Visitor Center orientation', duration: 45, timeWindow: 'Morning' },
      { name: 'Valley floor scenic walk', duration: 90, timeWindow: 'Late morning' },
      { name: 'Picnic and rest buffer', duration: 60, timeWindow: 'Midday' },
    ],
  }];
  return {
    provider: 'openai', model: 'gpt-5.6-terra', outputText: '',
    toolCalls: [{ name: 'create_itinerary', id: 'call_1', input: { days }, rawArgs: JSON.stringify({ days }) }],
    completionStatus: 'complete', stopReason: 'stop', refusal: null,
    usage: { inputTokens: 1200, outputTokens: 300, cachedInputTokens: 0 },
  };
}

function patchResult(patch) {
  return {
    provider: 'openai', model: 'gpt-5.6-terra', outputText: '',
    toolCalls: [{ name: 'patch_itinerary', id: 'patch_1', input: patch, rawArgs: JSON.stringify(patch) }],
    completionStatus: 'complete', stopReason: 'stop', refusal: null,
    usage: { inputTokens: 900, outputTokens: 180, cachedInputTokens: 0 },
  };
}

function plan({ id, title = 'New Trip Plan', parkCode, parkName, startDate = null, endDate = null, status = 'active' }) {
  return {
    id,
    title,
    parkCode,
    parkName,
    formData: { startDate, endDate },
    planningState: { destination: { parkCode, parkName, region: null, state: null } },
    status,
  };
}

const BADLANDS_PLAN = plan({ id: 'trip-badl-1', title: 'Badlands Trip', parkCode: 'badl', parkName: 'Badlands National Park' });
const REDWOOD_PLAN = plan({ id: 'trip-redw-1', title: 'Redwood Trip', parkCode: 'redw', parkName: 'Redwood National Park' });
const REDWOOD_PLAN_2 = plan({ id: 'trip-redw-2', parkCode: 'redw', parkName: 'Redwood National Park', startDate: '2026-09-01' });

const BADLANDS_CANONICAL_PLAN = {
  intro: 'Original Badlands plan.',
  parkName: 'Badlands National Park',
  days: [1, 2, 3].map((dayNumber) => ({
    id: `d${dayNumber}`,
    dayNumber,
    label: `Day ${dayNumber}`,
    stops: [{
      id: `s${dayNumber}`, order: 1, type: 'viewpoint', name: `Original Day ${dayNumber}`,
      note: 'A named scenic experience.', startTime: '', duration: 120,
    }],
  })),
};

function buildDeps(overrides = {}) {
  const executeResponses = jest.fn(overrides.executeResponses || (async () => proseResult()));
  const resolveEvidence = jest.fn(async ({ requirements = [], requestId }) => buildEvidenceBundle({
    requestId,
    resolutions: requirements.map((r) => ({ requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: [] })),
    candidates: [],
  }));
  return {
    classifyIntent: jest.fn((args) => classifyTrailieIntent(args)),
    planRequirements: jest.fn(() => []),
    resolveDeterministicRender: jest.fn(() => ({ eligible: false })),
    detectContradiction: jest.fn(() => []),
    now: () => new Date('2026-09-04T12:00:00.000Z'),
    newTurnId: () => `turn-${Math.random().toString(36).slice(2)}`,
    streamGeneration: false,
    responseAdapters: {},
    executeResponses,
    resolveEvidence,
  };
}

const BADLANDS_PRIOR = { primaryDestination: { parkCode: 'badl', name: 'Badlands' }, hasItinerary: true };

async function runTurn({ userMessage, priorTripState = null, candidatePlans = [], activeTripId = null, existingCanonicalPlan = null, executeResponses, emitCanonicalEvent }) {
  const deps = buildDeps({ executeResponses });
  return {
    deps,
    result: await executeTrailieV2Turn({
      userMessage,
      conversationContext: { history: [] },
      tripState: existingCanonicalPlan ? { ...priorTripState, existingCanonicalPlan } : priorTripState,
      constraints: null,
      resolvedContext: {},
      candidatePlans,
      activeTripId,
      emitCanonicalEvent,
    }, { ...deps, enabled: true, classifyIntent: (args) => classifyTrailieIntent({ ...args, priorTripState }) }),
  };
}

describe('Task 10 — real wiring: the 7 cases', () => {
  // 1. Active-trip refinement (no named destination) -> unchanged behavior.
  test('case 1: active Badlands -> "Make Day 2 easier" -> generation proceeds against the active plan', async () => {
    const canonicalEvents = [];
    const patch = {
      response: 'Slowed down Day 2.',
      operations: [{
        op: 'update_day', dayNumber: 2,
        day: { id: 'd2', dayNumber: 2, label: 'A slower Day 2', stops: [{ id: 's2b', order: 1, type: 'scenic_drive', name: 'Slower Day 2', note: 'A relaxed scenic experience.', startTime: '', duration: 120 }] },
      }],
    };
    const { deps, result } = await runTurn({
      userMessage: 'Make Day 2 easier',
      priorTripState: BADLANDS_PRIOR,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
      existingCanonicalPlan: BADLANDS_CANONICAL_PLAN,
      executeResponses: async () => patchResult(patch),
      emitCanonicalEvent: (event) => canonicalEvents.push(event),
    });
    expect(result.status).toBe('complete');
    expect(result.targetTripId).toBe(BADLANDS_PLAN.id);
    expect(deps.executeResponses).toHaveBeenCalledTimes(1);
    expect(result.canonicalPlan.days[1].stops[0].name).toBe('Slower Day 2');
    // Untouched days survived — proves this really is the ordinary patch path.
    expect(result.canonicalPlan.days[0].stops[0].name).toBe('Original Day 1');
    expect(canonicalEvents.find((event) => event.type === 'itinerary_ready')?.payload.presentation.refinement)
      .toMatchObject({ isRefinement: true, changedDayNumbers: [2] });
  });

  // 2. Historical refinement, one unambiguous candidate -> Level 2 (resolution
  // + persistence + fail-closed; full hydration deferred, see report).
  test('case 2: Badlands active -> "For my Redwood trip, change Day 2" -> resolved to Redwood, but generation fails closed (no active-plan mutation)', async () => {
    const { deps, result } = await runTurn({
      userMessage: 'For my Redwood trip, change Day 2',
      priorTripState: BADLANDS_PRIOR,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
      existingCanonicalPlan: BADLANDS_CANONICAL_PLAN,
    });
    expect(result.status).toBe('plan_target_unresolved');
    expect(result.targetTripId).toBe(REDWOOD_PLAN.id);
    expect(result.canonicalPlan).toBeNull();
    // No generation was ever dispatched — the active Badlands plan cannot
    // have been mutated because nothing ran against it.
    expect(deps.executeResponses).not.toHaveBeenCalled();
  });

  // 3. Historical continuation ("Make Day 3 easier too") -> priorTargetTripId
  // recovered from persisted state -> still targets Redwood, not Badlands.
  test('case 3: after establishing Redwood, a further bare follow-up still resolves to Redwood via priorTargetTripId, not the active Badlands trip', async () => {
    const { deps, result } = await runTurn({
      userMessage: 'Make Day 3 easier too',
      priorTripState: { ...BADLANDS_PRIOR, priorTargetTripId: REDWOOD_PLAN.id },
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
      existingCanonicalPlan: BADLANDS_CANONICAL_PLAN,
    });
    expect(result.status).toBe('plan_target_unresolved');
    expect(result.targetTripId).toBe(REDWOOD_PLAN.id);
    expect(result.canonicalPlan).toBeNull();
    expect(deps.executeResponses).not.toHaveBeenCalled();
  });

  // 4. Ordinary Q&A naming a destination -> no target resolution attempted.
  test('case 4: Badlands active -> "Is October good in Redwood?" -> unaffected, no target resolution', async () => {
    const { deps, result } = await runTurn({
      userMessage: 'Is October good in Redwood?',
      priorTripState: BADLANDS_PRIOR,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
    });
    expect(result.status).toBe('complete');
    expect(result.targetTripId).toBeNull();
    expect(deps.executeResponses).toHaveBeenCalledTimes(1);
  });

  // 5. Fresh itinerary build -> no target resolution attempted, no reuse of
  // an old same-destination plan.
  test('case 5: fresh "Plan Zion for 3 days" with an old Zion plan existing -> unaffected, never reuses the old plan', async () => {
    const zionPlan = plan({ id: 'trip-zion-old', title: 'Old Zion Trip', parkCode: 'zion', parkName: 'Zion National Park' });
    const { deps, result } = await runTurn({
      userMessage: 'Plan Zion for 3 days',
      priorTripState: null,
      candidatePlans: [zionPlan],
      activeTripId: null,
      executeResponses: async () => itineraryResult(),
    });
    expect(result.status).toBe('complete');
    expect(result.targetTripId).toBeNull();
    expect(deps.executeResponses).toHaveBeenCalledTimes(1);
  });

  // 6. Two ambiguous same-destination historical candidates -> fails closed.
  test('case 6: two Redwood candidates with no disambiguator -> fails closed, no mutation, no invented target', async () => {
    const { deps, result } = await runTurn({
      userMessage: 'For my Redwood trip, change Day 2',
      priorTripState: BADLANDS_PRIOR,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN, REDWOOD_PLAN_2],
      activeTripId: BADLANDS_PLAN.id,
      existingCanonicalPlan: BADLANDS_CANONICAL_PLAN,
    });
    expect(result.status).toBe('plan_target_unresolved');
    expect(result.targetTripId).toBeNull();
    expect(result.canonicalPlan).toBeNull();
    expect(deps.executeResponses).not.toHaveBeenCalled();
  });

  // 7. Historical reference to a destination with no saved plan -> not_found.
  test('case 7: a historical reference to a destination with no saved plan is not_found and fails closed', async () => {
    const { deps, result } = await runTurn({
      userMessage: 'For my Acadia trip, change Day 2',
      priorTripState: BADLANDS_PRIOR,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
      existingCanonicalPlan: BADLANDS_CANONICAL_PLAN,
    });
    expect(result.status).toBe('plan_target_unresolved');
    expect(result.targetTripId).toBeNull();
    expect(result.canonicalPlan).toBeNull();
    expect(deps.executeResponses).not.toHaveBeenCalled();
  });
});

describe('Task 10 — fail-closed invariant, explicit', () => {
  test('the active plan object is never mutated when resolution is ambiguous', async () => {
    const activePlanSnapshot = JSON.parse(JSON.stringify(BADLANDS_CANONICAL_PLAN));
    await runTurn({
      userMessage: 'For my Redwood trip, change Day 2',
      priorTripState: BADLANDS_PRIOR,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN, REDWOOD_PLAN_2],
      activeTripId: BADLANDS_PLAN.id,
      existingCanonicalPlan: BADLANDS_CANONICAL_PLAN,
    });
    expect(BADLANDS_CANONICAL_PLAN).toEqual(activePlanSnapshot);
  });

  test('the active plan object is never mutated when resolution is not_found', async () => {
    const activePlanSnapshot = JSON.parse(JSON.stringify(BADLANDS_CANONICAL_PLAN));
    await runTurn({
      userMessage: 'For my Acadia trip, change Day 2',
      priorTripState: BADLANDS_PRIOR,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
      existingCanonicalPlan: BADLANDS_CANONICAL_PLAN,
    });
    expect(BADLANDS_CANONICAL_PLAN).toEqual(activePlanSnapshot);
  });
});

// ---------------------------------------------------------------------------
// Post-Task-10 correction — the authenticated-UNSAVED-plan regression.
//
// A refinement-shaped turn with NO activeTripId, NO candidatePlans, and NO
// priorTargetTripId is not automatically "no active/prior target" in the
// no-such-trip-exists sense the original continuation branch assumed — an
// authenticated traveler with an in-memory/conversation canonical plan that
// was never persisted as a TripPlan (conversationPlanContinuity.js's
// TrailieConversationPlan) legitimately reaches this exact shape. The fixed
// resolver distinguishes it (candidatePlans.length === 0 -> not_required)
// from the genuine "candidates exist, no association" case (stays
// not_found, unweakened — covered separately below).
// ---------------------------------------------------------------------------
describe('Post-Task-10 fix — authenticated unsaved-plan continuation is not_required, not not_found', () => {
  const UNSAVED_PLAN_PRIOR = { hasItinerary: true };
  const USER_MESSAGE = 'Keep the trip, but keep the walking pretty light.';

  test('the resolver itself: no activeTripId, no candidatePlans, no priorTargetTripId -> not_required (real classifier)', () => {
    const intent = classifyTrailieIntent({ userPrompt: USER_MESSAGE, priorTripState: UNSAVED_PLAN_PRIOR });
    const out = resolveTargetTripId({
      intent,
      candidatePlans: [],
      activeTripId: null,
      priorTargetTripId: null,
      userMessage: USER_MESSAGE,
    });
    expect(out.status).toBe(STATUS.NOT_REQUIRED);
    expect(out.reasonCode).toBe('no_persisted_multi_trip_context');
  });

  test('real wiring: executeTrailieV2Turn proceeds PAST the Task 10 gate to real generation/refinement, never fails closed', async () => {
    const patch = {
      response: 'Kept the walking light.',
      operations: [{
        op: 'update_day', dayNumber: 2,
        // Stop name deliberately includes "walk" — this prompt's own wording
        // ("keep the walking pretty light") trips the pre-existing, known,
        // deliberately-unfixed HIKE_ASK completeness check (see project memory
        // "Requested-experience ask gap"); this is unrelated to the resolver
        // fix under test, so the fixture satisfies it rather than fighting it.
        day: { id: 'd2', dayNumber: 2, label: 'A gentler Day 2', stops: [{ id: 's2c', order: 1, type: 'trail', name: 'Gentle Valley Walk', note: 'A short, relaxed walk with little elevation change.', startTime: '', duration: 120 }] },
      }],
    };
    const { deps, result } = await runTurn({
      userMessage: USER_MESSAGE,
      priorTripState: UNSAVED_PLAN_PRIOR,
      candidatePlans: [],
      activeTripId: null,
      existingCanonicalPlan: BADLANDS_CANONICAL_PLAN,
      executeResponses: async () => patchResult(patch),
    });
    // The whole point of the fix: this must NOT be the Task 10 fail-closed
    // terminal — generation actually ran against the in-memory plan.
    expect(result.status).not.toBe('plan_target_unresolved');
    expect(result.status).toBe('complete');
    expect(result.targetTripId).toBeNull();
    expect(deps.executeResponses).toHaveBeenCalledTimes(1);
    expect(result.canonicalPlan.days[1].stops[0].name).toBe('Gentle Valley Walk');
    expect(result.presentation.refinement.changedDayNumbers).toEqual([2]);
    expect(result.canonicalPlan.days.map((day) => day.dayNumber)).toEqual([1, 2, 3]);
  });
});
