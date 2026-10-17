'use strict';

/**
 * Stage 13 — controlled-rollout configuration and budgets.
 *
 * This module ONLY resolves configuration. It never enables anything on its own:
 * the cohort decision is a separate pure function (see
 * `utils/trailiePipelineModeSelection`) and no route consumes it yet.
 *
 * Two kinds of settings live here:
 *
 *   1. Rollout rates + kill switch  — how large the tool-first / enforce cohorts
 *      are (0 by default), and a hard kill switch that forces both to zero.
 *   2. Rollout budgets              — the latency/cost/quality thresholds a gate
 *      report compares measured evaluation results against. Missing budgets do
 *      NOT declare the system ready; a gate with no configured budget is reported
 *      as `budget_unset` and treated as unmet (see docs/TRAILIE-STAGE13-*).
 *
 * Fail-safe throughout: missing/invalid → the safest value (rate 0, kill=false,
 * budget=null).
 */

function readRate(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  // Rates are fractions in [0, 1]. Anything above 1 is clamped to 1.
  return n > 1 ? 1 : n;
}

function readBudget(name, { min = 0 } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return null; // unset → gate reported unmet
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) return null;
  return n;
}

function readBool(name) {
  return String(process.env[name] || '').trim().toLowerCase() === 'true';
}

/**
 * Rollout cohort rates. The kill switch (or the master itinerary-generation kill)
 * forces both rates to zero so a single environment flag can halt rollout without
 * touching cohort math.
 */
function getTrailieRolloutRates() {
  const killed =
    readBool('TRAILIE_ROLLOUT_KILL_SWITCH') ||
    // If tool-first itself is not enabled at the generation layer, there is
    // nothing to roll out — surface that as an effective zero.
    String(process.env.TRAILIE_ITINERARY_GENERATION_MODE || '').trim().toLowerCase() !== 'tool_first';

  const toolFirstRate = killed ? 0 : readRate('TRAILIE_ROLLOUT_TOOL_FIRST_RATE');
  const enforceRate = killed ? 0 : readRate('TRAILIE_ROLLOUT_ENFORCE_RATE');

  return {
    killed,
    toolFirstRate,
    // Enforcement is always a subset of tool-first; if misconfigured above the
    // tool-first rate the selection function still guarantees the subset, but we
    // report the effective (clamped) value here for transparency.
    enforceRate: Math.min(enforceRate, toolFirstRate),
    rawEnforceRate: enforceRate,
  };
}

/**
 * Rollout budgets used by the gate report. Each is `null` when unset.
 */
function getTrailieRolloutBudgets() {
  return {
    maxP95TotalMs: readBudget('TRAILIE_ROLLOUT_MAX_P95_TOTAL_MS', { min: 1 }),
    maxP95TtftMs: readBudget('TRAILIE_ROLLOUT_MAX_P95_TTFT_MS', { min: 1 }),
    maxAvgCostUsd: readBudget('TRAILIE_ROLLOUT_MAX_AVG_COST_USD', { min: 0 }),
    maxFallbackRate: readBudget('TRAILIE_ROLLOUT_MAX_FALLBACK_RATE', { min: 0 }),
    maxFalseNegativeRate: readBudget('TRAILIE_ROLLOUT_MAX_FALSE_NEGATIVE_RATE', { min: 0 }),
  };
}

function getTrailieRolloutConfig() {
  return {
    rates: getTrailieRolloutRates(),
    budgets: getTrailieRolloutBudgets(),
  };
}

module.exports = {
  readRate,
  readBudget,
  getTrailieRolloutRates,
  getTrailieRolloutBudgets,
  getTrailieRolloutConfig,
};
