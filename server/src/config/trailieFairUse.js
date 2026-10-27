'use strict';

/**
 * Signed-in Trailie fair-use configuration (product decision 2026-10-26).
 *
 * There is deliberately NO daily conversation or token ceiling. Signed-in
 * turns are bounded only by:
 *   - a short burst window of user-initiated turns (not model/tool calls),
 *   - at most one active generation per conversation and a small number per
 *     account (cross-instance Mongo leases),
 * and spend is *observed* by non-blocking daily cost/token alerts.
 *
 * Values are read at call time so operators (and tests) can change env
 * without a code change. Invalid or non-positive values fall back to defaults.
 */

const DEFAULTS = Object.freeze({
  burstMaxTurns: 30,
  burstWindowMs: 15 * 60 * 1000,
  // Stream -> non-stream fallback (1) + axios network/5xx retries (3) + the
  // original stream (1). Beyond this, a resend with the same id counts again.
  maxTransportAttemptsPerTurn: 5,
  maxActivePerUser: 2,
  // Slightly above the 180s OpenAI per-call timeout. Live generations renew
  // the lease, so this only bounds recovery after a crashed/killed instance.
  leaseTtlMs: 240 * 1000,
  // Hard ceiling on renewal: 3 model calls x 180s + tool/persistence margin.
  leaseMaxHoldMs: 10 * 60 * 1000,
  // How long a resend of the SAME client turn waits for its predecessor's
  // lease to clear (stream -> non-stream fallback racing the disconnect).
  sameTurnWaitMs: 3000,
  // Alert thresholds (USD / tokens per UTC day). See
  // docs/trailie-fair-use-safeguards.md for the derivation and calibration.
  alertUserDailyUsd: 5,
  alertUserDailyTokens: 2_000_000,
  alertAggregateDailyUsd: 50,
  alertAggregateDailyTokens: 20_000_000,
});

function positiveNumber(value, fallback) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveInteger(value, fallback) {
  const parsed = positiveNumber(value, fallback);
  return Number.isInteger(parsed) ? parsed : Math.floor(parsed) || fallback;
}

function getTrailieFairUseConfig(env = process.env) {
  return {
    enabled: String(env.TRAILIE_FAIR_USE || '').toLowerCase() !== 'off',
    burstMaxTurns: positiveInteger(env.TRAILIE_BURST_MAX_TURNS, DEFAULTS.burstMaxTurns),
    burstWindowMs: positiveInteger(env.TRAILIE_BURST_WINDOW_MS, DEFAULTS.burstWindowMs),
    maxTransportAttemptsPerTurn: positiveInteger(env.TRAILIE_TURN_MAX_TRANSPORT_ATTEMPTS, DEFAULTS.maxTransportAttemptsPerTurn),
    maxActivePerUser: positiveInteger(env.TRAILIE_MAX_ACTIVE_GENERATIONS_PER_USER, DEFAULTS.maxActivePerUser),
    leaseTtlMs: positiveInteger(env.TRAILIE_GENERATION_LEASE_TTL_MS, DEFAULTS.leaseTtlMs),
    leaseMaxHoldMs: positiveInteger(env.TRAILIE_GENERATION_LEASE_MAX_HOLD_MS, DEFAULTS.leaseMaxHoldMs),
    sameTurnWaitMs: env.TRAILIE_SAME_TURN_WAIT_MS === '0' ? 0
      : positiveInteger(env.TRAILIE_SAME_TURN_WAIT_MS, DEFAULTS.sameTurnWaitMs),
    alertUserDailyUsd: positiveNumber(env.TRAILIE_COST_ALERT_USER_DAILY_USD, DEFAULTS.alertUserDailyUsd),
    alertUserDailyTokens: positiveInteger(env.TRAILIE_COST_ALERT_USER_DAILY_TOKENS, DEFAULTS.alertUserDailyTokens),
    alertAggregateDailyUsd: positiveNumber(env.TRAILIE_COST_ALERT_AGGREGATE_DAILY_USD, DEFAULTS.alertAggregateDailyUsd),
    alertAggregateDailyTokens: positiveInteger(env.TRAILIE_COST_ALERT_AGGREGATE_DAILY_TOKENS, DEFAULTS.alertAggregateDailyTokens),
    // Optional email channel; the structured log line is always emitted.
    alertEmailTo: env.TRAILIE_COST_ALERT_EMAIL_TO
      || (env.NODE_ENV === 'production' ? env.ADMIN_EMAIL || null : null),
  };
}

module.exports = { getTrailieFairUseConfig, TRAILIE_FAIR_USE_DEFAULTS: DEFAULTS };
