const {
  isSpecificItineraryRequest,
} = require('./discoveryQuery');
const { isItineraryRefinementFollowUp } = require('../services/trailieFetchPlanner');

function isCompareQuery(message) {
  if (!message || typeof message !== 'string') return false;
  const text = message.trim();
  if (/\b(vs\.?|versus)\b/i.test(text)) return true;
  if (/\bcompare\b/i.test(text)) return true;
  if (/\b(choose|pick|should i (?:choose|go with))\b[\s\S]{0,120}\bor\b/i.test(text)) return true;
  return false;
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
  // WP12 Phase 4 — product chat is OpenAI GPT-5.6 only. Claude is not a chat primary.
  return process.env.TRAILIE_DEFAULT_PROVIDER || 'openai';
}

function resolveResponseMode(messages, metadata = {}) {
  if (metadata.responseMode && VALID_RESPONSE_MODES.has(metadata.responseMode)) {
    return metadata.responseMode;
  }

  const lastUserMsg =
    [...(messages || [])].reverse().find((m) => m.role === 'user')?.content || '';

  const hasCanonicalPlan = Boolean(
    metadata.existingCanonicalPlan?.days?.length ||
    metadata.activeTripContext?.lockedPlanDestination ||
    metadata.activeTripContext?.primaryDestination ||
    Number(metadata.priorResponseVersion) > 0
  );
  if (hasCanonicalPlan && isItineraryRefinementFollowUp(lastUserMsg)) return 'architect';
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
