'use strict';

// Product decision 2026-10-26 (reaffirming 2026-10-06): signed-in Trailie has
// no daily token cap. Guests keep the 5-completed-turn allowance. Token usage
// is still recorded for observability, and request-rate protection stays.
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const User = require('../../models/User');
const AnonymousSession = require('../../models/AnonymousSession');
const { mintGuestSessionId } = require('../../utils/anonymousIdGenerator');
const { stubMemoryVerifier } = require('../../../tests/helpers/memoryAuthority');

const mockModel = jest.fn();
const mockVerifyMemory = jest.fn();
const mockExecute = jest.fn();
const mockDependencies = jest.fn(() => ({ model: mockModel, verifyMemory: mockVerifyMemory,
  travelTools: { definitions: [], execute: mockExecute } }));

jest.mock('../modelFirstTrailie', () => {
  const actual = jest.requireActual('../modelFirstTrailie');
  return { ...actual, createModelFirstRouter: () => actual.createModelFirstRouter({
    dependencies: mockDependencies, observe: () => {}, recordTurn: async () => {},
    recordMutationOutcome: async () => {} }) };
});
const ai = require('../ai');
const app = express(); app.use(express.json()); app.use('/api/ai', ai);

// One realistic authenticated turn: the measured test conversation used 7,499.
const answer = (content, usage = { inputTokens: 6000, outputTokens: 1499 }) => ({ completionStatus: 'completed',
  outputText: content, toolCalls: [], provider: 'openai', model: 'gpt-6-sol', costStatus: 'priced', costUsd: 0, usage });
const events = res => res.text.split('\n\n').filter(s => s.startsWith('data: ')).map(s => JSON.parse(s.slice(6)));
const terminal = (endpoint, res) => (endpoint.endsWith('-stream') ? events(res).find(e => e.type === 'done') : res.body.data);
const waitFor = async (predicate) => {
  for (let i = 0; i < 50; i++) { if (await predicate()) return true; await new Promise(r => setTimeout(r, 20)); }
  return false;
};

async function userWithUsage(dailyTokensUsed) {
  const user = await User.create({ name: 'Heavy Planner', email: `heavy-${new mongoose.Types.ObjectId()}@example.com`,
    password: 'offline-fixture-only', tokenUsage: { dailyTokensUsed, totalTokensUsed: dailyTokensUsed, lastResetDate: new Date() } });
  return { user, token: jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET) };
}

beforeEach(() => {
  process.env.TRAILIE_RUNTIME = 'model_first';
  mockModel.mockReset().mockResolvedValue(answer('A useful answer.'));
  mockVerifyMemory.mockReset().mockImplementation(stubMemoryVerifier());
  mockExecute.mockReset().mockResolvedValue({ status: 'fulfilled', evidence: [] });
  mockDependencies.mockClear();
});
afterEach(() => { delete process.env.TRAILIE_RUNTIME; });

describe('authenticated Trailie has no daily token cap', () => {
  test.each([
    ['/chat', 7499], ['/chat-stream', 7499], ['/plan-itinerary', 7499],
    ['/chat', 20000], ['/chat-stream', 20000], ['/plan-itinerary', 20000],
  ])('%s is admitted after %i tokens used today', async (endpoint, used) => {
    const { token } = await userWithUsage(used);
    const res = await request(app).post('/api/ai' + endpoint).set('Authorization', 'Bearer ' + token)
      .send({ message: 'Plan two days in Zion', clientTurnId: `turn-${endpoint}-${used}` });
    expect(res.status).toBe(200);
    expect(res.body?.error).not.toBe('Daily token limit exceeded');
    expect(terminal(endpoint, res)).toMatchObject({ content: 'A useful answer.', persisted: true });
    expect(mockModel).toHaveBeenCalled();
  });

  test.each(['/chat', '/chat-stream'])('multi-turn revisions on %s keep working past 5,000 cumulative tokens and usage is still recorded', async endpoint => {
    const { user, token } = await userWithUsage(0);
    let tripId = null;
    for (let i = 0; i < 4; i++) {
      const res = await request(app).post('/api/ai' + endpoint).set('Authorization', 'Bearer ' + token)
        .send({ message: i ? `Revise day ${i}` : 'Plan three days in Zion', clientTurnId: `rev-${i}`,
          ...(tripId ? { tripId } : {}) });
      expect(res.status).toBe(200);
      const body = terminal(endpoint, res);
      expect(body.persisted).toBe(true);
      tripId = tripId || body.tripId;
      expect(body.tripId).toBe(tripId);
      // Accounting is fire-and-forget; wait for this turn's write before the next.
      expect(await waitFor(async () => (await User.findById(user._id)).tokenUsage.dailyTokensUsed >= 7499 * (i + 1))).toBe(true);
    }
    const saved = await User.findById(user._id);
    expect(saved.tokenUsage.dailyTokensUsed).toBeGreaterThan(5000 * 4);
  });

  test('token-usage endpoint reports usage without any daily allowance', async () => {
    const { token } = await userWithUsage(7499);
    const res = await request(app).get('/api/ai/token-usage').set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(200);
    expect(res.body.tokenUsage).toMatchObject({ dailyTokensUsed: 7499, totalTokensUsed: 7499 });
    expect(res.body.tokenUsage).not.toHaveProperty('dailyLimit');
    expect(res.body.tokenUsage).not.toHaveProperty('remainingTokens');
  });

  test('the token middleware no longer exports an enforcement path', () => {
    const tokenLimits = require('../../middleware/tokenLimits');
    expect(tokenLimits.checkTokenLimit).toBeUndefined();
    expect(tokenLimits.DAILY_TOKEN_LIMITS).toBeUndefined();
    expect(typeof tokenLimits.trackTokenUsage).toBe('function');
    expect(typeof User.prototype.hasExceededTokenLimit).toBe('undefined');
  });
});

describe('guest vs authenticated separation is intact', () => {
  test('guests still stop after 5 completed turns on chat and plan-itinerary, before the model', async () => {
    const anonymousId = mintGuestSessionId();
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/ai/chat-anonymous-stream')
        .send({ anonymousId, clientTurnId: `g${i}`, message: `Question ${i}` });
      expect(res.status).toBe(200);
    }
    const calls = mockModel.mock.calls.length;
    for (const endpoint of ['/chat-anonymous', '/chat-anonymous-stream', '/plan-itinerary']) {
      const capped = await request(app).post('/api/ai' + endpoint).send({ anonymousId, clientTurnId: `x${endpoint}`, message: 'More' });
      expect(capped.status).toBe(429);
      expect(capped.body.canSendMore).toBe(false);
    }
    expect(mockModel.mock.calls.length).toBe(calls);
    expect((await AnonymousSession.findOne({ anonymousId }).lean()).completedTurnCount).toBe(5);
  });

  test('authenticated routes still require auth and guests cannot open signed-in trips', async () => {
    for (const endpoint of ['/chat', '/chat-stream']) {
      expect((await request(app).post('/api/ai' + endpoint).send({ message: 'Hi' })).status).toBe(401);
    }
    const res = await request(app).post('/api/ai/plan-itinerary')
      .send({ anonymousId: mintGuestSessionId(), message: 'Hi', tripId: String(new mongoose.Types.ObjectId()) });
    expect(res.status).toBe(403);
    expect(mockDependencies).not.toHaveBeenCalled();
  });
});

describe('fair-use protections remain mounted', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../../app.js'), 'utf8');

  test('app-level express-rate-limit guards every /api route, including Trailie', () => {
    expect(appSource).toMatch(/require\('express-rate-limit'\)/);
    expect(appSource).toMatch(/app\.use\('\/api\/', tieredLimiter\)/);
    expect(appSource.indexOf("app.use('/api/', tieredLimiter)"))
      .toBeLessThan(appSource.indexOf("app.use('/api/ai', requireFeature('enableAI')"));
  });

  test('per-request input guards still reject oversized input before any model dependency', async () => {
    const { token } = await userWithUsage(20000);
    for (const endpoint of ['/chat', '/chat-stream', '/plan-itinerary']) {
      const huge = await request(app).post('/api/ai' + endpoint).set('Authorization', 'Bearer ' + token)
        .send({ message: 'x'.repeat(30001) });
      expect(huge.status).toBe(400);
      const meta = await request(app).post('/api/ai' + endpoint).set('Authorization', 'Bearer ' + token)
        .send({ message: 'Hi', metadata: { blob: 'x'.repeat(50001) } });
      expect(meta.status).toBe(400);
    }
    expect(mockDependencies).not.toHaveBeenCalled();
  });
});
