'use strict';

/**
 * PHASE 3B.2 — DAY-CONTAINED ANCHOR REPAIR (machine-owned merge).
 *
 * `missing_experience_anchor` fires when a day contains no experiential stop.
 * The historical answer was a full regeneration: across 5 successful repairs the
 * model made 61 stop-set mutations to keep 7 stops, and 57.3% of everything it
 * changed was outside the day that actually failed. Three of five rewrote Day 1
 * when the anchor was missing somewhere else entirely — the mechanism behind the
 * provisional-reveal instability.
 *
 * THE INVARIANT IS CONTAINMENT, NOT PRESERVATION.
 * Phase 1 could demand "everything except duration is identical" because its
 * surface was one integer. Here stop identity legitimately changes, so the
 * guarantee moves up a level:
 *
 *     frozen days are byte-identical
 *     inside an affected day, only the targeted stop may change
 *     no stop crosses a day boundary
 *
 * CONTAINMENT IS NOT SAFETY.
 * A perfectly contained repair can still be terrible. The 2026-08-24 Canyonlands
 * repair put "The Maze district" — dirt road, permits, no services — into a
 * relaxed easy-walks trip, entirely INSIDE the day that legitimately needed
 * repair. This module would have allowed it. `evaluateTravelerFit`,
 * completeness and the evidence contract are what reject it, and they still run
 * over the merged plan afterwards. Nothing here declares a plan valid.
 *
 * VOCABULARY IS DELIBERATELY ONE OPERATION (see PHASE 4U below).
 * Across the entire historical corpus: add_stop 6, replace_stop 2,
 * remove_stop 0, reorder_stops 0, day add/remove/reorder 0, cross-day moves 0.
 * 4U then showed the 2 replacements were not required by the obligation either,
 * so the vocabulary is now `add_stop` alone. The model is given no mutation
 * authority that an observed repair required.
 */

const { classifyStop } = require('./itineraryCompleteness');
const {
  REPAIR_CANDIDATE_REASON_CODES,
  resolveCandidateRef,
} = require('./evidenceBoundRepairCandidates');

/**
 * PHASE 4U — ADD-ONLY.
 *
 * `replace_stop` was inherited from what historical repairs happened to do, not
 * from anything the obligation requires. `missing_experience_anchor` fires on the
 * ABSENCE of an experiential stop; deleting a stop cannot reduce an absence, and
 * since Phase 4M a replacement identity is catalogue-bound and server-typed
 * exactly like an addition — so the only authority replacement still carried was
 * the power to delete something the traveler already had.
 *
 * Phase 4U replayed every addressable anchor failure in the record — 12 of them,
 * plus the Canyonlands A1 case through a real frozen bundle and the real merge —
 * with one addition per affected day and nothing else. All 12 cleared the
 * obligation; none required a deletion; none introduced a new reason code.
 *
 * So anchor repair now has the property coverage repair already had:
 *
 *     EVERY PRE-EXISTING STOP IS IMMUTABLE.
 */
const SUPPORTED_OPS = Object.freeze(['add_stop']);

/** Named so a rejection says WHICH forbidden thing was attempted. */
const FORBIDDEN_OPS = Object.freeze([
  'replace_stop', 'remove_stop', 'reorder_stops', 'replace_day', 'add_day', 'remove_day', 'move_stop',
]);

/** Fields the server derives. A repair candidate may never author them. */
const SERVER_OWNED_STOP_FIELDS = Object.freeze([
  'id', 'order', 'parkCode', 'parkName', 'latitude', 'longitude',
  'coordinateSource', 'drivingTimeFromPreviousMin',
]);

const MAX_STOP_DURATION_MINUTES = 720;

const REASON = Object.freeze({
  NO_SCOPE: 'anchor_repair_no_scope',
  WHOLE_PLAN_SCOPE: 'anchor_repair_whole_plan_scope',
  AMBIGUOUS_DIAGNOSTICS: 'anchor_repair_ambiguous_diagnostics',
  UNKNOWN_DAY_REF: 'anchor_repair_unknown_day_ref',
  FROZEN_DAY_TARGETED: 'anchor_repair_frozen_day_targeted',
  UNKNOWN_STOP_REF: 'anchor_repair_unknown_stop_ref',
  DUPLICATE_TARGET: 'anchor_repair_duplicate_target',
  UNSUPPORTED_OP: 'anchor_repair_unsupported_op',
  OPERATION_BUDGET: 'anchor_repair_operation_budget',
  INCOMPLETE_COVERAGE: 'anchor_repair_incomplete_coverage',
  MALFORMED_STOP: 'anchor_repair_malformed_stop',
  SERVER_OWNED_FIELD: 'anchor_repair_server_owned_field',
  DUPLICATE_IDENTITY: 'anchor_repair_duplicate_identity',
  NOT_EXPERIENTIAL: 'anchor_repair_stop_not_experiential',
  CONTAINMENT_VIOLATION: 'anchor_repair_containment_violation',
  // PHASE 4M — the identity boundary. A new identity must come from the
  // catalogue the frozen bundle defines. (Pre-4U this also covered the
  // replacement half of `replace_stop`; `add_stop` is now the only way in.)
  UNKNOWN_PLACE_REF: 'anchor_repair_unknown_place_ref',
  EVIDENCE_CATALOG_UNAVAILABLE: REPAIR_CANDIDATE_REASON_CODES.EVIDENCE_CATALOG_UNAVAILABLE,
});

const dayNumberOf = (day, index) => (Number.isFinite(Number(day?.day ?? day?.dayNumber))
  ? Number(day.day ?? day.dayNumber)
  : index + 1);

const nameKey = (s) => String(s || '').trim().toLowerCase();

/** The obligation this repair exists to satisfy: a day needs one of these. */
function isExperientialStop(stop) {
  const c = classifyStop(stop);
  return c !== 'logistics_meta' && c !== 'rest_meal';
}

/** Frozen-day fingerprint — the containment proof. */
function frozenFingerprint(plan, frozenDayNumbers) {
  return JSON.stringify((Array.isArray(plan?.days) ? plan.days : [])
    .map((d, i) => [dayNumberOf(d, i), d])
    .filter(([n]) => frozenDayNumbers.includes(n)));
}

/**
 * Resolve what this repair is allowed to touch, from the validator's own
 * diagnostics. Refuses rather than guesses.
 *
 * OPERATION BUDGET. `missing_experience_anchor` is raised when a day has zero
 * experiential stops, so ONE experiential stop clears it — verified against all
 * five successful historical repairs. The budget is therefore exactly one
 * operation per affected day, derived from the obligation rather than invented,
 * which is what stops a two-day anchor failure returning six new activities.
 */
function resolveAnchorRepairScope({ itineraryData = null, dayDiagnostics = [] } = {}) {
  const refuse = (code) => ({ ok: false, reasonCodes: [code], affectedDays: [], frozenDayNumbers: [] });
  const days = Array.isArray(itineraryData?.days) ? itineraryData.days : [];
  if (!days.length) return refuse(REASON.NO_SCOPE);

  const numbers = days.map((d, i) => dayNumberOf(d, i));
  if (new Set(numbers).size !== numbers.length) return refuse(REASON.AMBIGUOUS_DIAGNOSTICS);

  const flagged = [...new Set((Array.isArray(dayDiagnostics) ? dayDiagnostics : [])
    .filter((d) => (d?.codes || []).includes('missing_experience_anchor'))
    .map((d) => d?.dayNumber)
    .filter((n) => typeof n === 'number' && Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  if (!flagged.length) return refuse(REASON.NO_SCOPE);
  for (const n of flagged) if (!numbers.includes(n)) return refuse(REASON.AMBIGUOUS_DIAGNOSTICS);

  // Containment buys nothing when there is nothing left to freeze.
  if (flagged.length >= numbers.length) return refuse(REASON.WHOLE_PLAN_SCOPE);

  const affectedDays = flagged.map((n) => {
    const day = days[numbers.indexOf(n)];
    return {
      dayRef: n,
      stops: (Array.isArray(day.stops) ? day.stops : []).map((s, i) => ({
        stopRef: i + 1, name: String(s?.name || '').trim(), type: s?.type || null,
      })),
    };
  });
  return {
    ok: true,
    reasonCodes: [],
    affectedDays,
    frozenDayNumbers: numbers.filter((n) => !flagged.includes(n)),
    maxOperationsPerDay: 1,
  };
}

/** The repair artifact. One operation, and no way to express another. */
const DAY_CONTAINED_ANCHOR_REPAIR_TOOL = Object.freeze({
  name: 'repair_day_experience_anchor',
  // PHASE 4U closed `replace_stop` out of SUPPORTED_OPS and removed `stopRef`
  // from the schema, but this description still offered replacement — the one
  // thing the contract can no longer do. Gate 6 found it: schema-safe (the enum
  // forces `add_stop`) yet it is the first sentence the model reads, so it now
  // states the current authority and nothing else.
  description:
    'Add one experiential stop — a hike, walk, viewpoint, scenic drive, tour or similar — to each affected day. '
    + 'Do not modify, replace, remove, reorder, or move existing stops. Days that are not listed are '
    + 'already accepted and cannot be changed: the system preserves them regardless of what you return.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['dayRepairs'],
    properties: {
      dayRepairs: {
        type: 'array',
        description: 'Exactly one entry per listed day, each with exactly one operation.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['dayRef', 'operations'],
          properties: {
            dayRef: { type: 'integer', description: 'The day reference given in the list.' },
            operations: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['op', 'stop'],
                properties: {
                  op: { type: 'string', enum: [...SUPPORTED_OPS] },
                  // PHASE 4U — no `stopRef`. There is no operation that targets an
                  // existing stop, so there is nothing to point at.
                  afterStopRef: { type: 'integer', description: 'Insert after this stop; omit for the start of the day.' },
                  stop: {
                    type: 'object',
                    additionalProperties: false,
                    // PHASE 4M — no `name`. The model SELECTS an identity from the
                    // list of allowed places; it cannot author one.
                    // PHASE 4O — and no `type`: the catalogue states the kind of
                    // place each ref is, and the server supplies it.
                    required: ['placeRef', 'durationMinutes', 'note', 'why'],
                    properties: {
                      placeRef: { type: 'integer', description: 'The ref of a place from the list of allowed places.' },
                      durationMinutes: { type: 'integer' },
                      timeWindow: { type: 'string' },
                      note: {
                        type: 'string',
                        description: 'Traveler-facing: what to do at this place, or one concrete thing to '
                          + 'know before going. Plain trip language only — never mention repairs, the plan, '
                          + 'other stops, or why this was added.',
                      },
                      why: {
                        type: 'string',
                        description: 'Traveler-facing: why this place suits this traveler and this day. '
                          + 'Plain trip language only — never mention repairs, coverage, obligations, '
                          + 'existing stops, or how it was selected.',
                      },
                      difficulty: { type: 'string' },
                      exposureLevel: { type: 'string' },
                      walkingDistanceMiles: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});

function buildAnchorRepairInstruction({ scope, candidates = [] } = {}) {
  const days = scope?.affectedDays || [];
  if (!days.length) return '';
  const lines = days.map((d) => {
    const stops = d.stops.length
      ? d.stops.map((s) => `      stopRef ${s.stopRef} — ${s.name}${s.type ? ` (${s.type})` : ''}`).join('\n')
      : '      (no stops)';
    return `  dayRef ${d.dayRef} currently has no real experience:\n${stops}`;
  });
  return [
    `These ${days.length} day(s) need one genuine experience each:`,
    ...lines,
    '',
    'For each listed day return exactly ONE addition: a genuine experience for that day. '
    + 'A visitor center, parking, a meal or a rest stop does not count as the experience. '
    + 'Everything already on the day stays exactly as it is — you may only add.',
    '',
    'Change nothing else — you cannot: every other day and every stop you did not target is '
    + 'preserved by the system, and any other edit causes the whole repair to be discarded.',
    '',
    'The note and why you write for the new stop are shown directly to the traveler, mid-conversation, '
    + 'as an ordinary part of their plan. Write them exactly as you would for any other stop: what to do '
    + 'there, and why it fits this trip. Do not mention that anything was added, replaced, repaired, or '
    + 'missing, and do not use the words above (day, obligation, coverage, existing stop) — those are '
    + 'for you, not for the traveler.',
    '',
    // PHASE 4M — the recommendation boundary, identical to the coverage repair's.
    'Choose from these places only, by placeRef. There is no way to name a place that is not listed:',
    ...candidates.map((c) => `  placeRef ${c.ref} — ${c.canonicalName}${c.canonicalType ? ` (${c.canonicalType})` : ''}`),
  ].join('\n');
}

/**
 * MACHINE-OWNED CONTAINED MERGE.
 *
 * Atomic: one invalid operation rejects the entire repair. Operations interact
 * structurally, so a partial application would leave a plan nobody designed.
 */
function applyDayContainedAnchorRepair({
  itineraryData = null, scope = null, dayRepairs = null, candidates = null,
} = {}) {
  const fail = (code, rejected = []) => ({ ok: false, plan: null, reasonCodes: [code], applied: 0, rejected });
  if (!Array.isArray(itineraryData?.days) || !itineraryData.days.length) return fail(REASON.NO_SCOPE);
  if (!scope?.ok || !Array.isArray(scope.affectedDays) || !scope.affectedDays.length) return fail(REASON.NO_SCOPE);
  // No catalogue means no identity the frozen bundle vouches for.
  if (!Array.isArray(candidates) || candidates.length === 0) return fail(REASON.EVIDENCE_CATALOG_UNAVAILABLE);
  if (!Array.isArray(dayRepairs)) return fail(REASON.INCOMPLETE_COVERAGE);

  const allowedDays = new Map(scope.affectedDays.map((d) => [d.dayRef, d]));
  const budget = Number.isInteger(scope.maxOperationsPerDay) ? scope.maxOperationsPerDay : 1;
  const seenDays = new Set();
  const plan = { ...itineraryData, days: [...itineraryData.days] };
  const numbers = itineraryData.days.map((d, i) => dayNumberOf(d, i));
  let applied = 0;

  for (const repair of dayRepairs) {
    const dayRef = repair?.dayRef;
    if (typeof dayRef !== 'number' || !Number.isInteger(dayRef)) return fail(REASON.UNKNOWN_DAY_REF);
    if (!allowedDays.has(dayRef)) {
      return fail(numbers.includes(dayRef) ? REASON.FROZEN_DAY_TARGETED : REASON.UNKNOWN_DAY_REF,
        [{ dayRef, why: 'day is not inside the resolved repair scope' }]);
    }
    if (seenDays.has(dayRef)) return fail(REASON.DUPLICATE_TARGET, [{ dayRef, why: 'day answered more than once' }]);
    seenDays.add(dayRef);

    const operations = Array.isArray(repair?.operations) ? repair.operations : null;
    if (!operations || operations.length === 0) return fail(REASON.INCOMPLETE_COVERAGE, [{ dayRef, why: 'no operation supplied' }]);
    if (operations.length > budget) {
      return fail(REASON.OPERATION_BUDGET, [{ dayRef, why: `at most ${budget} operation(s) per day` }]);
    }

    const dayIndex = numbers.indexOf(dayRef);
    const day = plan.days[dayIndex];
    const original = Array.isArray(day.stops) ? day.stops : [];
    let working = original.map((s, i) => ({ stopRef: i + 1, stop: s, targeted: false }));

    for (const op of operations) {
      const name = op?.op;
      if (FORBIDDEN_OPS.includes(name)) return fail(REASON.UNSUPPORTED_OP, [{ dayRef, why: `${name} is not part of this contract` }]);
      if (!SUPPORTED_OPS.includes(name)) return fail(REASON.UNSUPPORTED_OP, [{ dayRef, why: `unknown op ${String(name)}` }]);

      const candidate = op?.stop;
      const shaped = validateCandidateStop(candidate, candidates);
      if (!shaped.ok) return fail(shaped.code, [{ dayRef, why: shaped.why }]);

      const existingNames = working.map((r) => nameKey(r.stop?.name));
      // PHASE 4U — the only operation. Every pre-existing entry in `working` is
      // carried by reference, so "existing stops are immutable" is a property of
      // the merge rather than something it checks afterwards.
      if (op?.stopRef !== undefined) return fail(REASON.UNSUPPORTED_OP, [{ dayRef, why: 'this repair may not target an existing stop' }]);
      if (existingNames.includes(nameKey(shaped.stop.name))) return fail(REASON.DUPLICATE_IDENTITY, [{ dayRef, why: 'added stop reuses an existing identity' }]);
      let at = working.length - 1;
      if (op?.afterStopRef !== undefined && op.afterStopRef !== null) {
        at = working.findIndex((r) => r.stopRef === op.afterStopRef);
        if (at === -1) return fail(REASON.UNKNOWN_STOP_REF, [{ dayRef, why: `afterStopRef ${String(op.afterStopRef)} not on this day` }]);
      }
      working.splice(at + 1, 0, { stopRef: null, stop: shaped.stop, targeted: true });
      applied += 1;
    }

    // The obligation must actually be satisfiable by what was returned.
    if (!working.some((r) => isExperientialStop(r.stop))) {
      return fail(REASON.NOT_EXPERIENTIAL, [{ dayRef, why: 'day still has no experiential stop' }]);
    }
    plan.days = plan.days.map((d, i) => (i === dayIndex
      ? { ...d, stops: working.map((r, i2) => ({ ...r.stop, order: i2 + 1 })) }
      : d));
  }

  // Every affected day must be answered: a half-repaired plan fails the same
  // validator on the next pass, having spent an attempt to get there.
  const unanswered = scope.affectedDays.filter((d) => !seenDays.has(d.dayRef));
  if (unanswered.length) {
    return fail(REASON.INCOMPLETE_COVERAGE, unanswered.map((d) => ({ dayRef: d.dayRef, why: 'day not answered' })));
  }

  // CONTAINMENT PROVED, NOT ASSUMED.
  if (frozenFingerprint(plan, scope.frozenDayNumbers) !== frozenFingerprint(itineraryData, scope.frozenDayNumbers)) {
    return fail(REASON.CONTAINMENT_VIOLATION);
  }
  const before = itineraryData.days.length;
  if (plan.days.length !== before) return fail(REASON.CONTAINMENT_VIOLATION);
  if (plan.days.map((d, i) => dayNumberOf(d, i)).join(',') !== numbers.join(',')) {
    return fail(REASON.CONTAINMENT_VIOLATION);
  }
  return { ok: true, plan, reasonCodes: [], applied, rejected: [] };
}

function validateCandidateStop(stop, candidates) {
  if (!stop || typeof stop !== 'object' || Array.isArray(stop)) {
    return { ok: false, code: REASON.MALFORMED_STOP, why: 'stop is not an object' };
  }
  for (const f of SERVER_OWNED_STOP_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(stop, f)) {
      return { ok: false, code: REASON.SERVER_OWNED_FIELD, why: `${f} is derived by the server` };
    }
  }
  // PHASE 4M — there is nowhere to put a model-authored identity. The name comes
  // from the evidence record the ref points at.
  if (Object.prototype.hasOwnProperty.call(stop, 'name')) {
    return { ok: false, code: REASON.UNKNOWN_PLACE_REF, why: 'a repair may not author a place name' };
  }
  // PHASE 4O — nor a type: identity and kind are both catalogue metadata, and a
  // merge that depends on the model echoing them back is the 4N failure.
  if (Object.prototype.hasOwnProperty.call(stop, 'type')) {
    return { ok: false, code: REASON.SERVER_OWNED_FIELD, why: 'type is resolved from the catalogue, not authored' };
  }
  const selected = resolveCandidateRef(candidates, stop.placeRef);
  if (!selected) {
    return { ok: false, code: REASON.UNKNOWN_PLACE_REF, why: `placeRef ${JSON.stringify(stop.placeRef)} is not in the allowed set` };
  }
  const name = selected.canonicalName;
  const type = selected.canonicalType;
  if (!type) return { ok: false, code: REASON.MALFORMED_STOP, why: 'catalogue states no type for this place' };
  const minutes = stop.durationMinutes;
  if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes <= 0 || minutes > MAX_STOP_DURATION_MINUTES) {
    return { ok: false, code: REASON.MALFORMED_STOP, why: 'durationMinutes must be a positive integer' };
  }
  for (const f of ['note', 'why']) {
    if (typeof stop[f] !== 'string' || !stop[f].trim()) {
      return { ok: false, code: REASON.MALFORMED_STOP, why: `${f} is required` };
    }
  }
  const shaped = {
    name, type, duration: minutes, note: stop.note, why: stop.why,
    // PHASE 4T — the catalogue's entity identity travels with the stop, so the
    // downstream fact binding is an identifier comparison rather than a name
    // match. placeRef -> candidate -> NPS entity -> merged stop -> factsForStop.
    ...(selected.entityId ? { evidenceEntityId: selected.entityId } : {}),
    timeWindow: typeof stop.timeWindow === 'string' ? stop.timeWindow : '',
    startTime: '',
    difficulty: typeof stop.difficulty === 'string' ? stop.difficulty : null,
    exposureLevel: typeof stop.exposureLevel === 'string' ? stop.exposureLevel : null,
    walkingDistanceMiles: typeof stop.walkingDistanceMiles === 'number' ? stop.walkingDistanceMiles : null,
    alternatives: [],
  };
  if (selected.accessEligibility) {
    const access = require('./hardConstraintEligibility').evaluateHardAccessEligibility(shaped, selected.accessEligibility);
    if (access.reasonCodes.length) return { ok: false, code: access.reasonCodes[0], why: 'repair violates hard access eligibility' };
  }
  if (!isExperientialStop(shaped)) {
    return { ok: false, code: REASON.NOT_EXPERIENTIAL, why: `${name} is not an experience` };
  }
  return { ok: true, stop: shaped };
}

module.exports = {
  SUPPORTED_OPS,
  FORBIDDEN_OPS,
  SERVER_OWNED_STOP_FIELDS,
  ANCHOR_REPAIR_REASON_CODES: REASON,
  DAY_CONTAINED_ANCHOR_REPAIR_TOOL,
  isExperientialStop,
  frozenFingerprint,
  resolveAnchorRepairScope,
  buildAnchorRepairInstruction,
  applyDayContainedAnchorRepair,
};
