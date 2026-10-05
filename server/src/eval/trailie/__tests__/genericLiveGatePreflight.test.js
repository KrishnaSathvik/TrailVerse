'use strict';

const {
  EXPECTED_ROUTE_ID,
  buildGenericLiveGatePreflight,
} = require('../genericLiveGatePreflight');

const readyEnv = {
  NODE_ENV: 'development',
  TRAILIE_V2_RUNTIME_ENABLED: 'true',
  TRAILIE_EVIDENCE_REFRESH_HASH_SECRET: 'ephemeral-test-secret',
  TRAILIE_EVAL_CAPTURE_PLAN_STAGES: 'true',
  OPENAI_API_KEY: 'configured',
  NPS_API_KEY: 'configured',
  GMAPS_SERVER_KEY: 'configured',
};

describe('generic live gate zero-cost preflight', () => {
  test('passes only when runtime, auth, route, evidence secret, providers, and local flags are ready', () => {
    expect(buildGenericLiveGatePreflight({ env: readyEnv, authenticated: true })).toEqual({
      preflightVersion: 'generic-live-gate-preflight.v1',
      routeId: EXPECTED_ROUTE_ID,
      ready: true,
      checks: expect.objectContaining({
        backendResponding: true,
        authValid: true,
        runtimeEnabled: true,
        evidenceRefreshSecretPresent: true,
        correctV2Route: true,
        nonProductionRuntime: true,
        planStageCaptureEnabled: true,
      }),
      blockers: [],
    });
  });

  test.each([
    ['TRAILIE_V2_RUNTIME_ENABLED', 'runtimeEnabled'],
    ['TRAILIE_EVIDENCE_REFRESH_HASH_SECRET', 'evidenceRefreshSecretPresent'],
    ['OPENAI_API_KEY', 'modelProviderConfigured'],
    ['NPS_API_KEY', 'npsEvidenceConfigured'],
    ['GMAPS_SERVER_KEY', 'mapsEvidenceConfigured'],
    ['TRAILIE_EVAL_CAPTURE_PLAN_STAGES', 'planStageCaptureEnabled'],
  ])('missing %s blocks before spend', (key, blocker) => {
    const env = { ...readyEnv };
    delete env[key];
    const result = buildGenericLiveGatePreflight({ env, authenticated: true });
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain(blocker);
  });

  test('invalid auth blocks before spend', () => {
    expect(buildGenericLiveGatePreflight({ env: readyEnv, authenticated: false }).blockers)
      .toContain('authValid');
  });
});
