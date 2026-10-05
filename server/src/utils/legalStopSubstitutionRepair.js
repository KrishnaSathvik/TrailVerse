'use strict';

/**
 * LEGAL-STOP SUBSTITUTION REPAIR (Olympic decision, 2026-09-03).
 *
 * The narrowest contract in the repair family: ONE-FOR-ONE replacement of an
 * experiential stop that a validator has positively identified as illegal
 * under this traveler's hard constraints —
 *
 *     stop_identity_excluded          the stop binds to a directive-excluded
 *                                     catalogue identity
 *     constraint_eligibility_unknown  the stop is exposure-judged with no
 *                                     evidence-certified low exposure
 *
 * — when the frozen catalogue already contains legal alternatives. It exists
 * because the 2026-09-03 live chain proved everything upstream is correct
 * (evidence supply, feasibility, attempt-1 catalogue steering, retry
 * steering) and the residual failure is a bounded model selection mistake.
 * Correcting one bad selection cheaply beats discarding three full
 * generations.
 *
 * CONTAINMENT, in the Phase-3B/4J lineage but one level tighter:
 *
 *     every day survives, in order
 *     every UNTARGETED stop is byte-identical
 *     the targeted stop's slot is preserved — duration and time window come
 *       from the stop being replaced, never from the model
 *     the replacement identity is catalogue-bound (placeRef); name and type
 *       are server-owned (Phase 4M/4O)
 *
 * LEGALITY IS THE SHARED AUTHORITY, NOT A FOURTH PREDICATE. The replacement
 * pool is derived by filtering the frozen bundle with the exposure
 * directive's own identity sets (`confirmedLowEvidenceIds`,
 * `suggestionIneligibleEvidenceIds`, `ineligibleEvidenceIds`) before the
 * existing repair-catalogue builder runs — so
 *
 *     repairCandidateIds ∩ suggestionIneligibleEvidenceIds = ∅
 *     repairCandidateIds ∩ directive exclusions            = ∅
 *
 * hold structurally. Confirmed-low identities rank first; the replacement is
 * required to be experiential so discharging the exposure defect cannot
 * reintroduce `insufficient_day_coverage`.
 *
 * If no legal role-compatible replacement exists, the repair DECLINES and the
 * normal failure stands. Nothing here declares a plan valid: the merged plan
 * re-runs the identical validator chain.
 */

const crypto = require('crypto');
const { classifyStop } = require('./itineraryCompleteness');
const {
  REPAIR_CANDIDATE_REASON_CODES,
  buildEvidenceBoundRepairCandidates,
  resolveCandidateRef,
} = require('./evidenceBoundRepairCandidates');

const MAX_TARGETS = 3;

const REASON = Object.freeze({
  NO_SCOPE: 'substitution_repair_no_scope',
  AMBIGUOUS_DIAGNOSTICS: 'substitution_repair_ambiguous_diagnostics',
  WHOLE_PLAN_SCOPE: 'substitution_repair_whole_plan_scope',
  UNKNOWN_DAY_REF: 'substitution_repair_unknown_day_ref',
  UNKNOWN_STOP_REF: 'substitution_repair_unknown_stop_ref',
  DUPLICATE_TARGET: 'substitution_repair_duplicate_target',
  OPERATION_BUDGET: 'substitution_repair_operation_budget',
  INCOMPLETE_COVERAGE: 'substitution_repair_incomplete_coverage',
  MALFORMED_STOP: 'substitution_repair_malformed_stop',
  SERVER_OWNED_FIELD: 'substitution_repair_server_owned_field',
  UNKNOWN_PLACE_REF: 'substitution_repair_unknown_place_ref',
  DUPLICATE_IDENTITY: 'substitution_repair_duplicate_identity',
  NOT_EXPERIENTIAL: 'substitution_repair_replacement_not_experiential',
  CONTAINMENT_VIOLATION: 'substitution_repair_containment_violation',
  EVIDENCE_CATALOG_UNAVAILABLE: REPAIR_CANDIDATE_REASON_CODES.EVIDENCE_CATALOG_UNAVAILABLE,
});

/** Fields the server derives or preserves. A replacement may never author them. */
const SERVER_OWNED_REPLACEMENT_FIELDS = Object.freeze([
  'name', 'type', 'duration', 'durationMinutes', 'timeWindow', 'startTime',
  'id', 'order', 'parkCode', 'parkName', 'latitude', 'longitude',
  'coordinateSource', 'drivingTimeFromPreviousMin', 'exposureLevel',
  'difficulty', 'walkingDistanceMiles', 'evidenceRef', 'canonicalPlaceName',
]);

const dayNumberOf = (day, index) => (Number.isFinite(Number(day?.day ?? day?.dayNumber))
  ? Number(day.day ?? day.dayNumber)
  : index + 1);

const nameKey = (s) => String(s || '').trim().toLowerCase();

function isExperientialStop(stop) {
  const c = classifyStop(stop);
  return c !== 'logistics_meta' && c !== 'rest_meal';
}

/**
 * Resolve exactly which stops this repair may replace, from the validator's
 * own diagnostics. Refuses rather than guesses: an exposure conflict carries
 * only a stop name, so a name that is missing or appears more than once is
 * ambiguous and the repair stands down.
 */
function resolveSubstitutionScope({ itineraryData = null, offendingStops = [] } = {}) {
  const refuse = (code) => ({ ok: false, reasonCodes: [code], targets: [], maxOperations: 0 });
  const days = Array.isArray(itineraryData?.days) ? itineraryData.days : [];
  if (!days.length) return refuse(REASON.NO_SCOPE);
  const offending = (Array.isArray(offendingStops) ? offendingStops : [])
    .filter((o) => o && typeof o.stopName === 'string' && o.stopName.trim())
    .slice(0, MAX_TARGETS);
  if (!offending.length) return refuse(REASON.NO_SCOPE);

  const numbers = days.map((d, i) => dayNumberOf(d, i));
  if (new Set(numbers).size !== numbers.length) return refuse(REASON.AMBIGUOUS_DIAGNOSTICS);

  const targets = [];
  const seen = new Set();
  for (const item of offending) {
    const wanted = nameKey(item.stopName);
    const matches = [];
    for (let d = 0; d < days.length; d += 1) {
      if (item.dayNumber != null && numbers[d] !== Number(item.dayNumber)) continue;
      const stops = Array.isArray(days[d].stops) ? days[d].stops : [];
      for (let s = 0; s < stops.length; s += 1) {
        if (nameKey(stops[s]?.name) === wanted) matches.push({ dayRef: numbers[d], stopRef: s + 1, name: String(stops[s].name) });
      }
    }
    if (matches.length === 0) return refuse(REASON.UNKNOWN_STOP_REF);
    if (matches.length > 1) return refuse(REASON.AMBIGUOUS_DIAGNOSTICS);
    const key = `${matches[0].dayRef}:${matches[0].stopRef}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push(matches[0]);
  }
  const totalStops = days.reduce((n, d) => n + (Array.isArray(d.stops) ? d.stops.length : 0), 0);
  if (targets.length >= totalStops) return refuse(REASON.WHOLE_PLAN_SCOPE);

  return { ok: true, reasonCodes: [], targets, maxOperations: targets.length };
}

/**
 * The replacement pool: the SAME frozen catalogue the plan was built from,
 * pre-filtered by the SAME exposure-directive identity sets, then classified
 * by the existing experiential repair-catalogue builder. Confirmed-low
 * identities are built first and lead the offered set.
 */
function buildLegalSubstitutionCatalog({
  bundle = null, candidatePlan = null, repairScope = null,
  exposureDirective = null, excludedEvidenceIds = [], limit = 40,
  constraints = null,
} = {}) {
  const illegal = new Set([
    ...(excludedEvidenceIds || []),
    ...(exposureDirective?.ineligibleEvidenceIds || []),
    ...(exposureDirective?.suggestionIneligibleEvidenceIds || []),
  ]);
  const evidence = (Array.isArray(bundle?.evidence) ? bundle.evidence : [])
    .filter((c) => !illegal.has(c?.evidenceId));
  const confirmedIds = new Set(exposureDirective?.confirmedLowEvidenceIds || []);

  const build = (rows, max) => buildEvidenceBoundRepairCandidates({
    bundle: { ...bundle, evidence: rows },
    candidatePlan,
    repairScope,
    requireExperiential: true,
    constraints,
    limit: max,
  });

  if (!confirmedIds.size) {
    const flat = build(evidence, limit);
    if (!flat.ok) return { ...flat, reasonCodes: [REASON.EVIDENCE_CATALOG_UNAVAILABLE] };
    return { ...flat, candidates: flat.candidates.map((c) => ({ ...c, confirmedLow: false })) };
  }

  const confirmedRows = evidence.filter((c) => confirmedIds.has(c?.evidenceId));
  const neutralRows = evidence.filter((c) => !confirmedIds.has(c?.evidenceId));
  const confirmed = build(confirmedRows, limit);
  const neutral = build(neutralRows, limit);
  const merged = [];
  const seenKeys = new Set();
  for (const [source, flag] of [[confirmed, true], [neutral, false]]) {
    if (!source.ok) continue;
    for (const candidate of source.candidates) {
      if (merged.length >= limit) break;
      if (seenKeys.has(candidate.placeKey)) continue;
      seenKeys.add(candidate.placeKey);
      merged.push({ ...candidate, confirmedLow: flag });
    }
  }
  if (!merged.length) {
    return {
      ok: false, candidates: [], count: 0, fingerprint: null,
      reasonCodes: [REASON.EVIDENCE_CATALOG_UNAVAILABLE],
      audit: { confirmed: confirmed.audit ?? null, neutral: neutral.audit ?? null },
    };
  }
  const candidates = merged.map((c, i) => ({ ...c, ref: i + 1 }));
  const fingerprint = crypto.createHash('sha256')
    .update(JSON.stringify(candidates.map((c) => [c.ref, c.placeKey, c.confirmedLow])), 'utf8')
    .digest('hex');
  return {
    ok: true, candidates, count: candidates.length, fingerprint, reasonCodes: [],
    audit: { confirmed: confirmed.ok ? confirmed.audit : null, neutral: neutral.ok ? neutral.audit : null },
  };
}

/** The repair artifact. One replacement per listed target, nothing else expressible. */
const LEGAL_STOP_SUBSTITUTION_TOOL = Object.freeze({
  name: 'substitute_illegal_stops',
  description:
    'Replace each listed stop with one place chosen by placeRef from the allowed list. '
    + 'Each replacement keeps the original stop\'s schedule slot; you supply only the choice and '
    + 'fresh note/why text describing the new place. Every other stop and day is already accepted '
    + 'and cannot be changed: the system preserves them regardless of what you return.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['substitutions'],
    properties: {
      substitutions: {
        type: 'array',
        description: 'Exactly one entry per listed target.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['dayRef', 'stopRef', 'replacement'],
          properties: {
            dayRef: { type: 'integer', description: 'The day reference given in the target list.' },
            stopRef: { type: 'integer', description: 'The stop reference given in the target list.' },
            replacement: {
              type: 'object',
              additionalProperties: false,
              required: ['placeRef', 'note', 'why'],
              properties: {
                placeRef: { type: 'integer', description: 'The ref of a place from the allowed list.' },
                note: {
                  type: 'string',
                  description: 'Traveler-facing: what to do at this place, or one concrete thing to know '
                    + 'before going. Plain trip language only — never mention a substitution, replacement, '
                    + 'constraint, or the stop it took the place of.',
                },
                why: {
                  type: 'string',
                  description: 'Traveler-facing: why this place suits this traveler and this point in the '
                    + 'trip. Plain trip language only — never mention a substitution, replacement, '
                    + 'eligibility, or how it was selected.',
                },
              },
            },
          },
        },
      },
    },
  },
});

function buildSubstitutionInstruction({ scope, candidates = [] } = {}) {
  const targets = scope?.targets || [];
  if (!targets.length) return '';
  return [
    `These ${targets.length} stop(s) cannot be confirmed compatible with this traveler's hard constraints. Replace only these stops with known compatible options:`,
    ...targets.map((t) => `  dayRef ${t.dayRef}, stopRef ${t.stopRef} — "${t.name}"`),
    '',
    'For each target return exactly ONE replacement chosen by placeRef. The replacement takes over the '
    + 'original stop\'s place in the day and its schedule slot; write a fresh note and why for the new place. '
    + 'Do not touch any other stop or day — you cannot: the system preserves them, and any other edit '
    + 'causes the whole repair to be discarded.',
    '',
    'The note and why are shown directly to the traveler as an ordinary part of their plan. Write them '
    + 'exactly as you would for any other stop in a plan you were building fresh: what to do there, and '
    + 'why it fits this trip. Do not mention a substitution, a rule the previous place broke, or that '
    + 'anything changed — the traveler is reading this stop for the first time.',
    '',
    'Choose from these places only, by placeRef. There is no way to name a place that is not listed:',
    ...candidates.map((c) => `  placeRef ${c.ref} — ${c.canonicalName}${c.canonicalType ? ` (${c.canonicalType})` : ''}${c.confirmedLow ? ' [confirmed low exposure]' : ''}`),
  ].join('\n');
}

/**
 * MACHINE-OWNED CONTAINED MERGE. Atomic: one invalid substitution rejects the
 * entire repair.
 */
function applyLegalStopSubstitution({
  itineraryData = null, scope = null, substitutions = null, candidates = null,
} = {}) {
  const fail = (code, rejected = []) => ({ ok: false, plan: null, reasonCodes: [code], applied: 0, rejected });
  const days = Array.isArray(itineraryData?.days) ? itineraryData.days : [];
  if (!days.length) return fail(REASON.NO_SCOPE);
  if (!scope?.ok || !Array.isArray(scope.targets) || !scope.targets.length) return fail(REASON.NO_SCOPE);
  if (!Array.isArray(candidates) || candidates.length === 0) return fail(REASON.EVIDENCE_CATALOG_UNAVAILABLE);
  if (!Array.isArray(substitutions) || substitutions.length === 0) return fail(REASON.INCOMPLETE_COVERAGE);
  if (substitutions.length > scope.maxOperations) return fail(REASON.OPERATION_BUDGET);

  const numbers = days.map((d, i) => dayNumberOf(d, i));
  const targetKey = (dayRef, stopRef) => `${dayRef}:${stopRef}`;
  const allowed = new Map(scope.targets.map((t) => [targetKey(t.dayRef, t.stopRef), t]));
  const answered = new Set();
  // Identities held by every stop that is NOT being replaced.
  const retainedNames = new Set();
  for (let d = 0; d < days.length; d += 1) {
    const stops = Array.isArray(days[d].stops) ? days[d].stops : [];
    for (let s = 0; s < stops.length; s += 1) {
      if (allowed.has(targetKey(numbers[d], s + 1))) continue;
      retainedNames.add(nameKey(stops[s]?.name));
    }
  }

  const plan = { ...itineraryData, days: days.map((d) => ({ ...d, stops: [...(d.stops || [])] })) };
  const introducedNames = new Set();
  let applied = 0;

  for (const sub of substitutions) {
    const dayRef = sub?.dayRef;
    const stopRef = sub?.stopRef;
    if (!Number.isInteger(dayRef) || !numbers.includes(dayRef)) return fail(REASON.UNKNOWN_DAY_REF);
    const key = targetKey(dayRef, stopRef);
    if (!allowed.has(key)) {
      return fail(REASON.UNKNOWN_STOP_REF, [{ dayRef, stopRef, why: 'not a listed target' }]);
    }
    if (answered.has(key)) return fail(REASON.DUPLICATE_TARGET, [{ dayRef, stopRef, why: 'target answered more than once' }]);
    answered.add(key);

    const replacement = sub?.replacement;
    if (!replacement || typeof replacement !== 'object' || Array.isArray(replacement)) {
      return fail(REASON.MALFORMED_STOP, [{ dayRef, stopRef, why: 'replacement is not an object' }]);
    }
    for (const field of SERVER_OWNED_REPLACEMENT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(replacement, field)) {
        // A model-authored identity is the exact defect this repair exists to
        // remove; refuse it under the identity code so telemetry names it.
        const code = field === 'name' || field === 'type' ? REASON.UNKNOWN_PLACE_REF : REASON.SERVER_OWNED_FIELD;
        return fail(code, [{ dayRef, stopRef, why: `${field} is server-owned` }]);
      }
    }
    const selected = resolveCandidateRef(candidates, replacement.placeRef);
    if (!selected) {
      return fail(REASON.UNKNOWN_PLACE_REF, [{ dayRef, stopRef, why: `placeRef ${JSON.stringify(replacement.placeRef)} is not in the allowed set` }]);
    }
    if (!selected.canonicalType) return fail(REASON.MALFORMED_STOP, [{ dayRef, stopRef, why: 'catalogue states no type for this place' }]);
    for (const field of ['note', 'why']) {
      if (typeof replacement[field] !== 'string' || !replacement[field].trim()) {
        return fail(REASON.MALFORMED_STOP, [{ dayRef, stopRef, why: `${field} is required` }]);
      }
    }
    const newName = nameKey(selected.canonicalName);
    if (retainedNames.has(newName) || introducedNames.has(newName)) {
      return fail(REASON.DUPLICATE_IDENTITY, [{ dayRef, stopRef, why: 'replacement reuses an identity the plan already holds' }]);
    }

    const dayIndex = numbers.indexOf(dayRef);
    const original = plan.days[dayIndex].stops[stopRef - 1];
    const shaped = {
      name: selected.canonicalName,
      type: selected.canonicalType,
      // SLOT PRESERVATION — the schedule shape is the replaced stop's, never
      // the model's.
      duration: original?.duration,
      timeWindow: typeof original?.timeWindow === 'string' ? original.timeWindow : '',
      startTime: typeof original?.startTime === 'string' ? original.startTime : '',
      ...(Number.isFinite(Number(original?.order)) ? { order: Number(original.order) } : {}),
      note: replacement.note,
      why: replacement.why,
      ...(selected.entityId ? { evidenceEntityId: selected.entityId } : {}),
      difficulty: null,
      exposureLevel: null,
      walkingDistanceMiles: null,
      alternatives: [],
    };
    if (selected.accessEligibility) {
      const access = require('./hardConstraintEligibility').evaluateHardAccessEligibility(shaped, selected.accessEligibility);
      if (access.reasonCodes.length) return fail(access.reasonCodes[0], [{ dayRef, stopRef, why: 'repair violates hard access eligibility' }]);
    }
    if (!isExperientialStop(shaped)) {
      return fail(REASON.NOT_EXPERIENTIAL, [{ dayRef, stopRef, why: `${selected.canonicalName} is not an experience` }]);
    }
    introducedNames.add(newName);
    plan.days[dayIndex].stops[stopRef - 1] = shaped;
    applied += 1;
  }

  const unanswered = scope.targets.filter((t) => !answered.has(targetKey(t.dayRef, t.stopRef)));
  if (unanswered.length) {
    return fail(REASON.INCOMPLETE_COVERAGE, unanswered.map((t) => ({ dayRef: t.dayRef, stopRef: t.stopRef, why: 'target not answered' })));
  }

  // CONTAINMENT PROVED, NOT ASSUMED: day structure identical, every untargeted
  // stop byte-identical.
  if (plan.days.length !== days.length) return fail(REASON.CONTAINMENT_VIOLATION);
  if (plan.days.map((d, i) => dayNumberOf(d, i)).join(',') !== numbers.join(',')) {
    return fail(REASON.CONTAINMENT_VIOLATION);
  }
  if (untargetedFingerprint(plan, scope) !== untargetedFingerprint(itineraryData, scope)) {
    return fail(REASON.CONTAINMENT_VIOLATION);
  }
  return { ok: true, plan, reasonCodes: [], applied, rejected: [] };
}

/** Every stop except the targeted positions, in structural order. */
function untargetedFingerprint(plan, scope) {
  const days = Array.isArray(plan?.days) ? plan.days : [];
  const numbers = days.map((d, i) => dayNumberOf(d, i));
  const targeted = new Set((scope?.targets || []).map((t) => `${t.dayRef}:${t.stopRef}`));
  return JSON.stringify(days.map((d, i) => ({
    day: numbers[i],
    meta: { ...d, stops: undefined },
    stops: (Array.isArray(d.stops) ? d.stops : [])
      .map((s, j) => (targeted.has(`${numbers[i]}:${j + 1}`) ? '__TARGET__' : s)),
  })));
}

module.exports = {
  SUBSTITUTION_REPAIR_REASON_CODES: REASON,
  SERVER_OWNED_REPLACEMENT_FIELDS,
  LEGAL_STOP_SUBSTITUTION_TOOL,
  resolveSubstitutionScope,
  buildLegalSubstitutionCatalog,
  buildSubstitutionInstruction,
  applyLegalStopSubstitution,
  untargetedFingerprint,
};
