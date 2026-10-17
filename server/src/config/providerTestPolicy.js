'use strict';

const fs = require('fs');

const DENY_LIVE_MODE = 'deny_live';
const LIVE_PROVIDER_FORBIDDEN_IN_TEST = 'live_provider_forbidden_in_test';
const LIVE_TESTS_NOT_AUTHORIZED = 'live_tests_not_authorized';
const REQUIRED_LIVE_ACK = 'I_UNDERSTAND_THIS_MAKES_REAL_PROVIDER_CALLS';

let summary = emptySummary();

function emptySummary() {
  return {
    liveAnthropicConstructors: 0,
    liveOpenAiConstructors: 0,
    liveProviderDispatches: 0,
    externalProviderHttpRequests: 0,
    syntheticProviderDispatches: 0,
  };
}

function isLiveProviderDenied(env = process.env) {
  return env.TRAILIE_TEST_PROVIDER_MODE === DENY_LIVE_MODE;
}

function boundedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function appendTripwireEvent(event) {
  const target = process.env.TRAILIE_TEST_TRIPWIRE_FILE;
  if (!target) return;
  try {
    fs.appendFileSync(target, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 });
  } catch {
    // The policy still fails closed below. A diagnostic write must never turn
    // into a permissive provider path or expose the target path.
  }
}

function recordLiveAttempt(provider, phase) {
  const normalizedProvider = provider === 'openai' ? 'openai' : 'claude';
  const normalizedPhase = ['constructor', 'dispatch', 'http'].includes(phase) ? phase : 'dispatch';
  if (normalizedPhase === 'constructor') {
    if (normalizedProvider === 'openai') summary.liveOpenAiConstructors += 1;
    else summary.liveAnthropicConstructors += 1;
  } else if (normalizedPhase === 'http') {
    summary.externalProviderHttpRequests += 1;
  } else {
    summary.liveProviderDispatches += 1;
  }
  appendTripwireEvent({ type: 'live_provider_tripwire', provider: normalizedProvider, phase: normalizedPhase });
}

function assertLiveTestsAuthorized(env = process.env) {
  if (env.TRAILIE_ALLOW_LIVE_TESTS !== 'true' || env.TRAILIE_LIVE_TEST_ACK !== REQUIRED_LIVE_ACK) {
    throw boundedError(LIVE_TESTS_NOT_AUTHORIZED);
  }
  return { authorized: true };
}

function isAuthorizedStage14_7Child(env = process.env) {
  return env.TRAILIE_STAGE14_7_LIVE_CHILD_AUTHORIZED === 'true'
    && env.TRAILIE_EVAL_EXECUTE_LIVE === 'true'
    && env.TRAILIE_EVAL_LIVE_PROVIDERS === 'true'
    && !isLiveProviderDenied(env);
}

function assertLiveProviderAllowed({ env = process.env, provider, phase, synthetic = false } = {}) {
  if (synthetic) {
    if (phase === 'dispatch') summary.syntheticProviderDispatches += 1;
    return { allowed: true, synthetic: true };
  }
  if (isLiveProviderDenied(env)) {
    recordLiveAttempt(provider, phase);
    throw boundedError(LIVE_PROVIDER_FORBIDDEN_IN_TEST);
  }
  if (env.NODE_ENV === 'test' && !isAuthorizedStage14_7Child(env)) {
    assertLiveTestsAuthorized(env);
  }
  return { allowed: true, synthetic: false };
}

function recordExternalProviderHttpRequest(provider, env = process.env) {
  if (!isLiveProviderDenied(env)) return { recorded: false };
  recordLiveAttempt(provider, 'http');
  throw boundedError(LIVE_PROVIDER_FORBIDDEN_IN_TEST);
}

function getProviderTestSummary() {
  return { ...summary };
}

function resetProviderTestSummary() {
  summary = emptySummary();
}

module.exports = {
  DENY_LIVE_MODE,
  LIVE_PROVIDER_FORBIDDEN_IN_TEST,
  LIVE_TESTS_NOT_AUTHORIZED,
  REQUIRED_LIVE_ACK,
  isLiveProviderDenied,
  assertLiveTestsAuthorized,
  isAuthorizedStage14_7Child,
  assertLiveProviderAllowed,
  recordExternalProviderHttpRequest,
  getProviderTestSummary,
  resetProviderTestSummary,
};
