'use strict';

/**
 * Stage 14.7J §8/§9/§10 — can the COMPLETE remaining manifest finish inside the
 * cumulative caps?
 *
 * WHY A WHOLE-PLAN PROJECTION
 * ---------------------------
 * $0.75 − $0.32 = $0.43 remained after the failed run. That subtraction says
 * nothing about whether the remaining plan fits. Starting the replacement
 * scenario and discovering afterwards that the seven-day turn cannot finish
 * would consume the replacement for nothing — a second permanently spent
 * scenario, for the same reason as the first: acting before measuring.
 *
 * So the projection is computed for BOTH scenarios together, BEFORE the first
 * replacement dispatch, and the run refuses unless every cap covers the whole
 * plan.
 *
 * IT USES THE PRODUCTION CODE
 * ---------------------------
 * The reservations come from `createRunLedger().reserve()` — the same function
 * the live ledger calls — and the prices from `estimateCostUsd`. A parallel
 * arithmetic model here could disagree with the code that actually refuses
 * calls, which would make this projection worse than useless.
 *
 * NO SIDE EFFECTS: no marker is written, no scenario is touched, no provider is
 * constructed, no network access occurs.
 */

const {
  createRunLedger, DEFAULT_RESERVE_INPUT_TOKENS_PER_CALL,
} = require('../trailie/usageAccounting');
const { COST_UNKNOWN } = require('../trailie/pricing');
const {
  getItineraryGenerationConfig, selectStructuredMaxTokens,
} = require('../../config/itineraryGenerationConfig');
const { resolveProseConsistencyMode, PROSE_CONSISTENCY_MODE } = require('../../config/proseConsistencyConfig');
const { resolvePriorCumulativeExposure } = require('./priorCumulativeExposure');
const { EVALUATION_FLAGS } = require('../stage14_7e/scenarioChild');
const { SEVEN_DAY_SCENARIO_ID } = require('./liveScenarioManifest');

/**
 * Phase B's output ceiling. `prepareChatContext` defaults `maxTokens` to 8000
 * and the evaluation harness overrides nothing, so this is the value the prose
 * reservation is taken against (routes/ai.js — `maxTokens = 8000`).
 */
const PROSE_MAX_OUTPUT_TOKENS = 8000;

/**
 * §8 — the seed. The failed run's exposure is inherited, never restarted.
 *
 * Stage 14.7K — the cumulative ceilings are the REVIEWED ones. 14.7J measured
 * the complete two-scenario plan at a $1.38 / 11-request / 160,000-input /
 * 74,000-output worst case, which the previous $0.75 / 50,000-output ceilings
 * could not guarantee. The reviewed decision retained the full scope and raised
 * the ceilings rather than dropping the three-day re-validation.
 *
 * These are HARD ceilings, not an expected spend. The plan's worst case sits
 * $0.12 below the cost ceiling.
 */
/**
 * Stage 14.7L §4 — the REVIEWED cumulative ceilings, across the failed original
 * attempt plus both remaining scenarios.
 *
 * The token ceilings were raised from 180,000 / 80,000 once the failed run's
 * real 60,000 / 20,000 reservations were carried forward. Cost and request
 * ceilings are unchanged — they were never the binding constraint.
 *
 * Hard ceilings, not expected spend.
 */
const CUMULATIVE_CAPS = Object.freeze({
  cumulativeRequestCap: 12,
  cumulativeCostCapUsd: 1.50,
  cumulativeInputTokenCap: 240000,
  cumulativeOutputTokenCap: 100000,
});

/**
 * §2 — the seed's PRIOR half comes from the canonical resolver, never from
 * constants living here. Two seeds that can drift independently did drift; this
 * one cannot, because there is only one.
 *
 * @returns {{ok: true, seed: Object}|{ok: false, boundedCode: string, ...}}
 */
function defaultSeed() {
  const resolution = resolvePriorCumulativeExposure();
  if (!resolution.resolved) {
    return {
      ok: false,
      boundedCode: resolution.boundedCode,
      reasons: resolution.reasons,
      unknownDimensions: resolution.unknownDimensions,
    };
  }
  const { exposure } = resolution;
  return {
    ok: true,
    source: resolution.source,
    seed: {
      priorRequests: exposure.requests,
      priorConservativeCostUsd: exposure.costUsd,
      priorInputTokens: exposure.inputTokens,
      priorOutputTokens: exposure.outputTokens,
      ...CUMULATIVE_CAPS,
    },
  };
}

/** Stage 14.7Q — the only remaining provider-backed scenario. */
const PLANNED_SCENARIOS = Object.freeze([]);

/**
 * §8 — every bounded provider attempt the policy ALLOWS for one scenario.
 *
 * Structured: `structuredMaxAttempts` (2). The retry is modelled as following a
 * truncation, which is the branch that earns the LARGER token budget — the
 * worst case, which is what a cap must survive.
 *
 * Prose: the first attempt plus, in enforce mode, the one verifier-driven
 * regeneration. The verifier itself is deterministic (`verifyProseAgainstItinerary`)
 * and costs no provider call, and the deterministic renderer that serves the
 * final fallback is explicitly NOT counted as a provider attempt.
 */
function plannedAttemptsFor({ expectedDays, itineraryConfig, proseMode, proseRetryEnabled }) {
  const attempts = [];
  const maxStructured = Math.max(1, itineraryConfig.structuredMaxAttempts || 2);

  for (let attempt = 1; attempt <= maxStructured; attempt += 1) {
    attempts.push({
      phase: 'structured',
      attempt,
      maxOutputTokens: selectStructuredMaxTokens({
        expectedDays, truncatedRetry: attempt > 1, config: itineraryConfig,
      }),
      reason: attempt === 1 ? 'initial_structured_attempt' : 'bounded_structured_retry_after_truncation',
    });
  }

  const proseAttempts = (proseMode === PROSE_CONSISTENCY_MODE.ENFORCE && proseRetryEnabled) ? 2 : 1;
  for (let attempt = 1; attempt <= proseAttempts; attempt += 1) {
    attempts.push({
      phase: 'prose',
      attempt,
      maxOutputTokens: PROSE_MAX_OUTPUT_TOKENS,
      reason: attempt === 1 ? 'initial_prose_attempt' : 'enforce_mode_verifier_retry',
    });
  }
  return attempts;
}

/**
 * Reserve every planned attempt through the PRODUCTION ledger and report what
 * it costs. `caps` is passed straight through, so the same `blockedBy` code the
 * live run would emit is the one reported here.
 */
function projectScenario({ model, attempts, caps, priorTotals, atDate }) {
  const ledger = createRunLedger({ model, caps, priorTotals, atDate });
  const rows = [];
  let blockedBy = null;

  for (const planned of attempts) {
    const reservation = ledger.reserve({
      phase: planned.phase, attempt: planned.attempt, maxOutputTokens: planned.maxOutputTokens,
    });
    if (!reservation.allowed) { blockedBy = reservation.blockedBy; break; }
    rows.push({
      phase: planned.phase,
      attempt: planned.attempt,
      reason: planned.reason,
      reservedInputTokens: reservation.reservation.inputTokens,
      reservedOutputTokens: reservation.reservation.outputTokens,
      reservedCostUsd: reservation.reservation.costUsd,
    });
    // Deliberately NOT settled: §9 — the projection must not assume streaming
    // usage will settle below the reservation. A reservation is the guarantee
    // the cap has to honour.
  }

  const totals = ledger.totals();
  return { rows, blockedBy, totals, plannedAttempts: attempts.length };
}

function round6(n) {
  return Number(Number(n).toFixed(6));
}

/**
 * §8/§9/§10 — the whole projection.
 *
 * @param {Object} [params]
 * @param {Object} [params.seed] overrides for DEFAULT_SEED
 * @param {string} [params.model]
 * @param {Date|string} [params.atDate] pricing date; defaults to now
 * @returns {Object} the §8 report shape, plus the §10 minimum caps
 */
function projectFullRunBudget({
  seed = {},
  model = 'claude-sonnet-5',
  atDate = undefined,
  scenarios = PLANNED_SCENARIOS,
  itineraryConfig = getItineraryGenerationConfig(),
  // The evaluation child forces enforce mode; the projection must describe THAT
  // configuration, not whichever shell happens to run this calculation.
  proseMode = resolveProseConsistencyMode(EVALUATION_FLAGS.TRAILIE_PROSE_CONSISTENCY_MODE),
  proseRetryEnabled = true,
} = {}) {
  /**
   * §3 — an unresolved prior exposure fails the whole projection closed. It is
   * never silently replaced with zeros, and the refusal reaches the caller
   * before manifest authorization, marker creation or any reservation.
   */
  const resolved = defaultSeed();
  if (!resolved.ok) {
    return {
      cumulativeExposureResolved: false,
      cumulativeBudgetFeasible: false,
      decision: 'LIVE_EXECUTION_NOT_STARTED',
      boundedCode: resolved.boundedCode,
      reasons: resolved.reasons,
      unknownDimensions: resolved.unknownDimensions,
      blockingCaps: [],
      sideEffects: { scenarioMarkersWritten: 0, providerCalls: 0, providerCostUsd: 0 },
    };
  }
  const s = { ...resolved.seed, ...seed };

  const caps = {
    maxRequests: s.cumulativeRequestCap,
    maxInputTokens: s.cumulativeInputTokenCap,
    maxOutputTokens: s.cumulativeOutputTokenCap,
    maxCostUsd: s.cumulativeCostCapUsd,
  };
  const priorTotals = {
    requests: s.priorRequests,
    inputTokens: s.priorInputTokens || 0,
    outputTokens: s.priorOutputTokens || 0,
    costUsd: s.priorConservativeCostUsd,
    costKnown: true,
  };

  const perScenario = [];
  let cumulativeTotals = { ...priorTotals };
  let uncappedCumulative = { ...priorTotals };
  const blockingCaps = [];

  for (const scenario of scenarios) {
    const attempts = plannedAttemptsFor({
      expectedDays: scenario.expectedDays, itineraryConfig, proseMode, proseRetryEnabled,
    });

    /**
     * Two passes, both through the production ledger:
     *
     *   capped   — where the real run would stop, and on which cap
     *   uncapped — what the plan actually REQUIRES, which is the only way to
     *              report a minimum cap rather than the cap we already have
     */
    const capped = projectScenario({ model, attempts, caps, priorTotals: cumulativeTotals, atDate });
    const uncapped = projectScenario({ model, attempts, caps: {}, priorTotals: uncappedCumulative, atDate });

    if (capped.blockedBy && !blockingCaps.includes(capped.blockedBy)) blockingCaps.push(capped.blockedBy);

    perScenario.push({
      scenarioId: scenario.scenarioId,
      expectedDays: scenario.expectedDays,
      plannedProviderAttempts: attempts.length,
      attempts: uncapped.rows,
      worstCaseInputTokens: uncapped.totals.inputTokens - uncappedCumulative.inputTokens,
      worstCaseOutputTokens: uncapped.totals.outputTokens - uncappedCumulative.outputTokens,
      worstCaseExposureUsd: round6(uncapped.totals.costUsd - uncappedCumulative.costUsd),
      fitsWithinRemainingCaps: capped.blockedBy == null,
      blockedBy: capped.blockedBy,
    });

    cumulativeTotals = {
      requests: capped.totals.requests,
      inputTokens: capped.totals.inputTokens,
      outputTokens: capped.totals.outputTokens,
      costUsd: capped.totals.costUsd,
      costKnown: capped.totals.costKnown,
    };
    uncappedCumulative = {
      requests: uncapped.totals.requests,
      inputTokens: uncapped.totals.inputTokens,
      outputTokens: uncapped.totals.outputTokens,
      costUsd: uncapped.totals.costUsd,
      costKnown: uncapped.totals.costKnown,
    };
  }

  const costUnknown = uncappedCumulative.costKnown === false
    || perScenario.some((p) => p.worstCaseExposureUsd === COST_UNKNOWN);

  const replacement = perScenario.find((row) => row.scenarioId !== SEVEN_DAY_SCENARIO_ID) || null;
  const sevenDay = perScenario.find((row) => row.scenarioId === SEVEN_DAY_SCENARIO_ID) || null;

  /**
   * Stage 14.7K §4 — the planned figures are CUMULATIVE (prior + plan), because
   * the caps they are compared against are cumulative.
   *
   * 14.7J expressed the request check as `plan (8) <= remaining (9)`, which is
   * the same arithmetic seen from the other end. Stating both sides in the same
   * frame removes the one asymmetry: requests are the only resource with a
   * nonzero prior, so a plan-only figure read against a cumulative cap would
   * understate by exactly the failed run's 3 requests.
   */
  const planOnlyProviderRequests = perScenario.reduce((n, p) => n + p.plannedProviderAttempts, 0);
  const planOnlyInputTokens = perScenario.reduce((n, p) => n + p.worstCaseInputTokens, 0);
  const planOnlyOutputTokens = perScenario.reduce((n, p) => n + p.worstCaseOutputTokens, 0);

  const maximumPlannedRequests = s.priorRequests + planOnlyProviderRequests;
  const maximumPlannedInputTokens = (s.priorInputTokens || 0) + planOnlyInputTokens;
  const maximumPlannedOutputTokens = (s.priorOutputTokens || 0) + planOnlyOutputTokens;
  const remainingPlanWorstCaseExposureUsd = round6(
    perScenario.reduce((n, p) => n + p.worstCaseExposureUsd, 0),
  );
  const cumulativeProjectedWorstCaseUsd = round6(
    s.priorConservativeCostUsd + remainingPlanWorstCaseExposureUsd,
  );

  const requestsRemainingBeforePlan = s.cumulativeRequestCap - s.priorRequests;
  const inputTokensRemainingBeforePlan = s.cumulativeInputTokenCap - (s.priorInputTokens || 0);
  const outputTokensRemainingBeforePlan = s.cumulativeOutputTokenCap - (s.priorOutputTokens || 0);

  /**
   * §9 — every cap must cover the WHOLE plan. Reported independently so the
   * blocking cap is named, not inferred from a single false boolean.
   */
  const capChecks = {
    max_total_cost_usd: cumulativeProjectedWorstCaseUsd <= s.cumulativeCostCapUsd,
    max_requests: maximumPlannedRequests <= s.cumulativeRequestCap,
    max_input_tokens: maximumPlannedInputTokens <= s.cumulativeInputTokenCap,
    max_output_tokens: maximumPlannedOutputTokens <= s.cumulativeOutputTokenCap,
  };
  const failingCaps = Object.keys(capChecks).filter((k) => !capChecks[k]);
  const cumulativeBudgetFeasible = !costUnknown && failingCaps.length === 0;

  return {
    // §10 — the prior exposure resolved, on all four dimensions.
    cumulativeExposureResolved: true,
    priorExposureSource: resolved.source,
    priorRequests: s.priorRequests,
    priorReservedInputTokens: s.priorInputTokens,
    priorReservedOutputTokens: s.priorOutputTokens,
    // ── §8 report shape ──
    priorConservativeExposureUsd: round6(s.priorConservativeCostUsd),
    replacementWorstCaseExposureUsd: replacement ? replacement.worstCaseExposureUsd : null,
    sevenDayWorstCaseExposureUsd: sevenDay ? sevenDay.worstCaseExposureUsd : null,
    sevenDayWorstCaseRequests: sevenDay ? sevenDay.plannedProviderAttempts : null,
    sevenDayWorstCaseInputTokens: sevenDay ? sevenDay.worstCaseInputTokens : null,
    sevenDayWorstCaseOutputTokens: sevenDay ? sevenDay.worstCaseOutputTokens : null,
    remainingPlanWorstCaseExposureUsd,
    cumulativeProjectedWorstCaseUsd,
    cumulativeCostCapUsd: s.cumulativeCostCapUsd,
    // Cumulative (prior + plan) against the cumulative caps.
    maximumPlannedRequests,
    cumulativeRequestCap: s.cumulativeRequestCap,
    maximumPlannedInputTokens,
    cumulativeInputTokenCap: s.cumulativeInputTokenCap,
    maximumPlannedOutputTokens,
    cumulativeOutputTokenCap: s.cumulativeOutputTokenCap,
    // The same facts as remaining allowance, kept from 14.7J.
    requestsRemainingBeforePlan,
    inputTokensRemainingBeforePlan,
    outputTokensRemainingBeforePlan,
    planOnlyProviderRequests,
    planOnlyInputTokens,
    planOnlyOutputTokens,
    // §5 — the remaining plan, named as the reviewer names it.
    remainingPlanRequests: planOnlyProviderRequests,
    remainingPlanCostUsd: remainingPlanWorstCaseExposureUsd,
    remainingPlanInputTokens: planOnlyInputTokens,
    remainingPlanOutputTokens: planOnlyOutputTokens,
    cumulativeProjectedRequests: maximumPlannedRequests,
    cumulativeProjectedCostUsd: cumulativeProjectedWorstCaseUsd,
    cumulativeProjectedInputTokens: maximumPlannedInputTokens,
    cumulativeProjectedOutputTokens: maximumPlannedOutputTokens,
    cumulativeBudgetFeasible,
    // The union of what the ledger refused and what the whole-plan check refuses.
    blockingCaps: [...new Set([...blockingCaps, ...failingCaps])],

    // ── §9 — the refusal a runner must emit before the first dispatch ──
    decision: cumulativeBudgetFeasible ? null : 'LIVE_EXECUTION_NOT_STARTED',
    boundedCode: cumulativeBudgetFeasible ? null : 'cumulative_stage14_7_cap_insufficient',

    /**
     * §10 — the caps the complete plan WOULD need. Evidence for a later
     * reviewed decision. Nothing here changes any cap, environment value,
     * receipt or live command.
     */
    minimumCapsForCompletePlan: {
      minimumCostCapUsdForCompletePlan: cumulativeProjectedWorstCaseUsd,
      minimumRequestCapForCompletePlan: maximumPlannedRequests,
      minimumInputTokenCapForCompletePlan: maximumPlannedInputTokens,
      minimumOutputTokenCapForCompletePlan: maximumPlannedOutputTokens,
      applied: false,
      note: 'evidence_for_reviewed_cap_decision_only',
    },

    // ── Provenance, so the numbers can be argued with rather than trusted ──
    basis: {
      model,
      seed: { ...s },
      reserveInputTokensPerCall: DEFAULT_RESERVE_INPUT_TOKENS_PER_CALL,
      proseMaxOutputTokens: PROSE_MAX_OUTPUT_TOKENS,
      structuredMaxAttempts: itineraryConfig.structuredMaxAttempts,
      proseConsistencyMode: proseMode,
      proseRetryEnabled,
      deterministicFallbackCountedAsProviderAttempt: false,
      settlementAssumedBelowReservation: false,
      usesProductionReservationCode: true,
      scenarios: perScenario,
    },
    costUnknown,
    sideEffects: {
      scenarioMarkersWritten: 0,
      providerCalls: 0,
      providerCostUsd: 0,
    },
  };
}

module.exports = {
  CUMULATIVE_CAPS,
  defaultSeed,
  PLANNED_SCENARIOS,
  PROSE_MAX_OUTPUT_TOKENS,
  plannedAttemptsFor,
  projectFullRunBudget,
};
