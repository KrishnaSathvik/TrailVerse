'use strict';

/**
 * Stage 11 — itinerary generation mode.
 *
 * `legacy`     — current behavior: a single generation may emit prose plus a
 *                trailing tool call / [ITINERARY_JSON] block.
 * `tool_first` — two explicit phases: generate + finalize the structured
 *                itinerary first, then stream prose grounded in that exact plan.
 *
 * Fail-safe: a missing or invalid value resolves to `legacy`. There is NEVER a
 * silent fallback from `tool_first` to inline trailing JSON — recovery is
 * explicit (see the orchestrator).
 */

const ITINERARY_GENERATION_MODE = {
  LEGACY: 'legacy',
  TOOL_FIRST: 'tool_first',
};

function resolveItineraryGenerationMode(raw) {
  const value = String(raw || '').trim().toLowerCase();
  return value === ITINERARY_GENERATION_MODE.TOOL_FIRST
    ? ITINERARY_GENERATION_MODE.TOOL_FIRST
    : ITINERARY_GENERATION_MODE.LEGACY;
}

/**
 * Stage 14.2 §2 — early revision events (response_started / itinerary_ready /
 * prose_generation_started / prose_ready).
 *
 * DEFAULT OFF. When off, the authenticated streaming route emits exactly the
 * pre-Stage-14 event sequence and no early revision envelope is built at all.
 * Only the authenticated streaming route reads this; the frontend and the
 * persistence layer never do.
 */
function earlyItineraryEventsEnabled() {
  return String(process.env.TRAILIE_EARLY_ITINERARY_EVENTS).toLowerCase() === 'true';
}

/**
 * Stage 2026-08-27 — `create_itinerary` STRICT structured output.
 *
 * DEFAULT OFF, benchmark switch only. OpenAI documents that Structured Outputs
 * emit keys in schema order; the 2026-08-27 live run showed that under
 * `strict: false` the model ignores that order entirely. This flag exists so one
 * controlled experiment can test whether constrained decoding moves itinerary
 * structure earlier, without any production exposure.
 *
 * Strict guarantees SHAPE, never value correctness. The repair ledger, the
 * semantic validators, finalization and traveler fit remain authoritative
 * exactly as they are.
 */
function createItineraryStrictEnabled() {
  return String(process.env.TRAILIE_CREATE_ITINERARY_STRICT || '').trim().toLowerCase() === 'true';
}

function getItineraryGenerationConfig() {
  const mode = resolveItineraryGenerationMode(process.env.TRAILIE_ITINERARY_GENERATION_MODE);
  return {
    mode,
    isToolFirst: mode === ITINERARY_GENERATION_MODE.TOOL_FIRST,
    // Stage 14.2 — resolved through this same seam so nothing reads process.env ad hoc.
    earlyItineraryEvents: earlyItineraryEventsEnabled(),
    // Benchmark-only; see createItineraryStrictEnabled.
    createItineraryStrict: createItineraryStrictEnabled(),
    // Bounded structured-phase budget. One retry max (see orchestrator).
    structuredMaxAttempts: 2,
    structuredTimeoutMs: Number(process.env.TRAILIE_STRUCTURED_TIMEOUT_MS) || 30000,
    // Reject oversized tool payloads before parsing/validation.
    maxToolPayloadBytes: Number(process.env.TRAILIE_MAX_TOOL_PAYLOAD_BYTES) || 200000,
    // Stage 13.5 — structured-output token budget. The observed 3-day plan used
    // 3,212 output tokens; the old 4,000 ceiling left almost no headroom and a
    // 7-day plan truncated. Short plans get ~2× headroom; long plans a larger
    // bounded budget. A HARD cap always applies — never unlimited output.
    structuredMaxTokensShort: Number(process.env.TRAILIE_STRUCTURED_MAX_TOKENS_SHORT) || 6000,
    structuredMaxTokensLong: Number(process.env.TRAILIE_STRUCTURED_MAX_TOKENS_LONG) || 12000,
    structuredLongDayThreshold: Number(process.env.TRAILIE_STRUCTURED_LONG_DAY_THRESHOLD) || 5,
    structuredMaxTokensHardCap: Number(process.env.TRAILIE_STRUCTURED_MAX_TOKENS_HARD_CAP) || 16000,
  };
}

/**
 * Choose the structured-output token budget for an attempt.
 * @param {Object} p
 * @param {number|null} p.expectedDays  trip length when known (from constraints)
 * @param {boolean} [p.truncatedRetry]  a retry that follows a truncation may use
 *   the larger (long) budget even for a short plan; a non-truncation retry may NOT.
 * @param {Object} p.config             getItineraryGenerationConfig() result
 */
function selectStructuredMaxTokens({ expectedDays = null, truncatedRetry = false, config }) {
  const isLong = (expectedDays != null && expectedDays >= config.structuredLongDayThreshold) || truncatedRetry;
  const chosen = isLong ? config.structuredMaxTokensLong : config.structuredMaxTokensShort;
  return Math.min(chosen, config.structuredMaxTokensHardCap);
}

module.exports = {
  ITINERARY_GENERATION_MODE,
  resolveItineraryGenerationMode,
  earlyItineraryEventsEnabled,
  createItineraryStrictEnabled,
  getItineraryGenerationConfig,
  selectStructuredMaxTokens,
};
