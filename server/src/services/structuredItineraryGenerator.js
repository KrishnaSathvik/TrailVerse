'use strict';

/**
 * Stage 11 — provider-neutral structured itinerary generation (Phase A).
 *
 * Registers only the `create_itinerary` tool, FORCES the model to call it, and
 * requests NO user-visible prose. The route/pipeline consume the normalized
 * result — never raw Anthropic/OpenAI tool-event formats.
 *
 * `create_itinerary` is a structured DATA-CAPTURE mechanism, not an external
 * action: no arbitrary tool is ever executed.
 */

const { stableStringify } = require('../utils/canonicalResponse');
const {
  diagnoseToolItineraryShape,
  isValidToolItinerary,
} = require('../utils/itineraryToolSchema');
const { normalizeStringifiedDays, MAX_STRINGIFIED_DAYS_BYTES } = require('../utils/normalizeStringifiedDays');

const STRUCTURED_STATUS = {
  COMPLETE: 'complete',
  MISSING_TOOL: 'missing_tool',
  MALFORMED_TOOL: 'malformed_tool',
  TRUNCATED: 'truncated',
  PROVIDER_ERROR: 'provider_error',
  UNSUPPORTED: 'unsupported',
};

const TOOL_NAME = 'create_itinerary';

/** Provider stop reasons that mean the output was cut off. */
const TRUNCATION_STOP_REASONS = new Set(['max_tokens', 'max_output_tokens', 'length']);

function result(status, extra = {}) {
  return {
    status,
    itineraryData: null,
    toolCallId: null,
    provider: null,
    model: null,
    stopReason: null,
    usage: null,
    validationErrors: [],
    validationIssues: [],
    ...extra,
  };
}

/**
 * Pure validation of a set of raw tool calls into a normalized outcome.
 *
 * @param {Object} params
 * @param {Array<{name:string,input:any,id?:string,rawArgs?:string}>} params.toolCalls
 * @param {string|null} params.stopReason
 * @param {number} params.maxBytes
 * @returns {{status:string, itineraryData:object|null, toolCallId:string|null,
 *   validationErrors:string[]}}
 */
function normalizeToolCalls({ toolCalls = [], stopReason = null, maxBytes = 200000, provider = null } = {}) {
  const calls = Array.isArray(toolCalls) ? toolCalls : [];

  // Any tool that is not create_itinerary is unexpected/unsafe → reject.
  const unknown = calls.filter((c) => c && c.name && c.name !== TOOL_NAME);
  if (unknown.length > 0) {
    return { status: STRUCTURED_STATUS.MALFORMED_TOOL, itineraryData: null, toolCallId: null, validationErrors: ['unknown_tool'] };
  }

  const itinCalls = calls.filter((c) => c && c.name === TOOL_NAME);
  if (itinCalls.length === 0) {
    // A truncated response that never finished the tool call reads as missing;
    // prefer the truncation signal so recovery can retry with a bigger budget.
    if (TRUNCATION_STOP_REASONS.has(stopReason)) {
      return { status: STRUCTURED_STATUS.TRUNCATED, itineraryData: null, toolCallId: null, validationErrors: ['no_tool_before_truncation'] };
    }
    return { status: STRUCTURED_STATUS.MISSING_TOOL, itineraryData: null, toolCallId: null, validationErrors: [] };
  }
  if (itinCalls.some((call) => call.status === 'incomplete')) {
    return { status: STRUCTURED_STATUS.TRUNCATED, itineraryData: null, toolCallId: itinCalls[0]?.id || null, validationErrors: ['incomplete_tool_arguments'] };
  }

  // Parse each call's arguments into an object; track parse failures.
  const parsed = [];
  for (const call of itinCalls) {
    let input = call.input;
    let rawStr = call.rawArgs;
    if (input == null && typeof rawStr === 'string') {
      try {
        input = JSON.parse(rawStr);
      } catch {
        return { status: TRUNCATION_STOP_REASONS.has(stopReason) ? STRUCTURED_STATUS.TRUNCATED : STRUCTURED_STATUS.MALFORMED_TOOL, itineraryData: null, toolCallId: call.id || null, validationErrors: ['unparseable_tool_arguments'] };
      }
    }
    if (rawStr == null) rawStr = stableStringify(input);
    if (typeof rawStr === 'string' && Buffer.byteLength(rawStr, 'utf8') > maxBytes) {
      return { status: STRUCTURED_STATUS.MALFORMED_TOOL, itineraryData: null, toolCallId: call.id || null, validationErrors: ['tool_payload_too_large'] };
    }
    parsed.push({ id: call.id || null, input, signature: stableStringify(input) });
  }

  // Deduplicate identical calls; conflicting distinct calls are ambiguous.
  const distinct = [...new Map(parsed.map((p) => [p.signature, p])).values()];
  if (distinct.length > 1) {
    return { status: STRUCTURED_STATUS.MALFORMED_TOOL, itineraryData: null, toolCallId: null, validationErrors: ['ambiguous_tool_calls'] };
  }

  let only = distinct[0];

  // Stage 13.5 — bounded defensive repair (claude create_itinerary only): if the
  // model stringified `days`, parse it ONCE, then validate strictly UNCHANGED.
  let toolInputNormalization = 'none';
  let normalizationFailureCode = null;
  if (provider === 'claude') {
    const rep = normalizeStringifiedDays(only.input, { maxStringBytes: Math.min(maxBytes, MAX_STRINGIFIED_DAYS_BYTES) });
    toolInputNormalization = rep.normalization;
    normalizationFailureCode = rep.failureCode;
    if (rep.normalization !== 'none' && rep.failureCode == null) only = { ...only, input: rep.input };
  }
  const normMeta = { toolInputNormalization, normalizationFailureCode };

  // A truncated stop reason with a structurally-incomplete payload is unsafe.
  if (TRUNCATION_STOP_REASONS.has(stopReason) && !isValidToolItinerary(only.input)) {
    const shape = diagnoseToolItineraryShape(only.input);
    return {
      status: STRUCTURED_STATUS.TRUNCATED,
      itineraryData: null,
      toolCallId: only.id,
      validationErrors: ['truncated_tool_arguments'],
      validationIssues: shape.issues,
      ...normMeta,
    };
  }

  if (!isValidToolItinerary(only.input)) {
    const shape = diagnoseToolItineraryShape(only.input);
    return {
      status: STRUCTURED_STATUS.MALFORMED_TOOL,
      itineraryData: null,
      toolCallId: only.id,
      validationErrors: ['invalid_itinerary_shape'],
      validationIssues: shape.issues,
      ...normMeta,
    };
  }

  return { status: STRUCTURED_STATUS.COMPLETE, itineraryData: only.input, toolCallId: only.id, validationErrors: [], ...normMeta };
}

/** Anthropic adapter — forces the create_itinerary tool, no prose requested. */
async function anthropicStructuredAdapter({ anthropic, model, messages, systemPrompt, toolSchema, maxTokens = 4000, signal, dispatchGuard = null }) {
  const request = {
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
    tools: [toolSchema],
    tool_choice: { type: 'tool', name: TOOL_NAME },
  };
  /**
   * Stage 14.7J §2/§5 — the LAST check before the SDK.
   *
   * It reads `request.model` — the field the provider will actually receive —
   * rather than the `model` argument, so a defect in request assembly (the
   * 14.7I class of defect: the field never arriving) is caught here instead of
   * by a 400 that has already been paid for.
   */
  if (dispatchGuard) dispatchGuard.assertDispatch(request.model);
  const response = await anthropic.messages.create(
    request,
    signal ? { signal } : undefined
  );
  const toolCalls = (response.content || [])
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({ name: b.name, input: b.input, id: b.id }));
  return {
    toolCalls,
    stopReason: response.stop_reason || null,
    model,
    // Stage 13.9 §1 — cache token categories are carried through so accounting can
    // treat them explicitly (they are NOT free, and must never silently vanish).
    usage: response.usage
      ? {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheCreationInputTokens: Number.isFinite(response.usage.cache_creation_input_tokens)
            ? response.usage.cache_creation_input_tokens : null,
          cacheReadInputTokens: Number.isFinite(response.usage.cache_read_input_tokens)
            ? response.usage.cache_read_input_tokens : null,
        }
      : null,
  };
}

/** OpenAI adapter — forces the create_itinerary function, no prose requested. */
async function openaiStructuredAdapter({ openai, model, messages, systemPrompt, toolSchema, maxTokens = 4000, signal, dispatchGuard = null }) {
  const request = {
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
    max_completion_tokens: maxTokens,
    tools: [{ type: 'function', function: { name: TOOL_NAME, parameters: toolSchema.input_schema } }],
    tool_choice: { type: 'function', function: { name: TOOL_NAME } },
  };
  if (dispatchGuard) dispatchGuard.assertDispatch(request.model);
  const response = await openai.chat.completions.create(
    request,
    signal ? { signal } : undefined
  );
  const choice = response.choices?.[0];
  const toolCalls = (choice?.message?.tool_calls || []).map((tc) => ({
    name: tc.function?.name,
    rawArgs: tc.function?.arguments,
    id: tc.id,
  }));
  return {
    toolCalls,
    stopReason: choice?.finish_reason || null,
    model,
    usage: response.usage
      ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
          cacheCreationInputTokens: 0,
          cacheReadInputTokens: response.usage.prompt_tokens_details?.cached_tokens || 0,
        }
      : null,
  };
}

/**
 * Provider-neutral entry point. Returns the normalized structured result — never
 * throws to the caller for provider errors (they become status:'provider_error').
 */
async function generateStructuredItinerary({
  provider,
  model,
  messages,
  systemPrompt,
  toolSchema,
  maxTokens = 4000,
  maxBytes = 200000,
  anthropic = null,
  openai = null,
  signal = null,
  // Stage 14.7J §5 — optional dispatch-identity guard. When present, the model
  // on the assembled request is validated immediately before the SDK call.
  dispatchGuard = null,
} = {}) {
  let adapterResult;
  try {
    if (provider === 'claude') {
      if (!anthropic) return result(STRUCTURED_STATUS.UNSUPPORTED, { provider });
      adapterResult = await anthropicStructuredAdapter({ anthropic, model, messages, systemPrompt, toolSchema, maxTokens, signal, dispatchGuard });
    } else if (provider === 'openai') {
      if (!openai) return result(STRUCTURED_STATUS.UNSUPPORTED, { provider });
      adapterResult = await openaiStructuredAdapter({ openai, model, messages, systemPrompt, toolSchema, maxTokens, signal, dispatchGuard });
    } else {
      return result(STRUCTURED_STATUS.UNSUPPORTED, { provider });
    }
  } catch (err) {
    /**
     * Stage 14.7J §2 — a dispatch-policy refusal is NOT a provider error.
     *
     * Laundering it into `provider_error` would make it retryable, and the
     * bounded retry would spend a second reservation on a condition that is
     * locally decidable — the exact shape of the 14.7 live failure. It
     * propagates to the orchestrator's configuration-error branch instead.
     */
    if (err && err.providerDispatchBlocked === true) throw err;
    return result(STRUCTURED_STATUS.PROVIDER_ERROR, { provider, model, validationErrors: [String(err.message || 'provider_error').slice(0, 200)] });
  }

  const normalized = normalizeToolCalls({
    toolCalls: adapterResult.toolCalls,
    stopReason: adapterResult.stopReason,
    maxBytes,
    provider,
  });

  return {
    status: normalized.status,
    itineraryData: normalized.itineraryData,
    toolCallId: normalized.toolCallId,
    provider,
    model: adapterResult.model || model,
    stopReason: adapterResult.stopReason,
    usage: adapterResult.usage,
    validationErrors: normalized.validationErrors,
    validationIssues: normalized.validationIssues || [],
    toolInputNormalization: normalized.toolInputNormalization || 'none',
    normalizationFailureCode: normalized.normalizationFailureCode || null,
  };
}

module.exports = {
  STRUCTURED_STATUS,
  TOOL_NAME,
  normalizeToolCalls,
  anthropicStructuredAdapter,
  openaiStructuredAdapter,
  generateStructuredItinerary,
};
