'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  LIVE_CHILD_READY,
  buildSecureScenarioEnvironment,
  validateChildProviderConfiguration,
  buildLiveChildReadyMessage,
  scanProviderSecretIsolation,
} = require('../childProviderReadiness');

const SENTINEL = 'sk-ant-stage147o-secret-shaped-sentinel';

const LIVE_GATES = Object.freeze({
  executeLive: true,
  liveProviders: true,
  providerDenyInactive: true,
  receiptValid: true,
  manifestReady: true,
  cumulativeBudgetFeasible: true,
});

const parentEnv = (extra = {}) => ({
  PATH: process.env.PATH,
  NODE_ENV: 'test',
  ANTHROPIC_API_KEY: SENTINEL,
  OPENAI_API_KEY: 'sk-openai-must-not-cross',
  RESEND_API_KEY: 're_must_not_cross',
  NPS_API_KEY: 'nps_must_not_cross',
  RIDB_API_KEY: 'ridb_must_not_cross',
  MONGODB_URI: 'mongodb+srv://production-must-not-cross',
  CLAUDE_PRIMARY_MODEL: 'claude-sonnet-5',
  TRAILIE_EVAL_EXECUTE_LIVE: 'true',
  TRAILIE_EVAL_LIVE_PROVIDERS: 'true',
  TRAILIE_EVAL_MODEL_ALLOWLIST: 'claude:claude-sonnet-5',
  TRAILIE_EVAL_TEST_MONGODB_URI: 'mongodb://127.0.0.1:27018/trailverse_eval_14_7',
  TRAILIE_EVAL_MAX_TOTAL_COST_USD: '1.50',
  TRAILIE_EVAL_MAX_REQUESTS: '12',
  TRAILIE_EVAL_MAX_INPUT_TOKENS: '240000',
  TRAILIE_EVAL_MAX_OUTPUT_TOKENS: '100000',
  ...extra,
});

describe('Stage 14.7O secure child provider boundary', () => {
  test('forwards only the Anthropic credential and allowlisted runtime values after every live gate passes', () => {
    const result = buildSecureScenarioEnvironment({
      parentEnv: parentEnv(), executionMode: 'live', liveGates: LIVE_GATES,
    });

    expect(result.credentialPresence).toEqual({
      parent: true,
      subprocess: true,
    });
    expect(result.env.ANTHROPIC_API_KEY).toBe(SENTINEL);
    expect(result.env.CLAUDE_PRIMARY_MODEL).toBe('claude-sonnet-5');
    expect(result.env.TRAILIE_STAGE14_7_LIVE_CHILD_AUTHORIZED).toBe('true');
    expect(result.env.OPENAI_API_KEY).toBeUndefined();
    expect(result.env.RESEND_API_KEY).toBeUndefined();
    expect(result.env.NPS_API_KEY).toBeUndefined();
    expect(result.env.RIDB_API_KEY).toBeUndefined();
    expect(result.env.MONGODB_URI).toBeUndefined();
  });

  test.each([
    ['missing parent key', parentEnv({ ANTHROPIC_API_KEY: '' }), 'live', LIVE_GATES],
    ['live execution unauthorized', parentEnv(), 'live', { ...LIVE_GATES, receiptValid: false }],
    ['provider deny wins', parentEnv({ TRAILIE_TEST_PROVIDER_MODE: 'deny_live' }), 'live', LIVE_GATES],
    ['deterministic qualification', parentEnv(), 'deterministic', LIVE_GATES],
    ['recorded replay', parentEnv(), 'recorded_replay', LIVE_GATES],
  ])('%s does not forward a live credential', (_label, env, executionMode, liveGates) => {
    const result = buildSecureScenarioEnvironment({ parentEnv: env, executionMode, liveGates });
    expect(result.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(result.credentialPresence.subprocess).toBe(false);
  });

  test('validates the live provider before turn admission', () => {
    const validation = validateChildProviderConfiguration({
      env: buildSecureScenarioEnvironment({
        parentEnv: parentEnv(), executionMode: 'live', liveGates: LIVE_GATES,
      }).env,
      executionMode: 'live',
      resolvedModel: 'claude-sonnet-5',
      allowedModels: ['claude-sonnet-5'],
    });

    expect(validation).toEqual(expect.objectContaining({
      ok: true,
      anthropicKeyPresent: true,
      resolvedModel: 'claude-sonnet-5',
      modelAllowlisted: true,
      providerMode: 'live',
    }));
    expect(buildLiveChildReadyMessage(validation)).toEqual({
      type: LIVE_CHILD_READY,
      providerConfigured: true,
      providerPolicyAllowsLive: true,
      providerMode: 'live',
      modelResolved: true,
      modelAllowlisted: true,
      resolvedModel: 'claude-sonnet-5',
      isolatedMongoConfigured: true,
    });
  });

  test('missing key fails before admission with a bounded non-execution result', () => {
    const validation = validateChildProviderConfiguration({
      env: parentEnv({ ANTHROPIC_API_KEY: '' }),
      executionMode: 'live',
      resolvedModel: 'claude-sonnet-5',
      allowedModels: ['claude-sonnet-5'],
    });

    expect(validation).toEqual(expect.objectContaining({
      ok: false,
      status: 'LIVE_EXECUTION_NOT_STARTED',
      boundedCode: 'live_provider_not_configured',
      responseStartedEvents: 0,
      thinkingEvents: 0,
      providerReservations: 0,
      dispatchAuthorizations: 0,
      scenarioConsumed: false,
    }));
  });

  test('credential removal after readiness fails closed before reservation', () => {
    const validation = validateChildProviderConfiguration({
      env: parentEnv({ ANTHROPIC_API_KEY: '' }),
      executionMode: 'live',
      resolvedModel: 'claude-sonnet-5',
      allowedModels: ['claude-sonnet-5'],
      previouslyReady: true,
    });
    expect(validation.boundedCode).toBe('live_provider_configuration_changed');
    expect(validation.providerReservations).toBe(0);
    expect(validation.dispatchAuthorizations).toBe(0);
  });

  test('secret scan covers bounded launcher, readiness, errors, and lifecycle evidence', () => {
    const clean = scanProviderSecretIsolation({
      secretValues: [SENTINEL, 'sk-openai-must-not-cross'],
      surfaces: {
        parentLauncherResult: { anthropicKeyPresent: true },
        childLauncherResult: { anthropicKeyPresent: true },
        readiness: buildLiveChildReadyMessage({ ok: true, modelAllowlisted: true }),
        providerError: 'live_provider_not_configured',
        stdout: '', stderr: '', timeline: { responseStartedEvents: 0 }, receipt: {},
      },
    });
    expect(clean).toEqual({ ok: true, appearances: [] });

    const leaked = scanProviderSecretIsolation({
      secretValues: [SENTINEL], surfaces: { stderr: `bad ${SENTINEL}` },
    });
    expect(leaked.ok).toBe(false);
    expect(leaked.appearances).toEqual(['stderr']);
  });

  test('private evidence refuses every provider secret before writing an artifact', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stage147o-secret-evidence-'));
    const { writeEvidence } = require('../privateEvidence');
    const outcome = writeEvidence({
      runId: 'stage147o-secret-proof',
      scenarioId: 'basic-02-three-day',
      evidence: {
        parentLauncherResult: { anthropicKeyPresent: true },
        childReadiness: { providerConfigured: true },
        stderr: `must never persist ${SENTINEL}`,
        timeline: { responseStartedEvents: 0 },
      },
      env: {
        NODE_ENV: 'test',
        TRAILIE_EVAL_EVIDENCE_DIR: dir,
        ANTHROPIC_API_KEY: SENTINEL,
      },
    });
    expect(outcome).toEqual({ written: false, boundedCode: 'provider_secret_detected' });
    const files = fs.readdirSync(dir, { recursive: true });
    expect(files).toHaveLength(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
