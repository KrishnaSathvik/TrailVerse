'use strict';

const { createResponsesRequest, executeResponses } = require('../responsesAdapter');
const {
  buildOpenAIRequest,
  createOpenAIResponsesAdapter,
  normalizeOpenAIError,
  normalizeStreamEvent,
} = require('../providers/openaiResponsesAdapter');
const { CREATE_ITINERARY_TOOL } = require('../../utils/itineraryToolSchema');
const { normalizeToolCalls, STRUCTURED_STATUS } = require('../structuredItineraryGenerator');

function request(overrides = {}) {
  return createResponsesRequest({
    provider: 'openai',
    model: 'gpt-5.6-terra',
    instructions: 'Use only frozen evidence.',
    input: [{ role: 'user', content: 'PRIVATE_USER_SENTINEL' }],
    maxOutputTokens: 800,
    ...overrides,
  });
}

function response(overrides = {}) {
  return {
    id: 'resp_1', model: 'gpt-5.6-terra', status: 'completed',
    output_text: 'Safe answer', output: [], incomplete_details: null,
    usage: {
      input_tokens: 100,
      input_tokens_details: { cached_tokens: 60, cache_write_tokens: 30 },
      output_tokens: 20,
      output_tokens_details: { reasoning_tokens: 7 },
    },
    service_tier: 'default',
    ...overrides,
  };
}

describe('WP8 OpenAI Responses adapter', () => {
  test('builds stateless store:false request and exposes explicit public-prefix caching only', () => {
    const canonical = request({
      promptCaching: { mode: 'explicit', ttl: '30m', publicPrefix: 'PUBLIC_STABLE_PREFIX' },
      reasoning: { effort: 'low' },
      requestMetadata: { fixture_id: 'safe-id' },
    });
    const body = buildOpenAIRequest(canonical);
    expect(body).toMatchObject({
      model: 'gpt-5.6-terra', store: false, max_output_tokens: 800,
      reasoning: { effort: 'low' }, metadata: { fixture_id: 'safe-id' },
      prompt_cache_options: { mode: 'explicit', ttl: '30m' },
    });
    expect(body).not.toHaveProperty('previous_response_id');
    expect(body).not.toHaveProperty('conversation');
    expect(body.input[0]).toEqual({
      role: 'developer',
      content: [{
        type: 'input_text', text: 'PUBLIC_STABLE_PREFIX',
        prompt_cache_breakpoint: { mode: 'explicit' },
      }],
    });
    expect(JSON.stringify(body.input[0])).not.toContain('PRIVATE_USER_SENTINEL');
    expect(body.input[1]).toEqual({ role: 'user', content: 'PRIVATE_USER_SENTINEL' });
  });

  test('translates canonical itinerary tool without changing its schema', () => {
    const body = buildOpenAIRequest(request({ tools: [CREATE_ITINERARY_TOOL] }));
    expect(body.tools).toEqual([{
      type: 'function', name: 'create_itinerary',
      description: CREATE_ITINERARY_TOOL.description,
      parameters: CREATE_ITINERARY_TOOL.input_schema,
      strict: false,
    }]);
  });

  test('uses Responses structured outputs and validates parsed output deterministically', async () => {
    const client = { responses: { create: jest.fn().mockResolvedValue(response({
      output_text: '{"answer":"ok"}',
    })) } };
    const canonical = request({ structuredOutput: {
      name: 'answer', schema: { type: 'object', required: ['answer'] },
      validate: (value) => value.answer === 'ok',
    } });
    const body = buildOpenAIRequest(canonical);
    expect(body.text.format).toEqual({
      type: 'json_schema', name: 'answer', description: undefined,
      schema: { type: 'object', required: ['answer'] }, strict: true,
    });
    const result = await executeResponses(canonical, {
      adapters: { openai: createOpenAIResponsesAdapter({ client }) },
    });
    expect(result.structuredOutputStatus).toBe('complete');
    expect(result.structuredOutput).toEqual({ answer: 'ok' });
  });

  test('recognizes the installed SDK timeout class without leaking provider details', () => {
    const { APIConnectionTimeoutError } = jest.requireActual('openai');
    const error = new APIConnectionTimeoutError();
    expect(error.name).toBe('Error');
    expect(normalizeOpenAIError(error)).toMatchObject({ code: 'responses_timeout', category: 'timeout' });
  });

  test.each([
    ['{"wrong":true}', 'schema_violation'],
    ['{"broken"', 'malformed'],
  ])('fails deterministic structured output safely (%s)', async (outputText, status) => {
    const client = { responses: { create: jest.fn().mockResolvedValue(response({ output_text: outputText })) } };
    const canonical = request({ structuredOutput: {
      name: 'answer', schema: { type: 'object', required: ['answer'] },
      validate: (value) => typeof value.answer === 'string',
    } });
    const result = await executeResponses(canonical, {
      adapters: { openai: createOpenAIResponsesAdapter({ client }) },
    });
    expect(result.structuredOutputStatus).toBe(status);
  });

  test('normalizes text, tool call, usage/cache/reasoning and executes exactly one no-retry attempt', async () => {
    const args = { days: [{ id: 'd1', dayNumber: 1, label: 'Day 1', stops: [] }] };
    const client = { responses: { create: jest.fn().mockResolvedValue(response({
      output: [{ type: 'function_call', call_id: 'call_1', name: 'create_itinerary', arguments: JSON.stringify(args), status: 'completed' }],
    })) } };
    const canonical = request({ tools: [CREATE_ITINERARY_TOOL] });
    const result = await executeResponses(canonical, {
      adapters: { openai: createOpenAIResponsesAdapter({ client }) },
    });
    expect(client.responses.create).toHaveBeenCalledTimes(1);
    expect(client.responses.create.mock.calls[0][1]).toEqual({ signal: undefined, maxRetries: 0 });
    expect(result.outputText).toBe('Safe answer');
    expect(result.usage).toEqual({
      inputTokens: 100, uncachedInputTokens: 40, cachedInputTokens: 60,
      cacheCreationInputTokens: 30, outputTokens: 20, reasoningTokens: 7,
    });
    expect(normalizeToolCalls({ toolCalls: result.toolCalls, provider: 'openai' })).toMatchObject({
      status: STRUCTURED_STATUS.COMPLETE, itineraryData: args,
    });
  });

  test('preserves malformed, missing and conflicting duplicate tool calls for deterministic rejection', async () => {
    const cases = [
      [{ type: 'function_call', call_id: 'bad', name: 'create_itinerary', arguments: '{', status: 'completed' }, STRUCTURED_STATUS.MALFORMED_TOOL],
      [null, STRUCTURED_STATUS.MISSING_TOOL],
    ];
    for (const [item, expected] of cases) {
      const client = { responses: { create: jest.fn().mockResolvedValue(response({ output: item ? [item] : [] })) } };
      const result = await executeResponses(request({ tools: [CREATE_ITINERARY_TOOL] }), {
        adapters: { openai: createOpenAIResponsesAdapter({ client }) },
      });
      expect(normalizeToolCalls({ toolCalls: result.toolCalls })).toMatchObject({ status: expected });
    }
    const one = { days: [{ id: '1', dayNumber: 1, label: 'A', stops: [] }] };
    const two = { days: [{ id: '1', dayNumber: 1, label: 'B', stops: [] }] };
    const client = { responses: { create: jest.fn().mockResolvedValue(response({ output: [
      { type: 'function_call', call_id: '1', name: 'create_itinerary', arguments: JSON.stringify(one) },
      { type: 'function_call', call_id: '2', name: 'create_itinerary', arguments: JSON.stringify(two) },
    ] })) } };
    const result = await executeResponses(request({ tools: [CREATE_ITINERARY_TOOL] }), {
      adapters: { openai: createOpenAIResponsesAdapter({ client }) },
    });
    expect(normalizeToolCalls({ toolCalls: result.toolCalls })).toMatchObject({ status: STRUCTURED_STATUS.MALFORMED_TOOL });
  });

  test('maps a Responses max-output incomplete tool item to deterministic truncation', async () => {
    const client = { responses: { create: jest.fn().mockResolvedValue(response({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [{
        type: 'function_call', call_id: 'partial', name: 'create_itinerary',
        arguments: '{"days":[', status: 'incomplete',
      }],
    })) } };
    const result = await executeResponses(request({ tools: [CREATE_ITINERARY_TOOL] }), {
      adapters: { openai: createOpenAIResponsesAdapter({ client }) },
    });
    expect(result.stopReason).toBe('max_tokens');
    expect(normalizeToolCalls({ toolCalls: result.toolCalls, stopReason: result.stopReason }))
      .toMatchObject({ status: STRUCTURED_STATUS.TRUNCATED });
  });

  test('normalizes all required streaming events and ignores unknown provider events', async () => {
    async function* events() {
      yield { type: 'response.created', response: { id: 'resp_1' } };
      yield { type: 'response.output_text.delta', delta: 'Safe' };
      yield { type: 'response.output_text.done', text: 'Safe answer' };
      yield { type: 'response.output_item.added', item: { type: 'function_call' } };
      yield { type: 'response.function_call_arguments.delta', item_id: 'call_1', delta: '{' };
      yield { type: 'response.function_call_arguments.done', item_id: 'call_1', name: 'create_itinerary', arguments: '{}' };
      yield { type: 'provider.secret.future_event', payload: 'RAW_SENTINEL' };
      yield { type: 'response.completed', response: response() };
    }
    const client = { responses: { create: jest.fn().mockResolvedValue(events()) } };
    const adapter = createOpenAIResponsesAdapter({ client });
    const seen = [];
    const result = await adapter.stream(request(), { onEvent: (event) => seen.push(event) });
    expect(seen.map((event) => event.type)).toEqual([
      'start', 'text_delta', 'text_done', 'output_item_added',
      'tool_argument_delta', 'tool_argument_done', 'complete',
    ]);
    expect(JSON.stringify(seen)).not.toContain('RAW_SENTINEL');
    expect(result.unknownEventCount).toBe(1);
    expect(client.responses.create.mock.calls[0][0]).toMatchObject({ stream: true, store: false });
    expect(client.responses.create.mock.calls[0][1]).toEqual({ signal: undefined, maxRetries: 0 });
  });

  test('rebuilds outputText from stream deltas when terminal response omits output_text', async () => {
    async function* events() {
      yield { type: 'response.created', response: { id: 'resp_stream' } };
      yield { type: 'response.output_text.delta', delta: 'Hello ' };
      yield { type: 'response.output_text.delta', delta: 'Zion' };
      yield {
        type: 'response.completed',
        response: {
          id: 'resp_stream',
          model: 'gpt-5.6-luna',
          status: 'completed',
          output: [],
          usage: { input_tokens: 10, output_tokens: 2 },
          // intentionally no output_text — matches live Responses stream terminals
        },
      };
    }
    const client = { responses: { create: jest.fn().mockResolvedValue(events()) } };
    const adapter = createOpenAIResponsesAdapter({ client });
    const result = await adapter.stream(request());
    expect(result.outputText).toBe('Hello Zion');
    expect(result.responseId).toBe('resp_stream');
  });

  test.each([
    [{ status: 401, message: 'SECRET_KEY raw body' }, 'responses_authentication'],
    [{ status: 400, message: 'RAW_REQUEST' }, 'responses_invalid_request'],
    [{ status: 429, message: 'RAW_HEADERS' }, 'responses_rate_limited'],
    [{ status: 503, message: 'RAW_PROVIDER_RESPONSE' }, 'responses_unavailable'],
    [{ name: 'APIConnectionTimeoutError', message: 'RAW_TIMEOUT' }, 'responses_timeout'],
    [{ message: 'RAW_UNKNOWN' }, 'responses_provider_error'],
  ])('sanitizes provider errors into bounded categories', async (providerError, code) => {
    const client = { responses: { create: jest.fn().mockRejectedValue(providerError) } };
    let caught;
    try {
      await executeResponses(request(), { adapters: { openai: createOpenAIResponsesAdapter({ client }) } });
    } catch (error) { caught = error; }
    expect(caught).toMatchObject({ code });
    expect(JSON.stringify(caught)).not.toMatch(/SECRET_KEY|RAW_REQUEST|RAW_HEADERS|RAW_PROVIDER_RESPONSE|RAW_TIMEOUT|RAW_UNKNOWN/);
  });

  test('propagates cancellation without dispatch when pre-aborted and during provider execution', async () => {
    const pre = new AbortController(); pre.abort();
    const client = { responses: { create: jest.fn() } };
    await expect(executeResponses(request(), {
      adapters: { openai: createOpenAIResponsesAdapter({ client }) }, signal: pre.signal,
    })).rejects.toMatchObject({ code: 'responses_request_aborted' });
    expect(client.responses.create).not.toHaveBeenCalled();

    const during = new AbortController();
    const rejecting = { responses: { create: jest.fn().mockImplementation(async (_body, options) => {
      during.abort();
      const error = new Error('PRIVATE_PROMPT'); error.name = 'AbortError';
      expect(options.signal).toBe(during.signal);
      throw error;
    }) } };
    await expect(executeResponses(request(), {
      adapters: { openai: createOpenAIResponsesAdapter({ client: rejecting }) }, signal: during.signal,
    })).rejects.toMatchObject({ code: 'responses_cancelled' });
  });

  test('maps incomplete/failed/error terminal events without leaking native payloads', () => {
    expect(normalizeStreamEvent({ type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' } } })).toEqual({ type: 'incomplete', reason: 'max_output_tokens' });
    expect(normalizeStreamEvent({ type: 'response.failed', response: { error: { message: 'RAW_ERROR' } } })).toEqual({ type: 'failed' });
    expect(normalizeStreamEvent({ type: 'error', message: 'RAW_ERROR' })).toEqual({ type: 'error' });
  });

  test('same frozen provider-neutral request can be used by explicit higher-level retry', async () => {
    const seen = [];
    const client = { responses: { create: jest.fn().mockImplementation(async (body) => {
      seen.push(JSON.stringify(body));
      if (seen.length === 1) throw { status: 503 };
      return response();
    }) } };
    const canonical = request({ promptCaching: { mode: 'explicit', publicPrefix: 'FROZEN_EVIDENCE' } });
    const adapter = createOpenAIResponsesAdapter({ client });
    await expect(executeResponses(canonical, { adapters: { openai: adapter } })).rejects.toMatchObject({ code: 'responses_unavailable' });
    await executeResponses(canonical, { adapters: { openai: adapter } });
    expect(seen[0]).toBe(seen[1]);
    expect(client.responses.create).toHaveBeenCalledTimes(2);
  });

  test('error helper never retains raw provider objects', () => {
    const error = normalizeOpenAIError({ status: 400, headers: { authorization: 'SECRET' }, body: 'RAW' });
    expect(Object.keys(error)).toEqual(expect.arrayContaining(['code', 'category', 'status']));
    expect(JSON.stringify(error)).not.toMatch(/SECRET|RAW/);
  });
});
