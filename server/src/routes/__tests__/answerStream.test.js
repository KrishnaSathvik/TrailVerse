'use strict';

const mockStore = { load: jest.fn(), commit: jest.fn() };
jest.mock('../../services/trailieSimpleStore', () => ({ createSimpleTripStore: () => mockStore }));
jest.mock('../../services/trailieSimpleGuestStore', () => ({ createSimpleGuestStore: () => mockStore }));
jest.mock('../../services/guestTurnScope', () => ({
  openGuestTurn: async () => ({ admitted: true, fail: async () => {}, settle: async () => {} }),
  GUEST_TURN_FAILURE_CODES: {}, GUEST_ROUTE_CODES: {},
}));
const express = require('express');
const request = require('supertest');
const { createModelFirstRouter } = require('../modelFirstTrailie');
const { ANSWER_TOOL } = require('../../utils/trailieAnswerStream');

const generation = extra => ({ completionStatus: 'completed', outputText: '', toolCalls: [], costStatus: 'priced', costUsd: 0, ...extra });
const originalEnv = { ...process.env };
beforeEach(() => {
  jest.clearAllMocks();
  process.env.TRAILIE_RUNTIME = 'model_first';
  process.env.TRAILIE_ANSWER_STREAM = 'true';
  process.env.TRAILIE_TRANSPORT_V2 = 'true';
  mockStore.load.mockResolvedValue({});
  mockStore.commit.mockResolvedValue({ ok: true, tripId: 'saved-trip', quota: { completedGuestTurns: 1, remainingAllowance: 2 } });
});
afterEach(() => {
  for (const key of ['TRAILIE_RUNTIME', 'TRAILIE_ANSWER_STREAM', 'TRAILIE_TRANSPORT_V2']) {
    if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
  }
});
function appFor(model) {
  const app = express(); app.use(express.json());
  app.use('/api/ai', createModelFirstRouter({
    dependencies: () => ({ model, travelTools: { definitions: [], execute: jest.fn() } }),
    TripPlan: {}, AnonymousSession: { findOrCreateSession: async () => ({}) },
    authenticate: (req, res, next) => { req.user = { _id: 'fixture-owner' }; next(); },
    authenticateOptional: (req, res, next) => next(),
    observe: () => {}, recordTurn: async () => {}, recordMutationOutcome: async () => {},
  }));
  return app;
}
const events = response => response.text.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));

test.each(['/chat-stream', '/chat-anonymous-stream'])('%s delivers provisional text before generation finishes, then exactly one persisted terminal', async endpoint => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  let sawProvisional = false, wire = '';
  const watchdog = setTimeout(release, 3000);
  const model = jest.fn()
    .mockResolvedValueOnce(generation({ toolCalls: [{ id: 'choice', name: ANSWER_TOOL.name, input: {} }] }))
    .mockImplementationOnce(async options => {
      options.onTextDelta('Early advice'); await waiting;
      return generation({ outputText: 'Early advice' });
    });
  try {
    const response = await request(appFor(model)).post('/api/ai' + endpoint)
      .set('x-trailie-answer-stream', '1').set('x-trailie-transport', 'v2')
      .send({ message: 'Compare these parks.' }).buffer(true).parse((res, callback) => {
        res.on('data', chunk => {
          wire += chunk.toString();
          if (!sawProvisional && wire.includes('"type":"answer_delta"')) {
            sawProvisional = true;
            expect(mockStore.commit).not.toHaveBeenCalled();
            release();
          }
        });
        res.on('end', () => callback(null, wire));
        res.on('error', callback);
      });
    expect(response.status).toBe(200);
    expect(sawProvisional).toBe(true);
    const received = events({ text: wire });
    expect(received.filter(event => event.type === 'response_finalized')).toEqual([expect.objectContaining({ persisted: true, content: 'Early advice' })]);
    expect(received.findIndex(event => event.type === 'answer_delta')).toBeLessThan(received.findIndex(event => event.type === 'content_delta'));
    expect(model).toHaveBeenCalledTimes(2);
    expect(mockStore.commit).toHaveBeenCalledTimes(1);
  } finally { clearTimeout(watchdog); release(); }
});

test.each(['server-off', 'client-off', 'nonstream'])('%s preserves one-round buffered behavior', async mode => {
  if (mode === 'server-off') process.env.TRAILIE_ANSWER_STREAM = 'false';
  const model = jest.fn(async options => {
    expect(options.tools.map(tool => tool.name)).not.toContain(ANSWER_TOOL.name);
    return generation({ outputText: 'Buffered answer' });
  });
  const response = await request(appFor(model)).post('/api/ai/' + (mode === 'nonstream' ? 'chat' : 'chat-stream'))
    .set('x-trailie-answer-stream', mode === 'client-off' ? '0' : '1').send({ message: 'Advice?' });
  expect(response.status).toBe(200);
  expect(model).toHaveBeenCalledTimes(1);
  expect(response.text).not.toContain('answer_started');
});

test('SSE failure withdraws provisional text and never emits done', async () => {
  const model = jest.fn()
    .mockResolvedValueOnce(generation({ toolCalls: [{ id: 'choice', name: ANSWER_TOOL.name, input: {} }] }))
    .mockImplementationOnce(async options => { options.onTextDelta('Not accepted'); throw new Error('Interrupted'); });
  const response = await request(appFor(model)).post('/api/ai/chat-stream').set('x-trailie-answer-stream', '1').send({ message: 'Advice?' });
  const received = events(response);
  expect(received.map(event => event.type)).toContain('answer_withdrawn');
  expect(received.at(-1)).toMatchObject({ type: 'error', retryable: false });
  expect(received.some(event => ['done', 'chunk'].includes(event.type))).toBe(false);
  expect(mockStore.commit).not.toHaveBeenCalled();
});
