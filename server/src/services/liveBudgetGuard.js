'use strict';

/**
 * Pre-dispatch spend guard for LIVE gates.
 *
 * A test cap that is only checked between turns is not a cap. On 2026-08-18 a
 * $0.12 authorized run spent $0.1996: the harness read the ledger before the
 * turn ($0.0000), and the turn then made three generation attempts internally,
 * escalating to a more expensive tier. Nothing could stop it mid-flight.
 *
 * This guard is consulted BEFORE every paid dispatch. It prices a conservative
 * UPPER BOUND for the attempt about to be made — worst case, so no cached-token
 * discount is assumed and the full output allowance is charged — and refuses
 * the dispatch when that bound does not fit the remaining budget.
 *
 * It is injected, never constructed by default: with no authorized budget the
 * guard is absent and production behaviour is unchanged. It decides only
 * whether a paid call may be made. It never inspects content, never relaxes a
 * validation rule, and a block is never a truth or safety bypass — the caller's
 * existing degradation policy decides what may be returned with what is already
 * in hand.
 */

const { resolveModelPrice } = require('../config/trailiePricingRegistry');

const BLOCK_REASON = 'live_budget_guard_blocked';
const UNKNOWN_PRICE_REASON = 'live_budget_price_unknown';

/**
 * Worst-case dollars for a dispatch that has not happened yet. Every input
 * token is billed at the uncached rate and the full output allowance is
 * assumed to be produced.
 */
function estimateMaximumCostUsd({ provider, model, inputTokenEstimate, maxOutputTokens, at }) {
  const price = resolveModelPrice({ provider, model, at });
  if (!price) return null;
  const input = Number.isFinite(inputTokenEstimate) && inputTokenEstimate > 0 ? inputTokenEstimate : 0;
  const output = Number.isFinite(maxOutputTokens) && maxOutputTokens > 0 ? maxOutputTokens : 0;
  // `priceProviderCall` bills cache WRITES on top of billable input, and the
  // explicit-cache prompt config means a write can occur on any attempt. A
  // bound that ignores it is not an upper bound: it only looked safe because
  // the full output allowance usually overshoots actual output by more.
  const worstInputPerMillion = price.inputPerMillion + (price.cacheWritePerMillion || 0);
  const microDollars = input * worstInputPerMillion + output * price.outputPerMillion;
  return microDollars / 1_000_000;
}

/**
 * @param {number} authorizedBudgetUsd hard ceiling for the whole run.
 * @returns {{assess: Function, record: Function, snapshot: Function}}
 */
function createLiveBudgetGuard({ authorizedBudgetUsd, now = () => new Date() } = {}) {
  if (!Number.isFinite(authorizedBudgetUsd) || authorizedBudgetUsd <= 0) {
    throw new TypeError('createLiveBudgetGuard requires a positive authorizedBudgetUsd');
  }
  let actualSpendUsd = 0;
  let blockedDispatches = 0;
  const dispatches = [];

  const remaining = () => Math.max(0, authorizedBudgetUsd - actualSpendUsd);

  return {
    /**
     * Decide whether the proposed dispatch may proceed. Called BEFORE the
     * paid call, for primary generation, repairs, escalations alike.
     */
    assess({ provider, model, inputTokenEstimate, maxOutputTokens, attemptNumber = null } = {}) {
      const remainingBudgetBeforeDispatch = remaining();
      const estimated = estimateMaximumCostUsd({
        provider, model, inputTokenEstimate, maxOutputTokens, at: now(),
      });
      // An unpriceable model cannot be bounded, so it cannot be authorized.
      const blockReason = estimated == null
        ? UNKNOWN_PRICE_REASON
        : (estimated > remainingBudgetBeforeDispatch ? BLOCK_REASON : null);
      const record = {
        model: model || null,
        attemptNumber,
        inputTokenEstimate: inputTokenEstimate ?? null,
        maxOutputTokens: maxOutputTokens ?? null,
        estimatedMaximumCostBeforeDispatch: estimated,
        remainingBudgetBeforeDispatch,
        dispatchAllowed: blockReason == null,
        blockReason,
        actualCostAfterDispatch: null,
      };
      dispatches.push(record);
      if (blockReason) blockedDispatches += 1;
      return { ...record, ticket: record };
    },

    /** Book the real cost of a dispatch the guard allowed. */
    record({ ticket = null, costUsd = null, costStatus = null } = {}) {
      if (costStatus === 'priced' && Number.isFinite(costUsd)) {
        actualSpendUsd += costUsd;
        if (ticket) ticket.actualCostAfterDispatch = costUsd;
      }
      return { actualSpendUsd, remainingBudgetUsd: remaining() };
    },

    snapshot() {
      return {
        authorizedBudgetUsd,
        actualSpendUsd,
        remainingBudgetUsd: remaining(),
        blockedDispatches,
        dispatches: dispatches.map((d) => ({ ...d })),
      };
    },
  };
}

module.exports = {
  createLiveBudgetGuard,
  estimateMaximumCostUsd,
  LIVE_BUDGET_BLOCK_REASON: BLOCK_REASON,
  LIVE_BUDGET_UNKNOWN_PRICE_REASON: UNKNOWN_PRICE_REASON,
};
