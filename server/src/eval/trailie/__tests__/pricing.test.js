'use strict';

const {
  getModelPricing, resolveVersionedPrice, estimateCostUsd, hasUnpricedCacheUsage, COST_UNKNOWN,
} = require('../pricing');
const { percentiles, estimateNextCallMaxCostUsd, runLiveSmoke } = require('../liveEvaluation');
const { EXECUTABLE_SCENARIOS } = require('../scenarios');

describe('Stage 13.3B §1/§5 — versioned, date-aware Claude pricing', () => {
  it('selects INTRODUCTORY pricing on 2026-07-29 ($2/$10 per M)', () => {
    const p = getModelPricing('claude-sonnet-5', { atDate: '2026-07-29' });
    expect(p).toMatchObject({ inputPerMTok: 2, outputPerMTok: 10, activePricePeriod: 'introductory', source: 'official_anthropic' });
    expect(p.priceConfigVersion).toBe('2026-07-29');
  });

  it('selects STANDARD pricing on 2026-09-01 ($3/$15 per M)', () => {
    const p = getModelPricing('claude-sonnet-5', { atDate: '2026-09-01' });
    expect(p).toMatchObject({ inputPerMTok: 3, outputPerMTok: 15, activePricePeriod: 'standard' });
  });

  it('handles period boundaries inclusively and refuses dates before the schedule', () => {
    expect(resolveVersionedPrice('claude-sonnet-5', '2026-06-30').activePricePeriod).toBe('introductory'); // validFrom inclusive
    expect(resolveVersionedPrice('claude-sonnet-5', '2026-08-31').activePricePeriod).toBe('introductory'); // validThrough inclusive
    expect(resolveVersionedPrice('claude-sonnet-5', '2026-09-01').activePricePeriod).toBe('standard');
    // Before the schedule → null (never silently fall back to introductory).
    expect(resolveVersionedPrice('claude-sonnet-5', '2026-06-29')).toBeNull();
  });

  it('does NOT silently keep introductory pricing after it lapses', () => {
    const p = getModelPricing('claude-sonnet-5', { atDate: '2027-01-15' });
    expect(p.activePricePeriod).toBe('standard'); // standard has no validThrough
    expect(p.inputPerMTok).toBe(3);
  });

  it('unknown model → null → cost_unknown (cost gate cannot pass)', () => {
    expect(getModelPricing('some-unlisted-model', { atDate: '2026-07-29' })).toBeNull();
    expect(estimateCostUsd({ model: 'some-unlisted-model', inputTokens: 1000, outputTokens: 1000, atDate: '2026-07-29' })).toBe(COST_UNKNOWN);
  });

  it('computes input/output cost correctly at introductory rates', () => {
    // 1,000,000 input @ $2 + 500,000 output @ $10 = $2 + $5 = $7
    const cost = estimateCostUsd({ model: 'claude-sonnet-5', inputTokens: 1_000_000, outputTokens: 500_000, atDate: '2026-07-29' });
    expect(cost).toBeCloseTo(7, 6);
  });

  it('aggregates Phase A + Phase B + retry token cost consistently', () => {
    const at = '2026-07-29';
    const phaseA = estimateCostUsd({ model: 'claude-sonnet-5', inputTokens: 200_000, outputTokens: 50_000, atDate: at });
    const phaseB = estimateCostUsd({ model: 'claude-sonnet-5', inputTokens: 100_000, outputTokens: 40_000, atDate: at });
    const retry = estimateCostUsd({ model: 'claude-sonnet-5', inputTokens: 100_000, outputTokens: 40_000, atDate: at });
    const combined = estimateCostUsd({ model: 'claude-sonnet-5', inputTokens: 400_000, outputTokens: 130_000, atDate: at });
    expect(phaseA + phaseB + retry).toBeCloseTo(combined, 6);
  });

  it('§3 — unpriced cache usage fails the cost estimate conservatively (never free)', () => {
    expect(hasUnpricedCacheUsage({ cache_creation_input_tokens: 500 })).toBe(true);
    expect(hasUnpricedCacheUsage({ cacheReadInputTokens: 10 })).toBe(true);
    expect(hasUnpricedCacheUsage({ input_tokens: 100 })).toBe(false);
    const cost = estimateCostUsd({ model: 'claude-sonnet-5', inputTokens: 1000, outputTokens: 1000, usage: { cache_read_input_tokens: 5 }, atDate: '2026-07-29' });
    expect(cost).toBe(COST_UNKNOWN);
  });
});

describe('Stage 13.3B §2 — cost-cap reservation', () => {
  it('estimateNextCallMaxCostUsd is a positive number for a priced model, cost_unknown otherwise', () => {
    expect(estimateNextCallMaxCostUsd({ model: 'claude-sonnet-5', atDate: '2026-07-29' })).toBeGreaterThan(0);
    expect(estimateNextCallMaxCostUsd({ model: 'unlisted', atDate: '2026-07-29' })).toBe(COST_UNKNOWN);
  });

  it('blocks the NEXT request before it could exceed the USD cap (zero provider calls)', async () => {
    const throwIfCalled = { messages: { create: async () => { throw new Error('provider must not be called when cost cap would be exceeded'); } } };
    const saved = { ...process.env };
    Object.assign(process.env, {
      TRAILIE_EVAL_LIVE_PROVIDERS: 'true',
      TRAILIE_EVAL_MAX_TOTAL_COST_USD: '0.0000001', // absurdly small → reservation exceeds immediately
      TRAILIE_EVAL_MAX_REQUESTS: '80',
      TRAILIE_EVAL_MAX_INPUT_TOKENS: '400000',
      TRAILIE_EVAL_MAX_OUTPUT_TOKENS: '150000',
      TRAILIE_EVAL_MODEL_ALLOWLIST: 'claude:claude-sonnet-5',
    });
    try {
      const report = await runLiveSmoke({
        scenarios: EXECUTABLE_SCENARIOS,
        providerMatrix: [{ provider: 'claude', model: 'claude-sonnet-5' }],
        clients: { anthropic: throwIfCalled },
      });
      expect(report.status).toBe('aborted_max_total_cost_usd_reservation');
      expect(report.runCount).toBe(0); // stopped BEFORE any provider request
      expect(report.costCapEnforceable).toBe(true);
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  });
});

describe('Stage 13.3B §4 — not_applicable TTFT excluded from percentiles', () => {
  it('percentiles ignore non-numeric values', () => {
    const p = percentiles(['not_applicable', 10, 20, 30]);
    expect(p.n).toBe(3);
    expect(p.max).toBe(30);
  });
});
