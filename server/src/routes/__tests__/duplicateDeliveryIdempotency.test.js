'use strict';

/**
 * Stage 14.7F5 §3–§6 — duplicate and out-of-order delivery, proven at the REAL
 * authenticated persistence endpoint.
 *
 * The lifecycle reducer already suppresses duplicates client-side
 * (`earlyRevisionLifecycle.test.js`). That is the wrong place to stop: a retry,
 * a reconnect, a second tab or a replayed request reaches the server WITHOUT the
 * reducer's memory. What matters here is that the server's own decision is
 * idempotent and that stored state stays BYTE-EQUIVALENT — not merely
 * "equivalent enough".
 *
 * Zero provider calls, zero network.
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const TripPlan = require('../../models/TripPlan');
const User = require('../../models/User');
const { awaitModelReadiness } = require('../../eval/modelReadiness');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api/trips', require('../trips'));
app.use(require('../../middleware/errorHandler'));

const R = 'resp-dup-A';
const V = 2;
const IH = 'itinerary-hash-dup-1';

const plan1 = (over = {}) => ({
  type: 'itinerary',
  responseId: R, responseVersion: V, responseRevision: 1,
  lifecycleStatus: 'itinerary_ready',
  contentHash: null, itineraryHash: IH,
  itineraryReadyAt: '2026-06-01T00:00:00.000Z',
  days: [{ day: 1, parkCode: 'yose', stops: [{ name: 'Tunnel View' }] }],
  warnings: [], difficulty: 'easy',
  ...over,
});

const plan2 = (over = {}) => plan1({
  responseRevision: 2,
  lifecycleStatus: 'prose_ready',
  contentHash: 'ch-rev-2',
  proseReadyAt: '2026-06-01T00:05:00.000Z',
  ...over,
});

const userMsg = () => ({ id: 100, role: 'user', content: 'Two days in Yosemite' });
const shell = () => ({
  id: 101, role: 'assistant', content: '',
  responseId: R, responseVersion: V, responseRevision: 1,
  lifecycleStatus: 'itinerary_ready', itineraryHash: IH,
});
const terminal = (over = {}) => ({
  ...shell(), content: 'Your two-day Yosemite plan.',
  responseRevision: 2, previousRevision: 1,
  lifecycleStatus: 'prose_ready', contentHash: 'ch-rev-2',
  ...over,
});

let token;
let userId;

// Stage 14.7F6 §18 — readiness barrier before the FIRST authenticated write.
beforeAll(async () => {
  await awaitModelReadiness();
});

beforeEach(async () => {
  const user = await User.create({
    name: 'Duplicate Prover',
    email: `dup-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
    password: 'password123',
  });
  userId = user._id;
  token = jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
});

const auth = (req) => req.set('Authorization', `Bearer ${token}`);
const post = (body) => auth(request(app).post('/api/trips')).send(body);
const put = (id, body) => auth(request(app).put(`/api/trips/${id}`)).send(body);

/** Raw stored document, `_id`s stripped, for byte comparison. */
async function snapshot(tripId) {
  const doc = await TripPlan.findById(tripId).lean();
  const { _id, __v, updatedAt, ...rest } = doc;
  rest.conversation = (rest.conversation || []).map(({ _id: mid, ...m }) => m);
  return JSON.stringify(rest);
}

const counts = (conv) => ({
  assistants: conv.filter((m) => m.role === 'assistant').length,
  users: conv.filter((m) => m.role === 'user').length,
});

const RESULTS = {};
afterAll(() => {
  try {
    const dir = path.resolve(__dirname, '../../../../artifacts');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'trailie-stage14_7F5-duplicate-delivery.json'),
      `${JSON.stringify(RESULTS, null, 2)}\n`
    );
  } catch { /* reporting convenience only */ }
});

// ─────────────────────────────────────────────────────────────────────────────
// §3 — duplicate revision 1
// ─────────────────────────────────────────────────────────────────────────────
describe('§3 — duplicate revision-1 delivery', () => {
  const createBody = () => ({
    parkCode: 'yose',
    title: 'Dup fixture',
    conversation: [userMsg(), shell()],
    plan: plan1(),
  });

  test('a replayed CREATE returns the same trip idempotently, creating nothing', async () => {
    const first = await post(createBody());
    expect(first.status).toBe(201);
    const tripId = first.body.data._id;
    const before = await snapshot(tripId);

    const second = await post(createBody());

    expect(second.status).toBe(200);
    expect(second.body.idempotent).toBe(true);
    expect(String(second.body.data._id)).toBe(String(tripId));
    expect(await TripPlan.countDocuments({ userId })).toBe(1);
    expect(await snapshot(tripId)).toBe(before);

    RESULTS.duplicateRevision1Create = {
      firstStatus: first.status, secondStatus: second.status,
      decision: 'idempotent', tripCount: 1, byteEquivalent: true,
    };
  });

  test('a replayed UPDATE of revision 1 is idempotent and byte-equivalent', async () => {
    const created = await post(createBody());
    const tripId = created.body.data._id;

    // A second identical revision-1 write arriving as an update.
    const replay = await put(tripId, { conversation: [userMsg(), shell()], plan: plan1() });

    expect(replay.status).toBe(200);
    expect(replay.body.planPersistence.outcome).toBe('idempotent');
    expect(replay.body.planPersistence.reason).toBe('identical_write');
    expect(replay.body.success).toBe(true);

    const doc = await TripPlan.findById(tripId).lean();
    const a = doc.conversation.find((m) => m.role === 'assistant');
    expect(counts(doc.conversation)).toEqual({ assistants: 1, users: 1 });
    expect(a.id).toBe(shell().id);
    expect(a.responseId).toBe(R);
    expect(a.responseVersion).toBe(V);
    expect(a.content).toBe('');
    expect(doc.plan.itineraryHash).toBe(IH);

    RESULTS.duplicateRevision1Update = {
      decision: replay.body.planPersistence.outcome,
      reason: replay.body.planPersistence.reason,
      assistantTurnCount: 1, planCount: 1,
    };
  });

  test('the replay preserves the numeric id AND the original timestamp', async () => {
    const created = await post(createBody());
    const tripId = created.body.data._id;
    const beforeDoc = await TripPlan.findById(tripId).lean();
    const beforeTs = beforeDoc.conversation.find((m) => m.role === 'assistant').timestamp;

    await put(tripId, { conversation: [userMsg(), shell()], plan: plan1() });

    const afterDoc = await TripPlan.findById(tripId).lean();
    const after = afterDoc.conversation.find((m) => m.role === 'assistant');
    expect(after.id).toBe(shell().id);
    expect(String(after.timestamp)).toBe(String(beforeTs));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §4 — duplicate revision 2
// ─────────────────────────────────────────────────────────────────────────────
describe('§4 — duplicate revision-2 delivery', () => {
  async function seedThroughRevision2() {
    const created = await post({
      parkCode: 'yose', title: 'Dup fixture',
      conversation: [userMsg(), shell()], plan: plan1(),
    });
    const tripId = created.body.data._id;
    const first = await put(tripId, {
      conversation: [userMsg(), terminal()],
      plan: plan2(),
      expectedPreviousRevision: 1,
    });
    return { tripId, first };
  }

  test('the first revision 2 is accepted; the replay is idempotent', async () => {
    const { tripId, first } = await seedThroughRevision2();
    expect(first.body.planPersistence.outcome).toBe('accept');
    expect(first.body.planPersistence.reason).toBe('newer_revision');

    const before = await snapshot(tripId);
    const replay = await put(tripId, {
      conversation: [userMsg(), terminal()],
      plan: plan2(),
      expectedPreviousRevision: 1,
    });

    expect(replay.status).toBe(200);
    expect(replay.body.planPersistence.outcome).toBe('idempotent');
    expect(replay.body.success).toBe(true);
    // The load-bearing assertion: nothing moved at all.
    expect(await snapshot(tripId)).toBe(before);

    RESULTS.duplicateRevision2 = {
      firstDecision: first.body.planPersistence.outcome,
      duplicateDecision: replay.body.planPersistence.outcome,
      byteEquivalent: true,
    };
  });

  test('no duplicate assistant message and no duplicate plan', async () => {
    const { tripId } = await seedThroughRevision2();
    await put(tripId, { conversation: [userMsg(), terminal()], plan: plan2(), expectedPreviousRevision: 1 });

    const doc = await TripPlan.findById(tripId).lean();
    expect(counts(doc.conversation)).toEqual({ assistants: 1, users: 1 });
    const a = doc.conversation.find((m) => m.role === 'assistant');
    expect(a.id).toBe(shell().id);          // same slot as the revision-1 shell
    expect(a.content).toBe(terminal().content);
    expect(a.responseRevision).toBe(2);
    expect(doc.plan.responseRevision).toBe(2);
    expect(doc.plan.itineraryHash).toBe(IH);
    expect(doc.plan.contentHash).toBe('ch-rev-2');
  });

  test('an idempotent replay never restamps proseReadyAt', async () => {
    const { tripId } = await seedThroughRevision2();
    const original = (await TripPlan.findById(tripId).lean()).plan.proseReadyAt;

    await put(tripId, {
      conversation: [userMsg(), terminal()],
      plan: plan2({ proseReadyAt: '2027-01-01T00:00:00.000Z' }),
      expectedPreviousRevision: 1,
    });

    const after = (await TripPlan.findById(tripId).lean()).plan.proseReadyAt;
    expect(String(after)).toBe(String(original));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §5 — replayed `done`
// ─────────────────────────────────────────────────────────────────────────────
describe('§5 — done replay against a completed turn', () => {
  async function completedTurn() {
    const created = await post({
      parkCode: 'yose', title: 'Dup fixture',
      conversation: [userMsg(), shell()], plan: plan1(),
    });
    const tripId = created.body.data._id;
    await put(tripId, { conversation: [userMsg(), terminal()], plan: plan2(), expectedPreviousRevision: 1 });
    return tripId;
  }

  /**
   * `done` is direct-terminal shaped: it carries no `expectedPreviousRevision`.
   * Against an already-terminal turn it must reconcile, never write.
   */
  const doneBody = () => ({
    conversation: [userMsg(), terminal()],
    plan: plan2(),
  });

  test('a matching done is idempotent reconciliation with zero mutation', async () => {
    const tripId = await completedTurn();
    const before = await snapshot(tripId);

    const res = await put(tripId, doneBody());

    expect(res.status).toBe(200);
    expect(res.body.planPersistence.outcome).toBe('idempotent');
    expect(await snapshot(tripId)).toBe(before);
  });

  test('a duplicated matching done is still reconciliation only', async () => {
    const tripId = await completedTurn();
    const before = await snapshot(tripId);

    const decisions = [];
    for (let i = 0; i < 3; i += 1) {
      const res = await put(tripId, doneBody());
      decisions.push(res.body.planPersistence.outcome);
    }

    expect(decisions).toEqual(['idempotent', 'idempotent', 'idempotent']);
    expect(await snapshot(tripId)).toBe(before);

    RESULTS.doneReplay = { decisions, duplicateDonePersistenceRequests: 3, mutations: 0 };
  });

  test('a MISMATCHED done fails closed and never overwrites stored prose', async () => {
    const tripId = await completedTurn();
    const before = await snapshot(tripId);

    const res = await put(tripId, {
      conversation: [userMsg(), terminal({ content: 'DIFFERENT PROSE', contentHash: 'ch-other' })],
      plan: plan2({ contentHash: 'ch-other' }),
    });

    expect(res.body.success).toBe(false);
    expect(res.body.planPersistence.outcome).toBe('conflict');
    expect(res.body.planPersistence.reason).toBe('same_version_different_hash');
    expect(await snapshot(tripId)).toBe(before);

    const doc = await TripPlan.findById(tripId).lean();
    expect(doc.conversation.find((m) => m.role === 'assistant').content).toBe(terminal().content);
  });

  test('a done arriving BEFORE revision 2 lands as the terminal write, not a duplicate', async () => {
    // Revision 2 never persisted: `done` is the direct-terminal successor of the
    // stored revision-1 checkpoint, and must still be exactly ONE write.
    const created = await post({
      parkCode: 'yose', title: 'Dup fixture',
      conversation: [userMsg(), shell()], plan: plan1(),
    });
    const tripId = created.body.data._id;

    const res = await put(tripId, doneBody());
    expect(res.body.planPersistence.outcome).toBe('accept');
    expect(res.body.planPersistence.reason).toBe('newer_revision');

    const doc = await TripPlan.findById(tripId).lean();
    expect(counts(doc.conversation)).toEqual({ assistants: 1, users: 1 });
    expect(doc.conversation.find((m) => m.role === 'assistant').content).toBe(terminal().content);

    // And a replay of it is idempotent, not a third turn.
    const replay = await put(tripId, doneBody());
    expect(replay.body.planPersistence.outcome).toBe('idempotent');
    expect((await TripPlan.findById(tripId).lean()).conversation.filter((m) => m.role === 'assistant')).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §6 — out-of-order delivery
// ─────────────────────────────────────────────────────────────────────────────
describe('§6 — stale and out-of-order writes', () => {
  async function completedTurn() {
    const created = await post({
      parkCode: 'yose', title: 'Dup fixture',
      conversation: [userMsg(), shell()], plan: plan1(),
    });
    const tripId = created.body.data._id;
    await put(tripId, { conversation: [userMsg(), terminal()], plan: plan2(), expectedPreviousRevision: 1 });
    return tripId;
  }

  test('a stale revision 1 arriving after revision 2 never rolls state back', async () => {
    const tripId = await completedTurn();
    const before = await snapshot(tripId);

    const res = await put(tripId, { conversation: [userMsg(), shell()], plan: plan1() });

    expect(res.body.success).toBe(false);
    expect(res.body.planPersistence.outcome).toBe('stale');
    expect(res.body.planPersistence.reason).toBe('older_revision');
    expect(await snapshot(tripId)).toBe(before);

    const doc = await TripPlan.findById(tripId).lean();
    expect(doc.conversation.find((m) => m.role === 'assistant').content).toBe(terminal().content);
    expect(doc.plan.responseRevision).toBe(2);

    RESULTS.staleRevision1AfterRevision2 = {
      decision: res.body.planPersistence.outcome,
      reason: res.body.planPersistence.reason,
      rolledBack: false,
    };
  });

  test('a write for a DIFFERENT responseId cannot mutate this turn', async () => {
    const tripId = await completedTurn();
    const before = await snapshot(tripId);

    const other = { ...terminal(), id: 999, responseId: 'resp-elsewhere', content: 'CROSS RESPONSE' };
    const res = await put(tripId, {
      conversation: [userMsg(), other],
      plan: plan2({ responseId: 'resp-elsewhere' }),
    });

    expect(res.body.success).toBe(false);
    expect(await snapshot(tripId)).toBe(before);
    expect(JSON.stringify(await TripPlan.findById(tripId).lean())).not.toContain('CROSS RESPONSE');
  });

  test('repeated identical writes converge — the decision never oscillates', async () => {
    const tripId = await completedTurn();
    const before = await snapshot(tripId);

    const seen = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await put(tripId, {
        conversation: [userMsg(), terminal()], plan: plan2(), expectedPreviousRevision: 1,
      });
      seen.push(res.body.planPersistence.outcome);
    }

    expect(new Set(seen)).toEqual(new Set(['idempotent']));
    expect(await snapshot(tripId)).toBe(before);
  });
});
