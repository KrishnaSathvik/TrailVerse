/**
 * Small, fast LLM calls for web-search digest + category refine.
 * Local Trailie uses Luna Responses; the production compatibility boundary
 * retains its configured Claude helper. Failures never switch providers.
 */
const TRAILIE_LITE_TIMEOUT_MS = Number(process.env.TRAILIE_LITE_TIMEOUT_MS || 5000);
const { assertLiveProviderAllowed } = require('../config/providerTestPolicy');
const { resolveProviderModel, assertDispatchableModel } = require('../config/resolveProviderModel');
const { recordAuxiliaryCall } = require('./trailieTurnLedger');
const { isLocalTrailie } = require('../config/trailieRuntime');
const { createResponsesRequest, executeResponses } = require('./responsesAdapter');
const { createOpenAIResponsesAdapter } = require('./providers/openaiResponsesAdapter');

async function completeLocalHelper({ system, user, maxTokens, purpose }) {
  const model = 'gpt-6-luna';
  const startedAt = Date.now();
  if (!process.env.OPENAI_API_KEY) return { text: null, provider: null, model: null, purpose };
  try {
    assertLiveProviderAllowed({ provider: 'openai', phase: 'constructor' });
    const OpenAI = require('openai');
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: TRAILIE_LITE_TIMEOUT_MS });
    const request = createResponsesRequest({
      provider: 'openai', model, instructions: system,
      input: [{ role: 'user', content: user }],
      maxOutputTokens: Math.max(maxTokens, 1024), reasoning: { effort: 'low' },
    });
    assertLiveProviderAllowed({ provider: 'openai', phase: 'dispatch' });
    const result = await executeResponses(request, { adapters: { openai: createOpenAIResponsesAdapter({ client }) } });
    const usage = { ...result.usage, cacheReadInputTokens: result.usage.cachedInputTokens };
    recordAuxiliaryCall({ phase: purpose, provider: 'openai', model,
      durationMs: Date.now() - startedAt, usage, status: 'complete' });
    return { text: result.completionStatus === 'completed' ? result.outputText.trim() || null : null,
      provider: 'openai', model, purpose, usage };
  } catch (_error) {
    recordAuxiliaryCall({ phase: purpose, provider: 'openai', model,
      durationMs: Date.now() - startedAt, usage: null, status: 'provider_error', errorCode: 'provider_error' });
    return { text: null, provider: null, model: null, purpose };
  }
}

let anthropic = null;

function getAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropic) {
    assertLiveProviderAllowed({ provider: 'claude', phase: 'constructor' });
    const Anthropic = require('@anthropic-ai/sdk');
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: TRAILIE_LITE_TIMEOUT_MS,
    });
  }
  return anthropic;
}

/**
 * @param {{ system: string, user: string, maxTokens?: number, purpose?: string }} params
 * @returns {Promise<{ text: string|null, provider: 'claude'|'openai'|null, model?: string, purpose: string, usage?: object }>}
 */
async function trailieLiteComplete({ system, user, maxTokens = 220, purpose = 'fact_processing' }) {
  if (isLocalTrailie()) return completeLocalHelper({ system, user, maxTokens, purpose });
  const resolution = resolveProviderModel({ provider: 'claude' });
  const claudeModel = resolution.model;
  const client = getAnthropic();
  if (client) {
    const startedAt = Date.now();
    try {
      assertLiveProviderAllowed({ provider: 'claude', phase: 'dispatch' });
      assertDispatchableModel({ model: claudeModel, provider: 'claude', enforceAllowlist: true });
      const response = await client.messages.create({
        model: claudeModel,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      });
      const text = (response.content[0]?.text || '').trim();
      const resultUsage = response.usage ? {
        inputTokens: response.usage.input_tokens ?? null,
        outputTokens: response.usage.output_tokens ?? null,
        cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? null,
        cacheReadInputTokens: response.usage.cache_read_input_tokens ?? null,
      } : null;
      recordAuxiliaryCall({
        phase: purpose,
        provider: 'claude',
        model: claudeModel,
        durationMs: Date.now() - startedAt,
        usage: resultUsage,
        status: 'complete',
      });
      if (text) {
        return {
          text,
          provider: 'claude',
          model: claudeModel,
          purpose,
          usage: resultUsage,
        };
      }
    } catch (err) {
      recordAuxiliaryCall({
        phase: purpose,
        provider: 'claude',
        model: claudeModel,
        durationMs: Date.now() - startedAt,
        usage: null,
        status: 'provider_error',
        errorCode: 'provider_error',
      });
      console.warn(`[TrailieLite] Claude failed: ${err.message}`);
    }
  }

  return { text: null, provider: null, model: null, purpose };
}

module.exports = {
  trailieLiteComplete,
};
