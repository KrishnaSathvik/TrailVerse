'use strict';

/**
 * Stage 14.7L §2/§3 — the ONE canonical prior-exposure record.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Stage 14.7 cumulative ceilings bind across four dimensions. Until now the
 * prior exposure for those dimensions came from two different places:
 *
 *   requests, cost   ← the failed-run audit record
 *   input, output    ← nowhere; seeded as literal 0
 *
 * Two seeds that can drift independently WILL drift, and this pair did: the
 * request and cost seeds were faithful while the token seed silently reported
 * no exposure at all. Stage 14.7J and 14.7K therefore compared plan-only token
 * figures against cumulative token caps and both concluded the remaining plan
 * fit when it did not.
 *
 * So there is now exactly one resolver, it answers all four dimensions
 * together, and it derives them from the preserved evidence rather than from
 * constants that can be edited independently of the run they describe.
 *
 * FAIL CLOSED (§3)
 * ----------------
 * A missing token field, a tokenless audit summary, malformed evidence or a
 * failed reconciliation must NOT become zero. `known zero` and `unknown` are
 * different answers, and only the first is usable:
 *
 *   known zero  → a finite 0 present in the evidence
 *   unknown     → absent, non-finite, or contradicted
 *
 * Unknown resolves to `prior_cumulative_exposure_unresolved`, which the callers
 * surface before manifest authorization, marker creation, reservation, dispatch
 * authorization or network access.
 */

const fs = require('fs');
const path = require('path');

const SERVER_ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

const EVIDENCE_DIR = path.join(REPO_ROOT, 'artifacts/private/stage14_7-live');

const UNRESOLVED = 'prior_cumulative_exposure_unresolved';

/** The four dimensions, named once so nothing can quietly omit one. */
const DIMENSIONS = Object.freeze(['requests', 'costUsd', 'inputTokens', 'outputTokens']);

/**
 * §2 — the reviewed prior-exposure record for the failed Stage 14.7 live run.
 *
 * This is NOT an alternative source of truth: the resolver reads the run's own
 * evidence ledger and REQUIRES it to agree with these values. The record exists
 * so a silent change to the historical evidence is caught rather than adopted.
 */
const REVIEWED_EXPOSURE_SOURCES = Object.freeze([
  Object.freeze({
    runId: 'stage147g-msga12h5-30340b', scenarioId: 'basic-02-three-day',
    requests: 3, costUsd: 0.32, inputTokens: 60000, outputTokens: 20000,
    totalsMode: 'ledger_totals',
  }),
  Object.freeze({
    runId: 'stage147g-mshqzkal-cda9db', scenarioId: 'basic-02-three-day-model-fix-validation-1',
    requests: 2, costUsd: 0.152758, inputTokens: 37714, outputTokens: 7733,
    totalsMode: 'current_entries',
  }),
  Object.freeze({
    runId: 'stage147g-mshyixvk-52ed4e', scenarioId: 'basic-03-seven-day',
    requests: 2, costUsd: 0.1983, inputTokens: 36805, outputTokens: 12469,
    totalsMode: 'current_entries',
  }),
]);

const REVIEWED_PRIOR_EXPOSURE = Object.freeze({
  requests: 7,
  costUsd: 0.671058,
  inputTokens: 134519,
  outputTokens: 40202,
  sources: REVIEWED_EXPOSURE_SOURCES,
});

function evidenceFileFor({ runId, scenarioId }) {
  const dir = process.env.TRAILIE_EVAL_EVIDENCE_DIR || EVIDENCE_DIR;
  return path.join(dir, runId, `${scenarioId}.json`);
}

/** Reads the failed run's own ledger totals. Never invents a value. */
function defaultEvidenceReader({ runId, scenarioId }) {
  try {
    return JSON.parse(fs.readFileSync(evidenceFileFor({ runId, scenarioId }), 'utf8'));
  } catch {
    return null;
  }
}

/** A dimension is usable only when the evidence carries a finite number. */
function finiteOrUnknown(value) {
  return Number.isFinite(value) ? value : null;
}

function measuredExposure(evidence, reviewed) {
  const ledger = evidence?.ledger;
  if (!ledger || typeof ledger !== 'object') return null;
  if (reviewed.totalsMode !== 'current_entries') {
    const totals = ledger.totals;
    if (!totals || typeof totals !== 'object') return null;
    return {
      costKnown: totals.costKnown !== false,
      requests: finiteOrUnknown(totals.providerRequests),
      costUsd: finiteOrUnknown(totals.estimatedCostUsd),
      inputTokens: finiteOrUnknown(totals.inputTokens),
      outputTokens: finiteOrUnknown(totals.outputTokens),
    };
  }
  const entries = Array.isArray(ledger.entries) ? ledger.entries : null;
  if (!entries) return null;
  const knownCosts = entries.every((entry) => Number.isFinite(entry.estimatedCostUsd));
  return {
    costKnown: knownCosts,
    requests: entries.length,
    costUsd: knownCosts ? entries.reduce((sum, entry) => sum + entry.estimatedCostUsd, 0) : null,
    inputTokens: entries.every((entry) => Number.isFinite(entry.actualInputTokens))
      ? entries.reduce((sum, entry) => sum + entry.actualInputTokens, 0) : null,
    outputTokens: entries.every((entry) => Number.isFinite(entry.actualOutputTokens))
      ? entries.reduce((sum, entry) => sum + entry.actualOutputTokens, 0) : null,
  };
}

/**
 * §2/§3 — resolve all four dimensions together, from evidence, or fail closed.
 *
 * @param {Object} [params]
 * @param {Function} [params.readEvidence] injectable for tests
 * @param {Function} [params.readAudit] injectable cross-check
 * @returns {{resolved: true, exposure: Object, source: string, priorTotals: Object}
 *          |{resolved: false, boundedCode: string, reasons: string[], unknownDimensions: string[]}}
 */
function resolvePriorCumulativeExposure({
  readEvidence = defaultEvidenceReader,
  readAudit = null,
  reviewed = REVIEWED_PRIOR_EXPOSURE,
} = {}) {
  const reasons = [];
  const unknownDimensions = [];
  const compositeSources = readEvidence === defaultEvidenceReader && Array.isArray(reviewed.sources);
  const sources = compositeSources ? reviewed.sources : [{ ...reviewed, sources: undefined, totalsMode: 'ledger_totals' }];
  const measuredParts = [];
  for (const source of sources) {
    const evidence = readEvidence({ runId: source.runId, scenarioId: source.scenarioId });
    if (!evidence || typeof evidence !== 'object') {
      reasons.push(compositeSources
        ? `failed_run_evidence_unreadable:${source.scenarioId}` : 'failed_run_evidence_unreadable');
      continue;
    }
    const part = measuredExposure(evidence, source);
    if (!part) {
      reasons.push(compositeSources
        ? `failed_run_ledger_totals_missing:${source.scenarioId}` : 'failed_run_ledger_totals_missing');
      continue;
    }
    if (!part.costKnown) reasons.push(compositeSources
      ? `failed_run_cost_unknown:${source.scenarioId}` : 'failed_run_cost_unknown');
    for (const dimension of DIMENSIONS) {
      if (part[dimension] === null) { /* aggregated below */ }
      else if (Math.abs(part[dimension] - source[dimension]) > 1e-9) {
        reasons.push(compositeSources
          ? `failed_run_evidence_disagrees_on_${dimension}:${source.scenarioId}`
          : `failed_run_evidence_disagrees_on_${dimension}`);
      }
    }
    measuredParts.push(part);
  }
  const measured = Object.fromEntries(DIMENSIONS.map((dimension) => [
    dimension,
    measuredParts.length === sources.length && measuredParts.every((part) => part[dimension] !== null)
      ? measuredParts.reduce((sum, part) => sum + part[dimension], 0) : null,
  ]));
  for (const dimension of DIMENSIONS) {
    // `null` here means absent or non-finite — NEVER "therefore zero".
    if (measured[dimension] === null) unknownDimensions.push(dimension);
  }

  // The source sum must agree with the reviewed cumulative record.
  const disagreements = DIMENSIONS.filter(
    (d) => measured[d] !== null && Math.abs(measured[d] - reviewed[d]) > 1e-9,
  );
  for (const d of disagreements) reasons.push(`failed_run_evidence_disagrees_on_${d}`);

  // Optional cross-check against the audit record's reconciliation.
  if (typeof readAudit === 'function') {
    const audit = readAudit();
    const reconciled = audit?.reconciliation?.revisedConservativeTotalUsd;
    if (audit && !audit.reconciliation) reasons.push('failed_run_reconciliation_missing');
    else if (sources.length === 1 && Number.isFinite(reconciled) && measured.costUsd !== null
      && Math.abs(reconciled - measured.costUsd) > 1e-9) {
      reasons.push('failed_run_reconciliation_disagrees_on_cost');
    }
    if (audit && audit.reconciliation && audit.reconciliation.ok === false) {
      reasons.push('failed_run_reconciliation_failed');
    }
  }

  if (unknownDimensions.length > 0 || reasons.length > 0) {
    return { resolved: false, boundedCode: UNRESOLVED, reasons, unknownDimensions };
  }

  const exposure = {
    requests: measured.requests,
    costUsd: Number(measured.costUsd.toFixed(6)),
    inputTokens: measured.inputTokens,
    outputTokens: measured.outputTokens,
  };

  return {
    resolved: true,
    exposure,
    source: 'consumed_live_attempt_evidence_ledgers',
    evidenceFiles: sources
      .filter((source) => typeof source.runId === 'string' && typeof source.scenarioId === 'string')
      .map((source) => path.relative(REPO_ROOT, evidenceFileFor(source))),
    // The exact shape `createRunLedger` consumes, so every consumer of this
    // record enforces the SAME four numbers.
    priorTotals: {
      requests: exposure.requests,
      inputTokens: exposure.inputTokens,
      outputTokens: exposure.outputTokens,
      costUsd: exposure.costUsd,
      costKnown: true,
    },
  };
}

/**
 * Throwing form, for the paths where an unresolved prior exposure must stop the
 * caller rather than be inspected.
 */
function assertPriorCumulativeExposure(params) {
  const result = resolvePriorCumulativeExposure(params);
  if (!result.resolved) {
    const error = new Error(result.boundedCode);
    error.code = result.boundedCode;
    error.reasons = result.reasons;
    error.unknownDimensions = result.unknownDimensions;
    error.providerDispatchBlocked = true;
    throw error;
  }
  return result;
}

module.exports = {
  UNRESOLVED,
  DIMENSIONS,
  REVIEWED_PRIOR_EXPOSURE,
  REVIEWED_EXPOSURE_SOURCES,
  EVIDENCE_DIR,
  defaultEvidenceReader,
  resolvePriorCumulativeExposure,
  assertPriorCumulativeExposure,
};
