'use strict';

/**
 * Controller wiring tests with a MOCKED model (no Mongo binary). Proves the
 * Stage 8.1/8.2 persistence decisions are wired to the actual write path:
 * response-coupled fields move atomically, stale/conflict writes none of them,
 * feedback is field-scoped, and create dedupes.
 */

jest.mock('../../models/TripPlan');
jest.mock('../../services/trailieTurnLedger', () => ({
  markTurnPersistence: jest.fn().mockResolvedValue(null),
}));
const TripPlan = require('../../models/TripPlan');
const { markTurnPersistence } = require('../../services/trailieTurnLedger');
const controller = require('../tripController');

const OWNER = 'user-1';

describe('My Trips read isolation', () => {
  test('rejects another user’s list before querying storage', async () => {
    const response = mockRes();
    TripPlan.find = jest.fn();
    await controller.getUserTrips(reqFor({}, { userId: 'another-user' }), response, jest.fn());
    expect(response.statusCode).toBe(403);
    expect(TripPlan.find).not.toHaveBeenCalled();
  });

  test('lists saved plans and conversation-only records for the authenticated owner', async () => {
    const records = [{ _id: 'plan', plan: { days: [{ stops: [] }] } }, { _id: 'chat', plan: null }];
    TripPlan.find = jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue(records) });
    const response = mockRes();
    await controller.getUserTrips(reqFor({}, { userId: OWNER }), response, jest.fn());
    expect(TripPlan.find).toHaveBeenCalledWith({ userId: OWNER, status: { $ne: 'deleted' } });
    expect(response.body.data).toEqual(records);
  });
});

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

const reqFor = (body, params = {}) => ({
  body,
  params: { tripId: 'trip-1', ...params },
  user: { _id: OWNER, id: OWNER },
  app: { get: () => null },
});

const planV = (v, over = {}) => ({
  type: 'itinerary',
  responseId: `resp-${v}`,
  responseVersion: v,
  contentHash: `c${v}`,
  itineraryHash: `i${v}`,
  days: [],
  ...over,
});
const asstV = (v) => ({ role: 'assistant', content: `a${v}`, responseId: `resp-${v}`, responseVersion: v, contentHash: `c${v}`, itineraryHash: `i${v}` });

function storedTrip(plan, conversation) {
  return { _id: 'trip-1', userId: OWNER, plan, conversation };
}

/** Capture the $set argument findOneAndUpdate receives. */
function wireUpdate(stored) {
  TripPlan.findById.mockResolvedValue(stored);
  const capture = {};
  const write = (_id, update) => {
    capture.set = update.$set;
    return { toObject: () => ({ ...stored, ...update.$set }) };
  };
  TripPlan.findOneAndUpdate.mockImplementation(write);
  TripPlan.findByIdAndUpdate.mockImplementation(write);
  return capture;
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

describe('updateTrip — response-coupled atomic gating', () => {
  const responseBody = {
    plan: planV(3),
    conversation: [asstV(3)],
    formData: { parkCode: 'yose', startDate: '2026-06-02' },
    summary: { hasPlan: true },
    provider: 'auto',
    expectedPreviousVersion: 2,
  };

  test('ACCEPT writes conversation, plan, and response-coupled metadata together', async () => {
    const cap = wireUpdate(storedTrip(planV(2), [asstV(2)]));
    const res = mockRes();
    await controller.updateTrip(reqFor({ ...responseBody }), res, jest.fn());

    expect(res.body.planPersistence.success).toBe(true);
    for (const f of ['plan', 'conversation', 'formData', 'summary', 'provider']) {
      expect(cap.set).toHaveProperty(f);
    }
    expect(markTurnPersistence).toHaveBeenCalledWith(expect.objectContaining({
      responseId: 'resp-3', attempted: true, status: 'accepted', hashMatch: true,
    }));
  });

  test('STALE writes NONE of the response-coupled fields (no DB write at all)', async () => {
    wireUpdate(storedTrip(planV(4, {}), [asstV(4)])); // newer already stored
    const res = mockRes();
    await controller.updateTrip(reqFor({ ...responseBody }), res, jest.fn());

    expect(res.body.planPersistence.success).toBe(false);
    expect(res.body.planPersistence.outcome).toBe('stale');
    expect(TripPlan.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('CONFLICT writes nothing and returns stored identity', async () => {
    wireUpdate(storedTrip(planV(2), [asstV(2)]));
    const res = mockRes();
    await controller.updateTrip(
      reqFor({ plan: planV(2, { contentHash: 'x' }), conversation: [{ ...asstV(2), contentHash: 'x' }] }),
      res,
      jest.fn()
    );

    expect(res.body.planPersistence.outcome).toBe('conflict');
    expect(res.body.planPersistence.storedIdentity.responseId).toBe('resp-2');
    expect(TripPlan.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('stale formData / destination / summary cannot overwrite the current ones', async () => {
    wireUpdate(storedTrip(planV(4), [asstV(4)]));
    const res = mockRes();
    await controller.updateTrip(
      reqFor({ plan: planV(3), conversation: [asstV(3)], formData: { parkCode: 'yose' }, summary: { x: 1 }, expectedPreviousVersion: 2 }),
      res,
      jest.fn()
    );
    // Nothing persisted → stored formData/summary preserved.
    expect(TripPlan.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('title/status are IGNORED on the response route (no piggybacking)', async () => {
    const cap = wireUpdate(storedTrip(planV(4), [asstV(4)]));
    const res = mockRes();
    await controller.updateTrip(
      reqFor({ plan: planV(3), conversation: [asstV(3)], title: 'Renamed', status: 'archived', expectedPreviousVersion: 2 }),
      res,
      jest.fn()
    );
    // Stale response → nothing written at all (title/status never reach this route).
    expect(cap.set).toBeUndefined();
  });

  test('a stale auto-save with status:active cannot reactivate an archived trip', async () => {
    const cap = wireUpdate(storedTrip(planV(4), [asstV(4)]));
    const res = mockRes();
    await controller.updateTrip(
      reqFor({ plan: planV(3), conversation: [asstV(3)], status: 'active', expectedPreviousVersion: 2 }),
      res,
      jest.fn()
    );
    // No DB write, and status is not an accepted field here anyway.
    expect(cap.set).toBeUndefined();
  });

  test('an idempotent retry issues no DB write (side-effect free)', async () => {
    const stored = storedTrip(planV(2), [asstV(2)]);
    TripPlan.findById.mockResolvedValue(stored);
    const res = mockRes();
    await controller.updateTrip(
      reqFor({ plan: planV(2), conversation: [asstV(2)] }),
      res,
      jest.fn()
    );
    expect(TripPlan.findOneAndUpdate).not.toHaveBeenCalled();
    expect(res.body.planPersistence.outcome).toBe('idempotent');
  });
});

describe('updateTrip — legacy hardening (8.3)', () => {
  test('legacy request migrates a legacy-stored trip and stamps canonical identity', async () => {
    const cap = wireUpdate(storedTrip(null, [])); // legacy stored (no identity)
    const res = mockRes();
    await controller.updateTrip(
      reqFor({ plan: { type: 'itinerary', days: [{ id: 'd1' }] }, conversation: [{ role: 'assistant', content: 'legacy' }] }),
      res,
      jest.fn()
    );
    expect(res.body.planPersistence.outcome).toBe('legacy_migration');
    expect(cap.set.plan.responseId).toEqual(expect.any(String));
    expect(cap.set.plan.responseVersion).toBe(1);
    expect(cap.set.plan.contentHash).toEqual(expect.any(String));
  });

  test('legacy request CANNOT overwrite a trip that already has canonical identity', async () => {
    const cap = wireUpdate(storedTrip(planV(4), [asstV(4)]));
    const res = mockRes();
    await controller.updateTrip(
      reqFor({ plan: { type: 'itinerary', days: [{ id: 'x' }] }, conversation: [{ role: 'assistant', content: 'overwrite' }] }),
      res,
      jest.fn()
    );
    expect(res.body.planPersistence.outcome).toBe('canonical_identity_required');
    expect(res.body.planPersistence.success).toBe(false);
    expect(cap.set).toBeUndefined(); // no write
  });
});

describe('updateTripMetadata — narrow, allowlisted', () => {
  test('changes only title/status/shareScope, never response-coupled fields', async () => {
    const cap = wireUpdate(storedTrip(planV(2), [asstV(2)]));
    const res = mockRes();
    await controller.updateTripMetadata(
      reqFor({ title: 'Renamed', status: 'archived', plan: planV(9), formData: { x: 1 } }),
      res,
      jest.fn()
    );
    expect(cap.set).toEqual({ title: 'Renamed', status: 'archived' });
    expect(cap.set).not.toHaveProperty('plan');
    expect(cap.set).not.toHaveProperty('formData');
  });

  test('rejects an empty metadata update', async () => {
    const res = mockRes();
    await controller.updateTripMetadata(reqFor({ plan: planV(9) }), res, jest.fn());
    expect(res.statusCode).toBe(400);
    expect(TripPlan.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});

describe('updateMessageFeedback — field-scoped', () => {
  test('writes ONLY userFeedback + feedbackAt, never content/plan/summary/formData', async () => {
    TripPlan.findById.mockResolvedValue(storedTrip(planV(2), [asstV(2)]));
    const res = mockRes();
    await controller.updateMessageFeedback(
      reqFor({ feedback: 'up' }, { messageId: '2' }),
      res,
      jest.fn()
    );
    expect(res.statusCode).toBe(200);
    const [, update] = TripPlan.updateOne.mock.calls[0];
    expect(Object.keys(update.$set)).toEqual([
      'conversation.$[m].userFeedback',
      'conversation.$[m].feedbackAt',
    ]);
    for (const forbidden of ['content', 'plan', 'summary', 'formData', 'responseId']) {
      expect(Object.keys(update.$set).some((k) => k.includes(forbidden))).toBe(false);
    }
  });

  test('rejects an invalid feedback value without touching the DB', async () => {
    const res = mockRes();
    await controller.updateMessageFeedback(reqFor({ feedback: 'love' }, { messageId: '2' }), res, jest.fn());
    expect(res.statusCode).toBe(400);
    expect(TripPlan.updateOne).not.toHaveBeenCalled();
  });
});

describe('createTrip — new-trip idempotency', () => {
  test('duplicate terminal event returns the existing trip without creating', async () => {
    TripPlan.findOne.mockResolvedValue(storedTrip(planV(1), [asstV(1)]));
    const res = mockRes();
    await controller.createTrip(reqFor({ plan: planV(1), conversation: [asstV(1)] }), res, jest.fn());
    expect(res.statusCode).toBe(200);
    expect(res.body.idempotent).toBe(true);
    expect(TripPlan.create).not.toHaveBeenCalled();
    expect(markTurnPersistence).toHaveBeenCalledWith(expect.objectContaining({
      responseId: 'resp-1', attempted: true, status: 'idempotent', hashMatch: true,
    }));
  });

  test('same responseId with different hashes is a 409 conflict', async () => {
    TripPlan.findOne.mockResolvedValue(storedTrip(planV(1), [asstV(1)]));
    const res = mockRes();
    await controller.createTrip(reqFor({ plan: planV(1, { contentHash: 'x' }), conversation: [asstV(1)] }), res, jest.fn());
    expect(res.statusCode).toBe(409);
    expect(res.body.storedIdentity.responseId).toBe('resp-1');
    expect(TripPlan.create).not.toHaveBeenCalled();
  });

  test('a genuinely new response creates the trip', async () => {
    TripPlan.findOne.mockResolvedValue(null);
    TripPlan.create.mockResolvedValue(storedTrip(planV(1), [asstV(1)]));
    const res = mockRes();
    await controller.createTrip(reqFor({ plan: planV(1), conversation: [asstV(1)] }), res, jest.fn());
    expect(res.statusCode).toBe(201);
    expect(TripPlan.create).toHaveBeenCalled();
    expect(markTurnPersistence).toHaveBeenCalledWith(expect.objectContaining({
      responseId: 'resp-1', attempted: true, status: 'created', hashMatch: true,
    }));
  });
});


test('concurrent approved writes use one snapshot: only one commits', async () => {
  const stored = { ...storedTrip(planV(2), [asstV(2)]), __v: 4, updatedAt: new Date('2026-01-01') };
  TripPlan.findById.mockImplementation(async () => ({ ...stored }));
  let databaseVersion = 4;
  TripPlan.findOneAndUpdate.mockImplementation(async (filter, update) => {
    expect(filter).toMatchObject({ _id: 'trip-1', userId: OWNER, __v: 4, updatedAt: stored.updatedAt });
    if (filter.__v !== databaseVersion) return null;
    databaseVersion += update.$inc.__v;
    return { toObject: () => ({ ...stored, ...update.$set, __v: databaseVersion }) };
  });
  const body = { plan: planV(3), conversation: [asstV(3)], expectedPreviousVersion: 2 };
  const a = mockRes(); const b = mockRes(); const next = jest.fn();
  await Promise.all([controller.updateTrip(reqFor(body), a, next), controller.updateTrip(reqFor(body), b, next)]);
  expect(next).not.toHaveBeenCalled();
  expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
  expect(databaseVersion).toBe(5);
  expect([a.body, b.body].find(value => value.code === 'canonical_write_conflict').success).toBe(false);
});
