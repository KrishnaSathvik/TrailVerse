'use strict';

const {
  MODEL_ROUTES,
  selectTrailieModelRoute,
} = require('../config/trailieModelRouter');
const { boundedValidationDiagnostics } = require('../utils/generationDiagnostics');

const { classifyRepairRetryability, blockerSignature } = require('../utils/repairRetryability');

const SAFE_REASON = /^[a-z0-9_]{1,64}$/;

function cloneValue(value, seen = new WeakMap()) {
  if (value == null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Date) return new Date(value.getTime());

  const clone = Array.isArray(value) ? [] : {};
  seen.set(value, clone);
  for (const [key, child] of Object.entries(value)) clone[key] = cloneValue(child, seen);
  return clone;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value == null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function frozenSnapshot(context) {
  return deepFreeze(cloneValue(context));
}

function boundedReasons(reasonCodes) {
  if (!Array.isArray(reasonCodes)) return [];
  return reasonCodes.filter((code) => typeof code === 'string' && SAFE_REASON.test(code)).slice(0, 8);
}

function finiteCount(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizedCost(generation) {
  if (generation?.costStatus === 'priced' && Number.isFinite(generation.costUsd) && generation.costUsd >= 0) {
    return { costStatus: 'priced', costUsd: generation.costUsd };
  }
  return { costStatus: 'cost_unknown', costUsd: null };
}

/**
 * Tokens left for the artifact once reasoning is paid for. Only meaningful when
 * the provider reports reasoning tokens as part of the same output allowance.
 */
function artifactHeadroom(maxOutputTokens, reasoningTokens) {
  if (!Number.isFinite(maxOutputTokens) || !Number.isFinite(reasoningTokens)) return null;
  return maxOutputTokens - reasoningTokens;
}

/** Bounded provider label — never a raw provider error string. */
function safeLabel(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return SAFE_REASON.test(trimmed) ? trimmed : null;
}

// Field names are camelCase identifiers, not labels: `safeLabel` lowercases and
// would report `exposurelevel`, which matches no field anyone can grep for.
const safeFieldName = (value) => {
  const text = String(value == null ? '' : value).trim();
  return /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(text) ? text : null;
};

const boundedName = (value) => {
  const text = String(value == null ? '' : value).trim();
  return text ? text.slice(0, 120) : null;
};

function boundedTargetDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object') return null;
  const list = (values) => (Array.isArray(values) ? values : [])
    .map(boundedName).filter(Boolean).slice(0, 24);
  return Object.freeze({
    operationIndex: Number.isInteger(diagnostics.operationIndex) ? diagnostics.operationIndex : null,
    op: safeLabel(diagnostics.op),
    dayNumber: Number.isFinite(diagnostics.dayNumber) ? diagnostics.dayNumber : null,
    requestedStopId: boundedName(diagnostics.requestedStopId),
    requestedStopName: boundedName(diagnostics.requestedStopName),
    availableStopIds: list(diagnostics.availableStopIds),
    availableStopNames: list(diagnostics.availableStopNames),
    matchedCount: Number.isFinite(diagnostics.matchedCount) ? diagnostics.matchedCount : null,
    ...(Array.isArray(diagnostics.evidenceFieldChanges) ? {
      evidenceFieldChanges: diagnostics.evidenceFieldChanges.slice(0, 8).map((change) => ({
        field: safeFieldName(change?.field),
        before: boundedName(change?.before),
        after: boundedName(change?.after),
      })),
    } : {}),
  });
}

function attemptRecord({ attempt, route, retry, fallback, status, generation, validation, latencyMs }) {
  const usage = generation?.usage || {};
  return Object.freeze({
    attempt,
    tier: route.tier,
    provider: route.provider,
    model: route.model,
    reasoningEffort: route.reasoningEffort,
    retry: Boolean(retry),
    fallback: Boolean(fallback),
    status,
    validationStatus: validation?.status === 'pass' || validation?.status === 'fail'
      ? validation.status
      : null,
    validationReasonCodes: boundedReasons(validation?.reasonCodes),
    // WHICH deterministic validator/stage produced those codes. Forwarded
    // verbatim from the validation result — never re-derived here. Without it
    // a failed attempt is only "something after completeness said no".
    validationStage: safeLabel(validation?.stage),
    retryability: validation?.status === 'fail' ? classifyRepairRetryability(validation, { candidateCount: validation.eligibleCandidateCount }) : null,
    purpose: retry ? 'generation_retry' : fallback ? 'escalation' : 'primary_generation',
    blockerSignature: validation?.status === 'fail' ? blockerSignature(validation) : null,
    // Bounded target forensics, forwarded verbatim — never re-derived. Ids and
    // place names only; no prose, no prompt, no traveler content.
    validationTargetDiagnostics: boundedTargetDiagnostics(validation?.targetDiagnostics),
    validationDiagnostics: boundedValidationDiagnostics(validation?.validationDiagnostics),
    inputTokens: finiteCount(usage.inputTokens),
    cachedTokens: finiteCount(usage.cachedTokens),
    cacheWriteTokens: finiteCount(usage.cacheWriteTokens),
    outputTokens: finiteCount(usage.outputTokens),
    reasoningTokens: finiteCount(usage.reasoningTokens),
    latencyMs: finiteCount(latencyMs),
    // Output-policy diagnostics forwarded verbatim (token COUNTS only).
    maxOutputTokens: finiteCount(generation?.outputPolicy?.maxOutputTokens),
    artifactOutputBudgetTokens: finiteCount(generation?.outputPolicy?.artifactOutputBudgetTokens),
    reasoningHeadroomTokens: finiteCount(generation?.outputPolicy?.reasoningHeadroomTokens),
    artifactHeadroomTokens: artifactHeadroom(generation?.outputPolicy?.maxOutputTokens, usage.reasoningTokens),
    completionStatus: safeLabel(generation?.completion?.status),
    incompleteReason: safeLabel(generation?.completion?.incompleteReason),
    ...normalizedCost(generation),
    costComponents: generation?.costComponents || null,
  });
}

function cancelled(attempts) {
  return { status: 'cancelled', reasonCode: 'request_cancelled', selectedTier: null, attempts };
}

function failed(attempts, reasonCode) {
  return { status: 'failed', reasonCode, selectedTier: null, attempts };
}

function requireFunction(value, name) {
  if (typeof value !== 'function') {
    const error = new TypeError(`${name} must be a function`);
    error.code = 'trailie_router_contract_invalid';
    throw error;
  }
}

async function runTrailieModelRouting({
  enabled = false,
  context,
  executeAttempt,
  validateAttempt,
  renderDeterministic,
  signal,
  onAttempt,
} = {}) {
  if (enabled !== true) {
    return { status: 'disabled', reasonCode: 'wp9_disabled', attempts: [] };
  }
  if (signal?.aborted) return cancelled([]);

  const frozenContext = frozenSnapshot(context);
  let route = selectTrailieModelRoute(frozenContext.signals);

  if (route.tier === MODEL_ROUTES.DETERMINISTIC.tier) {
    requireFunction(renderDeterministic, 'renderDeterministic');
    try {
      const output = await renderDeterministic({ frozenContext, signal, route });
      return { status: 'complete', selectedTier: route.tier, output, attempts: [] };
    } catch (_error) {
      if (signal?.aborted) return cancelled([]);
      return failed([], 'deterministic_render_failed');
    }
  }

  requireFunction(executeAttempt, 'executeAttempt');
  requireFunction(validateAttempt, 'validateAttempt');

  const attempts = [];
  let sameModelRetryUsed = false;
  let repairReasonCodes = [];
  const inputBlockersSeen = new Set();

  while (route) {
    if (signal?.aborted) return cancelled(attempts);

    const attempt = attempts.length + 1;
    const retry = sameModelRetryUsed
      && (route.tier === 'sol_low' || route.tier === 'sol_medium')
      && attempts.at(-1)?.tier === route.tier;
    const fallback = attempts.length > 0 && !retry;
    const startedAt = Date.now();
    let generation;

    try {
      generation = await executeAttempt({
        route,
        frozenContext,
        attempt,
        retry,
        signal,
        repairReasonCodes: Object.freeze([...repairReasonCodes]),
      });
    } catch (_error) {
      const record = attemptRecord({
        attempt, route, retry, fallback, status: signal?.aborted ? 'cancelled' : 'provider_error',
        generation: null, validation: null, latencyMs: Date.now() - startedAt,
      });
      attempts.push(record);
      if (typeof onAttempt === 'function') await onAttempt(record);
      if (signal?.aborted) return cancelled(attempts);
      return failed(attempts, 'provider_attempt_failed');
    }

    if (signal?.aborted) {
      const record = attemptRecord({
        attempt, route, retry, fallback, status: 'cancelled', generation,
        validation: null, latencyMs: Date.now() - startedAt,
      });
      attempts.push(record);
      if (typeof onAttempt === 'function') await onAttempt(record);
      return cancelled(attempts);
    }

    let validation;
    try {
      validation = await validateAttempt({ route, frozenContext, generation, attempt, retry, signal });
    } catch (_error) {
      validation = {
        status: 'fail', locallyRepairable: false,
        reasonCodes: ['validation_error'], stage: 'validator_exception',
      };
    }

    validation = { ...validation, retryability: classifyRepairRetryability(validation, {
      candidateCount: validation?.eligibleCandidateCount,
    }) };
    const passed = validation?.status === 'pass';
    const record = attemptRecord({
      attempt, route, retry, fallback, status: passed ? 'passed' : 'validation_failed',
      generation, validation, latencyMs: Date.now() - startedAt,
    });
    attempts.push(record);
    if (typeof onAttempt === 'function') await onAttempt(record);
    if (signal?.aborted) return cancelled(attempts);

    if (passed) {
      return { status: 'complete', selectedTier: route.tier, output: generation?.output, attempts };
    }

    if (validation.retryability !== 'model_fixable' || validation.structureRetrySuppressed) {
      return failed(attempts, validation.retryability === 'model_fixable'
        ? 'structure_retry_suppressed' : validation.retryability);
    }

    const signature = blockerSignature(validation, frozenContext);
    if (inputBlockersSeen.has(signature)) return failed(attempts, 'repeated_input_blocker');
    inputBlockersSeen.add(signature);
    if (validation.focusedRepairUsed) return failed(attempts, 'focused_repair_exhausted');

    if (route.tier === 'luna_low') {
      repairReasonCodes = boundedReasons(validation?.reasonCodes);
      route = selectTrailieModelRoute({
        ...frozenContext.signals,
        depth: 'standard',
        deterministicRender: null,
      });
      continue;
    }

    if (route.tier === 'sol_low' || route.tier === 'sol_medium') {
      if (validation?.locallyRepairable === true && !sameModelRetryUsed) {
        sameModelRetryUsed = true;
        repairReasonCodes = boundedReasons(validation?.reasonCodes);
        continue;
      }
      if (!sameModelRetryUsed || !(validation.reasoningSpecificFailure === true
        && validation.meaningfulProgress === true
        && validation.eligibleCandidateCount > 0)
        || (validation.reasonCodes || []).some(code => /identity_|evidence_/.test(code))) {
        return failed(attempts, 'repair_without_reasoning_progress');
      }
      repairReasonCodes = boundedReasons(validation?.reasonCodes);
      if (route.tier === 'sol_low') {
        route = MODEL_ROUTES.SOL_MEDIUM;
        sameModelRetryUsed = false;
      } else {
        route = MODEL_ROUTES.ASTRA_MEDIUM;
      }
      continue;
    }

    if (route.tier === 'astra_medium') {
      return failed(attempts, 'model_escalation_exhausted');
    }

    return failed(attempts, 'model_escalation_exhausted');
  }

  return failed(attempts, 'model_escalation_exhausted');
}

module.exports = {
  runTrailieModelRouting,
};
