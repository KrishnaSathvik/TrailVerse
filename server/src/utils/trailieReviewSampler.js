'use strict';

/**
 * Stage 9 — deterministic shadow-review sampler.
 *
 * Sampling is a pure function of the responseId, NEVER Math.random(). The same
 * canonical response therefore always receives the same decision, so a retry or
 * a duplicate request cannot buy an extra sampling chance and cannot create a
 * second billable review job.
 */

const crypto = require('crypto');

/** Response shapes that are never worth a model review. */
const INELIGIBLE_REASON = {
  EMPTY: 'empty_response',
  WELCOME: 'welcome_message',
  CONVERSION: 'conversion_message',
  PROVIDER_ERROR: 'provider_error',
  SYSTEM: 'system_message',
};

/**
 * Map a responseId into a stable fraction in [0, 1). Uses the first 52 bits of a
 * sha256 digest so the distribution is uniform and independent of id format.
 */
function responseIdToUnitInterval(responseId) {
  const digest = crypto
    .createHash('sha256')
    .update(String(responseId), 'utf8')
    .digest();
  // 52 bits → exactly representable as a JS double mantissa.
  const high = digest.readUInt32BE(0);
  const low = digest.readUInt32BE(4) >>> 12; // top 20 bits of the next word
  const value = high * 0x100000 + low; // 32 + 20 = 52 bits
  return value / 0x10000000000000; // divide by 2^52
}

/**
 * Whether this response is even a candidate for shadow review. Welcome,
 * conversion, empty, and provider-error responses are structurally ineligible —
 * there is no factual claim to evaluate.
 *
 * @returns {{eligible: boolean, reason: string|null}}
 */
function classifyReviewEligibility({
  provider,
  model,
  content,
  isConversionMessage = false,
  isWelcomeMessage = false,
  providerError = false,
} = {}) {
  if (providerError) return { eligible: false, reason: INELIGIBLE_REASON.PROVIDER_ERROR };
  if (typeof content !== 'string' || content.trim().length === 0) {
    return { eligible: false, reason: INELIGIBLE_REASON.EMPTY };
  }
  if (isConversionMessage || model === 'conversion') {
    return { eligible: false, reason: INELIGIBLE_REASON.CONVERSION };
  }
  if (isWelcomeMessage) return { eligible: false, reason: INELIGIBLE_REASON.WELCOME };
  if (provider === 'system') return { eligible: false, reason: INELIGIBLE_REASON.SYSTEM };
  return { eligible: true, reason: null };
}

/** A rate is usable only if it is a finite number within [0, 1]. */
function normalizeSampleRate(sampleRate) {
  const value = Number(sampleRate);
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * Deterministic sampling decision for one canonical response.
 *
 * Guarantees:
 *  - same responseId → same decision (stable hash bucket).
 *  - sampleRate = 0 → nothing sampled; sampleRate = 1 → everything eligible.
 *  - invalid / absent rate → treated as 0.
 *  - ineligible responses are never sampled regardless of rate.
 *  - no personal or user-identifying data is read or recorded.
 *
 * @returns {{sampled: boolean, eligible: boolean, bucket: number|null,
 *   sampleRate: number, reason: string|null}}
 */
function shouldSampleTrailieReview({ responseId, sampleRate, eligible = true, reason = null } = {}) {
  const normalizedRate = normalizeSampleRate(sampleRate);

  if (!eligible) {
    return { sampled: false, eligible: false, bucket: null, sampleRate: normalizedRate, reason };
  }
  if (!responseId) {
    // No stable identity → cannot sample deterministically → do not sample.
    return {
      sampled: false,
      eligible: true,
      bucket: null,
      sampleRate: normalizedRate,
      reason: 'missing_response_id',
    };
  }
  if (normalizedRate === 0) {
    return { sampled: false, eligible: true, bucket: null, sampleRate: 0, reason: null };
  }

  const bucket = responseIdToUnitInterval(responseId);
  // rate = 1 samples all eligible responses because bucket < 1 always holds.
  const sampled = normalizedRate >= 1 || bucket < normalizedRate;

  return {
    sampled,
    eligible: true,
    bucket: Number(bucket.toFixed(6)),
    sampleRate: normalizedRate,
    reason: null,
  };
}

module.exports = {
  INELIGIBLE_REASON,
  responseIdToUnitInterval,
  classifyReviewEligibility,
  normalizeSampleRate,
  shouldSampleTrailieReview,
};
