'use strict';
// Real routes, preparation, bridge, executor, validation, serialization, auth,
// guest ledger, and Mongo. Only external evidence and model I/O are replaced.
let mockMode = 'valid';
let mockBeforeDispatch = async () => {};
let mockAnonymousId;
let mockPriorStopName;
const mockDispatches = [];
const mockGeo = jest.fn(async () => ({ resolutionStatus: 'unresolved' }));
jest.mock('openai', () => jest.fn(() => ({ offline: true })));
jest.mock('../../services/geocodePlaceService', () => ({
  ...jest.requireActual('../../services/geocodePlaceService'),
  resolvePlaceFromMessage: (...args) => mockGeo(...args),
}));
jest.mock('../../services/providers/openaiResponsesAdapter', () => ({
  createOpenAIResponsesAdapter: () => {
    const execute = async request => {
      mockDispatches.push(request);
      await mockBeforeDispatch(request);
      if (/astra/i.test(request.model)) throw new Error('Astra forbidden by gate');
      if (mockMode === 'failure') throw Object.assign(new Error('offline injected failure'), { code: 'responses_unavailable' });
      if (mockMode === 'lodging') return { provider:'openai', model:request.model, outputText:'Your booking base is updated.', toolCalls:[], completionStatus:'complete', stopReason:'stop', usage:{inputTokens:0,outputTokens:0} };
      if (mockMode === 'refine') return { provider:'openai', model:request.model, outputText:'', toolCalls:[{name:'patch_itinerary',id:'offline-patch',input:{response:'A shorter riverside outing.',operations:[{op:'update_day',dayNumber:1,day:{dayNumber:1,label:'Zion',stops:[{name:mockPriorStopName,type:'hike',duration:90,note:'Follow the paved riverside trail.',timeWindow:'Morning'}]}}]}}], completionStatus:'complete', stopReason:'stop', usage:{inputTokens:0,outputTokens:0} };
      const semantic = request.tools?.some(t => t.name === 'resolve_turn_semantics');
      const input = semantic ? {} : { intro: 'A riverside outing in Zion.', days: [{ dayNumber: 1, label: 'Zion', stops: [{
        name: "Pa'rus Trail", type: 'trail', duration: mockMode === 'thin' ? 30 : 120,
        note: 'Follow the paved riverside trail.', timeWindow: 'Morning',
      }] }] };
      const tool = semantic ? 'resolve_turn_semantics' : 'create_itinerary';
      return { provider: 'openai', model: request.model, outputText: '', toolCalls: [{ name: tool, id: 'offline-call', input }],
        completionStatus: 'complete', stopReason: 'stop', refusal: null, usage: { inputTokens: 0, outputTokens: 0 } };
    };
    return { execute, stream: execute };
  },
}));
jest.mock('../../services/evidenceBrokerRuntime', () => ({
  createEvidenceBrokerRuntime: () => ({
    resolveEvidence: async ({ requirements, requestId }) => {
      const capture = require('../../../../artifacts/trailie-zion-day3-relaxed-live-2026-09-28/turn-1-evidence.json');
      const { buildEvidenceBundle } = require('../../utils/evidenceBundle');
      return buildEvidenceBundle({ requestId,
        resolutions: requirements.map(r => ({ requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: capture.evidence.map(e => e.evidenceId) })),
        candidates: capture.evidence });
    },
    dispatchEphemeral: async ({ ownership }) => ({ status: 'unsupported', normalizedCandidates: [], ownership }),
  }),
}));
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const TripPlan = require('../../models/TripPlan');
const AnonymousSession = require('../../models/AnonymousSession');
const bridge = require('../../services/trailieRouteBridge');
const run = jest.spyOn(bridge, 'runTrailieFromPreparedContext');
const ai = require('../ai');
const app = express(); app.use(express.json()); app.use('/api/ai', ai); app.use('/api/trips',require('../trips'));
const paths = ['chat', 'chat-stream', 'chat-anonymous', 'chat-anonymous-stream', 'plan-itinerary'];
let token;
beforeEach(async () => {
  mockMode = 'valid'; mockBeforeDispatch = async () => {}; mockAnonymousId = `guest_v2_${require('crypto').randomUUID()}`; mockDispatches.length = 0; run.mockClear(); mockGeo.mockReset().mockResolvedValue({resolutionStatus:'unresolved'});
  const user = await User.create({ name: 'Offline Gate', email: 'route-gate@example.com', password: 'offline-gate-password' });
  token = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET);
});
afterEach(() => { expect(mockDispatches.some(r => /astra/i.test(r.model))).toBe(false); });
function events(res) { return res.text.split('\n').filter(l => l.startsWith('data: ')).map(l => JSON.parse(l.slice(6))); }
function terminal(res, path) {
  if (!path.endsWith('stream')) return res.body.data || res.body;
  const rows = events(res);
  return rows.findLast(e => e.type === 'done' || e.type === 'response_finalized') || rows.at(-1);
}
async function submit(path, text = 'Give me one day in Zion.', extra = {}, dialect = null) {
  return request(app).post(`/api/ai/${path}`).set('Authorization', `Bearer ${token}`).set('User-Agent', 'offline-route-gate').set('X-Trailie-Transport', dialect || 'legacy').send({
    messages: [{ role: 'user', content: text }], anonymousId: mockAnonymousId,
    metadata: { parkCode: 'zion', parkName: 'Zion National Park', skipUserContext: true, ...extra },
  }).timeout({ response: 10000, deadline: 12000 });
}
test.each(paths)('%s reaches the real canonical executor and validates its generated plan', async path => {
  const res = await submit(path);
  const payload = terminal(res, path);
  console.log('ROUTE_GATE', path, JSON.stringify({ status:res.status, hasPlan:Boolean(payload?.canonicalPlan || payload?.itinerary), dispatches:mockDispatches.length }));
  expect(res.status).toBe(200);
  expect(run).toHaveBeenCalledTimes(1);
  const actual = await run.mock.results[0].value;
  expect(actual.result.status).toBe('complete');
  expect(actual.result.canonicalPlan.days[0].stops[0].name).toBe("Pa'rus Trail");
  expect(payload.canonicalPlan || payload.itinerary).toBeTruthy();
  expect(payload.itineraryHash).toBe(actual.result.itineraryHash);
  if (path.endsWith('stream')) expect(events(res).filter(e => e.type === 'error')).toHaveLength(0);
  if (path.includes('anonymous') || path === 'plan-itinerary') {
    const saved = await AnonymousSession.findOne({ anonymousId:payload.anonymousId });
    expect(saved.completedTurnCount).toBe(1);
    expect(saved.messages.filter(m => m.role === 'assistant')).toHaveLength(1);
    expect(saved.messages.at(-1).canonicalPlan.days).toEqual(actual.result.canonicalPlan.days);
  }
  expect(mockDispatches.length).toBeGreaterThan(0);
  expect(mockDispatches.every(r => !/astra/i.test(r.model))).toBe(true);
});


// Existing captured destination and trail, with only the planned duration changed.
test.each(paths)('%s rejects a thin sightseeing plan through the shared day-value gate', async path => {
  mockMode = 'thin';
  const res = await submit(path); const payload = terminal(res,path);
  expect(run).toHaveBeenCalledTimes(1);
  const {result} = await run.mock.results[0].value;
  expect(result.canonicalPlan).toBeNull();
  expect(result.attempts.flatMap(a => a.validationReasonCodes)).toContain('insufficient_day_coverage');
  expect(payload.canonicalPlan || payload.itinerary || null).toBeNull();
  expect(mockDispatches.every(r => !/astra/i.test(r.model))).toBe(true);
});
test.each(paths)('%s never publishes or persists a new plan after provider failure', async path => {
  mockMode = 'failure';
  const res = await submit(path); const payload = terminal(res,path);
  expect(run).toHaveBeenCalledTimes(1);
  expect((await run.mock.results[0].value).result.canonicalPlan).toBeNull();
  expect(payload?.canonicalPlan || payload?.itinerary || null).toBeNull();
  if (path.includes('anonymous') || path === 'plan-itinerary') {
    const stored = await AnonymousSession.findOne({anonymousId:mockAnonymousId});
    expect(stored.completedTurnCount).toBe(0);
    expect(stored.messages).toHaveLength(0);
  }
});
function lodgingState() {
  const state = require('../../utils/planningState').emptyPlanningState();
  state.destination = { ...state.destination, parkCode:'zion', parkName:'Zion National Park' };
  state.lodging = { ...state.lodging, type:'hotel', booked:true, baseTown:'Springdale', lat:37.1889,lon:-112.9988,
    stateOrRegion:'Utah',country:'US',resolutionStatus:'resolved',resolutionSource:'stored' };
  return state;
}
async function seedSession(state) {
  const session = await AnonymousSession.findOrCreateSession(mockAnonymousId,{ipAddress:'127.0.0.1',userAgent:'offline-route-gate',browserFingerprint:'offline-gate'});
  session.planningState = state; await session.save();
  return session;
}
const cleared = { baseTown:'St. George',booked:true,lat:null,lon:null,stateOrRegion:null,country:null,resolutionSource:null,resolutionStatus:'unresolved' };
test.each(['chat-anonymous','chat-anonymous-stream','plan-itinerary'])('%s persists relocation invalidation before generation, even if the answer fails', async path => {
  await seedSession(lodgingState()); mockMode='failure'; let observed=0;
  mockBeforeDispatch=async () => {
    const stored=await AnonymousSession.findOne({anonymousId:mockAnonymousId}).lean();
    expect(stored.planningState.lodging).toMatchObject(cleared); observed++;
  };
  await submit(path,'Actually, we changed the booking to St. George.');
  expect(observed).toBeGreaterThan(0);
  expect(run.mock.calls[0][0].preparedContext.planningState.lodging).toMatchObject(cleared);
  const durable=await AnonymousSession.findOne({anonymousId:mockAnonymousId}).lean();
  expect(durable.planningState.lodging).toMatchObject(cleared);
  expect(durable.completedTurnCount).toBe(0);
  expect(mockGeo).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({placeQuery:'St. George'}));
});
test.each(['chat','chat-stream'])('%s invalidates restored authenticated lodging state before generation', async path => {
  const user=await User.findOne({email:'route-gate@example.com'});
  const trip=await TripPlan.create({userId:user._id,parkCode:'zion',parkName:'Zion National Park',planningState:lodgingState()});
  mockMode='lodging';
  const res=await submit(path,'Actually, we changed the booking to St. George.',{tripId:String(trip._id)});
  expect(run.mock.calls[0][0].preparedContext.planningState.lodging).toMatchObject(cleared);
  const payload=terminal(res,path);
  expect(payload.planningState.lodging).toMatchObject(cleared);
  const saved=await request(app).put(`/api/trips/${trip._id}`).set('Authorization',`Bearer ${token}`)
    .send({planningState:payload.planningState,conversation:[{role:'assistant',content:payload.content,responseId:payload.responseId,responseVersion:payload.responseVersion,contentHash:payload.contentHash}]});
  expect(saved.status).toBe(200); expect(saved.body.success).toBe(true);
  expect((await TripPlan.findById(trip._id).lean()).planningState.lodging).toMatchObject(cleared);
});
test('newly grounded relocation accepts only the new identity geography', async () => {
  await seedSession(lodgingState()); mockMode='lodging';
  // Injected geography for the existing St. George scenario, not a new destination.
  const known={name:'St. George',lat:37.0965,lon:-113.5684,admin1:'Utah',country_code:'US'};
  mockGeo.mockResolvedValue({...known,resolutionStatus:'resolved',source:'offline-source-fixture'});
  await submit('chat-anonymous','Actually, we changed the booking to St. George.');
  const stored=await AnonymousSession.findOne({anonymousId:mockAnonymousId}).lean();
  expect(stored.planningState.lodging).toMatchObject({baseTown:'St. George',lat:known.lat,lon:known.lon,resolutionStatus:'resolved',resolutionSource:'offline-source-fixture'});
  expect(stored.planningState.lodging.lat).not.toBe(37.1889);
});

test.each(['chat-stream','chat-anonymous-stream'])('%s v2 checkpoint and terminal share the validated itinerary hash', async path => {
  process.env.TRAILIE_TRANSPORT_V2='true';
  try {
    const res=await submit(path,undefined,{},'v2'); const rows=events(res);
    const ready=rows.find(e=>e.type==='itinerary_ready'); const done=rows.find(e=>e.type==='response_finalized');
    expect(ready).toBeDefined(); expect(done).toBeDefined();
    expect(rows.filter(e=>e.type==='error')).toHaveLength(0);
    expect(ready.response.itineraryHash).toBe(done.itineraryHash);
    expect(ready.canonicalPlan.days).toEqual(done.canonicalPlan.days);
    const {result}=await run.mock.results[0].value;
    expect(done.itineraryHash).toBe(result.itineraryHash);
  } finally { delete process.env.TRAILIE_TRANSPORT_V2; }
});

test('/plan-itinerary follow-up restores the canonical accepted plan, not the legacy formData schedule', async () => {
  const initial=await submit('plan-itinerary');
  const first=terminal(initial,'plan-itinerary');
  mockPriorStopName=first.canonicalPlan.days[0].stops[0].name;
  expect(mockPriorStopName).toBeTruthy();
  await AnonymousSession.updateOne({anonymousId:mockAnonymousId},{$set:{'formData.lastItinerary':{days:[]}}});
  mockMode='refine';
  const next=await submit('plan-itinerary','Make day one more relaxed.');
  const second=terminal(next,'plan-itinerary');
  expect(second.hasItinerary).toBe(true);
  expect(second.canonicalPlan.days[0].stops[0].duration).toBe(90);
  expect(second.itineraryHash).not.toBe(first.itineraryHash);
  const state=await AnonymousSession.findOne({anonymousId:mockAnonymousId}).lean();
  expect(state.completedTurnCount).toBe(2);
  expect(state.messages.filter(m=>m.role==='assistant')).toHaveLength(2);
  expect(state.messages[1].canonicalPlan.days[0].stops[0].duration).toBe(120);
  expect(state.messages[3].canonicalPlan.days[0].stops[0].duration).toBe(90);
  expect(state.planningState.draftPlan ?? null).toBeNull();
});
