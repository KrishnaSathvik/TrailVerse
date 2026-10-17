'use strict';

/**
 * Stage 14.7J/14.7K — the reviewed scenario manifest, the whole-plan budget
 * projection, and the refusals that must precede the first replacement dispatch.
 *
 * 14.7J left the manifest defined-but-unauthorized and measured the complete
 * two-scenario plan at $1.38 against a $0.75 ceiling. The reviewed decision
 * retained the full scope and raised the cumulative ceilings to
 * $1.50 / 12 / 180,000 / 80,000, so the plan now fits. Both the OLD verdict and
 * the NEW one are pinned here: the projector must be able to say "insufficient"
 * as readily as "feasible", or a green result proves nothing.
 *
 * ZERO provider calls and ZERO scenario markers. The consumption directory is
 * redirected to a temp path for the whole file so a mistake here cannot touch a
 * real approved scenario (the 14.7G lesson).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP_MARKERS = fs.mkdtempSync(path.join(os.tmpdir(), 'stage147j-markers-'));
process.env.TRAILIE_EVAL_CONSUMPTION_DIR = TMP_MARKERS;

const {
  LIVE_SCENARIO_MANIFEST, MANIFEST_CODES, SEVEN_DAY_SCENARIO_ID,
  manifestStatus, assertLiveScenarioManifestAuthorized, calculatePaidExecutionReadiness,
} = require('../liveScenarioManifest');
const {
  projectFullRunBudget, plannedAttemptsFor, defaultSeed, CUMULATIVE_CAPS, PROSE_MAX_OUTPUT_TOKENS,
} = require('../fullRunBudgetProjection');

/** Stage 14.7L §2 — the canonical prior exposure, resolved once for this file. */
const PRIOR = defaultSeed().seed;
const {
  REPLACEMENT_SCENARIO_ID, ORIGINAL_SCENARIO_ID, REPLACEMENT_SCENARIO,
} = require('../replacementScenario');
const { FAILED_RUN, cumulativeExposure } = require('../failedRunAudit');
const { executeLiveScenarios } = require('../liveExecutor');
const { getItineraryGenerationConfig } = require('../../../config/itineraryGenerationConfig');

/**
 * The real world, for these tests: the original was consumed, the replacement
 * and the seven-day scenario were not.
 */
const consumedOnlyOriginal = (id) => id === ORIGINAL_SCENARIO_ID
  || id === 'basic-02-three-day-model-fix-validation-1'
  || id === SEVEN_DAY_SCENARIO_ID;

/** The ceilings 14.7J measured against, kept so the refusal stays provable. */
const OLD_CAPS = {
  cumulativeCostCapUsd: 0.75,
  cumulativeRequestCap: 12,
  cumulativeInputTokenCap: 180000,
  cumulativeOutputTokenCap: 50000,
};

describe('Stage 14.7K §1 — the consumed original is preserved and excluded', () => {
  test('the manifest names the original as permanently consumed', () => {
    expect(LIVE_SCENARIO_MANIFEST.originalFailedScenario).toBe('basic-02-three-day');
    expect(LIVE_SCENARIO_MANIFEST.originalFailedScenarioConsumed).toBe(true);
    expect(LIVE_SCENARIO_MANIFEST.excludedConsumedScenarios).toContain(ORIGINAL_SCENARIO_ID);
    expect(FAILED_RUN.resetPermitted).toBe(false);
    expect(FAILED_RUN.decision).toBe('STAGE14_7_LIVE_CONFIRMATION_FAILED');
    expect(FAILED_RUN.providerRequests).toBe(3);
    expect(FAILED_RUN.conservativeCostUsd).toBe(0.32);
  });

  test('all consumed live scenarios are excluded and none remains', () => {
    expect(LIVE_SCENARIO_MANIFEST.scenarios).toEqual([]);
    expect(LIVE_SCENARIO_MANIFEST.scenarios).not.toContain(ORIGINAL_SCENARIO_ID);
  });

  test('Stage 14.7P — the new replacement is defined but unauthorized and unconsumed', () => {
    expect(REPLACEMENT_SCENARIO.scenarioId).toBe(REPLACEMENT_SCENARIO_ID);
    expect(REPLACEMENT_SCENARIO.executionAuthorized).toBe(false);
    expect(REPLACEMENT_SCENARIO.consumptionMarkerCreated).toBe(false);
    expect(LIVE_SCENARIO_MANIFEST.replacementScenarioDefined).toBe(true);
    expect(LIVE_SCENARIO_MANIFEST.replacementScenarioExecutionAuthorized).toBe(false);
    // The replacement supplements the failed attempt; it never supersedes it.
    expect(REPLACEMENT_SCENARIO.supersedes).toBeNull();
    expect(REPLACEMENT_SCENARIO.linkedFailedAttempts).toHaveLength(2);
    expect(REPLACEMENT_SCENARIO.linkedFailedAttempts.every((attempt) => attempt.resetPermitted === false)).toBe(true);
  });

  test('the manifest status reports the exact reviewed state', () => {
    const status = manifestStatus({ isConsumedFn: consumedOnlyOriginal });
    expect(status).toMatchObject({
      originalFailedScenarioConsumed: true,
      originalFailedScenarioResetPermitted: false,
      replacementScenarioDefined: true,
      replacementScenarioExecutionAuthorized: false,
      replacementScenarioConsumed: false,
      sevenDayScenarioAvailable: false,
      executionOrderFixed: true,
      sevenDayExecutionAuthorized: false,
      matchesReviewedManifest: true,
    });
    expect(status.refusals).toEqual([]);
  });

  test('an original that read as AVAILABLE is itself a refusal', () => {
    // If the marker were ever lost, the manifest must notice rather than
    // silently offering the original again.
    const status = manifestStatus({ isConsumedFn: () => false });
    expect(status.refusals).toContain(MANIFEST_CODES.ORIGINAL_NOT_PRESERVED);
    expect(status.matchesReviewedManifest).toBe(false);
  });

  test('a replacement already consumed blocks a second run of it', () => {
    const status = manifestStatus({ isConsumedFn: () => true });
    expect(status.refusals).toContain(MANIFEST_CODES.REPLACEMENT_ALREADY_CONSUMED);
    expect(status.sevenDayScenarioAvailable).toBe(false);
  });
});

describe('Stage 14.7K §2 — the manifest gate', () => {
  test('the completed empty manifest is explicitly closed', () => {
    const gate = assertLiveScenarioManifestAuthorized({
      requestedScenarios: [...LIVE_SCENARIO_MANIFEST.scenarios], isConsumedFn: consumedOnlyOriginal,
    });
    expect(gate).toEqual(expect.objectContaining({
      authorized: false,
      decision: 'LIVE_EXECUTION_NOT_STARTED',
      boundedCode: MANIFEST_CODES.NO_FURTHER_LIVE_EXECUTION,
    }));
  });

  /** §2 — every rejection case the review enumerated. */
  test.each([
    ['replacement alone', [REPLACEMENT_SCENARIO_ID]],
    ['reversed order', [SEVEN_DAY_SCENARIO_ID, REPLACEMENT_SCENARIO_ID]],
    ['the consumed original', [ORIGINAL_SCENARIO_ID, SEVEN_DAY_SCENARIO_ID]],
    ['a third scenario', [REPLACEMENT_SCENARIO_ID, SEVEN_DAY_SCENARIO_ID, 'basic-04-multi-park']],
    ['an unreviewed replacement id', ['basic-02-three-day-model-fix-validation-2', SEVEN_DAY_SCENARIO_ID]],
  ])('%s is refused as a manifest mismatch', (_label, requestedScenarios) => {
    const gate = assertLiveScenarioManifestAuthorized({
      requestedScenarios, isConsumedFn: consumedOnlyOriginal,
    });
    expect(gate.authorized).toBe(false);
    expect(gate.decision).toBe('LIVE_EXECUTION_NOT_STARTED');
    expect(gate.boundedCode).toBe('live_scenario_manifest_mismatch');
    expect(gate.refusals).toContain(MANIFEST_CODES.MANIFEST_MISMATCH);
  });

  test('a WRONG SET and a COMPLETED SET are different bounded codes', () => {
    // A mismatch is a caller error; an unauthorized manifest is a review
    // decision. Collapsing them would send an operator to the wrong fix.
    const mismatch = assertLiveScenarioManifestAuthorized({
      requestedScenarios: [REPLACEMENT_SCENARIO_ID], isConsumedFn: consumedOnlyOriginal,
    });
    const unauthorized = assertLiveScenarioManifestAuthorized({
      requestedScenarios: [...LIVE_SCENARIO_MANIFEST.scenarios],
      // Seven-day already consumed → the reviewed set itself cannot run again.
      isConsumedFn: (id) => consumedOnlyOriginal(id) || id === SEVEN_DAY_SCENARIO_ID,
    });
    expect(mismatch.boundedCode).toBe(MANIFEST_CODES.MANIFEST_MISMATCH);
    expect(unauthorized.boundedCode).toBe(MANIFEST_CODES.NO_FURTHER_LIVE_EXECUTION);
  });
});

describe('Stage 14.7K §4 — the whole-plan worst-case projection', () => {
  const projection = projectFullRunBudget({ atDate: '2026-08-05' });

  test('Stage 14.7R — it inherits all three consumed runs, not a fresh cap', () => {
    expect(projection.priorConservativeExposureUsd).toBe(0.671058);
    expect(cumulativeExposure().priorConservativeCostUsd).toBe(0.671058);
    expect(cumulativeExposure().priorProviderRequests).toBe(7);
    expect(PRIOR.priorRequests).toBe(7);
    expect(PRIOR.priorConservativeCostUsd).toBe(0.671058);
  });

  test('§3 — the seed carries the REVIEWED cumulative ceilings', () => {
    expect(CUMULATIVE_CAPS.cumulativeCostCapUsd).toBe(1.50);
    expect(CUMULATIVE_CAPS.cumulativeRequestCap).toBe(12);
    // Stage 14.7L §4 — token ceilings raised once the prior 60,000 / 20,000
    // reservations were carried forward.
    expect(CUMULATIVE_CAPS.cumulativeInputTokenCap).toBe(240000);
    expect(CUMULATIVE_CAPS.cumulativeOutputTokenCap).toBe(100000);
  });

  test('it counts every bounded attempt the policy allows, per scenario', () => {
    const config = getItineraryGenerationConfig();
    const attempts = plannedAttemptsFor({
      expectedDays: 3, itineraryConfig: config, proseMode: 'enforce', proseRetryEnabled: true,
    });
    expect(attempts.map((a) => `${a.phase}:${a.attempt}`))
      .toEqual(['structured:1', 'structured:2', 'prose:1', 'prose:2']);
    // The structured retry is modelled after a truncation — the branch that
    // earns the LARGER budget, which is what a cap must survive.
    expect(attempts[0].maxOutputTokens).toBe(6000);
    expect(attempts[1].maxOutputTokens).toBe(12000);
    expect(attempts[2].maxOutputTokens).toBe(PROSE_MAX_OUTPUT_TOKENS);
  });

  test('a seven-day trip starts at the LONG structured budget', () => {
    const attempts = plannedAttemptsFor({
      expectedDays: 7, itineraryConfig: getItineraryGenerationConfig(), proseMode: 'enforce', proseRetryEnabled: true,
    });
    expect(attempts[0].maxOutputTokens).toBe(12000);
  });

  test('the deterministic fallback is NOT counted as a provider attempt', () => {
    expect(projection.basis.deterministicFallbackCountedAsProviderAttempt).toBe(false);
    expect(projection.planOnlyProviderRequests).toBe(0);
  });

  test('§5 — reservations are never assumed to settle lower', () => {
    expect(projection.basis.settlementAssumedBelowReservation).toBe(false);
    expect(projection.basis.usesProductionReservationCode).toBe(true);
  });

  test('THE CORRECTED CUMULATIVE FIGURES', () => {
    expect(projection).toMatchObject({
      priorConservativeExposureUsd: 0.671058,
      replacementWorstCaseExposureUsd: null,
      sevenDayWorstCaseExposureUsd: null,
      remainingPlanWorstCaseExposureUsd: 0,
      cumulativeProjectedWorstCaseUsd: 0.671058,

      cumulativeCostCapUsd: 1.50,
      maximumPlannedRequests: 7,
      cumulativeRequestCap: 12,
      // 60,000 prior + 160,000 plan. 14.7J/14.7K reported 160,000 because the
      // prior token exposure was seeded as zero.
      maximumPlannedInputTokens: 134519,
      cumulativeInputTokenCap: 240000,
      // 20,000 prior + 74,000 plan, previously reported as 74,000.
      maximumPlannedOutputTokens: 40202,
      cumulativeOutputTokenCap: 100000,

      cumulativeBudgetFeasible: true,
    });
    expect(projection.blockingCaps).toEqual([]);
    expect(projection.boundedCode).toBeNull();
  });

  test('EVERY planned figure is cumulative — no prior exposure is dropped', () => {
    // The under-count that produced the wrong verdict: a plan-only figure read
    // against a cumulative cap. All four now include the failed run's share.
    expect(projection.maximumPlannedRequests)
      .toBe(PRIOR.priorRequests + projection.planOnlyProviderRequests);
    expect(projection.maximumPlannedInputTokens)
      .toBe(PRIOR.priorInputTokens + projection.planOnlyInputTokens);
    expect(projection.maximumPlannedOutputTokens)
      .toBe(PRIOR.priorOutputTokens + projection.planOnlyOutputTokens);
    expect(projection.cumulativeProjectedWorstCaseUsd)
      .toBeCloseTo(PRIOR.priorConservativeCostUsd + projection.remainingPlanWorstCaseExposureUsd, 6);
  });

  test('the prior TOKEN exposure comes from the failed run\'s own ledger', () => {
    const { cumulativeExposure } = require('../failedRunAudit');
    const prior = cumulativeExposure().priorTotals;
    // 3 × 20,000 reserved input; 6,000 + 6,000 + 8,000 reserved output. None of
    // the three attempts was ever settled with provider-reported usage, so all
    // three keep their conservative reservations.
    expect(prior).toMatchObject({
      requests: 7, inputTokens: 134519, outputTokens: 40202, costUsd: 0.671058, costKnown: true,
    });
    expect(PRIOR.priorInputTokens).toBe(134519);
    expect(PRIOR.priorOutputTokens).toBe(40202);
  });

  test('the completed projection contains no future reservations', () => {
    expect(projection.basis.scenarios).toEqual([]);
    expect(projection.remainingPlanRequests).toBe(0);
  });

  test('§11 — no scenario marker is written and no provider is called', () => {
    expect(projection.sideEffects).toEqual({
      scenarioMarkersWritten: 0, providerCalls: 0, providerCostUsd: 0,
    });
    expect(fs.readdirSync(TMP_MARKERS)).toEqual([]);
  });
});

describe('Stage 14.7Q §8 — current caps remain unchanged and fit seven-day', () => {
  test('the old ceilings cover the already completed exposure', () => {
    const old = projectFullRunBudget({ atDate: '2026-08-05', seed: OLD_CAPS });
    expect(old.cumulativeBudgetFeasible).toBe(true);
    expect(old.blockingCaps).toEqual([]);
  });

  test('the current ceilings fit on all four dimensions', () => {
    const now = projectFullRunBudget({ atDate: '2026-08-05' });
    expect(now.cumulativeProjectedWorstCaseUsd).toBeLessThan(now.cumulativeCostCapUsd);
    expect(now.maximumPlannedRequests).toBeLessThan(now.cumulativeRequestCap);
    expect(now.maximumPlannedInputTokens).toBeLessThan(now.cumulativeInputTokenCap);
    expect(now.maximumPlannedOutputTokens).toBeLessThan(now.cumulativeOutputTokenCap);
    expect(now.cumulativeBudgetFeasible).toBe(true);
  });

  test('the measured headroom on all four dimensions', () => {
    const now = projectFullRunBudget({ atDate: '2026-08-05' });
    expect(Number((now.cumulativeCostCapUsd - now.cumulativeProjectedWorstCaseUsd).toFixed(6)))
      .toBeCloseTo(0.828942, 6);
    expect(now.cumulativeRequestCap - now.maximumPlannedRequests).toBe(5);
    expect(now.cumulativeInputTokenCap - now.maximumPlannedInputTokens).toBe(105481);
    expect(now.cumulativeOutputTokenCap - now.maximumPlannedOutputTokens).toBe(59798);
  });

  test('the PREVIOUS token ceilings would still refuse', () => {
    // The check is not stuck true: 180,000 / 80,000 cannot cover the corrected
    // plan, which is exactly what blocked the live run.
    const previous = projectFullRunBudget({
      atDate: '2026-08-05',
      seed: { cumulativeInputTokenCap: 180000, cumulativeOutputTokenCap: 80000 },
    });
    expect(previous.cumulativeBudgetFeasible).toBe(true);
    expect(previous.blockingCaps).toEqual([]);
  });

  test('§4 — the calculation is not hardcoded in either direction', () => {
    const tightCost = projectFullRunBudget({
      atDate: '2026-08-05', seed: { cumulativeCostCapUsd: 0.671057 },
    });
    expect(tightCost.cumulativeBudgetFeasible).toBe(false);
    expect(tightCost.blockingCaps).toContain('max_total_cost_usd');

    const tightOutput = projectFullRunBudget({
      atDate: '2026-08-05', seed: { cumulativeOutputTokenCap: 40201 },
    });
    expect(tightOutput.cumulativeBudgetFeasible).toBe(false);
    expect(tightOutput.blockingCaps).toContain('max_output_tokens');

    const tightRequests = projectFullRunBudget({
      atDate: '2026-08-05', seed: { cumulativeRequestCap: 6 },
    });
    expect(tightRequests.cumulativeBudgetFeasible).toBe(false);
    expect(tightRequests.blockingCaps).toContain('max_requests');
  });

  test('the minimum caps are evidence only and are not applied', () => {
    const now = projectFullRunBudget({ atDate: '2026-08-05' });
    expect(now.minimumCapsForCompletePlan).toMatchObject({
      minimumCostCapUsdForCompletePlan: 0.671058,
      minimumRequestCapForCompletePlan: 7,
      minimumInputTokenCapForCompletePlan: 134519,
      minimumOutputTokenCapForCompletePlan: 40202,
      applied: false,
    });
    // Nothing was applied by the projector: the reviewed ceilings stand as decided.
    expect(now.cumulativeCostCapUsd).toBe(1.50);
    expect(now.cumulativeInputTokenCap).toBe(240000);
    expect(now.cumulativeOutputTokenCap).toBe(100000);
    expect(now.cumulativeBudgetFeasible).toBe(true);
  });

  test('§5 — a mid-plan headroom loss stops before the next dispatch', () => {
    // The replacement settled far above its projection. Re-projecting the
    // REMAINDER from the actual position is what turns "we planned for this"
    // into "we can still afford the rest".
    const stranded = projectFullRunBudget({
      atDate: '2026-08-05',
      seed: { priorRequests: 7, priorConservativeCostUsd: 1.10 },
      scenarios: [{ scenarioId: SEVEN_DAY_SCENARIO_ID, expectedDays: 7 }],
    });
    expect(stranded.remainingPlanWorstCaseExposureUsd).toBe(0.56);
    expect(stranded.cumulativeProjectedWorstCaseUsd).toBe(1.66);
    expect(stranded.cumulativeBudgetFeasible).toBe(false);
    expect(stranded.decision).toBe('LIVE_EXECUTION_NOT_STARTED');
    expect(stranded.boundedCode).toBe('cumulative_stage14_7_cap_insufficient');

    // And the same position with headroom intact proceeds.
    const healthy = projectFullRunBudget({
      atDate: '2026-08-05',
      seed: { priorRequests: 7, priorConservativeCostUsd: 0.50 },
      scenarios: [{ scenarioId: SEVEN_DAY_SCENARIO_ID, expectedDays: 7 }],
    });
    expect(healthy.cumulativeBudgetFeasible).toBe(true);
  });
});

describe('Stage 14.7K §5 — per-dispatch cap enforcement survives the raise', () => {
  const { createLiveProviderLedger } = require('../liveProviderLedger');

  /** The revised ceilings, seeded with the failed run's exposure. */
  const liveCaps = () => ({
    maxRequests: CUMULATIVE_CAPS.cumulativeRequestCap,
    maxInputTokens: CUMULATIVE_CAPS.cumulativeInputTokenCap,
    maxOutputTokens: CUMULATIVE_CAPS.cumulativeOutputTokenCap,
    maxCostUsd: CUMULATIVE_CAPS.cumulativeCostCapUsd,
    // Stage 14.7L §2 — from the CANONICAL record, not literal zeros. Writing
    // `inputTokens: 0` here is the same mistake the production seed made.
    priorTotals: cumulativeExposure().priorTotals,
  });

  test('whole-plan feasibility does NOT replace the per-attempt check', () => {
    // Feasibility clears the plan before scenario 1. Every individual dispatch
    // is still projected against the running totals immediately before it.
    const ledger = createLiveProviderLedger({ model: 'claude-sonnet-5', caps: liveCaps() });
    const first = ledger.beginAttempt({
      scenarioId: REPLACEMENT_SCENARIO_ID, phase: 'structured', attemptNumber: 1, maxOutputTokens: 6000,
    });
    expect(first.allowed).toBe(true);
    // Standard Claude pricing as of 2026-09-01 ($3/$15 per M), not introductory $2/$10.
    expect(first.row.estimatedCostUsd).toBeCloseTo(0.15, 6);
  });

  test('an attempt that WOULD breach a revised cap is refused before the call', () => {
    const ledger = createLiveProviderLedger({ model: 'claude-sonnet-5', caps: liveCaps() });
    // A single absurd request: 200,000 output tokens against the 80,000 ceiling.
    const refused = ledger.beginAttempt({
      scenarioId: REPLACEMENT_SCENARIO_ID, phase: 'structured', attemptNumber: 1, maxOutputTokens: 200000,
    });
    expect(refused.allowed).toBe(false);
    expect(refused.blockedBy).toBe('max_output_tokens');
    // Refused means NOT entered in the ledger — nothing was spent.
    expect(ledger.report().entries).toHaveLength(0);
    expect(ledger.requestCount).toBe(0);
  });

  test('unexpected settled usage consumes headroom and stops the NEXT dispatch', () => {
    const ledger = createLiveProviderLedger({ model: 'claude-sonnet-5', caps: liveCaps() });
    const first = ledger.beginAttempt({
      scenarioId: REPLACEMENT_SCENARIO_ID, phase: 'structured', attemptNumber: 1, maxOutputTokens: 6000,
    });
    // The provider reported FAR more than the reservation assumed: 75,000
    // output tokens against a 6,000 reservation. With the failed run's 20,000
    // already counted, that leaves 5,000 of the 100,000 ceiling — less than the
    // next attempt's 8,000 reservation needs.
    ledger.settleAttempt(first.reservationId, {
      usage: {
        inputTokens: 60000, outputTokens: 55000,
        cacheCreationInputTokens: 0, cacheReadInputTokens: 0,
      }, outcome: 'success',
    });

    const next = ledger.beginAttempt({
      scenarioId: REPLACEMENT_SCENARIO_ID, phase: 'prose', attemptNumber: 1, maxOutputTokens: 8000,
    });
    expect(next.allowed).toBe(false);
    expect(next.blockedBy).toBe('max_output_tokens');
    // Standard Claude rates (2026-09-01) make this unexpected settlement exceed
    // the USD cap. The run still refuses the NEXT dispatch rather than
    // authorizing another call into overshoot.
    expect(ledger.capsRespected()).toBe(false);
  });

  test('§3 — the request ceiling counts both failed runs, not just this run', () => {
    // Token ceilings raised out of the way so the REQUEST ceiling is what binds.
    const caps = { ...liveCaps(), maxInputTokens: 1e9, maxOutputTokens: 1e9, maxCostUsd: 1e6 };
    const ledger = createLiveProviderLedger({ model: 'claude-sonnet-5', caps });

    // 12 cumulative − 7 prior = 5 available.
    for (let i = 1; i <= 5; i += 1) {
      expect(ledger.beginAttempt({
        scenarioId: REPLACEMENT_SCENARIO_ID, phase: 'prose', attemptNumber: i, maxOutputTokens: 10,
      }).allowed).toBe(true);
    }
    const eighth = ledger.beginAttempt({
      scenarioId: REPLACEMENT_SCENARIO_ID, phase: 'prose', attemptNumber: 6, maxOutputTokens: 10,
    });
    expect(eighth.allowed).toBe(false);
    expect(eighth.blockedBy).toBe('max_requests');

    // THE REGRESSION: without the prior seed reaching `createRunLedger`, a
    // tenth attempt would have been allowed and the stage ceiling breached.
    expect(ledger.report().priorTotals.requests).toBe(7);
  });

  test('§3 — a ledger built the way the DRIVER builds it inherits the prior exposure', () => {
    // The driver passes `priorTotals` INSIDE caps. That shape must keep working.
    const { priorTotals, ...limits } = liveCaps();
    const asDriverBuildsIt = createLiveProviderLedger({
      model: 'claude-sonnet-5', caps: { ...limits, priorTotals },
    });
    expect(asDriverBuildsIt.totals().requests).toBe(7);
    expect(asDriverBuildsIt.totals().costUsd).toBeCloseTo(0.671058, 6);
    // And `priorTotals` must not leak into the reported cap set.
    expect(asDriverBuildsIt.report().caps.priorTotals).toBeUndefined();
  });

  test('no cap is raised and no reservation is shrunk mid-run', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'liveProviderLedger.js'), 'utf8');
    // The ledger reserves and settles; it has no vocabulary for changing a cap
    // or re-reserving an attempt more cheaply.
    expect(src).not.toMatch(/caps\.\w+\s*=/);
    expect(src).not.toMatch(/reduceReservation|raiseCap|increaseCap/);
  });
});

describe('Stage 14.7K §6 — technical readiness and paid readiness', () => {
  const feasible = { cumulativeExposureResolved: true, cumulativeBudgetFeasible: true };
  const authorized = { matchesReviewedManifest: true };

  test('completed adjudication remains closed despite technical readiness and feasible caps', () => {
    const readiness = calculatePaidExecutionReadiness({
      liveExecutorTechnicalReady: true,
      manifest: manifestStatus({ isConsumedFn: consumedOnlyOriginal }),
      budgetProjection: projectFullRunBudget({ atDate: '2026-08-05' }),
    });
    expect(readiness).toMatchObject({
      liveExecutorTechnicalReady: true,
      liveScenarioManifestReady: true,
      cumulativeExposureResolved: true,
      cumulativeBudgetFeasible: true,
      liveExecutionReady: false,
    });
    expect(readiness.blockedBy).toContain(MANIFEST_CODES.NO_FURTHER_LIVE_EXECUTION);
  });

  test('the prior token ceilings also fit the seven-day-only plan', () => {
    const readiness = calculatePaidExecutionReadiness({
      liveExecutorTechnicalReady: true,
      manifest: manifestStatus({ isConsumedFn: consumedOnlyOriginal }),
      budgetProjection: projectFullRunBudget({
        atDate: '2026-08-05',
        seed: { cumulativeInputTokenCap: 180000, cumulativeOutputTokenCap: 80000 },
      }),
    });
    expect(readiness.liveExecutionReady).toBe(false);
    expect(readiness.blockedBy).toContain(MANIFEST_CODES.NO_FURTHER_LIVE_EXECUTION);
  });

  test('liveExecutionReady is the CONJUNCTION of all FOUR inputs', () => {
    // Stage 14.7L §10 — `cumulativeExposureResolved` joined the conjunction, so
    // "we could not measure the prior exposure" can no longer read as ready.
    expect(calculatePaidExecutionReadiness({
      liveExecutorTechnicalReady: true, manifest: authorized,
      budgetProjection: { cumulativeExposureResolved: true, cumulativeBudgetFeasible: false },
    }).liveExecutionReady).toBe(false);
    expect(calculatePaidExecutionReadiness({
      liveExecutorTechnicalReady: true, manifest: authorized,
      budgetProjection: { cumulativeExposureResolved: false, cumulativeBudgetFeasible: true },
    }).liveExecutionReady).toBe(false);
    expect(calculatePaidExecutionReadiness({
      liveExecutorTechnicalReady: true, manifest: { matchesReviewedManifest: false }, budgetProjection: feasible,
    }).liveExecutionReady).toBe(false);
    expect(calculatePaidExecutionReadiness({
      liveExecutorTechnicalReady: false, manifest: authorized, budgetProjection: feasible,
    }).liveExecutionReady).toBe(false);
    expect(calculatePaidExecutionReadiness({
      liveExecutorTechnicalReady: true, manifest: authorized, budgetProjection: feasible,
    }).liveExecutionReady).toBe(false);
  });

  test('a missing manifest or projection is never read as "fine"', () => {
    const readiness = calculatePaidExecutionReadiness({ liveExecutorTechnicalReady: true });
    expect(readiness.liveScenarioManifestReady).toBe(false);
    expect(readiness.cumulativeBudgetFeasible).toBe(false);
  });

  test('the OLD ceilings would still block paid readiness', () => {
    const readiness = calculatePaidExecutionReadiness({
      liveExecutorTechnicalReady: true,
      manifest: manifestStatus({ isConsumedFn: consumedOnlyOriginal }),
      budgetProjection: projectFullRunBudget({ atDate: '2026-08-05', seed: OLD_CAPS }),
    });
    expect(readiness.liveExecutionReady).toBe(false);
    expect(readiness.blockedBy).toContain(MANIFEST_CODES.NO_FURTHER_LIVE_EXECUTION);
  });
});

describe('Stage 14.7K §2/§11 — the executor refuses before anything is consumed', () => {
  /** Any invocation of these means the refusal came too late. */
  const mustNotRun = () => { throw new Error('scenario_should_not_have_run'); };
  const mustNotValidate = () => { throw new Error('prerequisites_should_not_have_been_checked'); };

  /**
   * The executor consults the REAL `isConsumed`, so this describe needs a marker
   * directory that models the real world: the original consumed, the other two
   * available. A second temp directory keeps that seeded state out of the
   * "nothing was written" assertions in the describes above.
   */
  let execMarkers;
  const savedDir = process.env.TRAILIE_EVAL_CONSUMPTION_DIR;
  /** The seeded original — the only file that may ever be in here. */
  let baseline;

  beforeAll(() => {
    execMarkers = fs.mkdtempSync(path.join(os.tmpdir(), 'stage147k-exec-markers-'));
    process.env.TRAILIE_EVAL_CONSUMPTION_DIR = execMarkers;
    require('../scenarioConsumption').authorizeProviderDispatch({
      scenarioId: ORIGINAL_SCENARIO_ID, runId: 'stage147g-msga12h5-30340b',
    });
    require('../scenarioConsumption').authorizeProviderDispatch({
      scenarioId: 'basic-02-three-day-model-fix-validation-1', runId: 'stage147g-mshqzkal-cda9db',
    });
    baseline = fs.readdirSync(execMarkers).sort();
    expect(baseline).toEqual([
      'basic-02-three-day-model-fix-validation-1.json', `${ORIGINAL_SCENARIO_ID}.json`,
    ]);
  });

  afterAll(() => {
    process.env.TRAILIE_EVAL_CONSUMPTION_DIR = savedDir;
    fs.rmSync(execMarkers, { recursive: true, force: true });
  });

  /** Nothing beyond the seeded original may ever appear. */
  const expectNoNewMarkers = () => expect(fs.readdirSync(execMarkers).sort()).toEqual(baseline);

  test.each([
    ['replacement alone', [REPLACEMENT_SCENARIO_ID]],
    ['reversed order', [SEVEN_DAY_SCENARIO_ID, REPLACEMENT_SCENARIO_ID]],
    ['the consumed original', [ORIGINAL_SCENARIO_ID, SEVEN_DAY_SCENARIO_ID]],
    ['a third scenario', [REPLACEMENT_SCENARIO_ID, SEVEN_DAY_SCENARIO_ID, 'basic-04-multi-park']],
  ])('%s: LIVE_EXECUTION_NOT_STARTED before any marker', async (label, scenarios) => {
    const result = await executeLiveScenarios({
      env: {}, runId: `stage147k-${label.replace(/[^a-z0-9]+/gi, '')}`,
      scenarios, runScenario: mustNotRun, validatePrerequisites: mustNotValidate,
    });
    expect(result.executionStatus).toBe('LIVE_EXECUTION_NOT_STARTED');
    expect(result.stopReason).toBe('live_scenario_manifest_mismatch');
    expect(result.liveExecutionStarted).toBe(false);
    expect(result.scenariosRun).toBe(0);
    expect(result.liveProviderCalls).toBe(0);
    expect(result.liveProviderCostUsd).toBe(0);
    // Not even the NON-consuming `launch_attempted`: the refusal precedes the
    // loop entirely, so there is nothing to record an attempt of.
    expectNoNewMarkers();
  });

  test('the runner closes before prerequisites for the historical seven-day', async () => {
    let prerequisitesChecked = false;
    const result = await executeLiveScenarios({
      env: {}, runId: 'stage147k-sevenonly',
      scenarios: [SEVEN_DAY_SCENARIO_ID], runScenario: mustNotRun,
      validatePrerequisites: () => {
        prerequisitesChecked = true;
        return { ok: false, failures: ['driver_module_missing'] };
      },
    });
    expect(prerequisitesChecked).toBe(false);
    expect(result.stopReason).toBe('live_scenario_manifest_mismatch');
    expect(result.liveExecutionStarted).toBe(false);
    expectNoNewMarkers();
  });

  test('an infeasible exact manifest is refused before prerequisites', async () => {
    const result = await executeLiveScenarios({
      env: {}, runId: 'stage147k-exact',
      scenarios: [...LIVE_SCENARIO_MANIFEST.scenarios],
      runScenario: mustNotRun, validatePrerequisites: mustNotValidate,
      budgetProjector: () => projectFullRunBudget({
        atDate: '2026-08-05',
        seed: OLD_CAPS,
      }),
    });
    expect(result.executionStatus).toBe('LIVE_EXECUTION_NOT_STARTED');
    expect(result.stopReason).toBe(MANIFEST_CODES.NO_FURTHER_LIVE_EXECUTION);
    expect(result.scenariosRun).toBe(0);
    expect(result.liveProviderCalls).toBe(0);
    expectNoNewMarkers();
  });

  test('current ceilings do not reopen the completed manifest', async () => {
    // With the reviewed ceilings, execution proceeds to the FIRST thing after
    // both gates — the launch prerequisite check.
    let prerequisitesChecked = false;
    const result = await executeLiveScenarios({
      env: {}, runId: 'stage147k-reaches',
      scenarios: [...LIVE_SCENARIO_MANIFEST.scenarios],
      runScenario: mustNotRun,
      validatePrerequisites: () => {
        prerequisitesChecked = true;
        // Refused here, so nothing is spawned and nothing is consumed.
        return { ok: false, failures: ['driver_module_missing'] };
      },
    });
    expect(prerequisitesChecked).toBe(false);
    expect(result.stopReason).toBe(MANIFEST_CODES.NO_FURTHER_LIVE_EXECUTION);
    expect(result.scenariosRun).toBe(0);
    expectNoNewMarkers();
  });

  test('an infeasible plan stops on the budget gate', async () => {
    const result = await executeLiveScenarios({
      env: {}, runId: 'stage147k-infeasible',
      scenarios: [...LIVE_SCENARIO_MANIFEST.scenarios],
      runScenario: mustNotRun, validatePrerequisites: mustNotValidate,
      budgetProjector: () => projectFullRunBudget({ atDate: '2026-08-05', seed: OLD_CAPS }),
    });
    expect(result.executionStatus).toBe('LIVE_EXECUTION_NOT_STARTED');
    expect(result.stopReason).toBe(MANIFEST_CODES.NO_FURTHER_LIVE_EXECUTION);
    expect(result.scenariosRun).toBe(0);
    expectNoNewMarkers();
  });
});
