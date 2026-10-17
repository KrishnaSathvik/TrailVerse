'use strict';

const { createResponsesRequest } = require('./responsesAdapter');
const { buildOpenAIRequest, normalizeResponse, normalizeOpenAIError } = require('./providers/openaiResponsesAdapter');
const { FINAL_MODEL_ROUTE } = require('./trailieSimpleModel');
const { priceProviderCall } = require('./trailieTurnLedger');
const { MEMORY_VERIFIER_INSTRUCTIONS, MEMORY_VERDICT_SCHEMA } = require('./trailieMemoryAuthority');

const TIMEOUT_MS = 15000;
function createMemoryVerificationModel({ client }) {
  if (!client?.responses?.create) throw new TypeError('Explicit Responses client required');
  return async ({ input, signal }) => {
    const request = createResponsesRequest({ ...FINAL_MODEL_ROUTE,
      instructions: MEMORY_VERIFIER_INSTRUCTIONS, input, tools: [],
      reasoning: { effort: FINAL_MODEL_ROUTE.reasoningEffort }, maxOutputTokens: 4096,
      structuredOutput: { name: 'traveler_memory_authority', schema: MEMORY_VERDICT_SCHEMA, strict: true } });
    const body = { ...buildOpenAIRequest(request), tool_choice: 'none' };
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, TIMEOUT_MS);
    const started = Date.now();
    const attempt = { purpose: 'memory_verification', model: FINAL_MODEL_ROUTE.model,
      reasoningEffort: FINAL_MODEL_ROUTE.reasoningEffort, configuredTimeoutMs: TIMEOUT_MS,
      requestStartedAt: new Date(started).toISOString() };
    try {
      if (controller.signal.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
      const raw = await client.responses.create(body, { signal: controller.signal, timeout: TIMEOUT_MS, maxRetries: 0 });
      if (controller.signal.aborted) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
      const result = normalizeResponse(request, raw, Date.now() - started);
      return { ...result, ...priceProviderCall({ provider: FINAL_MODEL_ROUTE.provider, model: FINAL_MODEL_ROUTE.model, usage: result.usage }),
        modelAttempt: { ...attempt, status: 'success', requestFinishedAt: new Date().toISOString(), latencyMs: Date.now() - started } };
    } catch (error) {
      const normalized = normalizeOpenAIError(error, controller.signal);
      normalized.modelAttempt = { ...attempt, status: 'failure', failedAt: new Date().toISOString(), latencyMs: Date.now() - started, errorCode: normalized.code };
      throw normalized;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  };
}

module.exports = { createMemoryVerificationModel, TIMEOUT_MS };
