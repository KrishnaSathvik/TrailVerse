'use strict';

const RESPONSES_REQUEST_VERSION = 'trailie.responses.request.v1';
const RESPONSES_RESULT_VERSION = 'trailie.responses.result.v1';
const INPUT_ROLES = new Set(['user', 'assistant', 'tool']);

function contractError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function finiteNumberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function cloneAndFreeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(cloneAndFreeze));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cloneAndFreeze(child)]),
    ));
  }
  return value;
}

function freezeInput(input) {
  return Object.freeze(input.map((message) => Object.freeze({
    role: message.role,
    content: String(message.content),
  })));
}

function createResponsesRequest({
  provider,
  model,
  instructions,
  input,
  maxOutputTokens,
  temperature,
  tools = [],
  toolChoice = null,
  structuredOutput = null,
  reasoning = null,
  requestMetadata = null,
  promptCaching = null,
} = {}) {
  if (typeof provider !== 'string' || !provider.trim()) {
    throw contractError('responses_provider_required');
  }
  if (typeof model !== 'string' || !model.trim()) {
    throw contractError('responses_model_required');
  }
  if (!Array.isArray(input) || input.length === 0) {
    throw contractError('responses_input_required');
  }
  for (const message of input) {
    if (!message || !INPUT_ROLES.has(message.role)) {
      throw contractError('responses_input_role_invalid');
    }
    if (typeof message.content !== 'string') {
      throw contractError('responses_input_content_invalid');
    }
  }
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0) {
    throw contractError('responses_max_output_tokens_invalid');
  }
  if (temperature != null && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) {
    throw contractError('responses_temperature_invalid');
  }
  if (!Array.isArray(tools)) throw contractError('responses_tools_invalid');
  if (structuredOutput != null && (!structuredOutput.name || !structuredOutput.schema)) {
    throw contractError('responses_structured_output_invalid');
  }
  if (promptCaching != null) {
    if (promptCaching.mode !== 'explicit' || typeof promptCaching.publicPrefix !== 'string' || !promptCaching.publicPrefix) {
      throw contractError('responses_prompt_caching_invalid');
    }
    if (promptCaching.ttl != null && promptCaching.ttl !== '30m') {
      throw contractError('responses_prompt_cache_ttl_invalid');
    }
  }

  const generation = { maxOutputTokens };
  if (temperature != null) generation.temperature = temperature;

  return Object.freeze({
    schemaVersion: RESPONSES_REQUEST_VERSION,
    provider: provider.trim(),
    model: model.trim(),
    instructions: String(instructions || ''),
    input: freezeInput(input),
    generation: Object.freeze(generation),
    tools: cloneAndFreeze(tools),
    toolChoice: cloneAndFreeze(toolChoice),
    structuredOutput: cloneAndFreeze(structuredOutput),
    reasoning: cloneAndFreeze(reasoning),
    requestMetadata: cloneAndFreeze(requestMetadata),
    promptCaching: cloneAndFreeze(promptCaching),
  });
}

function assertCanonicalRequest(request) {
  if (!request || request.schemaVersion !== RESPONSES_REQUEST_VERSION) {
    throw contractError('responses_request_contract_invalid');
  }
}

function normalizeResult(request, rawResult) {
  if (!rawResult || typeof rawResult !== 'object') {
    throw contractError('responses_result_invalid');
  }
  if (rawResult.provider !== request.provider) {
    throw contractError('responses_provider_identity_mismatch');
  }
  if (rawResult.model !== request.model) {
    throw contractError('responses_model_identity_mismatch');
  }

  const toolCalls = Array.isArray(rawResult.toolCalls)
    ? rawResult.toolCalls.map((call) => Object.freeze({ ...call }))
    : [];
  const usage = Object.freeze({
    inputTokens: finiteNumberOrNull(rawResult.usage?.inputTokens),
    uncachedInputTokens: finiteNumberOrNull(rawResult.usage?.uncachedInputTokens),
    outputTokens: finiteNumberOrNull(rawResult.usage?.outputTokens),
    reasoningTokens: finiteNumberOrNull(rawResult.usage?.reasoningTokens),
    cachedInputTokens: finiteNumberOrNull(rawResult.usage?.cachedInputTokens),
    cacheCreationInputTokens: finiteNumberOrNull(rawResult.usage?.cacheCreationInputTokens),
  });

  return Object.freeze({
    schemaVersion: RESPONSES_RESULT_VERSION,
    provider: request.provider,
    model: request.model,
    providerReportedModel: rawResult.providerReportedModel == null ? null : String(rawResult.providerReportedModel),
    responseId: rawResult.responseId == null ? null : String(rawResult.responseId),
    outputText: String(rawResult.outputText || ''),
    toolCalls: Object.freeze(toolCalls),
    stopReason: rawResult.stopReason == null ? null : String(rawResult.stopReason),
    completionStatus: rawResult.completionStatus == null ? null : String(rawResult.completionStatus),
    structuredOutput: cloneAndFreeze(rawResult.structuredOutput ?? null),
    structuredOutputStatus: rawResult.structuredOutputStatus == null ? null : String(rawResult.structuredOutputStatus),
    refusal: rawResult.refusal == null ? null : String(rawResult.refusal),
    serviceTier: rawResult.serviceTier == null ? null : String(rawResult.serviceTier),
    latencyMs: finiteNumberOrNull(rawResult.latencyMs),
    unknownEventCount: finiteNumberOrNull(rawResult.unknownEventCount),
    usage,
  });
}

async function executeResponses(request, { adapters = {}, signal } = {}) {
  assertCanonicalRequest(request);
  if (signal?.aborted) throw contractError('responses_request_aborted');

  const adapter = adapters[request.provider];
  if (!adapter || typeof adapter.execute !== 'function') {
    throw contractError('responses_provider_adapter_unavailable');
  }

  const rawResult = await adapter.execute(request, { signal });
  return normalizeResult(request, rawResult);
}

/**
 * Stream a Responses request through the provider adapter.
 *
 * Provider-native event names stay inside the adapter. Callers receive only the
 * adapter's already-normalized event objects (e.g. `text_delta`, `complete`).
 * When the adapter has no `stream` method, falls back to a single `execute`
 * with zero intermediate events (test seams / degraded adapters).
 */
async function streamResponses(request, { adapters = {}, signal, onEvent = () => {} } = {}) {
  assertCanonicalRequest(request);
  if (signal?.aborted) throw contractError('responses_request_aborted');

  const adapter = adapters[request.provider];
  if (!adapter) throw contractError('responses_provider_adapter_unavailable');

  if (typeof adapter.stream === 'function') {
    const rawResult = await adapter.stream(request, {
      signal,
      onEvent: (event) => {
        if (!event || typeof event !== 'object') return;
        try { onEvent(event); } catch { /* best-effort sink */ }
      },
    });
    return normalizeResult(request, rawResult);
  }

  if (typeof adapter.execute !== 'function') {
    throw contractError('responses_provider_adapter_unavailable');
  }
  const rawResult = await adapter.execute(request, { signal });
  return normalizeResult(request, rawResult);
}

module.exports = {
  RESPONSES_REQUEST_VERSION,
  RESPONSES_RESULT_VERSION,
  createResponsesRequest,
  executeResponses,
  streamResponses,
  finiteNumberOrNull,
};
