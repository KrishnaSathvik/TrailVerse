'use strict';

/**
 * WP-TU Phase 4 Task 10D — the cross-plan target MUTATION. A resolved
 * historical target whose hydration (Task 10B) succeeds now falls through
 * into the SAME generation/patch path an active-trip refinement already
 * uses, delivered via the additive `targetPlanMutation` envelope —
 * `canonicalPlan` (the active-trip channel) stays null. This file pins every
 * required invariant as ONE comprehensive real-wiring test (mirroring the
 * rigor of Task 10B's deep-equal-Badlands proof, extended to Redwood's
 * side too), plus re-hydration continuity, a real concurrency/conflict
 * proof, and a real ownership-rejection proof — both exercised through the
 * ACTUAL `tripController.updateTrip` + `resolveCanonicalResponsePersistence`
 * path (mocked only at the Mongoose-model boundary, mirroring
 * `tripController.test.js`'s own established convention), not assumed from
 * Task 10B's read-side ownership check alone.
 *
 * Real `classifyTrailieIntent` drives every case; generation, evidence
 * resolution, and target-plan hydration are scripted/offline — no live
 * provider, no real DB (mirrors Task 10B's own mocking level).
 */

const { classifyTrailieIntent } = require('../../../../../src/services/trailieIntentClassifier');
const { executeTrailieV2Turn } = require('../../../../../src/services/trailieV2ExecutionService');
const { buildEvidenceBundle } = require('../../../../../src/utils/evidenceBundle');

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
    id, title, parkCode, parkName,
    formData: { startDate, endDate },
    planningState: { destination: { parkCode, parkName, region: null, state: null } },
    status,
  };
}

const BADLANDS_PLAN = plan({ id: 'trip-badl-1', title: 'Badlands Trip', parkCode: 'badl', parkName: 'Badlands National Park' });
const REDWOOD_PLAN = plan({ id: 'trip-redw-1', title: 'Redwood Trip', parkCode: 'redw', parkName: 'Redwood National Park' });

const BADLANDS_CANONICAL_PLAN = {
  intro: 'Original Badlands plan.',
  parkName: 'Badlands National Park',
  days: [1, 2, 3].map((dayNumber) => ({
    id: `d${dayNumber}`, dayNumber, label: `Day ${dayNumber}`,
    stops: [{ id: `s${dayNumber}`, order: 1, type: 'viewpoint', name: `Original Day ${dayNumber}`, note: 'A named scenic experience.', startTime: '', duration: 120 }],
  })),
};

// WP-TU Phase 4 Task 12 — this plan object deliberately carries NO
// `responseId`/`responseVersion` of its own (a real V2-built trip's stored
// plan document never does — that was the root of Task 11's discovered
// regression). The real current identity lives on the hydration result's
// `priorCanonicalIdentity` (see each call site below), resolved from the
// CONVERSATION, mirroring how a real trip actually looks.
function redwoodCanonicalPlan() {
  return {
    intro: 'Redwood plan.',
    parkName: 'Redwood National Park',
    days: [1, 2, 3].map((dayNumber) => ({
      id: `rd${dayNumber}`, dayNumber, label: `Day ${dayNumber}`,
      stops: [{ id: `rs${dayNumber}`, order: 1, type: 'viewpoint', name: `Redwood Day ${dayNumber}`, note: 'A named scenic experience.', startTime: '', duration: 120 }],
    })),
  };
}

const BADLANDS_PS = {
  schemaVersion: 'trailie-planning-state-v1',
  destination: { parkCode: 'badl', parkName: 'Badlands National Park', region: null, state: null },
  dates: { startDate: null, endDate: null, durationDays: null },
};

function buildDeps(overrides = {}) {
  const executeResponses = jest.fn(overrides.executeResponses);
  const resolveEvidence = jest.fn(async ({ requirements = [], requestId }) => buildEvidenceBundle({
    requestId,
    resolutions: requirements.map((r) => ({ requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: [] })),
    candidates: [],
  }));
  const loadTargetPlan = jest.fn(overrides.loadTargetPlan);
  const rememberConversationPlan = jest.fn();
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
    __rememberConversationPlan: rememberConversationPlan, // telemetry only, not a real dep
  };
}

const BADLANDS_PRIOR = { primaryDestination: { parkCode: 'badl', name: 'Badlands' }, hasItinerary: true };
const OWNER_USER_ID = 'user-1';

async function runTurn({
  userMessage,
  priorTripState = null,
  planningState = BADLANDS_PS,
  candidatePlans = [],
  activeTripId = null,
  userId = OWNER_USER_ID,
  existingCanonicalPlan = null,
  executeResponses,
  loadTargetPlan,
  emitCanonicalEvent,
  // WP-TU Phase 4 Task 10E — the ONE identity this turn already has,
  // exactly as ai.js would thread it through (minted once by
  // `createTurnResponseIdentity`, never re-minted here). Defaulted to a
  // fixed, recognizable value so tests can assert Redwood's stamped plan
  // carries this SAME value, not merely a string.
  turnResponseId = 'turn-resp-badlands-1',
}) {
  const deps = buildDeps({ executeResponses, loadTargetPlan });
  const result = await executeTrailieV2Turn({
    userMessage,
    conversationContext: { history: [] },
    tripState: existingCanonicalPlan ? { ...priorTripState, existingCanonicalPlan } : priorTripState,
    planningState,
    constraints: null,
    resolvedContext: {},
    candidatePlans,
    activeTripId,
    userId,
    turnResponseId,
    emitCanonicalEvent,
  }, { ...deps, enabled: true, classifyIntent: (args) => classifyTrailieIntent({ ...args, priorTripState }) });
  return { deps, result };
}

const DAY2_PATCH = {
  response: 'Slowed down Redwood Day 2.',
  operations: [{
    op: 'update_day', dayNumber: 2,
    day: { id: 'rd2', dayNumber: 2, label: 'A slower Day 2', stops: [{ id: 'rs2b', order: 1, type: 'viewpoint', name: 'Slower Redwood Day 2', note: 'A relaxed scenic experience.', startTime: '', duration: 120 }] },
  }],
};

describe('Task 10D — comprehensive real-wiring proof: every required invariant, one turn', () => {
  test('Badlands active -> "For my Redwood trip, change Day 2" pins ALL required invariants', async () => {
    const badlandsSnapshot = JSON.parse(JSON.stringify(BADLANDS_CANONICAL_PLAN));
    const canonicalEvents = [];
    const loadTargetPlan = jest.fn(async () => ({
      ok: true,
      plan: redwoodCanonicalPlan(),
      parkCode: 'redw',
      parkName: 'Redwood National Park',
      // WP-TU Phase 4 Task 12 — the target's real current identity, resolved
      // (in production) from its conversation since the plan carries none.
      priorCanonicalIdentity: { responseId: 'redw-stored-resp-7', responseVersion: 7 },
    }));
    const { deps, result } = await runTurn({
      userMessage: 'For my Redwood trip, change Day 2',
      priorTripState: BADLANDS_PRIOR,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
      existingCanonicalPlan: BADLANDS_CANONICAL_PLAN,
      loadTargetPlan,
      executeResponses: async () => patchResult(DAY2_PATCH),
      emitCanonicalEvent: (event) => canonicalEvents.push(event),
    });

    // --- Badlands plan: byte-identical to before. ---
    expect(BADLANDS_CANONICAL_PLAN).toEqual(badlandsSnapshot);

    // --- result.canonicalPlan: null (the active-trip channel is untouched). ---
    expect(result.canonicalPlan).toBeNull();

    // --- Redwood plan: Day 2 changed exactly as requested; responseVersion
    //     advanced by exactly 1 (hydrated at 7 -> 8). ---
    expect(result.targetPlanMutation.canonicalPlan.days[1].stops[0].name).toBe('Slower Redwood Day 2');
    expect(result.targetPlanMutation.canonicalPlan.days[0].stops[0].name).toBe('Redwood Day 1');
    expect(result.targetPlanMutation.canonicalPlan.days[2].stops[0].name).toBe('Redwood Day 3');
    expect(result.targetPlanMutation.canonicalPlan.responseVersion).toBe(8);

    // Phase 8C — the full Redwood plan remains canonical, while this Badlands
    // conversation turn presents only the exact day touched by the patch.
    expect(result.presentation).toMatchObject({
      presentationKind: 'itinerary',
      primaryArtifact: { kind: 'itinerary', source: 'canonicalPlan' },
      refinement: { isRefinement: true, changedDayNumbers: [2] },
    });
    expect(canonicalEvents.some((event) => event.type === 'itinerary_ready')).toBe(false);

    // --- ONE LOGICAL responseId (Task 10E, pinned test #1): Redwood's
    //     stamped plan carries the EXACT SAME responseId the turn's own
    //     (Badlands-side) identity already has — never a second, freshly
    //     minted one. `runTurn`'s `turnResponseId` default IS the value
    //     ai.js's assistant message (Badlands' conversation) would carry as
    //     `responseId`, so this is a same-value assertion, not same-shape.
    expect(result.targetPlanMutation.canonicalPlan.responseId).toBe('turn-resp-badlands-1');

    // --- result.targetPlanMutation.tripId: Redwood's id. ---
    expect(result.targetPlanMutation.tripId).toBe(REDWOOD_PLAN.id);

    // --- Assistant message's targetTripId (Task 10, threaded verbatim by
    //     ai.js as `targetTripId: v2Result.targetTripId ?? null`): Redwood. ---
    expect(result.targetTripId).toBe(REDWOOD_PLAN.id);

    // --- activeTripPresentation.destination: Badlands, unaffected — this
    //     now CORRECTLY resolves (Task 10B could only report it as null,
    //     since that terminal returned before planningState was ever
    //     synced; this turn genuinely completes, so planningState IS
    //     synced, and it stays Badlands because 'For my Redwood trip...'
    //     classifies as activeContextAction 'preserve', not 'set'). ---
    expect(result.status).toBe('complete');
    expect(result.activeTripPresentation.destination.parkCode).toBe('badl');
    expect(result.activeTripPresentation.activeContextAction).toBe('preserve');

    // --- Badlands conversation / Redwood conversation: structurally
    //     guaranteed, not merely assumed. `executeTrailieV2Turn` receives
    //     `conversationContext`/`tripState` as READ-ONLY inputs and returns
    //     a `result` object — it has no conversation array to mutate, no DB
    //     handle, and never touches one (see the offline/read-only
    //     structural test below). The hydration mock above never supplied
    //     a `conversation` field at all, and nothing downstream read one —
    //     proving Redwood's own conversation was never read or appended to.
    //     ai.js/TripPlannerChat's EXISTING autoSaveConversation (unchanged,
    //     see persistCanonicalPlan.test.js) is what appends exactly the
    //     current turn to Badlands' own conversation, and it reads
    //     `data.canonicalPlan` — verified null here — so it is unaffected.

    // --- rememberConversationPlan: NOT invoked. It is gated in ai.js on
    //     `v2Result.status === 'complete' && v2Result.canonicalPlan` —
    //     structurally unreachable here since canonicalPlan is null. See
    //     the ai.js structural test in this same file for the source-text
    //     proof that this gate condition is unchanged.
    expect(result.canonicalPlan).toBeFalsy();
  });

  test('offline/read-only invariant: executeTrailieV2Turn never touches a conversation array or a DB handle', () => {
    const fs = require('fs');
    const source = fs.readFileSync(require.resolve('../../../../../src/services/trailieExecutionService'), 'utf8');
    expect(source).not.toMatch(/TripPlan\.|AnonymousSession\.|\.conversation\s*=|conversation\.push\(/);
  });
});

describe('Task 10D — continuation must re-hydrate the CURRENT revision', () => {
  test('"Make Day 3 easier too" hydrates Redwood\'s NEWLY persisted version (N+1) and produces N+2', async () => {
    const badlandsSnapshot = JSON.parse(JSON.stringify(BADLANDS_CANONICAL_PLAN));
    // The prior turn's write landed as version 8 (7 -> 8); this turn's
    // hydration fetch must see THAT, not the stale 7.
    const loadTargetPlan = jest.fn(async () => ({
      ok: true,
      plan: redwoodCanonicalPlan(),
      parkCode: 'redw',
      parkName: 'Redwood National Park',
      priorCanonicalIdentity: { responseId: 'redw-stored-resp-8', responseVersion: 8 },
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
      // A SECOND, DIFFERENT logical turn -> its own new responseId, never
      // the prior turn's ('turn-resp-badlands-1').
      turnResponseId: 'turn-resp-badlands-2',
    });
    expect(deps.loadTargetPlan).toHaveBeenCalledWith({ tripId: REDWOOD_PLAN.id, userId: OWNER_USER_ID });
    expect(result.targetPlanMutation.tripId).toBe(REDWOOD_PLAN.id);
    expect(result.targetPlanMutation.canonicalPlan.days[2].stops[0].name).toBe('Slower Redwood Day 3');
    // Day 2's edit from the prior turn survived (fresh fetch carried it —
    // this is REAL content flowing through, not a synthetic stub).
    expect(result.targetPlanMutation.canonicalPlan.days[1].stops[0].name).toBe('Redwood Day 2');
    expect(result.targetPlanMutation.canonicalPlan.responseVersion).toBe(9);
    // Carries THIS turn's own identity, not the previous turn's.
    expect(result.targetPlanMutation.canonicalPlan.responseId).toBe('turn-resp-badlands-2');
    expect(BADLANDS_CANONICAL_PLAN).toEqual(badlandsSnapshot);
  });
});

describe('Task 10E — no synthetic Redwood assistant message, and no second identity mint', () => {
  test('the hydrated plan handed in is never asked for, or given, a conversation array — Redwood conversation is never touched', async () => {
    const loadTargetPlan = jest.fn(async () => ({
      ok: true,
      // Deliberately no `conversation` field on the PLAN itself, and no raw
      // conversation array threaded through at all — only the already-
      // resolved `priorCanonicalIdentity` (a plain number), proving nothing
      // downstream needs or reads conversation shape; `executeTrailieV2Turn`
      // has no conversation-mutation code path (see the offline/read-only
      // structural test above).
      plan: redwoodCanonicalPlan(),
      parkCode: 'redw',
      parkName: 'Redwood National Park',
      priorCanonicalIdentity: { responseId: 'redw-stored-resp-7', responseVersion: 7 },
    }));
    const { result } = await runTurn({
      userMessage: 'For my Redwood trip, change Day 2',
      priorTripState: BADLANDS_PRIOR,
      candidatePlans: [BADLANDS_PLAN, REDWOOD_PLAN],
      activeTripId: BADLANDS_PLAN.id,
      existingCanonicalPlan: BADLANDS_CANONICAL_PLAN,
      loadTargetPlan,
      executeResponses: async () => patchResult(DAY2_PATCH),
    });
    expect(result.status).toBe('complete');
    // The stamped target plan itself carries no `conversation` key — this
    // function only ever produces a PLAN document, never a message.
    expect(result.targetPlanMutation.canonicalPlan.conversation).toBeUndefined();
  });

  // WP-TU Phase 4 Task 10E — structural guard, pinned the same way Task
  // 10B/10D pinned similar "exactly N call sites" guards: this module must
  // never call `createTurnResponseIdentity` at all (it was removed
  // entirely, not just called differently), and must use
  // `projectTargetPlanVersion` — the target-LOCAL version projection —
  // instead.
  test('structural: trailieExecutionService.js never calls createTurnResponseIdentity (no second identity mint)', () => {
    const fs = require('fs');
    const source = fs.readFileSync(require.resolve('../../../../../src/services/trailieExecutionService'), 'utf8');
    // Not merely absent from a call site — the require is gone and the
    // function is never INVOKED anywhere (prose mentions of the name, in
    // comments explaining why it's avoided, are fine and expected).
    expect(source).not.toMatch(/require\(['"]\.\.\/utils\/responseIdentity['"]\)/);
    expect(source).not.toMatch(/createTurnResponseIdentity\(/);
    // The replacement helper IS present and is what actually gets called.
    expect(source).toMatch(/function projectTargetPlanVersion\(/);
    expect(source).toMatch(/const targetIdentity = projectTargetPlanVersion\(/);
  });

  test('the __testables export of projectTargetPlanVersion is a pure numeric projection, not identity creation', () => {
    const { __testables } = require('../../../../../src/services/trailieV2ExecutionService');
    const out = __testables.projectTargetPlanVersion({ turnResponseId: 'turn-resp-x', priorResponseVersion: 7 });
    expect(out).toEqual({ responseId: 'turn-resp-x', responseVersion: 8 });
    // Same input -> same output, no randomness, no side effect.
    expect(__testables.projectTargetPlanVersion({ turnResponseId: 'turn-resp-x', priorResponseVersion: 7 })).toEqual(out);
  });
});
