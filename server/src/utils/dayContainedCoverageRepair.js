'use strict';

/** Evidence-bounded day-value repair. Valid days are immutable. Existing
 * experiences may be deepened only within a duration supplied by evidence. */

const {
  SERVER_OWNED_STOP_FIELDS,
  isExperientialStop,
  frozenFingerprint,
} = require('./dayContainedAnchorRepair');
const {
  REPAIR_CANDIDATE_REASON_CODES,
  resolveCandidateRef,
} = require('./evidenceBoundRepairCandidates');

/** No full-day replacement or cross-day movement is expressible. */
const SUPPORTED_OPS = Object.freeze(['add_stop', 'deepen_stop', 'replace_support', 'remove_support']);

/** Named so a rejection says WHICH forbidden thing was attempted. */
const FORBIDDEN_OPS = Object.freeze([
  'replace_stop', 'remove_stop', 'reorder_stops', 'move_stop',
  'replace_day', 'add_day', 'remove_day',
]);

const MAX_STOP_DURATION_MINUTES = 720;
const MAX_OPERATIONS_PER_DAY = 2;

const REASON = Object.freeze({
  NO_SCOPE: 'coverage_repair_no_scope',
  WHOLE_PLAN_SCOPE: 'coverage_repair_whole_plan_scope',
  ALREADY_USED: 'coverage_repair_already_used',
  AMBIGUOUS_DIAGNOSTICS: 'coverage_repair_ambiguous_diagnostics',
  UNKNOWN_DAY_REF: 'coverage_repair_unknown_day_ref',
  FROZEN_DAY_TARGETED: 'coverage_repair_frozen_day_targeted',
  DUPLICATE_TARGET: 'coverage_repair_duplicate_target',
  UNSUPPORTED_OP: 'coverage_repair_unsupported_op',
  OPERATION_BUDGET: 'coverage_repair_operation_budget',
  INCOMPLETE_COVERAGE: 'coverage_repair_incomplete_coverage',
  MALFORMED_STOP: 'coverage_repair_malformed_stop',
  SERVER_OWNED_FIELD: 'coverage_repair_server_owned_field',
  DUPLICATE_IDENTITY: 'coverage_repair_duplicate_identity',
  NOT_EXPERIENTIAL: 'coverage_repair_stop_not_experiential',
  // PHASE 4M — the identity boundary.
  UNKNOWN_PLACE_REF: 'coverage_repair_unknown_place_ref',
  EVIDENCE_CATALOG_UNAVAILABLE: REPAIR_CANDIDATE_REASON_CODES.EVIDENCE_CATALOG_UNAVAILABLE,
});

const dayNumberOf = (day, index) => (Number.isFinite(Number(day?.day ?? day?.dayNumber))
  ? Number(day.day ?? day.dayNumber)
  : index + 1);

const nameKey = (s) => String(s || '').trim().toLowerCase();

/**
 * What this repair may touch, from the validator's own diagnostics. Refuses
 * rather than guesses, and declines whole-plan scope BEFORE any provider spend.
 */
function resolveCoverageRepairScope({
  itineraryData = null, dayDiagnostics = [], reasonCodes = [], coverageRepairUsed = false,
} = {}) {
  const refuse = (code) => ({ ok: false, reasonCodes: [code], affectedDays: [], frozenDayNumbers: [] });

  // One shot per turn, checked first so a repeat costs nothing.
  if (coverageRepairUsed === true) return refuse(REASON.ALREADY_USED);
  if (!(Array.isArray(reasonCodes) ? reasonCodes : []).includes('insufficient_day_coverage')) {
    return refuse(REASON.NO_SCOPE);
  }

  const days = Array.isArray(itineraryData?.days) ? itineraryData.days : [];
  if (!days.length) return refuse(REASON.NO_SCOPE);

  const numbers = days.map((d, i) => dayNumberOf(d, i));
  if (new Set(numbers).size !== numbers.length) return refuse(REASON.AMBIGUOUS_DIAGNOSTICS);

  const flaggedEntries = (Array.isArray(dayDiagnostics) ? dayDiagnostics : [])
    .filter((d) => (d?.codes || []).includes('insufficient_day_coverage'));
  const flagged = [...new Set(flaggedEntries
    .map((d) => d?.dayNumber)
    .filter((n) => typeof n === 'number' && Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  if (!flagged.length) return refuse(REASON.NO_SCOPE);
  for (const n of flagged) if (!numbers.includes(n)) return refuse(REASON.AMBIGUOUS_DIAGNOSTICS);

  // Containment buys nothing when there is nothing left to freeze — and a
  // declined scope must not reach a provider.
  if (flagged.length >= numbers.length) return refuse(REASON.WHOLE_PLAN_SCOPE);

  const affectedDays = flagged.map((n) => {
    const day = days[numbers.indexOf(n)];
    const diag = flaggedEntries.find((d) => d.dayNumber === n) || {};
    return {
      dayRef: n,
      // WHICH thinness this day has, so the instruction can name it rather than
      // describe coverage in general.
      coverageReasonCode: diag.coverageReasonCode || null,
      dayValue: diag.dayValue || null,
      stops: (Array.isArray(day.stops) ? day.stops : []).map((s, i) => ({
        stopRef: i + 1,
        name: String(s?.name || '').trim(),
        type: s?.type || null,
        duration: Number(s?.duration) || 0,
      })),
    };
  });

  return {
    ok: true,
    reasonCodes: [],
    affectedDays,
    frozenDayNumbers: numbers.filter((n) => !flagged.includes(n)),
    maxOperationsPerDay: MAX_OPERATIONS_PER_DAY,
  };
}

/** Candidate references and existing stop references bound every edit. */
const DAY_CONTAINED_COVERAGE_REPAIR_TOOL = Object.freeze({
  name: 'add_day_experiences',
  description: 'Make only the flagged days worthwhile with the smallest grounded change. Preserve substantial experiences; deepen only within evidence-supported duration, replace or remove weak support, or add one eligible experience. Never accumulate filler.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['dayRepairs'],
    properties: {
      dayRepairs: {
        type: 'array',
        description: 'One entry per listed day.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['dayRef', 'operations'],
          properties: {
            dayRef: { type: 'integer', description: 'The day reference given in the list.' },
            operations: {
              type: 'array',
              description: 'Smallest necessary change, within the supplied operation budget.',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['op'],
                properties: {
                  op: { type: 'string', enum: [...SUPPORTED_OPS] },
                  stopRef: { type: 'integer', description: 'Existing stop reference for deepen, replace or remove.' },
                  stop: {
                    type: 'object',
                    additionalProperties: false,
                    // PHASE 4M — no `name`. The model SELECTS an identity from the
                    // catalogue the frozen bundle defines; it cannot author one.
                    // PHASE 4O — and no `type`. The catalogue states the kind of
                    // place each ref is, so the server supplies it for the same
                    // reason it supplies the name: it is catalogue metadata, and
                    // a merge must not depend on the model echoing it back.
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

function buildCoverageRepairInstruction({ scope, candidates = [], constraints = null, candidatePlan = null } = {}) {
  if (!scope?.affectedDays?.length) return '';
  return [
    'Make each flagged day genuinely worthwhile with the smallest grounded change. A substantial single experience needs no filler.',
    'Preserve a light day only when traveler context supports it. Deepen an existing experience only within its evidence-backed maximum duration. Otherwise replace weak support, remove redundant support, or add ONE distinct eligible experience per flagged day.',
    'Ordinary transportation consumes available time but adds no experience value. A grounded scenic route can be the experience.',
    'Only listed days may change. No cross-day movement. All unflagged days are immutable; preserve all other stops unless explicitly targeted. Never inflate durations or invent attractions.',
    'Write note and why as ordinary traveler-facing descriptions; never mention validation, coverage, repairs or missing stops.',
    `Operation budget per day: ${scope.maxOperationsPerDay}; total: ${scope.maxOperationsPerDay * scope.affectedDays.length}.`,
    ...scope.affectedDays.map(day => `dayRef ${day.dayRef} current roles and travel capacity: ${JSON.stringify(day)}`),
    `Traveler constraints and destination: ${JSON.stringify(constraints || {})}`,
    `Frozen days: ${JSON.stringify(scope.frozenDayNumbers)}`,
    `Already-used experiences: ${JSON.stringify((candidatePlan?.days || []).map(d => ({ day: d.dayNumber || d.day, stops: (d.stops || []).map(s => ({ name: s.canonicalPlaceName || s.name, type: s.type, subject: s.experienceSubject, timeWindow: s.timeWindow })) })))}`,
    'Choose from these places only, by placeRef. A current place may only be deepened, never added again:',
    ...candidates.map(c => `placeRef ${c.ref} — ${c.canonicalName} (${c.canonicalType}); evidence duration maximum: ${c.maxDurationMinutes || 'unknown; cannot deepen'}; decision card: ${JSON.stringify(require('./compactRepairContext').candidateCard(c))}`),
  ].join('\n');
}

function validateCandidateStop(stop, candidates) {
  if (!stop || typeof stop !== 'object' || Array.isArray(stop)) {
    return { ok: false, code: REASON.MALFORMED_STOP, why: 'stop is not an object' };
  }
  for (const f of SERVER_OWNED_STOP_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(stop, f)) {
      return { ok: false, code: REASON.SERVER_OWNED_FIELD, why: `${f} is server-owned` };
    }
  }
  // A model-authored identity is not merely rejected — there is nowhere to put
  // one. The name comes from the evidence record the ref points at.
  if (Object.prototype.hasOwnProperty.call(stop, 'name')) {
    return { ok: false, code: REASON.UNKNOWN_PLACE_REF, why: 'a repair may not author a place name' };
  }
  // PHASE 4O — nor a type. Phase 4N died here: the catalogue stated no type, the
  // schema called the field optional, the model omitted it, and every operation
  // was refused as malformed. Identity and kind are both catalogue metadata.
  if (Object.prototype.hasOwnProperty.call(stop, 'type')) {
    return { ok: false, code: REASON.SERVER_OWNED_FIELD, why: 'type is resolved from the catalogue, not authored' };
  }
  const selected = resolveCandidateRef(candidates, stop.placeRef);
  if (!selected) {
    return { ok: false, code: REASON.UNKNOWN_PLACE_REF, why: `placeRef ${JSON.stringify(stop.placeRef)} is not in the allowed set` };
  }
  const name = selected.canonicalName;
  const type = selected.canonicalType;
  // A catalogue entry with no canonical type cannot be offered, so reaching this
  // means the catalogue and the merge disagree — refuse rather than improvise.
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
  // Padding a thin day with logistics is the other way to game this validator.
  if (selected.accessEligibility) {
    const access = require('./hardConstraintEligibility').evaluateHardAccessEligibility(shaped, selected.accessEligibility);
    if (access.reasonCodes.length) return { ok: false, code: access.reasonCodes[0], why: 'repair violates hard access eligibility' };
  }
  if (!isExperientialStop(shaped)) {
    return { ok: false, code: REASON.NOT_EXPERIENTIAL, why: `${name} is not an experience` };
  }
  return { ok: true, stop: shaped };
}

/**
 * MACHINE-OWNED CONTAINED MERGE.
 *
 * Atomic: one invalid operation discards the entire repair, because a partial
 * application would leave a plan nobody designed.
 *
 * Untargeted stops and days are carried by reference. Only explicit scoped
 * edits can change them, and deepening requires a duration bound from evidence.
 */
function applyDayContainedCoverageRepair({
  itineraryData = null, scope = null, dayRepairs = null, candidates = null,
} = {}) {
  const fail = (code, rejected = []) => ({ ok: false, plan: null, reasonCodes: [code], applied: 0, rejected });
  if (!Array.isArray(itineraryData?.days) || !itineraryData.days.length) return fail(REASON.NO_SCOPE);
  if (!scope?.ok || !Array.isArray(scope.affectedDays) || !scope.affectedDays.length) return fail(REASON.NO_SCOPE);
  // No catalogue means no identity the frozen bundle vouches for. Refuse rather
  // than trust whatever the artifact happens to contain.
  if (!Array.isArray(candidates) || candidates.length === 0) return fail(REASON.EVIDENCE_CATALOG_UNAVAILABLE);
  if (!Array.isArray(dayRepairs)) return fail(REASON.INCOMPLETE_COVERAGE);

  const allowedDays = new Set(scope.affectedDays.map((d) => d.dayRef));
  const budget = Number.isInteger(scope.maxOperationsPerDay) ? scope.maxOperationsPerDay : MAX_OPERATIONS_PER_DAY;
  const numbers = itineraryData.days.map((d, i) => dayNumberOf(d, i));
  // Identity is judged against the WHOLE plan: a second visit to something the
  // traveler already has adds no coverage, it just makes the day look longer.
  const existingNames = new Set(itineraryData.days
    .flatMap((d) => (Array.isArray(d.stops) ? d.stops : []))
    .flatMap((s) => [s?.name, s?.canonicalPlaceName]).filter(Boolean).map(nameKey));

  const additions = new Map();
  const replacements = new Map();
  const seenDays = new Set();
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
    if (!operations || operations.length === 0) {
      return fail(REASON.INCOMPLETE_COVERAGE, [{ dayRef, why: 'no operation supplied' }]);
    }
    if (operations.length > budget) {
      return fail(REASON.OPERATION_BUDGET, [{ dayRef, why: `at most ${budget} operations per day` }]);
    }

    const forDay = [];
    const edits = new Map();
    let addedCount = 0;
    const originalDay = itineraryData.days[numbers.indexOf(dayRef)];
    for (const operation of operations) {
      if (!SUPPORTED_OPS.includes(operation?.op)) return fail(REASON.UNSUPPORTED_OP);
      if (operation.op !== 'add_stop') {
        const index = operation.stopRef - 1;
        const original = Number.isInteger(operation.stopRef) && originalDay.stops?.[index];
        if (!original || edits.has(index)) return fail(REASON.DUPLICATE_TARGET);
        const role = scope.affectedDays.find(d => d.dayRef === dayRef)?.dayValue?.roles?.[index];
        if (operation.op === 'remove_support') {
          if (!role || (role.role === 'primary_experience' && !role.repeated)) return fail(REASON.UNSUPPORTED_OP);
          edits.set(index, null); applied += 1; continue;
        }
        const verdict = validateCandidateStop(operation.stop, candidates);
        if (!verdict.ok) return fail(verdict.code);
        const selected = resolveCandidateRef(candidates, operation.stop.placeRef);
        if (operation.op === 'deepen_stop') {
          if (nameKey(original.canonicalPlaceName || original.name) !== nameKey(selected.canonicalName)
            || !(selected.maxDurationMinutes >= verdict.stop.duration)
            || verdict.stop.duration <= Number(original.duration)) return fail(REASON.MALFORMED_STOP);
          edits.set(index, { ...original, duration: verdict.stop.duration, note: verdict.stop.note, why: verdict.stop.why });
        } else {
          if (!role || (role.role === 'primary_experience' && !role.repeated)
            || existingNames.has(nameKey(verdict.stop.name))) return fail(REASON.DUPLICATE_IDENTITY);
          existingNames.add(nameKey(verdict.stop.name));
          edits.set(index, verdict.stop);
        }
        applied += 1; continue;
      }
      addedCount += 1;
      if (addedCount > 1) return fail(REASON.OPERATION_BUDGET);
      const verdict = validateCandidateStop(operation.stop, candidates);
      if (!verdict.ok) return fail(verdict.code, [{ dayRef, why: verdict.why }]);
      const key = nameKey(verdict.stop.name);
      if (existingNames.has(key)) {
        return fail(REASON.DUPLICATE_IDENTITY, [{ dayRef, why: `${verdict.stop.name} is already in the plan` }]);
      }
      existingNames.add(key);
      forDay.push(verdict.stop);
      applied += 1;
    }
    additions.set(dayRef, forDay);
    replacements.set(dayRef, edits);
  }

  const plan = {
    ...itineraryData,
    days: itineraryData.days.map((day, i) => {
      const added = additions.get(dayNumberOf(day, i));
      const edits = replacements.get(dayNumberOf(day, i));
      if (!added && !edits) return day;
      return { ...day, stops: [...(day.stops || []).map((stop, index) => edits?.has(index) ? edits.get(index) : stop).filter(Boolean), ...(added || [])] };
    }),
  };

  return { ok: true, plan, reasonCodes: [], applied, rejected: [] };
}

module.exports = {
  MAX_STOP_DURATION_MINUTES,
  SUPPORTED_OPS,
  FORBIDDEN_OPS,
  SERVER_OWNED_STOP_FIELDS,
  COVERAGE_REPAIR_REASON_CODES: REASON,
  MAX_OPERATIONS_PER_DAY,
  DAY_CONTAINED_COVERAGE_REPAIR_TOOL,
  frozenFingerprint,
  resolveCoverageRepairScope,
  buildCoverageRepairInstruction,
  applyDayContainedCoverageRepair,
};
