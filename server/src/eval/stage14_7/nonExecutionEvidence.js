'use strict';

/** Stage 14.7L live invocation: fixture rejection before any dispatch. */
const IDENTITY_FAILURE_NON_EXECUTION = Object.freeze({
  status: 'LIVE_EXECUTION_NOT_STARTED',
  reason: 'evaluation_fixture_invalid',
  providerDispatchAuthorizations: 0,
  providerCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  scenarioConsumed: false,
});

module.exports = { IDENTITY_FAILURE_NON_EXECUTION };
