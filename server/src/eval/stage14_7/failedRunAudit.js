'use strict';

/**
 * Stage 14.7I §1/§9/§15 — the permanent record of the failed live run, and the
 * cumulative exposure it carries forward.
 *
 * The Stage 14.7 live confirmation reached the provider, spent three requests,
 * and failed. That result is final. This module records it as audit evidence,
 * reconciles what its ledger can actually prove, and makes the remaining budget
 * derive from it — so a future replacement run inherits the exposure instead of
 * restarting a fresh $0.75.
 *
 * Nothing here can mark `basic-02-three-day` available again. It was genuinely
 * consumed and its consumption marker is untouched.
 */

const fs = require('fs');
const path = require('path');

const SERVER_ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

const AUDIT_DIR = path.join(REPO_ROOT, 'artifacts/private/stage14_7-audit');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'artifacts/private/stage14_7-live');

// Stage 14.7L §2 — the ONE canonical prior-exposure resolver.
const { resolvePriorCumulativeExposure } = require('./priorCumulativeExposure');

/** The Stage 14.7 cumulative cap. Not raised by this stage. */
const CUMULATIVE_CAP_USD = 0.75;

/** §1 — the failed run, permanently. */
const FAILED_RUN = Object.freeze({
  scenarioId: 'basic-02-three-day',
  runId: 'stage147g-msga12h5-30340b',
  decision: 'STAGE14_7_LIVE_CONFIRMATION_FAILED',
  providerDispatchAuthorized: true,
  providerRequests: 3,
  conservativeCostUsd: 0.32,
  actualBilledCostUsd: null,
  resetPermitted: false,
  rootCause: 'claude_model_not_resolved_on_tool_first_path',
});


function auditDir() {
  return process.env.TRAILIE_EVAL_AUDIT_DIR || AUDIT_DIR;
}

function evidenceDirFor(runId) {
  return path.join(process.env.TRAILIE_EVAL_EVIDENCE_DIR || EVIDENCE_DIR, runId);
}

function writeFsynced(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, 'w');
  try {
    fs.writeFileSync(fd, JSON.stringify(payload, null, 2) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return file;
}

/**
 * §9 — reconcile the failed run's ledger from its OWN captured evidence.
 *
 * Makes no provider call and rewrites no historical row. A successful streaming
 * attempt is settled to actual usage ONLY when the captured evidence contains
 * terminal usage; otherwise its reservation stands. The two 400 rejections keep
 * their reservations too: a rejected request very likely billed nothing, but
 * "likely" is not evidence, and inventing a zero would be exactly the failure
 * mode the conservative accounting exists to prevent.
 */
function reconcileFailedRun({ runId = FAILED_RUN.runId, scenarioId = FAILED_RUN.scenarioId } = {}) {
  const file = path.join(evidenceDirFor(runId), `${scenarioId}.json`);
  let evidence = null;
  try {
    evidence = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { ok: false, boundedCode: 'failed_run_evidence_unreadable' };
  }

  const entries = (evidence.ledger && evidence.ledger.entries) || [];
  const recovered = [];
  const stillReserved = [];

  for (const entry of entries) {
    const hasActual = Number.isFinite(entry.actualInputTokens) || Number.isFinite(entry.actualOutputTokens);
    if (hasActual && entry.settlementStatus === 'settled_actual') {
      recovered.push({
        phase: entry.phase,
        attemptNumber: entry.attemptNumber,
        actualInputTokens: entry.actualInputTokens,
        actualOutputTokens: entry.actualOutputTokens,
        estimatedCostUsd: entry.estimatedCostUsd,
      });
    } else {
      stillReserved.push({
        phase: entry.phase,
        attemptNumber: entry.attemptNumber,
        outcome: entry.outcome,
        reservedCostUsd: entry.estimatedCostUsd,
        // §8 — a provider validation rejection is reported as such rather than
        // being assumed free.
        providerRejectedBeforeGeneration: entry.outcome === 'failed',
        usageReported: false,
      });
    }
  }

  const originalConservativeTotalUsd = Number(
    ((evidence.ledger && evidence.ledger.totals && evidence.ledger.totals.estimatedCostUsd) || 0).toFixed(6),
  );
  // No actual usage was recoverable, so the revised total equals the original.
  const revisedConservativeTotalUsd = Number(
    (recovered.reduce((n, r) => n + (r.estimatedCostUsd || 0), 0)
      + stillReserved.reduce((n, r) => n + (r.reservedCostUsd || 0), 0)).toFixed(6),
  );

  return {
    ok: true,
    runId,
    scenarioId,
    originalConservativeTotalUsd,
    recoveredActualUsageAttempts: recovered.length,
    stillReservedAttempts: stillReserved.length,
    revisedConservativeTotalUsd,
    cumulativeRemainingCapUsd: Number((CUMULATIVE_CAP_USD - revisedConservativeTotalUsd).toFixed(6)),
    recovered,
    stillReserved,
    // The historical ledger is referenced, never edited.
    referencesEvidence: path.relative(REPO_ROOT, file),
  };
}

/** §1 — write (or refresh) the permanent audit record. */
function writeFailedRunAudit({ reconciliation = null } = {}) {
  const record = {
    ...FAILED_RUN,
    reconciliation: reconciliation || reconcileFailedRun(),
    recordedAt: new Date().toISOString(),
  };
  const file = path.join(auditDir(), `${FAILED_RUN.runId}-${FAILED_RUN.scenarioId}.json`);
  writeFsynced(file, record);
  return { record, file: path.relative(REPO_ROOT, file) };
}

function readFailedRunAudit() {
  const file = path.join(auditDir(), `${FAILED_RUN.runId}-${FAILED_RUN.scenarioId}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * §15 — the cumulative exposure a future run must inherit.
 *
 * A replacement run does NOT restart the $0.75 ledger. `priorTotals` is seeded
 * from this so the ledger's own cap projection refuses a request the remaining
 * allowance cannot cover.
 */
/**
 * §15, superseded by Stage 14.7L §2 — a thin delegation to the ONE canonical
 * prior-exposure resolver.
 *
 * This function used to compute the exposure itself: requests and cost from the
 * audit record, and tokens from nothing at all (literal zeros). That second
 * seed is what silently under-reported 60,000 input and 20,000 output tokens
 * through Stage 14.7J and 14.7K. There is now a single resolver that answers
 * all four dimensions together from the preserved evidence, and this function
 * exists only so existing callers keep working.
 *
 * §3 — an unresolved exposure is NOT smoothed into defaults here. It is
 * returned as `resolved: false` with a bounded code, and every consumer refuses.
 */
function cumulativeExposure() {
  const resolution = resolvePriorCumulativeExposure({ readAudit: readFailedRunAudit });

  if (!resolution.resolved) {
    return {
      resolved: false,
      boundedCode: resolution.boundedCode,
      reasons: resolution.reasons,
      unknownDimensions: resolution.unknownDimensions,
      cumulativeCapUsd: CUMULATIVE_CAP_USD,
      // Deliberately absent: no `priorTotals`. A caller that reached for one
      // and found zeros is exactly the failure this stage removes.
      priorTotals: null,
    };
  }

  const { exposure, priorTotals } = resolution;
  return {
    resolved: true,
    source: resolution.source,
    evidenceFile: resolution.evidenceFile,
    cumulativeCapUsd: CUMULATIVE_CAP_USD,
    priorConservativeCostUsd: exposure.costUsd,
    priorProviderRequests: exposure.requests,
    priorInputTokens: exposure.inputTokens,
    priorOutputTokens: exposure.outputTokens,
    remainingCapUsd: Number((CUMULATIVE_CAP_USD - exposure.costUsd).toFixed(6)),
    // The shape `createRunLedger` consumes, so caps bind across runs.
    priorTotals,
  };
}

module.exports = {
  CUMULATIVE_CAP_USD,
  FAILED_RUN,
  AUDIT_DIR,
  auditDir,
  reconcileFailedRun,
  writeFailedRunAudit,
  readFailedRunAudit,
  cumulativeExposure,
};
