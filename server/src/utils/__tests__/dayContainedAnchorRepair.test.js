'use strict';

/**
 * PHASE 3B.2 — day-contained anchor repair. Criteria pre-registered before
 * implementation. The vocabulary is two operations because the entire
 * historical corpus used two: add_stop 6, replace_stop 2, everything else 0.
 */

const {
  resolveAnchorRepairScope,
  applyDayContainedAnchorRepair,
  buildAnchorRepairInstruction,
  DAY_CONTAINED_ANCHOR_REPAIR_TOOL,
  ANCHOR_REPAIR_REASON_CODES: REASON,
  SUPPORTED_OPS,
  FORBIDDEN_OPS,
  frozenFingerprint,
} = require('../dayContainedAnchorRepair');

const stop = (name, type, over = {}) => ({
  id: `id-${name}`, order: over.order ?? 1, type, name,
  note: `Note for ${name}.`, why: `Why ${name}.`, duration: 60,
  timeWindow: 'Morning', exposureLevel: 'low', difficulty: 'easy',
  parkCode: 'cany', ...over,
});

/** Day 2 has only logistics — the shape that raises the anchor defect. */
const plan = () => ({
  intro: 'Three unhurried days.',
  days: [
    { id: 'day-1', day: 1, dayNumber: 1, label: 'Arrival', stops: [stop('Grand View Point Trail', 'trail'), stop('Visitor Center', 'visitor_center', { order: 2 })] },
    { id: 'day-2', day: 2, dayNumber: 2, label: 'Needles', stops: [stop('The Needles Visitor Center', 'visitor_center'), stop('Needles picnic area', 'picnic', { order: 2 })] },
    { id: 'day-3', day: 3, dayNumber: 3, label: 'Island', stops: [stop('Mesa Arch', 'trail')] },
  ],
});
const DIAG = [{ dayIndex: 1, dayNumber: 2, codes: ['missing_experience_anchor'] }];

/**
 * PHASE 4M — the model selects an identity from the catalogue the frozen
 * EvidenceBundle defines; it cannot author one. These helpers therefore build a
 * real catalogue and refer to it by ref.
 */
const { buildEvidenceBoundRepairCandidates } = require('../evidenceBoundRepairCandidates');
const { buildEvidenceBundle } = require('../evidenceBundle');
/**
 * PHASE 4O — producer-shaped: a `category` bucket plus `activityTypes`, which is
 * what NPS actually emits. The old fixtures wrote `category: 'place'` with no
 * activity types, which the canonical adapter cannot classify — the live shape
 * that made every Phase 4N operation unmergeable while this suite was green.
 */
const CATALOG_PLACES = [
  ['Chesler Park Loop viewpoint', ['viewpoint']],
  ['Pothole Point Trail', ['hiking', 'hike']],
  ['Slickrock Foot Trail', ['hiking', 'hike']],
  ['The Maze district', ['hiking', 'hike']],
  // Catalogued but NOT an experience: only a permissive catalogue offers it, and
  // the merge must still refuse it as a day's anchor.
  ['Needles Visitor Center', ['visitor_center', 'orientation']],
];
const evId = (n) => `ev:${n.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
const BUNDLE = buildEvidenceBundle({
  requestId: 'req:anchor',
  resolutions: [{ requirementId: 'r1', status: 'satisfied_fresh', evidenceIds: CATALOG_PLACES.map(([n]) => evId(n)) }],
  candidates: CATALOG_PLACES.map(([n, activityTypes]) => ({
    evidenceId: evId(n), entityId: 'nps:park:cany', topic: 'activities',
    evidenceType: 'fact', privacyScope: 'public',
    claim: { identity: `place:${n}`, text: n,
      normalizedValue: { name: n, category: 'thingstodo', activityTypes, destinationId: 'nps:park:cany' } },
  })),
});
const catalogFor = (p = plan(), over = {}) => buildEvidenceBoundRepairCandidates({
  bundle: BUNDLE, candidatePlan: p, repairScope: { ok: true, affectedDays: [{ dayRef: 2 }] }, ...over,
}).candidates;
const CANDIDATES = catalogFor();
const PERMISSIVE_CANDIDATES = catalogFor(plan(), { requireExperiential: false });
const refOf = (n, cands = CANDIDATES) => (cands.find((c) => c.canonicalName === n) || {}).ref;
const newStop = (over = {}) => ({
  placeRef: refOf('Chesler Park Loop viewpoint'), durationMinutes: 150,
  timeWindow: 'Afternoon', note: 'An unhurried walk out to the viewpoint.',
  why: 'It gives the day a real experience rather than a stop-and-look.', ...over,
});
const scopeOf = (p = plan(), d = DIAG) => resolveAnchorRepairScope({ itineraryData: p, dayDiagnostics: d });
const addOn = (dayRef, over) => [{ dayRef, operations: [{ op: 'add_stop', stop: newStop(over) }] }];

describe('scope resolution is validator-owned and refuses ambiguity', () => {
  it('resolves affected and frozen days, with a one-operation budget', () => {
    const s = scopeOf();
    expect(s.ok).toBe(true);
    expect(s.affectedDays.map((d) => d.dayRef)).toEqual([2]);
    expect(s.frozenDayNumbers).toEqual([1, 3]);
    // The rule needs one experiential stop, so one operation clears it —
    // verified against all five successful historical repairs.
    expect(s.maxOperationsPerDay).toBe(1);
    expect(s.affectedDays[0].stops.map((x) => x.stopRef)).toEqual([1, 2]);
  });

  it('refuses when every day is affected — containment would freeze nothing', () => {
    const s = scopeOf(plan(), [1, 2, 3].map((n) => ({ dayNumber: n, codes: ['missing_experience_anchor'] })));
    expect(s.ok).toBe(false);
    expect(s.reasonCodes).toEqual([REASON.WHOLE_PLAN_SCOPE]);
  });

  it('refuses a diagnostic naming a day the plan does not contain', () => {
    expect(scopeOf(plan(), [{ dayNumber: 9, codes: ['missing_experience_anchor'] }]).reasonCodes)
      .toEqual([REASON.AMBIGUOUS_DIAGNOSTICS]);
  });

  it('refuses when two days share a number', () => {
    const p = plan(); p.days[2].day = 2; p.days[2].dayNumber = 2;
    expect(scopeOf(p).reasonCodes).toEqual([REASON.AMBIGUOUS_DIAGNOSTICS]);
  });

  it.each([[null], ['2'], [0], [2.5], [undefined]])('treats dayNumber %p as unusable', (bad) => {
    expect(scopeOf(plan(), [{ dayNumber: bad, codes: ['missing_experience_anchor'] }]).ok).toBe(false);
  });
});

describe('containment — frozen days are immutable', () => {
  it('adds one stop to the affected day and leaves every other day byte-identical', () => {
    const before = plan();
    const s = scopeOf(before);
    const r = applyDayContainedAnchorRepair({ candidates: CANDIDATES, itineraryData: before, scope: s, dayRepairs: addOn(2) });
    expect(r.ok).toBe(true);
    expect(frozenFingerprint(r.plan, [1, 3])).toBe(frozenFingerprint(before, [1, 3]));
    expect(r.plan.days).toHaveLength(3);
    expect(r.plan.days[1].stops.map((x) => x.name))
      .toEqual(['The Needles Visitor Center', 'Needles picnic area', 'Chesler Park Loop viewpoint']);
  });

  it('leaves untargeted surviving stops on the affected day untouched', () => {
    const before = plan();
    const r = applyDayContainedAnchorRepair({ candidates: CANDIDATES, itineraryData: before, scope: scopeOf(before), dayRepairs: addOn(2) });
    const survivors = r.plan.days[1].stops.filter((x) => x.name !== 'Chesler Park Loop viewpoint');
    survivors.forEach((s, i) => {
      const { order, ...rest } = s;
      const { order: _o, ...origRest } = before.days[1].stops[i];
      expect(rest).toEqual(origRest);
    });
  });

  /**
   * PHASE 4U — THIS TEST USED TO ASSERT A REPLACEMENT.
   * `replace_stop` is gone: every addressable anchor failure in the record is
   * cleared by one addition, so the only authority replacement still carried —
   * deleting something the traveler already has — was never necessary.
   */
  it('adds exactly one stop and leaves every existing one byte-identical', () => {
    const before = plan();
    const r = applyDayContainedAnchorRepair({
      candidates: CANDIDATES,
      itineraryData: before, scope: scopeOf(before),
      dayRepairs: addOn(2),
    });
    expect(r.ok).toBe(true);
    expect(r.plan.days[1].stops.map((x) => x.name))
      .toEqual(['The Needles Visitor Center', 'Needles picnic area', 'Chesler Park Loop viewpoint']);
    for (const [i, original] of before.days[1].stops.entries()) {
      const { order: _o, ...rest } = r.plan.days[1].stops[i];
      const { order: _o2, ...orig } = original;
      expect(rest).toEqual(orig);
    }
    expect(frozenFingerprint(r.plan, [1, 3])).toBe(frozenFingerprint(before, [1, 3]));
  });

  it('does not mutate the input plan', () => {
    const before = plan();
    const snap = JSON.stringify(before);
    applyDayContainedAnchorRepair({ candidates: CANDIDATES, itineraryData: before, scope: scopeOf(before), dayRepairs: addOn(2) });
    expect(JSON.stringify(before)).toBe(snap);
  });

  it('never lets a stop cross a day boundary or a day appear/disappear', () => {
    const before = plan();
    const r = applyDayContainedAnchorRepair({ candidates: CANDIDATES, itineraryData: before, scope: scopeOf(before), dayRepairs: addOn(2) });
    expect(r.plan.days.map((d) => d.day)).toEqual([1, 2, 3]);
    expect(r.plan.days[0].stops).toEqual(before.days[0].stops);
    expect(r.plan.days[2].stops).toEqual(before.days[2].stops);
  });
});

describe('the vocabulary is two operations and cannot be widened', () => {
  it('exposes add_stop and nothing else', () => {
    expect(SUPPORTED_OPS).toEqual(['add_stop']);
    const opEnum = DAY_CONTAINED_ANCHOR_REPAIR_TOOL.input_schema
      .properties.dayRepairs.items.properties.operations.items.properties.op.enum;
    expect(opEnum).toEqual(['add_stop']);
    // PHASE 4U — there is no way to point at an existing stop any more.
    const stopProperties = DAY_CONTAINED_ANCHOR_REPAIR_TOOL.input_schema
      .properties.dayRepairs.items.properties.operations.items.properties;
    expect(stopProperties.stopRef).toBeUndefined();
    expect(FORBIDDEN_OPS).toContain('replace_stop');
  });

  it.each(FORBIDDEN_OPS)('rejects %s explicitly', (op) => {
    const before = plan();
    const r = applyDayContainedAnchorRepair({
      candidates: CANDIDATES,
      itineraryData: before, scope: scopeOf(before),
      dayRepairs: [{ dayRef: 2, operations: [{ op, stopRef: 1, stop: newStop() }] }],
    });
    expect(r.ok).toBe(false);
    expect(r.reasonCodes).toEqual([REASON.UNSUPPORTED_OP]);
  });

  it('the schema cannot express a day operation or a frozen-day edit', () => {
    const item = DAY_CONTAINED_ANCHOR_REPAIR_TOOL.input_schema.properties.dayRepairs.items;
    expect(Object.keys(item.properties).sort()).toEqual(['dayRef', 'operations']);
    expect(item.additionalProperties).toBe(false);
    expect(DAY_CONTAINED_ANCHOR_REPAIR_TOOL.input_schema.additionalProperties).toBe(false);
  });
});

describe('atomicity — one bad operation rejects the whole repair', () => {
  const reject = (dayRepairs, code, p = plan()) => {
    const r = applyDayContainedAnchorRepair({ candidates: CANDIDATES, itineraryData: p, scope: scopeOf(p), dayRepairs });
    expect(r.ok).toBe(false);
    expect(r.reasonCodes).toEqual([code]);
    expect(r.plan).toBeNull();
  };

  it('rejects an unknown day ref', () => reject([{ dayRef: 99, operations: [{ op: 'add_stop', stop: newStop() }] }], REASON.UNKNOWN_DAY_REF));
  it('rejects a frozen day being targeted', () => reject([{ dayRef: 1, operations: [{ op: 'add_stop', stop: newStop() }] }], REASON.FROZEN_DAY_TARGETED));
  it('rejects replace_stop outright', () => reject([{ dayRef: 2, operations: [{ op: 'replace_stop', stopRef: 2, stop: newStop() }] }], REASON.UNSUPPORTED_OP));
  it('rejects an unknown afterStopRef', () => reject([{ dayRef: 2, operations: [{ op: 'add_stop', afterStopRef: 9, stop: newStop() }] }], REASON.UNKNOWN_STOP_REF));
  it('rejects the same day answered twice', () => reject([...addOn(2), ...addOn(2)], REASON.DUPLICATE_TARGET));
  it('rejects more operations than the budget allows', () => reject(
    [{ dayRef: 2, operations: [{ op: 'add_stop', stop: newStop() }, { op: 'add_stop', stop: newStop({ placeRef: refOf('Pothole Point Trail') }) }] }],
    REASON.OPERATION_BUDGET
  ));
  it('rejects an affected day left unanswered', () => {
    const p = plan();
    p.days[2].stops = [stop('Island Visitor Center', 'visitor_center')];
    const s = resolveAnchorRepairScope({
      itineraryData: p,
      dayDiagnostics: [{ dayNumber: 2, codes: ['missing_experience_anchor'] }, { dayNumber: 3, codes: ['missing_experience_anchor'] }],
    });
    const r = applyDayContainedAnchorRepair({ candidates: CANDIDATES, itineraryData: p, scope: s, dayRepairs: addOn(2) });
    expect(r.ok).toBe(false);
    expect(r.reasonCodes).toEqual([REASON.INCOMPLETE_COVERAGE]);
  });
  /**
   * PHASE 4M made this stronger than duplicate-identity. An identity already in
   * the plan is never catalogued, so the model cannot select it at all — the
   * refusal happens at the identity boundary, one step earlier.
   * `DUPLICATE_IDENTITY` remains as defence in depth.
   */
  it('cannot even select an identity the plan already holds', () => reject(
    [{ dayRef: 2, operations: [{ op: 'add_stop', stop: newStop({ placeRef: 99 }) }] }],
    REASON.UNKNOWN_PLACE_REF
  ));
  it('rejects add_stop carrying a stopRef', () => reject(
    [{ dayRef: 2, operations: [{ op: 'add_stop', stopRef: 1, stop: newStop() }] }], REASON.UNSUPPORTED_OP
  ));
});

describe('the proposed stop must be shaped for the normal pipeline', () => {
  const rejectStop = (over, code) => {
    const p = plan();
    const r = applyDayContainedAnchorRepair({ candidates: CANDIDATES, itineraryData: p, scope: scopeOf(p), dayRepairs: addOn(2, over) });
    expect(r.ok).toBe(false);
    expect(r.reasonCodes).toEqual([code]);
  };

  it.each([['id'], ['order'], ['parkCode'], ['parkName'], ['latitude'], ['longitude'], ['coordinateSource']])(
    'rejects a candidate authoring the server-owned field %s', (f) => rejectStop({ [f]: 'x' }, REASON.SERVER_OWNED_FIELD)
  );
  it.each([
    [{ durationMinutes: 0 }], [{ durationMinutes: '90' }],
    [{ durationMinutes: 1.5 }], [{ durationMinutes: true }], [{ note: '' }], [{ why: '  ' }],
  ])('rejects a malformed candidate %p', (over) => rejectStop(over, REASON.MALFORMED_STOP));

  // PHASE 4O — the type is catalogue metadata, exactly like the name.
  it('rejects a candidate authoring its own type', () => rejectStop({ type: 'viewpoint' }, REASON.SERVER_OWNED_FIELD));

  // PHASE 4M — authoring an identity is not "malformed", it is out of contract.
  it.each([
    [{ name: 'Invented Place' }], [{ name: '' }], [{ placeRef: 999 }], [{ placeRef: undefined }],
  ])('rejects a candidate that does not select a catalogued identity %p',
    (over) => rejectStop(over, REASON.UNKNOWN_PLACE_REF));

  // PHASE 4O — a non-experience is no longer OFFERED for an anchor repair, so
  // reaching this guard now takes a deliberately permissive catalogue.
  it('rejects a catalogued place that is not an experience', () => {
    const p = plan();
    const r = applyDayContainedAnchorRepair({
      candidates: PERMISSIVE_CANDIDATES,
      itineraryData: p, scope: scopeOf(p),
      dayRepairs: [{ dayRef: 2, operations: [{ op: 'add_stop', stop: {
        placeRef: refOf('Needles Visitor Center', PERMISSIVE_CANDIDATES),
        durationMinutes: 45, note: 'n', why: 'w',
      } }] }],
    });
    expect(r).toMatchObject({ ok: false, applied: 0, reasonCodes: [REASON.NOT_EXPERIENTIAL] });
  });

  it('rejects a day still lacking an experience after the operation', () => {
    const p = plan();
    const r = applyDayContainedAnchorRepair({
      candidates: PERMISSIVE_CANDIDATES,
      itineraryData: p, scope: scopeOf(p),
      dayRepairs: [{ dayRef: 2, operations: [{ op: 'replace_stop', stopRef: 1, stop: {
        placeRef: refOf('Needles Visitor Center', PERMISSIVE_CANDIDATES),
        durationMinutes: 45, note: 'n', why: 'w',
      } }] }],
    });
    expect(r.ok).toBe(false);
  });
});

describe('containment is not safety', () => {
  it('accepts a perfectly contained repair that later validation must still judge', () => {
    // The 2026-08-24 Canyonlands repair put "The Maze district" — dirt road,
    // permits, no services — into a relaxed easy-walks trip, entirely inside the
    // day that legitimately needed repair. This merge allows it. TRAVELER FIT
    // rejects it, afterwards, over the merged plan. Containment governs WHERE a
    // repair may write; it never claims the result is good.
    const before = plan();
    const r = applyDayContainedAnchorRepair({
      candidates: CANDIDATES,
      itineraryData: before, scope: scopeOf(before),
      // The Maze IS in the frozen catalogue, so selecting it is legitimate here.
      // Containment says the merge was clean; whether a traveler should be sent
      // there is the validators' question, not this module's.
      dayRepairs: addOn(2, { placeRef: refOf('The Maze district'), durationMinutes: 240 }),
    });
    expect(r.ok).toBe(true);
    expect(r.plan.days[1].stops.map((s) => s.name)).toContain('The Maze district');
  });
});

describe('the instruction names every target and forbids the rest', () => {
  it('lists day refs and stop refs, and says the rest is preserved', () => {
    const text = buildAnchorRepairInstruction({ scope: scopeOf() });
    expect(text).toContain('dayRef 2');
    expect(text).toContain('stopRef 1 — The Needles Visitor Center');
    expect(text).toContain('exactly ONE addition');
    expect(text).toContain('you may only add');
    expect(text).toContain('preserved by the system');
    expect(buildAnchorRepairInstruction({ scope: { affectedDays: [] } })).toBe('');
  });
});

/**
 * PHASE 4M — the identity boundary, applied here too.
 *
 * Phase 4L found a property of repair-introduced IDENTITIES, not of coverage
 * repair. Anchor `add_stop` and the replacement half of `replace_stop` can both
 * name a place the frozen bundle never enumerated, which is the state where
 * `factsForStop` returns [] and the fit layer reads `compatible`. So the new
 * identity must come from the same evidence-owned catalogue, whichever operation
 * introduces it. `replace_stop` stays legitimate here — only the identity is
 * constrained.
 */
describe('PHASE 4M — a new identity must come from the frozen catalogue', () => {
  const {
    buildEvidenceBoundRepairCandidates,
  } = require('../evidenceBoundRepairCandidates');
  const { buildEvidenceBundle } = require('../evidenceBundle');

  const PLACES = [
    ['Grand View Point Trail', ['hiking', 'hike']],
    ['Mesa Arch Trail', ['hiking', 'hike']],
    ['Murphy Point', ['viewpoint']],
  ];
  const evId = (n) => `ev:${n.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const bundle = buildEvidenceBundle({
    requestId: 'req:4m-anchor',
    resolutions: [{ requirementId: 'r1', status: 'satisfied_fresh', evidenceIds: PLACES.map(([n]) => evId(n)) }],
    candidates: PLACES.map(([n, activityTypes]) => ({
      evidenceId: evId(n), entityId: 'nps:park:cany', topic: 'activities',
      evidenceType: 'fact', privacyScope: 'public',
      claim: { identity: `place:${n}`, text: n,
        normalizedValue: { name: n, category: 'thingstodo', activityTypes, destinationId: 'nps:park:cany' } },
    })),
  });

  const thinPlan = {
    days: [
      { day: 1, stops: [{ name: 'Island in the Sky Visitor Center', type: 'visitor_center', duration: 45 }] },
      { day: 2, stops: [{ name: 'Shafer Canyon Overlook', type: 'viewpoint', duration: 60 }] },
    ],
  };
  const scope = resolveAnchorRepairScope({
    itineraryData: thinPlan,
    dayDiagnostics: [{ dayNumber: 1, codes: ['missing_experience_anchor'] }],
  });
  const candidates = buildEvidenceBoundRepairCandidates({
    bundle, candidatePlan: thinPlan, repairScope: scope,
  }).candidates;
  const refOf = (n) => candidates.find((c) => c.canonicalName === n).ref;
  const stopFor = (n, over = {}) => ({
    placeRef: refOf(n), durationMinutes: 120,
    note: 'An unhurried walk.', why: 'A real experience for the day.', ...over,
  });
  const apply = (dayRepairs, over = {}) => applyDayContainedAnchorRepair({
    itineraryData: thinPlan, scope, candidates, dayRepairs, ...over,
  });

  test('add_stop resolves the canonical name from the catalogue', () => {
    const r = apply([{ dayRef: 1, operations: [{ op: 'add_stop', stop: stopFor('Murphy Point') }] }]);
    expect(r.ok).toBe(true);
    expect(r.plan.days[0].stops.map((s) => s.name)).toContain('Murphy Point');
  });

  test('replace_stop is no longer part of the contract at all', () => {
    const r = apply([{ dayRef: 1, operations: [{ op: 'replace_stop', stopRef: 1, stop: stopFor('Grand View Point Trail') }] }]);
    expect(r).toMatchObject({ ok: false, applied: 0, reasonCodes: [REASON.UNSUPPORTED_OP] });
    // The catalogued identity is still perfectly addable.
    const added = apply([{ dayRef: 1, operations: [{ op: 'add_stop', stop: stopFor('Grand View Point Trail') }] }]);
    expect(added.ok).toBe(true);
    expect(added.plan.days[0].stops.map((s) => s.name))
      .toEqual(['Island in the Sky Visitor Center', 'Grand View Point Trail']);
  });

  test('a model-authored name is unrepresentable', () => {
    const r = apply([{ dayRef: 1, operations: [{ op: 'add_stop', stop: { name: 'Invented Rim Loop', durationMinutes: 120, note: 'n', why: 'w' } }] }]);
    expect(r).toMatchObject({ ok: false, applied: 0, reasonCodes: [REASON.UNKNOWN_PLACE_REF] });
  });

  test('an unknown placeRef is an atomic refusal', () => {
    const r = apply([{ dayRef: 1, operations: [{ op: 'add_stop', stop: stopFor('Murphy Point', { placeRef: 999 }) }] }]);
    expect(r).toMatchObject({ ok: false, applied: 0, reasonCodes: [REASON.UNKNOWN_PLACE_REF] });
  });

  test('with no catalogue the merge refuses', () => {
    const r = apply([{ dayRef: 1, operations: [{ op: 'add_stop', stop: stopFor('Murphy Point') }] }], { candidates: [] });
    expect(r).toMatchObject({ ok: false, reasonCodes: [REASON.EVIDENCE_CATALOG_UNAVAILABLE] });
  });

  test('the tool schema has no place for a model-authored name', () => {
    const stopSchema = DAY_CONTAINED_ANCHOR_REPAIR_TOOL.input_schema
      .properties.dayRepairs.items.properties.operations.items.properties.stop;
    expect(stopSchema.properties.name).toBeUndefined();
    expect(stopSchema.properties.placeRef).toBeDefined();
    expect(stopSchema.required).toContain('placeRef');
  });

  test('an identity already on the day is still refused', () => {
    const withPlace = {
      days: [
        { day: 1, stops: [{ name: 'Murphy Point', type: 'viewpoint', duration: 30 }] },
        { day: 2, stops: [{ name: 'Shafer Canyon Overlook', type: 'viewpoint', duration: 60 }] },
      ],
    };
    const sc = resolveAnchorRepairScope({
      itineraryData: withPlace,
      dayDiagnostics: [{ dayNumber: 1, codes: ['missing_experience_anchor'] }],
    });
    // The catalogue excludes it, so the ref cannot even be offered.
    const cands = buildEvidenceBoundRepairCandidates({ bundle, candidatePlan: withPlace, repairScope: sc }).candidates;
    expect(cands.map((c) => c.canonicalName)).not.toContain('Murphy Point');
  });
});
