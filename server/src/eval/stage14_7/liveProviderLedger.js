'use strict';

/**
 * Stage 14.7G §6 — the per-attempt reserve/settle ledger for the live run.
 *
 * This does NOT reimplement accounting. `createRunLedger` (Stage 13.9,
 * `eval/trailie/usageAccounting.js`) already gets the hard part right: a retry
 * never overwrites an earlier attempt's spend, and a call whose usage the
 * provider never reported keeps its conservative reservation rather than
 * becoming free. Reimplementing that would mean reintroducing the exact defect
 * it was written to fix.
 *
 * What this adds is the Stage 14.7 SHAPE: scenario attribution, phase, wall
 * timing per attempt, an explicit outcome vocabulary, and a reconciliation that
 * proves the rows sum to the reported totals.
 *
 * Every provider attempt is reserved and settled — including failed, truncated,
 * discarded, retried and verification-rejected ones. An attempt that is never
 * settled keeps its reservation, so an in-flight call at crash time still counts.
 */

const { createRunLedger } = require('../trailie/usageAccounting');
const { COST_UNKNOWN } = require('../trailie/pricing');

/** Closed vocabulary — no caller text reaches a report. */
const OUTCOME = {
  SUCCESS: 'success',
  FAILED: 'failed',
  TRUNCATED: 'truncated',
  DISCARDED: 'discarded',
  RETRY: 'retry',
  REJECTED_BY_VERIFICATION: 'rejected_by_verification',
};

const SETTLEMENT = {
  OPEN: 'open',
  ACTUAL: 'settled_actual_complete',
  PARTIAL: 'settled_conservative_from_partial_usage',
  RESERVED: 'settled_reserved',
};

const CACHE_USAGE_EVIDENCE = Object.freeze({
  REPORTED: 'provider_reported',
  REPORTED_ZERO: 'provider_reported_zero',
  NOT_REPORTED: 'provider_did_not_report',
  HISTORICAL_NOT_RETAINED: 'historical_not_retained',
});

function finiteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function cacheUsageEvidence(usage) {
  if (!usage || typeof usage !== 'object') return CACHE_USAGE_EVIDENCE.NOT_REPORTED;
  const creation = finiteNumber(usage.cacheCreationInputTokens);
  const read = finiteNumber(usage.cacheReadInputTokens);
  if (creation == null || read == null) return CACHE_USAGE_EVIDENCE.NOT_REPORTED;
  return creation === 0 && read === 0
    ? CACHE_USAGE_EVIDENCE.REPORTED_ZERO : CACHE_USAGE_EVIDENCE.REPORTED;
}

/**
 * @param {Object} params
 * @param {string} params.model
 * @param {Object} params.caps { maxRequests, maxInputTokens, maxOutputTokens, maxCostUsd }
 */
function createLiveProviderLedger({
  model, caps = {}, priorTotals = null, now = () => Date.now(),
} = {}) {
  /**
   * Stage 14.7K §3 — the prior exposure must reach `createRunLedger`.
   *
   * THE DEFECT THIS FIXES
   * ---------------------
   * The live driver has always called
   * `createLiveProviderLedger({ model, caps: { ...caps, priorTotals } })`, but
   * `createRunLedger` takes `priorTotals` as its OWN parameter — so the value
   * arrived inside `caps`, where nothing reads it, and every live ledger
   * started its cap projection from zero.
   *
   * That was harmless while each run had its own budget. It stops being
   * harmless the moment a replacement run must inherit the failed run's 3
   * requests and $0.32: without this, the cumulative $1.50 ceiling would have
   * been enforced as if $1.50 remained, and the plan could have overshot by
   * exactly the prior exposure.
   *
   * Both shapes are accepted so the existing driver call site keeps working.
   */
  const { priorTotals: capsPriorTotals, ...capLimits } = caps || {};
  const inner = createRunLedger({
    model,
    caps: capLimits,
    priorTotals: priorTotals || capsPriorTotals || null,
  });
  const rows = [];
  const refusals = [];

  /**
   * §6 — project the new maximum BEFORE the call and refuse when any cap could
   * be breached. Refusal is not an error: it is the cap working, and the caller
   * stops rather than retries.
   */
  function beginAttempt({
    scenarioId, phase, attemptNumber, maxOutputTokens = null, provider = 'claude',
    resolvedModel = model, reservationModel = model, dispatchModel = model,
    sdkRequestModel = model, dispatchAuthorizationId = null,
  }) {
    const reservation = inner.reserve({ phase, attempt: attemptNumber, maxOutputTokens });

    if (!reservation.allowed) {
      const refusal = {
        scenarioId, provider, model, phase, attemptNumber,
        blockedBy: reservation.blockedBy,
        projected: reservation.reservation,
      };
      refusals.push(refusal);
      return { allowed: false, blockedBy: reservation.blockedBy, refusal };
    }

    const row = {
      scenarioId,
      provider,
      model,
      phase,
      attemptNumber,
      reservationId: reservation.reservationId,
      ledgerAttemptId: reservation.reservationId,
      dispatchAuthorizationId,
      providerRequestId: null,
      resolvedModel,
      reservationModel,
      dispatchModel,
      sdkRequestModel,
      usageSource: null,
      reservedInputTokens: reservation.reservation.inputTokens,
      reservedOutputTokens: reservation.reservation.outputTokens,
      actualInputTokens: null,
      actualOutputTokens: null,
      cacheCreationInputTokens: null,
      cacheReadInputTokens: null,
      cacheUsageEvidence: null,
      estimatedCostUsd: reservation.reservation.costUsd,
      settlementStatus: SETTLEMENT.OPEN,
      outcome: null,
      startedAtMs: now(),
      endedAtMs: null,
    };
    rows.push(row);
    return { allowed: true, reservationId: reservation.reservationId, row };
  }

  /**
   * Settles exactly ONE attempt. Called for every outcome, success or not —
   * an unsettled failed call is how a failure becomes invisible in the totals.
   */
  function settleAttempt(reservationId, {
    usage = null, outcome, providerRequestId = null, usageSource = null,
  } = {}) {
    const row = rows.find((r) => r.reservationId === reservationId);
    if (!row) return null;

    const cacheEvidence = cacheUsageEvidence(usage);
    const completeUsage = usage != null
      && Number.isFinite(usage.inputTokens)
      && Number.isFinite(usage.outputTokens)
      && cacheEvidence !== CACHE_USAGE_EVIDENCE.NOT_REPORTED;
    // Missing cache dimensions keep the full reservation. The known base token
    // counts remain evidence, but they cannot lower a cap or a cost estimate.
    const entry = inner.settle(reservationId, { usage: completeUsage ? usage : null });
    row.endedAtMs = now();
    row.outcome = outcome || OUTCOME.SUCCESS;
    row.providerRequestId = providerRequestId || null;
    row.usageSource = usageSource || (usage ? 'provider_terminal_usage' : 'conservative_reservation');
    row.actualInputTokens = finiteNumber(usage?.inputTokens);
    row.actualOutputTokens = finiteNumber(usage?.outputTokens);
    row.cacheCreationInputTokens = finiteNumber(usage?.cacheCreationInputTokens);
    row.cacheReadInputTokens = finiteNumber(usage?.cacheReadInputTokens);
    row.cacheUsageEvidence = cacheEvidence;

    if (entry) {
      row.settlementStatus = completeUsage
        ? SETTLEMENT.ACTUAL
        : (usage ? SETTLEMENT.PARTIAL : SETTLEMENT.RESERVED);
      row.estimatedCostUsd = entry.costUsd;
    }
    return row;
  }

  /** Counts by outcome, so "how many retries" is measured, not narrated. */
  function outcomeCounts() {
    const counts = Object.fromEntries(Object.values(OUTCOME).map((o) => [o, 0]));
    for (const r of rows) if (r.outcome && counts[r.outcome] !== undefined) counts[r.outcome] += 1;
    counts.unsettled = rows.filter((r) => r.settlementStatus === SETTLEMENT.OPEN).length;
    return counts;
  }

  function report() {
    const innerReport = inner.report();
    const summed = rows.reduce(
      (n, r) => (r.estimatedCostUsd === COST_UNKNOWN ? n : n + r.estimatedCostUsd),
      0,
    );
    const anyUnknown = rows.some((r) => r.estimatedCostUsd === COST_UNKNOWN);

    const currentRun = {
      requests: rows.length,
      inputTokens: rows.reduce((n, row) => n + (
        row.settlementStatus === SETTLEMENT.ACTUAL
          ? row.actualInputTokens + row.cacheCreationInputTokens + row.cacheReadInputTokens
          : row.reservedInputTokens
      ), 0),
      outputTokens: rows.reduce((n, row) => n + (
        row.settlementStatus === SETTLEMENT.ACTUAL ? row.actualOutputTokens : row.reservedOutputTokens
      ), 0),
      costUsd: anyUnknown ? COST_UNKNOWN : Number(summed.toFixed(6)),
    };
    const priorExposure = {
      requests: Number((priorTotals || capsPriorTotals)?.requests || 0),
      inputTokens: Number((priorTotals || capsPriorTotals)?.inputTokens || 0),
      outputTokens: Number((priorTotals || capsPriorTotals)?.outputTokens || 0),
      costUsd: Number((priorTotals || capsPriorTotals)?.costUsd || 0),
    };
    const cumulative = {
      requests: priorExposure.requests + currentRun.requests,
      inputTokens: innerReport.totals.inputTokens,
      outputTokens: innerReport.totals.outputTokens,
      costUsd: innerReport.totals.costUsd,
      costKnown: innerReport.totals.costKnown,
    };
    const dimensionMatches = {
      requests: priorExposure.requests + currentRun.requests === cumulative.requests,
      inputTokens: priorExposure.inputTokens + currentRun.inputTokens === cumulative.inputTokens,
      outputTokens: priorExposure.outputTokens + currentRun.outputTokens === cumulative.outputTokens,
      costUsd: currentRun.costUsd !== COST_UNKNOWN && Math.abs(
        priorExposure.costUsd + currentRun.costUsd - Number(cumulative.costUsd || 0),
      ) <= 1e-6,
    };

    return {
      model,
      caps: capLimits,
      // §3 — reported so a run's inherited exposure is evidence, not a guess.
      priorTotals: priorTotals || capsPriorTotals || null,
      entries: rows.map((r) => ({ ...r })),
      refusals: refusals.map((r) => ({ ...r })),
      outcomeCounts: outcomeCounts(),
      currentRun,
      priorExposure,
      cumulative,
      // Compatibility alias; explicitly cumulative on every dimension.
      totals: {
        providerRequests: cumulative.requests,
        inputTokens: cumulative.inputTokens,
        outputTokens: cumulative.outputTokens,
        estimatedCostUsd: cumulative.costUsd,
        costKnown: cumulative.costKnown,
      },
      // The ledger must add up; a mismatch is reported, never smoothed over.
      reconciliation: {
        rowCount: rows.length,
        rowSumUsd: anyUnknown ? COST_UNKNOWN : Number(summed.toFixed(6)),
        ledgerTotalUsd: innerReport.totals.costUsd,
        currentRun,
        priorExposure,
        cumulative,
        dimensionMatches,
        reconciles: Object.values(dimensionMatches).every(Boolean),
        requestsMatch: dimensionMatches.requests,
      },
    };
  }

  /** True when nothing is over any cap — checked before reporting success. */
  function capsRespected() {
    const t = inner.totals();
    if (capLimits.maxRequests != null && t.requests > capLimits.maxRequests) return false;
    if (capLimits.maxInputTokens != null && t.inputTokens > capLimits.maxInputTokens) return false;
    if (capLimits.maxOutputTokens != null && t.outputTokens > capLimits.maxOutputTokens) return false;
    if (capLimits.maxCostUsd != null && t.costKnown && t.costUsd > capLimits.maxCostUsd) return false;
    return true;
  }

  return {
    beginAttempt,
    settleAttempt,
    report,
    capsRespected,
    totals: inner.totals,
    get requestCount() { return rows.length; },
  };
}

module.exports = {
  OUTCOME, SETTLEMENT, CACHE_USAGE_EVIDENCE, cacheUsageEvidence, createLiveProviderLedger,
};
