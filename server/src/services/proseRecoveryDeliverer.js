'use strict';

/**
 * Default prose-recovery deliverer (Stage 14.4 + WP12 Phase 4).
 *
 * Product chat no longer uses aiProviderStream / Claude for generation.
 * Explicit recovery completes Phase B via the OpenAI Responses path (Terra low).
 */

const { MODEL_ROUTES } = require('../config/trailieModelRouter');
const { createResponsesRequest, executeResponses } = require('../services/responsesAdapter');
const { createOpenAIResponsesAdapter } = require('../services/providers/openaiResponsesAdapter');

const RECOVERY_ROUTE = MODEL_ROUTES.TERRA_LOW;

let cachedAdapter = null;

function getOpenAIAdapter() {
  if (cachedAdapter) return cachedAdapter;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error('openai_not_configured');
    err.code = 'openai_not_configured';
    throw err;
  }
  // eslint-disable-next-line global-require
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey, maxRetries: 0 });
  cachedAdapter = createOpenAIResponsesAdapter({ client });
  return cachedAdapter;
}

function resetProseRecoveryDelivererForTests() {
  cachedAdapter = null;
}

/**
 * @returns {(args: { systemPrompt: string }) => Promise<{content,provider,model,usage,aborted}>}
 */
function buildDefaultProseDeliverer({ signal } = {}) {
  return async ({ systemPrompt }) => {
    if (signal?.aborted) {
      return {
        content: '',
        provider: RECOVERY_ROUTE.provider,
        model: RECOVERY_ROUTE.model,
        usage: null,
        aborted: true,
      };
    }
    const request = createResponsesRequest({
      provider: RECOVERY_ROUTE.provider,
      model: RECOVERY_ROUTE.model,
      instructions: systemPrompt,
      input: [{ role: 'user', content: 'Write the itinerary prose now.' }],
      maxOutputTokens: 4000,
      temperature: 0.4,
      reasoning: RECOVERY_ROUTE.reasoningEffort
        ? { effort: RECOVERY_ROUTE.reasoningEffort }
        : null,
    });
    try {
      const result = await executeResponses(request, {
        adapters: { openai: getOpenAIAdapter() },
        signal,
      });
      return {
        content: result.outputText || '',
        provider: RECOVERY_ROUTE.provider,
        model: RECOVERY_ROUTE.model,
        usage: result.usage || null,
        aborted: false,
      };
    } catch (error) {
      if (signal?.aborted || error?.code === 'responses_cancelled') {
        return {
          content: '',
          provider: RECOVERY_ROUTE.provider,
          model: RECOVERY_ROUTE.model,
          usage: null,
          aborted: true,
        };
      }
      throw error;
    }
  };
}

module.exports = {
  buildDefaultProseDeliverer,
  resetProseRecoveryDelivererForTests,
};
