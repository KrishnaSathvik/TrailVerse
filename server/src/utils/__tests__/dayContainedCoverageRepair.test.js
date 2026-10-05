'use strict';

/**
 * ADD-ONLY DAY-CONTAINED COVERAGE REPAIR.
 *
 * `insufficient_day_coverage` says a day has one experience that is not
 * substantial and nothing real beside it. There are two ways to clear it: add a
 * second real experience, or make the one you have say 90+ minutes. The second
 * requires changing nothing but an integer, and the model has taken that route
 * historically — twice — turning a stated 30-minute walk into a two-hour one.
 *
 * So this repair is STRICTLY STRONGER than the anchor repair: anchor repair may
 * legitimately replace a bad stop, coverage repair has no legitimate reason to
 * rewrite an existing recommendation at all. Existing stops are immutable, and
 * that is structural here, not prompt guidance.
 */

const {
  SUPPORTED_OPS,
  FORBIDDEN_OPS,
  COVERAGE_REPAIR_REASON_CODES: R,
  DAY_CONTAINED_COVERAGE_REPAIR_TOOL,
  resolveCoverageRepairScope,
  buildCoverageRepairInstruction,
  applyDayContainedCoverageRepair,
} = require('../dayContainedCoverageRepair');
const { frozenFingerprint } = require('../dayContainedAnchorRepair');
const { buildEvidenceBoundRepairCandidates } = require('../evidenceBoundRepairCandidates');
const { buildEvidenceBundle } = require('../evidenceBundle');

const stop = (name, type, duration, extra = {}) => ({
  name, type, duration, note: `${name} note`, why: `${name} why`, timeWindow: 'morning', ...extra,
});
/**
 * PHASE 4M — the model no longer authors the identity. It selects a `placeRef`
 * into the catalogue the frozen bundle defines; the machine resolves the name.
 *
 * PHASE 4O — nor the type, and these fixtures are shaped like what the NPS
 * producer ACTUALLY emits: a `category` bucket plus `activityTypes`. The
 * previous version wrote `category: 'place'` with no activity types, which the
 * canonical adapter cannot classify — exactly the live shape that made every 4N
 * operation unmergeable while this suite stayed green.
 */
const evidencePlace = (name, activityTypes, over = {}) => ({
  evidenceId: `ev:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  entityId: 'nps:park:zion', topic: 'activities', evidenceType: 'fact', privacyScope: 'public',
  claim: { identity: `place:${name}`, text: name,
    normalizedValue: { name, category: 'thingstodo', activityTypes, destinationId: 'nps:park:zion', ...over } },
});
const CATALOG_PLACES = [
  ['Emerald Pools', ['hiking', 'hike']],
  ['Court of the Patriarchs', ['viewpoint']],
  ['Canyon Overlook', ['viewpoint']],
  ['Watchman Trail', ['hiking', 'hike']],
  ['Zion Human History Museum', ['exhibits']],
];
const bundle = () => buildEvidenceBundle({
  requestId: 'req:4m-coverage',
  resolutions: [{ requirementId: 'r1', status: 'satisfied_fresh', evidenceIds: CATALOG_PLACES.map(([n]) => `ev:${n.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`) }],
  candidates: CATALOG_PLACES.map(([n, types]) => evidencePlace(n, types)),
});
const catalog = (over = {}) => buildEvidenceBoundRepairCandidates({
  bundle: bundle(), candidatePlan: plan(), repairScope: scopeOf(), requireExperiential: true, ...over,
});
const refFor = (name) => {
  const hit = catalog().candidates.find((c) => c.canonicalName === name);
  if (!hit) throw new Error(`no catalogue entry for ${name}`);
  return hit.ref;
};
// PHASE 4O — the `type` argument is retained for readability at the call sites
// and DELIBERATELY not put in the artifact: the catalogue states the type and
// the server supplies it. A model that sends one is refused.
const candidate = (name, _type, durationMinutes, extra = {}) => ({
  placeRef: refFor(name), durationMinutes, note: `${name} note`, why: `${name} why`, ...extra,
});
const plan = () => ({
  days: [
    { dayNumber: 1, title: 'One', stops: [stop('Angels Landing', 'hike', 240), stop('Zion Lodge lunch', 'meal', 60)] },
    { dayNumber: 2, title: 'Two', stops: [stop('Riverside Walk', 'hike', 45), stop('Shuttle to canyon', 'transit', 30)] },
    { dayNumber: 3, title: 'Three', stops: [stop('Pa\'rus Trail', 'hike', 40), stop('Parking', 'logistics', 15)] },
  ],
});
const diagnostics = [
  { dayNumber: 1, codes: [] },
  { dayNumber: 2, codes: ['insufficient_day_coverage'], coverageReasonCode: 'single_short_experience_supporting_only' },
  { dayNumber: 3, codes: ['insufficient_day_coverage'], coverageReasonCode: 'single_short_experience_alone' },
];
const scopeOf = (over = {}) => resolveCoverageRepairScope({
  itineraryData: plan(), dayDiagnostics: diagnostics, reasonCodes: ['insufficient_day_coverage'], ...over,
});
const repairs = (entries) => entries.map(([dayRef, ...ops]) => ({
  dayRef, operations: ops.map((o) => (o.op ? o : { op: 'add_stop', stop: o })),
}));

describe('the operation vocabulary is add_stop and nothing else', () => {
  test('exactly one supported operation', () => {
    expect([...SUPPORTED_OPS]).toEqual(['add_stop', 'deepen_stop', 'replace_support', 'remove_support']);
  });

  test('replace_stop is forbidden here even though anchor repair allows it', () => {
    expect([...FORBIDDEN_OPS]).toEqual(expect.arrayContaining([
      'replace_stop', 'remove_stop', 'reorder_stops', 'move_stop',
      'replace_day', 'add_day', 'remove_day',
    ]));
  });

  test('the tool schema cannot express anything but adding', () => {
    const ops = DAY_CONTAINED_COVERAGE_REPAIR_TOOL.input_schema
      .properties.dayRepairs.items.properties.operations.items;
    expect(ops.properties.op.enum).toEqual(['add_stop', 'deepen_stop', 'replace_support', 'remove_support']);
    // Nothing to point at: a stopRef only exists so a stop can be replaced.
    expect(ops.properties.stopRef.type).toBe('integer');
    expect(ops.additionalProperties).toBe(false);
  });

  test('the schema cannot express a model-authored place identity', () => {
    const stopSchema = DAY_CONTAINED_COVERAGE_REPAIR_TOOL.input_schema
      .properties.dayRepairs.items.properties.operations.items.properties.stop;
    expect(stopSchema.properties.name).toBeUndefined();
    expect(stopSchema.properties.placeRef).toBeDefined();
    expect(stopSchema.required).toContain('placeRef');
    expect(stopSchema.additionalProperties).toBe(false);
  });
});

describe('scope resolution', () => {
  test('resolves affected and frozen days from the validator diagnostics', () => {
    const s = scopeOf();
    expect(s.ok).toBe(true);
    expect(s.affectedDays.map((d) => d.dayRef)).toEqual([2, 3]);
    expect(s.frozenDayNumbers).toEqual([1]);
  });

  test('carries which thinness each day has, so the repair knows what it is fixing', () => {
    expect(scopeOf().affectedDays.map((d) => d.coverageReasonCode))
      .toEqual(['single_short_experience_supporting_only', 'single_short_experience_alone']);
  });

  /**
   * Derived from replay, NOT from the 5 and 9 stops the historical full-rewrite
   * repairs happened to add. One addition per day cleared F2 and B1 but did not
   * clear A1 day 2; two cleared every case the record can test.
   */
  test('the operation budget is two per affected day', () => {
    expect(scopeOf().maxOperationsPerDay).toBe(2);
  });

  test('declines without the reason code', () => {
    expect(scopeOf({ reasonCodes: ['missing_experience_anchor'] }))
      .toMatchObject({ ok: false, reasonCodes: [R.NO_SCOPE] });
  });

  test('declines whole-plan scope rather than spending on it', () => {
    const s = resolveCoverageRepairScope({
      itineraryData: plan(),
      reasonCodes: ['insufficient_day_coverage'],
      dayDiagnostics: [1, 2, 3].map((dayNumber) => ({ dayNumber, codes: ['insufficient_day_coverage'] })),
    });
    expect(s).toMatchObject({ ok: false, reasonCodes: [R.WHOLE_PLAN_SCOPE] });
  });

  test('declines a second attempt in the same turn', () => {
    expect(scopeOf({ coverageRepairUsed: true }))
      .toMatchObject({ ok: false, reasonCodes: [R.ALREADY_USED] });
  });

  test('refuses rather than guesses when day numbering is ambiguous', () => {
    const dup = { days: [{ dayNumber: 2, stops: [] }, { dayNumber: 2, stops: [] }] };
    expect(resolveCoverageRepairScope({
      itineraryData: dup, reasonCodes: ['insufficient_day_coverage'],
      dayDiagnostics: [{ dayNumber: 2, codes: ['insufficient_day_coverage'] }],
    })).toMatchObject({ ok: false, reasonCodes: [R.AMBIGUOUS_DIAGNOSTICS] });
  });

  test('refuses when a flagged day is not in the plan', () => {
    expect(scopeOf({ dayDiagnostics: [{ dayNumber: 9, codes: ['insufficient_day_coverage'] }] }))
      .toMatchObject({ ok: false, reasonCodes: [R.AMBIGUOUS_DIAGNOSTICS] });
  });
});

describe('a merge that is allowed', () => {
  test('adds one experience to each affected day', () => {
    const r = applyDayContainedCoverageRepair({
      itineraryData: plan(), scope: scopeOf(), candidates: catalog().candidates,
      dayRepairs: repairs([[2, candidate('Emerald Pools', 'hike', 90)], [3, candidate('Canyon Overlook', 'viewpoint', 75)]]),
    });
    expect(r).toMatchObject({ ok: true, applied: 2, reasonCodes: [] });
    expect(r.plan.days[1].stops.map((s) => s.name)).toEqual(['Riverside Walk', 'Shuttle to canyon', 'Emerald Pools']);
    expect(r.plan.days[2].stops.map((s) => s.name)).toEqual(["Pa'rus Trail", 'Parking', 'Canyon Overlook']);
  });

  test('rejects a second addition rather than padding the day', () => {
    const r = applyDayContainedCoverageRepair({
      itineraryData: plan(), scope: scopeOf(), candidates: catalog().candidates,
      dayRepairs: repairs([[2, candidate('Emerald Pools', 'hike', 90), candidate('Court of the Patriarchs', 'viewpoint', 30)]]),
    });
    expect(r.ok).toBe(false);
    expect(r.reasonCodes).toContain(R.OPERATION_BUDGET);
  });

  test('frozen days are byte-identical', () => {
    const before = plan();
    const r = applyDayContainedCoverageRepair({
      itineraryData: before, scope: scopeOf(), candidates: catalog().candidates,
      dayRepairs: repairs([[2, candidate('Emerald Pools', 'hike', 90)]]),
    });
    expect(frozenFingerprint(r.plan, [1])).toBe(frozenFingerprint(before, [1]));
  });

  test('every pre-existing stop is byte-identical, INCLUDING inside affected days', () => {
    const before = plan();
    const r = applyDayContainedCoverageRepair({
      itineraryData: before, scope: scopeOf(), candidates: catalog().candidates,
      dayRepairs: repairs([[2, candidate('Emerald Pools', 'hike', 90)], [3, candidate('Canyon Overlook', 'viewpoint', 75)]]),
    });
    for (const [i, day] of before.days.entries()) {
      for (const [k, original] of (day.stops || []).entries()) {
        expect(r.plan.days[i].stops[k]).toEqual(original);
      }
    }
  });

  test('day count and day-number sequence are unchanged', () => {
    const before = plan();
    const r = applyDayContainedCoverageRepair({
      itineraryData: before, scope: scopeOf(), candidates: catalog().candidates,
      dayRepairs: repairs([[2, candidate('Emerald Pools', 'hike', 90)]]),
    });
    expect(r.plan.days).toHaveLength(before.days.length);
    expect(r.plan.days.map((d) => d.dayNumber)).toEqual(before.days.map((d) => d.dayNumber));
  });

  test('new identities appear only in affected days', () => {
    const before = plan();
    const r = applyDayContainedCoverageRepair({
      itineraryData: before, scope: scopeOf(), candidates: catalog().candidates,
      dayRepairs: repairs([[2, candidate('Emerald Pools', 'hike', 90)]]),
    });
    const names = (p, i) => (p.days[i].stops || []).map((s) => s.name);
    expect(names(r.plan, 0)).toEqual(names(before, 0));
    expect(names(r.plan, 2)).toEqual(names(before, 2));
  });
});

describe('a merge that is refused', () => {
  const refuse = (dayRepairs) => applyDayContainedCoverageRepair({
    itineraryData: plan(), scope: scopeOf(), candidates: catalog().candidates, dayRepairs,
  });

  test.each([['replace_stop'], ['remove_stop'], ['reorder_stops'], ['move_stop'], ['replace_day'], ['add_day'], ['remove_day']])(
    '%s is refused', (op) => {
      expect(refuse([{ dayRef: 2, operations: [{ op, stopRef: 1, stop: candidate('Emerald Pools', 'hike', 90) }] }]))
        .toMatchObject({ ok: false, applied: 0, reasonCodes: [R.UNSUPPORTED_OP] });
    }
  );

  test('a frozen day may not be targeted', () => {
    expect(refuse(repairs([[1, candidate('Emerald Pools', 'hike', 90)]])))
      .toMatchObject({ ok: false, reasonCodes: [R.FROZEN_DAY_TARGETED] });
  });

  test('a day outside the plan may not be targeted', () => {
    expect(refuse(repairs([[9, candidate('Emerald Pools', 'hike', 90)]])))
      .toMatchObject({ ok: false, reasonCodes: [R.UNKNOWN_DAY_REF] });
  });

  test('the operation budget is enforced', () => {
    expect(refuse(repairs([[2,
      candidate('Emerald Pools', 'hike', 90), candidate('Court of the Patriarchs', 'viewpoint', 30),
      candidate('Watchman Trail', 'hike', 45)]])))
      .toMatchObject({ ok: false, reasonCodes: [R.OPERATION_BUDGET] });
  });

  test('a day may not be answered twice', () => {
    expect(refuse(repairs([[2, candidate('Emerald Pools', 'hike', 90)], [2, candidate('Canyon Overlook', 'viewpoint', 30)]])))
      .toMatchObject({ ok: false, reasonCodes: [R.DUPLICATE_TARGET] });
  });

  test.each([['id'], ['order'], ['latitude'], ['drivingTimeFromPreviousMin']])(
    'a server-owned field (%s) is refused', (field) => {
      expect(refuse(repairs([[2, candidate('Emerald Pools', 'hike', 90, { [field]: 1 })]])))
        .toMatchObject({ ok: false, reasonCodes: [R.SERVER_OWNED_FIELD] });
    }
  );

  test.each([
    ['no duration', { placeRef: 1, note: 'n', why: 'w' }],
    ['zero duration', { placeRef: 1, durationMinutes: 0, note: 'n', why: 'w' }],
    ['no note', { placeRef: 1, durationMinutes: 90, why: 'w' }],
    ['no why', { placeRef: 1, durationMinutes: 90, note: 'n' }],
  ])('a malformed stop (%s) is refused', (_label, stopObj) => {
    expect(refuse(repairs([[2, stopObj]]))).toMatchObject({ ok: false, reasonCodes: [R.MALFORMED_STOP] });
  });

  test('an unknown placeRef is an atomic refusal', () => {
    expect(refuse(repairs([[2, { placeRef: 999, durationMinutes: 90, note: 'n', why: 'w' }]])))
      .toMatchObject({ ok: false, applied: 0, reasonCodes: [R.UNKNOWN_PLACE_REF] });
  });

  test('a missing placeRef is an atomic refusal', () => {
    expect(refuse(repairs([[2, { durationMinutes: 90, note: 'n', why: 'w' }]])))
      .toMatchObject({ ok: false, applied: 0, reasonCodes: [R.UNKNOWN_PLACE_REF] });
  });

  test('with no catalogue the merge refuses rather than trusting the artifact', () => {
    expect(applyDayContainedCoverageRepair({
      itineraryData: plan(), scope: scopeOf(), candidates: [],
      dayRepairs: repairs([[2, { placeRef: 1, durationMinutes: 90, note: 'n', why: 'w' }]]),
    })).toMatchObject({ ok: false, reasonCodes: [R.EVIDENCE_CATALOG_UNAVAILABLE] });
  });

  test('a model-authored type is refused — Phase 4O made the server own it', () => {
    expect(refuse(repairs([[2, { placeRef: refFor('Emerald Pools'), type: 'hike', durationMinutes: 90, note: 'n', why: 'w' }]])))
      .toMatchObject({ ok: false, applied: 0, reasonCodes: [R.SERVER_OWNED_FIELD] });
  });

  test('the merged stop carries the CANONICAL type the catalogue states', () => {
    const r = applyDayContainedCoverageRepair({
      itineraryData: plan(), scope: scopeOf(), candidates: catalog().candidates,
      dayRepairs: repairs([[2, candidate('Court of the Patriarchs', 'ignored', 45)]]),
    });
    expect(r.ok).toBe(true);
    expect(r.plan.days[1].stops.at(-1)).toMatchObject({ name: 'Court of the Patriarchs', type: 'viewpoint' });
  });

  test('the merged stop carries the CANONICAL name, not anything the model wrote', () => {
    const r = applyDayContainedCoverageRepair({
      itineraryData: plan(), scope: scopeOf(), candidates: catalog().candidates,
      dayRepairs: repairs([[2, candidate('Emerald Pools', 'hike', 90)]]),
    });
    expect(r.ok).toBe(true);
    expect(r.plan.days[1].stops.at(-1).name).toBe('Emerald Pools');
  });

  test('an identity already in the plan cannot even be catalogued', () => {
    expect(catalog().candidates.map((c) => c.canonicalName)).not.toContain('Angels Landing');
  });

  test('selecting the same ref twice for one day is refused', () => {
    const ref = refFor('Emerald Pools');
    expect(refuse([{ dayRef: 2, operations: [
      { op: 'add_stop', stop: { placeRef: ref, durationMinutes: 90, note: 'n', why: 'w' } },
      { op: 'add_stop', stop: { placeRef: ref, durationMinutes: 60, note: 'n', why: 'w' } },
    ] }])).toMatchObject({ ok: false, reasonCodes: [R.OPERATION_BUDGET] });
  });

  test('the merge is atomic — one bad operation discards the whole repair', () => {
    const r = refuse(repairs([
      [2, candidate('Emerald Pools', 'hike', 90)],
      [1, candidate('Canyon Overlook', 'viewpoint', 75)],
    ]));
    expect(r).toMatchObject({ ok: false, applied: 0 });
    expect(r.plan).toBeNull();
  });
});

describe('the instruction told to the model', () => {
  const text = buildCoverageRepairInstruction({ scope: scopeOf() });

  test('names each thin day', () => {
    expect(text).toContain('dayRef 2');
    expect(text).toContain('dayRef 3');
  });

  test('states that existing stops cannot be changed', () => {
    expect(text).toMatch(/cannot (?:change|edit|modify)|may not (?:change|edit)|unchanged|immutable/i);
  });

  test('forbids the cheap route explicitly', () => {
    expect(text).toMatch(/duration/i);
  });

  test('is empty when there is no scope', () => {
    expect(buildCoverageRepairInstruction({ scope: { ok: false, affectedDays: [] } })).toBe('');
  });
});
