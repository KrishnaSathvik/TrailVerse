'use strict';

const { createSimpleRuntime } = require('../trailieSimpleRuntime');
const { validateSimpleMutation } = require('../trailieSimpleGuard');
const { normalizeEvidenceLocation } = require('../../utils/trailieCanonicalLocation');
const { createMemoryAuthorityVerifier } = require('../trailieMemoryAuthority');
const { stubMemoryVerifier } = require('../../../tests/helpers/memoryAuthority');

const now = new Date('2026-10-05T12:00:00Z');
const generation = value => ({ completionStatus: 'completed', outputText: '', toolCalls: [], costStatus: 'priced', costUsd: 0, ...value });
const propose = input => generation({ toolCalls: [{ id: 'proposal', name: 'propose_trip_update', input }] });
const update = message => ({ field: 'transportation', value: { rentalCar: true }, sourceQuote: message });
const plan = () => ({ intro: 'Two places', days: [{ id: 'd1', dayNumber: 1, label: 'Day 1', stops: ['A', 'B'].map((name, i) => ({
  id: `s${i}`, order: i + 1, type: 'viewpoint', name, evidenceRef: name, note: '', startTime: '', duration: 30,
})) }] });
const observation = { observedAt: now.toISOString(), expiresAt: new Date(+now + 86400000).toISOString() };
const evidence = ['A', 'B'].map((name, i) => normalizeEvidenceLocation({ evidenceId: name, topic: 'activities', entityId: name,
  claim: { identity: `official:${name}`, normalizedValue: { name, latitude: 37 + i * 0.01, longitude: -113 } },
  source: { provider: 'nps', sourceClass: 'official_owner', sourceId: name }, observation }));
evidence.push({ evidenceId: 'route', topic: 'driving_time', claim: { normalizedValue: { durationSeconds: 600, distanceMeters: 1000 } },
  source: { provider: 'google_maps', sourceClass: 'commercial_structured' }, observation,
  scope: { route: { originEntityId: 'A', destinationEntityId: 'B', travelMode: 'driving' } } });
const tools = () => ({ definitions: [], execute: jest.fn(async () => ({ status: 'fulfilled', evidence })),
  finalizeProposal: jest.fn(async () => ({ evidence })) });

test.each(['unsupported', 'contradicted', 'hypothetical', 'conditional', 'uncertain'])('rejected car memory (%s) cannot propagate to a canonical driving edge', async relationship => {
  const message = 'I want to visit Zion.';
  const verifyMemory = jest.fn(stubMemoryVerifier(relationship));
  const { receipt } = await stubMemoryVerifier(relationship)({ message, updates: [update(message)] });
  const direct = validateSimpleMutation({ message, evidence, now, memoryAuthority: receipt,
    proposal: { response: 'Proposed', memory_updates: [update(message)], plan: plan() } });
  expect(direct.ok).toBe(false);
  expect(direct.planningState).toEqual({});
  expect(direct.plan.days[0].travelEdges[0]).toMatchObject({ status: 'unverified', durationSeconds: null, modeIntent: null });
  const model = jest.fn()
    .mockResolvedValueOnce(propose({ response: 'Proposed', memory_updates: [update(message)], plan: plan() }))
    .mockResolvedValueOnce(propose({ response: 'Two places; transport remains unconfirmed.', plan: plan() }));
  const travelTools = tools();
  const result = await createSimpleRuntime({ model, travelTools, verifyMemory, now: () => now })({ message });
  expect(result.status).toBe('complete');
  expect(result.planningState).toEqual({});
  expect(result.mutation.plan.days[0].travelEdges[0]).toMatchObject({ status: 'unverified', durationSeconds: null });
  expect(travelTools.finalizeProposal).toHaveBeenCalledTimes(1);
  expect(verifyMemory).toHaveBeenCalledTimes(1);
});

test('explicit verified rental availability permits provider-grounded driving evidence', async () => {
  const message = 'We’re renting a car.';
  const verifyMemory = jest.fn(stubMemoryVerifier());
  const result = await createSimpleRuntime({ model: async () => propose({ response: 'A driving itinerary.',
    memory_updates: [update(message)], plan: plan() }), travelTools: tools(), verifyMemory, now: () => now })({ message });
  expect(result.status).toBe('complete');
  expect(result.planningState.transportation.rentalCar).toBe(true);
  expect(result.mutation.plan.days[0].travelEdges[0]).toMatchObject({ status: 'verified', durationSeconds: 600,
    travelMode: 'driving', source: { evidenceId: 'route' } });
  expect(verifyMemory).toHaveBeenCalledTimes(1);
});

test('an explicit negative supersedes old car availability and prevents driving', async () => {
  const message = 'We won’t have a car.';
  const result = await createSimpleRuntime({ model: async () => propose({ response: 'Transport remains unconfirmed.',
    memory_updates: [{ ...update(message), value: { rentalCar: false } }], plan: plan() }),
  travelTools: tools(), verifyMemory: stubMemoryVerifier(), now: () => now })({ message,
    snapshot: { planningState: { transportation: { mode: 'drive', rentalCar: true } } } });
  expect(result.planningState.transportation.rentalCar).toBe(false);
  expect(result.mutation.plan.days[0].travelEdges[0].status).toBe('unverified');
});

test('memory-only rejection continues conversation and persists only the unchanged state', async () => {
  const message = 'Maybe we’ll rent a car.';
  const planningState = { preferences: { pace: 'relaxed' } };
  const store = { load: async () => ({ planningState }), commit: jest.fn(async () => ({ ok: true })) };
  const model = jest.fn().mockResolvedValueOnce(propose({ response: 'I saved a rental car.', memory_updates: [update(message)] }))
    .mockResolvedValueOnce(generation({ outputText: 'We can compare the car and shuttle options.' }));
  const result = await createSimpleRuntime({ model, travelTools: tools(), store, verifyMemory: stubMemoryVerifier('hypothetical') })({ message });
  expect(result.status).toBe('complete');
  expect(result.response.content).toBe('We can compare the car and shuttle options.');
  expect(result.planningState).toEqual(planningState);
  expect(store.commit).toHaveBeenCalledTimes(1);
  expect(store.commit.mock.calls[0][0].mutation).toBeNull();
});

test('rejected memory continues safely even if no correction opportunity remains', async () => {
  const message = 'Maybe we’ll rent a car.';
  const result = await createSimpleRuntime({ model: async () => propose({ response: 'Saved.', memory_updates: [update(message)] }),
    travelTools: tools(), maxCorrections: 0, verifyMemory: stubMemoryVerifier('hypothetical') })({ message });
  expect(result.status).toBe('complete');
  expect(result.mutation).toBeNull();
  expect(result.response.content).not.toBe('Saved.');
  expect(result.planningState).toBeNull();
});

test('verifier timeout/failure rejects the write with no retry or invented success', async () => {
  const message = 'We have a car.';
  const verificationModel = jest.fn(async () => { throw new Error('timeout'); });
  const verifyMemory = createMemoryAuthorityVerifier({ model: verificationModel });
  const call = propose({ response: 'Saved', memory_updates: [update(message)] });
  const model = jest.fn().mockResolvedValue(call);
  const result = await createSimpleRuntime({ model, travelTools: tools(), verifyMemory })({ message });
  expect(result.status).toBe('complete');
  expect(result.planningState).toBeNull();
  expect(result.mutation).toBeNull();
  expect(verificationModel).toHaveBeenCalledTimes(1);
  expect(model).toHaveBeenCalledTimes(2);
});

test('correction cannot use an earlier approval to change values or trigger another verifier call', async () => {
  const message = 'We’re renting a car.';
  const verifyMemory = jest.fn(stubMemoryVerifier());
  const badPlan = plan(); badPlan.days[0].stops[0].name = 'Invented Place';
  const model = jest.fn().mockResolvedValueOnce(propose({ response: 'Proposed', memory_updates: [update(message)], plan: badPlan }))
    .mockResolvedValueOnce(propose({ response: 'Changed', memory_updates: [{ ...update(message), value: { rentalCar: false } }], plan: plan() }));
  const result = await createSimpleRuntime({ model, travelTools: tools(), verifyMemory, now: () => now })({ message });
  expect(result.status).toBe('mutation_rejected');
  expect(verifyMemory).toHaveBeenCalledTimes(1);
  expect(result.telemetry.mutationIssues).toContain('memory_authority_unverified');
});

test('ordinary conversation and plan-only turns never invoke semantic verification', async () => {
  const verifyMemory = jest.fn();
  for (const answer of [generation({ outputText: 'Hello' }), propose({ response: 'Visit two places.', plan: plan() })]) {
    const result = await createSimpleRuntime({ model: async () => answer, travelTools: tools(), verifyMemory, now: () => now })({ message: 'Plan a day' });
    expect(result.status).toBe('complete');
  }
  expect(verifyMemory).not.toHaveBeenCalled();
});

test('cancellation while verifying never persists a response or fact', async () => {
  const controller = new AbortController();
  const message = 'We’re renting a car.';
  const verifyMemory = async args => { const result = await stubMemoryVerifier()(args); controller.abort(); return result; };
  const store = { load: async () => ({}), commit: jest.fn() };
  const result = await createSimpleRuntime({ model: async () => propose({ response: 'Updated', memory_updates: [update(message)] }),
    travelTools: tools(), verifyMemory, store })({ message, signal: controller.signal });
  expect(result.status).toBe('cancelled');
  expect(store.commit).not.toHaveBeenCalled();
});

test('verifier usage/cost are included without changing the bounded planning model budget', async () => {
  const message = 'We’re renting a car.';
  const verifyMemory = async args => ({ ...await stubMemoryVerifier()(args), generation: {
    costStatus: 'priced', costUsd: 0.001, usage: { inputTokens: 30, outputTokens: 10 },
    modelAttempt: { status: 'success' },
  } });
  const result = await createSimpleRuntime({ model: async () => propose({ response: 'Noted', memory_updates: [update(message)] }),
    travelTools: tools(), verifyMemory })({ message });
  expect(result.telemetry.modelCalls).toBe(1);
  expect(result.telemetry.modelCostUsd).toBe(0.001);
  expect(result.telemetry.calls.find(call => call.purpose === 'memory_verification').usage).toEqual({ inputTokens: 30, outputTokens: 10 });
});
