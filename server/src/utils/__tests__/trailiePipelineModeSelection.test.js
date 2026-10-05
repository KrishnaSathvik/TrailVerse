'use strict';

const {
  stableFraction,
  selectTrailiePipelineMode,
  GENERATION_MODE,
  CONSISTENCY_MODE,
} = require('../trailiePipelineModeSelection');

describe('stableFraction', () => {
  it('is deterministic for the same key', () => {
    expect(stableFraction('trip-abc')).toBe(stableFraction('trip-abc'));
  });

  it('returns a value in [0, 1)', () => {
    for (const k of ['a', 'trip-1', 'session-xyz', '', '42']) {
      const f = stableFraction(k);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('spreads keys across the unit interval (not all clustered)', () => {
    const fracs = Array.from({ length: 200 }, (_, i) => stableFraction(`trip-${i}`));
    const below = fracs.filter((f) => f < 0.5).length;
    // Rough uniformity sanity check — not all on one side.
    expect(below).toBeGreaterThan(60);
    expect(below).toBeLessThan(140);
  });
});

describe('selectTrailiePipelineMode', () => {
  it('ineligible turns always run legacy/off', () => {
    const r = selectTrailiePipelineMode({ rolloutKey: 't1', eligible: false, toolFirstRate: 1, enforceRate: 1 });
    expect(r.generationMode).toBe(GENERATION_MODE.LEGACY);
    expect(r.consistencyMode).toBe(CONSISTENCY_MODE.OFF);
    expect(r.reason).toBe('ineligible');
  });

  it('rate 0 keeps everyone on legacy', () => {
    for (let i = 0; i < 50; i += 1) {
      const r = selectTrailiePipelineMode({ rolloutKey: `t-${i}`, eligible: true, toolFirstRate: 0, enforceRate: 0 });
      expect(r.generationMode).toBe(GENERATION_MODE.LEGACY);
    }
  });

  it('rate 1 puts every eligible turn in tool-first', () => {
    for (let i = 0; i < 50; i += 1) {
      const r = selectTrailiePipelineMode({ rolloutKey: `t-${i}`, eligible: true, toolFirstRate: 1, enforceRate: 0 });
      expect(r.generationMode).toBe(GENERATION_MODE.TOOL_FIRST);
      expect(r.consistencyMode).toBe(CONSISTENCY_MODE.OFF);
    }
  });

  it('is stable for the same key + rates', () => {
    const a = selectTrailiePipelineMode({ rolloutKey: 'trip-77', eligible: true, toolFirstRate: 0.5, enforceRate: 0.1 });
    const b = selectTrailiePipelineMode({ rolloutKey: 'trip-77', eligible: true, toolFirstRate: 0.5, enforceRate: 0.1 });
    expect(a).toEqual(b);
  });

  it('enforce cohort is a strict subset of tool-first', () => {
    const keys = Array.from({ length: 2000 }, (_, i) => `trip-${i}`);
    let toolFirst = 0;
    let enforce = 0;
    for (const k of keys) {
      const r = selectTrailiePipelineMode({ rolloutKey: k, eligible: true, toolFirstRate: 0.5, enforceRate: 0.2 });
      if (r.consistencyMode === CONSISTENCY_MODE.ENFORCE) {
        enforce += 1;
        // Every enforce assignment MUST also be tool-first.
        expect(r.generationMode).toBe(GENERATION_MODE.TOOL_FIRST);
      }
      if (r.generationMode === GENERATION_MODE.TOOL_FIRST) toolFirst += 1;
    }
    expect(enforce).toBeGreaterThan(0);
    expect(enforce).toBeLessThan(toolFirst);
    // Roughly the configured fractions on a large sample.
    expect(toolFirst / keys.length).toBeGreaterThan(0.4);
    expect(toolFirst / keys.length).toBeLessThan(0.6);
    expect(enforce / keys.length).toBeGreaterThan(0.12);
    expect(enforce / keys.length).toBeLessThan(0.28);
  });

  it('never produces enforce above the tool-first rate (subset guaranteed under misconfig)', () => {
    const keys = Array.from({ length: 1000 }, (_, i) => `k-${i}`);
    for (const k of keys) {
      const r = selectTrailiePipelineMode({ rolloutKey: k, eligible: true, toolFirstRate: 0.1, enforceRate: 0.9 });
      if (r.consistencyMode === CONSISTENCY_MODE.ENFORCE) {
        expect(r.generationMode).toBe(GENERATION_MODE.TOOL_FIRST);
      }
    }
  });

  it('invalid rates resolve to zero', () => {
    const r = selectTrailiePipelineMode({ rolloutKey: 't', eligible: true, toolFirstRate: NaN, enforceRate: -1 });
    expect(r.generationMode).toBe(GENERATION_MODE.LEGACY);
  });

  it('explicit override forces tool-first + given consistency', () => {
    const r = selectTrailiePipelineMode({
      rolloutKey: 't', eligible: true, toolFirstRate: 0, enforceRate: 0,
      override: { generationMode: 'tool_first', consistencyMode: 'enforce' },
    });
    expect(r.generationMode).toBe(GENERATION_MODE.TOOL_FIRST);
    expect(r.consistencyMode).toBe(CONSISTENCY_MODE.ENFORCE);
    expect(r.reason).toBe('override');
  });

  it('override to legacy strips consistency (enforce cannot exist without tool_first)', () => {
    const r = selectTrailiePipelineMode({
      rolloutKey: 't', eligible: true, toolFirstRate: 1, enforceRate: 1,
      override: { generationMode: 'legacy', consistencyMode: 'enforce' },
    });
    expect(r.generationMode).toBe(GENERATION_MODE.LEGACY);
    expect(r.consistencyMode).toBe(CONSISTENCY_MODE.OFF);
  });
});
