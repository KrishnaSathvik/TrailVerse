'use strict';

/**
 * Stage 14.7O — the explicit credential boundary for the authoritative live
 * scenario subprocess. Only names in this list can cross from the runner into
 * vite-node and then into the application child.
 */
const SAFE_RUNTIME_KEYS = Object.freeze([
  'PATH', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'TZ',
  'NODE_ENV',
  'CLAUDE_PRIMARY_MODEL',
  'TRAILIE_EVAL_PREFLIGHT_ONLY',
  'TRAILIE_EVAL_EXECUTE_LIVE',
  'TRAILIE_EVAL_LIVE_PROVIDERS',
  'TRAILIE_EVAL_MODEL_ALLOWLIST',
  'TRAILIE_EVAL_TEST_MONGODB_URI',
  'TRAILIE_EVAL_MAX_TOTAL_COST_USD',
  'TRAILIE_EVAL_MAX_REQUESTS',
  'TRAILIE_EVAL_MAX_INPUT_TOKENS',
  'TRAILIE_EVAL_MAX_OUTPUT_TOKENS',
  'TRAILIE_EVAL_CAPTURE_PRIVATE_DRAFTS',
  'TRAILIE_EVAL_CONSUMPTION_DIR',
  'TRAILIE_EVAL_EVIDENCE_DIR',
  'TRAILIE_ITINERARY_GENERATION_MODE',
  'TRAILIE_ROLLOUT_KILL_SWITCH',
  'TRAILIE_ROLLOUT_TOOL_FIRST_RATE',
  'TRAILIE_PROSE_CONSISTENCY_MODE',
  'TRAILIE_EARLY_ITINERARY_EVENTS',
  'TRAILIE_PROSE_RECOVERY',
  'TRAILIE_REVIEW_ENQUEUE_ENABLED',
  'TRAILIE_TEST_PROVIDER_MODE',
]);

const LIVE_CHILD_READY = 'live_child_ready';
const LIVE_CHILD_AUTHORIZED = 'TRAILIE_STAGE14_7_LIVE_CHILD_AUTHORIZED';
const NOT_STARTED = 'LIVE_EXECUTION_NOT_STARTED';

const present = (value) => typeof value === 'string' && value.trim().length > 0;
const trueValue = (value) => String(value ?? '').toLowerCase() === 'true';

function allLiveGatesPass({ parentEnv, executionMode, liveGates }) {
  const gates = liveGates || {};
  return executionMode === 'live'
    && trueValue(parentEnv?.TRAILIE_EVAL_EXECUTE_LIVE)
    && trueValue(parentEnv?.TRAILIE_EVAL_LIVE_PROVIDERS)
    && parentEnv?.TRAILIE_TEST_PROVIDER_MODE !== 'deny_live'
    && gates.executeLive === true
    && gates.liveProviders === true
    && gates.providerDenyInactive === true
    && gates.receiptValid === true
    && gates.manifestReady === true
    && gates.cumulativeBudgetFeasible === true;
}

function buildSecureScenarioEnvironment({ parentEnv = {}, executionMode, liveGates = {} } = {}) {
  const env = {};
  for (const key of SAFE_RUNTIME_KEYS) {
    if (parentEnv[key] !== undefined) env[key] = String(parentEnv[key]);
  }

  const parentKeyPresent = present(parentEnv.ANTHROPIC_API_KEY);
  const mayForward = parentKeyPresent && allLiveGatesPass({ parentEnv, executionMode, liveGates });
  if (mayForward) {
    env.ANTHROPIC_API_KEY = parentEnv.ANTHROPIC_API_KEY;
    env[LIVE_CHILD_AUTHORIZED] = 'true';
  }

  return {
    env,
    credentialPresence: {
      parent: parentKeyPresent,
      subprocess: present(env.ANTHROPIC_API_KEY),
    },
  };
}

function failure(code) {
  return {
    ok: false,
    status: NOT_STARTED,
    boundedCode: code,
    anthropicKeyPresent: false,
    modelAllowlisted: false,
    responseStartedEvents: 0,
    thinkingEvents: 0,
    providerReservations: 0,
    dispatchAuthorizations: 0,
    scenarioConsumed: false,
  };
}

function validateChildProviderConfiguration({
  env = {}, executionMode, resolvedModel, allowedModels = [], previouslyReady = false,
} = {}) {
  const isLive = executionMode === 'live';
  if (!isLive) return failure('live_provider_not_authorized');
  if (env.TRAILIE_TEST_PROVIDER_MODE === 'deny_live') {
    return failure('live_provider_forbidden_in_test');
  }
  if (!present(env.ANTHROPIC_API_KEY)) {
    return failure(previouslyReady
      ? 'live_provider_configuration_changed'
      : 'live_provider_not_configured');
  }
  if (!trueValue(env[LIVE_CHILD_AUTHORIZED])
      || !trueValue(env.TRAILIE_EVAL_EXECUTE_LIVE)
      || !trueValue(env.TRAILIE_EVAL_LIVE_PROVIDERS)) {
    return failure('live_provider_not_authorized');
  }

  const normalizedModel = typeof resolvedModel === 'string' ? resolvedModel.trim() : '';
  if (!normalizedModel) return failure('claude_model_missing');
  if (!allowedModels.includes(normalizedModel)) return failure('claude_model_not_allowlisted');

  const isolatedMongoConfigured = /^mongodb:\/\/127\.0\.0\.1:27018\/trailverse_eval_14_7(?:\?|$)/
    .test(String(env.TRAILIE_EVAL_TEST_MONGODB_URI || ''));
  if (!isolatedMongoConfigured) return failure('evaluation_mongo_uri_invalid');

  return {
    ok: true,
    status: null,
    boundedCode: null,
    anthropicKeyPresent: true,
    resolvedModel: normalizedModel,
    modelResolved: true,
    modelAllowlisted: true,
    providerMode: 'live',
    isolatedMongoConfigured: true,
  };
}

function buildLiveChildReadyMessage(validation = {}) {
  return {
    type: LIVE_CHILD_READY,
    providerConfigured: validation.ok === true && validation.anthropicKeyPresent === true,
    providerPolicyAllowsLive: validation.ok === true && validation.providerMode === 'live',
    providerMode: validation.ok === true ? validation.providerMode : null,
    modelResolved: validation.ok === true && validation.modelResolved !== false,
    modelAllowlisted: validation.ok === true && validation.modelAllowlisted === true,
    resolvedModel: validation.ok === true ? validation.resolvedModel : null,
    isolatedMongoConfigured: validation.ok === true && validation.isolatedMongoConfigured !== false,
  };
}

function scanProviderSecretIsolation({ secretValues = [], surfaces = {} } = {}) {
  const secrets = secretValues.filter(present);
  const appearances = [];
  for (const [name, value] of Object.entries(surfaces)) {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (secrets.some((secret) => text.includes(secret))) appearances.push(name);
  }
  return { ok: appearances.length === 0, appearances };
}

module.exports = {
  SAFE_RUNTIME_KEYS,
  LIVE_CHILD_READY,
  LIVE_CHILD_AUTHORIZED,
  buildSecureScenarioEnvironment,
  validateChildProviderConfiguration,
  buildLiveChildReadyMessage,
  scanProviderSecretIsolation,
};
