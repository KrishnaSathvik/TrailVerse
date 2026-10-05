'use strict';

/**
 * §A — BOUNDED PER-SPAN INTERVALS.
 *
 * `snapshot()` aggregated every span to `{stage, totalMs, calls}` and threw the
 * intervals away, so the 2026-08-26 evidence audit could not answer its own
 * central question: which branch is the longest, and do the waves overlap?
 *
 * The intervals already existed in memory. This exposes them as a bounded
 * diagnostic projection — integers and slugs only, no payloads — while leaving
 * the aggregate API exactly as it was.
 */

const { createTurnTimeline } = require('../turnTimeline');

function fakeClock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

describe('turn timeline preserves bounded span intervals', () => {
  test('the existing aggregate is unchanged', () => {
    const clock = fakeClock();
    const timeline = createTurnTimeline({ now: clock.now });
    const a = timeline.begin('evidence_cache_lookup');
    clock.advance(30);
    a();
    const b = timeline.begin('evidence_cache_lookup');
    clock.advance(20);
    b();

    const snapshot = timeline.snapshot({ totalMs: 50 });
    expect(snapshot.stages).toEqual([
      { stage: 'evidence_cache_lookup', totalMs: 50, calls: 2 },
    ]);
    expect(snapshot.accumulatedWorkMs).toBe(50);
    expect(snapshot.criticalPathMs).toBe(50);
  });

  test('each span reports its own start offset and duration', () => {
    const clock = fakeClock();
    const timeline = createTurnTimeline({ now: clock.now });

    const first = timeline.begin('evidence_cache_lookup');
    clock.advance(40);
    first();
    clock.advance(10);
    const second = timeline.begin('evidence_provider_refresh');
    clock.advance(100);
    second();

    const { spans } = timeline.snapshot({ totalMs: 150 });
    expect(spans).toEqual([
      { stage: 'evidence_cache_lookup', startMs: 0, durationMs: 40 },
      { stage: 'evidence_provider_refresh', startMs: 50, durationMs: 100 },
    ]);
  });

  test('overlap is visible — the whole point of keeping intervals', () => {
    const clock = fakeClock();
    const timeline = createTurnTimeline({ now: clock.now });

    const a = timeline.begin('evidence_provider_refresh');
    const b = timeline.begin('evidence_provider_refresh');
    clock.advance(200);
    a();
    clock.advance(300);
    b();

    const snapshot = timeline.snapshot({ totalMs: 500 });
    // Aggregate cannot distinguish these two shapes; the spans can.
    expect(snapshot.stages[0]).toEqual({ stage: 'evidence_provider_refresh', totalMs: 700, calls: 2 });
    expect(snapshot.criticalPathMs).toBe(500);
    expect(snapshot.spans).toEqual([
      { stage: 'evidence_provider_refresh', startMs: 0, durationMs: 200 },
      { stage: 'evidence_provider_refresh', startMs: 0, durationMs: 500 },
    ]);
  });

  test('bounded metadata rides along when supplied', () => {
    const clock = fakeClock();
    const timeline = createTurnTimeline({ now: clock.now });

    const end = timeline.begin('evidence_cache_lookup', {
      wave: 'structured',
      provider: 'nps',
      requirement: 'alerts_closures',
      blocking: true,
    });
    clock.advance(12);
    end();

    expect(timeline.snapshot({ totalMs: 12 }).spans).toEqual([{
      stage: 'evidence_cache_lookup',
      startMs: 0,
      durationMs: 12,
      wave: 'structured',
      provider: 'nps',
      requirement: 'alerts_closures',
      blocking: true,
    }]);
  });

  test('metadata is slug-bounded — no payloads, no free text', () => {
    const clock = fakeClock();
    const timeline = createTurnTimeline({ now: clock.now });
    const end = timeline.begin('evidence_provider_refresh', {
      wave: 'web discovery!!',                  // not a slug
      provider: 'x'.repeat(200),                // too long
      requirement: { topic: 'roads' },          // not a string
      blocking: 'yes',                          // not a boolean
      secret: 'do-not-emit',                    // not an allowed key
    });
    clock.advance(5);
    end();

    expect(timeline.snapshot({ totalMs: 5 }).spans).toEqual([
      { stage: 'evidence_provider_refresh', startMs: 0, durationMs: 5 },
    ]);
  });

  test('the span list is capped and never unbounded', () => {
    const clock = fakeClock();
    const timeline = createTurnTimeline({ now: clock.now });
    for (let i = 0; i < 500; i += 1) {
      const end = timeline.begin('evidence_cache_lookup');
      clock.advance(1);
      end();
    }
    const snapshot = timeline.snapshot({ totalMs: 500 });
    expect(snapshot.spans.length).toBeLessThanOrEqual(64);
    // The aggregate still counts every one of them.
    expect(snapshot.stages[0]).toEqual({ stage: 'evidence_cache_lookup', totalMs: 500, calls: 500 });
    expect(snapshot.spansTruncated).toBe(true);
  });

  test('an unclosed span never appears', () => {
    const clock = fakeClock();
    const timeline = createTurnTimeline({ now: clock.now });
    timeline.begin('generation');
    const end = timeline.begin('evidence_cache_lookup');
    clock.advance(7);
    end();

    const snapshot = timeline.snapshot({ totalMs: 7 });
    expect(snapshot.spans).toHaveLength(1);
    expect(snapshot.openStages).toEqual(['generation']);
  });
});

/**
 * GROUP-SHAPED REFRESH SPANS.
 *
 * The broker deduplicates requirements onto one provider call, so a refresh
 * span labelled with a single `requirement` names an arbitrary member of the
 * group and misattributes the other two. The live 2026-08-27 rerun showed the
 * `nps|alerts|thro` call — serving trail_conditions, wildfire_smoke and
 * alerts_closures — labelled simply `wildfire_smoke`.
 *
 * Three fake spans for one call would be worse. The span describes the GROUP.
 */
describe('provider refresh spans describe the deduplicated group', () => {
  test('a group key and its requirement list ride along', () => {
    const clock = fakeClock();
    const timeline = createTurnTimeline({ now: clock.now });
    const end = timeline.begin('evidence_provider_refresh', {
      wave: 'structured',
      provider: 'nps',
      groupKey: 'nps|alerts|thro',
      requirements: ['trail_conditions', 'wildfire_smoke', 'alerts_closures'],
      blocking: true,
    });
    clock.advance(2522);
    end();

    expect(timeline.snapshot({ totalMs: 2522 }).spans).toEqual([{
      stage: 'evidence_provider_refresh',
      startMs: 0,
      durationMs: 2522,
      wave: 'structured',
      provider: 'nps',
      groupKey: 'nps|alerts|thro',
      requirements: ['trail_conditions', 'wildfire_smoke', 'alerts_closures'],
      blocking: true,
    }]);
  });

  test('lookup spans stay requirement-specific', () => {
    const clock = fakeClock();
    const timeline = createTurnTimeline({ now: clock.now });
    const end = timeline.begin('evidence_cache_lookup', { wave: 'structured', requirement: 'roads' });
    clock.advance(9);
    end();
    const [span] = timeline.snapshot({ totalMs: 9 }).spans;
    expect(span.requirement).toBe('roads');
    expect(span.requirements).toBeUndefined();
  });

  test('group keys are charset-bounded and length-capped', () => {
    const clock = fakeClock();
    const timeline = createTurnTimeline({ now: clock.now });
    const end = timeline.begin('evidence_provider_refresh', {
      groupKey: 'https://example.com/leak?q=private text',
      requirements: ['ok_topic', 'not a slug', { nested: true }, 'another_topic'],
    });
    clock.advance(1);
    end();
    const [span] = timeline.snapshot({ totalMs: 1 }).spans;
    expect(span.groupKey).toBeUndefined();
    // Non-slug and non-string members are dropped; valid ones survive.
    expect(span.requirements).toEqual(['ok_topic', 'another_topic']);
  });

  test('real dedupe key shapes are accepted', () => {
    const clock = fakeClock();
    const timeline = createTurnTimeline({ now: clock.now });
    const keys = [
      'nps|alerts|thro',
      'weather|forecast|46.979|-103.538|imperial',
      'fee_free_calendar|nps:park:thro|2026|nps-2026-v1',
      'brave|search|5031048b6650f62bf1d1069aaffa87ad9224fcce9',
    ];
    for (const groupKey of keys) {
      const end = timeline.begin('evidence_provider_refresh', { groupKey });
      clock.advance(1);
      end();
    }
    expect(timeline.snapshot({ totalMs: 4 }).spans.map((s) => s.groupKey)).toEqual(keys);
  });

  test('the requirement list is capped', () => {
    const clock = fakeClock();
    const timeline = createTurnTimeline({ now: clock.now });
    const end = timeline.begin('evidence_provider_refresh', {
      requirements: Array.from({ length: 40 }, (_, i) => `topic_${i}`),
    });
    clock.advance(1);
    end();
    expect(timeline.snapshot({ totalMs: 1 }).spans[0].requirements.length).toBeLessThanOrEqual(12);
  });
});
