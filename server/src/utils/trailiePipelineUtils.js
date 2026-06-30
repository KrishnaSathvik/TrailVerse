'use strict';

const { CLAUDE_FALLBACK_MODELS, CLAUDE_PRIMARY_MODEL } = require('../config/aiModels');
const { parseClaudeMessageResponse } = require('./claudeResponseParser');

function isClaudeModelUnavailable(error) {
  const errorBody = error.error || error.response?.data || error.body || {};
  const is404Error =
    error.status === 404 ||
    error.statusCode === 404 ||
    error.response?.status === 404;
  const isNotFoundError =
    error.error?.type === 'not_found_error' ||
    error.type === 'not_found_error' ||
    errorBody.type === 'not_found_error' ||
    errorBody.error?.type === 'not_found_error';
  const isModelError =
    (error.message &&
      (error.message.includes('model') ||
        error.message.includes('not found') ||
        error.message.includes('not_found'))) ||
    (errorBody.error?.message && errorBody.error.message.includes('model'));

  return is404Error || isNotFoundError || isModelError;
}

/**
 * Call Claude with model fallback chain. Returns normalized response object.
 */
async function callClaudeWithFallback({
  anthropic,
  modelsToTry = CLAUDE_FALLBACK_MODELS,
  maxTokens,
  temperature,
  system,
  messages,
  tools,
  toolChoice,
  logPrefix = '[Claude]',
}) {
  if (!anthropic) {
    throw Object.assign(new Error('Claude API key not configured'), { statusCode: 500 });
  }

  let lastError = null;

  for (const model of modelsToTry) {
    try {
      console.log(`${logPrefix} Trying Claude model: ${model}`);

      const params = {
        model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages,
      };

      if (tools && tools.length > 0) {
        params.tools = tools;
        if (toolChoice) params.tool_choice = toolChoice;
      }

      const claudeResponse = await anthropic.messages.create(params);
      const { textContent, toolItinerary } = parseClaudeMessageResponse(claudeResponse);

      console.log(`${logPrefix} Success with Claude model: ${model}`);

      return {
        content: textContent,
        toolItinerary,
        provider: 'claude',
        model,
        usage: {
          inputTokens: claudeResponse.usage.input_tokens,
          outputTokens: claudeResponse.usage.output_tokens,
        },
      };
    } catch (error) {
      lastError = error;
      console.error(`${logPrefix} Model ${model} failed:`, error.message);

      const isAuthError =
        error.status === 401 ||
        error.statusCode === 401 ||
        error.status === 403 ||
        error.statusCode === 403;

      if (isClaudeModelUnavailable(error)) {
        console.log(`${logPrefix} Model ${model} not available, trying next...`);
        continue;
      }

      if (isAuthError && modelsToTry.indexOf(model) === 0) {
        console.log(`${logPrefix} Auth error with ${model}, trying next model...`);
        continue;
      }

      throw error;
    }
  }

  const err = new Error(lastError?.message || 'No Claude models available');
  err.lastError = lastError;
  err.modelsToTry = modelsToTry;
  throw err;
}

function formatCorrectionNotice(corrections = []) {
  if (!Array.isArray(corrections) || corrections.length === 0) return '';

  const topCorrections = corrections.slice(0, 4);

  return `\n\n---\n**Trailie adjusted the saved itinerary to fit your constraints:**\n${topCorrections
    .map((correction) => `- ${correction}`)
    .join('\n')}`;
}

function buildPlanDocument({
  itineraryData,
  parkName,
  parkCode,
  reviewMeta,
  auditTrail,
}) {
  if (!itineraryData) return null;

  return {
    type: 'itinerary',
    version: 1,
    generatedAt: new Date().toISOString(),
    createdFrom: 'ai',
    parkName: parkName || null,
    parkCode: parkCode || null,
    ...itineraryData,
    ...(reviewMeta ? { reviewMeta } : {}),
    ...(auditTrail ? { auditTrail } : {}),
  };
}

function buildAuditTrail({
  provider,
  model,
  responseMode,
  confidence,
  planScore,
  correctionsApplied,
  npsFacts,
  weatherFacts,
  webSearchFacts,
  astroFacts,
  feeFreeFacts,
}) {
  return {
    generatedAt: new Date().toISOString(),
    provider,
    model,
    responseMode: responseMode || null,
    confidence: confidence || null,
    planScore: planScore || null,
    correctionsApplied: correctionsApplied || [],
    liveData: {
      nps: !!npsFacts,
      weather: !!weatherFacts,
      webSearch: !!webSearchFacts,
      astro: !!astroFacts,
      feeFree: !!feeFreeFacts,
    },
  };
}

function computeContentUnchanged(processed, strippedStreamContent) {
  return (
    processed.cleanContent === strippedStreamContent &&
    !processed.contentChangedByValidation &&
    !(processed.correctionsApplied?.length > 0) &&
    !processed.reviewMeta?.repaired
  );
}

module.exports = {
  CLAUDE_PRIMARY_MODEL,
  CLAUDE_FALLBACK_MODELS,
  callClaudeWithFallback,
  formatCorrectionNotice,
  buildPlanDocument,
  buildAuditTrail,
  computeContentUnchanged,
};
