'use strict';

/**
 * Stage 14.7J §2/§3/§5 — model authorization AT DISPATCH DEPTH.
 *
 * WHY THIS EXISTS ON TOP OF `resolveProviderModel`
 * ------------------------------------------------
 * Stage 14.7I fixed the production defect at the input boundary:
 * `prepareChatContext` now resolves the model once, so a client that sends no
 * model can no longer reach Anthropic with `undefined`. That boundary is
 * necessary and it is where a CLIENT-supplied model is rejected.
 *
 * It is not, however, the last boundary. `prepareChatContext` is one caller.
 * An internal caller, a future route, a recovery path or a refactor can reach
 * the orchestrator — and through it the SDK — with a nonempty but unauthorized
 * model, without ever passing through resolution. 14.7I left allowlist
 * enforcement at this depth OPT-IN (`enforceAllowlist: false`), which means the
 * deep check existed but was switched off on the only path that matters.
 *
 * So the contract is now enforced where the money is spent:
 *
 *   model is a nonempty string
 *   AND model is a member of the effective allowlist for this provider
 *
 * asserted immediately before every reservation and every dispatch.
 *
 * NO PERMISSIVE DEFAULT
 * ---------------------
 * There is deliberately no `skipAllowlist`, `allowAnyModel`,
 * `disableModelValidation` or `testModeAllowsEverything`, and no
 * environment-dependent bypass. A missing or empty policy is a REFUSAL
 * (`claude_model_policy_missing`), not a pass. The evaluation harness keeps its
 * synthetic model ids by INJECTING its own allowlist, which is a narrowing, not
 * an escape hatch.
 */

const {
  CLAUDE_PRIMARY_MODEL,
  CLAUDE_FALLBACK_MODELS,
  OPENAI_PRIMARY_MODEL,
  OPENAI_FALLBACK_MODELS,
} = require('./aiModels');

/** Bounded failure vocabulary. Nothing else is ever thrown from here. */
const DISPATCH_CODES = {
  NOT_RESOLVED: 'claude_model_not_resolved',
  NOT_ALLOWLISTED: 'claude_model_not_allowlisted',
  POLICY_MISSING: 'claude_model_policy_missing',
  IDENTITY_CHANGED: 'provider_model_identity_changed',
  OPENAI_NOT_RESOLVED: 'openai_model_not_resolved',
  OPENAI_NOT_ALLOWLISTED: 'openai_model_not_allowlisted',
  OPENAI_POLICY_MISSING: 'openai_model_policy_missing',
};

const CODES_BY_PROVIDER = {
  openai: {
    notResolved: DISPATCH_CODES.OPENAI_NOT_RESOLVED,
    notAllowlisted: DISPATCH_CODES.OPENAI_NOT_ALLOWLISTED,
    policyMissing: DISPATCH_CODES.OPENAI_POLICY_MISSING,
  },
  claude: {
    notResolved: DISPATCH_CODES.NOT_RESOLVED,
    notAllowlisted: DISPATCH_CODES.NOT_ALLOWLISTED,
    policyMissing: DISPATCH_CODES.POLICY_MISSING,
  },
};

function codesFor(provider) {
  return provider === 'openai' ? CODES_BY_PROVIDER.openai : CODES_BY_PROVIDER.claude;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function blocked(code) {
  const error = new Error(code);
  error.code = code;
  error.providerDispatchBlocked = true;
  return error;
}

/** The models this provider is configured to use at all. */
function configuredModelsFor(provider) {
  if (provider === 'openai') {
    return [OPENAI_PRIMARY_MODEL, ...OPENAI_FALLBACK_MODELS].filter(nonEmptyString);
  }
  return CLAUDE_FALLBACK_MODELS.filter(nonEmptyString);
}

/**
 * §3 — parse the receipt-covered evaluation allowlist.
 *
 * The paid-run form is `TRAILIE_EVAL_MODEL_ALLOWLIST="claude:claude-sonnet-5"`.
 * Entries may be `provider:model` or a bare `model` (historically Claude-only,
 * still accepted for the Claude provider so an older configuration narrows
 * rather than silently widening).
 *
 * @returns {string[]} models this provider may use, or [] when the variable
 *   names nothing for it. [] is a refusal, never "no opinion".
 */
function parseEvaluationModelAllowlist(raw, provider = 'claude') {
  return String(raw || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const colon = entry.indexOf(':');
      if (colon === -1) return { provider: 'claude', model: entry };
      return { provider: entry.slice(0, colon).trim().toLowerCase(), model: entry.slice(colon + 1).trim() };
    })
    .filter((e) => e.provider === provider && nonEmptyString(e.model))
    .map((e) => e.model);
}

/**
 * The EFFECTIVE allowlist for a dispatch.
 *
 * Production (no evaluation variable set) → the configured provider models.
 * A paid evaluation run → the INTERSECTION with the receipt-covered
 * `TRAILIE_EVAL_MODEL_ALLOWLIST`, which is strictly narrower.
 *
 * The intersection is what makes this fail closed: an evaluation allowlist that
 * names nothing this provider is configured for yields [], and [] refuses.
 *
 * @returns {{allowedModels: string[], source: string, evaluationScoped: boolean}}
 */
function resolveDispatchModelPolicy({ provider = 'claude', env = process.env } = {}) {
  const configured = configuredModelsFor(provider);
  const rawEval = (env || {}).TRAILIE_EVAL_MODEL_ALLOWLIST;

  if (!nonEmptyString(rawEval)) {
    return { allowedModels: configured, source: 'configured_provider_models', evaluationScoped: false };
  }

  const evaluationScoped = parseEvaluationModelAllowlist(rawEval, provider);
  return {
    allowedModels: configured.filter((m) => evaluationScoped.includes(m)),
    source: 'evaluation_model_allowlist_intersection',
    evaluationScoped: true,
  };
}

/**
 * §2 — THE assertion. Runs immediately before every provider reservation and
 * every provider dispatch.
 *
 * Ordering matters: a missing policy is reported as a missing policy rather
 * than as "your model is not on the (empty) list", because the two demand
 * different fixes and conflating them is how a fail-closed check gets
 * "corrected" into a permissive one.
 *
 * @param {Object} params
 * @param {string} params.provider
 * @param {string} params.model
 * @param {string[]} params.allowedModels  REQUIRED. No default.
 * @throws {Error} `.code` ∈ DISPATCH_CODES, `.providerDispatchBlocked === true`
 */
function assertProviderDispatchModel({ provider = 'claude', model, allowedModels } = {}) {
  const codes = codesFor(provider);

  if (!Array.isArray(allowedModels) || allowedModels.filter(nonEmptyString).length === 0) {
    throw blocked(codes.policyMissing);
  }
  if (!nonEmptyString(model)) {
    throw blocked(codes.notResolved);
  }
  if (!allowedModels.includes(model.trim())) {
    throw blocked(codes.notAllowlisted);
  }
  return true;
}

/** Non-throwing form. Same rules — there is no laxer variant. */
function isProviderDispatchModelAllowed(params) {
  try {
    return assertProviderDispatchModel(params);
  } catch {
    return false;
  }
}

/**
 * §5 — resolution / reservation / dispatch must name the SAME model.
 *
 * The allowlist check answers "may this model be used". This answers "is this
 * still the model we validated". Without it, a component between validation and
 * the SDK could substitute another value — including a valid-looking one — and
 * every earlier gate would have passed on a model that was never dispatched.
 *
 * Any mismatch fails before network access.
 */
function assertProviderModelIdentity({ resolvedModel, reservationModel, dispatchModel } = {}) {
  const values = [resolvedModel, reservationModel, dispatchModel];
  if (values.some((v) => !nonEmptyString(v))) throw blocked(DISPATCH_CODES.NOT_RESOLVED);
  const [a, b, c] = values.map((v) => v.trim());
  if (a !== b || b !== c) throw blocked(DISPATCH_CODES.IDENTITY_CHANGED);
  return true;
}

/**
 * A guard bound to ONE resolved model, carried from context preparation to the
 * SDK call.
 *
 * The two assertion points read the model at genuinely different moments —
 * `assertReservation` from the value about to be reserved, `assertDispatch`
 * from the request object the SDK is about to receive — so a substitution
 * between them is observable rather than assumed impossible.
 */
function createDispatchModelGuard({ provider = 'claude', resolvedModel, allowedModels } = {}) {
  // The resolved model is itself validated once, at creation: a guard built
  // around an unauthorized model must not be able to authorize anything.
  assertProviderDispatchModel({ provider, model: resolvedModel, allowedModels });
  const resolved = String(resolvedModel).trim();
  let reserved = null;

  return {
    provider,
    resolvedModel: resolved,
    allowedModels: [...allowedModels],

    /** Before the reservation is taken. */
    assertReservation(model) {
      assertProviderDispatchModel({ provider, model, allowedModels });
      assertProviderModelIdentity({
        resolvedModel: resolved, reservationModel: model, dispatchModel: model,
      });
      reserved = String(model).trim();
      return true;
    },

    /** Immediately before the SDK is invoked. */
    assertDispatch(model) {
      assertProviderDispatchModel({ provider, model, allowedModels });
      assertProviderModelIdentity({
        resolvedModel: resolved,
        // A dispatch that never reserved is compared against the resolution, so
        // the identity chain is complete either way.
        reservationModel: reserved || resolved,
        dispatchModel: model,
      });
      return true;
    },
  };
}

module.exports = {
  DISPATCH_CODES,
  configuredModelsFor,
  parseEvaluationModelAllowlist,
  resolveDispatchModelPolicy,
  assertProviderDispatchModel,
  isProviderDispatchModelAllowed,
  assertProviderModelIdentity,
  createDispatchModelGuard,
};
