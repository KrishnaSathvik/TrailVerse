'use strict';

/**
 * A real client sends `provider: 'auto'` and no `model`. Model resolution used
 * to run BEFORE auto-routing, so 'auto' fell down the Claude branch and the
 * prepared context carried `provider=openai` paired with `model=claude-sonnet-5`.
 *
 * Nothing dispatched that pair — v2 re-resolves through its own router and the
 * legacy call sites are guarded by `provider === 'claude'` — but a contradictory
 * pair must not exist to be read. This pins the ordering.
 */

const { prepareChatContext } = require('../ai');
const { resolveProviderModel } = require('../../config/resolveProviderModel');

const ENTRY_CONTEXT = {
  source: 'direct',
  requestedDestinations: [{ parkCode: 'yose', name: 'Yosemite National Park' }],
  formData: { parkCode: 'yose', startDate: '2026-09-14', endDate: '2026-09-16', groupSize: 2 },
};

const request = (overrides = {}) => ({
  messages: [{ role: 'user', content: 'Plan a 3-day Yosemite trip for two adults.' }],
  provider: 'auto',
  metadata: { entryContext: ENTRY_CONTEXT },
  ...overrides,
});

describe('provider/model pairing cannot be contradictory', () => {
  test.each([
    ['authenticated', false],
    ['guest', true],
  ])('a real %s request resolves a model that belongs to its routed provider', async (_label, isAnonymous) => {
    const ctx = await prepareChatContext(request(), '[test]', { isAnonymous });
    const allowed = resolveProviderModel({ requestedModel: undefined, provider: ctx.provider });

    expect(allowed.ok).toBe(true);
    expect(ctx.model).toBe(allowed.model);
    expect(allowed.allowed).toContain(ctx.model);
  });

  test('an openai route never carries a claude model', async () => {
    const ctx = await prepareChatContext(request(), '[test]', { isAnonymous: true });
    if (ctx.provider === 'openai') expect(ctx.model).not.toMatch(/^claude/);
    if (ctx.provider === 'claude') expect(ctx.model).toMatch(/^claude/);
  });

  test('an explicit provider is still honoured and paired correctly', async () => {
    const ctx = await prepareChatContext(request({ provider: 'claude' }), '[test]', { isAnonymous: true });
    expect(ctx.provider).toBe('claude');
    expect(ctx.model).toBe(
      resolveProviderModel({ requestedModel: undefined, provider: 'claude' }).model
    );
  });
});
