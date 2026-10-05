'use strict';

/**
 * Versioned PAYG token prices in USD per one million tokens.
 *
 * Sources reviewed 2026-08-09:
 * - Claude Sonnet 5: https://platform.claude.com/docs/en/about-claude/models/whats-new-sonnet-5
 * - GPT-5.4 mini: https://openai.com/index/introducing-gpt-5-4-mini-and-nano/
 * - GPT-5.6 family: https://developers.openai.com/api/docs/guides/latest-model
 *
 * A missing model/date is deliberately unpriced. Consumers must emit
 * `cost_unknown`; they may never silently substitute zero or a nearby model.
 */
const PRICING_REGISTRY_VERSION = 'pricing-2026-09-23';

// GPT-6 rates verified in the existing 2026-09-23 audit; historical entries retained.
const MODEL_PRICES = Object.freeze([
  {
    provider: 'openai', model: 'gpt-6-luna',
    effectiveFrom: '2026-09-23T00:00:00.000Z', effectiveThrough: null,
    inputPerMillion: 0.1, cacheReadPerMillion: 0.01,
    cacheWritePerMillion: 0.125, outputPerMillion: 0.5,
    inputIncludesCachedTokens: true,
  },
  {
    provider: 'openai', model: 'gpt-6-sol',
    effectiveFrom: '2026-09-23T00:00:00.000Z', effectiveThrough: null,
    inputPerMillion: 2, cacheReadPerMillion: 0.2,
    cacheWritePerMillion: 2.5, outputPerMillion: 10,
    inputIncludesCachedTokens: true,
  },
  {
    provider: 'openai', model: 'gpt-6-astra',
    effectiveFrom: '2026-09-23T00:00:00.000Z', effectiveThrough: null,
    inputPerMillion: 10, cacheReadPerMillion: 1,
    cacheWritePerMillion: 12.5, outputPerMillion: 50,
    inputIncludesCachedTokens: true,
  },

  {
    provider: 'claude',
    model: 'claude-sonnet-5',
    effectiveFrom: '2026-06-30T00:00:00.000Z',
    effectiveThrough: '2026-08-31T23:59:59.999Z',
    inputPerMillion: 2,
    cacheReadPerMillion: 0.2,
    cacheWritePerMillion: 2.5,
    outputPerMillion: 10,
    inputIncludesCachedTokens: false,
  },
  {
    provider: 'claude',
    model: 'claude-sonnet-5',
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    effectiveThrough: null,
    inputPerMillion: 3,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
    outputPerMillion: 15,
    inputIncludesCachedTokens: false,
  },
  {
    provider: 'openai',
    model: 'gpt-5.4-mini',
    effectiveFrom: '2026-03-17T00:00:00.000Z',
    effectiveThrough: null,
    inputPerMillion: 0.75,
    cacheReadPerMillion: 0.075,
    cacheWritePerMillion: null,
    outputPerMillion: 4.5,
    inputIncludesCachedTokens: true,
  },
  {
    provider: 'openai',
    model: 'gpt-5.6-luna',
    effectiveFrom: '2026-07-09T00:00:00.000Z',
    effectiveThrough: null,
    inputPerMillion: 1,
    cacheReadPerMillion: 0.1,
    cacheWritePerMillion: 1.25,
    outputPerMillion: 6,
    inputIncludesCachedTokens: true,
  },
  {
    provider: 'openai',
    model: 'gpt-5.6-terra',
    effectiveFrom: '2026-07-09T00:00:00.000Z',
    effectiveThrough: null,
    inputPerMillion: 2.5,
    cacheReadPerMillion: 0.25,
    cacheWritePerMillion: 3.125,
    outputPerMillion: 15,
    inputIncludesCachedTokens: true,
  },
  {
    provider: 'openai',
    model: 'gpt-5.6-sol',
    effectiveFrom: '2026-07-09T00:00:00.000Z',
    effectiveThrough: null,
    inputPerMillion: 5,
    cacheReadPerMillion: 0.5,
    cacheWritePerMillion: 6.25,
    outputPerMillion: 30,
    inputIncludesCachedTokens: true,
  },
]);

function resolveModelPrice({ provider, model, at = new Date() }) {
  const instant = new Date(at).getTime();
  if (!Number.isFinite(instant)) return null;
  return MODEL_PRICES.find((entry) => {
    if (entry.provider !== provider || entry.model !== model) return false;
    const starts = new Date(entry.effectiveFrom).getTime();
    const ends = entry.effectiveThrough ? new Date(entry.effectiveThrough).getTime() : Infinity;
    return instant >= starts && instant <= ends;
  }) || null;
}

module.exports = {
  MODEL_PRICES,
  PRICING_REGISTRY_VERSION,
  resolveModelPrice,
};
