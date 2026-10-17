'use strict';

const {
  getTrailieRolloutRates,
  getTrailieRolloutBudgets,
} = require('../trailieRolloutConfig');

const RATE_KEYS = [
  'TRAILIE_ROLLOUT_KILL_SWITCH',
  'TRAILIE_ROLLOUT_TOOL_FIRST_RATE',
  'TRAILIE_ROLLOUT_ENFORCE_RATE',
  'TRAILIE_ITINERARY_GENERATION_MODE',
];
const BUDGET_KEYS = [
  'TRAILIE_ROLLOUT_MAX_P95_TOTAL_MS',
  'TRAILIE_ROLLOUT_MAX_P95_TTFT_MS',
  'TRAILIE_ROLLOUT_MAX_AVG_COST_USD',
  'TRAILIE_ROLLOUT_MAX_FALLBACK_RATE',
  'TRAILIE_ROLLOUT_MAX_FALSE_NEGATIVE_RATE',
];

const saved = {};
beforeEach(() => {
  for (const k of [...RATE_KEYS, ...BUDGET_KEYS]) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of [...RATE_KEYS, ...BUDGET_KEYS]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('getTrailieRolloutRates', () => {
  it('defaults to zero and killed when tool-first generation is not enabled', () => {
    const r = getTrailieRolloutRates();
    expect(r.killed).toBe(true);
    expect(r.toolFirstRate).toBe(0);
    expect(r.enforceRate).toBe(0);
  });

  it('reads configured rates when tool-first generation is on', () => {
    process.env.TRAILIE_ITINERARY_GENERATION_MODE = 'tool_first';
    process.env.TRAILIE_ROLLOUT_TOOL_FIRST_RATE = '0.25';
    process.env.TRAILIE_ROLLOUT_ENFORCE_RATE = '0.1';
    const r = getTrailieRolloutRates();
    expect(r.killed).toBe(false);
    expect(r.toolFirstRate).toBe(0.25);
    expect(r.enforceRate).toBe(0.1);
  });

  it('kill switch forces both rates to zero', () => {
    process.env.TRAILIE_ITINERARY_GENERATION_MODE = 'tool_first';
    process.env.TRAILIE_ROLLOUT_TOOL_FIRST_RATE = '1';
    process.env.TRAILIE_ROLLOUT_ENFORCE_RATE = '1';
    process.env.TRAILIE_ROLLOUT_KILL_SWITCH = 'true';
    const r = getTrailieRolloutRates();
    expect(r.killed).toBe(true);
    expect(r.toolFirstRate).toBe(0);
    expect(r.enforceRate).toBe(0);
  });

  it('clamps the effective enforce rate to the tool-first rate', () => {
    process.env.TRAILIE_ITINERARY_GENERATION_MODE = 'tool_first';
    process.env.TRAILIE_ROLLOUT_TOOL_FIRST_RATE = '0.1';
    process.env.TRAILIE_ROLLOUT_ENFORCE_RATE = '0.9';
    const r = getTrailieRolloutRates();
    expect(r.enforceRate).toBe(0.1);
    expect(r.rawEnforceRate).toBe(0.9);
  });

  it('clamps out-of-range and rejects invalid rates', () => {
    process.env.TRAILIE_ITINERARY_GENERATION_MODE = 'tool_first';
    process.env.TRAILIE_ROLLOUT_TOOL_FIRST_RATE = '5';
    process.env.TRAILIE_ROLLOUT_ENFORCE_RATE = 'abc';
    const r = getTrailieRolloutRates();
    expect(r.toolFirstRate).toBe(1);
    expect(r.enforceRate).toBe(0);
  });
});

describe('getTrailieRolloutBudgets', () => {
  it('returns null for every unset budget', () => {
    expect(getTrailieRolloutBudgets()).toEqual({
      maxP95TotalMs: null,
      maxP95TtftMs: null,
      maxAvgCostUsd: null,
      maxFallbackRate: null,
      maxFalseNegativeRate: null,
    });
  });

  it('reads configured budgets', () => {
    process.env.TRAILIE_ROLLOUT_MAX_P95_TOTAL_MS = '25000';
    process.env.TRAILIE_ROLLOUT_MAX_P95_TTFT_MS = '4000';
    process.env.TRAILIE_ROLLOUT_MAX_AVG_COST_USD = '0.05';
    process.env.TRAILIE_ROLLOUT_MAX_FALLBACK_RATE = '0.02';
    process.env.TRAILIE_ROLLOUT_MAX_FALSE_NEGATIVE_RATE = '0.03';
    expect(getTrailieRolloutBudgets()).toEqual({
      maxP95TotalMs: 25000,
      maxP95TtftMs: 4000,
      maxAvgCostUsd: 0.05,
      maxFallbackRate: 0.02,
      maxFalseNegativeRate: 0.03,
    });
  });

  it('rejects invalid budget values as null (unmet)', () => {
    process.env.TRAILIE_ROLLOUT_MAX_P95_TOTAL_MS = 'soon';
    process.env.TRAILIE_ROLLOUT_MAX_AVG_COST_USD = '-1';
    const b = getTrailieRolloutBudgets();
    expect(b.maxP95TotalMs).toBeNull();
    expect(b.maxAvgCostUsd).toBeNull();
  });
});
