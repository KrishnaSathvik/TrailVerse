'use strict';

/**
 * PHASE 1 — ZERO-DURATION MICRO-REPAIR.
 *
 * These are the success criteria pre-registered before implementation
 * (2026-08-28), not tests written to fit the code. The regression case is
 * modelled on the measured gate4 "pair B" failure, where a full-regeneration
 * repair replaced every stop on every day to supply a missing integer:
 *
 *   stop identity preserved  [0%, 0%, 0%, 0%]
 *
 * The target is [100%, 100%, 100%, 100%] — not because the model is asked more
 * nicely, but because it has no authority to replace a stop.
 */

const {
  collectZeroDurationTargets,
  buildZeroDurationRepairInstruction,
  applyZeroDurationRepair,
  ZERO_DURATION_REPAIR_TOOL,
  ZERO_DURATION_REPAIR_REASON_CODES: REASON,
  MAX_STOP_DURATION_MINUTES,
} = require('../zeroDurationRepair');
const { evaluateStructuralArtifact } = require('../itineraryStructuralValidation');

const stop = (id, name, over = {}) => ({
  id,
  order: over.order ?? 1,
  type: over.type ?? 'trail',
  name,
  note: `Long-form guidance for ${name}.`,
  why: `Why ${name} earns its place.`,
  duration: 0,
  timeWindow: 'Morning',
  exposureLevel: 'low',
  difficulty: 'easy',
  parkCode: 'grsm',
  ...over,
});

/** Four days, every stop at duration 0 — the shape that produced the failure. */
const pairB = () => ({
  intro: 'A deliberately unhurried four days in the Smokies.',
  days: [
    { id: 'day-1', dayNumber: 1, day: 1, label: 'Cades Cove', stops: [stop('s1', 'Cades Cove Loop Road', { order: 1 }), stop('s2', 'Cades Cove Visitor Center', { order: 2, type: 'visitor_center' })] },
    { id: 'day-2', dayNumber: 2, day: 2, label: 'Newfound Gap', stops: [stop('s3', 'Newfound Gap Road', { order: 1, type: 'scenic_drive' }), stop('s4', 'Clingmans Dome', { order: 2 })] },
    { id: 'day-3', dayNumber: 3, day: 3, label: 'Oconaluftee', stops: [stop('s5', 'Oconaluftee Visitor Center', { order: 1, type: 'visitor_center' }), stop('s6', 'Mountain Farm Museum', { order: 2, type: 'museum' })] },
    { id: 'day-4', dayNumber: 4, day: 4, label: 'Foothills', stops: [stop('s7', 'Foothills Parkway', { order: 1, type: 'scenic_drive' })] },
  ],
});
const allZeroDiagnostics = [1, 2, 3, 4].map((n) => ({ dayIndex: n - 1, dayNumber: n, codes: ['zero_duration_stops'] }));
const answerAll = (targets, minutes = 60) => targets.map((t) => ({ ref: t.ref, stopId: t.stopId, durationMinutes: minutes }));

/** Everything a traveler reads, minus the one field repair may write. */
const fingerprint = (plan) => JSON.stringify((plan.days || []).map((d) => ({
  day: d.day, label: d.label, id: d.id,
  stops: (d.stops || []).map(({ duration, ...rest }) => rest),
})));

describe('target collection', () => {
  it('addresses exactly the zero-duration stops on flagged days', () => {
    const { targets } = collectZeroDurationTargets({ itineraryData: pairB(), dayDiagnostics: allZeroDiagnostics });
    expect(targets).toHaveLength(7);
    expect(targets.map((t) => t.ref)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(targets.map((t) => t.stopId)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6', 's7']);
  });

  it('never addresses a stop that already has a duration', () => {
    const plan = pairB();
    plan.days[0].stops[0].duration = 90;
    const { targets } = collectZeroDurationTargets({ itineraryData: plan, dayDiagnostics: allZeroDiagnostics });
    expect(targets.map((t) => t.stopId)).not.toContain('s1');
    expect(targets).toHaveLength(6);
  });

  it('never addresses a day the validator did not flag', () => {
    const { targets } = collectZeroDurationTargets({
      itineraryData: pairB(),
      dayDiagnostics: [{ dayNumber: 2, codes: ['zero_duration_stops'] }],
    });
    expect([...new Set(targets.map((t) => t.dayNumber))]).toEqual([2]);
  });
});

describe('ambiguity is refused, never best-effort', () => {
  it('refuses when a diagnostic names a day the artifact does not contain', () => {
    const r = collectZeroDurationTargets({
      itineraryData: pairB(), dayDiagnostics: [{ dayNumber: 9, codes: ['zero_duration_stops'] }],
    });
    expect(r.ok).toBe(false);
    expect(r.reasonCodes).toEqual([REASON.AMBIGUOUS_DIAGNOSTICS]);
    expect(r.targets).toEqual([]);
  });

  it('refuses when two days share a number, so an address is not unique', () => {
    const plan = pairB();
    plan.days[1].day = 1;
    plan.days[1].dayNumber = 1;
    const r = collectZeroDurationTargets({ itineraryData: plan, dayDiagnostics: allZeroDiagnostics });
    expect(r.ok).toBe(false);
    expect(r.reasonCodes).toEqual([REASON.AMBIGUOUS_DIAGNOSTICS]);
  });

  it('refuses when two stops on one day share an address', () => {
    const plan = pairB();
    plan.days[0].stops[1] = { ...plan.days[0].stops[0] };
    const r = collectZeroDurationTargets({ itineraryData: plan, dayDiagnostics: allZeroDiagnostics });
    expect(r.ok).toBe(false);
    expect(r.reasonCodes).toEqual([REASON.AMBIGUOUS_DIAGNOSTICS]);
  });

  it('refuses when no day was flagged at all', () => {
    expect(collectZeroDurationTargets({ itineraryData: pairB(), dayDiagnostics: [] }).reasonCodes)
      .toEqual([REASON.NO_TARGETS]);
  });
});

describe('correctness — the merge cannot change anything but duration', () => {
  it('preserves 100% of stop identity, ordering, notes and evidence-bound fields', () => {
    const before = pairB();
    const { targets } = collectZeroDurationTargets({ itineraryData: before, dayDiagnostics: allZeroDiagnostics });
    const result = applyZeroDurationRepair({ itineraryData: before, targets, durationUpdates: answerAll(targets, 75) });

    expect(result.ok).toBe(true);
    expect(result.applied).toBe(7);
    // [100%, 100%, 100%, 100%] — everything except duration is byte-identical.
    expect(fingerprint(result.plan)).toEqual(fingerprint(before));
    expect(result.plan.intro).toBe(before.intro);
  });

  it('ignores any out-of-scope field a candidate tries to smuggle in', () => {
    const before = pairB();
    const { targets } = collectZeroDurationTargets({ itineraryData: before, dayDiagnostics: allZeroDiagnostics });
    const smuggled = answerAll(targets, 60).map((u) => ({
      ...u, name: 'Somewhere Else', note: 'rewritten', order: 99, exposureLevel: 'high',
    }));
    const result = applyZeroDurationRepair({ itineraryData: before, targets, durationUpdates: smuggled });

    expect(result.ok).toBe(true);
    expect(fingerprint(result.plan)).toEqual(fingerprint(before));
  });

  it('never writes ref into the plan — it is machine-owned and ephemeral', () => {
    const before = pairB();
    const { targets } = collectZeroDurationTargets({ itineraryData: before, dayDiagnostics: allZeroDiagnostics });
    const { plan } = applyZeroDurationRepair({ itineraryData: before, targets, durationUpdates: answerAll(targets) });
    const serialized = JSON.stringify(plan);
    expect(serialized).not.toContain('"ref"');
    expect(plan.days.flatMap((d) => d.stops).every((s) => !('ref' in s))).toBe(true);
  });

  it('fails closed if a target cannot be addressed in the artifact', () => {
    const before = pairB();
    const { targets } = collectZeroDurationTargets({ itineraryData: before, dayDiagnostics: allZeroDiagnostics });
    // A target the artifact no longer contains: the merge must refuse, not
    // quietly apply the six it can find.
    const orphaned = [...targets, { ref: 99, dayNumber: 1, stopId: 'ghost', name: 'Nowhere' }];
    const r = applyZeroDurationRepair({
      itineraryData: before, targets: orphaned, durationUpdates: answerAll(orphaned),
    });
    expect(r.ok).toBe(false);
    expect(r.reasonCodes).toEqual([REASON.INCOMPLETE_MERGE]);
    expect(r.plan).toBeNull();
  });

  it('does not mutate the input itinerary', () => {
    const before = pairB();
    const snapshot = JSON.stringify(before);
    const { targets } = collectZeroDurationTargets({ itineraryData: before, dayDiagnostics: allZeroDiagnostics });
    applyZeroDurationRepair({ itineraryData: before, targets, durationUpdates: answerAll(targets) });
    expect(JSON.stringify(before)).toEqual(snapshot);
  });
});

describe('severity — a malformed candidate is refused whole, never partly applied', () => {
  const setup = () => {
    const before = pairB();
    const { targets } = collectZeroDurationTargets({ itineraryData: before, dayDiagnostics: allZeroDiagnostics });
    return { before, targets };
  };

  it('rejects an unknown ref', () => {
    const { before, targets } = setup();
    const r = applyZeroDurationRepair({
      itineraryData: before, targets, durationUpdates: [...answerAll(targets), { ref: 99, durationMinutes: 30 }],
    });
    expect(r.ok).toBe(false);
    expect(r.reasonCodes).toEqual([REASON.UNKNOWN_TARGET]);
    expect(r.plan).toBeNull();
  });

  it('rejects a duplicated ref', () => {
    const { before, targets } = setup();
    const updates = answerAll(targets);
    const r = applyZeroDurationRepair({ itineraryData: before, targets, durationUpdates: [...updates, updates[0]] });
    expect(r.ok).toBe(false);
    expect(r.reasonCodes).toEqual([REASON.DUPLICATE_TARGET]);
  });

  it('rejects a missing target rather than half-repairing the plan', () => {
    const { before, targets } = setup();
    const r = applyZeroDurationRepair({ itineraryData: before, targets, durationUpdates: answerAll(targets).slice(0, 4) });
    expect(r.ok).toBe(false);
    expect(r.reasonCodes).toEqual([REASON.MISSING_TARGET]);
    expect(r.rejected).toHaveLength(3);
  });

  it('rejects a stopId that does not match the ref it claims', () => {
    const { before, targets } = setup();
    const updates = answerAll(targets);
    updates[2].stopId = 'some-other-stop';
    const r = applyZeroDurationRepair({ itineraryData: before, targets, durationUpdates: updates });
    expect(r.ok).toBe(false);
    expect(r.reasonCodes).toEqual([REASON.IDENTITY_MISMATCH]);
  });

  it.each([[0], [-30], [1.5], [MAX_STOP_DURATION_MINUTES + 1], ['60'], [null], [true], [false], [Infinity], [NaN], [undefined], [[60]]])(
    'rejects durationMinutes %p', (bad) => {
      const { before, targets } = setup();
      const updates = answerAll(targets);
      updates[0].durationMinutes = bad;
      const r = applyZeroDurationRepair({ itineraryData: before, targets, durationUpdates: updates });
      expect(r.ok).toBe(false);
      expect(r.reasonCodes).toEqual([REASON.INVALID_DURATION]);
    }
  );

  it('refuses when there is nothing to repair or nothing to repair it in', () => {
    expect(applyZeroDurationRepair({ itineraryData: null, targets: [{ ref: 1 }], durationUpdates: [] }).reasonCodes)
      .toEqual([REASON.EMPTY_ARTIFACT]);
    expect(applyZeroDurationRepair({ itineraryData: pairB(), targets: [], durationUpdates: [] }).reasonCodes)
      .toEqual([REASON.NO_TARGETS]);
  });
});

describe('functional — the repaired plan clears the gate that rejected it', () => {
  it('turns every targeted zero into a positive duration and passes the structural gate', () => {
    const before = pairB();
    const constraints = { dates: { durationDays: 4 } };
    const first = evaluateStructuralArtifact({ itineraryData: before, constraints });
    expect(first.ok).toBe(false);
    expect(first.reasonCodes).toContain('zero_duration_stops');

    const { targets } = collectZeroDurationTargets({ itineraryData: before, dayDiagnostics: first.dayDiagnostics });
    const { ok, plan } = applyZeroDurationRepair({ itineraryData: before, targets, durationUpdates: answerAll(targets, 90) });
    expect(ok).toBe(true);

    const after = evaluateStructuralArtifact({ itineraryData: plan, constraints });
    expect(after.ok).toBe(true);
    expect(plan.days.flatMap((d) => d.stops).every((s) => s.duration > 0)).toBe(true);
  });

  it('does not declare the itinerary accepted — it only supplies the integers', () => {
    const before = pairB();
    before.days[3].stops = [];
    const first = evaluateStructuralArtifact({ itineraryData: before, constraints: { dates: { durationDays: 4 } } });
    const { targets } = collectZeroDurationTargets({ itineraryData: before, dayDiagnostics: first.dayDiagnostics });
    const { ok, plan } = applyZeroDurationRepair({ itineraryData: before, targets, durationUpdates: answerAll(targets) });
    expect(ok).toBe(true);
    // The empty day survives the repair and is still caught downstream.
    const after = evaluateStructuralArtifact({ itineraryData: plan, constraints: { dates: { durationDays: 4 } } });
    expect(after.ok).toBe(false);
    expect(after.reasonCodes).toContain('empty_day');
  });
});

describe('the artifact is small enough for the cost claim to be true', () => {
  it('the repair schema cannot express a stop, a day, or any prose', () => {
    const props = ZERO_DURATION_REPAIR_TOOL.input_schema.properties.durationUpdates.items.properties;
    expect(Object.keys(props).sort()).toEqual(['durationMinutes', 'ref', 'stopId']);
    expect(ZERO_DURATION_REPAIR_TOOL.input_schema.additionalProperties).toBe(false);
    expect(ZERO_DURATION_REPAIR_TOOL.input_schema.properties.durationUpdates.items.additionalProperties).toBe(false);
  });

  it('a full repair artifact is a fraction of the itinerary it repairs', () => {
    const before = pairB();
    const { targets } = collectZeroDurationTargets({ itineraryData: before, dayDiagnostics: allZeroDiagnostics });
    const repairArtifact = JSON.stringify({ durationUpdates: answerAll(targets) });
    const fullRegeneration = JSON.stringify(before);
    expect(repairArtifact.length).toBeLessThan(fullRegeneration.length * 0.25);
  });

  it('names every target unambiguously in the instruction', () => {
    const { targets } = collectZeroDurationTargets({ itineraryData: pairB(), dayDiagnostics: allZeroDiagnostics });
    const text = buildZeroDurationRepairInstruction({ targets });
    for (const t of targets) expect(text).toContain(`ref ${t.ref} — Day ${t.dayNumber}: ${t.name}`);
    expect(text).toContain('Never emit duration 0');
    expect(buildZeroDurationRepairInstruction({ targets: [] })).toBe('');
  });
});
