'use strict';

// Signed-in Trailie fair use (product decision 2026-10-26): no daily cap, but
// a user-turn burst window, cross-instance generation leases, and
// non-blocking spend alerts. Guests keep the 5-completed-turn allowance.
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../../models/User');
const AnonymousSession = require('../../models/AnonymousSession');
const TrailieGenerationLease = require('../../models/TrailieGenerationLease');
const TrailieTurnBurst = require('../../models/TrailieTurnBurst');
const TrailieSpendDaily = require('../../models/TrailieSpendDaily');
const { hashPrincipal } = require('../../services/trailieTurnLedger');
const { createGenerationLeaseService, conversationLeaseKey } = require('../../services/trailieGenerationLeases');
const { createTurnBurstService } = require('../../services/trailieTurnBurst');
const { createCostMonitor } = require('../../services/trailieCostMonitor');
const { mintGuestSessionId } = require('../../utils/anonymousIdGenerator');
const { stubMemoryVerifier } = require('../../../tests/helpers/memoryAuthority');

const mockModel = jest.fn();
const mockVerifyMemory = jest.fn();
const mockExecute = jest.fn();
const mockDependencies = jest.fn(() => ({ model: mockModel, verifyMemory: mockVerifyMemory,
  travelTools: { definitions: [], execute: mockExecute } }));
// Real wall clock plus a test-controlled offset ("simulated clock").
const mockClock = { offset: 0, now: () => Date.now() + mockClock.offset };
const mockEmitAlert = jest.fn();

jest.mock('../modelFirstTrailie', () => {
  const actual = jest.requireActual('../modelFirstTrailie');
  const leases = jest.requireActual('../../services/trailieGenerationLeases');
  const burst = jest.requireActual('../../services/trailieTurnBurst');
  const cost = jest.requireActual('../../services/trailieCostMonitor');
  return { ...actual, createModelFirstRouter: () => actual.createModelFirstRouter({
    dependencies: mockDependencies, observe: () => {}, recordTurn: async () => {},
    recordMutationOutcome: async () => {},
    fairUse: {
      leases: leases.createGenerationLeaseService({ now: () => mockClock.now() }),
      burst: burst.createTurnBurstService({ now: () => mockClock.now() }),
      costMonitor: cost.createCostMonitor({ now: () => mockClock.now(), emitAlert: a => mockEmitAlert(a) }),
    } }) };
});
const ai = require('../ai');
const app = express(); app.use(express.json()); app.use('/api/ai', ai);

const answer = (content, { costUsd = 0.03, usage = { inputTokens: 6000, outputTokens: 1499 } } = {}) => ({
  completionStatus: 'completed', outputText: content, toolCalls: [], provider: 'openai', model: 'gpt-6-sol',
  costStatus: 'priced', costUsd, usage });
const tool = (name, input) => ({ ...answer(''), toolCalls: [{ id: 'tool-1', name, input }] });
const events = res => res.text.split('\n\n').filter(s => s.startsWith('data: ')).map(s => JSON.parse(s.slice(6)));
const terminal = (endpoint, res) => (endpoint.endsWith('-stream') ? events(res).find(e => e.type === 'done') : res.body.data);
const waitFor = async (predicate, tries = 150) => {
  for (let i = 0; i < tries; i++) { if (await predicate()) return true; await new Promise(r => setTimeout(r, 20)); }
  return false;
};
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

async function signedIn(dailyTokensUsed = 0) {
  const user = await User.create({ name: 'Planner', email: `p-${new mongoose.Types.ObjectId()}@example.com`,
    password: 'offline-fixture-only', tokenUsage: { dailyTokensUsed, totalTokensUsed: dailyTokensUsed, lastResetDate: new Date() } });
  return { user, token: jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET), principal: hashPrincipal(String(user._id)) };
}
const send = (token, endpoint, body) => request(app).post('/api/ai' + endpoint).set('Authorization', 'Bearer ' + token).send(body);
const burstCount = async principal => (await TrailieTurnBurst.findById(principal).lean())?.turns.length || 0;
const activeLeases = principal => TrailieGenerationLease.countDocuments({ principalHash: principal });

// Start a request whose model call blocks until the returned gate resolves.
async function startBlocked(token, endpoint, body) {
  const gate = deferred();
  const before = mockModel.mock.calls.length;
  mockModel.mockImplementationOnce(() => gate.promise);
  const pending = send(token, endpoint, body).then(res => res);
  expect(await waitFor(() => mockModel.mock.calls.length > before)).toBe(true);
  return { pending, release: () => gate.resolve(answer('Done.')), fail: e => gate.reject(e) };
}

beforeEach(() => {
  process.env.TRAILIE_RUNTIME = 'model_first';
  mockClock.offset = 0;
  mockModel.mockReset().mockResolvedValue(answer('A useful answer.'));
  mockVerifyMemory.mockReset().mockImplementation(stubMemoryVerifier());
  mockExecute.mockReset().mockResolvedValue({ status: 'fulfilled', evidence: [] });
  mockDependencies.mockClear();
  mockEmitAlert.mockReset();
});
afterEach(() => {
  delete process.env.TRAILIE_RUNTIME;
  delete process.env.TRAILIE_COST_ALERT_USER_DAILY_USD;
  delete process.env.TRAILIE_COST_ALERT_AGGREGATE_DAILY_USD;
  delete process.env.TRAILIE_COST_ALERT_USER_DAILY_TOKENS;
});

describe('burst window: 30 user-initiated turns per 15 minutes', () => {
  test('30 turns are admitted, the 31st is 429 with Retry-After, and the window resets', async () => {
    const { token, principal } = await signedIn();
    for (let i = 0; i < 30; i++) {
      const res = await send(token, i % 2 ? '/chat-stream' : '/chat', { message: `Turn ${i}`, clientTurnId: `ct-${i}` });
      expect(res.status).toBe(200);
    }
    expect(await burstCount(principal)).toBe(30);
    const calls = mockModel.mock.calls.length;
    for (const endpoint of ['/chat', '/chat-stream', '/plan-itinerary']) {
      const capped = await send(token, endpoint, { message: 'One more', clientTurnId: `ct-over-${endpoint}` });
      expect(capped.status).toBe(429);
      const retryAfter = Number(capped.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(900);
      expect(capped.body).toMatchObject({ code: 'trailie_turn_burst_limit', retryAfterSeconds: retryAfter });
      expect(capped.body.error).toMatch(/send your next message in about \d+ minutes?/);
    }
    expect(mockModel.mock.calls.length).toBe(calls); // throttled turns never reach the model
    expect(await activeLeases(principal)).toBe(0); // throttled turns do not hold a lease

    mockClock.offset = 15 * 60 * 1000 + 1000;
    const reopened = await send(token, '/chat', { message: 'Back again', clientTurnId: 'ct-after-window' });
    expect(reopened.status).toBe(200);
    expect(await burstCount(principal)).toBe(1);
  });

  test('a busy refusal does not consume burst allowance', async () => {
    const { token, principal } = await signedIn();
    const first = await startBlocked(token, '/chat', { message: 'A', conversationId: 'temp-a', clientTurnId: 'ct-a' });
    const busy = await send(token, '/chat', { message: 'A2', conversationId: 'temp-a', clientTurnId: 'ct-a2' });
    expect(busy.status).toBe(409);
    expect(await burstCount(principal)).toBe(1);
    first.release();
    expect((await first.pending).status).toBe(200);
  });
});

describe('only user turns count', () => {
  test('a resend with the same clientTurnId (stream -> non-stream fallback, transport retry) is not double-counted', async () => {
    const { token, principal } = await signedIn();
    expect((await send(token, '/chat-stream', { message: 'Plan Zion', clientTurnId: 'ct-same' })).status).toBe(200);
    expect((await send(token, '/chat', { message: 'Plan Zion', clientTurnId: 'ct-same' })).status).toBe(200);
    expect((await send(token, '/chat', { message: 'Plan Zion', clientTurnId: 'ct-same' })).status).toBe(200);
    expect(await burstCount(principal)).toBe(1);
    expect((await send(token, '/chat', { message: 'Another', clientTurnId: 'ct-other' })).status).toBe(200);
    expect(await burstCount(principal)).toBe(2);
    // Requests without an id (older clients, signed-in API callers) count each time.
    await send(token, '/plan-itinerary', { message: 'No id' });
    await send(token, '/plan-itinerary', { message: 'No id' });
    expect(await burstCount(principal)).toBe(4);
  });

  test('resends beyond the transport-attempt bound are counted, so an id cannot be replayed for free', async () => {
    const { token, principal } = await signedIn();
    for (let i = 0; i < 6; i++) expect((await send(token, '/chat', { message: 'Same', clientTurnId: 'ct-replay' })).status).toBe(200);
    expect(await burstCount(principal)).toBe(2); // attempts 1-5 = one turn, 6th = a new turn
  });

  test('multiple model calls, tool calls and corrections inside one turn count once', async () => {
    const { token, principal } = await signedIn();
    mockModel.mockResolvedValueOnce(tool('read_travel', {})).mockResolvedValueOnce(answer('Researched answer.'));
    const res = await send(token, '/chat', { message: 'What is open in Zion?', clientTurnId: 'ct-tools' });
    expect(res.status).toBe(200);
    expect(mockModel.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mockExecute).toHaveBeenCalled();
    expect(await burstCount(principal)).toBe(1);
  });
});

describe('generation leases: one per conversation, two per account', () => {
  test.each(['/chat', '/chat-stream'])('a second turn in the same conversation while the first is active is busy on %s, then proceeds immediately', async (endpoint) => {
    const { token, principal } = await signedIn();
    const first = await startBlocked(token, endpoint, { message: 'Plan', conversationId: 'temp-1', clientTurnId: 'ct-1' });
    expect(await activeLeases(principal)).toBe(2); // conversation + one user slot
    const busy = await send(token, endpoint, { message: 'Also', conversationId: 'temp-1', clientTurnId: 'ct-2' });
    expect(busy.status).toBe(409);
    expect(busy.body).toMatchObject({ code: 'trailie_generation_in_progress' });
    expect(busy.body.error).toMatch(/still working on your last message/);
    first.release();
    const done = await first.pending;
    expect(done.status).toBe(200);
    expect(terminal(endpoint, done)).toMatchObject({ persisted: true });
    expect(await activeLeases(principal)).toBe(0);
    expect((await send(token, endpoint, { message: 'Next', conversationId: 'temp-1', clientTurnId: 'ct-3' })).status).toBe(200);
  });

  test('the same trip id is one conversation across /chat, /chat-stream and /plan-itinerary', async () => {
    const { token } = await signedIn();
    const created = await send(token, '/chat', { message: 'Plan Zion', clientTurnId: 'ct-new' });
    const tripId = created.body.data.tripId;
    expect(tripId).toBeTruthy();
    const first = await startBlocked(token, '/chat-stream', { message: 'Revise', tripId, clientTurnId: 'ct-r1' });
    for (const endpoint of ['/chat', '/plan-itinerary']) {
      const busy = await send(token, endpoint, { message: 'Revise too', tripId, clientTurnId: `ct-r2${endpoint}` });
      expect(busy.status).toBe(409);
    }
    first.release();
    expect((await first.pending).status).toBe(200);
  });

  test('two tabs on two conversations run in parallel; a third concurrent conversation is busy', async () => {
    const { token, principal } = await signedIn();
    const a = await startBlocked(token, '/chat-stream', { message: 'A', conversationId: 'temp-a', clientTurnId: 'ct-a' });
    const b = await startBlocked(token, '/chat', { message: 'B', conversationId: 'temp-b', clientTurnId: 'ct-b' });
    const c = await send(token, '/chat', { message: 'C', conversationId: 'temp-c', clientTurnId: 'ct-c' });
    expect(c.status).toBe(409);
    expect(c.body).toMatchObject({ code: 'trailie_concurrent_generation_limit' });
    // The refused third turn released its conversation lease (no leak).
    expect(await TrailieGenerationLease.findById(conversationLeaseKey(principal, 'temp-c')).lean()).toBeNull();
    a.release(); b.release();
    expect((await a.pending).status).toBe(200);
    expect((await b.pending).status).toBe(200);
    expect((await send(token, '/chat', { message: 'C', conversationId: 'temp-c', clientTurnId: 'ct-c2' })).status).toBe(200);
  });

  test('another user is never blocked by this user\'s leases', async () => {
    const one = await signedIn();
    const two = await signedIn();
    const a = await startBlocked(one.token, '/chat', { message: 'A', conversationId: 'temp-x', clientTurnId: 'ct-a' });
    const b = await startBlocked(one.token, '/chat', { message: 'B', conversationId: 'temp-y', clientTurnId: 'ct-b' });
    expect((await send(two.token, '/chat', { message: 'Mine', conversationId: 'temp-x', clientTurnId: 'ct-z' })).status).toBe(200);
    a.release(); b.release();
    await a.pending; await b.pending;
  });

  test.each(['/chat', '/chat-stream'])('a model failure on %s releases the lease', async (endpoint) => {
    const { token, principal } = await signedIn();
    const first = await startBlocked(token, endpoint, { message: 'A', conversationId: 'temp-f', clientTurnId: 'ct-f' });
    first.fail(Object.assign(new Error('boom'), { code: 'provider_error' }));
    const res = await first.pending;
    if (endpoint === '/chat') expect(res.status).toBeGreaterThanOrEqual(400);
    else expect(events(res).some(e => e.type === 'error')).toBe(true);
    expect(await activeLeases(principal)).toBe(0);
    expect((await send(token, endpoint, { message: 'Again', conversationId: 'temp-f', clientTurnId: 'ct-f2' })).status).toBe(200);
  });

  test('a provider timeout releases the lease', async () => {
    const { token, principal } = await signedIn();
    const first = await startBlocked(token, '/chat-stream', { message: 'A', conversationId: 'temp-t', clientTurnId: 'ct-t' });
    first.fail(Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError', code: 'responses_timeout' }));
    await first.pending;
    expect(await activeLeases(principal)).toBe(0);
  });

  test('a thrown backend exception releases the lease', async () => {
    const { token, principal } = await signedIn();
    mockDependencies.mockImplementationOnce(() => { throw new Error('dependency construction failed'); });
    const res = await send(token, '/chat', { message: 'A', conversationId: 'temp-e', clientTurnId: 'ct-e' });
    expect(res.status).toBe(503);
    expect(await activeLeases(principal)).toBe(0);
    expect((await send(token, '/chat', { message: 'B', conversationId: 'temp-e', clientTurnId: 'ct-e2' })).status).toBe(200);
  });

  test('client disconnect (stream cancel) releases the lease and the next turn proceeds', async () => {
    const { token, principal } = await signedIn();
    const server = app.listen(0, '127.0.0.1');
    await new Promise(r => server.once('listening', r));
    try {
      const { port } = server.address();
      const gate = deferred();
      mockModel.mockImplementationOnce(({ signal } = {}) => new Promise((resolve, reject) => {
        gate.promise.then(resolve);
        signal?.addEventListener?.('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      }));
      const controller = new AbortController();
      const before = mockModel.mock.calls.length;
      const streaming = fetch(`http://127.0.0.1:${port}/api/ai/chat-stream`, {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ message: 'Plan', conversationId: 'temp-d', clientTurnId: 'ct-d' }),
      }).then(r => r.text()).catch(e => e);
      expect(await waitFor(() => mockModel.mock.calls.length > before)).toBe(true);
      expect(await activeLeases(principal)).toBe(2);
      controller.abort();
      await streaming;
      expect(await waitFor(async () => (await activeLeases(principal)) === 0)).toBe(true);
      gate.resolve(answer('late'));
      expect((await send(token, '/chat', { message: 'Next', conversationId: 'temp-d', clientTurnId: 'ct-d2' })).status).toBe(200);
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  test('an abandoned lease (crashed instance) blocks until it expires, then is reclaimed without the TTL monitor', async () => {
    const { token, principal } = await signedIn();
    const now = mockClock.now();
    await TrailieGenerationLease.create({ _id: conversationLeaseKey(principal, 'temp-z'), scope: 'conversation',
      principalHash: principal, ownerToken: 'dead-instance', clientTurnId: 'ct-dead', route: 'chat',
      acquiredAt: new Date(now), expiresAt: new Date(now + 240000) });
    expect((await send(token, '/chat', { message: 'A', conversationId: 'temp-z', clientTurnId: 'ct-z' })).status).toBe(409);
    mockClock.offset = 241000;
    expect((await send(token, '/chat', { message: 'A', conversationId: 'temp-z', clientTurnId: 'ct-z' })).status).toBe(200);
    expect(await activeLeases(principal)).toBe(0);
  });

  test('a same-turn resend waits briefly for its predecessor instead of failing busy', async () => {
    const { token } = await signedIn();
    const first = await startBlocked(token, '/chat-stream', { message: 'A', conversationId: 'temp-s', clientTurnId: 'ct-s' });
    const resend = send(token, '/chat', { message: 'A', conversationId: 'temp-s', clientTurnId: 'ct-s' }).then(r => r);
    await new Promise(r => setTimeout(r, 300));
    first.release();
    expect((await first.pending).status).toBe(200);
    expect((await resend).status).toBe(200);
  });
});

describe('lease service (cross-instance semantics)', () => {
  const opts = { principal: 'p1', maxActivePerUser: 2, ttlMs: 240000, maxHoldMs: 600000 };
  test('two independent service instances (two app servers) contend on the same documents', async () => {
    const clock = { t: Date.now() };
    const one = createGenerationLeaseService({ now: () => clock.t });
    const two = createGenerationLeaseService({ now: () => clock.t });
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => (i % 2 ? one : two)
      .acquire({ ...opts, conversationKey: 'trip-1', clientTurnId: `c${i}` })));
    expect(results.filter(r => r.admitted)).toHaveLength(1);
    await results.find(r => r.admitted).lease.release();
    const many = await Promise.all(['a', 'b', 'c', 'd'].map((k, i) => (i % 2 ? one : two).acquire({ ...opts, conversationKey: k })));
    expect(many.filter(r => r.admitted)).toHaveLength(2);
    await Promise.all(many.filter(r => r.admitted).map(r => r.lease.release()));
    expect(await TrailieGenerationLease.countDocuments({})).toBe(0);
  });

  test('renewal keeps a long generation alive past the TTL, bounded by maxHold; release is owner-fenced', async () => {
    const clock = { t: Date.now() };
    const svc = createGenerationLeaseService({ now: () => clock.t });
    const held = await svc.acquire({ ...opts, conversationKey: 'k' });
    clock.t += 200000;
    expect(await held.lease.renew()).toBe(true);
    clock.t += 200000; // 400s after acquire, still within the renewed TTL
    expect((await svc.acquire({ ...opts, conversationKey: 'k' })).admitted).toBe(false);
    clock.t += 300000; // past maxHold: renewal refuses and the lease lapses
    expect(await held.lease.renew()).toBe(false);
    const taken = await svc.acquire({ ...opts, conversationKey: 'k' });
    expect(taken.admitted).toBe(true);
    await held.lease.release(); // late release by the superseded owner is a no-op
    expect(await TrailieGenerationLease.countDocuments({ ownerToken: taken.lease.ownerToken })).toBe(2);
    await taken.lease.release();
  });

  test('burst admission is atomic across instances: exactly the remaining allowance is admitted', async () => {
    const clock = { t: Date.now() };
    const one = createTurnBurstService({ now: () => clock.t });
    const two = createTurnBurstService({ now: () => clock.t });
    const cfg = { principal: 'p-burst', maxTurns: 5, windowMs: 900000 };
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? one : two).admit({ ...cfg, clientTurnId: `t${i}` })));
    expect(results.filter(r => r.admitted)).toHaveLength(5);
    expect(results.filter(r => !r.admitted).every(r => r.retryAfterSeconds > 0)).toBe(true);
  });
});

describe('guest behavior and the removed daily cap are unchanged', () => {
  test('guests keep the 5-completed-turn allowance and never touch fair-use leases or burst windows', async () => {
    const anonymousId = mintGuestSessionId();
    for (let i = 0; i < 5; i++) {
      expect((await request(app).post('/api/ai/chat-anonymous-stream').send({ anonymousId, clientTurnId: `g${i}`, message: `Q${i}` })).status).toBe(200);
    }
    const capped = await request(app).post('/api/ai/chat-anonymous').send({ anonymousId, clientTurnId: 'g-x', message: 'More' });
    expect(capped.status).toBe(429);
    expect(capped.body.canSendMore).toBe(false);
    expect(capped.body.code).not.toBe('trailie_turn_burst_limit');
    expect((await AnonymousSession.findOne({ anonymousId }).lean()).completedTurnCount).toBe(5);
    expect(await TrailieGenerationLease.countDocuments({})).toBe(0);
    expect(await TrailieTurnBurst.countDocuments({})).toBe(0);
  });

  test('a signed-in user at 20,000 tokens today is still admitted (no daily cap)', async () => {
    const { token } = await signedIn(20000);
    for (const endpoint of ['/chat', '/chat-stream', '/plan-itinerary']) {
      expect((await send(token, endpoint, { message: 'Plan', clientTurnId: `ct-${endpoint}` })).status).toBe(200);
    }
  });
});

describe('spend alerts are observability only', () => {
  test('a per-user and aggregate alert fires once when the daily threshold is crossed, and never blocks', async () => {
    process.env.TRAILIE_COST_ALERT_USER_DAILY_USD = '0.05';
    process.env.TRAILIE_COST_ALERT_AGGREGATE_DAILY_USD = '0.08';
    const { token, user, principal } = await signedIn();
    for (let i = 0; i < 5; i++) {
      expect((await send(token, '/chat', { message: `Turn ${i}`, clientTurnId: `ct-${i}` })).status).toBe(200);
      expect(await waitFor(async () => ((await TrailieSpendDaily.findOne({ scope: 'aggregate' }).lean())?.turns || 0) === i + 1)).toBe(true);
    }
    const alerts = mockEmitAlert.mock.calls.map(([a]) => a);
    expect(alerts.filter(a => a.scope === 'user' && a.metric === 'cost')).toHaveLength(1);
    expect(alerts.filter(a => a.scope === 'aggregate' && a.metric === 'cost')).toHaveLength(1);
    const userAlert = alerts.find(a => a.scope === 'user');
    expect(userAlert).toMatchObject({ type: 'trailie_cost_threshold', userId: String(user._id), principalHash: principal, threshold: 0.05 });
    expect(userAlert.value).toBeGreaterThanOrEqual(0.05);
    const row = await TrailieSpendDaily.findOne({ scope: 'user', principalHash: principal }).lean();
    expect(row.turns).toBe(5);
    expect(row.costUsd).toBeCloseTo(0.15, 6);
    expect(row.tokens).toBe(5 * 7499);
  });

  test('a token threshold alerts even when cost is unpriced, and alerts reset on the next UTC day', async () => {
    process.env.TRAILIE_COST_ALERT_USER_DAILY_TOKENS = '10000';
    const { token } = await signedIn();
    mockModel.mockResolvedValue({ ...answer('Unpriced.'), costStatus: 'cost_unknown', costUsd: null });
    await send(token, '/chat', { message: 'a', clientTurnId: 'ct-a' });
    await send(token, '/chat', { message: 'b', clientTurnId: 'ct-b' });
    expect(await waitFor(() => mockEmitAlert.mock.calls.some(([a]) => a.metric === 'tokens'))).toBe(true);
    mockClock.offset = 24 * 60 * 60 * 1000;
    await send(token, '/chat', { message: 'c', clientTurnId: 'ct-c' });
    await send(token, '/chat', { message: 'd', clientTurnId: 'ct-d' });
    expect(await waitFor(() => mockEmitAlert.mock.calls.filter(([a]) => a.metric === 'tokens' && a.scope === 'user').length === 2)).toBe(true);
  });

  test('a failing spend store never affects the turn', async () => {
    const monitor = createCostMonitor({ SpendModel: { findOneAndUpdate: () => { throw new Error('db down'); } }, emitAlert: mockEmitAlert });
    await expect(monitor.recordTurnSpend({ userId: 'u1', telemetry: { calls: [{ usage: { inputTokens: 1, outputTokens: 1 } }] } })).resolves.toEqual([]);
    expect(mockEmitAlert).not.toHaveBeenCalled();
  });
});
