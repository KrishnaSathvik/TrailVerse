'use strict';

// Parallel adapter: retain native Responses function-call/output items between
// rounds. The legacy adapter flattens inputs into role/content messages.
const FINAL_MODEL_ROUTE = Object.freeze({ provider: 'openai', model: 'gpt-6.1-sol', reasoningEffort: 'low' });
const { createResponsesRequest } = require('./responsesAdapter');
const { buildOpenAIRequest, normalizeResponse, normalizeOpenAIError } = require('./providers/openaiResponsesAdapter');
const { priceProviderCall } = require('./trailieTurnLedger');
const { performance } = require('perf_hooks');

// Only bounded identifiers leave the SDK boundary; never retain raw errors,
// response bodies, arbitrary headers, prompts, or credentials in call telemetry.
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,200}$/.test(value) ? value : null;

function createSimpleModel({ client, route = FINAL_MODEL_ROUTE } = {}) {
  if (!client?.responses?.create) throw new TypeError('An explicitly supplied Responses client is required');
  if (route.model !== FINAL_MODEL_ROUTE.model || route.reasoningEffort !== 'low' || route.provider !== 'openai') throw new TypeError('Unsupported simple runtime route');
  return async ({ input, instructions, tools, signal, toolChoice = 'auto' }) => {
    const request = createResponsesRequest({ provider: route.provider, model: route.model,
      instructions, input: [{ role: 'user', content: 'Native conversation supplied below.' }],
      tools, reasoning: { effort: route.reasoningEffort }, maxOutputTokens: 10000 });
    const body = { ...buildOpenAIRequest(request), input, parallel_tool_calls: false, tool_choice: toolChoice };
    const started = performance.now();
    const attempt = { requestStartedAt: new Date().toISOString(), requestFinishedAt: null, failedAt: null,
      configuredTimeoutMs: Number.isFinite(client.timeout) ? client.timeout : null,
      model: route.model, reasoningEffort: route.reasoningEffort, status: 'started',
      errorClass: null, errorCode: null, upstreamRequestId: null,
      responseHeadersReceived: null, responseHeadersReceivedAt: null, timeToResponseHeadersMs: null,
      timeToFirstUsableResponseMs: null };
    let headersObserved = false;
    try {
      const pending = client.responses.create(body, { signal, maxRetries: 0 });
      // asResponse observes the same SDK request; it does not dispatch another
      // call or consume the body. Plain promises remain supported for fixtures.
      const headers = typeof pending.asResponse === 'function' ? pending.asResponse().then(response => {
        headersObserved = true;
        attempt.responseHeadersReceived = true;
        attempt.responseHeadersReceivedAt = new Date().toISOString();
        attempt.timeToResponseHeadersMs = performance.now() - started;
        attempt.upstreamRequestId = identifier(response.headers?.get?.('x-request-id'));
      }, () => {}) : Promise.resolve();
      const raw = await pending;
      await headers;
      const result = normalizeResponse(request, raw, performance.now() - started);
      attempt.status = 'success';
      attempt.requestFinishedAt = new Date().toISOString();
      attempt.latencyMs = performance.now() - started;
      // Non-streaming API: no token-arrival timing is available. This measures
      // the first parsed text/tool result, not time to first token.
      if (result.outputText?.trim() || result.toolCalls?.length) attempt.timeToFirstUsableResponseMs = attempt.latencyMs;
      attempt.upstreamRequestId ||= identifier(raw._request_id);
      return { ...result, outputItems: raw.output || [],
        modelAttempt: attempt,
        ...priceProviderCall({ provider: route.provider, model: route.model, usage: result.usage }) };
    } catch (error) {
      const normalized = normalizeOpenAIError(error, signal);
      attempt.status = 'failure';
      attempt.failedAt = new Date().toISOString();
      attempt.latencyMs = performance.now() - started;
      attempt.errorClass = identifier(error?.constructor?.name === 'Object' ? error?.name : error?.constructor?.name);
      attempt.errorCode = normalized.code;
      attempt.upstreamRequestId ||= identifier(error?.request_id) || identifier(error?.headers?.get?.('x-request-id'));
      if (!headersObserved) {
        // HTTP errors expose headers only after SDK error-body parsing. Their
        // arrival time is unknown; don't mislabel failure time as header time.
        if (error?.headers) attempt.responseHeadersReceived = true;
        else if (['APIConnectionTimeoutError', 'APIConnectionError'].includes(attempt.errorClass)) attempt.responseHeadersReceived = false;
      }
      normalized.modelAttempt = attempt;
      throw normalized;
    }
  };
}

module.exports = { createSimpleModel, FINAL_MODEL_ROUTE };
