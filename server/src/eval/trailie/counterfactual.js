'use strict';

/**
 * Stage 13.9 §9 — counterfactual latency/cost projection from RECORDED evidence.
 *
 * THIS MAKES NO PROVIDER CALLS AND IS NOT A MEASUREMENT.
 *
 * It answers one question against an existing artifact: what would the run have
 * cost and taken if Phase A had been sized correctly on the FIRST attempt? The
 * projection reuses the recorded second attempt verbatim as the stand-in for a
 * correctly-sized first attempt — it does not model a faster or cheaper call, so
 * it is a lower bound on the saving, not an optimistic estimate.
 *
 * Every output is labeled `counterfactual_from_recorded_attempt`.
 */

const { estimateCostUsd, COST_UNKNOWN } = require('./pricing');

const PROJECTION_BASIS = 'counterfactual_from_recorded_attempt';

function attemptCost({ model, attempt, atDate }) {
  if (!attempt) return 0;
  return estimateCostUsd({
    model,
    inputTokens: attempt.inputTokens || 0,
    outputTokens: attempt.outputTokens || 0,
    atDate,
  });
}

function sumCosts(values) {
  return values.some((v) => v === COST_UNKNOWN)
    ? COST_UNKNOWN
    : Number(values.reduce((n, v) => n + (Number(v) || 0), 0).toFixed(6));
}

/**
 * Project the effect of correct first-attempt sizing on ONE recorded scenario row.
 *
 * @param {Object} row    a `perScenario` row from a live artifact
 * @param {string} model  the model the row was produced with (for pricing)
 * @returns {Object|null} null when the row had no discarded attempt to remove
 */
function projectCorrectlySizedFirstAttempt({ row, model, atDate } = {}) {
  const attempts = (row && row.structuredAttempts) || [];
  if (attempts.length < 2) return null;

  // Everything before the attempt that succeeded is what correct sizing avoids.
  const succeededIndex = attempts.findIndex((a) => a.status === 'complete');
  if (succeededIndex <= 0) return null;
  const discarded = attempts.slice(0, succeededIndex);
  const kept = attempts[succeededIndex];

  const discardedDurationMs = discarded.reduce((n, a) => n + (a.durationMs || 0), 0);
  const discardedInputTokens = discarded.reduce((n, a) => n + (a.inputTokens || 0), 0);
  const discardedOutputTokens = discarded.reduce((n, a) => n + (a.outputTokens || 0), 0);
  const discardedCostUsd = sumCosts(discarded.map((a) => attemptCost({ model, attempt: a, atDate })));

  // Phase A overhead beyond the attempts themselves (finalization, enrichment).
  const recordedPhaseAMs = row.phaseADurationMs || 0;
  const attemptsMs = attempts.reduce((n, a) => n + (a.durationMs || 0), 0);
  const phaseAOverheadMs = Math.max(0, recordedPhaseAMs - attemptsMs);

  const projectedPhaseADurationMs = (kept.durationMs || 0) + phaseAOverheadMs;
  const recordedTotalMs = row.latencyMs || 0;
  const projectedTotalResponseDurationMs = Math.max(0, recordedTotalMs - discardedDurationMs);

  const recordedRunCostUsd = sumCosts([
    ...attempts.map((a) => attemptCost({ model, attempt: a, atDate })),
    estimateCostUsd({ model, inputTokens: row.tokens?.proseInputTokens || 0, outputTokens: row.tokens?.proseOutputTokens || 0, atDate }),
    estimateCostUsd({ model, inputTokens: row.tokens?.retryInputTokens || 0, outputTokens: row.tokens?.retryOutputTokens || 0, atDate }),
  ]);

  return {
    basis: PROJECTION_BASIS,
    scenarioId: row.scenarioId,
    model,
    recorded: {
      structuredAttempts: attempts.length,
      firstAttemptMaxTokens: attempts[0].maxTokens,
      succeedingAttemptMaxTokens: kept.maxTokens,
      phaseADurationMs: recordedPhaseAMs,
      totalResponseDurationMs: recordedTotalMs,
      trueRunEstimatedCostUsd: recordedRunCostUsd,
    },
    avoided: {
      discardedAttempts: discarded.length,
      discardedLatencyMs: discardedDurationMs,
      discardedInputTokens,
      discardedOutputTokens,
      discardedEstimatedCostUsd: discardedCostUsd,
    },
    projected: {
      structuredAttempts: 1,
      firstAttemptMaxTokens: kept.maxTokens,
      phaseADurationMs: projectedPhaseADurationMs,
      totalResponseDurationMs: projectedTotalResponseDurationMs,
      runEstimatedCostUsd: recordedRunCostUsd === COST_UNKNOWN || discardedCostUsd === COST_UNKNOWN
        ? COST_UNKNOWN
        : Number((recordedRunCostUsd - discardedCostUsd).toFixed(6)),
    },
    caveat: 'Projection reuses the recorded successful attempt as the correctly-sized first attempt. It is not a new live measurement, and assumes no change in provider speed for the same token budget.',
  };
}

/**
 * Project across a whole artifact and reconstruct its TRUE cost (§3) — the figure
 * the run should have reported once every attempt is counted.
 *
 * @param {Object} artifact  a Stage 13.7/13.8 targeted-run artifact
 */
function projectArtifact({ artifact, atDate } = {}) {
  const summary = artifact?.summary || {};
  const model = summary.model;
  const rows = summary.perScenario || [];

  const perScenario = [];
  let reportedTotal = 0;
  let trueTotal = 0;
  let unknown = false;

  for (const row of rows) {
    const attempts = row.structuredAttempts || [];
    const phaseAAllAttempts = sumCosts(attempts.map((a) => attemptCost({ model, attempt: a, atDate })));
    const phaseBFirst = estimateCostUsd({ model, inputTokens: row.tokens?.proseInputTokens || 0, outputTokens: row.tokens?.proseOutputTokens || 0, atDate });
    const phaseBRetry = estimateCostUsd({ model, inputTokens: row.tokens?.retryInputTokens || 0, outputTokens: row.tokens?.retryOutputTokens || 0, atDate });
    const trueCost = sumCosts([phaseAAllAttempts, phaseBFirst, phaseBRetry]);
    const reported = row.estimatedCostUsd;

    if (trueCost === COST_UNKNOWN || reported === COST_UNKNOWN) unknown = true;
    else { trueTotal += trueCost; reportedTotal += reported; }

    perScenario.push({
      scenarioId: row.scenarioId,
      structuredAttempts: attempts.length,
      reportedEstimatedCostUsd: reported,
      trueEstimatedCostUsd: trueCost,
      undercountedUsd: trueCost === COST_UNKNOWN || reported === COST_UNKNOWN
        ? COST_UNKNOWN : Number((trueCost - reported).toFixed(6)),
      projection: projectCorrectlySizedFirstAttempt({ row, model, atDate }),
    });
  }

  const withProjection = perScenario.filter((p) => p.projection);
  return {
    basis: PROJECTION_BASIS,
    stage: artifact?.stage || null,
    model,
    scenarioCount: rows.length,
    // §3 — what the run actually cost once discarded attempts are counted.
    costReconstruction: {
      reportedRunCostUsd: unknown ? COST_UNKNOWN : Number(reportedTotal.toFixed(6)),
      trueRunCostUsd: unknown ? COST_UNKNOWN : Number(trueTotal.toFixed(6)),
      undercountedUsd: unknown ? COST_UNKNOWN : Number((trueTotal - reportedTotal).toFixed(6)),
      configuredCapUsd: artifact?.preflight?.caps?.maxTotalCostUsd ?? null,
      correctedRemainingUsd: unknown || artifact?.preflight?.caps?.maxTotalCostUsd == null
        ? COST_UNKNOWN : Number((artifact.preflight.caps.maxTotalCostUsd - trueTotal).toFixed(6)),
    },
    latencyProjection: {
      scenariosWithDiscardedAttempts: withProjection.length,
      totalDiscardedLatencyMs: withProjection.reduce((n, p) => n + p.projection.avoided.discardedLatencyMs, 0),
      totalDiscardedOutputTokens: withProjection.reduce((n, p) => n + p.projection.avoided.discardedOutputTokens, 0),
      totalDiscardedEstimatedCostUsd: sumCosts(withProjection.map((p) => p.projection.avoided.discardedEstimatedCostUsd)),
    },
    perScenario,
    caveat: 'Counterfactual derived from recorded attempts. No provider call was made to produce these numbers.',
  };
}

module.exports = { PROJECTION_BASIS, projectCorrectlySizedFirstAttempt, projectArtifact };
