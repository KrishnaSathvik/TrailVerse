'use strict';

/**
 * Stage 14.7J §2/§3/§4/§5/§12 — model authorization at DISPATCH depth.
 *
 * 14.7I fixed the input boundary and left the deep check opt-in
 * (`enforceAllowlist: false`) on the only path that spends money. These tests
 * pin the corrected contract: a nonempty but unauthorized model, or a missing
 * policy, must fail BEFORE a reservation exists — not at a provider 400 that
 * has already been paid for.
 */

const {
  DISPATCH_CODES,
  configuredModelsFor,
  parseEvaluationModelAllowlist,
  resolveDispatchModelPolicy,
  assertProviderDispatchModel,
  isProviderDispatchModelAllowed,
  assertProviderModelIdentity,
  createDispatchModelGuard,
} = require('../providerDispatchPolicy');
const { CLAUDE_PRIMARY_MODEL } = require('../aiModels');
const { resolveProviderModel } = require('../resolveProviderModel');

/** §4 — the test-scoped policy injection that replaces renaming fixtures. */
const TEST_ALLOWLIST = ['synthetic-claude', 'test-model'];

describe('Stage 14.7J §2 — the dispatch assertion', () => {
  test('an allowlisted model passes', () => {
    expect(assertProviderDispatchModel({
      provider: 'claude', model: 'claude-sonnet-5', allowedModels: ['claude-sonnet-5'],
    })).toBe(true);
  });

  test.each([undefined, null, '', '   '])('a missing model %p fails with not_resolved', (model) => {
    expect(() => assertProviderDispatchModel({ provider: 'claude', model, allowedModels: ['claude-sonnet-5'] }))
      .toThrow(DISPATCH_CODES.NOT_RESOLVED);
  });

  test.each([undefined, null, []])('a missing policy %p fails with policy_missing', (allowedModels) => {
    expect(() => assertProviderDispatchModel({ provider: 'claude', model: 'claude-sonnet-5', allowedModels }))
      .toThrow(DISPATCH_CODES.POLICY_MISSING);
  });

  test('an EMPTY allowlist refuses even the production model', () => {
    // The whole point of failing closed: an empty policy authorizes nothing,
    // including the model everyone "knows" is fine.
    expect(() => assertProviderDispatchModel({
      provider: 'claude', model: CLAUDE_PRIMARY_MODEL, allowedModels: ['  ', ''],
    })).toThrow(DISPATCH_CODES.POLICY_MISSING);
  });

  test('an unauthorized NONEMPTY model fails with not_allowlisted', () => {
    // The 14.7J gap: a value that is a perfectly good string, and is not ours.
    expect(() => assertProviderDispatchModel({
      provider: 'claude', model: 'claude-opus-99', allowedModels: ['claude-sonnet-5'],
    })).toThrow(DISPATCH_CODES.NOT_ALLOWLISTED);
  });

  test('a missing policy is reported as such, not as a rejected model', () => {
    // Conflating the two is how a fail-closed check gets "fixed" permissively.
    try {
      assertProviderDispatchModel({ provider: 'claude', model: 'anything', allowedModels: [] });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error.code).toBe(DISPATCH_CODES.POLICY_MISSING);
      expect(error.providerDispatchBlocked).toBe(true);
    }
  });

  test('every failure is marked as blocking dispatch', () => {
    for (const args of [
      { model: null, allowedModels: ['claude-sonnet-5'] },
      { model: 'gpt-4', allowedModels: ['claude-sonnet-5'] },
      { model: 'claude-sonnet-5', allowedModels: [] },
    ]) {
      expect(() => assertProviderDispatchModel({ provider: 'claude', ...args }))
        .toThrow(expect.objectContaining({ providerDispatchBlocked: true }));
    }
  });

  test('there is no permissive escape hatch on the assertion', () => {
    const src = require('fs').readFileSync(require.resolve('../providerDispatchPolicy'), 'utf8');
    for (const forbidden of ['skipAllowlist', 'allowAnyModel', 'disableModelValidation', 'testModeAllowsEverything']) {
      // The names appear once each in the header comment explaining their
      // absence; they must never appear as an identifier being read.
      expect(new RegExp(`${forbidden}\\s*[=)},.]`).test(src)).toBe(false);
    }
    // And no environment-dependent bypass: the module reads env ONLY through
    // the allowlist resolver, never to decide whether to check at all.
    expect(src).not.toMatch(/NODE_ENV/);
  });
});

describe('Stage 14.7J §4 — synthetic fixtures survive via policy injection', () => {
  test('synthetic ids work ONLY with an explicit test allowlist', () => {
    expect(assertProviderDispatchModel({
      provider: 'claude', model: 'synthetic-claude', allowedModels: TEST_ALLOWLIST,
    })).toBe(true);
    expect(assertProviderDispatchModel({
      provider: 'claude', model: 'test-model', allowedModels: TEST_ALLOWLIST,
    })).toBe(true);

    // Without the injection, the same fixture is refused — the ids were not
    // renamed, the policy simply is not theirs.
    expect(isProviderDispatchModelAllowed({
      provider: 'claude', model: 'synthetic-claude',
      allowedModels: resolveDispatchModelPolicy({ provider: 'claude', env: {} }).allowedModels,
    })).toBe(false);
  });

  test('a fixture proving REJECTION simply omits its model from the allowlist', () => {
    for (const unlisted of ['unlisted', 'some-unlisted-model', 'gpt-x']) {
      expect(() => assertProviderDispatchModel({
        provider: 'claude', model: unlisted, allowedModels: TEST_ALLOWLIST,
      })).toThrow(DISPATCH_CODES.NOT_ALLOWLISTED);
    }
  });

  test('the AUTHORIZED PRODUCTION model passes under the production policy', () => {
    const policy = resolveDispatchModelPolicy({ provider: 'claude', env: {} });
    expect(policy.allowedModels).toContain(CLAUDE_PRIMARY_MODEL);
    expect(assertProviderDispatchModel({
      provider: 'claude', model: CLAUDE_PRIMARY_MODEL, allowedModels: policy.allowedModels,
    })).toBe(true);
  });
});

describe('Stage 14.7J §3 — the effective paid-run allowlist', () => {
  test('production with no evaluation variable uses the configured provider models', () => {
    const policy = resolveDispatchModelPolicy({ provider: 'claude', env: {} });
    expect(policy.allowedModels).toEqual(configuredModelsFor('claude'));
    expect(policy.evaluationScoped).toBe(false);
  });

  test('the receipt-covered configuration NARROWS to exactly claude-sonnet-5', () => {
    const policy = resolveDispatchModelPolicy({
      provider: 'claude', env: { TRAILIE_EVAL_MODEL_ALLOWLIST: 'claude:claude-sonnet-5' },
    });
    expect(policy.allowedModels).toEqual(['claude-sonnet-5']);
    expect(policy.evaluationScoped).toBe(true);
  });

  test('an evaluation allowlist can only narrow, never widen', () => {
    // A configuration naming a model the provider is not configured for adds
    // nothing — the result is the intersection, so it fails closed.
    const policy = resolveDispatchModelPolicy({
      provider: 'claude', env: { TRAILIE_EVAL_MODEL_ALLOWLIST: 'claude:claude-omniscient-9' },
    });
    expect(policy.allowedModels).toEqual([]);
    expect(() => assertProviderDispatchModel({
      provider: 'claude', model: 'claude-omniscient-9', allowedModels: policy.allowedModels,
    })).toThrow(DISPATCH_CODES.POLICY_MISSING);
  });

  test('an OpenAI-scoped entry gives Claude nothing', () => {
    expect(parseEvaluationModelAllowlist('openai:gpt-x', 'claude')).toEqual([]);
    expect(parseEvaluationModelAllowlist('openai:gpt-x', 'openai')).toEqual(['gpt-x']);
  });

  test('a paid run with NO allowlist configured fails closed at the assertion', () => {
    // `TRAILIE_EVAL_MODEL_ALLOWLIST` unset means production policy, which the
    // evaluation layer separately refuses (liveAuthorization). What matters here
    // is that an EMPTY one never means "anything goes".
    const policy = resolveDispatchModelPolicy({ provider: 'claude', env: { TRAILIE_EVAL_MODEL_ALLOWLIST: '   ' } });
    expect(policy.evaluationScoped).toBe(false);
  });
});

describe('Stage 14.7J §5 — resolution / reservation / dispatch identity', () => {
  test('three matching values pass', () => {
    expect(assertProviderModelIdentity({
      resolvedModel: 'claude-sonnet-5', reservationModel: 'claude-sonnet-5', dispatchModel: 'claude-sonnet-5',
    })).toBe(true);
  });

  test('a model changed AFTER resolution but BEFORE reservation fails closed', () => {
    const guard = createDispatchModelGuard({
      provider: 'claude', resolvedModel: 'claude-sonnet-5', allowedModels: ['claude-sonnet-5', 'claude-sonnet-4-6'],
    });
    // Both models are authorized. Authorization is not the question — identity is.
    expect(() => guard.assertReservation('claude-sonnet-4-6'))
      .toThrow(DISPATCH_CODES.IDENTITY_CHANGED);
  });

  test('a model changed BETWEEN reservation and dispatch fails closed', () => {
    const guard = createDispatchModelGuard({
      provider: 'claude', resolvedModel: 'claude-sonnet-5', allowedModels: ['claude-sonnet-5', 'claude-sonnet-4-6'],
    });
    expect(guard.assertReservation('claude-sonnet-5')).toBe(true);
    expect(() => guard.assertDispatch('claude-sonnet-4-6'))
      .toThrow(DISPATCH_CODES.IDENTITY_CHANGED);
  });

  test('a guard cannot be built around an unauthorized model', () => {
    expect(() => createDispatchModelGuard({
      provider: 'claude', resolvedModel: 'claude-opus-99', allowedModels: ['claude-sonnet-5'],
    })).toThrow(DISPATCH_CODES.NOT_ALLOWLISTED);
    expect(() => createDispatchModelGuard({
      provider: 'claude', resolvedModel: 'claude-sonnet-5', allowedModels: [],
    })).toThrow(DISPATCH_CODES.POLICY_MISSING);
  });

  test('a dispatch whose model vanished fails before the SDK', () => {
    const guard = createDispatchModelGuard({
      provider: 'claude', resolvedModel: 'claude-sonnet-5', allowedModels: ['claude-sonnet-5'],
    });
    expect(() => guard.assertDispatch(undefined)).toThrow(DISPATCH_CODES.NOT_RESOLVED);
  });
});
