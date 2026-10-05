'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const consumption = require('../scenarioConsumption');

function loadIdentityContract() {
  try {
    return require('../evaluationIdentity');
  } catch {
    return {};
  }
}

const USER_ID = '0123456789abcdef01234567';

describe('Stage 14.7M — canonical run-scoped evaluation identity', () => {
  test('builds the complete contract with a schema-safe address', () => {
    const { buildRunScopedEvaluationIdentity } = loadIdentityContract();
    const identity = buildRunScopedEvaluationIdentity({
      evaluationRunId: 'stage147m-real-subprocess', evaluationUserId: USER_ID,
    });
    expect(identity).toEqual({
      evaluationRunId: 'stage147m-real-subprocess',
      evaluationUserId: USER_ID,
      evaluationUserEmail: expect.stringMatching(/^stage147eval[a-z0-9]+@example\.com$/),
    });
    expect(identity.evaluationUserEmail).not.toContain('+');
    expect(identity.evaluationUserEmail.length).toBeLessThanOrEqual(254);
  });

  test('punctuation is normalized through an allowlist and remains unique', () => {
    const { buildRunScopedEvaluationIdentity } = loadIdentityContract();
    const punctuated = buildRunScopedEvaluationIdentity({
      evaluationRunId: 'Run.With:/Punctuation_42', evaluationUserId: USER_ID,
    });
    const collapsedPeer = buildRunScopedEvaluationIdentity({
      evaluationRunId: 'RunWithPunctuation_42', evaluationUserId: USER_ID,
    });
    expect(punctuated.evaluationUserEmail).toMatch(/^stage147eval[a-z0-9]+@example\.com$/);
    expect(punctuated.evaluationUserEmail).not.toBe(collapsedPeer.evaluationUserEmail);
  });

  test('same run is stable and two runs are distinct', () => {
    const { buildRunScopedEvaluationIdentity } = loadIdentityContract();
    const one = buildRunScopedEvaluationIdentity({ evaluationRunId: 'run-alpha', evaluationUserId: USER_ID });
    const again = buildRunScopedEvaluationIdentity({ evaluationRunId: 'run-alpha', evaluationUserId: USER_ID });
    const two = buildRunScopedEvaluationIdentity({ evaluationRunId: 'run-beta', evaluationUserId: USER_ID });
    expect(again.evaluationUserEmail).toBe(one.evaluationUserEmail);
    expect(two.evaluationUserEmail).not.toBe(one.evaluationUserEmail);
  });

  test.each(['', '---', null])('rejects an unusable run id %p with a bounded code', (evaluationRunId) => {
    const { buildRunScopedEvaluationIdentity, EVALUATION_IDENTITY_INVALID } = loadIdentityContract();
    expect(() => buildRunScopedEvaluationIdentity({ evaluationRunId, evaluationUserId: USER_ID }))
      .toThrow(expect.objectContaining({ code: EVALUATION_IDENTITY_INVALID }));
  });

  test('rejects an invalid ObjectId and prohibits the shared fallback identity', () => {
    const { buildRunScopedEvaluationIdentity, validateRunScopedEvaluationIdentity } = loadIdentityContract();
    expect(() => buildRunScopedEvaluationIdentity({ evaluationRunId: 'run', evaluationUserId: 'bad' }))
      .toThrow(expect.objectContaining({ code: 'evaluation_identity_invalid' }));
    expect(validateRunScopedEvaluationIdentity({
      evaluationRunId: 'run', evaluationUserId: USER_ID,
      evaluationUserEmail: 'stage147eval@example.com',
    }).ok).toBe(false);
  });

  test('generated identity passes fixture validation and the actual User schema', () => {
    const { buildRunScopedEvaluationIdentity, buildEvaluationAuthenticationFixture } = loadIdentityContract();
    const { validateEvaluationFixtures } = require('../../bootstrap/fixtureValidator');
    const User = require('../../../models/User');
    const identity = buildRunScopedEvaluationIdentity({ evaluationRunId: 'run-contract', evaluationUserId: USER_ID });
    const fixtures = buildEvaluationAuthenticationFixture({ identity, scenarioIds: ['basic-03-seven-day'] });
    expect(validateEvaluationFixtures(fixtures).ok).toBe(true);
    expect(new User(fixtures.user).validateSync()).toBeUndefined();
  });

  test('the authentication child uses the canonical fixture builder with no shared fallback', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../stage14_7e/scenarioChild.js'), 'utf8');
    expect(source).toContain('buildEvaluationAuthenticationFixture');
    expect(source).not.toContain("evaluationUserEmail || 'stage147eval@example.com'");
  });

  test('invalid identity refuses before exposure, manifest, markers, or a scenario launch', async () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage147m-invalid-identity-'));
    const saved = process.env.TRAILIE_EVAL_CONSUMPTION_DIR;
    process.env.TRAILIE_EVAL_CONSUMPTION_DIR = temp;
    try {
      const { executeLiveScenarios } = require('../liveExecutor');
      const calls = [];
      const result = await executeLiveScenarios({
        env: {}, runId: 'invalid-identity-run',
        identityBuilder: () => { throw Object.assign(new Error('bounded'), { code: 'evaluation_identity_invalid' }); },
        exposureResolver: () => { calls.push('exposure'); throw new Error('must not run'); },
        manifestGate: () => { calls.push('manifest'); throw new Error('must not run'); },
        runScenario: () => { calls.push('scenario'); throw new Error('must not run'); },
      });
      expect(result).toMatchObject({
        executionStatus: 'LIVE_EXECUTION_NOT_STARTED',
        liveExecutionStarted: false,
        stopReason: 'evaluation_identity_invalid',
        scenariosRun: 0,
        liveProviderCalls: 0,
        liveProviderCostUsd: 0,
      });
      expect(calls).toEqual([]);
      expect(consumption.readConsumption('basic-02-three-day-model-fix-validation-1')).toBeNull();
      expect(consumption.readConsumption('basic-03-seven-day')).toBeNull();
    } finally {
      if (saved === undefined) delete process.env.TRAILIE_EVAL_CONSUMPTION_DIR;
      else process.env.TRAILIE_EVAL_CONSUMPTION_DIR = saved;
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});

describe('Stage 14.7M — corrected non-execution evidence', () => {
  test('records the identity failure without a consumed or voided attempt', () => {
    const { IDENTITY_FAILURE_NON_EXECUTION } = require('../nonExecutionEvidence');
    expect(IDENTITY_FAILURE_NON_EXECUTION).toEqual({
      status: 'LIVE_EXECUTION_NOT_STARTED',
      reason: 'evaluation_fixture_invalid',
      providerDispatchAuthorizations: 0,
      providerCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      scenarioConsumed: false,
    });
  });
});
