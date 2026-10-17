'use strict';

/**
 * Stage 12 — prose ↔ frozen-itinerary consistency mode.
 *
 * off     — Stage 11 Phase B behavior (stream directly).
 * verify  — buffer + verify + record sanitized telemetry, but NEVER retry or use
 *           the deterministic fallback because of a consistency finding (eval).
 * enforce — buffer + verify; on failure regenerate once, then deterministic
 *           fallback. Contradictory prose is never shown and then replaced.
 *
 * Fail-safe: missing/invalid → off. Never activated implicitly by tool_first.
 */

const PROSE_CONSISTENCY_MODE = { OFF: 'off', VERIFY: 'verify', ENFORCE: 'enforce' };

function resolveProseConsistencyMode(raw) {
  const value = String(raw || '').trim().toLowerCase();
  return Object.values(PROSE_CONSISTENCY_MODE).includes(value)
    ? value
    : PROSE_CONSISTENCY_MODE.OFF;
}

function readNumber(name, fallback, { min, max } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  if (min !== undefined && n < min) return fallback;
  if (max !== undefined && n > max) return fallback;
  return n;
}

function getProseConsistencyConfig() {
  const mode = resolveProseConsistencyMode(process.env.TRAILIE_PROSE_CONSISTENCY_MODE);
  return {
    mode,
    isOff: mode === PROSE_CONSISTENCY_MODE.OFF,
    isVerify: mode === PROSE_CONSISTENCY_MODE.VERIFY,
    isEnforce: mode === PROSE_CONSISTENCY_MODE.ENFORCE,
    // A retry only ever happens in enforce mode AND when explicitly enabled.
    retryEnabled: process.env.TRAILIE_PROSE_RETRY_ENABLED !== 'false',
    maxChars: readNumber('TRAILIE_PROSE_MAX_CHARS', 24000, { min: 2000, max: 200000 }),
    verificationTimeoutMs: readNumber('TRAILIE_PROSE_VERIFICATION_TIMEOUT_MS', 4000, { min: 250, max: 60000 }),
    // Stage 13.7 §5 — upper bound (in tokens) for the assembled Phase B prompt
    // fragment (marker skeleton + rules). Keeps the long-itinerary prompt compact
    // and single-form. Estimated at ~4 chars/token where measured.
    phaseBInputTokenBudget: readNumber('TRAILIE_PROSE_PHASE_B_INPUT_TOKEN_BUDGET', 8000, { min: 500, max: 100000 }),
  };
}

module.exports = {
  PROSE_CONSISTENCY_MODE,
  resolveProseConsistencyMode,
  getProseConsistencyConfig,
};
