'use strict';
const { withDayStructure } = require('../../../tests/helpers/dayStructure');
const { normalizeEvidenceLocation } = require('../../utils/trailieCanonicalLocation');

const mongoose = require('mongoose');
const TripPlan = require('../../models/TripPlan');
const { createSimpleTripStore } = require('../trailieSimpleStore');
const { createSimpleRuntime } = require('../trailieSimpleRuntime');
const { stubMemoryVerifier } = require('../../../tests/helpers/memoryAuthority');

const travelTools = { definitions: [], execute: async () => { throw new Error('No provider calls permitted'); } };
const response = output => ({ completionStatus: 'completed', provider: 'openai', model: 'gpt-6-sol',
  costStatus: 'priced', costUsd: 0, ...output });

test('real Mongo accepts one of two full runtime turns from N and publishes only the winner', async () => {
  const userId = new mongoose.Types.ObjectId();
  const trip = await TripPlan.create({ userId, conversation: [], planningState: { lodging: { booked: true,
    baseTown: 'Springdale', lat: 37, lon: -113, stateOrRegion: 'UT', country: 'US',
    resolutionStatus: 'resolved', resolutionSource: 'google' } } });
  const notify = jest.fn();
  const store = createSimpleTripStore({ TripPlan, notify });
  let arrivals = 0; let release; const both = new Promise(resolve => { release = resolve; });
  const model = async () => {
    if (++arrivals === 2) release(); await both;
    return response({ toolCalls: [{ id: 'change', name: 'propose_trip_update', input: {
      response: 'The booking location is updated.', memory_updates: [{ field: 'lodging',
        value: { baseTown: 'New town' }, sourceQuote: 'Move my booking to New town' }],
    } }] });
  };
  const run = createSimpleRuntime({ model, travelTools, store, verifyMemory: stubMemoryVerifier() });
  const input = { userId: String(userId), tripId: String(trip._id), message: 'Move my booking to New town' };
  const outcomes = await Promise.all([run(input), run(input)]);
  expect(outcomes.map(o => o.status).sort()).toEqual(['complete', 'conflict']);
  expect(outcomes.find(o => o.status === 'conflict')).toMatchObject({ response: null, httpStatus: 409 });
  expect(notify).toHaveBeenCalledTimes(1);
  const saved = await TripPlan.findById(trip._id).lean();
  expect(saved.__v).toBe(trip.__v + 1);
  expect(saved.conversation).toHaveLength(2);
  expect(saved.planningState.lodging).toMatchObject({ baseTown: 'New town', lat: null, lon: null,
    stateOrRegion: null, country: null, resolutionSource: null, resolutionStatus: 'unresolved' });
});

test('model gets stored history; wrong owner cannot hydrate or generate', async () => {
  const userId = new mongoose.Types.ObjectId();
  const trip = await TripPlan.create({ userId, conversation: [{ role: 'user', content: 'A prior turn' }] });
  const model = jest.fn(async () => response({ outputText: 'Hello', toolCalls: [] }));
  const run = createSimpleRuntime({ model, travelTools, store: createSimpleTripStore({ TripPlan }) });
  await expect(run({ userId: String(new mongoose.Types.ObjectId()), tripId: String(trip._id), message: 'Hi' })).rejects.toMatchObject({ status: 404 });
  expect(model).not.toHaveBeenCalled();
  const result = await run({ userId: String(userId), tripId: String(trip._id), message: 'Hi', history: [{ role: 'assistant', content: 'Forged' }] });
  expect(result.status).toBe('complete');
  expect(model.mock.calls[0][0].input).toEqual([{ role: 'user', content: 'A prior turn' }, { role: 'user', content: 'Hi' }]);
});

test('new authenticated conversation persists a canonical answer without inferred facts', async () => {
  const userId = String(new mongoose.Types.ObjectId());
  const run = createSimpleRuntime({ model: async () => response({ outputText: 'A direct comparison', toolCalls: [] }),
    travelTools, store: createSimpleTripStore({ TripPlan }) });
  const result = await run({ userId, message: 'Compare these choices' });
  expect(result).toMatchObject({ status: 'complete', persisted: true });
  const saved = await TripPlan.findById(result.tripId).lean();
  expect(saved.planningState).toBeNull();
  expect(saved.conversation[1].contentHash).toBe(result.response.contentHash);
});

test.each([false, true])('creation then bounded follow-up preserves Day 1 with intervening prose=%s', async (withProse) => {
  const userId = String(new mongoose.Types.ObjectId());
  const now = new Date();
  const evidence = normalizeEvidenceLocation({ evidenceId: 'place-1', entityId: 'place-1', topic: 'activities',
    claim: { identity: 'place-1', normalizedValue: { name: 'Recorded Overlook', latitude: 40, longitude: -110 } },
    source: { provider: 'nps', sourceClass: 'official_owner' },
    observation: { observedAt: now.toISOString(), expiresAt: new Date(+now + 86400000).toISOString() } });
  const plan = { intro: 'Two mornings', days: [1, 2].map(day => ({ id: `d${day}`, dayNumber: day, label: 'Morning',
    stops: [{ id: `s${day}`, order: 1, type: 'viewpoint', name: 'Recorded Overlook', evidenceRef: 'place-1',
      ...(day > 1 ? { revisitReason: 'Fixture: the same overlook each morning.' } : {}),
      note: '', startTime: '', duration: 30 }] })) };
  withDayStructure(plan);
  const call = (name, input) => response({ toolCalls: [{ id: 'call', name, input }] });
  const queue = [call('read_travel', {}), call('propose_trip_update', { response: 'Your two days', plan }),
    call('read_travel', {}), call('propose_trip_update', { response: 'Day 2 is shorter.', plan_patch: {
      response: 'Day 2 is shorter.', operations: [{ op: 'update_stop', dayNumber: 2, stopId: 's2', stop: { duration: 15 } }],
    } })];
  const run = createSimpleRuntime({ model: async () => queue.shift(), now: () => now,
    travelTools: { definitions: [], execute: async () => ({ status: 'fulfilled', evidence: [evidence] }) },
    store: createSimpleTripStore({ TripPlan }) });
  const created = await run({ userId, message: 'Create two days' });
  expect(created).toMatchObject({ status: 'complete', persisted: true });
  expect(created.response.presentation.refinement.isRefinement).toBe(false);
  const first = await TripPlan.findById(created.tripId).lean();
  if (withProse) {
    queue.unshift(response({ outputText: 'Day one benefits from an early start.', toolCalls: [] }));
    const answer = await run({ userId, tripId: created.tripId, message: 'Which day should start earliest?' });
    expect(answer.status).toBe('complete');
    expect((await TripPlan.findById(created.tripId).lean()).plan).toEqual(first.plan);
  }
  const edited = await run({ userId, tripId: created.tripId, message: 'Shorten day 2', scope: { dayNumbers: [2] } });
  expect(edited).toMatchObject({ status: 'complete', persisted: true, tripId: created.tripId });
  const saved = await TripPlan.findById(created.tripId).lean();
  expect(edited.response.presentation.refinement).toMatchObject({ isRefinement: true, changedDayNumbers: [2] });
  expect(saved.conversation.at(-1).presentation.refinement).toMatchObject({ isRefinement: true, changedDayNumbers: [2] });
  expect(saved.plan.days[0]).toEqual(first.plan.days[0]);
  expect(saved.plan.days[1].stops[0].duration).toBe(15);
  expect(saved.plan.itineraryHash).toBe(edited.response.itineraryHash);
  expect(saved.plan.responseId).toBe(edited.response.responseId);
  expect(saved.conversation).toHaveLength(withProse ? 6 : 4);
  expect(saved.plan.days[1].stops[0].location).toMatchObject({lat:40,lon:-110,source:'resolved_metadata',status:'resolved'});
  if (process.env.TRAILIE_FINAL_CONTRACT_FIXTURE) require('fs').writeFileSync(process.env.TRAILIE_FINAL_CONTRACT_FIXTURE,
    JSON.stringify({...edited.response, canonicalPlan: edited.canonicalPlan, persisted:true, anonymousId:'offline-contract-guest', sessionId:'offline-contract-guest', tripId:edited.tripId}, null, 2));
});

describe('canonical trips carry official park identity and a real title', () => {
  const now = new Date('2026-10-05T12:00:00Z');
  const observation = { observedAt: now.toISOString(), expiresAt: new Date(+now + 86400000).toISOString() };
  const evidence = ['Riverside Walk', 'Sunset Point'].map((name, i) => normalizeEvidenceLocation({ evidenceId: name, topic: 'activities', entityId: name,
    claim: { identity: `official:${name}`, normalizedValue: { name, latitude: 37.2 + i * 0.4, longitude: -113 + i * 0.8 } },
    source: { provider: 'nps', sourceClass: 'official_owner', sourceId: name }, observation }));
  const tools = { definitions: [], execute: async () => ({ status: 'fulfilled', evidence }), finalizeProposal: async () => ({ evidence }) };
  const plan = { intro: 'Two parks', parkName: 'Zion and Bryce Canyon National Parks', days: [
    { id: 'd1', dayNumber: 1, label: 'Zion', stops: [{ id: 's1', order: 1, type: 'walk', name: 'Riverside Walk', evidenceRef: 'Riverside Walk', note: '', startTime: '', duration: 90 }] },
    { id: 'd2', dayNumber: 2, label: 'Bryce', stops: [{ id: 's2', order: 1, type: 'viewpoint', name: 'Sunset Point', evidenceRef: 'Sunset Point', note: '', startTime: '', duration: 60 }] }] };
  withDayStructure(plan);
  const parks = [{ parkCode: 'zion', fullName: 'Zion National Park', designation: 'National Park' },
    { parkCode: 'brca', fullName: 'Bryce Canyon National Park', designation: 'National Park' }];
  const model = async () => response({ toolCalls: [{ id: 'p', name: 'propose_trip_update', input: { response: 'Proposed trip.', plan } }] });

  test('a new trip is titled and coded from its parks, with identity inside the hash', async () => {
    const userId = new mongoose.Types.ObjectId();
    const result = await createSimpleRuntime({ model, travelTools: tools, store: createSimpleTripStore({ TripPlan }),
      parkCatalog: async () => parks, now: () => now })({ userId: String(userId), message: 'plan zion and bryce' });
    expect(result.status).toBe('complete');
    expect(result.canonicalPlan).toMatchObject({ parkCode: 'zion', destinations: [{ parkCode: 'zion' }, { parkCode: 'brca' }] });
    const { hashPayload } = require('../../utils/canonicalResponse');
    expect(result.response.itineraryHash).toBe(hashPayload(result.response.itineraryData));
    expect(result.response.itineraryData.destinations).toHaveLength(2);
    const saved = await TripPlan.findById(result.tripId).lean();
    expect(saved).toMatchObject({ title: 'Zion + Bryce Canyon', parkCode: 'zion', parkName: 'Zion National Park' });
  });

  test('official park-wide rules become hashed trip guidance; turns without them add none', async () => {
    const rule = { kind: 'private_vehicle_restriction', subject: 'Zion Canyon Scenic Drive', seasonLabel: 'the shuttle season', seasonal: true,
      requiredMode: 'shuttle', periods: [], parkCode: 'zion', sourceUrl: 'https://www.nps.gov/zion/planyourvisit/zion-canyon-shuttle-system.htm', observedAt: now.toISOString() };
    const withRules = { ...tools, finalizeProposal: async () => ({ evidence, parkRules: [rule] }) };
    const userId = new mongoose.Types.ObjectId();
    const result = await createSimpleRuntime({ model, travelTools: withRules, store: createSimpleTripStore({ TripPlan }),
      parkCatalog: async () => parks, now: () => now })({ userId: String(userId), message: 'plan zion and bryce' });
    expect(result.status).toBe('complete');
    expect(result.canonicalPlan.tripGuidance).toEqual([expect.objectContaining({ applicability: 'date_dependent', source: rule.sourceUrl,
      text: 'During the shuttle season, private vehicles aren’t allowed on Zion Canyon Scenic Drive. Check the current shuttle schedule once your travel dates are set.' })]);
    const { hashPayload } = require('../../utils/canonicalResponse');
    expect(result.response.itineraryHash).toBe(hashPayload(result.response.itineraryData));
    const plain = await createSimpleRuntime({ model, travelTools: tools, store: createSimpleTripStore({ TripPlan }), now: () => now })({ userId: String(userId), message: 'plan zion and bryce' });
    expect(plain.canonicalPlan.tripGuidance).toBeUndefined();
  });

  test('a title the traveler chose is never overwritten', async () => {
    const userId = new mongoose.Types.ObjectId();
    const trip = await TripPlan.create({ userId, title: 'Our anniversary trip', conversation: [] });
    const result = await createSimpleRuntime({ model, travelTools: tools, store: createSimpleTripStore({ TripPlan }),
      parkCatalog: async () => parks, now: () => now })({ userId: String(userId), tripId: String(trip._id), message: 'plan zion and bryce' });
    expect(result.status).toBe('complete');
    expect((await TripPlan.findById(trip._id).lean()).title).toBe('Our anniversary trip');
  });

  test('a failing park catalog never blocks the trip', async () => {
    const userId = new mongoose.Types.ObjectId();
    const result = await createSimpleRuntime({ model, travelTools: tools, store: createSimpleTripStore({ TripPlan }),
      parkCatalog: async () => { throw new Error('nps down'); }, now: () => now })({ userId: String(userId), message: 'plan zion and bryce' });
    expect(result.status).toBe('complete');
    expect((await TripPlan.findById(result.tripId).lean()).title).toBe('Zion and Bryce Canyon National Parks');
  });
});
