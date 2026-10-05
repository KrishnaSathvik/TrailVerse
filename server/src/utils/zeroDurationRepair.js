'use strict';

/**
 * PHASE 1 — ZERO-DURATION MICRO-REPAIR (machine-owned merge).
 *
 * WHY THIS EXISTS
 * ---------------
 * `zero_duration_stops` is 45.7% of all retry output tokens in the artifact
 * corpus (2026-08-28 scoped-repair audit). Today the response to it is a full
 * regeneration: the model is asked for another complete itinerary and told, in
 * `buildStructuralRepairInstructions`, to "keep the same stops, the same order
 * and the same day structure".
 *
 * It ignores that instruction 7 times out of 10. Three measured cases replaced
 * EVERY stop on EVERY day — to supply a missing integer:
 *
 *   gate3 / everglades      stop identity preserved  [0%, 0%, 0%, 0%]
 *   gate4 / pair B run 1                             [0%, 0%, 0%, 0%]
 *   gate4 / pair B run 2                             [0%, 0%, 0%, 0%]
 *
 * The instruction is already correct. The enforcement model is wrong: a request
 * is not a constraint. So the authority moves to the machine.
 *
 * TWO HALVES, BOTH REQUIRED
 * -------------------------
 * A merge-only fix would make repair SAFE but not CHEAP — the model would still
 * generate a whole replacement itinerary that we then throw away. So this module
 * pairs the allowlist merge with a duration-only repair artifact: the model is
 * asked for integers, not for a plan.
 *
 * NOT A GENERIC MUTATION ENGINE. Refinement already owns scoped plan patches for
 * a much wider surface. This is deliberately narrow because the invariant here is
 * unusually clean — same plan, same everything, durations only — and that
 * simplicity is the whole point. `missing_experience_anchor` will tell us which
 * abstractions are genuinely reusable; guessing now would build the wrong ones.
 */

const { POSITIVE_DURATION_INVARIANT } = require('./itineraryStructuralValidation');
const { namedStops } = require('./itineraryCompleteness');

/**
 * Upper bound for a single stop. The feasibility validator refuses a day whose
 * activity plus driving exceeds 14h, so a single stop above 12h cannot be part
 * of a deliverable day under any arrangement. Deliberately generous: this is a
 * sanity rail against a nonsense integer, not a planning judgement. Whether the
 * DAY works is whole-plan validation's job, and it still runs afterwards.
 */
const MAX_STOP_DURATION_MINUTES = 720;

const REASON = Object.freeze({
  UNKNOWN_TARGET: 'zero_duration_repair_unknown_target',
  MISSING_TARGET: 'zero_duration_repair_missing_target',
  DUPLICATE_TARGET: 'zero_duration_repair_duplicate_target',
  INVALID_DURATION: 'zero_duration_repair_invalid_duration',
  IDENTITY_MISMATCH: 'zero_duration_repair_identity_mismatch',
  NO_TARGETS: 'zero_duration_repair_no_targets',
  EMPTY_ARTIFACT: 'zero_duration_repair_empty_artifact',
  AMBIGUOUS_DIAGNOSTICS: 'zero_duration_repair_ambiguous_diagnostics',
  INCOMPLETE_MERGE: 'zero_duration_repair_incomplete_merge',
  SURFACE_VIOLATION: 'zero_duration_repair_surface_violation',
});

/**
 * Everything a traveler reads, minus the single field this repair may write.
 * Used as a self-check: the merge proves its own mutation surface rather than
 * trusting that it wrote what it meant to.
 */
function mutationFingerprint(plan) {
  return JSON.stringify((Array.isArray(plan?.days) ? plan.days : []).map((day) => ({
    ...day,
    stops: (Array.isArray(day?.stops) ? day.stops : []).map(({ duration, ...rest }) => rest),
  })));
}

const dayNumberOf = (day, index) => (Number.isFinite(Number(day?.day ?? day?.dayNumber))
  ? Number(day.day ?? day.dayNumber)
  : index + 1);

const isPositiveDuration = (v) => Number(v) > 0;

/**
 * The exact stops this repair is permitted to touch.
 *
 * Derived from the validator's own diagnostics — never from the model, and never
 * from a re-reading of the prose. `ref` is machine-assigned and dense, so the
 * model returns an integer it cannot mistype into a wrong-but-plausible target.
 * `stopId` is carried alongside as a cross-check where the artifact has one:
 * `plan_patch_target_not_found` is 4 of the 5 unresolvable scopes in the corpus,
 * and it is precisely the failure of a model echoing an identifier back.
 *
 * @returns {Array<{ref:number, dayNumber:number, stopId:string|null, name:string}>}
 */
function collectZeroDurationTargets({ itineraryData = null, dayDiagnostics = [] } = {}) {
  const refuse = (code) => ({ ok: false, targets: [], reasonCodes: [code] });
  const days = Array.isArray(itineraryData?.days) ? itineraryData.days : [];
  if (!days.length) return refuse(REASON.EMPTY_ARTIFACT);

  const flagged = new Set(
    (Array.isArray(dayDiagnostics) ? dayDiagnostics : [])
      .filter((d) => (d?.codes || []).includes('zero_duration_stops'))
      .map((d) => Number(d.dayNumber))
      .filter((n) => Number.isFinite(n))
  );
  if (!flagged.size) return refuse(REASON.NO_TARGETS);

  // AMBIGUITY IS A REFUSAL, NOT A BEST EFFORT.
  //
  // The merge addresses a stop by (dayNumber, id, name). If two days carry the
  // same number, or a diagnostic names a day the artifact does not contain, that
  // address is not unique and the machine cannot prove what it would be writing
  // to. Micro-repair is an optimization; falling back to normal repair is always
  // available and always correct.
  const numbers = days.map((day, index) => dayNumberOf(day, index));
  if (new Set(numbers).size !== numbers.length) return refuse(REASON.AMBIGUOUS_DIAGNOSTICS);
  for (const n of flagged) if (!numbers.includes(n)) return refuse(REASON.AMBIGUOUS_DIAGNOSTICS);

  const targets = [];
  days.forEach((day, index) => {
    const n = dayNumberOf(day, index);
    if (!flagged.has(n)) return;
    for (const stop of namedStops(day)) {
      if (isPositiveDuration(stop?.duration)) continue;
      targets.push({
        // `ref` is machine-owned and lives only for this one repair request. It
        // is never written into the plan and never becomes a stop identity.
        ref: targets.length + 1,
        dayNumber: n,
        stopId: typeof stop?.id === 'string' && stop.id.trim() ? stop.id.trim() : null,
        name: String(stop?.name || '').trim(),
      });
    }
  });
  if (!targets.length) return refuse(REASON.NO_TARGETS);

  // Two stops on one day sharing an address cannot be told apart on merge.
  const addresses = targets.map((t) => `${t.dayNumber}::${t.stopId || ''}::${t.name}`);
  if (new Set(addresses).size !== addresses.length) return refuse(REASON.AMBIGUOUS_DIAGNOSTICS);

  return { ok: true, targets, reasonCodes: [] };
}

/**
 * The repair artifact. Everything the model is ALLOWED to say.
 *
 * There is no field here for a stop name, a note, an order, a day, or an intro,
 * so the schema itself makes an out-of-scope edit unrepresentable. The merge
 * below assumes nothing about that and enforces it again anyway.
 */
const ZERO_DURATION_REPAIR_TOOL = Object.freeze({
  name: 'repair_stop_durations',
  description:
    'Supply the missing duration, in minutes, for each listed stop. This is the ONLY change you may make. '
    + 'The itinerary is already accepted: its stops, order, days, wording and every other field are fixed and '
    + 'will be preserved by the system regardless of what you return.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['durationUpdates'],
    properties: {
      durationUpdates: {
        type: 'array',
        description: 'Exactly one entry per listed stop, in any order.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ref', 'durationMinutes'],
          properties: {
            ref: { type: 'integer', description: 'The stop reference number given in the list.' },
            stopId: { type: 'string', description: 'Echo the stop id shown for this ref, when one was shown.' },
            durationMinutes: {
              type: 'integer',
              description: `A realistic positive estimate in minutes (1-${MAX_STOP_DURATION_MINUTES}).`,
            },
          },
        },
      },
    },
  },
});

/**
 * The prompt half. Names each target unambiguously and restates nothing else:
 * the rule itself comes from the shared invariant so it cannot drift from the
 * validator that rejects plans.
 */
function buildZeroDurationRepairInstruction({ targets = [] } = {}) {
  if (!targets.length) return '';
  const lines = targets.map((t) => {
    const id = t.stopId ? `  [id ${t.stopId}]` : '';
    return `  ref ${t.ref} — Day ${t.dayNumber}: ${t.name}${id}`;
  });
  return [
    `These ${targets.length} stops are missing a duration:`,
    ...lines,
    '',
    POSITIVE_DURATION_INVARIANT,
    '',
    'Return one entry per ref. Change nothing else — you cannot: the rest of the itinerary is '
    + 'preserved by the system and any other edit is discarded.',
  ].join('\n');
}

/**
 * MACHINE-OWNED MERGE.
 *
 * The prior itinerary is the immutable source of truth for every value except
 * the durations of the listed targets. A candidate that names something outside
 * the allowlist does not get partially applied — the whole repair is refused and
 * the caller falls through to normal repair routing. Refusing is cheap; a
 * silently corrupted plan is not.
 *
 * This does NOT declare the itinerary accepted. Whole-plan validation runs after.
 *
 * @returns {{ok:boolean, plan:Object|null, reasonCodes:string[], applied:number,
 *            rejected:Array<{ref:*, why:string}>}}
 */
function applyZeroDurationRepair({
  itineraryData = null,
  targets = [],
  durationUpdates = null,
  maxDurationMinutes = MAX_STOP_DURATION_MINUTES,
} = {}) {
  const fail = (code, rejected = []) => ({
    ok: false, plan: null, reasonCodes: [code], applied: 0, rejected,
  });

  if (!Array.isArray(itineraryData?.days) || itineraryData.days.length === 0) {
    return fail(REASON.EMPTY_ARTIFACT);
  }
  if (!Array.isArray(targets) || targets.length === 0) return fail(REASON.NO_TARGETS);
  if (!Array.isArray(durationUpdates)) return fail(REASON.MISSING_TARGET);

  const byRef = new Map(targets.map((t) => [Number(t.ref), t]));
  const seen = new Set();
  const resolved = new Map();
  const rejected = [];

  for (const update of durationUpdates) {
    const ref = Number(update?.ref);
    const target = byRef.get(ref);
    if (!target) {
      rejected.push({ ref: update?.ref ?? null, why: 'ref is not in the allowed target set' });
      return fail(REASON.UNKNOWN_TARGET, rejected);
    }
    if (seen.has(ref)) {
      rejected.push({ ref, why: 'ref supplied more than once' });
      return fail(REASON.DUPLICATE_TARGET, rejected);
    }
    seen.add(ref);
    // Cross-check only where the artifact actually carried an id. A model that
    // invents or mangles one is telling us it lost track of the target.
    const echoed = typeof update?.stopId === 'string' ? update.stopId.trim() : '';
    if (target.stopId && echoed && echoed !== target.stopId) {
      rejected.push({ ref, why: `stopId "${echoed}" does not match target "${target.stopId}"` });
      return fail(REASON.IDENTITY_MISMATCH, rejected);
    }
    // Type first, then value. `Number('60')` is a valid integer, so coercing
    // before checking would let a string through a merge whose entire job is to
    // not trust the candidate. The schema already says integer; this enforces it
    // again, because a schema is a request and this is the constraint.
    const minutes = update?.durationMinutes;
    if (typeof minutes !== 'number' || !Number.isInteger(minutes)
      || minutes <= 0 || minutes > maxDurationMinutes) {
      rejected.push({ ref, why: `durationMinutes must be an integer in 1-${maxDurationMinutes}` });
      return fail(REASON.INVALID_DURATION, rejected);
    }
    resolved.set(ref, minutes);
  }

  // Every listed stop must be answered. A partially repaired plan would fail the
  // structural gate again on the next pass, having spent an attempt to get there.
  const missing = targets.filter((t) => !resolved.has(Number(t.ref)));
  if (missing.length) {
    return fail(REASON.MISSING_TARGET, missing.map((t) => ({ ref: t.ref, why: 'no duration supplied' })));
  }

  // Apply. Structural clone, then write exactly one field per target and nothing
  // else — the candidate is never merged, only read for integers.
  const byDayThenName = new Map();
  for (const t of targets) byDayThenName.set(`${t.dayNumber}::${t.stopId || ''}::${t.name}`, resolved.get(Number(t.ref)));

  let applied = 0;
  const plan = {
    ...itineraryData,
    days: itineraryData.days.map((day, index) => {
      const n = dayNumberOf(day, index);
      if (!targets.some((t) => t.dayNumber === n)) return day;
      return {
        ...day,
        stops: (Array.isArray(day.stops) ? day.stops : []).map((stop) => {
          const id = typeof stop?.id === 'string' && stop.id.trim() ? stop.id.trim() : '';
          const key = `${n}::${id}::${String(stop?.name || '').trim()}`;
          if (!byDayThenName.has(key)) return stop;
          if (isPositiveDuration(stop?.duration)) return stop;
          applied += 1;
          return { ...stop, duration: byDayThenName.get(key) };
        }),
      };
    }),
  };

  // FAIL CLOSED ON THE MUTATION SURFACE ITSELF.
  //
  // Two proofs, not one assumption: every target was actually written, and
  // nothing outside `duration` moved. A merge that is the security boundary for
  // repair scope does not get to assume its own correctness.
  if (applied !== targets.length) {
    return fail(REASON.INCOMPLETE_MERGE, targets
      .filter((t) => !resolved.has(Number(t.ref)))
      .map((t) => ({ ref: t.ref, why: 'target could not be addressed in the artifact' })));
  }
  if (mutationFingerprint(plan) !== mutationFingerprint(itineraryData)) {
    return fail(REASON.SURFACE_VIOLATION);
  }

  return { ok: true, plan, reasonCodes: [], applied, rejected: [] };
}

module.exports = {
  MAX_STOP_DURATION_MINUTES,
  ZERO_DURATION_REPAIR_REASON_CODES: REASON,
  ZERO_DURATION_REPAIR_TOOL,
  collectZeroDurationTargets,
  mutationFingerprint,
  buildZeroDurationRepairInstruction,
  applyZeroDurationRepair,
};
