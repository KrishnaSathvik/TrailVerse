'use strict';

/**
 * Stage 14.7G §2/§8 — the single explicit gate between a passing preflight and a
 * paid provider request.
 *
 * Stage 14.7F7 shipped a runner that could only ever exit 2: readiness was
 * computed but nothing consumed it. This module is the missing consumer, and it
 * is deliberately the ONLY thing in the tree that can answer "may we spend
 * money?". It is pure — it reads an environment and a composite result and
 * returns a verdict. It never constructs a provider, never reads a key's value
 * and never mutates state.
 *
 * Fail-closed: `authorized` is true only when every condition is individually
 * true. Every refusal reason is returned, so an operator sees the whole story.
 */

const bool = (v) => String(v == null ? '' : v).toLowerCase() === 'true';

/** §12 — a refusal before provider construction is NOT a Stage 14.7 decision. */
const LIVE_EXECUTION_NOT_STARTED = 'LIVE_EXECUTION_NOT_STARTED';

const GATE_CODES = {
  PREFLIGHT_ONLY_SET: 'preflight_only_set',
  EXECUTE_LIVE_NOT_SET: 'execute_live_not_set',
  LIVE_PROVIDERS_NOT_SET: 'live_providers_not_set',
  COMPOSITE_PREFLIGHT_FAILED: 'composite_preflight_failed',
  LIVE_EXECUTION_NOT_READY: 'live_execution_not_ready',
  RECEIPT_INVALID: 'readiness_receipt_invalid',
  PROVIDER_NOT_CONFIGURED: 'live_provider_not_configured',
  MODEL_NOT_ALLOWLISTED: 'live_model_not_allowlisted',
  OPENAI_NOT_DISABLED: 'openai_not_disabled',
};

/**
 * §2 — the authorization gate. Every condition must hold.
 *
 * @param {Object} params
 * @param {Object} params.env
 * @param {Object} params.readiness       composite.readiness
 * @param {Object} params.receiptValidation  { valid, reasons }
 * @returns {{authorized: boolean, reasons: string[], gates: Object}}
 */
function evaluateLiveAuthorization({ env, readiness = null, receiptValidation = null } = {}) {
  const e = env || {};
  const reasons = [];

  // Absent OR false — a preflight-only build must never fall through to spend.
  const preflightOnly = e.TRAILIE_EVAL_PREFLIGHT_ONLY !== undefined && bool(e.TRAILIE_EVAL_PREFLIGHT_ONLY);
  const executeLive = bool(e.TRAILIE_EVAL_EXECUTE_LIVE);
  const liveProviders = bool(e.TRAILIE_EVAL_LIVE_PROVIDERS);

  if (preflightOnly) reasons.push(GATE_CODES.PREFLIGHT_ONLY_SET);
  if (!executeLive) reasons.push(GATE_CODES.EXECUTE_LIVE_NOT_SET);
  if (!liveProviders) reasons.push(GATE_CODES.LIVE_PROVIDERS_NOT_SET);

  if (!readiness || readiness.compositePreflightPassed !== true) reasons.push(GATE_CODES.COMPOSITE_PREFLIGHT_FAILED);
  if (!readiness || readiness.liveExecutionReady !== true) reasons.push(GATE_CODES.LIVE_EXECUTION_NOT_READY);
  /**
   * Stage 14.7J §7/§13 — the gate consumes `liveExecutionAuthorized`, not
   * `valid`.
   *
   * A receipt is now VALID when it faithfully describes a technically-ready
   * tree; it AUTHORIZES only when the reviewed scenario manifest and the
   * whole-plan budget also hold. Reading `valid` here would let a truthful
   * receipt authorize a run that the manifest and the caps refuse.
   */
  if (!receiptValidation || receiptValidation.liveExecutionAuthorized !== true) {
    reasons.push(GATE_CODES.RECEIPT_INVALID);
    for (const refusal of (receiptValidation && receiptValidation.authorizationRefusals) || []) {
      if (!reasons.includes(refusal)) reasons.push(refusal);
    }
  }

  return {
    authorized: reasons.length === 0,
    reasons,
    gates: {
      preflightOnlyAbsentOrFalse: !preflightOnly,
      executeLive,
      liveProviders,
      compositePreflightPassed: Boolean(readiness && readiness.compositePreflightPassed === true),
      liveExecutionReady: Boolean(readiness && readiness.liveExecutionReady === true),
      readinessReceiptValid: Boolean(receiptValidation && receiptValidation.valid === true),
      readinessReceiptAuthorizesLiveExecution:
        Boolean(receiptValidation && receiptValidation.liveExecutionAuthorized === true),
    },
  };
}

/**
 * §8 — provider configuration, validated BEFORE any client is constructed and
 * before any scenario is consumed.
 *
 * The key's PRESENCE is checked; its value is never read, echoed, hashed into a
 * report, or written to the receipt. `keyPresent` below is a boolean and stays a
 * boolean.
 *
 * @returns {{ok: boolean, reasons: string[], model: ?string, keyPresent: boolean}}
 */
function validateLiveProviderConfiguration({ env } = {}) {
  const e = env || {};
  const reasons = [];

  // Presence only. Never `e.ANTHROPIC_API_KEY.slice(...)`, never a length, never
  // a hash — all three leak information about a secret into a report.
  const keyPresent = typeof e.ANTHROPIC_API_KEY === 'string' && e.ANTHROPIC_API_KEY.trim().length > 0;
  if (!keyPresent) reasons.push(GATE_CODES.PROVIDER_NOT_CONFIGURED);

  const allowlist = String(e.TRAILIE_EVAL_MODEL_ALLOWLIST || '').trim();
  const model = String(e.CLAUDE_PRIMARY_MODEL || '').trim() || null;
  // Exact match against the single approved entry, not a prefix or a contains.
  const modelAllowlisted = allowlist === 'claude:claude-sonnet-5' && model === 'claude-sonnet-5';
  if (!modelAllowlisted) reasons.push(GATE_CODES.MODEL_NOT_ALLOWLISTED);

  // OpenAI must be unusable, not merely unused.
  const openAiDisabled = !e.OPENAI_API_KEY && !/openai/i.test(allowlist);
  if (!openAiDisabled) reasons.push(GATE_CODES.OPENAI_NOT_DISABLED);

  return {
    ok: reasons.length === 0,
    reasons,
    model,
    keyPresent,
    modelAllowlisted,
    openAiDisabled,
  };
}

module.exports = {
  LIVE_EXECUTION_NOT_STARTED,
  GATE_CODES,
  evaluateLiveAuthorization,
  validateLiveProviderConfiguration,
};
