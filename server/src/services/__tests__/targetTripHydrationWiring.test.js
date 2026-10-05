'use strict';

/**
 * WP-TU Phase 4 Task 10B/10D — real WIRING tests for the cross-plan
 * HYDRATION ATTEMPT and (Task 10D) the actual cross-plan MUTATION. Proves:
 *
 *   - `loadTargetPlan` is invoked ONLY when targetTripResolution.status ===
 *     'resolved' AND targetTripId differs from activeTripId (never on
 *     active-trip refinements, ambiguous/not_found resolutions, plain Q&A,
 *     or fresh builds).
 *   - Every resolution/hydration FAILURE still fails closed exactly as
 *     Task 10 already proved (no active-plan mutation, no invented target,
 *     no fallback to the active plan).
 *   - A SUCCESSFUL hydration (Task 10D) now lets generation proceed against
 *     the hydrated content, delivered via the additive `targetPlanMutation`
 *     envelope — `canonicalPlan` (the active-trip channel) stays null. See
 *     `crossPlanTargetMutation.test.js` for the full comprehensive-invariant
 *     proof (deep-equal both sides, version bookkeeping, activeTripPresentation,
 *     re-hydration continuity, concurrency, ownership).
 *
 * Real `classifyTrailieIntent` drives every case, exactly like Task 10's
 * `targetTripResolverWiring.test.js`; `loadTargetPlan` is injected/mocked
 * here (mirroring how `resolveEvidence` is already mocked), never a live DB.
 */

const { classifyTrailieIntent } = require('../trailieIntentClassifier');
const { executeTrailieV2Turn } = require('../trailieV2ExecutionService');
const { buildEvidenceBundle } = require('../../utils/evidenceBundle');

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

function redwoodCanonicalPlan(revisionTag = 'v1') {
  return {
    intro: `Redwood plan (${revisionTag}).`,
    parkName: 'Redwood National Park',
    days: [1, 2, 3].map((dayNumber) => ({
      id: `rd${dayNumber}`,
      dayNumber,
      label: `Day ${dayNumber}`,
      stops: [{
        id: `rs${dayNumber}`, order: 1, type: 'viewpoint', name: `Redwood Day ${dayNumber} (${revisionTag})`,
        note: 'A named scenic experience.', startTime: '', duration: 120,
      }],
    })),
  };
}

function buildDeps(overrides = {}) {
  const executeResponses = jest.fn(overrides.executeResponses || (async () => proseResult()));
  const resolveEvidence = jest.fn(async ({ requirements = [], requestId }) => buildEvidenceBundle({
    requestId,
    resolutions: requirements.map((r) => ({ requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: [] })),
    candidates: [],
  }));
  const loadTargetPlan = jest.fn(overrides.loadTargetPlan || (async () => ({ ok: false, reason: 'not_found' })));
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
    loadTargetPlan,
  };
}

const BADLANDS_PRIOR = { primaryDestination: { parkCode: 'badl', name: 'Badlands' }, hasItinerary: true };
const OWNER_USER_ID = 'user-1';

async function runTurn({
  userMessage,
  priorTripState = null,
  candidatePlans = [],
  activeTripId = null,
  userId = OWNER_USER_ID,
  existingCanonicalPlan = null,
  executeResponses,
  loadTargetPlan,
  // WP-TU Phase 4 Task 10E — the ONE identity this turn already has (ai.js's
  // own mint, threaded through — never re-minted inside executeTrailieV2Turn).
  turnResponseId = 'turn-resp-badlands-1',
}) {
  const deps = buildDeps({ executeResponses, loadTargetPlan });
  return {
    deps,
    result: await executeTrailieV2Turn({
      userMessage,
      conversationContext: { history: [] },
      tripState: existingCanonicalPlan ? { ...priorTripState, existingCanonicalPlan } : priorTripState,
      constraints: null,
      resolvedContext: {},
      candidatePlans,
      turnResponseId,
      activeTripId,
      userId,
    }, { ...deps, enabled: true, classifyIntent: (args) => classifyTrailieIntent({ ...args, priorTripState }) }),
  };
}

describe('Task 10B — cross-plan hydration attempt: the 8 rows', () => {
  // 1. Active-trip refinement — the hydration dep must never be consulted.
  test('row 1: active Badlands -> "Make Day 2 easier" -> generation proceeds, loadTargetPlan never called', async () => {
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
    });
    expect(result.status).toBe('complete');
    expect(result.targetTripId).toBe(BADLANDS_PLAN.id);
    expect(deps.loadTargetPlan).not.toHaveBeenCalled();
    expect(deps.executeResponses).toHaveBeenCalledTimes(1);
  });

  // 2. Cross-plan resolved + hydration SUCCEEDS -> WP-TU Phase 4 Task 10D
  // corrected this from Task 10B's original "still fails closed" behavior:
  // generation now proceeds against the hydrated Redwood content and the
  // result is delivered via `targetPlanMutation`, never `canonicalPlan`.
  // Badlands remains untouched. See `crossPlanTargetMutation.test.js` for
  // the full comprehensive invariant proof (deep-equal both sides,
  // conversation/version bookkeeping, activeTripPresentation, etc.) — this
  // row stays a basic per-row proof, consistent with this file's style.
  test('row 2: Badlands active -> historical Redwood edit -> loadTargetPlan called with {tripId, userId}, generation proceeds, delivered via targetPlanMutation, Badlands untouched', async () => {
    const badlandsSnapshot = JSON.parse(JSON.stringify(BADLANDS_CANONICAL_PLAN));
    const loadTargetPlan = jest.fn(async () => ({ ok: true, plan: redwoodCanonicalPlan('v1'), parkCode: 'redw', parkName: 'Redwood National Park' }));
    const patch = {
      response: 'Slowed down Redwood Day 2.',
      operations: [{
        op: 'update_day', dayNumber: 2,
        day: { id: 'rd2', dayNumber: 2, label: 'A slower Day 2', stops: [{ id: 'rs2b', order: 1, type: 'viewpoint', name: 'Slower Redwood Day 2', note: 'A relaxed scenic experience.', startTime: '', duration: 120 }] },
      }],
    };
    const { deps, result } = await runTurn({
      userMessage: 'For my Redwood trip, change Day 2',
      priorTripState: BADLANDS_PRIOR,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
      existingCanonicalPlan: BADLANDS_CANONICAL_PLAN,
      loadTargetPlan,
      executeResponses: async () => patchResult(patch),
    });
    expect(deps.loadTargetPlan).toHaveBeenCalledTimes(1);
    expect(deps.loadTargetPlan).toHaveBeenCalledWith({ tripId: REDWOOD_PLAN.id, userId: OWNER_USER_ID });
    expect(deps.executeResponses).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('complete');
    expect(result.targetTripId).toBe(REDWOOD_PLAN.id);
    // The active-trip channel is NEVER used for a cross-plan mutation.
    expect(result.canonicalPlan).toBeNull();
    // Delivered instead via the additive envelope, addressed at Redwood.
    expect(result.targetPlanMutation.tripId).toBe(REDWOOD_PLAN.id);
    expect(result.targetPlanMutation.canonicalPlan.days[1].stops[0].name).toBe('Slower Redwood Day 2');
    // Untouched days survived — proves this is really the ordinary patch
    // path, just fed different input.
    expect(result.targetPlanMutation.canonicalPlan.days[0].stops[0].name).toBe('Redwood Day 1 (v1)');
    // A fresh, independent identity — minted from REDWOOD's own prior
    // version (0, since the fixture's plan carries no responseVersion), not
    // Badlands'.
    expect(result.targetPlanMutation.canonicalPlan.responseVersion).toBe(1);
    // WP-TU Phase 4 Task 10E — ONE logical identity, never a second mint:
    // the same value `runTurn`'s `turnResponseId` supplies.
    expect(result.targetPlanMutation.canonicalPlan.responseId).toBe('turn-resp-badlands-1');
    expect(BADLANDS_CANONICAL_PLAN).toEqual(badlandsSnapshot);
  });

  // 3. Continuity — a further bare follow-up ("Make Day 3 easier too") still
  // resolves to Redwood via priorTargetTripId, and hydration is re-attempted
  // FRESH (not cached from the prior turn) — Task 10D: now producing a
  // second, further-advanced revision.
  test('row 3: after establishing Redwood, "Make Day 3 easier too" resolves via priorTargetTripId, re-hydrates fresh, generation proceeds, Badlands untouched', async () => {
    const badlandsSnapshot = JSON.parse(JSON.stringify(BADLANDS_CANONICAL_PLAN));
    const loadTargetPlan = jest.fn(async () => ({
      ok: true,
      plan: redwoodCanonicalPlan('v2-current'),
      parkCode: 'redw',
      parkName: 'Redwood National Park',
      // WP-TU Phase 4 Task 12 — the real current identity (resolved from
      // Redwood's conversation, since a real V2-built trip's plan document
      // never carries one), NOT a field hand-typed onto the plan object.
      priorCanonicalIdentity: { responseId: 'redw-stored-resp-1', responseVersion: 1 },
    }));
    const patch = {
      response: 'Slowed down Redwood Day 3 too.',
      operations: [{
        op: 'update_day', dayNumber: 3,
        day: { id: 'rd3', dayNumber: 3, label: 'A slower Day 3', stops: [{ id: 'rs3b', order: 1, type: 'viewpoint', name: 'Slower Redwood Day 3', note: 'A relaxed scenic experience.', startTime: '', duration: 120 }] },
      }],
    };
    const { deps, result } = await runTurn({
      userMessage: 'Make Day 3 easier too',
      priorTripState: { ...BADLANDS_PRIOR, priorTargetTripId: REDWOOD_PLAN.id },
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
      existingCanonicalPlan: BADLANDS_CANONICAL_PLAN,
      loadTargetPlan,
      executeResponses: async () => patchResult(patch),
    });
    expect(deps.loadTargetPlan).toHaveBeenCalledTimes(1);
    expect(deps.loadTargetPlan).toHaveBeenCalledWith({ tripId: REDWOOD_PLAN.id, userId: OWNER_USER_ID });
    expect(result.status).toBe('complete');
    expect(result.targetTripId).toBe(REDWOOD_PLAN.id);
    expect(result.canonicalPlan).toBeNull();
    expect(result.targetPlanMutation.tripId).toBe(REDWOOD_PLAN.id);
    expect(result.targetPlanMutation.canonicalPlan.days[2].stops[0].name).toBe('Slower Redwood Day 3');
    // Hydrated at version 1 (the "already-once-revised" current state) -> N+1 = 2.
    expect(result.targetPlanMutation.canonicalPlan.responseVersion).toBe(2);
    expect(BADLANDS_CANONICAL_PLAN).toEqual(badlandsSnapshot);
  });

  // 4. Two ambiguous same-destination candidates -> fails closed BEFORE
  // hydration is even attempted (status never reached 'resolved').
  test('row 4: two Redwood candidates, no disambiguator -> fails closed, loadTargetPlan never called', async () => {
    const { deps, result } = await runTurn({
      userMessage: 'For my Redwood trip, change Day 2',
      priorTripState: BADLANDS_PRIOR,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN, REDWOOD_PLAN_2],
      activeTripId: BADLANDS_PLAN.id,
      existingCanonicalPlan: BADLANDS_CANONICAL_PLAN,
    });
    expect(result.status).toBe('plan_target_unresolved');
    expect(result.targetTripId).toBeNull();
    expect(deps.loadTargetPlan).not.toHaveBeenCalled();
    expect(deps.executeResponses).not.toHaveBeenCalled();
  });

  // 5. Historical reference to a destination with no saved plan -> not_found,
  // hydration never attempted (there is no resolved id to hydrate).
  test('row 5: a historical reference to a destination with no saved plan is not_found, loadTargetPlan never called', async () => {
    const { deps, result } = await runTurn({
      userMessage: 'For my Acadia trip, change Day 2',
      priorTripState: BADLANDS_PRIOR,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
      existingCanonicalPlan: BADLANDS_CANONICAL_PLAN,
    });
    expect(result.status).toBe('plan_target_unresolved');
    expect(result.targetTripId).toBeNull();
    expect(deps.loadTargetPlan).not.toHaveBeenCalled();
    expect(deps.executeResponses).not.toHaveBeenCalled();
  });

  // 6. Exact target resolves but hydration fails/ineligible -> fails closed,
  // NEVER falls back to the active Badlands plan.
  test('row 6: Redwood resolves but hydration fails (no usable canonical plan) -> fails closed, never falls back to Badlands', async () => {
    const loadTargetPlan = jest.fn(async () => ({ ok: false, reason: 'no_canonical_plan' }));
    const { deps, result } = await runTurn({
      userMessage: 'For my Redwood trip, change Day 2',
      priorTripState: BADLANDS_PRIOR,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
      existingCanonicalPlan: BADLANDS_CANONICAL_PLAN,
      loadTargetPlan,
    });
    expect(deps.loadTargetPlan).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('plan_target_unresolved');
    expect(result.terminalReason).toBe('plan_target_hydration_failed');
    expect(result.canonicalPlan).toBeNull();
    // Never Badlands' own content masquerading as the result.
    expect(result.canonicalPlan).not.toEqual(BADLANDS_CANONICAL_PLAN);
    expect(deps.executeResponses).not.toHaveBeenCalled();
  });

  // 7. Redwood Q&A (no plan-targeting job) -> no target resolution, no
  // hydration attempted.
  test('row 7: "Is October good in Redwood?" -> unaffected, no target resolution, no hydration', async () => {
    const { deps, result } = await runTurn({
      userMessage: 'Is October good in Redwood?',
      priorTripState: BADLANDS_PRIOR,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
    });
    expect(result.status).toBe('complete');
    expect(result.targetTripId).toBeNull();
    expect(deps.loadTargetPlan).not.toHaveBeenCalled();
    expect(deps.executeResponses).toHaveBeenCalledTimes(1);
  });

  // 8. Fresh itinerary build with an old same-destination plan saved -> no
  // historical hydration/reuse (Task 9/10, unaffected by this task).
  test('row 8: fresh "Plan Zion for 3 days" with an old Zion plan existing -> unaffected, never hydrates the old plan', async () => {
    const zionPlan = plan({ id: 'trip-zion-old', title: 'Old Zion Trip', parkCode: 'zion', parkName: 'Zion National Park' });
    const days = [{
      id: 'zd1', dayNumber: 1, label: 'Day 1',
      stops: [
        { name: 'Visitor Center orientation', duration: 45, timeWindow: 'Morning' },
        { name: 'Valley floor scenic walk', duration: 90, timeWindow: 'Late morning' },
        { name: 'Picnic and rest buffer', duration: 60, timeWindow: 'Midday' },
      ],
    }];
    const itineraryResult = {
      provider: 'openai', model: 'gpt-5.6-terra', outputText: '',
      toolCalls: [{ name: 'create_itinerary', id: 'call_1', input: { days }, rawArgs: JSON.stringify({ days }) }],
      completionStatus: 'complete', stopReason: 'stop', refusal: null,
      usage: { inputTokens: 1200, outputTokens: 300, cachedInputTokens: 0 },
    };
    const { deps, result } = await runTurn({
      userMessage: 'Plan Zion for 3 days',
      priorTripState: null,
      candidatePlans: [zionPlan],
      activeTripId: null,
      executeResponses: async () => itineraryResult,
    });
    expect(result.status).toBe('complete');
    expect(result.targetTripId).toBeNull();
    expect(deps.loadTargetPlan).not.toHaveBeenCalled();
    expect(deps.executeResponses).toHaveBeenCalledTimes(1);
  });
});

describe('Task 10B — fail-closed invariant still covers every prior case plus hydration failure', () => {
  // WP-TU Phase 4 Task 10D — updated: hydration succeeding now lets
  // generation proceed (this turn's default mock returns bare prose, no
  // patch tool call, so the required-artifact-fulfillment contract still
  // correctly rejects it as `not applied` — see
  // trailieExecutionContractIntegrity.test.js for that same contract proven
  // on the active-trip path). Either way, nothing ever touches the
  // `BADLANDS_CANONICAL_PLAN` object itself — this assertion still holds.
  test('the active plan object is never mutated even when hydration succeeds and generation runs (but does not fulfill the artifact)', async () => {
    const activePlanSnapshot = JSON.parse(JSON.stringify(BADLANDS_CANONICAL_PLAN));
    const loadTargetPlan = jest.fn(async () => ({ ok: true, plan: redwoodCanonicalPlan('v1') }));
    const { result } = await runTurn({
      userMessage: 'For my Redwood trip, change Day 2',
      priorTripState: BADLANDS_PRIOR,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
      existingCanonicalPlan: BADLANDS_CANONICAL_PLAN,
      loadTargetPlan,
    });
    expect(result.status).not.toBe('complete');
    expect(result.canonicalPlan).toBeNull();
    expect(result.targetPlanMutation).toBeNull();
    expect(BADLANDS_CANONICAL_PLAN).toEqual(activePlanSnapshot);
  });

  test('the active plan object is never mutated when resolution is ambiguous (loadTargetPlan absent entirely, mirrors pre-Task-10B callers)', async () => {
    const activePlanSnapshot = JSON.parse(JSON.stringify(BADLANDS_CANONICAL_PLAN));
    const deps = buildDeps();
    delete deps.loadTargetPlan; // exact pre-Task-10B caller/test shape
    await executeTrailieV2Turn({
      userMessage: 'For my Redwood trip, change Day 2',
      conversationContext: { history: [] },
      tripState: { ...BADLANDS_PRIOR, existingCanonicalPlan: BADLANDS_CANONICAL_PLAN },
      constraints: null,
      resolvedContext: {},
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN, REDWOOD_PLAN_2],
      activeTripId: BADLANDS_PLAN.id,
    }, { ...deps, enabled: true, classifyIntent: (args) => classifyTrailieIntent({ ...args, priorTripState: BADLANDS_PRIOR }) });
    expect(BADLANDS_CANONICAL_PLAN).toEqual(activePlanSnapshot);
  });

  test('a loadTargetPlan dependency that throws is treated as a hydration failure, not an unhandled rejection', async () => {
    const loadTargetPlan = jest.fn(async () => { throw new Error('DB unreachable'); });
    const { deps, result } = await runTurn({
      userMessage: 'For my Redwood trip, change Day 2',
      priorTripState: BADLANDS_PRIOR,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
      existingCanonicalPlan: BADLANDS_CANONICAL_PLAN,
      loadTargetPlan,
    });
    expect(deps.loadTargetPlan).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('plan_target_unresolved');
    expect(deps.executeResponses).not.toHaveBeenCalled();
  });
});
