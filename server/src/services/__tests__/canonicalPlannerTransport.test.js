'use strict';
const { executePlanItineraryRequest } = require('../fastItineraryPlannerService');
const { createSemanticModelDispatcher } = require('../semanticModelDispatcher');

test('MCP planner delegates generation and preserves the canonical object instead of scheduling curated stops', async () => {
  const plan = { days: [{ dayNumber: 1, stops: [{ name: 'Source-bound place', duration: 90 }] }], itineraryHash: 'accepted' };
  const runTurn = jest.fn(async () => ({ result: { status: 'complete', canonicalPlan: plan, itineraryHash: 'accepted' }, content: 'Here is your trip.' }));
  const preparedContext = { planningState: { dates: { durationDays: 1 } }, resolvedMetadata: { parkCode: 'test' } };
  const response = await executePlanItineraryRequest({ body: { messages: [{ role: 'user', content: 'Plan a day.' }] } }, { preparedContext, runTurn });
  expect(runTurn).toHaveBeenCalledTimes(1);
  expect(response.canonicalPlan).toBe(plan);
  expect(response.itinerary).toBe(plan);
  expect(response.plannerMode).toBe('canonical');
});
test('MCP rejected generation cannot yield a new accepted itinerary', async () => {
  await expect(executePlanItineraryRequest({ body: {} }, { preparedContext: {}, runTurn: async () => ({
    result: { status: 'failed', terminalReason: 'provider_unavailable' }, content: '' }) })).rejects.toMatchObject({ code: 'provider_unavailable' });
});
test('semantic adapter is bounded and returns structured classifications through the injected provider interface', async () => {
  const execute = jest.fn(async () => ({ provider: 'openai', model: 'gpt-6-luna', outputText: '', toolCalls: [{ name: 'resolve_turn_semantics', input: { taskFamily: 'itinerary_refinement' } }], usage: {} }));
  const dispatch = createSemanticModelDispatcher({ getAdapters: () => ({ openai: { execute } }) });
  const result = await dispatch({ model: 'gpt-6-luna', reasoningEffort: 'low', input: { message: 'Make that easier.' },
    schema: { taskFamily: ['itinerary_refinement'], requestedArtifact: ['none'], destinationRelationship: ['single_destination'], constraints: ['pace'] } });
  expect(result.patch.taskFamily).toBe('itinerary_refinement');
  expect(execute).toHaveBeenCalledTimes(1);
  expect(execute.mock.calls[0][0]).toMatchObject({ model: 'gpt-6-luna', generation: { maxOutputTokens: 1200 }, requestMetadata: { purpose: 'semantic_understanding' } });
});

test('MCP publishes accepted state without retaining the draft plan', async () => {
  const state = { draftPlan: { days: [{ dayNumber: 1 }] }, lodging: { booked: true, baseTown: 'Base' } };
  const response = await executePlanItineraryRequest({ body: {} }, { preparedContext: { planningState: state },
    runTurn: async () => ({ result: { status: 'complete', canonicalPlan: { days: [{ dayNumber: 1, stops: [] }] } }, content: 'Accepted.' }) });
  expect(response.planningState.draftPlan).toBeUndefined();
  expect(response.planningState.lodging).toEqual(state.lodging);
  expect(state.draftPlan).toBeDefined();
});
