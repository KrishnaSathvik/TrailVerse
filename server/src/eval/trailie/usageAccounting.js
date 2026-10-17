'use strict';

/**
 * Stage 13.9 §1/§2 — multi-attempt usage accounting and per-call reservation
 * reconciliation for live evaluation.
 *
 * THE DEFECT THIS REPLACES
 * ------------------------
 * Stage 13.8B counted only the FINAL structured attempt. The seven-day run's
 * discarded first attempt (15,552 in / 6,000 out ≈ $0.0911) vanished from the run
 * cost, the remaining budget, and cap enforcement — so the advertised $2 ceiling
 * was not actually enforceable whenever Phase A retried.
 *
 * THE MODEL
 * ---------
 * Every real provider call gets ONE ledger entry:
 *
 *   reserve()  → conservative maximum for THAT call is committed up-front, and the
 *                call is REFUSED if the reservation could breach any active cap.
 *   settle()   → that entry's reservation is replaced by its own actual usage.
 *                Earlier entries are never touched, replaced, or erased.
 *
 * Invariants (asserted by tests):
 *   - A retry never overwrites the first attempt's spend.
 *   - A failed call WITH usage counts its actual usage.
 *   - A failed call WITHOUT usage keeps its conservative reservation — missing
 *     usage NEVER becomes zero cost.
 *   - Request caps count every provider request; token caps count every attempt.
 *   - Total = Σ(all Phase A attempts) + first Phase B + Phase B retry.
 */

const { estimateCostUsd, hasUnpricedCacheUsage, COST_UNKNOWN } = require('./pricing');

const USAGE_ACCOUNTING_VERSION = 'multi_attempt_v1';

// Conservative per-call reservations. Input size is unknowable before the call;
// output is bounded by the call's own max_tokens when the caller supplies it.
const DEFAULT_RESERVE_INPUT_TOKENS_PER_CALL = Number(process.env.TRAILIE_EVAL_RESERVE_INPUT_TOKENS_PER_CALL || 20000);
const DEFAULT_RESERVE_OUTPUT_TOKENS_PER_CALL = 4000;

const ENTRY_STATE = {
  OPEN: 'open',                       // reserved, call in flight
  SETTLED_ACTUAL: 'settled_actual',   // replaced by this call's real usage
  SETTLED_RESERVED: 'settled_reserved', // call happened, usage unknown → reservation stands
};

function finite(value) {
  return Number.isFinite(value) ? value : null;
}

/** Usage is "known" only when the provider reported at least one token count. */
function usageIsKnown(usage) {
  if (!usage || typeof usage !== 'object') return false;
  return finite(Number(usage.inputTokens)) != null || finite(Number(usage.outputTokens)) != null;
}

function normalizeUsage(usage) {
  return {
    inputTokens: Number(usage?.inputTokens) || 0,
    outputTokens: Number(usage?.outputTokens) || 0,
    cacheCreationInputTokens: Number(usage?.cacheCreationInputTokens) || 0,
    cacheReadInputTokens: Number(usage?.cacheReadInputTokens) || 0,
  };
}

/**
 * Cost of one token bundle. Nonzero cache tokens are UNPRICED under the current
 * price config, so they yield `cost_unknown` rather than a silently-free estimate
 * (pricing.js §3). An unknown-cost entry makes the run's USD cap unenforceable —
 * which is reported, never rounded down to zero.
 */
function costOf({ model, tokens, atDate }) {
  return estimateCostUsd({
    model,
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    usage: tokens,
    atDate,
  });
}

/**
 * A run-scoped ledger. `priorTotals` carries forward the cumulative spend of
 * earlier runs in the same evaluation, so caps bind across the whole session.
 *
 * @param {Object} params
 * @param {string} params.model
 * @param {Object} params.caps  { maxRequests, maxInputTokens, maxOutputTokens, maxCostUsd }
 */
function createRunLedger({
  model,
  caps = {},
  atDate,
  priorTotals = null,
  hardRequestCeiling = null,
  reserveInputTokensPerCall = DEFAULT_RESERVE_INPUT_TOKENS_PER_CALL,
  reserveOutputTokensPerCall = DEFAULT_RESERVE_OUTPUT_TOKENS_PER_CALL,
} = {}) {
  const entries = [];
  const blocked = [];
  const prior = {
    requests: priorTotals?.requests || 0,
    inputTokens: priorTotals?.inputTokens || 0,
    outputTokens: priorTotals?.outputTokens || 0,
    costUsd: priorTotals?.costUsd || 0,
    costKnown: priorTotals ? priorTotals.costKnown !== false : true,
  };
  let nextId = 1;

  /** The tokens an entry currently accounts for: actual when settled, else reserved. */
  function effectiveTokens(entry) {
    return entry.state === ENTRY_STATE.SETTLED_ACTUAL ? entry.actualTokens : entry.reservedTokens;
  }

  function totals() {
    const t = {
      requests: prior.requests + entries.length,
      inputTokens: prior.inputTokens,
      outputTokens: prior.outputTokens,
      costUsd: prior.costUsd,
      costKnown: prior.costKnown,
      openReservations: 0,
    };
    for (const e of entries) {
      const tok = effectiveTokens(e);
      t.inputTokens += tok.inputTokens + tok.cacheCreationInputTokens + tok.cacheReadInputTokens;
      t.outputTokens += tok.outputTokens;
      if (e.costUsd === COST_UNKNOWN) t.costKnown = false;
      else t.costUsd += e.costUsd;
      if (e.state === ENTRY_STATE.OPEN) t.openReservations += 1;
    }
    return t;
  }

  /**
   * §2 — the cap that would be breached by adding `candidate` to current totals,
   * or null. Evaluated BEFORE the request is issued.
   */
  function capBlockingNext(candidate) {
    const t = totals();
    const requests = t.requests + 1;
    if (hardRequestCeiling != null && requests > hardRequestCeiling) return 'smoke_hard_request_ceiling';
    if (caps.maxRequests != null && requests > caps.maxRequests) return 'max_requests';
    if (caps.maxInputTokens != null && t.inputTokens + candidate.inputTokens > caps.maxInputTokens) return 'max_input_tokens';
    if (caps.maxOutputTokens != null && t.outputTokens + candidate.outputTokens > caps.maxOutputTokens) return 'max_output_tokens';
    if (caps.maxCostUsd != null && t.costKnown && candidate.costUsd !== COST_UNKNOWN
        && t.costUsd + candidate.costUsd > caps.maxCostUsd) return 'max_total_cost_usd_reservation';
    return null;
  }

  return {
    /**
     * Reserve the conservative maximum for the NEXT provider call.
     * @returns {{allowed: boolean, reservationId: ?number, blockedBy: ?string, reservation: Object}}
     */
    reserve({ phase, attempt = 1, maxOutputTokens = null } = {}) {
      const reservedTokens = {
        inputTokens: reserveInputTokensPerCall,
        outputTokens: Number(maxOutputTokens) > 0 ? Number(maxOutputTokens) : reserveOutputTokensPerCall,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      };
      const reservedCostUsd = costOf({ model, tokens: reservedTokens, atDate });
      const blockedBy = capBlockingNext({ ...reservedTokens, costUsd: reservedCostUsd });
      if (blockedBy) {
        // The call is NOT made and NOT entered in the ledger — nothing was spent.
        blocked.push({ phase, attempt, blockedBy, reservedTokens, reservedCostUsd });
        return { allowed: false, reservationId: null, blockedBy, reservation: { ...reservedTokens, costUsd: reservedCostUsd } };
      }
      const entry = {
        id: nextId,
        phase,
        attempt,
        state: ENTRY_STATE.OPEN,
        reservedTokens,
        reservedCostUsd,
        actualTokens: null,
        usageKnown: false,
        costUsd: reservedCostUsd,
      };
      nextId += 1;
      entries.push(entry);
      return { allowed: true, reservationId: entry.id, blockedBy: null, reservation: { ...reservedTokens, costUsd: reservedCostUsd } };
    },

    /**
     * Replace ONLY this call's reservation with its actual usage. A call whose
     * usage the provider did not report keeps its reservation (never zero).
     */
    settle(reservationId, { usage = null } = {}) {
      const entry = entries.find((e) => e.id === reservationId);
      if (!entry || entry.state !== ENTRY_STATE.OPEN) return null;
      if (!usageIsKnown(usage)) {
        entry.state = ENTRY_STATE.SETTLED_RESERVED;
        entry.usageKnown = false;
        entry.costUsd = entry.reservedCostUsd; // conservative reservation stands
        return entry;
      }
      entry.actualTokens = normalizeUsage(usage);
      entry.state = ENTRY_STATE.SETTLED_ACTUAL;
      entry.usageKnown = true;
      entry.costUsd = costOf({ model, tokens: entry.actualTokens, atDate });
      return entry;
    },

    totals,
    capBlockingNext,

    /** Sanitized ledger for artifacts: counts, tokens, cost — no payloads. */
    report() {
      const t = totals();
      const rows = entries.map((e) => ({
        id: e.id,
        phase: e.phase,
        attempt: e.attempt,
        state: e.state,
        usageKnown: e.usageKnown,
        inputTokens: effectiveTokens(e).inputTokens,
        outputTokens: effectiveTokens(e).outputTokens,
        cacheCreationInputTokens: effectiveTokens(e).cacheCreationInputTokens,
        cacheReadInputTokens: effectiveTokens(e).cacheReadInputTokens,
        reservedCostUsd: e.reservedCostUsd,
        estimatedCostUsd: e.costUsd,
        costBasis: e.state === ENTRY_STATE.SETTLED_ACTUAL ? 'actual_usage' : 'conservative_reservation',
      }));
      const summed = rows.reduce((n, r) => (r.estimatedCostUsd === COST_UNKNOWN ? n : n + r.estimatedCostUsd), 0);
      return {
        usageAccountingVersion: USAGE_ACCOUNTING_VERSION,
        entries: rows,
        blocked: blocked.map((b) => ({ ...b })),
        providerRequests: entries.length,
        totals: {
          requests: t.requests,
          inputTokens: t.inputTokens,
          outputTokens: t.outputTokens,
          costUsd: t.costKnown ? Number(t.costUsd.toFixed(6)) : COST_UNKNOWN,
          costKnown: t.costKnown,
        },
        // The ledger must add up: Σ(entry costs) === this run's cost contribution.
        reconciliation: {
          runEstimatedCostUsd: rows.some((r) => r.estimatedCostUsd === COST_UNKNOWN)
            ? COST_UNKNOWN : Number(summed.toFixed(6)),
          entriesCounted: rows.length,
          entriesPricedFromReservation: rows.filter((r) => r.costBasis === 'conservative_reservation').length,
          costUnknownEntries: rows.filter((r) => r.estimatedCostUsd === COST_UNKNOWN).length,
        },
      };
    },
  };
}

/**
 * §1 — attach a per-attempt cost to the orchestrator's structured usage rows.
 * `reservationByAttempt` supplies the fallback price for an attempt whose usage
 * the provider never reported, so it can never be counted as free.
 */
function priceStructuredAttempts({ model, structuredUsageAttempts = [], atDate, reservationByAttempt = null }) {
  return structuredUsageAttempts.map((a) => {
    const tokens = normalizeUsage(a);
    const known = a.usageKnown !== false && (finite(a.inputTokens) != null || finite(a.outputTokens) != null);
    const fallback = reservationByAttempt ? reservationByAttempt(a) : null;
    const cost = known ? costOf({ model, tokens, atDate }) : (fallback != null ? fallback : COST_UNKNOWN);
    return {
      attempt: a.attempt,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      cacheCreationInputTokens: tokens.cacheCreationInputTokens,
      cacheReadInputTokens: tokens.cacheReadInputTokens,
      usageKnown: known,
      estimatedCostUsd: cost === COST_UNKNOWN ? COST_UNKNOWN : Number(cost.toFixed(6)),
      costBasis: known ? 'actual_usage' : 'conservative_reservation',
    };
  });
}

/**
 * §3 — back-compatible Phase A aggregates whose SEMANTICS are corrected: they now
 * span every attempt, including discarded and failed ones.
 */
function phaseATotals({ model, structuredUsageAttempts = [], atDate }) {
  const priced = priceStructuredAttempts({ model, structuredUsageAttempts, atDate });
  const anyUnknown = priced.some((p) => p.estimatedCostUsd === COST_UNKNOWN);
  const sum = priced.reduce((n, p) => (p.estimatedCostUsd === COST_UNKNOWN ? n : n + p.estimatedCostUsd), 0);
  return {
    phaseAAttemptCount: priced.length,
    phaseAInputTokens: priced.reduce((n, p) => n + p.inputTokens + p.cacheCreationInputTokens + p.cacheReadInputTokens, 0),
    phaseAOutputTokens: priced.reduce((n, p) => n + p.outputTokens, 0),
    phaseAEstimatedCostUsd: anyUnknown ? COST_UNKNOWN : Number(sum.toFixed(6)),
    structuredUsageAttempts: priced,
  };
}

/**
 * §7 — reconcile a full run: all Phase A attempts + first Phase B + Phase B retry.
 * Returns `reconciles:false` (never a silent pass) when the parts do not add up.
 */
function reconcileRunCost({ phaseA, phaseBFirst, phaseBRetry, reportedTotalUsd, tolerance = 1e-6 }) {
  const parts = [phaseA, phaseBFirst, phaseBRetry];
  if (parts.some((p) => p === COST_UNKNOWN)) {
    return { reconciles: false, reason: 'cost_unknown_component', expectedTotalUsd: COST_UNKNOWN, reportedTotalUsd };
  }
  const expected = parts.reduce((n, p) => n + (Number(p) || 0), 0);
  const delta = Math.abs(expected - (Number(reportedTotalUsd) || 0));
  return {
    reconciles: delta <= tolerance,
    expectedTotalUsd: Number(expected.toFixed(6)),
    reportedTotalUsd: Number((Number(reportedTotalUsd) || 0).toFixed(6)),
    deltaUsd: Number(delta.toFixed(9)),
    components: {
      phaseAAllAttemptsUsd: Number((Number(phaseA) || 0).toFixed(6)),
      phaseBFirstUsd: Number((Number(phaseBFirst) || 0).toFixed(6)),
      phaseBRetryUsd: Number((Number(phaseBRetry) || 0).toFixed(6)),
    },
  };
}

/**
 * §3 — an artifact written before Stage 13.9 has no per-attempt usage rows. Read
 * it as single-attempt semantics rather than crashing or inventing attempts.
 */
function readUsageAccounting(record) {
  const version = record?.usageAccountingVersion
    || record?.structured?.usageAccountingVersion
    || null;
  const attempts = record?.structuredUsageAttempts
    || record?.structured?.structuredUsageAttempts
    || null;
  if (version === USAGE_ACCOUNTING_VERSION && Array.isArray(attempts)) {
    return { version, semantics: 'all_attempts', structuredUsageAttempts: attempts };
  }
  return {
    version: version || 'single_attempt_legacy',
    semantics: 'final_attempt_only',
    structuredUsageAttempts: Array.isArray(attempts) ? attempts : null,
  };
}

module.exports = {
  USAGE_ACCOUNTING_VERSION,
  ENTRY_STATE,
  DEFAULT_RESERVE_INPUT_TOKENS_PER_CALL,
  DEFAULT_RESERVE_OUTPUT_TOKENS_PER_CALL,
  usageIsKnown,
  normalizeUsage,
  hasUnpricedCacheUsage,
  createRunLedger,
  priceStructuredAttempts,
  phaseATotals,
  reconcileRunCost,
  readUsageAccounting,
};
