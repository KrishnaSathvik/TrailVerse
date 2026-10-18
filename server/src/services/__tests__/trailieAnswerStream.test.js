'use strict';

const { createSimpleRuntime } = require('../trailieSimpleRuntime');
const { createSimpleModel } = require('../trailieSimpleModel');
const { ANSWER_TOOL, answerStreamEnabled, createAnswerCollector } = require('../../utils/trailieAnswerStream');
const { createTrailieTransportAdapter } = require('../../utils/trailieTransportAdapter');

const generation = extra => ({ completionStatus: 'completed', outputText: '', toolCalls: [], costStatus: 'priced', costUsd: 0, ...extra });
const tool = name => generation({ toolCalls: [{ id: 'call-1', name, input: {} }] });
const handoff = () => tool(ANSWER_TOOL.name);
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
function harness({ outputs = [], snapshot = {}, commit = async () => ({ ok: true }), research = { status: 'fulfilled', evidence: [{ evidenceId: 'fact' }], unresolved: [] } } = {}) {
  const model = jest.fn();
  outputs.forEach(output => typeof output === 'function' ? model.mockImplementationOnce(output) : model.mockResolvedValueOnce(output));
  const store = { load: async () => snapshot, commit: jest.fn(commit) };
  const travelTools = { definitions: [{ name: 'read_travel' }], execute: jest.fn(async () => research) };
  const events = [];
  const run = createSimpleRuntime({ model, store, travelTools });
  return { model, store, travelTools, events, run: options => run({ message: 'Compare two parks.', onAnswerEvent: event => events.push(event), ...options }) };
}
const streamedAnswer = async ({ tools, toolChoice, onTextDelta }) => {
  expect(tools).toEqual([]);
  expect(toolChoice).toBe('none');
  onTextDelta('A useful ');
  onTextDelta('comparison.');
  return generation({ outputText: 'A useful comparison.' });
};

test('selection completes before any readable text; two calls, provisional text before commit, final only after commit', async () => {
  const decision = deferred(), committing = deferred(), releaseCommit = deferred();
  const fixture = harness({ outputs: [() => decision.promise, streamedAnswer], commit: async () => {
    committing.resolve(); await releaseCommit.promise; return { ok: true };
  } });
  let finished = false;
  const pending = fixture.run().then(result => { finished = true; return result; });
  await Promise.resolve();
  expect(fixture.events).toEqual([]);
  decision.resolve(handoff());
  await committing.promise;
  expect(finished).toBe(false);
  expect(fixture.events).toEqual([{ type: 'started' }, { type: 'delta', content: 'A useful ' }, { type: 'delta', content: 'comparison.' }]);
  expect(fixture.store.commit.mock.calls[0][0].mutation).toBeNull();
  releaseCommit.resolve();
  const result = await pending;
  expect(result).toMatchObject({ status: 'complete', persisted: true, telemetry: { modelCalls: 2, answerStreaming: true, toolCalls: 0 } });
  expect(result.telemetry.answerStream.additionalModelCalls).toBe(1);
  expect(result.telemetry.answerStream.firstTextMs).toBeGreaterThanOrEqual(result.telemetry.answerStream.handoffMs);
  expect(fixture.model).toHaveBeenCalledTimes(2);
});

test('research finishes before handoff and streaming: three calls, one research phase', async () => {
  const fixture = harness({ outputs: [tool('read_travel'), handoff(), streamedAnswer] });
  const result = await fixture.run();
  expect(result.telemetry).toMatchObject({ modelCalls: 3, toolCalls: 1 });
  expect(fixture.model.mock.calls[1][0].input.at(-1).type).toBe('function_call_output');
  expect(fixture.travelTools.execute).toHaveBeenCalledTimes(1);
  expect(fixture.events[0]).toEqual({ type: 'started' });
});

test.each(['read_travel', 'propose_trip_update', ANSWER_TOOL.name])('late %s cannot execute, commit or continue the turn', async name => {
  const fixture = harness({ outputs: [handoff(), async options => { options.onTextDelta('Provisional'); return tool(name); }] });
  expect(await fixture.run()).toMatchObject({ status: 'invalid_tool_batch' });
  expect(fixture.model).toHaveBeenCalledTimes(2);
  expect(fixture.store.commit).not.toHaveBeenCalled();
  expect(fixture.travelTools.execute).not.toHaveBeenCalled();
  expect(fixture.events.at(-1)).toEqual({ type: 'withdrawn' });
});

test.each(['unavailable', 'unresolved'])('failed research (%s) remains buffered with no added round', async status => {
  const fixture = harness({ research: { status, evidence: [], unresolved: [{}] }, outputs: [tool('read_travel'), generation({ outputText: 'I could not confirm that.' })] });
  expect((await fixture.run()).telemetry.modelCalls).toBe(2);
  expect(fixture.model.mock.calls[1][0].tools.map(value => value.name)).not.toContain(ANSWER_TOOL.name);
  expect(fixture.events).toEqual([]);
});

test('unsolicited handoff after partial research is rejected', async () => {
  const fixture = harness({ research: { status: 'fulfilled', evidence: [{}], unresolved: [{}] }, outputs: [tool('read_travel'), handoff()] });
  expect((await fixture.run()).status).toBe('invalid_tool_batch');
  expect(fixture.events).toEqual([]);
});

test('flag-off callers keep one direct answer call and unchanged tool list', async () => {
  const fixture = harness({ outputs: [generation({ outputText: 'Hello.' })] });
  expect((await fixture.run({ onAnswerEvent: null })).telemetry.modelCalls).toBe(1);
  expect(fixture.model.mock.calls[0][0].tools.map(value => value.name)).toEqual(['read_travel', 'propose_trip_update']);
  expect(fixture.events).toEqual([]);
});

test('declining the offered handoff does not add a model call', async () => {
  const fixture = harness({ outputs: [generation({ outputText: 'Hello.' })] });
  expect((await fixture.run()).telemetry.modelCalls).toBe(1);
  expect(fixture.events).toEqual([]);
});

test('trip creation retains one guarded proposal call with or without the experiment', async () => {
  const proposal = generation({ toolCalls: [{ id: 'proposal', name: 'propose_trip_update', input: {
    response: 'An arrival day.', plan: { intro: 'Settle in.', days: [{ id: 'day-1', dayNumber: 1, label: 'Arrival', stops: [],
      dayStructure: { type: 'arrival', startPeriod: 'afternoon', endPeriod: 'evening', summary: 'Settle in.',
        blocks: [{ kind: 'arrival', periods: ['afternoon', 'evening'], label: 'Arrive', note: 'Rest.', stopIds: [] }] } }] },
  } }] });
  for (const enabled of [false, true]) {
    const fixture = harness({ outputs: [proposal] });
    fixture.travelTools.finalizeProposal = async () => ({ evidence: [{ evidenceId: 'us-base', topic: 'destination_identity',
      claim: { normalizedValue: { countryCode: 'US' } }, source: { provider: 'named_place', sourceClass: 'commercial_structured' },
      observation: { observedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() } }] });
    const result = await fixture.run(enabled ? {} : { onAnswerEvent: null });
    expect(result).toMatchObject({ status: 'complete', telemetry: { modelCalls: 1, mutationAccepted: true } });
    expect(fixture.events).toEqual([]);
    expect(fixture.store.commit.mock.calls[0][0].mutation.plan.days).toHaveLength(1);
  }
});

test('a rejected proposal cannot switch to streaming during correction', async () => {
  const fixture = harness({ outputs: [generation({ toolCalls: [{ id: 'proposal', name: 'propose_trip_update', input: { response: 'Invalid', plan: { days: [] } } }] }), handoff()] });
  expect((await fixture.run()).status).toBe('invalid_tool_batch');
  expect(fixture.model.mock.calls[1][0].tools.map(value => value.name)).not.toContain(ANSWER_TOOL.name);
  expect(fixture.events).toEqual([]);
  expect(fixture.store.commit).not.toHaveBeenCalled();
});

test.each([{ plan: { days: [{}] } }, {}])('existing plans and explicit edit scopes cannot hand off', async snapshot => {
  const fixture = harness({ snapshot, outputs: [handoff()] });
  expect((await fixture.run(snapshot.plan ? {} : { scope: { dayNumbers: [1] } })).status).toBe('invalid_tool_batch');
  expect(fixture.events).toEqual([]);
  expect(fixture.store.commit).not.toHaveBeenCalled();
});

test('draft preview and answer handoff are mutually exclusive', async () => {
  const fixture = harness({ outputs: [handoff()] });
  expect((await fixture.run({ onPreview: jest.fn() })).status).toBe('invalid_tool_batch');
  expect(fixture.events).toEqual([]);
});

test.each(['conflict', 'failure'])('commit %s withdraws text without an accepted response', async status => {
  const fixture = harness({ outputs: [handoff(), streamedAnswer], commit: async () => ({ ok: false, status: status === 'conflict' ? 409 : 503 }) });
  expect((await fixture.run()).status).not.toBe('complete');
  expect(fixture.events.at(-1)).toEqual({ type: 'withdrawn' });
});

test.each(['failed', 'incomplete', 'refused'])('%s generation withdraws and never persists', async status => {
  const fixture = harness({ outputs: [handoff(), async options => {
    options.onTextDelta('Unconfirmed');
    if (status === 'failed') throw new Error('Disconnected');
    return generation({ outputText: 'Unconfirmed', completionStatus: status === 'incomplete' ? 'incomplete' : 'completed', refusal: status === 'refused' });
  }] });
  expect((await fixture.run()).status).not.toBe('complete');
  expect(fixture.store.commit).not.toHaveBeenCalled();
  expect(fixture.events.at(-1)).toEqual({ type: 'withdrawn' });
});

test('cancellation prevents late text and persistence', async () => {
  const controller = new AbortController();
  const fixture = harness({ outputs: [handoff(), async options => {
    options.onTextDelta('Before cancellation'); controller.abort(); options.onTextDelta('After cancellation');
    return generation({ outputText: 'Never saved' });
  }] });
  expect((await fixture.run({ signal: controller.signal })).status).toBe('cancelled');
  expect(fixture.events.filter(event => event.type === 'delta')).toHaveLength(1);
  expect(fixture.store.commit).not.toHaveBeenCalled();
});

function streamEvents(text = 'Useful advice.') {
  const item = { type: 'message', id: 'message-1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] };
  return [
    { type: 'response.output_item.added', item: { ...item, content: [] } },
    { type: 'response.output_text.delta', item_id: item.id, content_index: 0, delta: text },
    { type: 'response.completed', response: { status: 'completed', output: [item], usage: { input_tokens: 10, output_tokens: 5 } } },
  ];
}

test('real model adapter streams only after tool-free selection and keeps model/settings/usage', async () => {
  const events = streamEvents(), onTextDelta = jest.fn();
  const client = { responses: { create: jest.fn(async () => (async function* () { yield* events; })()) } };
  const model = createSimpleModel({ client });
  const result = await model({ input: [{ role: 'user', content: 'Advice?' }], instructions: 'Answer', tools: [], toolChoice: 'none', onTextDelta });
  expect(onTextDelta).toHaveBeenCalledWith('Useful advice.');
  expect(client.responses.create).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-6.1-sol', stream: true, tool_choice: 'none', store: false }), expect.objectContaining({ maxRetries: 0 }));
  expect(result.outputText).toBe('Useful advice.');
  expect(result.usage.inputTokens).toBe(10);
  await expect(model({ input: [], instructions: '', tools: [ANSWER_TOOL], onTextDelta })).rejects.toThrow('tool-free');
  expect(client.responses.create).toHaveBeenCalledTimes(1);
});

test.each(['tool', 'interrupted', 'failed', 'mismatch', 'refusal', 'reordered'])('collector rejects %s instead of promoting provisional content', failure => {
  const events = streamEvents(), collector = createAnswerCollector({ onText: jest.fn() });
  collector.push(events[0]); collector.push(events[1]);
  expect(() => {
    if (failure === 'tool') collector.push({ type: 'response.output_item.added', item: { type: 'function_call', name: 'propose_trip_update' } });
    if (failure === 'failed') collector.push({ type: 'response.failed' });
    if (failure === 'refusal') collector.push({ type: 'response.refusal.delta' });
    if (failure === 'reordered') { collector.push({ type: 'response.in_progress', sequence_number: 2 }); collector.push({ type: 'response.in_progress', sequence_number: 1 }); }
    if (failure === 'mismatch') { events[2].response.output[0].content[0].text = 'Different'; collector.push(events[2]); }
    collector.finish();
  }).toThrow();
});

test('server feature requires both flag and explicit client opt-in', () => {
  expect(answerStreamEnabled({ get: () => '1' }, {})).toBe(false);
  expect(answerStreamEnabled({ get: () => undefined }, { TRAILIE_ANSWER_STREAM: 'true' })).toBe(false);
  expect(answerStreamEnabled({ get: () => '1' }, { TRAILIE_ANSWER_STREAM: 'false' })).toBe(false);
  expect(answerStreamEnabled({ get: () => '1' }, { TRAILIE_ANSWER_STREAM: 'true' })).toBe(true);
});

test.each(['legacy', 'v2'])('%s transport keeps provisional events separate and sealed', dialect => {
  const events = [], transport = createTrailieTransportAdapter({ dialect, emit: event => events.push(event) });
  transport.answerEvent({ type: 'delta', content: 'Too early' });
  transport.answerEvent({ type: 'started', responseId: 'reply' });
  transport.answerEvent({ type: 'delta', content: 'Provisional' });
  transport.answerEvent({ type: 'withdrawn' });
  transport.answerEvent({ type: 'delta', content: 'Too late' });
  transport.error({ message: 'Failed' });
  transport.answerEvent({ type: 'started', responseId: 'other' });
  expect(events.map(event => event.type)).toEqual(['answer_started', 'answer_delta', 'answer_withdrawn', 'error']);
  expect(events[1]).toEqual({ type: 'answer_delta', responseId: 'reply', sequence: 2, content: 'Provisional' });
});
