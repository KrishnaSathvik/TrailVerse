'use strict';

/**
 * Stage 13 / 13.3B — versioned, date-aware token pricing for evaluation cost
 * estimates. Pricing is NOT hardcoded into generation business logic: it lives in
 * a versioned config (official Anthropic schedule) plus an env override for
 * synthetic/test models.
 *
 * Resolution order for a model:
 *   1. env override  TRAILIE_PRICE__<SLUG>__INPUT_PER_MTOK / __OUTPUT_PER_MTOK
 *   2. versioned PRICE_CONFIG entry whose [validFrom, validThrough] covers the run date
 *   3. null → `cost_unknown` (never invented; the cost gate cannot pass)
 *
 * A run date OUTSIDE every configured period yields null — we do NOT silently keep
 * using introductory pricing after it lapses.
 */

const COST_UNKNOWN = 'cost_unknown';

// Official Anthropic schedule (per 1,000,000 tokens). Dates are inclusive ISO days.
const PRICE_CONFIG = {
  priceConfigVersion: '2026-07-29',
  source: 'official_anthropic',
  models: {
    'claude-sonnet-5': [
      { period: 'introductory', validFrom: '2026-06-30', validThrough: '2026-08-31', inputUsdPerMillion: 2, outputUsdPerMillion: 10 },
      { period: 'standard', validFrom: '2026-09-01', validThrough: null, inputUsdPerMillion: 3, outputUsdPerMillion: 15 },
    ],
  },
};

// Cache-related usage fields we do NOT have configured prices for. If any appear
// with a nonzero value, dollar cost must fail conservatively (never treated free).
const CACHE_USAGE_FIELDS = ['cache_creation_input_tokens', 'cache_read_input_tokens', 'cacheCreationInputTokens', 'cacheReadInputTokens'];

function modelSlug(model) {
  return String(model || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function readPrice(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function toIsoDay(atDate) {
  const d = atDate instanceof Date ? atDate : new Date(atDate || Date.now());
  return d.toISOString().slice(0, 10);
}

/** Resolve the versioned config entry applicable on `atDate`. */
function resolveVersionedPrice(model, atDate) {
  const periods = PRICE_CONFIG.models[model];
  if (!periods) return null;
  const day = toIsoDay(atDate);
  const match = periods.find((p) => day >= p.validFrom && (p.validThrough == null || day <= p.validThrough));
  if (!match) return null; // date outside all configured periods → unknown, not intro
  return {
    inputPerMTok: match.inputUsdPerMillion,
    outputPerMTok: match.outputUsdPerMillion,
    priceConfigVersion: PRICE_CONFIG.priceConfigVersion,
    activePricePeriod: match.period,
    source: PRICE_CONFIG.source,
  };
}

/**
 * @returns {{inputPerMTok:number, outputPerMTok:number, priceConfigVersion:string,
 *   activePricePeriod:string, source:string}|null}
 */
function getModelPricing(model, { atDate } = {}) {
  const slug = modelSlug(model);
  if (slug) {
    const input = readPrice(`TRAILIE_PRICE__${slug}__INPUT_PER_MTOK`);
    const output = readPrice(`TRAILIE_PRICE__${slug}__OUTPUT_PER_MTOK`);
    if (input != null && output != null) {
      return { inputPerMTok: input, outputPerMTok: output, priceConfigVersion: 'env_override', activePricePeriod: 'env', source: 'env' };
    }
  }
  return resolveVersionedPrice(model, atDate);
}

/** True if a usage object carries nonzero cache tokens we cannot price. */
function hasUnpricedCacheUsage(usage) {
  if (!usage || typeof usage !== 'object') return false;
  return CACHE_USAGE_FIELDS.some((f) => Number(usage[f]) > 0);
}

/**
 * @param {Object} params
 * @param {string} params.model
 * @param {number} [params.inputTokens]
 * @param {number} [params.outputTokens]
 * @param {Object} [params.usage]     raw provider usage (checked for cache tokens)
 * @param {Date|string} [params.atDate]
 * @returns {number|'cost_unknown'} USD, or COST_UNKNOWN (no price OR unpriced cache usage).
 */
function estimateCostUsd({ model, inputTokens = 0, outputTokens = 0, usage = null, atDate } = {}) {
  // §3 — conservative: unpriced cache usage cannot be silently treated as free.
  if (hasUnpricedCacheUsage(usage)) return COST_UNKNOWN;
  const pricing = getModelPricing(model, { atDate });
  if (!pricing) return COST_UNKNOWN;
  const inTok = Number(inputTokens) || 0;
  const outTok = Number(outputTokens) || 0;
  return (inTok / 1e6) * pricing.inputPerMTok + (outTok / 1e6) * pricing.outputPerMTok;
}

module.exports = {
  COST_UNKNOWN,
  PRICE_CONFIG,
  CACHE_USAGE_FIELDS,
  modelSlug,
  getModelPricing,
  resolveVersionedPrice,
  hasUnpricedCacheUsage,
  estimateCostUsd,
};
