'use strict';

const { createSimpleModel } = require('../trailieSimpleModel');
const { createSimpleRuntime } = require('../trailieSimpleRuntime');
const { APIConnectionTimeoutError } = jest.requireActual('openai');
const args = { input: [{ role: 'user', content: 'PRIVATE_PROMPT' }], instructions: 'PRIVATE_INSTRUCTIONS', tools: [] };
const raw = { status: 'completed', output_text: 'Answer', output: [] };
const clientFor = pending => ({ timeout: 180000, responses: { create: jest.fn(() => pending) } });

test('observes headers and parsed output on one request without changing model settings', async () => {
  let resolveBody;
  const pending = new Promise(resolve => { resolveBody = resolve; });
  pending.asResponse = jest.fn(async () => ({ headers: new Headers({ 'x-request-id': 'req_offline', authorization: 'SECRET' }) }));
  const client = clientFor(pending);
  const resultPromise = createSimpleModel({ client })(args);
  await Promise.resolve();
  resolveBody(raw);
  const { modelAttempt: a } = await resultPromise;
  expect(a).toMatchObject({ status: 'success', model: 'gpt-6.1-sol', reasoningEffort: 'low',
    configuredTimeoutMs: 180000, upstreamRequestId: 'req_offline', responseHeadersReceived: true,
    failedAt: null, errorCode: null });
  expect(Date.parse(a.requestFinishedAt)).toBeGreaterThanOrEqual(Date.parse(a.requestStartedAt));
  expect(a.timeToFirstUsableResponseMs).toBeGreaterThanOrEqual(a.timeToResponseHeadersMs);
  expect(client.responses.create).toHaveBeenCalledTimes(1);
  expect(client.responses.create).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-6.1-sol',
    reasoning: { effort: 'low' }, input: args.input }), { signal: undefined, maxRetries: 0 });
  expect(JSON.stringify(a)).not.toMatch(/PRIVATE|SECRET|authorization/);
});

test('SDK timeout is recorded in the runtime calls array without a second call', async () => {
  const client = clientFor(Promise.reject(new APIConnectionTimeoutError()));
  const travelTools = { definitions: [], execute: jest.fn() };
  const result = await createSimpleRuntime({ model: createSimpleModel({ client }), travelTools })({ message: 'Hello', responseId: 'turn-offline' });
  expect(result.status).toBe('model_failed');
  expect(result.telemetry).toMatchObject({ responseId: 'turn-offline', modelCalls: 1, toolCalls: 0, costStatus: 'unknown' });
  expect(result.telemetry.calls).toHaveLength(1);
  expect(result.telemetry.calls[0]).toMatchObject({ attemptNumber: 1, status: 'failure',
    model: 'gpt-6.1-sol', reasoningEffort: 'low', configuredTimeoutMs: 180000,
    errorClass: 'APIConnectionTimeoutError', errorCode: 'responses_timeout', responseHeadersReceived: false,
    upstreamRequestId: null, timeToFirstUsableResponseMs: null, usage: null, costUsd: null });
  expect(result.telemetry.calls[0].failedAt).toEqual(expect.any(String));
  expect(client.responses.create).toHaveBeenCalledTimes(1);
  expect(travelTools.execute).not.toHaveBeenCalled();
});

test('HTTP errors retain request identity without inventing header-arrival timing', async () => {
  const error = Object.assign(new Error('PRIVATE_BODY'), { status: 429, request_id: 'req_failed',
    headers: new Headers({ authorization: 'SECRET' }) });
  const client = clientFor(Promise.reject(error));
  await expect(createSimpleModel({ client })(args)).rejects.toMatchObject({ code: 'responses_rate_limited',
    modelAttempt: { status: 'failure', upstreamRequestId: 'req_failed', responseHeadersReceived: true,
      timeToResponseHeadersMs: null, responseHeadersReceivedAt: null } });
});

test('body failure preserves already observed headers and has no usable response time', async () => {
  let rejectBody;
  const pending = new Promise((resolve, reject) => { rejectBody = reject; });
  pending.asResponse = async () => ({ headers: new Headers({ 'x-request-id': 'req_body_failure' }) });
  const result = createSimpleModel({ client: clientFor(pending) })(args);
  await Promise.resolve();
  rejectBody(new SyntaxError('PRIVATE_BODY'));
  await expect(result).rejects.toMatchObject({ modelAttempt: { status: 'failure',
    responseHeadersReceived: true, upstreamRequestId: 'req_body_failure', errorClass: 'SyntaxError',
    timeToFirstUsableResponseMs: null } });
});

test('plain injected clients leave unavailable header and timeout observations unknown', async () => {
  const client = clientFor(Promise.resolve(raw)); delete client.timeout;
  const result = await createSimpleModel({ client })(args);
  expect(result.modelAttempt).toMatchObject({ configuredTimeoutMs: null, responseHeadersReceived: null,
    responseHeadersReceivedAt: null, upstreamRequestId: null });
});
