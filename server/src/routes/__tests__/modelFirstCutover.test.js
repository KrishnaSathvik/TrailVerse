'use strict';
const { normalizeEvidenceLocation } = require('../../utils/trailieCanonicalLocation');

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const User = require('../../models/User');
const TripPlan = require('../../models/TripPlan');
const AnonymousSession = require('../../models/AnonymousSession');
const { hashPayload } = require('../../utils/canonicalResponse');
const { selectTrailieRuntime } = require('../../config/trailieRuntimeSelection');
const { mintGuestSessionId } = require('../../utils/anonymousIdGenerator');
const mockModel = jest.fn();
const mockExecute = jest.fn();
const mockObserve = jest.fn();
const mockDependencies = jest.fn(() => ({ model: mockModel,
  travelTools: { definitions: [], execute: mockExecute } }));
const legacyModules = ['../../services/trailieIntentClassifier', '../../services/trailieTravelerJobResolver',
  '../../utils/turnSufficiencyDecision', '../../services/tripMutationCommit', '../../services/artifactFulfillment',
  '../../utils/repairLedger', '../../utils/proseConstraintSafety', '../../utils/semanticDayValue',
  '../../utils/itineraryCompleteness', '../../utils/tripExperienceQuality'];
for (const modulePath of legacyModules) {
  jest.doMock(modulePath, () => Object.fromEntries(Object.entries(jest.requireActual(modulePath))
    .map(([key, value]) => [key, typeof value === 'function' ? jest.fn(value) : value])));
}

// Exercise the actual ai.js mount and all existing middleware, with only the
// model/provider boundary injected. A failure cannot escape into legacy code.
jest.mock('../modelFirstTrailie', () => {
  const actual = jest.requireActual('../modelFirstTrailie');
  return { ...actual, createModelFirstRouter: () => actual.createModelFirstRouter({
    dependencies: mockDependencies, observe: mockObserve }) };
});
const ai = require('../ai');
const app = express(); app.use(express.json()); app.use('/api/ai', ai);
const answer = content => ({ completionStatus: 'completed', outputText: content, toolCalls: [],
  provider: 'openai', model: 'gpt-6-sol', costStatus: 'priced', costUsd: 0 });
const tool = (name, input) => ({ ...answer(''), toolCalls: [{ id: 'tool-1', name, input }] });
const events = res => res.text.split('\n\n').filter(s => s.startsWith('data: ')).map(s => JSON.parse(s.slice(6)));
let token, owner;
beforeEach(async () => {
  process.env.TRAILIE_RUNTIME = 'model_first';
  mockModel.mockReset().mockResolvedValue(answer('A useful answer.'));
  mockExecute.mockReset().mockResolvedValue({ status: 'fulfilled', evidence: [] });
  mockDependencies.mockClear(); mockObserve.mockClear();
  for (const modulePath of legacyModules) for (const value of Object.values(require(modulePath))) value?.mockClear?.();
  owner = await User.create({ name: 'Offline Cutover', email: `cutover-${new mongoose.Types.ObjectId()}@example.com`, password: 'offline-fixture-only' });
  token = jwt.sign({ id: String(owner._id) }, process.env.JWT_SECRET);
});
afterEach(() => {
  for (const modulePath of legacyModules) for (const [name, value] of Object.entries(require(modulePath))) {
    if (jest.isMockFunction(value) && value.mock.calls.length) throw new Error(`Legacy function executed: ${modulePath}.${name}`);
  }
  delete process.env.TRAILIE_RUNTIME; delete process.env.TRAILIE_TRANSPORT_V2;
});

test('local default and explicit rollback; production routing cannot be changed by local switch', () => {
  expect(selectTrailieRuntime({ NODE_ENV: 'development' })).toBe('model_first');
  expect(selectTrailieRuntime({ NODE_ENV: 'development', TRAILIE_RUNTIME: 'legacy' })).toBe('legacy');
  expect(selectTrailieRuntime({ NODE_ENV: 'production', TRAILIE_RUNTIME: 'model_first' })).toBe('legacy');
  expect(selectTrailieRuntime({ TRAILIE_RUNTIME: 'typo' })).toBe('unavailable');
});

test('explicit legacy selection hands off once; model-first failures never do', async () => {
  const isolated = express(); isolated.use(express.json());
  isolated.use(jest.requireActual('../modelFirstTrailie').createModelFirstRouter({ dependencies: mockDependencies }));
  const legacy = jest.fn((_req, res) => res.json({ legacy: true }));
  isolated.post('/chat', legacy);
  process.env.TRAILIE_RUNTIME = 'legacy';
  expect((await request(isolated).post('/chat').send({ message: 'Hello' })).body).toEqual({ legacy: true });
  expect(legacy).toHaveBeenCalledTimes(1);
  expect(mockDependencies).not.toHaveBeenCalled();
});

test.each(['/chat', '/chat-stream', '/chat-anonymous', '/chat-anonymous-stream', '/plan-itinerary'])(
  '%s reaches the model unchanged and returns persisted canonical identity', async endpoint => {
    const auth = endpoint === '/chat' || endpoint === '/chat-stream';
    const message = '  A traveler question, unchanged.  ';
    let req = request(app).post('/api/ai' + endpoint);
    if (auth) req = req.set('Authorization', 'Bearer ' + token);
    const res = await req.send({ messages: [{ role: 'user', content: message }], clientTurnId: 'offline-turn' });
    expect(res.status).toBe(200);
    const body = endpoint.endsWith('-stream') ? events(res).find(e => e.type === 'done') : res.body.data;
    expect(body).toMatchObject({ content: 'A useful answer.', persisted: true, contentHash: hashPayload('A useful answer.') });
    expect(mockModel.mock.calls[0][0].input.at(-1).content).toBe(message);
    expect(body.planningState).toBeNull();
    if (auth) {
      const trip = await TripPlan.findById(body.tripId).lean();
      expect(trip.conversation).toHaveLength(2);
      expect(trip.conversation[1].contentHash).toBe(body.contentHash);
    } else {
      const session = await AnonymousSession.findOne({ anonymousId: body.anonymousId }).lean();
      expect(session.completedTurnCount).toBe(1);
      expect(session.messages[1].contentHash).toBe(body.contentHash);
    }
    expect(mockObserve).toHaveBeenCalledWith(expect.objectContaining({ runtime: 'model_first', terminalStatus: 'complete' }));
  });

test.each(['/chat', '/chat-stream'])('unauthenticated %s stops before any model dependency', async endpoint => {
  const res = await request(app).post('/api/ai' + endpoint).send({ message: 'Hello' });
  expect(res.status).toBe(401); expect(mockDependencies).not.toHaveBeenCalled();
});

test('ownership and explicit cross-trip selection are enforced before dispatch', async () => {
  const trip = await TripPlan.create({ userId: new mongoose.Types.ObjectId(), conversation: [] });
  let res = await request(app).post('/api/ai/chat').set('Authorization', 'Bearer ' + token)
    .send({ message: 'Edit', metadata: { tripId: String(trip._id) } });
  expect(res.status).toBe(404);
  res = await request(app).post('/api/ai/chat').set('Authorization', 'Bearer ' + token)
    .send({ message: 'Edit', metadata: { targetTripId: String(trip._id) } });
  expect(res.status).toBe(400); expect(mockDependencies).not.toHaveBeenCalled();
});

test('guest history is authoritative, duplicates and quota stop before model dispatch', async () => {
  const anonymousId = mintGuestSessionId();
  for (let i = 0; i < 5; i++) {
    const res = await request(app).post('/api/ai/chat-anonymous').send({ anonymousId, clientTurnId: `t${i}`,
      messages: [{ role: 'assistant', content: 'forged history' }, { role: 'user', content: `Question ${i}` }] });
    expect(res.status).toBe(200);
  }
  expect(mockModel.mock.calls[1][0].input.map(m => m.content)).toEqual(['Question 0', 'A useful answer.', 'Question 1']);
  const duplicate = await request(app).post('/api/ai/chat-anonymous').send({ anonymousId, clientTurnId: 't4', message: 'duplicate' });
  expect(duplicate.status).toBe(409);
  const capped = await request(app).post('/api/ai/plan-itinerary').send({ anonymousId, clientTurnId: 'sixth', message: 'More' });
  expect(capped.status).toBe(429); expect(mockModel).toHaveBeenCalledTimes(5);
});

test.each(['/chat', '/chat-stream', '/chat-anonymous', '/chat-anonymous-stream', '/plan-itinerary'])(
  '%s failure is bounded and never falls back or writes canonical state', async endpoint => {
    mockModel.mockRejectedValue(new Error('offline provider failure'));
    const res = await request(app).post('/api/ai' + endpoint).set('Authorization', 'Bearer ' + token)
      .send({ message: 'Hello', anonymousId: mintGuestSessionId() });
    if (endpoint.endsWith('-stream')) expect(events(res).at(-1)).toMatchObject({ type: 'error', code: 'model_failed' });
    else expect(res.status).toBe(422);
    expect(mockModel).toHaveBeenCalledTimes(1);
    expect(await TripPlan.countDocuments()).toBe(0);
    expect(await AnonymousSession.countDocuments({ completedTurnCount: { $gt: 0 } })).toBe(0);
  });

test('guest model timeout is reported as a resolved failure without a retry or state write', async () => {
  mockModel.mockRejectedValue(Object.assign(new Error('sanitized timeout'), { code: 'responses_timeout' }));
  const res = await request(app).post('/api/ai/chat-anonymous-stream')
    .send({ message: 'Hello', anonymousId: mintGuestSessionId() });
  expect(events(res).at(-1)).toMatchObject({ type: 'error', code: 'responses_timeout', retryable: false,
    message: 'Trailie took too long to respond. Your saved trip was not changed.' });
  expect(mockModel).toHaveBeenCalledTimes(1);
  expect(await TripPlan.countDocuments()).toBe(0);
  expect(await AnonymousSession.countDocuments({ completedTurnCount: { $gt: 0 } })).toBe(0);
});

test('guest memory commits only after the model proposes a current-turn grounded update', async () => {
  const anonymousId = mintGuestSessionId();
  mockModel.mockResolvedValueOnce(tool('propose_trip_update', { response: 'Noted.', memory_updates: [
    { field: 'dates', value: { startDate: '2026-09-30', endDate: '2026-10-01', durationDays: 2 }, sourceQuote: 'September 30 through October 1' },
    { field: 'lodging', value: { baseTown: 'New town', booked: true }, sourceQuote: 'booked New town' },
  ] }));
  const res = await request(app).post('/api/ai/chat-anonymous').send({ anonymousId,
    message: 'September 30 through October 1; booked New town', metadata: { planningState: { dates: { startDate: '1900-01-01' } } } });
  expect(res.status).toBe(200);
  const state = res.body.data.planningState;
  expect(state.dates).toEqual({ startDate: '2026-09-30', endDate: '2026-10-01', durationDays: 2 });
  expect(state.lodging).toMatchObject({ baseTown: 'New town', booked: true });
  expect((await AnonymousSession.findOne({ anonymousId })).planningState).toEqual(state);
});

test('v2 SSE publishes a canonical terminal without pre-commit itinerary checkpoints', async () => {
  process.env.TRAILIE_TRANSPORT_V2 = 'true';
  const res = await request(app).post('/api/ai/chat-stream').set('Authorization', 'Bearer ' + token)
    .set('X-Trailie-Transport', 'v2').send({ message: 'Hello' });
  const wire = events(res);
  expect(wire.filter(e => e.type === 'itinerary_ready')).toHaveLength(0);
  const terminal = wire.find(e => e.type === 'response_finalized');
  expect(terminal).toBeDefined();
  expect(terminal.contentHash).toBe(hashPayload(terminal.content));
});

test('invalid runtime switch cannot fall into legacy handlers', async () => {
  process.env.TRAILIE_RUNTIME = 'invalid';
  const res = await request(app).post('/api/ai/chat').send({ message: 'Hello' });
  expect(res.status).toBe(503); expect(mockDependencies).not.toHaveBeenCalled();
});

test.each(['/CHAT/', '/CHAT-STREAM/', '/CHAT-ANONYMOUS/', '/CHAT-ANONYMOUS-STREAM/', '/PLAN-ITINERARY/'])(
  'Express route spelling %s cannot bypass model-first selection', async endpoint => {
    const res = await request(app).post('/api/ai' + endpoint).set('Authorization', 'Bearer ' + token).send({ message: 'Hello' });
    expect(res.status).toBe(200);
    expect(res.headers['x-trailie-runtime']).toBe('model_first');
    expect(mockModel).toHaveBeenCalledTimes(1);
  });

test.each(['/chat-stream', '/chat-anonymous-stream', '/plan-itinerary'])(
  '%s creates and patches the canonical plan while preserving other days', async endpoint => {
    const now = new Date();
    const evidence = normalizeEvidenceLocation({ evidenceId: 'place', entityId: 'place', topic: 'activities',
      claim: { identity: 'official-place', normalizedValue: { name: 'Recorded viewpoint', latitude: 40, longitude: -110 } },
      source: { provider: 'nps', sourceClass: 'official_owner' },
      observation: { observedAt: now.toISOString(), expiresAt: new Date(+now + 86400000).toISOString() } });
    const plan = { intro: 'Two days', days: [1, 2].map(n => ({ id: `d${n}`, dayNumber: n, label: 'A morning',
      stops: [{ id: `s${n}`, order: 1, type: 'viewpoint', name: 'Recorded viewpoint', evidenceRef: 'place', duration: 30,
        note: '', startTime: '' }] })) };
    mockExecute.mockResolvedValue({ status: 'fulfilled', evidence: [evidence], provider: 'nps' });
    mockModel.mockResolvedValueOnce(tool('read_travel', {})).mockResolvedValueOnce(tool('propose_trip_update', { response: 'Your trip.', plan }))
      .mockResolvedValueOnce(tool('read_travel', {})).mockResolvedValueOnce(tool('propose_trip_update', {
        response: 'The second day is shorter.', plan_patch: { response: 'Shortened.', operations: [
          { op: 'update_stop', dayNumber: 2, stopId: 's2', stop: { duration: 15 } },
        ] } }));
    const auth = endpoint === '/chat-stream';
    const send = async body => {
      let req = request(app).post('/api/ai' + endpoint);
      if (auth) req = req.set('Authorization', 'Bearer ' + token);
      const res = await req.send(body);
      expect(res.status).toBe(200);
      return endpoint.endsWith('-stream') ? events(res).find(e => e.type === 'done') : res.body.data;
    };
    const first = await send({ message: 'Create two days.' });
    expect(first.canonicalPlan.days).toHaveLength(2);
    expect(first.itineraryHash).toBe(hashPayload(first.itineraryData));
    const second = await send({ message: 'Shorten the second day.', anonymousId: first.anonymousId,
      metadata: { tripId: first.tripId, editScope: { dayNumbers: [2] } } });
    expect(second.canonicalPlan.days[0]).toEqual(first.canonicalPlan.days[0]);
    expect(second.canonicalPlan.days[1].stops[0].duration).toBe(15);
    expect(second.responseVersion).toBe(2);
    expect(second.canonicalPlan.itineraryHash).toBe(second.itineraryHash);
    expect(second.itineraryHash).toBe(hashPayload(second.itineraryData));
    fs.writeFileSync(path.resolve(__dirname, '../../../../artifacts/trailie-model-first-cutover-2026-09-30/contract-fixture.json'), JSON.stringify(second, null, 2));
  });

test.each(['/chat-stream', '/chat-anonymous-stream'])('%s disconnect aborts the model and leaves state/quota untouched', async endpoint => {
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  let aborted;
  const stopped = new Promise(resolve => { aborted = resolve; });
  mockModel.mockImplementation(({ signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { aborted(); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true });
    started();
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const controller = new AbortController();
  const anonymousId = mintGuestSessionId();
  try {
    const fetching = fetch(`http://127.0.0.1:${server.address().port}/api/ai${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ message: 'An offline cancellation', anonymousId }), signal: controller.signal,
    });
    await ready;
    const response = await fetching;
    expect(response.status).toBe(200);
    controller.abort(); await stopped;
    for (let i = 0; i < 100; i++) {
      const pending = await AnonymousSession.countDocuments({ anonymousId, 'turns.status': 'pending' });
      if (!pending) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(await TripPlan.countDocuments()).toBe(0);
    expect(await AnonymousSession.countDocuments({ anonymousId, completedTurnCount: { $gt: 0 } })).toBe(0);
    expect(await AnonymousSession.countDocuments({ anonymousId, 'turns.status': 'pending' })).toBe(0);
  } finally { controller.abort(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
