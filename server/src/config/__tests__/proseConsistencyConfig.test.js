'use strict';

const {
  PROSE_CONSISTENCY_MODE,
  resolveProseConsistencyMode,
  getProseConsistencyConfig,
} = require('../proseConsistencyConfig');

describe('proseConsistencyConfig', () => {
  const saved = process.env.TRAILIE_PROSE_CONSISTENCY_MODE;
  afterEach(() => {
    if (saved === undefined) delete process.env.TRAILIE_PROSE_CONSISTENCY_MODE;
    else process.env.TRAILIE_PROSE_CONSISTENCY_MODE = saved;
  });

  it('fails safe to off for missing/invalid', () => {
    delete process.env.TRAILIE_PROSE_CONSISTENCY_MODE;
    expect(getProseConsistencyConfig().mode).toBe(PROSE_CONSISTENCY_MODE.OFF);
    expect(resolveProseConsistencyMode('nonsense')).toBe(PROSE_CONSISTENCY_MODE.OFF);
    expect(resolveProseConsistencyMode('')).toBe(PROSE_CONSISTENCY_MODE.OFF);
  });

  it('honors verify and enforce', () => {
    process.env.TRAILIE_PROSE_CONSISTENCY_MODE = 'verify';
    expect(getProseConsistencyConfig().isVerify).toBe(true);
    process.env.TRAILIE_PROSE_CONSISTENCY_MODE = 'enforce';
    const c = getProseConsistencyConfig();
    expect(c.isEnforce).toBe(true);
    expect(c.retryEnabled).toBe(true);
    expect(c.maxChars).toBeGreaterThan(0);
  });
});
