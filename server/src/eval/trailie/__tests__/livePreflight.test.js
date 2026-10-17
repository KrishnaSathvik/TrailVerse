'use strict';

const {
  buildPreflightReport, percentiles, recommendFullMatrixEligibility,
  summarizeProviderSmoke, runProviderIsolatedSmoke,
} = require('../liveEvaluation');

const MATRIX = [
  { provider: 'claude', model: 'claude-sonnet-5' },
  { provider: 'openai', model: 'gpt-x' },
];
const CAP_ENV = [
  'TRAILIE_EVAL_LIVE_PROVIDERS', 'TRAILIE_EVAL_MAX_TOTAL_COST_USD', 'TRAILIE_EVAL_MAX_REQUESTS',
  'TRAILIE_EVAL_MAX_INPUT_TOKENS', 'TRAILIE_EVAL_MAX_OUTPUT_TOKENS', 'TRAILIE_EVAL_MODEL_ALLOWLIST',
];

describe('Stage 13.3 §1 — sanitized preflight', () => {
  const saved = {};
  beforeEach(() => { for (const k of CAP_ENV) { saved[k] = process.env[k]; delete process.env[k]; } });
  afterEach(() => { for (const k of CAP_ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

  it('reports ok:false and the missing settings when caps are absent (abort signal)', () => {
    const pf = buildPreflightReport({ providerMatrix: MATRIX, clients: null, phase: 'smoke' });
    expect(pf.ok).toBe(false);
    expect(pf.missing.length).toBeGreaterThan(0);
  });

  it('never surfaces credentials — only presence booleans', () => {
    const pf = buildPreflightReport({ providerMatrix: MATRIX, clients: { anthropic: { apiKey: 'sk-secret' }, openai: null }, phase: 'smoke' });
    const json = JSON.stringify(pf);
    expect(json).not.toMatch(/sk-secret/);
    expect(pf.clientsPresent).toEqual({ anthropic: true, openai: false });
  });

  it('projects a bounded worst-case request count and reports SDK + caps', () => {
    process.env.TRAILIE_EVAL_LIVE_PROVIDERS = 'true';
    process.env.TRAILIE_EVAL_MAX_TOTAL_COST_USD = '5';
    process.env.TRAILIE_EVAL_MAX_REQUESTS = '200';
    process.env.TRAILIE_EVAL_MAX_INPUT_TOKENS = '500000';
    process.env.TRAILIE_EVAL_MAX_OUTPUT_TOKENS = '200000';
    process.env.TRAILIE_EVAL_MODEL_ALLOWLIST = 'claude-sonnet-5,gpt-x';
    const pf = buildPreflightReport({ providerMatrix: MATRIX, clients: { anthropic: {}, openai: {} }, phase: 'smoke', smokeScenarioCount: 8, repetitions: 1 });
    expect(pf.ok).toBe(true);
    expect(pf.expectedMaxProviderRequests).toBe(8 * 2 * 1 * 4);
    expect(pf.caps).toEqual({ maxRequests: 200, maxInputTokens: 500000, maxOutputTokens: 200000, maxTotalCostUsd: 5 });
    expect(pf.sdkVersions).toHaveProperty('anthropic');
    expect(pf.sdkVersions).toHaveProperty('openai');
    // Unknown pricing → smoke-only, cost gate not passed.
    expect(pf.pricingMode).toBe('unknown_pricing_smoke_only');
    expect(pf.costRolloutGate).toBe('not_passed');
  });
});

describe('Stage 13.3 §2/§3 — provider-isolated smoke primitives', () => {
  it('percentiles are ordered and clamp on small samples', () => {
    const p = percentiles([10, 20, 30, 40]);
    expect(p.p50).toBeLessThanOrEqual(p.p90);
    expect(p.p90).toBeLessThanOrEqual(p.p95);
    expect(p.max).toBe(40);
    expect(percentiles([]).p50).toBeNull();
  });

  it('recommends the full matrix only with clean signals; unknown pricing stays internal-only', () => {
    const clean = { hardInvariantViolations: 0, pipelineFailures: 0, deterministicFallbackUnusable: 0, bindingCap: null, runCount: 8, costRolloutGate: 'passed_eligible' };
    expect(recommendFullMatrixEligibility(clean).eligibleForFullMatrix).toBe(true);
    expect(recommendFullMatrixEligibility(clean).costGateEligible).toBe(true);

    const unpriced = { ...clean, costRolloutGate: 'not_passed' };
    expect(recommendFullMatrixEligibility(unpriced).eligibleForFullMatrix).toBe(true);
    expect(recommendFullMatrixEligibility(unpriced).costGateEligible).toBe(false);
    expect(recommendFullMatrixEligibility(unpriced).recommendation).toMatch(/internal_only/);

    const violated = { ...clean, hardInvariantViolations: 1 };
    expect(recommendFullMatrixEligibility(violated).eligibleForFullMatrix).toBe(false);
    expect(recommendFullMatrixEligibility(violated).recommendation).toBe('blocked');
  });

  it('summarizeProviderSmoke reflects a hard-invariant violation as blocked', () => {
    const smoke = { status: 'executed', bindingCap: null, costRolloutGate: 'not_passed', totals: { costUsd: 'cost_unknown' }, results: [
      { evidenceClass: 'live_end_to_end', adapterFirstAttemptSuccess: true, pipelineSuccess: true, attemptCount: 1, consistencyStatus: 'passed', deterministicFallbackUsed: false, invariantViolations: 1, ttftMs: 100, latencyMs: 100, tokens: { totalInputTokens: 10, totalOutputTokens: 5 } },
    ] };
    const s = summarizeProviderSmoke('claude', 'claude-sonnet-5', smoke);
    expect(s.hardInvariantViolations).toBe(1);
    expect(s.eligibility.eligibleForFullMatrix).toBe(false);
  });

  it('runProviderIsolatedSmoke never autostarts the full matrix and returns per-provider not_executed without config', async () => {
    // No caps/clients → each provider isolated run is refused (never fabricated).
    const report = await runProviderIsolatedSmoke({ scenarios: [], providerMatrix: MATRIX, clients: null });
    expect(report.fullMatrixAutostart).toBe(false);
    expect(report.crossProviderFallbackAllowed).toBe(false);
    expect(report.perProvider).toHaveLength(2);
    expect(report.perProvider.every((p) => p.status === 'not_executed')).toBe(true);
  });
});
