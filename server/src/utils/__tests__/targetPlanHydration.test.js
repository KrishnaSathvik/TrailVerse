'use strict';

/**
 * WP-TU Phase 4 Task 12 — `loadTargetPlanById`'s `priorCanonicalIdentity`
 * resolution, exercised directly against the REAL `latestCanonicalAssistantTarget`
 * (tripWriteContract.js) — mocked only at the Mongoose-model boundary,
 * mirroring `candidatePlanDiscovery.test.js`'s own established convention.
 *
 * Pins the full 6-row acceptance matrix the coordinator specified: the
 * IDENTICAL plan-then-conversation precedence `resolveCanonicalWriteTarget`
 * already uses for validating an incoming write, applied here to reading a
 * stored trip's current state.
 */

jest.mock('../../models/TripPlan');
const TripPlan = require('../../models/TripPlan');
const { loadTargetPlanById } = require('../targetPlanHydration');

const OWNER = 'user-1';
const TRIP_ID = 'trip-redw-1';

function mockFindById(doc) {
  const lean = jest.fn().mockResolvedValue(doc);
  const select = jest.fn().mockReturnValue({ lean });
  TripPlan.findById = jest.fn().mockReturnValue({ select });
  return { select, lean };
}

function baseDoc(overrides = {}) {
  return {
    _id: TRIP_ID,
    userId: OWNER,
    parkCode: 'redw',
    parkName: 'Redwood National Park',
    title: 'Redwood Trip',
    status: 'active',
    plan: { days: [{ id: 'd1' }] },
    conversation: [],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('loadTargetPlanById — priorCanonicalIdentity acceptance matrix (6 rows)', () => {
  test('row 1: plan has no identity; conversation\'s latest canonical assistant = version 1 -> priorCanonicalIdentity.responseVersion = 1', async () => {
    mockFindById(baseDoc({
      plan: { days: [{ id: 'd1' }] }, // no responseId
      conversation: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'here', responseId: 'resp-1', responseVersion: 1 },
      ],
    }));
    const result = await loadTargetPlanById({ tripId: TRIP_ID, userId: OWNER });
    expect(result.ok).toBe(true);
    expect(result.priorCanonicalIdentity).toEqual({
      responseId: 'resp-1', responseVersion: 1, responseRevision: null, itineraryHash: null,
    });
  });

  test('row 2: plan has no identity; conversation\'s latest canonical assistant = version 7 -> priorCanonicalIdentity.responseVersion = 7', async () => {
    mockFindById(baseDoc({
      plan: { days: [{ id: 'd1' }] },
      conversation: [
        { role: 'assistant', content: 'old', responseId: 'resp-old', responseVersion: 3 },
        { role: 'user', content: 'again' },
        { role: 'assistant', content: 'new', responseId: 'resp-7', responseVersion: 7 },
      ],
    }));
    const result = await loadTargetPlanById({ tripId: TRIP_ID, userId: OWNER });
    expect(result.ok).toBe(true);
    expect(result.priorCanonicalIdentity.responseVersion).toBe(7);
    expect(result.priorCanonicalIdentity.responseId).toBe('resp-7');
  });

  test('row 3: plan itself carries responseId/responseVersion:7 -> plan wins outright, conversation NOT consulted even though present and different', async () => {
    mockFindById(baseDoc({
      plan: { days: [{ id: 'd1' }], responseId: 'plan-resp-7', responseVersion: 7, contentHash: 'c', itineraryHash: 'i' },
      conversation: [
        { role: 'assistant', content: 'unrelated', responseId: 'conversation-resp-99', responseVersion: 99 },
      ],
    }));
    const result = await loadTargetPlanById({ tripId: TRIP_ID, userId: OWNER });
    expect(result.ok).toBe(true);
    expect(result.priorCanonicalIdentity).toEqual({
      responseId: 'plan-resp-7', responseVersion: 7, responseRevision: null, itineraryHash: 'i',
    });
  });

  test('row 4: truly virgin target — neither plan nor conversation carries any identity -> priorCanonicalIdentity is null (floors to version 1 on next write)', async () => {
    mockFindById(baseDoc({
      plan: { days: [{ id: 'd1' }] },
      conversation: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'no identity here' }],
    }));
    const result = await loadTargetPlanById({ tripId: TRIP_ID, userId: OWNER });
    expect(result.ok).toBe(true);
    expect(result.priorCanonicalIdentity).toBeNull();
  });

  test('row 6: malformed identity — plan has responseId but no responseVersion -> fails closed (plan_identity_incomplete), mirroring resolveCanonicalWriteTarget', async () => {
    mockFindById(baseDoc({
      plan: { days: [{ id: 'd1' }], responseId: 'plan-resp-x' /* no responseVersion */ },
      conversation: [{ role: 'assistant', content: 'x', responseId: 'resp-other', responseVersion: 5 }],
    }));
    const result = await loadTargetPlanById({ tripId: TRIP_ID, userId: OWNER });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('plan_identity_incomplete');
  });
});

// Row 5 (a stale concurrent write / CONFLICT behavior) is proven at the
// controller/persistence layer, not here — this module only ever READS the
// target's state at hydration time; it has no write path to conflict
// against. See crossPlanTargetMutationPersistence.test.js /
// e2eProductRegression.test.js for that real-controller proof, unchanged by
// this task.
