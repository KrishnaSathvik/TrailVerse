'use strict';

const { getItineraryGenerationConfig, selectStructuredMaxTokens } = require('../itineraryGenerationConfig');

describe('Stage 13.5 §7 — structured-output token budget', () => {
  const config = getItineraryGenerationConfig();

  it('short plans get the short budget with headroom over the observed 3-day usage (3,212)', () => {
    const t = selectStructuredMaxTokens({ expectedDays: 3, config });
    expect(t).toBe(config.structuredMaxTokensShort);
    expect(t).toBeGreaterThan(3212);
    expect(t).toBeGreaterThan(4000); // more headroom than the old ceiling
  });

  it('long plans (>= threshold) get the larger bounded budget', () => {
    expect(selectStructuredMaxTokens({ expectedDays: 7, config })).toBe(config.structuredMaxTokensLong);
  });

  it('unknown length defaults to the short budget', () => {
    expect(selectStructuredMaxTokens({ expectedDays: null, config })).toBe(config.structuredMaxTokensShort);
  });

  it('a truncation retry may use the long budget even for a short plan', () => {
    expect(selectStructuredMaxTokens({ expectedDays: 3, truncatedRetry: true, config })).toBe(config.structuredMaxTokensLong);
  });

  it('never exceeds the hard cap', () => {
    const capped = { ...config, structuredMaxTokensLong: 999999 };
    expect(selectStructuredMaxTokens({ expectedDays: 7, config: capped })).toBe(config.structuredMaxTokensHardCap);
  });
});
