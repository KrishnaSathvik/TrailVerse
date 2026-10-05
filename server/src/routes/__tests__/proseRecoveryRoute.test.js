const express = require('express');
const request = require('supertest');
const fs = require('fs');
const path = require('path');

const { createProseRecoveryRouter } = require('../proseRecovery');
const { hashPayload } = require('../../utils/canonicalResponse');
const { buildPlanDocument } = require('../../utils/trailiePipelineUtils');
const { LEASE_STATE } = require('../../services/proseRecoveryLease');

const USER = '507f1f77bcf86cd799439011';
const OTHER_USER = '507f1f77bcf86cd799439012';
const TRIP_ID = '507f191e810c19729de860ea';
const RID = 'resp-recovery-route';

const ITIN = {
  days: [
    {
      id: 'd1', day: 1, title: 'Canyon floor',
      stops: [{ id: 'd1s1', name: 'Visitor Center' }, { id: 'd1s2', name: 'Riverside Walk' }],
    },
    { id: 'd2', day: 2, title: 'Angels Landing', stops: [{ id: 'd2s1', name: 'Scout Lookout' }] },
  ],
};
const ITIN_HASH = hashPayload(ITIN);

const GOOD_PROSE = [
  '<!--TRAILIE_DAY:d1--> Canyon floor',
  '<!--TRAILIE_STOP:d1s1--> Visitor Center — maps and the shuttle stop.',
  '<!--TRAILIE_STOP:d1s2--> Riverside Walk — a paved stroll by the Virgin River.',
  '<!--TRAILIE_DAY:d2--> Angels Landing',
  '<!--TRAILIE_STOP:d2s1--> Scout Lookout — the turnaround below the chains.',
].join('\n');

function storedTrip(over = {}) {
  const plan = {
    ...buildPlanDocument({
      itineraryData: ITIN,
      parkName: 'Zion National Park',
      parkCode: 'zion',
      identity: { responseId: RID, responseVersion: 4, contentHash: hashPayload(''), itineraryHash: ITIN_HASH },
      feasibilityIssues: [],
    }),
    responseRevision: 1,
    previousRevision: null,
    lifecycleStatus: 'itinerary_ready',
    ...(over.plan || {}),
  };
  return {
    _id: TRIP_ID,
    userId: over.userId || USER,
    plan,
    conversation: over.conversation || [
      { role: 'user', content: 'Plan 2 days in Zion' },
      {
        role: 'assistant', content: '', responseId: RID, responseVersion: 4,
        responseRevision: 1, lifecycleStatus: 'itinerary_ready', itineraryHash: ITIN_HASH,
      },
    ],
  };
}

function makeLeaseModel(seed = []) {
  const docs = seed.map((d) => ({ ...d }));
  const matches = (doc, filter) =>
    Object.entries(filter).every(([k, v]) => {
      if (v && typeof v === 'object' && '$lte' in v) return doc[k] != null && doc[k] <= v.$lte;
      return doc[k] === v;
    });
  return {
    docs,
    async findOne(f) { return docs.find((d) => matches(d, f)) || null; },
    async findOneAndUpdate(f, u, o = {}) {
      const found = docs.find((d) => matches(d, f));
      if (found) { Object.assign(found, u.$set || {}); return { ...found }; }
      if (!o.upsert) return null;
      const ins = { ...(u.$set || {}) };
      if (docs.some((d) => d.userId === ins.userId && d.responseId === ins.responseId)) {
        const e = new Error('E11000'); e.code = 11000; throw e;
      }
      docs.push(ins);
      return { ...ins };
    },
    async deleteOne(f) {
      const i = docs.findIndex((d) => matches(d, f));
      if (i === -1) return { deletedCount: 0 };
      docs.splice(i, 1);
      return { deletedCount: 1 };
    },
  };
}

function buildApp({ trip = storedTrip(), LeaseModel, enabled = true, prose = GOOD_PROSE, providerCalls, user = USER } = {}) {
  const calls = providerCalls || [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { _id: user, id: user }; next(); });
  app.use(
    '/api/trips',
    createProseRecoveryRouter({
      Trip: { findById: async (id) => (trip && String(trip._id) === String(id) ? trip : null) },
      LeaseModel: LeaseModel || makeLeaseModel(),
      config: () => ({
        enabled, leaseMs: 180000, maxRuntimeMs: 120000, safetyMarginMs: 30000, retryAfterSeconds: 120,
      }),
      proseConfig: () => ({ mode: 'enforce', maxChars: 20000, retryEnabled: true }),
      buildDeliverProse: () => async (args) => {
        calls.push(args);
        return { content: prose, provider: 'claude', model: 'claude-model' };
      },
    })
  );
  return { app, calls };
}

const post = (app) => request(app).post(`/api/trips/${TRIP_ID}/response/${RID}/prose`);

/** Parse an SSE body into typed events. */
const parseSse = (text) =>
  text.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));

describe('Stage 14.4 §2 — authorization', () => {
  test('an owned trip and response is accepted', async () => {
    const { app } = buildApp();
    const res = await post(app);
    expect(res.status).toBe(200);
  });

  test.each([
    ['a foreign trip', { trip: storedTrip({ userId: OTHER_USER }) }],
    ['a missing trip', { trip: null }],
  ])('%s returns a bounded 404 with no provider call', async (_label, opts) => {
    const calls = [];
    const { app } = buildApp({ ...opts, providerCalls: calls });
    const res = await post(app);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'Not found' });
    expect(calls).toHaveLength(0);
  });

  test('an unknown responseId returns the same bounded 404', async () => {
    const { app, calls } = buildApp();
    const res = await request(app).post(`/api/trips/${TRIP_ID}/response/some-other-response/prose`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: 'Not found' });
    expect(calls).toHaveLength(0);
  });

  test('a plan/assistant identity mismatch returns 404', async () => {
    const trip = storedTrip();
    trip.conversation[1].itineraryHash = 'a-different-hash';
    const { app, calls } = buildApp({ trip });

    expect((await post(app)).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  test('no lease is acquired on any authorization failure', async () => {
    const LeaseModel = makeLeaseModel();
    const { app } = buildApp({ trip: storedTrip({ userId: OTHER_USER }), LeaseModel });
    await post(app);
    expect(LeaseModel.docs).toHaveLength(0);
  });

  test('ownership and lookup failures are indistinguishable', async () => {
    const foreign = await post(buildApp({ trip: storedTrip({ userId: OTHER_USER }) }).app);
    const missing = await post(buildApp({ trip: null }).app);
    expect(foreign.body).toEqual(missing.body);
    expect(foreign.status).toBe(missing.status);
  });
});

describe('Stage 14.4 §18 — flag off', () => {
  test('fails closed with no lease and no provider call', async () => {
    const LeaseModel = makeLeaseModel();
    const { app, calls } = buildApp({ enabled: false, LeaseModel });
    const res = await post(app);

    expect(res.status).toBe(404);
    expect(LeaseModel.docs).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });
});

describe('Stage 14.4 §3 — stored-state validation', () => {
  test('an existing revision 2 returns a stored completion with zero provider calls', async () => {
    const LeaseModel = makeLeaseModel();
    const { app, calls } = buildApp({
      LeaseModel,
      trip: storedTrip({
        plan: { responseRevision: 2, previousRevision: 1, lifecycleStatus: 'prose_ready' },
        conversation: [
          { role: 'user', content: 'x' },
          {
            role: 'assistant', content: 'Full notes.', responseId: RID, responseVersion: 4,
            responseRevision: 2, lifecycleStatus: 'prose_ready', itineraryHash: ITIN_HASH,
          },
        ],
      }),
    });
    const res = await post(app);

    expect(res.status).toBe(200);
    expect(res.body.data.alreadyComplete).toBe(true);
    expect(calls).toHaveLength(0);
    // §3 — do not acquire a lease unnecessarily.
    expect(LeaseModel.docs).toHaveLength(0);
  });

  test.each([
    ['nonempty revision-1 content', (t) => { t.conversation[1].content = 'oops'; }],
    ['an unsupported lifecycle', (t) => { t.plan.lifecycleStatus = 'prose_failed'; }],
    ['a recomputed itinerary-hash mismatch', (t) => { t.plan.days = [...t.plan.days, { day: 3 }]; }],
  ])('refuses %s before any spend', async (_label, mutate) => {
    const trip = storedTrip();
    mutate(trip);
    const LeaseModel = makeLeaseModel();
    const { app, calls } = buildApp({ trip, LeaseModel });

    expect((await post(app)).status).toBe(404);
    expect(calls).toHaveLength(0);
    expect(LeaseModel.docs).toHaveLength(0);
  });
});

describe('Stage 14.4 §5 — recovery event sequence', () => {
  test('emits prose_generation_started → prose_ready → done, and no early checkpoint', async () => {
    const { app } = buildApp();
    const res = await post(app);
    const events = parseSse(res.text);

    expect(events.map((e) => e.type)).toEqual(['prose_generation_started', 'prose_ready', 'done']);
    expect(events.map((e) => e.type)).not.toContain('response_started');
    expect(events.map((e) => e.type)).not.toContain('itinerary_ready');
  });

  test('prose_ready carries the explicit successor guard and the stored identity', async () => {
    const { app } = buildApp();
    const [, proseReady] = parseSse((await post(app)).text);

    expect(proseReady.expectedPreviousRevision).toBe(1);
    expect(proseReady.response.responseId).toBe(RID);
    expect(proseReady.response.responseVersion).toBe(4);
    expect(proseReady.response.responseRevision).toBe(2);
    expect(proseReady.response.previousRevision).toBe(1);
    expect(proseReady.response.itineraryHash).toBe(ITIN_HASH);
    expect(proseReady.canonicalPlan.itineraryHash).toBe(ITIN_HASH);
  });

  test('done stays direct-terminal and self-contained', async () => {
    const { app } = buildApp();
    const done = parseSse((await post(app)).text).at(-1);

    expect(done.type).toBe('done');
    expect(done).not.toHaveProperty('expectedPreviousRevision');
    expect(done.canonicalPlan.itineraryHash).toBe(ITIN_HASH);
    expect(done.responseId).toBe(RID);
    expect(done.content.length).toBeGreaterThan(0);
  });

  test('no event leaks internal markers or artifacts', async () => {
    const { app } = buildApp({ prose: `${GOOD_PROSE}\n\n[ITINERARY_JSON]{"days":[]}[/ITINERARY_JSON]` });
    const text = (await post(app)).text;

    expect(text).not.toContain('[ITINERARY_JSON]');
    expect(text).not.toMatch(/TRAILIE_(DAY|STOP|INTRO)/);
    expect(text).not.toContain('input_schema');
  });
});

describe('Stage 14.4 §7/§12 — lease concurrency', () => {
  test('the first caller acquires and exactly one provider call occurs', async () => {
    const LeaseModel = makeLeaseModel();
    const { app, calls } = buildApp({ LeaseModel });
    await post(app);
    expect(calls).toHaveLength(1);
  });

  test('a second caller during generation gets 409 with zero provider calls', async () => {
    const LeaseModel = makeLeaseModel([
      {
        userId: USER, responseId: RID, tripId: TRIP_ID, leaseToken: 'live',
        state: LEASE_STATE.GENERATING, acquiredAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    const { app, calls } = buildApp({ LeaseModel });
    const res = await post(app);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('prose_generation_in_progress');
    expect(res.headers['retry-after']).toBeDefined();
    expect(calls).toHaveLength(0);
  });

  test('a caller while awaiting persistence gets a distinct 409 and zero provider calls', async () => {
    const LeaseModel = makeLeaseModel([
      {
        userId: USER, responseId: RID, tripId: TRIP_ID, leaseToken: 'live',
        state: LEASE_STATE.AWAITING_PERSISTENCE, acquiredAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    const { app, calls } = buildApp({ LeaseModel });
    const res = await post(app);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('prose_result_awaiting_persistence');
    expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(calls).toHaveLength(0);
    // The fence is neither released nor replaced.
    expect(LeaseModel.docs).toHaveLength(1);
    expect(LeaseModel.docs[0].leaseToken).toBe('live');
  });

  test('two concurrent requests produce exactly one provider call', async () => {
    const LeaseModel = makeLeaseModel();
    const calls = [];
    const a = buildApp({ LeaseModel, providerCalls: calls });
    const b = buildApp({ LeaseModel, providerCalls: calls });

    const [ra, rb] = await Promise.all([post(a.app), post(b.app)]);
    const statuses = [ra.status, rb.status].sort();

    expect(statuses).toEqual([200, 409]);
    expect(calls).toHaveLength(1);
  });

  test('an expired lease is reclaimable without waiting for TTL deletion', async () => {
    const LeaseModel = makeLeaseModel([
      {
        userId: USER, responseId: RID, tripId: TRIP_ID, leaseToken: 'old',
        state: LEASE_STATE.GENERATING, acquiredAt: new Date(0), expiresAt: new Date(Date.now() - 1000),
      },
    ]);
    const { app, calls } = buildApp({ LeaseModel });

    expect((await post(app)).status).toBe(200);
    expect(calls).toHaveLength(1);
  });
});

describe('Stage 14.4 §10 — awaiting persistence', () => {
  test('the lease transitions before prose_ready and survives stream completion', async () => {
    const LeaseModel = makeLeaseModel();
    const { app } = buildApp({ LeaseModel });
    await post(app);

    expect(LeaseModel.docs).toHaveLength(1);
    expect(LeaseModel.docs[0].state).toBe(LEASE_STATE.AWAITING_PERSISTENCE);
    expect(LeaseModel.docs[0].expectedContentHash).toEqual(expect.any(String));
    expect(LeaseModel.docs[0].itineraryHash).toBe(ITIN_HASH);
  });

  test('the recorded expectedContentHash matches the emitted revision 2', async () => {
    const LeaseModel = makeLeaseModel();
    const { app } = buildApp({ LeaseModel });
    const [, proseReady] = parseSse((await post(app)).text);

    expect(LeaseModel.docs[0].expectedContentHash).toBe(proseReady.response.contentHash);
  });

  test('the lease stores no prose, prompts, or provider payloads', async () => {
    const LeaseModel = makeLeaseModel();
    const { app } = buildApp({ LeaseModel });
    await post(app);

    const serialized = JSON.stringify(LeaseModel.docs[0]);
    expect(serialized).not.toContain('Visitor Center');
    expect(serialized).not.toMatch(/TRAILIE_/);
    expect(serialized).not.toContain('Marker skeleton');
  });

  test('a repeated click before persistence produces zero further provider calls', async () => {
    const LeaseModel = makeLeaseModel();
    const calls = [];
    const { app } = buildApp({ LeaseModel, providerCalls: calls });

    await post(app);
    const second = await post(app);

    expect(second.status).toBe(409);
    expect(second.body.error).toBe('prose_result_awaiting_persistence');
    expect(calls).toHaveLength(1);
  });
});

describe('Stage 14.4 §13 — failure behavior', () => {
  test('a provider abort releases the lease and emits one bounded error', async () => {
    const LeaseModel = makeLeaseModel();
    const app = express();
    app.use((req, _res, next) => { req.user = { _id: USER, id: USER }; next(); });
    app.use('/api/trips', createProseRecoveryRouter({
      Trip: { findById: async () => storedTrip() },
      LeaseModel,
      config: () => ({ enabled: true, leaseMs: 180000, maxRuntimeMs: 120000, safetyMarginMs: 30000, retryAfterSeconds: 120 }),
      proseConfig: () => ({ mode: 'enforce', maxChars: 20000, retryEnabled: true }),
      buildDeliverProse: () => async () => ({ aborted: true }),
    }));

    const res = await post(app);
    const events = parseSse(res.text);

    expect(events.at(-1)).toEqual({ type: 'error', message: 'prose_aborted' });
    expect(events.map((e) => e.type)).not.toContain('prose_ready');
    expect(LeaseModel.docs).toHaveLength(0); // released, so a retry is possible
  });

  test('stored revision 1 is left unchanged by a failed recovery', async () => {
    const trip = storedTrip();
    const before = JSON.stringify(trip);
    const app = express();
    app.use((req, _res, next) => { req.user = { _id: USER, id: USER }; next(); });
    app.use('/api/trips', createProseRecoveryRouter({
      Trip: { findById: async () => trip },
      LeaseModel: makeLeaseModel(),
      config: () => ({ enabled: true, leaseMs: 180000, maxRuntimeMs: 120000, safetyMarginMs: 30000, retryAfterSeconds: 120 }),
      proseConfig: () => ({ mode: 'enforce', maxChars: 20000, retryEnabled: true }),
      buildDeliverProse: () => async () => ({ aborted: true }),
    }));

    await post(app);
    expect(JSON.stringify(trip)).toBe(before);
  });

  test('deterministic fallback still completes and transitions the lease', async () => {
    const LeaseModel = makeLeaseModel();
    const { app } = buildApp({ LeaseModel, prose: 'Vague notes naming nothing.' });
    const events = parseSse((await post(app)).text);
    const proseReady = events.find((e) => e.type === 'prose_ready');

    expect(proseReady.response.lifecycleStatus).toBe('fallback_complete');
    expect(proseReady.response.itineraryHash).toBe(ITIN_HASH);
    expect(LeaseModel.docs[0].state).toBe(LEASE_STATE.AWAITING_PERSISTENCE);
  });
});

describe('Stage 14.4 §16 — ownership structural invariants', () => {
  const source = fs.readFileSync(path.join(__dirname, '../proseRecovery.js'), 'utf8');

  test('the recovery route never writes trip content', () => {
    expect(source).not.toMatch(/TripPlan\.(save|create|findByIdAndUpdate|updateOne)/);
    expect(source).not.toMatch(/trip\.save\(/);
    expect(source).not.toMatch(/require\(.*tripController/);
  });

  test('the recovery route never invokes Phase A', () => {
    expect(source).not.toMatch(/toolFirstItineraryOrchestrator|structuredItineraryGenerator|orchestrateToolFirstItinerary/);
  });

  test('the recovery route never imports private evaluation capture', () => {
    expect(source).not.toMatch(/privateDraftCapture/);
  });

  test('the only model the route mutates is the lease', () => {
    // TripPlan is read-only here: findById and nothing else.
    const tripUsages = source.match(/Trip\.[a-zA-Z]+\(/g) || [];
    expect(new Set(tripUsages)).toEqual(new Set(['Trip.findById(']));
  });

  test('the trip persistence path may clear a lease but never starts recovery', () => {
    const controller = fs.readFileSync(
      path.join(__dirname, '../../controllers/tripController.js'), 'utf8'
    );
    expect(controller).toMatch(/clearLeaseAfterPersistence/);
    expect(controller).not.toMatch(/runProseRecovery|acquireRecoveryLease/);
  });
});
