'use strict';

/**
 * TURN TIMELINE — make latency attributable before optimizing anything.
 *
 * The two numbers this project has been quoting are not what they look like:
 *
 *   generationMs    is the SUM of attempt windows, and each window spans
 *                   generation AND validation — finalizeItinerary, the Maps
 *                   route bridge, completeness, traveler fit.
 *   preGenerationMs is `totalMs - generationMs`: a RESIDUAL holding HTTP, auth,
 *                   understanding, evidence, persistence and finalization.
 *
 * So "28.4s pre-generation" names a bucket, not a stage, and "7.6s generation"
 * includes deterministic work. Neither can point at a bottleneck.
 */

const { createTurnTimeline } = require('../turnTimeline');

describe('stage attribution', () => {
  function fakeClock(start = 1000) {
    let now = start;
    return { now: () => now, advance: (ms) => { now += ms; } };
  }

  test('sequential stages report their own durations', () => {
    const clock = fakeClock();
    const timeline = createTurnTimeline({ now: clock.now });
    const end = timeline.begin('turn_understanding');
    clock.advance(120);
    end();
    const end2 = timeline.begin('evidence_resolution');
    clock.advance(19943);
    end2();

    const snap = timeline.snapshot();
    expect(snap.stages).toEqual([
      { stage: 'turn_understanding', totalMs: 120, calls: 1 },
      { stage: 'evidence_resolution', totalMs: 19943, calls: 1 },
    ]);
    expect(snap.criticalPathMs).toBe(20063);
  });

  test('a repeated stage accumulates instead of overwriting', () => {
    const clock = fakeClock();
    const timeline = createTurnTimeline({ now: clock.now });
    for (const ms of [6406, 17586]) {
      const end = timeline.begin('generation');
      clock.advance(ms);
      end();
    }
    const snap = timeline.snapshot();
    expect(snap.stages).toEqual([{ stage: 'generation', totalMs: 23992, calls: 2 }]);
  });

  test('overlapping work is not summed as though it were sequential', () => {
    const clock = fakeClock();
    const timeline = createTurnTimeline({ now: clock.now });
    // Two providers fetched concurrently: 800ms of wall clock, 1400ms of work.
    const a = timeline.begin('provider_acquisition');
    const b = timeline.begin('provider_acquisition');
    clock.advance(600);
    a();
    clock.advance(200);
    b();

    const snap = timeline.snapshot();
    expect(snap.stages[0]).toEqual({ stage: 'provider_acquisition', totalMs: 1400, calls: 2 });
    // Wall clock is what the traveler waits for.
    expect(snap.criticalPathMs).toBe(800);
    expect(snap.accumulatedWorkMs).toBe(1400);
  });

  test('an unclosed stage is reported, not silently dropped', () => {
    const clock = fakeClock();
    const timeline = createTurnTimeline({ now: clock.now });
    timeline.begin('evidence_resolution');
    clock.advance(50);
    const snap = timeline.snapshot();
    expect(snap.openStages).toEqual(['evidence_resolution']);
  });

  test('the residual names what is NOT attributed to any stage', () => {
    const clock = fakeClock();
    const timeline = createTurnTimeline({ now: clock.now });
    const end = timeline.begin('generation');
    clock.advance(7632);
    end();
    clock.advance(489); // unmeasured work
    const snap = timeline.snapshot({ totalMs: 8121 });
    expect(snap.unattributedMs).toBe(489);
  });

  test('the snapshot is bounded and carries no free text', () => {
    const clock = fakeClock();
    const timeline = createTurnTimeline({ now: clock.now });
    for (let i = 0; i < 60; i += 1) {
      const end = timeline.begin(`stage_${i}`);
      clock.advance(1);
      end();
    }
    const snap = timeline.snapshot();
    expect(snap.stages.length).toBeLessThanOrEqual(32);
    expect(snap.stages.every((s) => /^[a-z0-9_]{1,40}$/.test(s.stage))).toBe(true);
  });

  test('a rejected stage name is dropped rather than recorded', () => {
    const timeline = createTurnTimeline();
    const end = timeline.begin('Traveler asked: make it easier');
    end();
    expect(timeline.snapshot().stages).toEqual([]);
  });
});

describe('generation and validation stop being one number', () => {
  test('an attempt splits into model time and deterministic time', () => {
    let now = 0;
    const timeline = createTurnTimeline({ now: () => now });
    const gen = timeline.begin('generation');
    now += 5200;
    gen();
    const val = timeline.begin('artifact_validation');
    now += 2432;
    val();

    const snap = timeline.snapshot({ totalMs: 8121 });
    const byStage = Object.fromEntries(snap.stages.map((s) => [s.stage, s.totalMs]));
    // The live 7,632ms "generation" for this turn was really both of these.
    expect(byStage.generation + byStage.artifact_validation).toBe(7632);
    expect(byStage.generation).toBe(5200);
    expect(byStage.artifact_validation).toBe(2432);
  });
});

describe('instrumentation health, not a product metric', () => {
  test('coverage ratio says how much wall clock is actually attributed', () => {
    let now = 0;
    const timeline = createTurnTimeline({ now: () => now });
    const a = timeline.begin('evidence_resolution');
    now += 600;
    a();
    now += 200; // unmeasured
    const b = timeline.begin('generation');
    now += 5200;
    b();

    const snap = timeline.snapshot({ totalMs: 6000 });
    expect(snap.criticalPathMs).toBe(5800);
    expect(snap.unattributedMs).toBe(200);
    expect(snap.coverageRatio).toBeCloseTo(0.967, 3);
  });

  test('nested spans do not inflate the critical path', () => {
    let now = 0;
    const timeline = createTurnTimeline({ now: () => now });
    const outer = timeline.begin('artifact_validation');
    const inner = timeline.begin('maps_route_bridge');
    now += 2000;
    inner();
    now += 400;
    outer();

    const snap = timeline.snapshot({ totalMs: 2400 });
    // Union counts the containing interval once...
    expect(snap.criticalPathMs).toBe(2400);
    // ...while accumulated work still shows both, which is the point of keeping both.
    expect(snap.accumulatedWorkMs).toBe(4400);
    expect(snap.coverageRatio).toBe(1);
  });

  test('coverage is null when the total is unknown rather than guessed', () => {
    const timeline = createTurnTimeline({ now: () => 0 });
    expect(timeline.snapshot().coverageRatio).toBeNull();
  });
});
