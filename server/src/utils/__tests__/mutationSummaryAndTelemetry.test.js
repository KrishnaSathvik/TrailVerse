'use strict';

/**
 * G — DETERMINISTIC MUTATION SUMMARY, and F — telemetry that survives the bridge.
 *
 * Two live turns, two invented deltas: "no trail objective" on a stop that never
 * had one, and "rather than a more demanding outing" about an easy scenic drive
 * that the patch replaced with a morning containing MORE walking. Both times the
 * response model was handed the conversation and asked to narrate the change it
 * had just made. Two instruction revisions did not help.
 *
 * So stop asking it to infer the delta. Hand it the delta.
 *
 * No lexical entailment validator is built here — the summary is generation
 * context, not a gate.
 */

const { buildMutationSummary, renderMutationSummaryForPrompt } = require('../mutationSummary');

function plan(day2Stops) {
  return {
    days: [
      { day: 1, dayNumber: 1, stops: [{ id: 'welcome', name: 'Welcome Center', type: 'visitor_center', timeWindow: 'Morning', duration: 40, difficulty: 'easy', exposureLevel: 'low' }] },
      { day: 2, dayNumber: 2, stops: day2Stops },
      { day: 3, dayNumber: 3, stops: [{ id: 'overlook', name: 'Kīlauea Overlook', type: 'viewpoint', timeWindow: 'Afternoon', duration: 50, difficulty: 'easy', exposureLevel: 'moderate' }] },
    ],
  };
}
const maunaLoa = (o = {}) => ({
  id: 'mauna-loa-road', order: 1, name: 'Mauna Loa Road scenic drive', type: 'scenic_drive',
  timeWindow: 'Morning through midday', duration: 105, difficulty: 'easy',
  exposureLevel: 'moderate', walkingDistanceMiles: null, ...o,
});
const kipuka = (o = {}) => ({
  id: 'kipukapuaulu', order: 2, name: 'Kīpukapuaulu', type: 'landmark',
  timeWindow: 'Afternoon', duration: 75, difficulty: 'easy', exposureLevel: 'low', ...o,
});

describe('the summary states the delta, not the result', () => {
  test('a bounded stop change is reported field by field', () => {
    const before = plan([maunaLoa(), kipuka()]);
    const after = plan([
      maunaLoa({ timeWindow: 'Morning · flexible and unhurried', duration: 120 }),
      kipuka(),
    ]);
    const summary = buildMutationSummary({ priorPlan: before, nextPlan: after });

    expect(summary.changedStops).toEqual([{
      dayNumber: 2,
      stopId: 'mauna-loa-road',
      name: 'Mauna Loa Road scenic drive',
      fieldChanges: [
        { field: 'timeWindow', before: 'Morning through midday', after: 'Morning · flexible and unhurried' },
        { field: 'duration', before: 105, after: 120 },
      ],
    }]);
    expect(summary.addedStops).toEqual([]);
    expect(summary.removedStops).toEqual([]);
    expect(summary.unchangedDayNumbers).toEqual([1, 3]);
    expect(summary.preservedFactualFields).toEqual(
      expect.arrayContaining(['difficulty', 'exposureLevel'])
    );
  });

  test('G2a: the first overclaim is not supported by the summary', () => {
    // "no trail objective" — nothing was removed and difficulty never moved.
    const before = plan([maunaLoa(), kipuka()]);
    const after = plan([maunaLoa({ duration: 120, exposureLevel: 'low' }), kipuka()]);
    const summary = buildMutationSummary({ priorPlan: before, nextPlan: after });
    expect(summary.removedStops).toEqual([]);
    expect(summary.changedStops[0].fieldChanges.map((c) => c.field)).not.toContain('difficulty');
  });

  test('G2b: the second overclaim is contradicted by the summary', () => {
    // "one short easy walk rather than a more demanding outing": the prior
    // morning was an easy scenic drive with no walking, and the new day ADDS a trail.
    const before = plan([maunaLoa(), kipuka()]);
    const after = plan([
      { id: 'kilauea-overlook-d2', order: 1, name: 'Kīlauea Overlook', type: 'viewpoint', timeWindow: 'Morning', duration: 60, difficulty: 'easy' },
      { id: 'sulphur-banks', order: 2, name: 'Haʻakulamanu via Sulphur Banks Trail', type: 'trail', timeWindow: 'Late morning', duration: 45, difficulty: 'easy' },
    ]);
    const summary = buildMutationSummary({ priorPlan: before, nextPlan: after });
    expect(summary.removedStops.map((s) => s.name)).toEqual(
      expect.arrayContaining(['Mauna Loa Road scenic drive', 'Kīpukapuaulu'])
    );
    expect(summary.addedStops.map((s) => s.type)).toContain('trail');
    // The prior plan contained no trail at all, so "rather than a more
    // demanding outing" describes a before-state the artifact does not have.
    const priorTypes = before.days.flatMap((d) => d.stops.map((s) => s.type));
    expect(priorTypes).not.toContain('trail');
  });

  test('an unchanged plan claims nothing at all', () => {
    const p = plan([maunaLoa(), kipuka()]);
    const summary = buildMutationSummary({ priorPlan: p, nextPlan: p });
    expect(summary.changedStops).toEqual([]);
    expect(summary.addedStops).toEqual([]);
    expect(summary.removedStops).toEqual([]);
    expect(summary.empty).toBe(true);
  });
});

describe('the summary is rendered as generation context', () => {
  test('it names changed, unchanged, added and removed explicitly', () => {
    const before = plan([maunaLoa(), kipuka()]);
    const after = plan([maunaLoa({ duration: 120, timeWindow: 'Morning · flexible' }), kipuka()]);
    const text = renderMutationSummaryForPrompt(
      buildMutationSummary({ priorPlan: before, nextPlan: after })
    );
    expect(text).toMatch(/Changed/i);
    expect(text).toMatch(/duration 105 . 120/);
    expect(text).toMatch(/Unchanged/i);
    expect(text).toMatch(/Removed stops:\s*none/i);
    expect(text).toMatch(/Added stops:\s*none/i);
    expect(text).toMatch(/only these changes|Describe only/i);
  });

  test('rendering an empty summary says nothing changed rather than inventing', () => {
    const p = plan([maunaLoa()]);
    const text = renderMutationSummaryForPrompt(buildMutationSummary({ priorPlan: p, nextPlan: p }));
    expect(text).toMatch(/no changes/i);
  });
});

describe('F — target diagnostics survive the route bridge', () => {
  const { summarizeV2TelemetryForTests } = require('../../services/trailieV2RouteBridge');

  test('the bridge forwards validationTargetDiagnostics verbatim', () => {
    const diagnostics = {
      operationIndex: 0, op: 'update_stop', dayNumber: 2,
      requestedStopId: null, requestedStopName: 'Mauna Loa Road',
      availableStopIds: ['mauna-loa-road'], availableStopNames: ['Mauna Loa Road scenic drive'],
      matchedCount: 0,
    };
    const telemetry = summarizeV2TelemetryForTests({
      status: 'complete',
      attempts: [{
        tier: 'terra_low', model: 'gpt-5.6-terra', attemptKind: 'primary',
        validationStatus: 'fail', validationReasonCodes: ['plan_patch_target_not_found'],
        validationStage: 'plan_patch_apply', validationTargetDiagnostics: diagnostics,
      }],
    });
    expect(telemetry.attempts[0].validationTargetDiagnostics).toEqual(diagnostics);
  });

  test('an attempt without diagnostics reports null, not undefined', () => {
    const telemetry = summarizeV2TelemetryForTests({
      status: 'complete',
      attempts: [{ tier: 'terra_low', validationStatus: 'pass', validationReasonCodes: [] }],
    });
    expect(telemetry.attempts[0].validationTargetDiagnostics).toBeNull();
  });
});
