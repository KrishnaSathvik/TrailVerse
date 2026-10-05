'use strict';

/**
 * Stage 14.7I §2/§3 — model resolution boundary (post WP12 Phase 4).
 * Orchestrator-depth tests were deleted with the legacy chat engine.
 */

const {
  resolveProviderModel, assertDispatchableModel, isDispatchableModel,
  allowedModelsFor, RESOLUTION_CODES, RESOLUTION_SOURCE,
} = require('../resolveProviderModel');
const { CLAUDE_PRIMARY_MODEL, CLAUDE_FALLBACK_MODELS } = require('../aiModels');

describe('Stage 14.7I §2 — resolution', () => {
  test('THE LIVE FAILURE: no model from the client resolves to the configured primary', () => {
    const r = resolveProviderModel({ requestedModel: undefined, provider: 'claude' });
    expect(r.ok).toBe(true);
    expect(r.model).toBe(CLAUDE_PRIMARY_MODEL);
    expect(r.model).toBe('claude-sonnet-5');
    expect(r.source).toBe(RESOLUTION_SOURCE.CONFIGURED);
  });

  test.each([null, undefined, '', '   '])('a %p model still resolves', (value) => {
    expect(resolveProviderModel({ requestedModel: value, provider: 'claude' }).model)
      .toBe(CLAUDE_PRIMARY_MODEL);
  });

  test('an explicit allowlisted model is honoured', () => {
    const r = resolveProviderModel({ requestedModel: 'claude-sonnet-5', provider: 'claude' });
    expect(r).toMatchObject({ ok: true, model: 'claude-sonnet-5', source: RESOLUTION_SOURCE.EXPLICIT });
  });

  test('an explicit NON-allowlisted model is refused, not silently replaced', () => {
    const r = resolveProviderModel({ requestedModel: 'gpt-4', provider: 'claude' });
    expect(r.ok).toBe(false);
    expect(r.model).toBeNull();
    expect(r.boundedCode).toBe(RESOLUTION_CODES.NOT_ALLOWLISTED);
  });

  test('a client cannot smuggle an arbitrary model through', () => {
    for (const bogus of ['claude-sonnet-5-evil', '../../etc/passwd', 'claude-opus-99', 'CLAUDE-SONNET-5']) {
      expect(resolveProviderModel({ requestedModel: bogus, provider: 'claude' }).ok).toBe(false);
    }
  });

  test('the allowlist is the configured Claude set', () => {
    expect(allowedModelsFor('claude')).toEqual(CLAUDE_FALLBACK_MODELS);
    expect(allowedModelsFor('claude')[0]).toBe(CLAUDE_PRIMARY_MODEL);
  });

  test('an unknown provider label falls back to the Claude allowlist', () => {
    expect(resolveProviderModel({ requestedModel: null, provider: 'auto' }).model).toBe(CLAUDE_PRIMARY_MODEL);
  });
});

describe('Stage 14.7I §3 — the pre-dispatch invariant', () => {
  test.each([undefined, null, '', '  '])('an unresolved model %p is refused', (model) => {
    expect(() => assertDispatchableModel({ model, provider: 'claude' }))
      .toThrow(RESOLUTION_CODES.NOT_RESOLVED);
  });

  test('a non-allowlisted model is refused when the allowlist is enforced', () => {
    expect(() => assertDispatchableModel({ model: 'gpt-4', provider: 'claude', enforceAllowlist: true }))
      .toThrow(RESOLUTION_CODES.NOT_ALLOWLISTED);
    expect(assertDispatchableModel({ model: 'synthetic-claude', provider: 'claude' })).toBe(true);
    expect(resolveProviderModel({ requestedModel: 'gpt-4', provider: 'claude' }).ok).toBe(false);
  });

  test('the thrown error is marked as blocking dispatch', () => {
    try {
      assertDispatchableModel({ model: null });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error.code).toBe(RESOLUTION_CODES.NOT_RESOLVED);
      expect(error.providerDispatchBlocked).toBe(true);
    }
  });

  test('a resolved allowlisted model passes', () => {
    expect(assertDispatchableModel({ model: CLAUDE_PRIMARY_MODEL, provider: 'claude' })).toBe(true);
    expect(isDispatchableModel({ model: CLAUDE_PRIMARY_MODEL })).toBe(true);
    expect(isDispatchableModel({ model: undefined })).toBe(false);
  });
});

describe('Stage 14.7I — prepareChatContext model resolution survives Phase 4', () => {
  const fs = require('fs');
  const path = require('path');
  const routeSrc = fs.readFileSync(path.resolve(__dirname, '../../routes/ai.js'), 'utf8');

  test('prepareChatContext resolves the model for every handler', () => {
    expect(routeSrc).toMatch(/const modelResolution = resolveProviderModel\(\{ requestedModel: model, provider \}\)/);
  });

  test('no stray per-call-site fallback expression remains', () => {
    const strays = routeSrc.split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter((l) => !l.line.startsWith('*') && !l.line.startsWith('//'))
      .filter((l) => /model \|\| CLAUDE_FALLBACK_MODELS\[0\]/.test(l.line));
    expect(strays.map((s) => s.n)).toEqual([]);
  });
});
