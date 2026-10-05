'use strict';

const { performance } = require('perf_hooks');
const { MODEL_CAPABILITIES } = require('../../config/trailieModelCapabilities');

const ERROR_CODES = Object.freeze({
  authentication: 'responses_authentication',
  invalid_request: 'responses_invalid_request',
  rate_limited: 'responses_rate_limited',
  timeout: 'responses_timeout',
  unavailable: 'responses_unavailable',
  cancellation: 'responses_cancelled',
  structured_output: 'responses_structured_output_failure',
  tool_call: 'responses_tool_call_failure',
  incomplete: 'responses_incomplete',
  unknown: 'responses_provider_error',
});

function boundedError(category, status = null) {
  const error = new Error(ERROR_CODES[category] || ERROR_CODES.unknown);
  error.code = ERROR_CODES[category] || ERROR_CODES.unknown;
  error.category = category in ERROR_CODES ? category : 'unknown';
  error.status = Number.isInteger(status) ? status : null;
  return error;
}

function normalizeOpenAIError(error, signal) {
  if (signal?.aborted || error?.name === 'AbortError') return boundedError('cancellation');
  // The installed SDK subclasses Error without overriding its `name`.
  if (error?.name === 'APIConnectionTimeoutError' || error?.constructor?.name === 'APIConnectionTimeoutError'
    || error?.code === 'ETIMEDOUT') return boundedError('timeout');
  const status = Number(error?.status);
  if (status === 401 || status === 403) return boundedError('authentication', status);
  if (status === 400 || status === 404 || status === 422) return boundedError('invalid_request', status);
  if (status === 429) return boundedError('rate_limited', status);
  if (status >= 500 && status <= 599) return boundedError('unavailable', status);
  return boundedError('unknown', Number.isInteger(status) ? status : null);
}

function convertTools(tools) {
  return (tools || []).map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description || undefined,
    parameters: tool.input_schema || tool.parameters || null,
    strict: tool.strict === true,
  }));
}

function buildInput(request) {
  const input = [];
  if (request.promptCaching) {
    input.push({
      role: 'developer',
      content: [{
        type: 'input_text',
        text: request.promptCaching.publicPrefix,
        prompt_cache_breakpoint: { mode: 'explicit' },
      }],
    });
  }
  input.push(...request.input.map((message) => ({ role: message.role, content: message.content })));
  return input;
}

function buildOpenAIRequest(request, { stream = false } = {}) {
  const capabilities = MODEL_CAPABILITIES[request.model];
  if (capabilities && request.reasoning?.effort
    && !capabilities.reasoningEfforts.includes(request.reasoning.effort)) {
    throw boundedError('invalid_request');
  }
  const body = {
    model: request.model,
    instructions: request.instructions || undefined,
    input: buildInput(request),
    max_output_tokens: request.generation.maxOutputTokens,
    store: false,
  };
  if (stream) body.stream = true;
  if (request.generation.temperature != null && (!capabilities
    || (capabilities.temperatureWithoutReasoning && request.reasoning?.effort === 'none'))) {
    body.temperature = request.generation.temperature;
  }
  if (request.tools.length) body.tools = convertTools(request.tools);
  if (request.toolChoice) {
    body.tool_choice = request.toolChoice === 'required'
      ? 'required'
      : { type: 'function', name: request.toolChoice.name };
  }
  if (request.structuredOutput) {
    body.text = { format: {
      type: 'json_schema',
      name: request.structuredOutput.name,
      description: request.structuredOutput.description || undefined,
      schema: request.structuredOutput.schema,
      strict: request.structuredOutput.strict !== false,
    } };
  }
  if (request.reasoning) body.reasoning = request.reasoning;
  if (request.requestMetadata) body.metadata = request.requestMetadata;
  if (request.promptCaching) {
    body.prompt_cache_options = { mode: 'explicit', ttl: request.promptCaching.ttl || '30m' };
  }
  return body;
}

function normalizeUsage(usage) {
  if (!usage) return {};
  const inputTokens = usage.input_tokens ?? null;
  const cachedInputTokens = usage.input_tokens_details?.cached_tokens ?? null;
  return {
    inputTokens,
    uncachedInputTokens: inputTokens == null || cachedInputTokens == null
      ? null : Math.max(0, inputTokens - cachedInputTokens),
    cachedInputTokens,
    cacheCreationInputTokens: usage.input_tokens_details?.cache_write_tokens ?? null,
    outputTokens: usage.output_tokens ?? null,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? null,
  };
}

function collectOutput(response) {
  const toolCalls = [];
  let refusal = null;
  for (const item of response.output || []) {
    if (item.type === 'function_call') {
      let input = null;
      try { input = JSON.parse(item.arguments); } catch { /* deterministic consumer handles malformed args */ }
      toolCalls.push({
        id: item.call_id || item.id || null,
        name: item.name,
        input,
        rawArgs: item.arguments,
        status: item.status || null,
      });
    } else if (item.type === 'message') {
      const refusalPart = (item.content || []).find((part) => part.type === 'refusal');
      if (refusalPart) refusal = refusalPart.refusal;
    }
  }
  return { toolCalls, refusal };
}

function structuredResult(request, response) {
  if (!request.structuredOutput) return { value: null, status: null };
  if (response.status !== 'completed') return { value: null, status: 'incomplete' };
  try {
    const value = JSON.parse(response.output_text || '');
    const valid = typeof request.structuredOutput.validate === 'function'
      ? request.structuredOutput.validate(value) : true;
    return valid ? { value, status: 'complete' } : { value: null, status: 'schema_violation' };
  } catch {
    return { value: null, status: 'malformed' };
  }
}

function normalizeResponse(request, response, latencyMs, unknownEventCount = 0) {
  if (!response || typeof response !== 'object') throw boundedError('unknown');
  const { toolCalls, refusal } = collectOutput(response);
  const structured = structuredResult(request, response);
  return {
    provider: 'openai',
    model: request.model,
    providerReportedModel: response.model == null ? null : String(response.model),
    responseId: response.id || null,
    outputText: response.output_text || '',
    toolCalls,
    stopReason: response.incomplete_details?.reason === 'max_output_tokens'
      ? 'max_tokens' : (response.incomplete_details?.reason || response.status || null),
    completionStatus: response.status || null,
    structuredOutput: structured.value,
    structuredOutputStatus: structured.status,
    refusal,
    serviceTier: response.service_tier || null,
    latencyMs,
    unknownEventCount,
    usage: normalizeUsage(response.usage),
  };
}

function normalizeStreamEvent(event) {
  switch (event?.type) {
    case 'response.created': return { type: 'start', responseId: event.response?.id || null };
    case 'response.output_text.delta': return { type: 'text_delta', delta: event.delta || '' };
    case 'response.output_text.done': return { type: 'text_done', text: event.text || '' };
    case 'response.output_item.added': return { type: 'output_item_added', itemType: event.item?.type || null };
    case 'response.function_call_arguments.delta': return { type: 'tool_argument_delta', callId: event.item_id || null, delta: event.delta || '' };
    case 'response.function_call_arguments.done': return { type: 'tool_argument_done', callId: event.item_id || null, name: event.name || null, arguments: event.arguments || '' };
    case 'response.completed': return { type: 'complete', responseId: event.response?.id || null };
    case 'response.incomplete': return { type: 'incomplete', reason: event.response?.incomplete_details?.reason || null };
    case 'response.failed': return { type: 'failed' };
    case 'error': return { type: 'error' };
    default: return null;
  }
}

function createOpenAIResponsesAdapter({ client }) {
  if (!client?.responses?.create) throw new Error('responses_openai_client_required');
  return {
    async execute(request, { signal } = {}) {
      const started = performance.now();
      try {
        const response = await client.responses.create(
          buildOpenAIRequest(request),
          { signal, maxRetries: 0 },
        );
        return normalizeResponse(request, response, Math.round(performance.now() - started));
      } catch (error) {
        if (error?.code && String(error.code).startsWith('responses_')) throw error;
        throw normalizeOpenAIError(error, signal);
      }
    },
    async stream(request, { signal, onEvent = () => {} } = {}) {
      const started = performance.now();
      let unknownEventCount = 0;
      let terminalResponse = null;
      // Stream terminal payloads often omit `output_text`; rebuild it from deltas
      // so upstream validation sees the same text the client already received.
      let streamedText = '';
      let textDone = null;
      try {
        const stream = await client.responses.create(
          buildOpenAIRequest(request, { stream: true }),
          { signal, maxRetries: 0 },
        );
        for await (const event of stream) {
          const normalized = normalizeStreamEvent(event);
          if (normalized) {
            if (normalized.type === 'text_delta' && typeof normalized.delta === 'string') {
              streamedText += normalized.delta;
            } else if (normalized.type === 'text_done' && typeof normalized.text === 'string') {
              textDone = normalized.text;
            }
            onEvent(Object.freeze(normalized));
          } else {
            unknownEventCount += 1;
          }
          if (event.type === 'response.completed' || event.type === 'response.incomplete' || event.type === 'response.failed') {
            terminalResponse = event.response;
          }
        }
        if (!terminalResponse) throw boundedError('incomplete');
        const outputText = (typeof terminalResponse.output_text === 'string' && terminalResponse.output_text)
          || textDone
          || streamedText
          || '';
        const responseForNormalize = terminalResponse.output_text
          ? terminalResponse
          : { ...terminalResponse, output_text: outputText };
        return normalizeResponse(
          request,
          responseForNormalize,
          Math.round(performance.now() - started),
          unknownEventCount,
        );
      } catch (error) {
        if (error?.code && String(error.code).startsWith('responses_')) throw error;
        throw normalizeOpenAIError(error, signal);
      }
    },
  };
}

module.exports = {
  ERROR_CODES,
  buildOpenAIRequest,
  createOpenAIResponsesAdapter,
  normalizeOpenAIError,
  normalizeResponse,
  normalizeStreamEvent,
  normalizeUsage,
};
