'use strict';

/**
 * HONEST PROGRESS + FIRST ARTIFACT BYTE — server half.
 *
 * Two things are pinned here:
 *
 *  1. The artifact clock measures the ARTIFACT. `response.created` is not a
 *     first-token metric, and the 2026-08-27 THRO reading of 1,915 ms was taken
 *     for one. These tests make the two impossible to confuse again.
 *  2. Nothing plan-shaped leaks into telemetry. The tool-argument stream is now
 *     observed; only its timing and its SIZE may be recorded.
 */

const {
  summarizeModelDispatch,
  createToolArgumentStreamRecorder,
  MAX_TOOL_ARGUMENT_SAMPLES,
} = require('../modelLatencyAnatomy');
const {
  pickRefinementTarget,
  PRODUCT_STAGES,
  createTrailieTransportAdapter,
} = require('../trailieTransportAdapter');
const { describeRefinementTarget, resolveRefinementScope } = require('../refinementScope');

// ---------------------------------------------------------------------------
// §D — the artifact clock
// ---------------------------------------------------------------------------

describe('response.created is not the first-token metric', () => {
  test('stream-open and first artifact byte are reported as different numbers', () => {
    const out = summarizeModelDispatch({
      dispatchStartedAtMs: 1_000,
      firstEventAtMs: 2_915,          // response.created
      responseCreatedAtMs: 2_915,
      firstToolArgumentDeltaAtMs: 15_000,
      lastToolArgumentDeltaAtMs: 18_400,
      completedAtMs: 18_900,
    });
    // The legacy field keeps its old meaning and its old value...
    expect(out.timeToFirstEventMs).toBe(1_915);
    expect(out.responseCreatedDelayMs).toBe(1_915);
    // ...and is emphatically not the artifact clock.
    expect(out.timeToFirstToolArgumentDeltaMs).toBe(14_000);
    expect(out.toolArgumentStreamingMs).toBe(3_400);
    expect(out.postArtifactCompletionMs).toBe(500);
  });

  test('a tool-only itinerary turn reports NO text delta rather than a zero', () => {
    const out = summarizeModelDispatch({
      dispatchStartedAtMs: 0,
      firstEventAtMs: 100,
      firstToolArgumentDeltaAtMs: 4_000,
      lastToolArgumentDeltaAtMs: 9_000,
      completedAtMs: 9_100,
    });
    expect(out.timeToFirstTextDeltaMs).toBeNull();
    expect(out.timeToFirstToolArgumentDeltaMs).toBe(4_000);
  });

  test('a dispatch that never streamed tool arguments reports null, not 0', () => {
    const out = summarizeModelDispatch({
      dispatchStartedAtMs: 0, firstEventAtMs: 50, completedAtMs: 900,
    });
    expect(out.timeToFirstToolArgumentDeltaMs).toBeNull();
    expect(out.toolArgumentStreamingMs).toBeNull();
    expect(out.postArtifactCompletionMs).toBeNull();
    expect(out.toolArgumentDeltaCount).toBeNull();
    expect(out.toolArgumentBytes).toBeNull();
  });

  test('an unmeasured dispatch invents nothing', () => {
    const out = summarizeModelDispatch({});
    for (const key of [
      'responseCreatedDelayMs', 'timeToFirstTextDeltaMs', 'timeToFirstToolArgumentDeltaMs',
      'toolArgumentStreamingMs', 'postArtifactCompletionMs',
    ]) expect(out[key]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §E — stream shape, bounded
// ---------------------------------------------------------------------------

describe('tool-argument stream shape', () => {
  test('distinguishes continuous streaming from one early byte then a late burst', () => {
    const continuous = createToolArgumentStreamRecorder({ dispatchStartedAtMs: 0 });
    for (let t = 2_400; t <= 17_400; t += 300) continuous.record(500, t);
    const cont = continuous.seal();

    const bursty = createToolArgumentStreamRecorder({ dispatchStartedAtMs: 0 });
    bursty.record(40, 2_400);
    for (let t = 16_000; t <= 17_400; t += 100) bursty.record(1_800, t);
    const burst = bursty.seal();

    // Same first byte, opposite architectural meaning — which is the whole point.
    expect(cont.firstToolArgumentDeltaAtMs).toBe(burst.firstToolArgumentDeltaAtMs);
    // The curve is what tells them apart: at the halfway mark the continuous
    // stream has delivered most of its bytes and the bursty one almost none.
    const halfway = (samples, total) => {
      const at = samples.filter((s) => s.tMs <= 9_000).pop();
      return (at ? at.cumulativeBytes : 0) / total;
    };
    expect(halfway(cont.toolArgumentSamples, cont.toolArgumentBytes)).toBeGreaterThan(0.4);
    expect(halfway(burst.toolArgumentSamples, burst.toolArgumentBytes)).toBeLessThan(0.05);
  });

  test('the sample series is hard-capped however long the artifact runs', () => {
    const rec = createToolArgumentStreamRecorder({ dispatchStartedAtMs: 0 });
    for (let t = 0; t < 200_000; t += 300) rec.record(8_192, t);
    const out = rec.seal();
    expect(out.toolArgumentSamples.length).toBeLessThanOrEqual(MAX_TOOL_ARGUMENT_SAMPLES);
    expect(out.toolArgumentSamplesTruncated).toBe(true);
    // The counters stay exact even when the curve is truncated.
    expect(out.toolArgumentDeltaCount).toBe(667);
  });

  test('records SIZE only — no tool-argument content can enter telemetry', () => {
    const rec = createToolArgumentStreamRecorder({ dispatchStartedAtMs: 0 });
    rec.record(Buffer.byteLength('{"intro":"Kīlauea Overlook at sunrise"'), 100);
    const out = rec.seal();
    const serialized = JSON.stringify(out);
    expect(serialized).not.toMatch(/intro|Overlook|sunrise|Kīlauea/i);
    expect(out.toolArgumentBytes).toBeGreaterThan(0);
    // Every sample is two numbers and nothing else.
    for (const sample of out.toolArgumentSamples) {
      expect(Object.keys(sample).sort()).toEqual(['cumulativeBytes', 'tMs']);
    }
  });

  test('a single delta still yields a usable, non-null reading', () => {
    const rec = createToolArgumentStreamRecorder({ dispatchStartedAtMs: 0 });
    rec.record(120, 3_000);
    const out = rec.seal();
    expect(out.firstToolArgumentDeltaAtMs).toBe(3_000);
    expect(out.lastToolArgumentDeltaAtMs).toBe(3_000);
    expect(out.toolArgumentSamples).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// §C — refinement target: bounded, and about the request not the answer
// ---------------------------------------------------------------------------

const PLAN = {
  days: [
    { dayNumber: 1, stops: [{ id: 's1', name: 'Painted Canyon Overlook', timeWindow: 'Morning' }] },
    {
      dayNumber: 2,
      stops: [
        { id: 's2', name: 'Wind Canyon Trail', timeWindow: 'Morning through midday' },
        { id: 's3', name: 'Boicourt Overlook', timeWindow: 'Late afternoon golden hour' },
      ],
    },
  ],
};

describe('refinement target is derived from the persisted plan, before any model call', () => {
  test('a daypart reference mirrors the traveler, and does not name the stop it resolved to', () => {
    const scope = resolveRefinementScope({
      text: 'The second morning sounds like a little too much…', priorPlan: PLAN,
    });
    // The scope DID resolve to exactly one stop — naming it back would be true
    // but asserts a referent the traveler never used.
    expect(scope.allowedStopIds).toEqual(['s2']);
    expect(describeRefinementTarget(scope)).toEqual({
      level: 'daypart', dayNumber: 2, daypart: 'morning', stopName: null,
    });
  });

  test('a named stop resolves to that stop', () => {
    const scope = resolveRefinementScope({ text: 'swap Boicourt Overlook for something flatter', priorPlan: PLAN });
    expect(describeRefinementTarget(scope)).toMatchObject({ level: 'stop', stopName: 'Boicourt Overlook' });
  });

  test('a day reference names no single stop', () => {
    const scope = resolveRefinementScope({ text: 'rework day 2', priorPlan: PLAN });
    expect(describeRefinementTarget(scope)).toEqual({
      level: 'day', dayNumber: 2, daypart: null, stopName: null,
    });
  });

  test('an unresolved reference produces NO target — generic copy, never a guess', () => {
    for (const text of ['make that part better', 'change it', 'day 9 please']) {
      const scope = resolveRefinementScope({ text, priorPlan: PLAN });
      expect(describeRefinementTarget(scope)).toBeNull();
    }
  });
});

describe('the refinement target allowlist cannot be widened by a caller', () => {
  test('unknown fields, oversized names and out-of-range days are stripped', () => {
    const picked = pickRefinementTarget({
      level: 'stop',
      dayNumber: 999,
      daypart: 'whenever',
      stopName: `${'x'.repeat(400)}`,
      // Everything below is exactly what invariant #2 exists to exclude.
      model: 'gpt-5.6-terra', tier: 'sol_medium', attempt: 3, reasoningEffort: 'medium',
    });
    expect(Object.keys(picked).sort()).toEqual(['dayNumber', 'daypart', 'level', 'stopName']);
    expect(picked.dayNumber).toBeNull();
    expect(picked.daypart).toBeNull();
    expect(picked.stopName).toHaveLength(80);
  });

  test('an unrecognized scope level yields no target at all', () => {
    expect(pickRefinementTarget({ level: 'everything', stopName: 'X' })).toBeNull();
    expect(pickRefinementTarget(null)).toBeNull();
  });

  test('a progress event carrying model identity still publishes only the allowlist', () => {
    const written = [];
    const transport = createTrailieTransportAdapter({ dialect: 'v2', emit: (p) => written.push(p) });
    transport.progress({
      stage: 'building_itinerary',
      refinementTarget: { level: 'day', dayNumber: 2, model: 'gpt-5.6-sol' },
    });
    expect(written).toHaveLength(1);
    expect(written[0].refinementTarget).toEqual({
      level: 'day', dayNumber: 2, daypart: null, stopName: null,
    });
    expect(JSON.stringify(written[0])).not.toMatch(/gpt|sol|terra|luna/i);
  });

  test('legacy carries the same sanitized target on its thinking event', () => {
    const written = [];
    const transport = createTrailieTransportAdapter({ dialect: 'legacy', emit: (p) => written.push(p) });
    transport.progress({
      stage: 'building_structured_itinerary',
      legacyStage: 'building_structured_itinerary',
      refinementTarget: { level: 'stop', stopName: 'Boicourt Overlook', dayNumber: 2 },
    });
    expect(written[0]).toMatchObject({
      type: 'thinking',
      stage: 'building_structured_itinerary',
      refinementTarget: { level: 'stop', stopName: 'Boicourt Overlook', dayNumber: 2, daypart: null },
    });
  });
});

// ---------------------------------------------------------------------------
// §B — the lifecycle stages travel on the transport already in production
// ---------------------------------------------------------------------------

describe('real lifecycle stages need no transport change', () => {
  const EMITTED = [
    'understanding_request', 'checking_park_information', 'checking_current_conditions',
    'checking_permits', 'checking_transport', 'validating_trip',
  ];

  test('every stage the execution service emits is already product vocabulary', () => {
    for (const stage of EMITTED) expect(PRODUCT_STAGES.has(stage)).toBe(true);
  });

  test('v2 accepts them and legacy passes them verbatim', () => {
    for (const stage of EMITTED) {
      const v2 = [];
      const legacy = [];
      createTrailieTransportAdapter({ dialect: 'v2', emit: (p) => v2.push(p) }).progress({ stage });
      createTrailieTransportAdapter({ dialect: 'legacy', emit: (p) => legacy.push(p) })
        .progress({ stage, legacyStage: stage });
      expect(v2[0]).toEqual({ type: 'progress', stage });
      expect(legacy[0]).toEqual({ type: 'thinking', stage });
    }
  });
});

// ---------------------------------------------------------------------------
// §F — the artifact stream is measured, not forwarded
// ---------------------------------------------------------------------------

describe('tool-argument deltas do not reach the client', () => {
  const SOURCE = require('fs').readFileSync(
    require('path').join(__dirname, '../../services/trailieExecutionService.js'), 'utf8',
  );

  test('the only emit inside the stream callback is gated on text_delta', () => {
    const start = SOURCE.indexOf('onEvent: (event) => {');
    expect(start).toBeGreaterThan(-1);
    const body = SOURCE.slice(start, SOURCE.indexOf('\n            },', start));
    // The tool-argument branch returns before any emit can be reached.
    const toolBranch = body.slice(
      body.indexOf("event?.type === 'tool_argument_delta'"),
      body.indexOf("event?.type === 'start'"),
    );
    expect(toolBranch).not.toMatch(/emit\(/);
    // Exactly one emit in the whole callback, and it follows the text_delta gate.
    expect(body.match(/emit\(/g)).toHaveLength(1);
    expect(body.indexOf("event?.type !== 'text_delta'")).toBeLessThan(body.indexOf('emit('));
  });

  test('no canonical event type carries tool arguments', () => {
    const { CANONICAL_EVENTS } = require('../../services/trailieV2ExecutionService');
    expect(CANONICAL_EVENTS).not.toContain('tool_argument_delta');
    expect(CANONICAL_EVENTS.some((e) => /tool|artifact_delta|partial/i.test(e))).toBe(false);
  });
});
