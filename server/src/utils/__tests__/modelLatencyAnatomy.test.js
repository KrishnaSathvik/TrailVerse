'use strict';

/**
 * MODEL LATENCY ANATOMY.
 *
 * The corrected THRO turn is now 28.3s: ~24.1s model, ~4.2s evidence,
 * ~19ms deterministic. So the question is no longer retries — it is why ONE
 * successful architect inference takes 24 seconds. Two shapes lead to opposite
 * optimizations and the current data cannot tell them apart:
 *
 *   24s = 20s waiting for the first token + 4s producing
 *   24s =  5s waiting            + 19s producing a large structured plan
 *
 * Nothing here optimizes anything. It measures.
 */

const { createTurnTimeline } = require('../turnTimeline');
const { summarizeModelDispatch, summarizePromptPayload } = require('../modelLatencyAnatomy');

describe('the model window splits at the first token', () => {
  test('a slow start and a fast body are distinguishable from the reverse', () => {
    const slowStart = summarizeModelDispatch({
      dispatchStartedAtMs: 0, firstEventAtMs: 20000, completedAtMs: 24000,
    });
    expect(slowStart).toMatchObject({
      timeToFirstEventMs: 20000,
      generationAfterFirstEventMs: 4000,
      totalModelMs: 24000,
      shape: 'front_loaded',
    });

    const slowBody = summarizeModelDispatch({
      dispatchStartedAtMs: 0, firstEventAtMs: 5000, completedAtMs: 24000,
    });
    expect(slowBody).toMatchObject({
      timeToFirstEventMs: 5000,
      generationAfterFirstEventMs: 19000,
      shape: 'output_bound',
    });
  });

  test('a non-streaming dispatch reports unknown rather than guessing', () => {
    const summary = summarizeModelDispatch({
      dispatchStartedAtMs: 0, firstEventAtMs: null, completedAtMs: 24000,
    });
    expect(summary.timeToFirstEventMs).toBeNull();
    expect(summary.generationAfterFirstEventMs).toBeNull();
    expect(summary.totalModelMs).toBe(24000);
    expect(summary.shape).toBe('unmeasured');
  });

  test('output rate is reported only when both halves are known', () => {
    const summary = summarizeModelDispatch({
      dispatchStartedAtMs: 0, firstEventAtMs: 4000, completedAtMs: 24000, outputTokens: 1540,
    });
    expect(summary.outputTokensPerSecond).toBeCloseTo(77, 0);
    expect(summarizeModelDispatch({
      dispatchStartedAtMs: 0, firstEventAtMs: null, completedAtMs: 24000, outputTokens: 1540,
    }).outputTokensPerSecond).toBeNull();
  });
});

describe('the prompt payload census', () => {
  /** Exactly the accounting `buildTrailiePromptV2` already computes per turn. */
  const accounting = {
    tokenizerId: 'test-tokenizer',
    coreSourceTokens: 900, coreSectionTokens: 950, coreWrapperTokens: 50, coreTokens: 950,
    contractTokens: 800, evidenceTokens: 2400, tripStateTokens: 600,
    historyTokens: 300, userTokens: 60, totalTokens: 5110,
  };

  test('every section is reported with its share of the input', () => {
    const census = summarizePromptPayload({ accounting, toolSchemaTokens: 700 });
    const bySection = Object.fromEntries(census.sections.map((s) => [s.section, s]));
    expect(bySection.evidence.tokens).toBe(2400);
    expect(bySection.evidence.share).toBeCloseTo(2400 / 5810, 3);
    expect(bySection.tool_schema.tokens).toBe(700);
    expect(census.totalTokens).toBe(5810);
  });

  test('sections are ordered largest first, so the census names its own suspect', () => {
    const census = summarizePromptPayload({ accounting, toolSchemaTokens: 700 });
    expect(census.sections[0].section).toBe('evidence');
    const shares = census.sections.map((s) => s.tokens);
    expect([...shares].sort((a, b) => b - a)).toEqual(shares);
  });

  test('a missing tool schema measurement is null, not zero', () => {
    const census = summarizePromptPayload({ accounting });
    const tool = census.sections.find((s) => s.section === 'tool_schema');
    expect(tool.tokens).toBeNull();
    // ...and it must not silently vanish from the total.
    expect(census.totalTokens).toBe(5110);
    expect(census.unmeasuredSections).toContain('tool_schema');
  });

  test('no accounting yields an explicitly unmeasured census', () => {
    const census = summarizePromptPayload({ accounting: null });
    expect(census.sections).toEqual([]);
    expect(census.totalTokens).toBeNull();
  });
});

describe('evidence splits into lookup and acquisition', () => {
  test('sequential cache reads and provider work are separable', () => {
    let now = 0;
    const timeline = createTurnTimeline({ now: () => now });
    const lookup = timeline.begin('evidence_cache_lookup');
    now += 3900;
    lookup();
    const refresh = timeline.begin('evidence_provider_refresh');
    now += 750;
    refresh();

    const byStage = Object.fromEntries(
      timeline.snapshot().stages.map((s) => [s.stage, s.totalMs])
    );
    expect(byStage.evidence_cache_lookup).toBe(3900);
    expect(byStage.evidence_provider_refresh).toBe(750);
  });

  test('parallel family fetches show wall clock below accumulated work', () => {
    let now = 0;
    const timeline = createTurnTimeline({ now: () => now });
    const ends = [];
    for (let i = 0; i < 14; i += 1) ends.push(timeline.begin('evidence_cache_lookup'));
    now += 300;
    for (const end of ends) end();

    const snap = timeline.snapshot({ totalMs: 300 });
    expect(snap.criticalPathMs).toBe(300);
    expect(snap.accumulatedWorkMs).toBe(4200);
    // 14 reads costing 300ms of wall clock is parallel; 4,200ms would be serial.
  });
});
