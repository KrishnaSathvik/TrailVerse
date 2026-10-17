'use strict';

const {
  RESPONSES_REQUEST_VERSION,
  createResponsesRequest,
  executeResponses,
} = require('../responsesAdapter');

describe('WP8 provider-neutral Responses adapter scaffold', () => {
  test('creates an immutable canonical request without changing provider model identity', () => {
    const input = [{ role: 'user', content: 'Plan one day in Zion.' }];
    const request = createResponsesRequest({
      provider: 'openai',
      model: 'gpt-5.4',
      instructions: 'Use only supplied evidence.',
      input,
      maxOutputTokens: 900,
      temperature: 0.2,
    });

    input[0].content = 'mutated';
    expect(request).toEqual({
      schemaVersion: RESPONSES_REQUEST_VERSION,
      provider: 'openai',
      model: 'gpt-5.4',
      instructions: 'Use only supplied evidence.',
      input: [{ role: 'user', content: 'Plan one day in Zion.' }],
      generation: { maxOutputTokens: 900, temperature: 0.2 },
      tools: [],
      toolChoice: null,
      structuredOutput: null,
      reasoning: null,
      requestMetadata: null,
      promptCaching: null,
    });
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.input)).toBe(true);
    expect(Object.isFrozen(request.input[0])).toBe(true);
  });

  test('dispatches once through only the exact requested provider adapter', async () => {
    const openaiExecute = jest.fn().mockResolvedValue({
      provider: 'openai',
      model: 'gpt-5.4',
      providerReportedModel: null,
      responseId: 'resp_123',
      outputText: 'A compact answer.',
      toolCalls: [],
      stopReason: 'completed',
      usage: { inputTokens: 120, outputTokens: 18, cachedInputTokens: 40 },
    });
    const claudeExecute = jest.fn();
    const request = createResponsesRequest({
      provider: 'openai', model: 'gpt-5.4', instructions: 'Policy',
      input: [{ role: 'user', content: 'Question' }], maxOutputTokens: 500,
    });

    const result = await executeResponses(request, {
      adapters: {
        openai: { execute: openaiExecute },
        claude: { execute: claudeExecute },
      },
    });

    expect(openaiExecute).toHaveBeenCalledTimes(1);
    expect(openaiExecute).toHaveBeenCalledWith(request, { signal: undefined });
    expect(claudeExecute).not.toHaveBeenCalled();
    expect(result).toEqual({
      schemaVersion: 'trailie.responses.result.v1',
      provider: 'openai',
      model: 'gpt-5.4',
      providerReportedModel: null,
      responseId: 'resp_123',
      outputText: 'A compact answer.',
      toolCalls: [],
      stopReason: 'completed',
      completionStatus: null,
      structuredOutput: null,
      structuredOutputStatus: null,
      refusal: null,
      serviceTier: null,
      latencyMs: null,
      unknownEventCount: null,
      usage: {
        inputTokens: 120,
        uncachedInputTokens: null,
        outputTokens: 18,
        reasoningTokens: null,
        cachedInputTokens: 40,
        cacheCreationInputTokens: null,
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  test('preserves missing usage as unknown instead of fake zero', async () => {
    const request = createResponsesRequest({
      provider: 'openai', model: 'gpt-5.6-luna', instructions: 'Policy',
      input: [{ role: 'user', content: 'Question' }], maxOutputTokens: 100,
    });
    const result = await executeResponses(request, { adapters: { openai: { execute: jest.fn().mockResolvedValue({
      provider: 'openai', model: 'gpt-5.6-luna', outputText: 'answer', usage: {},
    }) } } });
    expect(result.usage).toEqual({
      inputTokens: null, uncachedInputTokens: null, outputTokens: null,
      reasoningTokens: null, cachedInputTokens: null, cacheCreationInputTokens: null,
    });
  });

  test.each([
    [{ provider: 'claude', model: 'gpt-5.4' }, 'responses_provider_identity_mismatch'],
    [{ provider: 'openai', model: 'gpt-5.4-mini' }, 'responses_model_identity_mismatch'],
  ])('rejects adapter identity drift without retrying (%o)', async (identity, code) => {
    const execute = jest.fn().mockResolvedValue({
      ...identity,
      outputText: 'answer',
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const request = createResponsesRequest({
      provider: 'openai', model: 'gpt-5.4', instructions: 'Policy',
      input: [{ role: 'user', content: 'Question' }], maxOutputTokens: 100,
    });

    await expect(executeResponses(request, { adapters: { openai: { execute } } }))
      .rejects.toMatchObject({ code });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('rejects missing provider adapters before any dispatch', async () => {
    const otherExecute = jest.fn();
    const request = createResponsesRequest({
      provider: 'openai', model: 'gpt-5.4', instructions: 'Policy',
      input: [{ role: 'user', content: 'Question' }], maxOutputTokens: 100,
    });

    await expect(executeResponses(request, { adapters: { claude: { execute: otherExecute } } }))
      .rejects.toMatchObject({ code: 'responses_provider_adapter_unavailable' });
    expect(otherExecute).not.toHaveBeenCalled();
  });

  test.each([
    [{ provider: '', model: 'gpt-5.4', instructions: 'Policy', input: [{ role: 'user', content: 'Q' }], maxOutputTokens: 100 }, 'responses_provider_required'],
    [{ provider: 'openai', model: '', instructions: 'Policy', input: [{ role: 'user', content: 'Q' }], maxOutputTokens: 100 }, 'responses_model_required'],
    [{ provider: 'openai', model: 'gpt-5.4', instructions: 'Policy', input: [], maxOutputTokens: 100 }, 'responses_input_required'],
    [{ provider: 'openai', model: 'gpt-5.4', instructions: 'Policy', input: [{ role: 'system', content: 'Q' }], maxOutputTokens: 100 }, 'responses_input_role_invalid'],
    [{ provider: 'openai', model: 'gpt-5.4', instructions: 'Policy', input: [{ role: 'user', content: 'Q' }], maxOutputTokens: 0 }, 'responses_max_output_tokens_invalid'],
  ])('rejects an invalid canonical request with bounded code', (input, code) => {
    expect(() => createResponsesRequest(input)).toThrow(expect.objectContaining({ code }));
  });

  test('does not dispatch an already-aborted request', async () => {
    const execute = jest.fn();
    const controller = new AbortController();
    controller.abort();
    const request = createResponsesRequest({
      provider: 'claude', model: 'claude-sonnet-5', instructions: 'Policy',
      input: [{ role: 'user', content: 'Question' }], maxOutputTokens: 100,
    });

    await expect(executeResponses(request, {
      adapters: { claude: { execute } }, signal: controller.signal,
    })).rejects.toMatchObject({ code: 'responses_request_aborted' });
    expect(execute).not.toHaveBeenCalled();
  });
});
