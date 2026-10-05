'use strict';

/**
 * Stage 14.7I §2/§3 — ONE Claude model resolution, shared by every branch.
 *
 * THE DEFECT THIS REPLACES
 * ------------------------
 * The real frontend client never sends a `model` field (it posts messages,
 * systemPrompt, provider, temperature, top_p, maxTokens, conversationId and
 * metadata). Each call site compensated on its own:
 *
 *   prose path        model || CLAUDE_FALLBACK_MODELS[0]   ← defaulted
 *   tool-first Phase A  model                              ← did NOT
 *
 * So Phase A reached the Anthropic SDK with `model: undefined`, was rejected
 * twice with `400 invalid_request_error: "model: Field required"`, and the route
 * silently degraded to `prose_only`. Early itinerary delivery never engaged —
 * and no deterministic test could see it, because the require-cache stand-in
 * ignored `params.model`.
 *
 * Two separate fallback expressions is the bug. This module is the single
 * expression both paths now consume, plus the assertion that nothing unresolved
 * can reach a reservation, a dispatch or the network.
 */

const {
  CLAUDE_PRIMARY_MODEL,
  CLAUDE_FALLBACK_MODELS,
  OPENAI_PRIMARY_MODEL,
  OPENAI_FALLBACK_MODELS,
} = require('./aiModels');

const RESOLUTION_CODES = {
  NOT_RESOLVED: 'claude_model_not_resolved',
  NOT_ALLOWLISTED: 'claude_model_not_allowlisted',
  OPENAI_NOT_RESOLVED: 'openai_model_not_resolved',
  OPENAI_NOT_ALLOWLISTED: 'openai_model_not_allowlisted',
};

const RESOLUTION_SOURCE = {
  EXPLICIT: 'explicit_request_model',
  CONFIGURED: 'configured_primary_model',
};

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * The models a provider may be dispatched with.
 *
 * An evaluation run narrows this further via TRAILIE_EVAL_MODEL_ALLOWLIST; that
 * gate lives in the evaluation layer and is applied in addition to this one,
 * never instead of it.
 */
function allowedModelsFor(provider) {
  if (provider === 'openai') {
    const localModels = require('./trailieRuntime').isLocalTrailie()
      ? Object.keys(require('./trailieModelCapabilities').MODEL_CAPABILITIES) : [];
    return [...new Set([OPENAI_PRIMARY_MODEL, ...OPENAI_FALLBACK_MODELS, ...localModels])].filter(nonEmptyString);
  }
  return CLAUDE_FALLBACK_MODELS.filter(nonEmptyString);
}

/**
 * Resolves the model ONCE, before the route branches into structured or prose
 * generation.
 *
 * @param {Object} params
 * @param {string} [params.requestedModel] whatever the client supplied (usually nothing)
 * @param {string} [params.provider] 'claude' | 'openai'
 * @returns {{ok: boolean, model: ?string, source: ?string, boundedCode: ?string, allowed: string[]}}
 */
function resolveProviderModel({ requestedModel = null, provider = 'claude' } = {}) {
  const allowed = allowedModelsFor(provider);
  const isOpenAi = provider === 'openai';

  // An explicitly requested model is honoured, but only when allowlisted. A
  // client-supplied string is never passed through unchecked.
  if (nonEmptyString(requestedModel)) {
    const requested = requestedModel.trim();
    if (!allowed.includes(requested)) {
      return {
        ok: false,
        model: null,
        source: null,
        boundedCode: isOpenAi ? RESOLUTION_CODES.OPENAI_NOT_ALLOWLISTED : RESOLUTION_CODES.NOT_ALLOWLISTED,
        allowed,
      };
    }
    return { ok: true, model: requested, source: RESOLUTION_SOURCE.EXPLICIT, boundedCode: null, allowed };
  }

  // No model from the client — the ordinary case. Fall back to the configured
  // primary, which is what the prose path always did.
  const configured = isOpenAi ? OPENAI_PRIMARY_MODEL : CLAUDE_PRIMARY_MODEL;
  if (!nonEmptyString(configured)) {
    return {
      ok: false,
      model: null,
      source: null,
      boundedCode: isOpenAi ? RESOLUTION_CODES.OPENAI_NOT_RESOLVED : RESOLUTION_CODES.NOT_RESOLVED,
      allowed,
    };
  }
  return { ok: true, model: configured, source: RESOLUTION_SOURCE.CONFIGURED, boundedCode: null, allowed };
}

/**
 * §3 — the pre-dispatch invariant.
 *
 * Called immediately before a reservation is taken and before the SDK is
 * touched. A configuration failure is detected LOCALLY, so it costs no provider
 * request and triggers no structured retry (§6): retrying a locally-detectable
 * missing model is how one misconfiguration became two 400s.
 *
 * WHERE THE TWO CHECKS LIVE
 * -------------------------
 * `nonEmptyString` is enforced HERE, unconditionally. That is the defect the
 * live run hit: `undefined` reaching the SDK.
 *
 * Allowlist membership is enforced at the INPUT BOUNDARY — `resolveProviderModel`,
 * which is the only place a client-supplied model can enter — and again by the
 * evaluation layer's own `TRAILIE_EVAL_MODEL_ALLOWLIST` before a paid run. It is
 * opt-in here (`enforceAllowlist`) rather than unconditional, because by this
 * point the value has already come through resolution, and because the
 * evaluation harness legitimately drives this code with synthetic provider/model
 * pairs (`synthetic-claude`, and deliberately-unlisted ids used to exercise
 * rejection paths). Hard-coding the production allowlist this deep would reject
 * those valid callers without closing any real gap.
 *
 * @throws {Error} with `.code` set to a bounded resolution code
 */
function assertDispatchableModel({ model, provider = 'claude', enforceAllowlist = false } = {}) {
  if (!nonEmptyString(model)) {
    const error = new Error(RESOLUTION_CODES.NOT_RESOLVED);
    error.code = provider === 'openai' ? RESOLUTION_CODES.OPENAI_NOT_RESOLVED : RESOLUTION_CODES.NOT_RESOLVED;
    error.providerDispatchBlocked = true;
    throw error;
  }
  if (enforceAllowlist && !allowedModelsFor(provider).includes(model.trim())) {
    const error = new Error(RESOLUTION_CODES.NOT_ALLOWLISTED);
    error.code = provider === 'openai' ? RESOLUTION_CODES.OPENAI_NOT_ALLOWLISTED : RESOLUTION_CODES.NOT_ALLOWLISTED;
    error.providerDispatchBlocked = true;
    throw error;
  }
  return true;
}

/**
 * Non-throwing form. Defaults to ENFORCING the allowlist, because its callers
 * (the strict synthetic adapter, evaluation gates) are asking "may this exact
 * model be dispatched?", not "is this value shaped like a model?".
 */
function isDispatchableModel({ model, provider = 'claude', enforceAllowlist = true } = {}) {
  try {
    return assertDispatchableModel({ model, provider, enforceAllowlist });
  } catch {
    return false;
  }
}

module.exports = {
  RESOLUTION_CODES,
  RESOLUTION_SOURCE,
  allowedModelsFor,
  resolveProviderModel,
  assertDispatchableModel,
  isDispatchableModel,
};
