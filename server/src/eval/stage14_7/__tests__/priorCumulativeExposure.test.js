'use strict';

/**
 * Stage 14.7L §2/§3/§7/§8 — the canonical prior-exposure record, its
 * fail-closed behaviour, and its propagation through every handoff.
 *
 * THE DEFECT THIS PINS
 * --------------------
 * Prior exposure used to come from two seeds: requests and cost from the audit
 * record, tokens from nothing at all. The token seed reported literal zeros, so
 * two consecutive stages compared plan-only token figures against cumulative
 * token caps and both concluded the remaining plan fit when it did not.
 *
 * Every test below is deterministic and makes zero provider calls.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP_MARKERS = fs.mkdtempSync(path.join(os.tmpdir(), 'stage147l-markers-'));
process.env.TRAILIE_EVAL_CONSUMPTION_DIR = TMP_MARKERS;

const {
  UNRESOLVED, DIMENSIONS, REVIEWED_PRIOR_EXPOSURE,
  resolvePriorCumulativeExposure, assertPriorCumulativeExposure,
} = require('../priorCumulativeExposure');
const { cumulativeExposure, readFailedRunAudit } = require('../failedRunAudit');
const {
  projectFullRunBudget, defaultSeed, CUMULATIVE_CAPS,
} = require('../fullRunBudgetProjection');
const { createLiveProviderLedger } = require('../liveProviderLedger');
const { executeLiveScenarios } = require('../liveExecutor');
const { LIVE_SCENARIO_MANIFEST, calculatePaidExecutionReadiness } = require('../liveScenarioManifest');

/** The failed run's real ledger totals, as its evidence records them. */
const TRUE_EXPOSURE = { requests: 7, costUsd: 0.671058, inputTokens: 134519, outputTokens: 40202 };

const evidenceWith = (totals) => () => ({
  ledger: { totals: { costKnown: true, providerRequests: totals.requests, estimatedCostUsd: totals.costUsd, inputTokens: totals.inputTokens, outputTokens: totals.outputTokens } },
});

describe('Stage 14.7L §2 — one canonical record, all four dimensions', () => {
  test('the four dimensions are named once, together', () => {
    expect(DIMENSIONS).toEqual(['requests', 'costUsd', 'inputTokens', 'outputTokens']);
  });

  test('it resolves from the failed run\'s own evidence ledger', () => {
    const r = resolvePriorCumulativeExposure({ readAudit: readFailedRunAudit });
    expect(r.resolved).toBe(true);
    expect(r.source).toBe('consumed_live_attempt_evidence_ledgers');
    expect(r.exposure).toMatchObject(TRUE_EXPOSURE);
    expect(r.evidenceFiles).toHaveLength(3);
  });

  test('the reviewed record and the evidence agree on every dimension', () => {
    for (const d of DIMENSIONS) expect(REVIEWED_PRIOR_EXPOSURE[d]).toBe(TRUE_EXPOSURE[d]);
  });

  test('the ledger-consumable shape carries all four', () => {
    const { priorTotals } = resolvePriorCumulativeExposure();
    expect(priorTotals).toEqual({
      requests: 7, inputTokens: 134519, outputTokens: 40202, costUsd: 0.671058, costKnown: true,
    });
  });
});

describe('Stage 14.7L §3 — unknown fails closed, never becomes zero', () => {
  test('unreadable evidence is unresolved on every dimension', () => {
    const r = resolvePriorCumulativeExposure({ readEvidence: () => null });
    expect(r.resolved).toBe(false);
    expect(r.boundedCode).toBe(UNRESOLVED);
    expect(r.reasons).toContain('failed_run_evidence_unreadable');
    expect(r.unknownDimensions).toEqual(DIMENSIONS);
  });

  test('a tokenless ledger summary is unresolved, NOT zero tokens', () => {
    // The precise shape that produced the defect: cost and requests present,
    // tokens absent. The old code read this as "no token exposure".
    const r = resolvePriorCumulativeExposure({
      readEvidence: () => ({ ledger: { totals: { providerRequests: 5, estimatedCostUsd: 0.472758, costKnown: true } } }),
    });
    expect(r.resolved).toBe(false);
    expect(r.unknownDimensions).toEqual(['inputTokens', 'outputTokens']);
  });

  test.each(DIMENSIONS)('§7 — dropping %s alone fails closed', (dimension) => {
    const totals = { ...TRUE_EXPOSURE };
    delete totals[dimension];
    const r = resolvePriorCumulativeExposure({ readEvidence: evidenceWith(totals) });
    expect(r.resolved).toBe(false);
    expect(r.boundedCode).toBe(UNRESOLVED);
    expect(r.unknownDimensions).toEqual([dimension]);
  });

  test.each(DIMENSIONS)('§7 — a non-finite %s fails closed', (dimension) => {
    const r = resolvePriorCumulativeExposure({
      readEvidence: evidenceWith({ ...TRUE_EXPOSURE, [dimension]: NaN }),
    });
    expect(r.resolved).toBe(false);
    expect(r.unknownDimensions).toEqual([dimension]);
  });

  test('KNOWN ZERO and UNKNOWN are different answers', () => {
    // A run that genuinely spent nothing resolves to zero and is usable.
    const knownZero = resolvePriorCumulativeExposure({
      readEvidence: evidenceWith({ requests: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 }),
      reviewed: { ...REVIEWED_PRIOR_EXPOSURE, requests: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 },
    });
    expect(knownZero.resolved).toBe(true);
    expect(knownZero.exposure).toMatchObject({ requests: 0, inputTokens: 0, outputTokens: 0 });

    // An absent field is not zero.
    const unknown = resolvePriorCumulativeExposure({ readEvidence: evidenceWith({ requests: 0, costUsd: 0 }) });
    expect(unknown.resolved).toBe(false);
  });

  test('malformed evidence is unresolved', () => {
    for (const bad of [{}, { ledger: {} }, { ledger: { totals: 'nope' } }]) {
      expect(resolvePriorCumulativeExposure({ readEvidence: () => bad }).resolved).toBe(false);
    }
  });

  test('an unpriced cost component is unresolved', () => {
    const r = resolvePriorCumulativeExposure({
      readEvidence: () => ({ ledger: { totals: { ...evidenceWith(TRUE_EXPOSURE)().ledger.totals, costKnown: false } } }),
    });
    expect(r.resolved).toBe(false);
    expect(r.reasons).toContain('failed_run_cost_unknown');
  });

  test('evidence that DISAGREES with the reviewed record is unresolved', () => {
    const r = resolvePriorCumulativeExposure({
      readEvidence: evidenceWith({ ...TRUE_EXPOSURE, outputTokens: 5 }),
    });
    expect(r.resolved).toBe(false);
    expect(r.reasons).toContain('failed_run_evidence_disagrees_on_outputTokens');
  });

  test('a failed reconciliation is unresolved', () => {
    const r = resolvePriorCumulativeExposure({
      readEvidence: evidenceWith(TRUE_EXPOSURE),
      readAudit: () => ({ reconciliation: { ok: false, revisedConservativeTotalUsd: 0.472758 } }),
    });
    expect(r.resolved).toBe(false);
    expect(r.reasons).toContain('failed_run_reconciliation_failed');
  });

  test('a missing reconciliation record is unresolved', () => {
    const r = resolvePriorCumulativeExposure({
      readEvidence: evidenceWith(TRUE_EXPOSURE), readAudit: () => ({}),
    });
    expect(r.resolved).toBe(false);
    expect(r.reasons).toContain('failed_run_reconciliation_missing');
  });

  test('the throwing form is marked as blocking dispatch', () => {
    try {
      assertPriorCumulativeExposure({ readEvidence: () => null });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error.code).toBe(UNRESOLVED);
      expect(error.providerDispatchBlocked).toBe(true);
    }
  });
});

describe('Stage 14.7L §7 — exact propagation through every handoff', () => {
  test('historical ledger → reconciliation → cumulativeExposure', () => {
    const e = cumulativeExposure();
    expect(e.resolved).toBe(true);
    expect(e.priorProviderRequests).toBe(TRUE_EXPOSURE.requests);
    expect(e.priorConservativeCostUsd).toBe(TRUE_EXPOSURE.costUsd);
    expect(e.priorInputTokens).toBe(TRUE_EXPOSURE.inputTokens);
    expect(e.priorOutputTokens).toBe(TRUE_EXPOSURE.outputTokens);
  });

  test('cumulativeExposure → manifest projector', () => {
    const seed = defaultSeed();
    expect(seed.ok).toBe(true);
    expect(seed.seed).toMatchObject({
      priorRequests: 7, priorConservativeCostUsd: 0.671058,
      priorInputTokens: 134519, priorOutputTokens: 40202,
    });
    const p = projectFullRunBudget({ atDate: '2026-08-05' });
    expect(p.priorRequests).toBe(TRUE_EXPOSURE.requests);
    expect(p.priorConservativeExposureUsd).toBe(TRUE_EXPOSURE.costUsd);
    expect(p.priorReservedInputTokens).toBe(TRUE_EXPOSURE.inputTokens);
    expect(p.priorReservedOutputTokens).toBe(TRUE_EXPOSURE.outputTokens);
  });

  test('cumulativeExposure → provider ledger → per-dispatch cap check', () => {
    const ledger = createLiveProviderLedger({
      model: 'claude-sonnet-5',
      caps: {
        maxRequests: CUMULATIVE_CAPS.cumulativeRequestCap,
        maxInputTokens: CUMULATIVE_CAPS.cumulativeInputTokenCap,
        maxOutputTokens: CUMULATIVE_CAPS.cumulativeOutputTokenCap,
        maxCostUsd: CUMULATIVE_CAPS.cumulativeCostCapUsd,
      },
      priorTotals: cumulativeExposure().priorTotals,
    });
    const t = ledger.totals();
    // All four dimensions arrive at the thing that actually refuses calls.
    expect(t.requests).toBe(TRUE_EXPOSURE.requests);
    expect(t.inputTokens).toBe(TRUE_EXPOSURE.inputTokens);
    expect(t.outputTokens).toBe(TRUE_EXPOSURE.outputTokens);
    expect(t.costUsd).toBeCloseTo(TRUE_EXPOSURE.costUsd, 6);
    expect(ledger.report().priorTotals).toEqual(cumulativeExposure().priorTotals);
  });

  test('every handoff reports the SAME four numbers', () => {
    const viaResolver = resolvePriorCumulativeExposure().priorTotals;
    const viaAudit = cumulativeExposure().priorTotals;
    const viaSeed = defaultSeed().seed;
    const viaProjection = projectFullRunBudget({ atDate: '2026-08-05' });
    const viaLedger = createLiveProviderLedger({
      model: 'claude-sonnet-5', caps: {}, priorTotals: viaAudit,
    }).totals();

    expect(viaAudit).toEqual(viaResolver);
    expect(viaSeed.priorRequests).toBe(viaResolver.requests);
    expect(viaSeed.priorInputTokens).toBe(viaResolver.inputTokens);
    expect(viaSeed.priorOutputTokens).toBe(viaResolver.outputTokens);
    expect(viaSeed.priorConservativeCostUsd).toBe(viaResolver.costUsd);
    expect(viaProjection.priorRequests).toBe(viaResolver.requests);
    expect(viaProjection.priorReservedInputTokens).toBe(viaResolver.inputTokens);
    expect(viaProjection.priorReservedOutputTokens).toBe(viaResolver.outputTokens);
    expect(viaLedger.requests).toBe(viaResolver.requests);
    expect(viaLedger.inputTokens).toBe(viaResolver.inputTokens);
    expect(viaLedger.outputTokens).toBe(viaResolver.outputTokens);
  });

  test('there is no second prior seed left to drift', () => {
    const projectorSrc = fs.readFileSync(path.join(__dirname, '..', 'fullRunBudgetProjection.js'), 'utf8');
    const auditSrc = fs.readFileSync(path.join(__dirname, '..', 'failedRunAudit.js'), 'utf8');
    // No literal prior figures outside the canonical resolver.
    expect(projectorSrc).not.toMatch(/priorInputTokens:\s*\d/);
    expect(projectorSrc).not.toMatch(/priorRequests:\s*\d/);
    expect(auditSrc).not.toMatch(/inputTokens:\s*0\b/);
    expect(projectorSrc).toMatch(/resolvePriorCumulativeExposure/);
    expect(auditSrc).toMatch(/resolvePriorCumulativeExposure/);
  });
});

describe('Stage 14.7R — closed-plan cumulative caps', () => {
  const at = '2026-08-05';

  test('the previous token ceilings still cover the completed exposure', () => {
    const old = projectFullRunBudget({
      atDate: at, seed: { cumulativeInputTokenCap: 180000, cumulativeOutputTokenCap: 80000 },
    });
    expect(old.cumulativeBudgetFeasible).toBe(true);
    expect(old.blockingCaps).toEqual([]);
    expect(old.boundedCode).toBeNull();
  });

  test('the current ceilings fit on all four dimensions', () => {
    const now = projectFullRunBudget({ atDate: at });
    expect(now.cumulativeInputTokenCap).toBe(240000);
    expect(now.cumulativeOutputTokenCap).toBe(100000);
    expect(now.cumulativeBudgetFeasible).toBe(true);
    expect(now.blockingCaps).toEqual([]);
  });

  test('the measured headroom on all four dimensions', () => {
    const now = projectFullRunBudget({ atDate: at });
    expect(Number((now.cumulativeCostCapUsd - now.cumulativeProjectedCostUsd).toFixed(6))).toBeCloseTo(0.828942, 6);
    expect(now.cumulativeRequestCap - now.cumulativeProjectedRequests).toBe(5);
    expect(now.cumulativeInputTokenCap - now.cumulativeProjectedInputTokens).toBe(105481);
    expect(now.cumulativeOutputTokenCap - now.cumulativeProjectedOutputTokens).toBe(59798);
  });

  test.each([
    ['134518 input token cap', { cumulativeInputTokenCap: 134518 }, 'max_input_tokens'],
    ['40201 output token cap', { cumulativeOutputTokenCap: 40201 }, 'max_output_tokens'],
    ['6 request cap', { cumulativeRequestCap: 6 }, 'max_requests'],
    ['$0.671057 cost cap', { cumulativeCostCapUsd: 0.671057 }, 'max_total_cost_usd'],
  ])('%s blocks', (_label, seed, expectedCap) => {
    const r = projectFullRunBudget({ atDate: at, seed });
    expect(r.cumulativeBudgetFeasible).toBe(false);
    expect(r.blockingCaps).toContain(expectedCap);
  });

  test('the exact four-dimensional minimum passes without applying it', () => {
    const exact = projectFullRunBudget({
      atDate: at,
      seed: {
        cumulativeRequestCap: 7,
        cumulativeCostCapUsd: 0.671058,
        cumulativeInputTokenCap: 134519,
        cumulativeOutputTokenCap: 40202,
      },
    });
    expect(exact.cumulativeBudgetFeasible).toBe(true);
    expect(exact.minimumCapsForCompletePlan.applied).toBe(false);
  });
});

describe('Stage 14.7L §3/§10 — the run refuses when exposure is unresolved', () => {
  const mustNotRun = () => { throw new Error('scenario_should_not_have_run'); };
  const mustNotValidate = () => { throw new Error('prerequisites_should_not_have_been_checked'); };

  test('readiness reports the unresolved exposure separately from feasibility', () => {
    const readiness = calculatePaidExecutionReadiness({
      liveExecutorTechnicalReady: true,
      manifest: { matchesReviewedManifest: true },
      budgetProjection: { cumulativeExposureResolved: false, cumulativeBudgetFeasible: false },
    });
    expect(readiness.cumulativeExposureResolved).toBe(false);
    expect(readiness.liveExecutionReady).toBe(false);
    expect(readiness.blockedBy).toContain('prior_cumulative_exposure_unresolved');
  });

  test('exposure resolves but paid execution remains closed after adjudication', () => {
    const readiness = calculatePaidExecutionReadiness({
      liveExecutorTechnicalReady: true,
      manifest: { matchesReviewedManifest: true },
      budgetProjection: projectFullRunBudget({ atDate: '2026-08-05' }),
    });
    expect(readiness).toMatchObject({
      liveExecutorTechnicalReady: true,
      liveScenarioManifestReady: true,
      cumulativeExposureResolved: true,
      cumulativeBudgetFeasible: true,
      liveExecutionReady: false,
    });
    expect(readiness.blockedBy).toContain('stage14_7_complete_no_live_execution_authorized');
  });

  test('the projector itself fails closed when the exposure cannot be resolved', () => {
    // Point the evidence directory at an empty path: the record is gone.
    const saved = process.env.TRAILIE_EVAL_EVIDENCE_DIR;
    process.env.TRAILIE_EVAL_EVIDENCE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'stage147l-noevidence-'));
    try {
      const r = projectFullRunBudget({ atDate: '2026-08-05' });
      expect(r.cumulativeExposureResolved).toBe(false);
      expect(r.cumulativeBudgetFeasible).toBe(false);
      expect(r.decision).toBe('LIVE_EXECUTION_NOT_STARTED');
      expect(r.boundedCode).toBe(UNRESOLVED);
      // And nothing was written or spent while discovering that.
      expect(r.sideEffects).toEqual({ scenarioMarkersWritten: 0, providerCalls: 0, providerCostUsd: 0 });
    } finally {
      if (saved === undefined) delete process.env.TRAILIE_EVAL_EVIDENCE_DIR;
      else process.env.TRAILIE_EVAL_EVIDENCE_DIR = saved;
    }
  });

  test('the EXECUTOR refuses before the manifest gate and before any marker', async () => {
    const saved = process.env.TRAILIE_EVAL_EVIDENCE_DIR;
    process.env.TRAILIE_EVAL_EVIDENCE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'stage147l-noevidence-'));
    const before = fs.readdirSync(TMP_MARKERS);
    try {
      const result = await executeLiveScenarios({
        env: {}, runId: 'stage147l-unresolved',
        scenarios: [...LIVE_SCENARIO_MANIFEST.scenarios],
        runScenario: mustNotRun, validatePrerequisites: mustNotValidate,
      });
      expect(result.executionStatus).toBe('LIVE_EXECUTION_NOT_STARTED');
      expect(result.stopReason).toBe(UNRESOLVED);
      expect(result.cumulativeExposureResolved).toBe(false);
      expect(result.scenariosRun).toBe(0);
      expect(result.liveProviderCalls).toBe(0);
      expect(result.totals).toBeNull();
      expect(fs.readdirSync(TMP_MARKERS)).toEqual(before);
    } finally {
      if (saved === undefined) delete process.env.TRAILIE_EVAL_EVIDENCE_DIR;
      else process.env.TRAILIE_EVAL_EVIDENCE_DIR = saved;
    }
  });
});
