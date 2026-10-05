'use strict';

/**
 * Stage 13 — deterministic controlled-rollout cohort assignment.
 *
 * Pure and side-effect-free. Given a stable non-PII rollout key and cohort rates,
 * decides which pipeline mode a turn runs under. NOT wired into any route in
 * Stage 13 — the caller (a future stage) supplies rates from
 * `getTrailieRolloutRates()` (which already honor kill switches) and passes the
 * result through the existing generation/consistency config seams.
 *
 * Invariants enforced here:
 *   - Stable hash (FNV-1a), never Math.random → the same key+rates always land in
 *     the same bucket during a planning lifecycle.
 *   - Enforcement cohort is a strict subset of the tool-first cohort.
 *   - Missing/invalid rates → 0 (safe = legacy/off).
 *   - Ineligible turns (non-itinerary, conversion messages) → legacy/off.
 *   - Explicit local/dev overrides win, but never fabricate an unsafe combination
 *     (enforce requires tool_first).
 */

const GENERATION_MODE = { LEGACY: 'legacy', TOOL_FIRST: 'tool_first' };
const CONSISTENCY_MODE = { OFF: 'off', VERIFY: 'verify', ENFORCE: 'enforce' };

/** FNV-1a 32-bit hash → stable fraction in [0, 1). */
function stableFraction(key) {
  const str = String(key == null ? '' : key);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts to stay in integer range.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x100000000; // [0, 1)
}

function clampRate(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n >= 1 ? 1 : n;
}

/**
 * @param {Object} params
 * @param {string} params.rolloutKey            stable non-PII key (trip/session id)
 * @param {boolean} params.eligible             itinerary turn eligible for tool-first
 * @param {number} params.toolFirstRate         fraction [0,1] of eligible turns
 * @param {number} params.enforceRate           fraction [0,1] of eligible turns (subset of tool-first)
 * @param {Object} [params.override]            explicit dev override {generationMode, consistencyMode}
 * @returns {{generationMode, consistencyMode, bucket, reason}}
 */
function selectTrailiePipelineMode({
  rolloutKey,
  eligible,
  toolFirstRate,
  enforceRate,
  override = null,
} = {}) {
  // Explicit local/dev override — only ever DOWN-shifts to a safe, coherent combo.
  if (override && override.generationMode) {
    if (override.generationMode === GENERATION_MODE.TOOL_FIRST) {
      const cm = Object.values(CONSISTENCY_MODE).includes(override.consistencyMode)
        ? override.consistencyMode
        : CONSISTENCY_MODE.OFF;
      return { generationMode: GENERATION_MODE.TOOL_FIRST, consistencyMode: cm, bucket: null, reason: 'override' };
    }
    // Any non-tool-first override → legacy/off (enforce cannot exist without tool_first).
    return { generationMode: GENERATION_MODE.LEGACY, consistencyMode: CONSISTENCY_MODE.OFF, bucket: null, reason: 'override_legacy' };
  }

  if (!eligible) {
    return { generationMode: GENERATION_MODE.LEGACY, consistencyMode: CONSISTENCY_MODE.OFF, bucket: null, reason: 'ineligible' };
  }

  const tfRate = clampRate(toolFirstRate);
  const enfRate = clampRate(enforceRate);
  const bucket = stableFraction(rolloutKey);

  if (bucket >= tfRate) {
    return { generationMode: GENERATION_MODE.LEGACY, consistencyMode: CONSISTENCY_MODE.OFF, bucket, reason: 'legacy_cohort' };
  }

  // In tool-first cohort. Enforcement is a strict subset: it requires the bucket
  // to fall under BOTH rates, so enforce ⊆ tool_first regardless of misconfig.
  if (bucket < enfRate) {
    return { generationMode: GENERATION_MODE.TOOL_FIRST, consistencyMode: CONSISTENCY_MODE.ENFORCE, bucket, reason: 'enforce_cohort' };
  }
  return { generationMode: GENERATION_MODE.TOOL_FIRST, consistencyMode: CONSISTENCY_MODE.OFF, bucket, reason: 'tool_first_cohort' };
}

module.exports = {
  GENERATION_MODE,
  CONSISTENCY_MODE,
  stableFraction,
  selectTrailiePipelineMode,
};
