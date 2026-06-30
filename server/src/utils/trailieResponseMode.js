const {
  isSpecificItineraryRequest,
} = require('./discoveryQuery');

function isCompareQuery(message) {
  if (!message || typeof message !== 'string') return false;
  return /\b(vs\.?|versus)\b/i.test(message.trim());
}

const VALID_RESPONSE_MODES = new Set([
  'buddy',
  'architect',
  'compare',
  'extractor',
  'repair',
  'reviewer',
]);

function autoRouteProvider() {
  return process.env.TRAILIE_DEFAULT_PROVIDER || 'claude';
}

function resolveResponseMode(messages, metadata = {}) {
  if (metadata.responseMode && VALID_RESPONSE_MODES.has(metadata.responseMode)) {
    return metadata.responseMode;
  }

  const lastUserMsg =
    [...(messages || [])].reverse().find((m) => m.role === 'user')?.content || '';

  if (isSpecificItineraryRequest(lastUserMsg)) return 'architect';
  if (isCompareQuery(lastUserMsg)) return 'compare';

  return 'buddy';
}

function getSystemPromptForMode(responseMode, { claudeService, openaiService }) {
  if (responseMode === 'architect' || responseMode === 'repair') {
    return openaiService.systemPrompt;
  }

  if (responseMode === 'reviewer') {
    return null;
  }

  // buddy, compare, extractor — Claude buddy voice
  return claudeService.defaultSystemPrompt;
}

module.exports = {
  VALID_RESPONSE_MODES,
  autoRouteProvider,
  resolveResponseMode,
  getSystemPromptForMode,
};
