'use strict';

/**
 * WP-TU Phase 4 Task 10D/10E — the cross-plan target mutation's PERSISTENCE
 * path, exercised through the REAL `tripController.updateTrip` (hence the
 * real `validateTripWriteCandidate`/`resolveCanonicalWriteTarget`/
 * `resolveCanonicalResponsePersistence`), mocked only at the
 * Mongoose-model boundary — the exact convention `tripController.test.js`
 * already established.
 *
 * *** Task 10D found a genuine blocker: a plan-only write carrying a
 * freshly-minted identity was rejected with `plan_message_identity_mismatch`,
 * never reaching the version-conflict logic. Task 10E resolved it — not by
 * weakening the validator, but by EXTENDING its definition of ownership: a
 * plan may also be legitimately owned by a VERIFIED assistant message in a
 * DIFFERENT, SAME-USER trip that explicitly named this trip as its target
 * (`sourceTripId`/`sourceResponseId`, checked against real, already-fetched,
 * already ownership-verified stored data — never the client's claim about
 * content). ***
 *
 * This file proves the full corrected path: source-provenance acceptance,
 * every rejection case the coordinator listed, the version-conflict logic
 * now genuinely reachable, and a comprehensive two-document proof (Redwood
 * conversation untouched, Badlands plan untouched, Redwood plan patched
 * with version+1, Badlands conversation gets the real turn).
 */

jest.mock('../../models/TripPlan');
jest.mock('../../services/trailieTurnLedger', () => ({
  markTurnPersistence: jest.fn().mockResolvedValue(null),
}));
const TripPlan = require('../../models/TripPlan');
const controller = require('../tripController');
const { resolveCanonicalResponsePersistence } = require('../../utils/canonicalPersistence');

const OWNER = 'user-1';
const OTHER_USER = 'user-2';
const BADLANDS_ID = 'trip-badl-1';
const REDWOOD_ID = 'trip-redw-1';
const THIRD_TRIP_ID = 'trip-zion-1';

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

const reqFor = (body, { user = OWNER, tripId = REDWOOD_ID } = {}) => ({
  body,
  params: { tripId },
  user: { _id: user, id: user },
  app: { get: () => null },
});

function redwoodPlanV(v, over = {}) {
  return {
    type: 'itinerary',
    responseId: `redw-resp-${v}`,
    responseVersion: v,
    contentHash: `redw-c${v}`,
    itineraryHash: `redw-i${v}`,
    days: [{ id: 'rd2', dayNumber: 2, stops: [{ id: 'rs2', name: 'Redwood Day 2' }] }],
    ...over,
  };
}

function storedRedwoodTrip(plan, { userId = OWNER, conversation = [] } = {}) {
  return { _id: REDWOOD_ID, userId, plan, conversation };
}

/** The Badlands-side conversation message this whole extension hinges on. */
function badlandsAssistantMessage({ responseId, targetTripId, responseVersion = 3 }) {
  return {
    role: 'assistant',
    content: 'Kept the walking light on your Redwood trip.',
    responseId,
    responseVersion,
    targetTripId,
  };
}

function storedBadlandsTrip({ userId = OWNER, conversation = [], plan = { responseVersion: 3, responseId: 'badl-resp-3', days: [] } } = {}) {
  return { _id: BADLANDS_ID, userId, plan, conversation };
}

/**
 * Two-document mock: `findById` routes by id to whichever store currently
 * holds that document; `findOneAndUpdate` mutates that SAME store in
 * place and returns the updated document — so a later `findById` in the
 * SAME test sees the write, exactly like a real database would.
 */
function wireStores(stores) {
  TripPlan.findById.mockImplementation((id) => Promise.resolve(stores[id] || null));
  const captures = {};
  TripPlan.findOneAndUpdate.mockImplementation((filter, update) => {
    const id = filter._id;
    captures[id] = update.$set;
    stores[id] = { ...stores[id], ...update.$set };
    return { toObject: () => ({ ...stores[id] }) };
  });
  return captures;
}

beforeEach(() => {
  jest.clearAllMocks();
  TripPlan.findById = jest.fn();
  TripPlan.findOneAndUpdate = jest.fn();
  TripPlan.findByIdAndUpdate = jest.fn();
  TripPlan.findOne = jest.fn();
  TripPlan.create = jest.fn();
  TripPlan.updateOne = jest.fn().mockResolvedValue({ matchedCount: 1 });
});

describe('Task 10E — source provenance ACCEPTS a legitimate cross-plan write', () => {
  test('real source Badlands assistant message with matching responseId and targetTripId === redwood -> Redwood write accepted', async () => {
    const stores = {
      [BADLANDS_ID]: storedBadlandsTrip({
        conversation: [badlandsAssistantMessage({ responseId: 'turn-resp-1', targetTripId: REDWOOD_ID })],
      }),
      [REDWOOD_ID]: storedRedwoodTrip(redwoodPlanV(7)),
    };
    const captures = wireStores(stores);
    const res = mockRes();

    await controller.updateTrip(
      reqFor({
        plan: redwoodPlanV(8, { responseId: 'turn-resp-1' }),
        sourceTripId: BADLANDS_ID,
        sourceResponseId: 'turn-resp-1',
      }),
      res,
      jest.fn()
    );

    expect(res.body.planPersistence.success).toBe(true);
    expect(captures[REDWOOD_ID]).toHaveProperty('plan');
    expect(captures[REDWOOD_ID].plan.responseVersion).toBe(8);
    // No conversation field was ever written for Redwood.
    expect(captures[REDWOOD_ID]).not.toHaveProperty('conversation');
  });

  // Test #3, pinned explicitly and directly: no synthetic Redwood assistant
  // message — its conversation array is deep-equal before and after,
  // literally zero messages added, even on a fully ACCEPTED write.
  test('a successfully accepted target write adds ZERO messages to Redwood\'s conversation — deep-equal before/after', async () => {
    const redwoodConversationBefore = [{ role: 'assistant', content: 'Earlier Redwood turn', responseId: 'redw-resp-7', responseVersion: 7 }];
    const redwoodSnapshot = JSON.parse(JSON.stringify(redwoodConversationBefore));
    const stores = {
      [BADLANDS_ID]: storedBadlandsTrip({
        conversation: [badlandsAssistantMessage({ responseId: 'turn-resp-1', targetTripId: REDWOOD_ID })],
      }),
      [REDWOOD_ID]: { _id: REDWOOD_ID, userId: OWNER, plan: redwoodPlanV(7), conversation: [...redwoodConversationBefore] },
    };
    wireStores(stores);
    const res = mockRes();
    await controller.updateTrip(
      reqFor({
        plan: redwoodPlanV(8, { responseId: 'turn-resp-1' }),
        sourceTripId: BADLANDS_ID,
        sourceResponseId: 'turn-resp-1',
      }),
      res,
      jest.fn()
    );
    expect(res.body.planPersistence.success).toBe(true);
    expect(stores[REDWOOD_ID].conversation).toEqual(redwoodSnapshot);
    expect(stores[REDWOOD_ID].conversation.length).toBe(redwoodSnapshot.length);
  });
});

describe('Task 10E — every rejection case the coordinator listed', () => {
  test('wrong source responseId -> reject', async () => {
    const stores = {
      [BADLANDS_ID]: storedBadlandsTrip({
        conversation: [badlandsAssistantMessage({ responseId: 'turn-resp-1', targetTripId: REDWOOD_ID })],
      }),
      [REDWOOD_ID]: storedRedwoodTrip(redwoodPlanV(7)),
    };
    const captures = wireStores(stores);
    const res = mockRes();
    await controller.updateTrip(
      reqFor({
        plan: redwoodPlanV(8, { responseId: 'turn-resp-1' }),
        sourceTripId: BADLANDS_ID,
        sourceResponseId: 'turn-resp-WRONG',
      }),
      res,
      jest.fn()
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('plan_message_identity_mismatch');
    expect(captures[REDWOOD_ID]).toBeUndefined();
  });

  test('source assistant\'s targetTripId points somewhere else (a THIRD trip, not Redwood) -> reject', async () => {
    const stores = {
      [BADLANDS_ID]: storedBadlandsTrip({
        conversation: [badlandsAssistantMessage({ responseId: 'turn-resp-1', targetTripId: THIRD_TRIP_ID })],
      }),
      [REDWOOD_ID]: storedRedwoodTrip(redwoodPlanV(7)),
    };
    const captures = wireStores(stores);
    const res = mockRes();
    await controller.updateTrip(
      reqFor({
        plan: redwoodPlanV(8, { responseId: 'turn-resp-1' }),
        sourceTripId: BADLANDS_ID,
        sourceResponseId: 'turn-resp-1',
      }),
      res,
      jest.fn()
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('plan_message_identity_mismatch');
    expect(captures[REDWOOD_ID]).toBeUndefined();
  });

  test('sourceTripId belongs to a different user -> reject', async () => {
    const stores = {
      [BADLANDS_ID]: storedBadlandsTrip({
        userId: OTHER_USER,
        conversation: [badlandsAssistantMessage({ responseId: 'turn-resp-1', targetTripId: REDWOOD_ID })],
      }),
      [REDWOOD_ID]: storedRedwoodTrip(redwoodPlanV(7)),
    };
    const captures = wireStores(stores);
    const res = mockRes();
    await controller.updateTrip(
      reqFor({
        plan: redwoodPlanV(8, { responseId: 'turn-resp-1' }),
        sourceTripId: BADLANDS_ID, // the acting user (OWNER) does NOT own this
        sourceResponseId: 'turn-resp-1',
      }),
      res,
      jest.fn()
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('plan_message_identity_mismatch');
    expect(captures[REDWOOD_ID]).toBeUndefined();
  });

  // Test #8 — may already be covered by Task 10D's own ownership test;
  // confirmed here directly rather than assumed.
  test('target Redwood trip belongs to a different user -> reject (403, unaffected by source provenance)', async () => {
    const stores = {
      [BADLANDS_ID]: storedBadlandsTrip({
        conversation: [badlandsAssistantMessage({ responseId: 'turn-resp-1', targetTripId: REDWOOD_ID })],
      }),
      [REDWOOD_ID]: storedRedwoodTrip(redwoodPlanV(7), { userId: OTHER_USER }),
    };
    const captures = wireStores(stores);
    const res = mockRes();
    await controller.updateTrip(
      reqFor({
        plan: redwoodPlanV(8, { responseId: 'turn-resp-1' }),
        sourceTripId: BADLANDS_ID,
        sourceResponseId: 'turn-resp-1',
      }, { user: OWNER, tripId: REDWOOD_ID }),
      res,
      jest.fn()
    );
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, error: 'Unauthorized' });
    expect(captures[REDWOOD_ID]).toBeUndefined();
  });

  test('source conversation/message not yet persisted (simulates the ordering race) -> reject/fail closed', async () => {
    const stores = {
      // Badlands exists, but its conversation does NOT yet contain the
      // claimed message — exactly what an unordered (racing) pair of saves
      // would look like from the target save's point of view.
      [BADLANDS_ID]: storedBadlandsTrip({ conversation: [] }),
      [REDWOOD_ID]: storedRedwoodTrip(redwoodPlanV(7)),
    };
    const captures = wireStores(stores);
    const res = mockRes();
    await controller.updateTrip(
      reqFor({
        plan: redwoodPlanV(8, { responseId: 'turn-resp-1' }),
        sourceTripId: BADLANDS_ID,
        sourceResponseId: 'turn-resp-1',
      }),
      res,
      jest.fn()
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('plan_message_identity_mismatch');
    expect(captures[REDWOOD_ID]).toBeUndefined();
  });

  test('a missing/nonexistent source trip -> reject (never falls back to trusting the claim)', async () => {
    const stores = {
      [REDWOOD_ID]: storedRedwoodTrip(redwoodPlanV(7)),
      // No BADLANDS_ID entry at all — findById resolves null.
    };
    const captures = wireStores(stores);
    const res = mockRes();
    await controller.updateTrip(
      reqFor({
        plan: redwoodPlanV(8, { responseId: 'turn-resp-1' }),
        sourceTripId: BADLANDS_ID,
        sourceResponseId: 'turn-resp-1',
      }),
      res,
      jest.fn()
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('plan_message_identity_mismatch');
    expect(captures[REDWOOD_ID]).toBeUndefined();
  });
});

describe('Task 10E — concurrency/conflict: proven through the NEW provenance path, not just in isolation', () => {
  test('stale Redwood version (concurrent write already advanced it) -> CONFLICT via the real controller, no overwrite', async () => {
    const stores = {
      [BADLANDS_ID]: storedBadlandsTrip({
        conversation: [badlandsAssistantMessage({ responseId: 'turn-resp-1', targetTripId: REDWOOD_ID })],
      }),
      // Redwood is ALREADY at version 8 by the time this write lands —
      // this turn hydrated at version 7 (stale) and computed 7+1=8, with a
      // brand-new responseId, so it collides at the SAME version slot.
      [REDWOOD_ID]: storedRedwoodTrip(redwoodPlanV(8)),
    };
    const captures = wireStores(stores);
    const res = mockRes();
    await controller.updateTrip(
      reqFor({
        plan: redwoodPlanV(8, { responseId: 'turn-resp-1' }),
        sourceTripId: BADLANDS_ID,
        sourceResponseId: 'turn-resp-1',
        expectedPreviousVersion: 7,
      }),
      res,
      jest.fn()
    );
    expect(res.body.planPersistence.success).toBe(false);
    expect(res.body.planPersistence.outcome).toBe('conflict');
    // Version 8 (the concurrent write) is not overwritten.
    expect(captures[REDWOOD_ID]).toBeUndefined();
    expect(res.body.planPersistence.storedIdentity.responseId).toBe('redw-resp-8');
  });

  test('the version-check contract itself, called directly (real code, not mocked)', () => {
    const existingPlan = redwoodPlanV(8);
    const incomingPlan = redwoodPlanV(8, { responseId: 'turn-resp-1' });
    const resolution = resolveCanonicalResponsePersistence({
      incomingPlan,
      incomingConversation: undefined,
      expectedPreviousVersion: 7,
      existingPlan,
      existingConversation: [],
    });
    expect(resolution.success).toBe(false);
    expect(resolution.outcome).toBe('conflict');
    expect(resolution.storedIdentity.responseId).toBe('redw-resp-8');
  });
});

describe('Task 10E — comprehensive real-wiring proof, both documents', () => {
  test('Redwood conversation untouched, Badlands plan advances its OWN turn normally, Redwood plan patched with version+1, Badlands conversation gets the real turn', async () => {
    // Badlands already has a real prior canonical turn (v2) — the ordinary,
    // pre-existing, unmodified active-trip write mechanism (proven
    // separately and extensively in tripController.test.js) is what
    // persists ITS side of this turn; Task 10E adds nothing to that path
    // except the additive `targetTripId` field the new assistant message
    // carries (Task 10, already built).
    const badlandsPriorPlan = { responseVersion: 2, responseId: 'badl-resp-2', days: [{ id: 'bd1', name: 'Badlands Day 1' }] };
    const badlandsPriorMessage = { role: 'assistant', content: 'Badlands turn 2', responseId: 'badl-resp-2', responseVersion: 2 };
    const redwoodConversationBefore = [{ role: 'assistant', content: 'Earlier Redwood turn', responseId: 'redw-resp-7', responseVersion: 7 }];
    const stores = {
      [BADLANDS_ID]: { _id: BADLANDS_ID, userId: OWNER, plan: badlandsPriorPlan, conversation: [badlandsPriorMessage] },
      [REDWOOD_ID]: { _id: REDWOOD_ID, userId: OWNER, plan: redwoodPlanV(7), conversation: [...redwoodConversationBefore] },
    };
    const captures = wireStores(stores);

    // Step 1 — the ACTIVE (Badlands) conversation save: THIS turn's own
    // assistant message (v3, the ordinary next-version append) ALSO names
    // Redwood as its target (`targetTripId`, Task 10, additive).
    const thisTurnBadlandsPlan = { responseVersion: 3, responseId: 'turn-resp-1', days: [{ id: 'bd1', name: 'Badlands Day 1' }] };
    const newBadlandsConversation = [
      badlandsPriorMessage,
      { role: 'user', content: 'For my Redwood trip, change Day 2' },
      badlandsAssistantMessage({ responseId: 'turn-resp-1', targetTripId: REDWOOD_ID }),
    ];
    const res1 = mockRes();
    await controller.updateTrip(
      reqFor({ conversation: newBadlandsConversation, plan: thisTurnBadlandsPlan, summary: {} }, { tripId: BADLANDS_ID }),
      res1,
      jest.fn()
    );
    expect(res1.body.planPersistence.success).toBe(true);
    expect(captures[BADLANDS_ID].plan).toEqual(thisTurnBadlandsPlan);
    expect(captures[BADLANDS_ID].conversation).toEqual(newBadlandsConversation);

    // Step 2 — the TARGET (Redwood) save, now that Badlands' conversation
    // durably contains the owning message (`stores[BADLANDS_ID]` was
    // mutated in place by `wireStores` above, mirroring a real DB).
    const res2 = mockRes();
    await controller.updateTrip(
      reqFor({
        plan: redwoodPlanV(8, { responseId: 'turn-resp-1' }),
        sourceTripId: BADLANDS_ID,
        sourceResponseId: 'turn-resp-1',
      }, { tripId: REDWOOD_ID }),
      res2,
      jest.fn()
    );
    expect(res2.body.planPersistence.success).toBe(true);
    expect(captures[REDWOOD_ID].plan.responseVersion).toBe(8);
    expect(captures[REDWOOD_ID].plan.days[0].stops[0].name).toBe('Redwood Day 2');
    // Redwood's conversation was NEVER part of this write at all.
    expect(captures[REDWOOD_ID]).not.toHaveProperty('conversation');
    expect(stores[REDWOOD_ID].conversation).toEqual(redwoodConversationBefore);

    // Final state, read back from the (mocked) stores directly — the
    // clearest possible statement of "both sides, byte-identical / patched
    // exactly as intended".
    expect(stores[BADLANDS_ID].plan).toEqual(thisTurnBadlandsPlan);
    expect(stores[BADLANDS_ID].conversation).toEqual(newBadlandsConversation);
    expect(stores[REDWOOD_ID].conversation).toEqual(redwoodConversationBefore);
    expect(stores[REDWOOD_ID].plan.responseVersion).toBe(8);
  });
});
