'use strict';

/**
 * Stage 14.8H — deterministic tests for the acceptance constructor counter.
 *
 * These exist because the previous inline version counted correctly and BROKE
 * the instance, which is the worst possible combination: the ledger looked
 * healthy while the SDK client had silently lost its prototype, and the failure
 * only surfaced on the first call that needed a prototype method.
 *
 * The wrapper is exercised DIRECTLY rather than through `require.cache`. A first
 * version of this suite went through the cache and passed against the defective
 * implementation, because Jest keeps its own module registry and never saw the
 * patched exports — a test that cannot fail is worse than no test.
 *
 * The fixture reproduces the shape that actually caused the failure: a CJS entry
 * that is itself a callable wrapper carrying its own `.prototype`, with the real
 * class on `.default`.
 */

const { wrapCountingModule } = require('../providerConstructorCounter');
const fixtureModule = require('./fixtures/callableWrapperSdk');
const notConstructable = require('./fixtures/notConstructable');

describe('wrapCountingModule', () => {
  let counts;
  let Sdk;

  beforeEach(() => {
    counts = { sdk: 0 };
    Sdk = wrapCountingModule(fixtureModule, 'sdk', counts);
    expect(Sdk).not.toBeNull();
  });

  it('counts construction through the module export', () => {
    new Sdk({ apiKey: 'test' });
    expect(counts.sdk).toBe(1);
  });

  it('counts construction through .default', () => {
    new Sdk.default({ apiKey: 'test' });
    expect(counts.sdk).toBe(1);
  });

  it('preserves the real prototype through the module export', () => {
    const client = new Sdk({ apiKey: 'test' });

    // The regression: both of these were `undefined`.
    expect(typeof client.post).toBe('function');
    expect(typeof client.calculateNonstreamingTimeout).toBe('function');
    expect(client.constructor.name).toBe('RealClient');
    expect(Object.getPrototypeOf(client)).not.toBe(Object.prototype);
  });

  it('preserves the real prototype through .default', () => {
    const client = new Sdk.default({ apiKey: 'test' });

    expect(typeof client.post).toBe('function');
    expect(typeof client.calculateNonstreamingTimeout).toBe('function');
    expect(client.constructor.name).toBe('RealClient');
  });

  it('keeps constructor-set own properties intact', () => {
    const client = new Sdk({ apiKey: 'test-key' });

    expect(client.apiKey).toBe('test-key');
    expect(typeof client.messages.create).toBe('function');
  });

  it('lets a resource method reach back into a client prototype method', () => {
    const client = new Sdk({ apiKey: 'test' });

    // Mirrors the real failure path — a resource calling a CLIENT prototype
    // method. This threw "calculateNonstreamingTimeout is not a function".
    expect(client.messages.create({ max_tokens: 1024 })).toEqual({
      dispatched: true,
      timeout: 10240,
    });
  });

  it('passes non-constructor exports through untouched', () => {
    expect(Sdk.APIError).toBeDefined();
    expect(Sdk.VERSION).toBe('0.0.0-fixture');
  });

  it('counts every construction, not just the first', () => {
    new Sdk({ apiKey: 'a' });
    new Sdk.default({ apiKey: 'b' });
    new Sdk({ apiKey: 'c' });
    expect(counts.sdk).toBe(3);
  });

  it('declines a module with no constructable export', () => {
    expect(wrapCountingModule(notConstructable, 'sdk', counts)).toBeNull();
  });

  it('counts and preserves the prototype on the REAL provider SDK', () => {
    // The fixture models the shape; this asserts it against the actual
    // dependency, which is what the acceptance runs load.
    const realCounts = { claude: 0 };
    const RealSdk = wrapCountingModule(require('@anthropic-ai/sdk'), 'claude', realCounts);

    const viaModule = new RealSdk({ apiKey: 'deterministic-test-only' });
    const viaDefault = new RealSdk.default({ apiKey: 'deterministic-test-only' });

    expect(realCounts.claude).toBe(2);
    for (const client of [viaModule, viaDefault]) {
      expect(typeof client.post).toBe('function');
      expect(typeof client.calculateNonstreamingTimeout).toBe('function');
      expect(client.constructor.name).toBe('Anthropic');
    }
  });
});
