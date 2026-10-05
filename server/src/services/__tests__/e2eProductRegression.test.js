'use strict';

/**
 * WP-TU Phase 4 Task 11 — end-to-end deterministic product-regression
 * fixture. Reuses everything Tasks 3-10E already built and proved in
 * isolation; introduces NO new resolver/classifier/evidence/persistence
 * architecture. Five turns (A-E), each one's REAL output threaded into the
 * next exactly as production would: `priorTargetTripId` derived via the
 * real `buildClassifierPriorTripState` (trailieRouteBridge.js), hydrated
 * plan content read back from the SAME mutable `stores` object the real
 * `tripController.updateTrip` (mocked only at the Mongoose-model boundary,
 * `tripController.test.js`'s own convention) just wrote to.
 *
 * Confirmation-gate nuance (verified, not assumed): `activeTripContextService.js`'s
 * `lowConfidenceClarification`/`needsClarification` (~line 376-687) belongs
 * ONLY to the LEGACY `resolveActiveTripContext` pipeline (`ai.js:1152`) —
 * grep-confirmed it is never referenced by `trailieRouteBridge.js` or
 * `trailieExecutionService.js`. The V2 pipeline this whole project built
 * has no confirmation-gate concept at all; the real, authoritative "no
 * confirmation needed" signal for "Actually plan Badlands instead" is
 * `intent.tripContext.activeContextAction === 'set'` (Task 4A). Turn B
 * asserts against that field, not against `lowConfidenceClarification`.
 *
 * *** Task 11 discovered a real regression here: a trip that was ever itself
 * a real active V2 trip has its true turn identity living on its
 * CONVERSATION (the V2 pipeline never stamps `plan.responseVersion` for an
 * active trip), but Task 10D/10E's target-write version projection
 * baselined from `plan.responseVersion` directly (always undefined
 * pre-first-target-write) — so the first cross-plan edit to such a trip
 * always computed the SAME version number the conversation was already at,
 * under a DIFFERENT responseId, and was correctly refused as a conflict.
 * TASK 12 FIXED THIS: `loadTargetPlanById` (targetPlanHydration.js) now
 * resolves the target's REAL current identity with the IDENTICAL
 * plan-then-conversation precedence `resolveCanonicalWriteTarget` already
 * uses for validating an incoming write (`priorCanonicalIdentity`), reused
 * here via the REAL `loadTargetPlanById` function itself (not a hand-rolled
 * mock) — see `wireStores`/`realLoadTargetPlan` below. Turn D/E now prove
 * REAL acceptance and persistence, not the bug. ***
 */

jest.mock('../../models/TripPlan');
// Only `markTurnPersistence` (the controller's telemetry call) is mocked —
// `trailieExecutionService.js` itself imports `priceProviderCall` from
// this SAME module for real cost accounting, so the mock factory must keep
// every other real export intact (discovered while building this fixture:
// mocking the whole module away broke generation with a misleadingly
// generic `provider_unavailable` terminal, not a helpful error).
jest.mock('../../services/trailieTurnLedger', () => ({
  ...jest.requireActual('../../services/trailieTurnLedger'),
  markTurnPersistence: jest.fn().mockResolvedValue(null),
}));

const TripPlan = require('../../models/TripPlan');
const controller = require('../../controllers/tripController');
const { classifyTrailieIntent } = require('../trailieIntentClassifier');
const { executeTrailieV2Turn } = require('../trailieV2ExecutionService');
const { buildEvidenceBundle } = require('../../utils/evidenceBundle');
const { buildClassifierPriorTripState } = require('../trailieV2RouteBridge');
// WP-TU Phase 4 Task 12 — the REAL hydration function, not a hand-rolled
// mock: proves the fix using actual production code, mocked only at the
// Mongoose-model boundary (see `wireStores` below).
const { loadTargetPlanById } = require('../../utils/targetPlanHydration');

const OWNER = 'user-1';
const REDWOOD_ID = 'trip-redw-1';
const BADLANDS_ID = 'trip-badl-1';

// ---------------------------------------------------------------------------
// Generation stubs — mocked at the SAME boundary every prior real-wiring
// test in this chain mocks (executeResponses), never the classifier/
// resolver/persistence-shape logic.
// ---------------------------------------------------------------------------
function itineraryResult(days) {
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
function proseResult(text) {
  return {
    provider: 'openai', model: 'gpt-5.6-terra', outputText: text, toolCalls: [],
    completionStatus: 'complete', stopReason: 'stop', refusal: null,
    usage: { inputTokens: 700, outputTokens: 120, cachedInputTokens: 0 },
  };
}

function candidate({ id, title, parkCode, parkName }) {
  return {
    id, title, parkCode, parkName,
    formData: { startDate: null, endDate: null },
    planningState: { destination: { parkCode, parkName, region: null, state: null } },
    status: 'active',
  };
}
const REDWOOD_CANDIDATE = candidate({ id: REDWOOD_ID, title: 'Redwood Trip', parkCode: 'redw', parkName: 'Redwood National Park' });
const BADLANDS_CANDIDATE = candidate({ id: BADLANDS_ID, title: 'Badlands Trip', parkCode: 'badl', parkName: 'Badlands National Park' });

// Three genuinely DISTINCT experiences per day (never near-duplicate names
// of the same place — that trips the real `duplicate_base_experience`
// completeness check, discovered while building this fixture and fixed
// here in the fixture's OWN content, not in any product code).
function threeStopDay({ idPrefix, dayNumber, stopName, type = 'viewpoint' }) {
  return {
    id: `${idPrefix}${dayNumber}`, dayNumber, label: `Day ${dayNumber}`,
    stops: [
      { id: `${idPrefix}${dayNumber}s1`, order: 1, type, name: stopName, note: 'A named scenic experience.', startTime: '', duration: 120 },
      { id: `${idPrefix}${dayNumber}s2`, order: 2, type: 'viewpoint', name: `Visitor Center orientation (Day ${dayNumber})`, note: 'A named scenic experience.', startTime: '', duration: 60 },
      { id: `${idPrefix}${dayNumber}s3`, order: 3, type: 'viewpoint', name: `Picnic and rest buffer (Day ${dayNumber})`, note: 'A named scenic experience.', startTime: '', duration: 45 },
    ],
  };
}

function buildDeps(overrides = {}) {
  const executeResponses = jest.fn(overrides.executeResponses);
  const resolveEvidence = jest.fn(async ({ requirements = [], requestId }) => buildEvidenceBundle({
    requestId,
    resolutions: requirements.map((r) => ({ requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: [] })),
    candidates: [],
  }));
  const loadTargetPlan = jest.fn(overrides.loadTargetPlan);
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

async function runV2Turn({
  userMessage, priorTripState = null, planningState = null, candidatePlans = [],
  activeTripId = null, existingCanonicalPlan = null, executeResponses, loadTargetPlan,
  turnResponseId, userId = OWNER,
}) {
  const deps = buildDeps({ executeResponses, loadTargetPlan });
  return executeTrailieV2Turn({
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
  }, { ...deps, enabled: true, classifyIntent: (args) => classifyTrailieIntent({ ...args, priorTripState }) });
}

// ---------------------------------------------------------------------------
// Persistence harness — mirrors crossPlanTargetMutationPersistence.test.js's
// two-store convention exactly, extended to N stores for this sequence.
// ---------------------------------------------------------------------------
function mockRes() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}
const reqFor = (body, { user = OWNER, tripId }) => ({
  body, params: { tripId }, user: { _id: user, id: user }, app: { get: () => null },
});
// WP-TU Phase 4 Task 12 — `TripPlan.findById` must satisfy TWO real call
// shapes in this fixture: `tripController.js`'s direct `await
// TripPlan.findById(id)` (no chaining), and `targetPlanHydration.js`'s
// `TripPlan.findById(id).select(...).lean()` (chained). This thenable
// object satisfies both without special-casing either caller.
function wireStores(stores) {
  TripPlan.findById.mockImplementation((id) => {
    const value = stores[id] || null;
    return {
      then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
      select: () => ({ lean: () => Promise.resolve(value) }),
    };
  });
  TripPlan.findByIdAndUpdate.mockImplementation((id, update) => {
    stores[id] = { ...stores[id], ...update.$set };
    return { toObject: () => ({ ...stores[id] }) };
  });
}

/** The REAL hydration function, bound to this turn's target — mirrors
 * exactly how `trailieRouteBridge.js` supplies `loadTargetPlan` in
 * production, reading whatever is CURRENTLY in `stores` at call time. */
function realLoadTargetPlan({ tripId, userId }) {
  return loadTargetPlanById({ tripId, userId });
}

const REDWOOD_PS = {
  schemaVersion: 'trailie-planning-state-v1',
  destination: { parkCode: 'redw', parkName: 'Redwood National Park', region: null, state: null },
  dates: { startDate: null, endDate: null, durationDays: null },
};
const BADLANDS_PS = {
  schemaVersion: 'trailie-planning-state-v1',
  destination: { parkCode: 'badl', parkName: 'Badlands National Park', region: null, state: null },
  dates: { startDate: null, endDate: null, durationDays: null },
};

beforeEach(() => {
  jest.clearAllMocks();
  TripPlan.findById = jest.fn();
  TripPlan.findByIdAndUpdate = jest.fn();
  TripPlan.findOne = jest.fn();
  TripPlan.create = jest.fn();
  TripPlan.updateOne = jest.fn().mockResolvedValue({ matchedCount: 1 });
});

describe('Task 11 — end-to-end product regression, Turn A through Turn E', () => {
  test('the full sequence holds every invariant, threaded turn to turn', async () => {
    const stores = {
      [REDWOOD_ID]: { _id: REDWOOD_ID, userId: OWNER, plan: null, conversation: [] },
      [BADLANDS_ID]: { _id: BADLANDS_ID, userId: OWNER, plan: null, conversation: [] },
    };
    wireStores(stores);

    // ========================================================================
    // TURN A — fresh Redwood build. Redwood becomes active.
    // ========================================================================
    const redwoodDaysV1 = [
      threeStopDay({ idPrefix: 'rd', dayNumber: 1, stopName: 'Tall Trees Grove hike', type: 'trail' }),
      threeStopDay({ idPrefix: 'rd', dayNumber: 2, stopName: 'Tide pools stop' }),
    ];
    const resultA = await runV2Turn({
      userMessage: 'Plan a 2 day trip to Redwood National Park for me.',
      priorTripState: null,
      planningState: null,
      candidatePlans: [],
      activeTripId: null,
      turnResponseId: 'turn-resp-A',
      executeResponses: async () => itineraryResult(redwoodDaysV1),
    });
    expect(resultA.status).toBe('complete');
    expect(resultA.activeTripPresentation.destination.parkCode).toBe('redw');
    expect(resultA.activeTripPresentation.activeContextAction).toBe('set');
    expect(resultA.canonicalPlan.days).toHaveLength(2);
    // Real finalization (`finalizeStructuredItinerary`) enriches every stop
    // with identity/coordinate metadata — captured here as the TRUE
    // baseline Day 1 content Turn D must leave byte-identical, not the raw
    // pre-finalization input.
    const redwoodFinalizedDay1 = resultA.canonicalPlan.days[0];

    // Persist Turn A's own turn for real (legacy-migration: Redwood's FIRST-
    // ever canonical write) — real controller, real validator, real
    // canonicalPersistence decision. `data.canonicalPlan` (resultA.canonicalPlan)
    // carries NO identity fields — confirmed the V2 authenticated pipeline
    // never stamps one via buildPlanDocument (unlike the legacy pipeline);
    // this is exactly what a real client's `currentPlan`/`planForSave` is.
    const resA = mockRes();
    await controller.updateTrip(
      reqFor({
        conversation: [
          { role: 'user', content: 'Plan a 2 day trip to Redwood National Park for me.' },
          { role: 'assistant', content: 'Here is your Redwood itinerary.', responseId: 'turn-resp-A', responseVersion: 1 },
        ],
        plan: resultA.canonicalPlan,
        summary: {},
      }, { tripId: REDWOOD_ID }),
      resA, jest.fn()
    );
    // ACCEPT ('no_existing_identity'), not legacy_migration: the assistant
    // message ITSELF already carries a real identity (Stage 14.1 — every
    // real assistant message does), so `extractIncomingResponseIdentity`'s
    // plan-then-conversation fallback finds it via the conversation, and
    // there is nothing stored yet to conflict with.
    expect(resA.body.planPersistence.outcome).toBe('accept');
    expect(resA.body.planPersistence.success).toBe(true);
    // The stored plan itself carries no identity fields (the client's raw,
    // identity-free `canonicalPlan` was written verbatim) — the conversation
    // array is what carries the real, durable turn identity for a V2 trip.
    expect(stores[REDWOOD_ID].plan.responseId).toBeUndefined();
    expect(stores[REDWOOD_ID].conversation[1].responseId).toBe('turn-resp-A');

    // ========================================================================
    // TURN B — "Actually plan Badlands instead." Badlands becomes active.
    // Confirmation-gate nuance: the V2 path's authoritative "no confirmation
    // needed" signal is `activeContextAction === 'set'` (Task 4A) —
    // `lowConfidenceClarification` is legacy-pipeline-only and never
    // consulted here (verified above); this result carries no such field.
    // ========================================================================
    const REDWOOD_ACTIVE_PRIOR = { primaryDestination: { parkCode: 'redw', name: 'Redwood National Park' }, hasItinerary: true };
    const badlandsDaysV1 = [
      threeStopDay({ idPrefix: 'bd', dayNumber: 1, stopName: 'Badlands Loop Road overlook' }),
      threeStopDay({ idPrefix: 'bd', dayNumber: 2, stopName: 'Notch Trail hike', type: 'trail' }),
    ];
    const resultB = await runV2Turn({
      userMessage: 'Actually plan a 2 day trip to Badlands instead.',
      priorTripState: REDWOOD_ACTIVE_PRIOR,
      planningState: REDWOOD_PS,
      candidatePlans: [REDWOOD_CANDIDATE],
      activeTripId: REDWOOD_ID,
      turnResponseId: 'turn-resp-B',
      executeResponses: async () => itineraryResult(badlandsDaysV1),
    });
    expect(resultB.status).toBe('complete');
    expect(resultB.activeTripPresentation.destination.parkCode).toBe('badl');
    expect(resultB.activeTripPresentation.activeContextAction).toBe('set');
    // No confirmation/clarification field of any kind on the public result.
    expect(Object.keys(resultB).some((k) => /clarif|confirm/i.test(k))).toBe(false);

    const redwoodStoreSnapshotAfterA = JSON.parse(JSON.stringify(stores[REDWOOD_ID]));
    const resB = mockRes();
    await controller.updateTrip(
      reqFor({
        conversation: [
          { role: 'user', content: 'Actually plan a 2 day trip to Badlands instead.' },
          { role: 'assistant', content: 'Here is your Badlands itinerary.', responseId: 'turn-resp-B', responseVersion: 1 },
        ],
        plan: resultB.canonicalPlan,
        summary: {},
      }, { tripId: BADLANDS_ID }),
      resB, jest.fn()
    );
    expect(resB.body.planPersistence.success).toBe(true);
    // See the Turn A note above: the V2 active-trip plan document itself
    // never carries a responseVersion; the conversation is the durable
    // per-turn identity for an active trip.
    expect(stores[BADLANDS_ID].plan.responseId).toBeUndefined();
    expect(stores[BADLANDS_ID].conversation[1].responseId).toBe('turn-resp-B');
    // Redwood is COMPLETELY untouched by Badlands becoming active.
    expect(stores[REDWOOD_ID]).toEqual(redwoodStoreSnapshotAfterA);

    // ========================================================================
    // TURN C — a Badlands side query. Subject/active state stay coherent;
    // this must NOT be forced into itinerary/structured output.
    // ========================================================================
    const BADLANDS_ACTIVE_PRIOR = { primaryDestination: { parkCode: 'badl', name: 'Badlands National Park' }, hasItinerary: true };
    const resultC = await runV2Turn({
      userMessage: 'What time of day is it usually cooler for hiking there?',
      priorTripState: BADLANDS_ACTIVE_PRIOR,
      planningState: BADLANDS_PS,
      candidatePlans: [REDWOOD_CANDIDATE, BADLANDS_CANDIDATE],
      activeTripId: BADLANDS_ID,
      turnResponseId: 'turn-resp-C',
      executeResponses: async () => proseResult('Mornings before 10am are usually coolest for hiking.'),
    });
    expect(resultC.status).toBe('complete');
    // Q&A-shaped, not itinerary-shaped — real, publicly-exposed fields.
    expect(resultC.intent.primaryIntent).toBe('general_qa');
    expect(resultC.intent.travelerJob).toBe('general_advice');
    expect(resultC.canonicalPlan).toBeNull(); // no itinerary artifact was produced
    // Active state unaffected — still Badlands, gated 'preserve' not 'set'.
    expect(resultC.activeTripPresentation.destination.parkCode).toBe('badl');
    expect(resultC.activeTripPresentation.activeContextAction).toBe('preserve');

    // Real persistence proof for the ordinary Q&A save — `currentPlan`
    // (resultB.canonicalPlan, still identity-free, unchanged) is resent
    // verbatim; the write must still succeed (a real, verified regression
    // check — see the Task 11 report for what this ruled out).
    const resC = mockRes();
    await controller.updateTrip(
      reqFor({
        conversation: [
          { role: 'user', content: 'Actually plan a 2 day trip to Badlands instead.' },
          { role: 'assistant', content: 'Here is your Badlands itinerary.', responseId: 'turn-resp-B', responseVersion: 1 },
          { role: 'user', content: 'What time of day is it usually cooler for hiking there?' },
          { role: 'assistant', content: 'Mornings before 10am are usually coolest for hiking.', responseId: 'turn-resp-C', responseVersion: 2 },
        ],
        plan: resultB.canonicalPlan,
      }, { tripId: BADLANDS_ID }),
      resC, jest.fn()
    );
    expect(resC.body.planPersistence.success).toBe(true);
    expect(resC.body.planPersistence.outcome).toBe('accept');
    expect(stores[BADLANDS_ID].conversation).toHaveLength(4);

    // ========================================================================
    // TURN D — cross-plan historical refinement. "For the Redwood trip, on
    // Day 2 replace the tide pools stop with a redwood grove walk. Leave
    // Day 1 exactly as it is."
    // ========================================================================
    const turnDMessage = 'For the Redwood trip, on Day 2 replace the tide pools stop with a redwood grove walk. Leave Day 1 exactly as it is.';

    // Subject resolution (Tasks 4A/6): checked directly against the real
    // classifier, mirroring how every prior real-wiring test in this chain
    // asserts subject/resolvedEntities — `executeTrailieV2Turn`'s public
    // result does not itself re-expose `understanding`.
    const turnDIntent = classifyTrailieIntent({ userPrompt: turnDMessage, priorTripState: BADLANDS_ACTIVE_PRIOR });
    expect(turnDIntent.understanding.primaryDestination.parkCode).toBe('redw');
    expect(turnDIntent.understanding.subjectDestinations.map((d) => d.parkCode)).toEqual(['redw']);

    // A single-stop `update_stop` — not `update_day` — matches the SCOPE of
    // what was actually requested ("replace the tide pools stop", not
    // "rewrite Day 2"). Discovered while building this fixture: an
    // `update_day` replacing the whole day (even leaving 2 of 3 stops
    // unchanged in content) is correctly rejected by the real machine-owned
    // scope resolver as `patch_operation_exceeds_requested_scope` — the
    // machine, not the model, decides the breadth (see
    // trailie-machine-owned-refinement-scope in project memory).
    const turnDPatch = {
      response: 'Swapped the tide pools stop for a redwood grove walk on Day 2.',
      operations: [{
        op: 'update_stop', dayNumber: 2, stopId: 'rd2s1',
        stop: { name: 'Redwood grove walk', type: 'trail', note: 'A relaxed grove walk under old-growth canopy.', duration: 120 },
      }],
    };

    const resultD = await runV2Turn({
      userMessage: turnDMessage,
      priorTripState: BADLANDS_ACTIVE_PRIOR, // no priorTargetTripId yet — first cross-plan reference
      planningState: BADLANDS_PS,
      candidatePlans: [REDWOOD_CANDIDATE, BADLANDS_CANDIDATE],
      activeTripId: BADLANDS_ID,
      turnResponseId: 'turn-resp-D',
      // WP-TU Phase 4 Task 12 — the REAL hydration function. Reads the
      // CURRENT store, mutated by Turn A's real persistence above, and now
      // ALSO resolves Redwood's real current identity (`priorCanonicalIdentity`)
      // from its conversation (its plan carries none) — the fix for Task
      // 11's discovered regression.
      loadTargetPlan: realLoadTargetPlan,
      executeResponses: async () => patchResult(turnDPatch),
    });

    // --- subject=Redwood (already asserted above via the real classifier) ---
    // --- active trip=Badlands ---
    expect(resultD.status).toBe('complete');
    expect(resultD.activeTripPresentation.destination.parkCode).toBe('badl');
    expect(resultD.activeTripPresentation.activeContextAction).toBe('preserve');
    // --- targetTripId=Redwood ---
    expect(resultD.targetTripId).toBe(REDWOOD_ID);
    // --- the active-trip channel is untouched ---
    expect(resultD.canonicalPlan).toBeNull();
    // --- Redwood Day 1 byte-identical; Day 2 changed exactly as requested ---
    // Compared against Turn A's own FINALIZED Day 1 (real `finalizeStructuredItinerary`
    // stamps identity/coordinate metadata onto every stop, including
    // untouched ones — that enrichment is expected and real; the point is
    // that Turn D's patch introduces ZERO further change to it).
    expect(resultD.targetPlanMutation.canonicalPlan.days[0]).toEqual(redwoodFinalizedDay1);
    expect(resultD.targetPlanMutation.canonicalPlan.days[1].stops[0].name).toBe('Redwood grove walk');
    expect(resultD.targetPlanMutation.canonicalPlan.days[1].stops).toHaveLength(3);
    // --- responseVersion incremented by exactly 1. Redwood's REAL current
    //     identity (Task 12) lives on its CONVERSATION — Turn A's real
    //     persisted assistant message, `turn-resp-A`/version 1 (a
    //     V2-authenticated trip's OWN stored `plan` document never carries
    //     one; confirmed the V2 pipeline never calls `buildPlanDocument` for
    //     the active-trip channel) — so hydration correctly resolves
    //     `priorCanonicalIdentity.responseVersion = 1`, and this turn's
    //     target write becomes version 1 + 1 = 2. ---
    expect(resultD.targetPlanMutation.canonicalPlan.responseVersion).toBe(2);
    // --- ONE logical identity (Task 10E) ---
    expect(resultD.targetPlanMutation.canonicalPlan.responseId).toBe('turn-resp-D');
    expect(resultD.targetPlanMutation.tripId).toBe(REDWOOD_ID);

    // --- Badlands conversation receives the real user+assistant turn for
    //     THIS turn (real persistence, ordering-correct: Badlands' OWN save
    //     happens BEFORE Redwood's target save, exactly as Task 10E's
    //     ordering rule requires). ---
    const badlandsSnapshotBeforeD = JSON.parse(JSON.stringify(stores[BADLANDS_ID]));
    const newBadlandsConversation = [
      ...stores[BADLANDS_ID].conversation,
      { role: 'user', content: turnDMessage },
      { role: 'assistant', content: turnDPatch.response, responseId: 'turn-resp-D', responseVersion: 3, targetTripId: REDWOOD_ID },
    ];
    const resD1 = mockRes();
    await controller.updateTrip(
      reqFor({ conversation: newBadlandsConversation, plan: resultB.canonicalPlan /* unchanged, data.canonicalPlan was null */ }, { tripId: BADLANDS_ID }),
      resD1, jest.fn()
    );
    expect(resD1.body.planPersistence.success).toBe(true);
    // --- Badlands PLAN content is byte-identical to before ---
    expect(stores[BADLANDS_ID].plan.days).toEqual(badlandsSnapshotBeforeD.plan.days);

    // --- the target save uses verified Badlands->Redwood provenance,
    //     exercised through the REAL resolveCanonicalWriteTarget /
    //     verifyCrossPlanProvenance path (not mocked) ---
    //
    // *** TASK 12 FIX PROVEN HERE. Task 11 found this write REJECTED
    // (`different_response_same_version`) because the target-write version
    // projection baselined from `plan.responseVersion` directly (always
    // undefined) instead of Redwood's REAL current identity (living on its
    // conversation). Task 12 fixed hydration to resolve that real identity
    // first — this write now ACCEPTS, and Redwood's stored plan genuinely
    // changes. ***
    const redwoodConversationSnapshotBeforeD = JSON.parse(JSON.stringify(stores[REDWOOD_ID].conversation));
    const resD2 = mockRes();
    await controller.updateTrip(
      reqFor({
        plan: resultD.targetPlanMutation.canonicalPlan,
        sourceTripId: BADLANDS_ID,
        sourceResponseId: 'turn-resp-D',
      }, { tripId: REDWOOD_ID }),
      resD2, jest.fn()
    );
    expect(resD2.body.planPersistence.success).toBe(true);
    expect(resD2.body.planPersistence.outcome).toBe('accept');
    expect(stores[REDWOOD_ID].plan.responseVersion).toBe(2);
    expect(stores[REDWOOD_ID].plan.responseId).toBe('turn-resp-D');
    expect(stores[REDWOOD_ID].plan.days[1].stops[0].name).toBe('Redwood grove walk');
    expect(stores[REDWOOD_ID].plan.days[0]).toEqual(redwoodFinalizedDay1);
    // --- Redwood conversation byte-identical (never touched) ---
    expect(stores[REDWOOD_ID].conversation).toEqual(redwoodConversationSnapshotBeforeD);

    // ========================================================================
    // TURN E — "Make Day 2 a little easier too." Bare continuation, no
    // destination named. Must resolve to Redwood via priorTargetTripId,
    // rehydrate the LATEST Redwood revision (Turn D's REAL, just-persisted
    // one — now that Task 12 fixed the write to actually land), and advance
    // the version again exactly once: 2 -> 3.
    // ========================================================================
    const priorTripStateE = buildClassifierPriorTripState({ conversation: stores[BADLANDS_ID].conversation });
    expect(priorTripStateE.priorTargetTripId).toBe(REDWOOD_ID);

    const turnEPatch = {
      response: 'Made Day 2 a little easier too.',
      operations: [{
        op: 'update_stop', dayNumber: 2, stopId: 'rd2s1',
        stop: { name: 'Redwood grove walk (shorter loop)', type: 'trail', note: 'A shorter, relaxed grove walk under old-growth canopy.', duration: 90 },
      }],
    };
    const resultE = await runV2Turn({
      userMessage: 'Make Day 2 a little easier too.',
      priorTripState: { ...BADLANDS_ACTIVE_PRIOR, priorTargetTripId: priorTripStateE.priorTargetTripId },
      planningState: BADLANDS_PS,
      candidatePlans: [REDWOOD_CANDIDATE, BADLANDS_CANDIDATE],
      activeTripId: BADLANDS_ID,
      turnResponseId: 'turn-resp-E',
      // Fresh fetch, real function — reads whatever is REALLY currently
      // stored (Turn D's REAL, just-persisted revision, now that it
      // actually landed), and resolves the REAL current identity from it:
      // the plan NOW carries `responseId: 'turn-resp-D'` directly (Task
      // 12's fix stamped it via Redwood's own target write), so this
      // precedence branch is "plan wins outright" this time, not
      // conversation-derived — proving BOTH branches for real across one
      // fixture.
      loadTargetPlan: realLoadTargetPlan,
      executeResponses: async () => patchResult(turnEPatch),
    });

    expect(resultE.status).toBe('complete');
    // Resolves to Redwood, NOT Badlands, via priorTargetTripId ALONE — no
    // destination was named in "Make Day 2 a little easier too."
    expect(resultE.targetTripId).toBe(REDWOOD_ID);
    expect(resultE.activeTripPresentation.destination.parkCode).toBe('badl'); // active trip unaffected
    // Rehydrated Turn D's ACTUAL revision (grove walk already present) —
    // proven by the fact the further edit lands on top of it, not a stale
    // pre-Turn-D snapshot.
    expect(resultE.targetPlanMutation.canonicalPlan.days[1].stops[0].name).toBe('Redwood grove walk (shorter loop)');
    expect(resultE.targetPlanMutation.canonicalPlan.days[0]).toEqual(redwoodFinalizedDay1); // Day 1 still untouched
    // Version advances exactly once more: 2 -> 3 (real value, threaded
    // through from Turn D's real persisted state — no hand-typed number).
    expect(resultE.targetPlanMutation.canonicalPlan.responseVersion).toBe(3);
    expect(resultE.targetPlanMutation.canonicalPlan.responseId).toBe('turn-resp-E');

    // --- Turn E's OWN persistence: Badlands' side save, then Redwood's
    //     target save — N -> N+1 -> N+2 fully proven end to end, real
    //     controller, real provenance, real version math throughout. ---
    const newBadlandsConversationE = [
      ...stores[BADLANDS_ID].conversation,
      { role: 'user', content: 'Make Day 2 a little easier too.' },
      { role: 'assistant', content: turnEPatch.response, responseId: 'turn-resp-E', responseVersion: 4, targetTripId: REDWOOD_ID },
    ];
    const resE1 = mockRes();
    await controller.updateTrip(
      reqFor({ conversation: newBadlandsConversationE, plan: resultB.canonicalPlan }, { tripId: BADLANDS_ID }),
      resE1, jest.fn()
    );
    expect(resE1.body.planPersistence.success).toBe(true);

    const resE2 = mockRes();
    await controller.updateTrip(
      reqFor({
        plan: resultE.targetPlanMutation.canonicalPlan,
        sourceTripId: BADLANDS_ID,
        sourceResponseId: 'turn-resp-E',
      }, { tripId: REDWOOD_ID }),
      resE2, jest.fn()
    );
    expect(resE2.body.planPersistence.success).toBe(true);
    expect(stores[REDWOOD_ID].plan.responseVersion).toBe(3);
    expect(stores[REDWOOD_ID].plan.days[1].stops[0].name).toBe('Redwood grove walk (shorter loop)');
    expect(stores[REDWOOD_ID].conversation).toEqual(redwoodConversationSnapshotBeforeD); // still never touched
  });
});
