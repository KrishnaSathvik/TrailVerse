const {
  getProseRecoveryConfig,
  assertLeaseOutlivesRuntime,
  DEFAULT_LEASE_MS,
  DEFAULT_MAX_RUNTIME_MS,
  DEFAULT_SAFETY_MARGIN_MS,
} = require('../proseRecoveryConfig');

const ENV_KEYS = [
  'TRAILIE_PROSE_RECOVERY',
  'PROSE_RECOVERY_LEASE_MS',
  'PROSE_RECOVERY_MAX_RUNTIME_MS',
  'PROSE_RECOVERY_SAFETY_MARGIN_MS',
];

describe('Stage 14.4 §18 — flag', () => {
  let saved;
  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    ENV_KEYS.forEach((k) => delete process.env[k]);
  });
  afterEach(() => {
    ENV_KEYS.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });

  test('recovery is DISABLED by default', () => {
    expect(getProseRecoveryConfig().enabled).toBe(false);
  });

  test.each([['true', true], ['TRUE', true], ['True', true], ['false', false], ['1', false], ['yes', false], ['', false]])(
    'TRAILIE_PROSE_RECOVERY=%s → %s',
    (value, expected) => {
      process.env.TRAILIE_PROSE_RECOVERY = value;
      expect(getProseRecoveryConfig().enabled).toBe(expected);
    }
  );

  test('defaults satisfy the lease invariant', () => {
    const cfg = getProseRecoveryConfig();
    expect(cfg.leaseMs).toBe(DEFAULT_LEASE_MS);
    expect(cfg.maxRuntimeMs).toBe(DEFAULT_MAX_RUNTIME_MS);
    expect(cfg.leaseMs).toBeGreaterThan(cfg.maxRuntimeMs + cfg.safetyMarginMs);
  });

  test('the retry hint is bounded and derived from runtime, not the lease', () => {
    const cfg = getProseRecoveryConfig();
    expect(cfg.retryAfterSeconds).toBe(Math.ceil(DEFAULT_MAX_RUNTIME_MS / 1000));
  });
});

describe('Stage 14.4 §9 — lease must outlive the hard runtime', () => {
  test('accepts a lease strictly longer than runtime + margin', () => {
    expect(() =>
      assertLeaseOutlivesRuntime({ leaseMs: 200_000, maxRuntimeMs: 120_000, safetyMarginMs: 30_000 })
    ).not.toThrow();
  });

  test.each([
    ['equal to runtime + margin', { leaseMs: 150_000, maxRuntimeMs: 120_000, safetyMarginMs: 30_000 }],
    ['shorter than runtime', { leaseMs: 60_000, maxRuntimeMs: 120_000, safetyMarginMs: 30_000 }],
    ['shorter than the margin alone', { leaseMs: 10_000, maxRuntimeMs: 1_000, safetyMarginMs: 30_000 }],
  ])('throws at load when the lease is %s', (_label, args) => {
    expect(() => assertLeaseOutlivesRuntime(args)).toThrow(/must exceed/);
  });

  test('an inverted env configuration fails loudly rather than silently', () => {
    const saved = { ...process.env };
    process.env.PROSE_RECOVERY_LEASE_MS = '10000';
    process.env.PROSE_RECOVERY_MAX_RUNTIME_MS = '120000';
    try {
      expect(() => getProseRecoveryConfig()).toThrow(/PROSE_RECOVERY_LEASE_MS/);
    } finally {
      process.env = saved;
    }
  });

  test('the error names both budgets so the fix is obvious', () => {
    expect(() =>
      assertLeaseOutlivesRuntime({ leaseMs: 1, maxRuntimeMs: 2, safetyMarginMs: 3 })
    ).toThrow(/PROSE_RECOVERY_LEASE_MS \(1\).*PROSE_RECOVERY_MAX_RUNTIME_MS \(2\).*safety margin \(3\)/);
  });

  test('a lease can never expire while its own valid request may still run', () => {
    const cfg = getProseRecoveryConfig();
    // The route aborts at maxRuntimeMs; the fence lives strictly longer.
    expect(cfg.maxRuntimeMs).toBeLessThan(cfg.leaseMs);
    expect(cfg.maxRuntimeMs + DEFAULT_SAFETY_MARGIN_MS).toBeLessThan(cfg.leaseMs);
  });
});
