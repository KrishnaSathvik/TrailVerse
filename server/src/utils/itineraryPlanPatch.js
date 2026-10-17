'use strict';

const { isValidPlanPatch } = require('./itineraryToolSchema');
const { ensureStopId } = require('./itineraryStopIdentity');
const { normalizeDayActivityGroups } = require('./activityGroupValidation');
const { normalizeDayTravelEdges } = require('./travelEdgeValidation');
const { clearDerivedDriveStateOnDays } = require('./planDerivedState');

const PATCH_TOOL_NAME = 'patch_itinerary';
const TRUNCATION_STOP_REASONS = new Set(['max_tokens', 'max_output_tokens', 'length']);

/**
 * Refinement plan ownership: a model may return a partial day list.
 * Merge it onto the prior canonicalPlan unless the traveler explicitly
 * deleted a day or shortened the trip.
 */

function dayNumber(day, index = 0) {
  const n = Number(day?.dayNumber ?? day?.day ?? day?.dayIndex);
  return Number.isInteger(n) && n > 0 ? n : index + 1;
}

function cloneDay(day) {
  return JSON.parse(JSON.stringify(day));
}

function cloneValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function sameValue(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function normalizePlanPatchToolCalls({
  toolCalls = [],
  stopReason = null,
  maxBytes = 200000,
} = {}) {
  const calls = Array.isArray(toolCalls) ? toolCalls : [];
  if (calls.some((call) => call?.name && call.name !== PATCH_TOOL_NAME)) {
    return { status: 'malformed_tool', planPatchData: null, validationErrors: ['unknown_tool'] };
  }
  const patchCalls = calls.filter((call) => call?.name === PATCH_TOOL_NAME);
  if (patchCalls.length === 0) {
    return {
      status: TRUNCATION_STOP_REASONS.has(stopReason) ? 'truncated' : 'missing_tool',
      planPatchData: null,
      validationErrors: TRUNCATION_STOP_REASONS.has(stopReason) ? ['no_tool_before_truncation'] : [],
    };
  }
  const parsed = [];
  for (const call of patchCalls) {
    if (call.status === 'incomplete') {
      return { status: 'truncated', planPatchData: null, validationErrors: ['incomplete_tool_arguments'] };
    }
    let input = call.input;
    if (input == null && typeof call.rawArgs === 'string') {
      try { input = JSON.parse(call.rawArgs); } catch {
        return {
          status: TRUNCATION_STOP_REASONS.has(stopReason) ? 'truncated' : 'malformed_tool',
          planPatchData: null,
          validationErrors: ['unparseable_tool_arguments'],
        };
      }
    }
    const signature = JSON.stringify(stableValue(input));
    if (Buffer.byteLength(signature, 'utf8') > maxBytes) {
      return { status: 'malformed_tool', planPatchData: null, validationErrors: ['tool_payload_too_large'] };
    }
    parsed.push({ input, signature });
  }
  const distinct = [...new Map(parsed.map((item) => [item.signature, item])).values()];
  if (distinct.length !== 1) {
    return { status: 'malformed_tool', planPatchData: null, validationErrors: ['ambiguous_tool_calls'] };
  }
  if (!isValidPlanPatch(distinct[0].input)) {
    return {
      status: TRUNCATION_STOP_REASONS.has(stopReason) ? 'truncated' : 'malformed_tool',
      planPatchData: null,
      validationErrors: ['invalid_plan_patch_shape'],
    };
  }
  return { status: 'complete', planPatchData: distinct[0].input, validationErrors: [] };
}

function parseExplicitPlanMutation(userPrompt = '') {
  const text = String(userPrompt || '');
  const removeDayNumbers = [...text.matchAll(
    /\b(?:remove|drop|delete|cut|skip)\b.{0,24}\bday\s*(\d{1,2})\b/gi
  )].map((m) => Number(m[1])).filter((n) => Number.isInteger(n) && n > 0);

  const shorten = text.match(
    /\b(?:make (?:this |it |the trip )?(?:a |only )?)(\d{1,2})\s*[- ]?days?\b|\b(?:shorten|change|cut) (?:this |the trip |it )?(?:to |down to )?(\d{1,2})\s*[- ]?days?\b/i
  );
  const shortenToDays = shorten
    ? Number(shorten[1] || shorten[2])
    : null;

  return {
    removeDayNumbers: [...new Set(removeDayNumbers)],
    shortenToDays: Number.isInteger(shortenToDays) && shortenToDays > 0 ? shortenToDays : null,
  };
}

function isExplicitPlanRestructure(userPrompt = '') {
  const mutation = parseExplicitPlanMutation(userPrompt);
  return mutation.shortenToDays != null || mutation.removeDayNumbers.length > 0;
}

function stopMatches(stop, operation) {
  const stopId = String(operation?.stopId || '').trim();
  const stopName = String(operation?.stopName || '').trim().toLowerCase();
  if (stopId) return String(stop?.id || stop?.stopId || '') === stopId;
  if (stopName) return String(stop?.name || '').trim().toLowerCase() === stopName;
  return false;
}

/**
 * EVIDENCE-BOUND FIELDS. What a place IS, as opposed to how the day is spent
 * there. These come from `npsEvidenceProvider` normalizedValue, and
 * `itineraryCompleteness` and `hardConstraintEligibility` treat structured
 * values as authoritative — `enrichItineraryExposureFromEvidenceBundle` only
 * fills a value the model OMITTED, so a model-supplied value silently wins.
 *
 * A traveler asking for an easier morning is a request about the PLAN. It is
 * not new information about the place, and it must not be able to relabel one.
 * Changing these on a stop whose identity is unchanged is refused; swapping the
 * stop for a different place is the honest way to get different values.
 */
const EVIDENCE_BOUND_STOP_FIELDS = Object.freeze([
  'exposureLevel', 'exposure', 'difficulty', 'physicalDifficulty', 'walkingDistanceMiles',
]);

const sameFieldValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function evidenceBoundChanges(currentStop, incomingStop) {
  const changes = [];
  for (const field of EVIDENCE_BOUND_STOP_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(incomingStop, field)) continue;
    const before = currentStop?.[field] ?? null;
    const after = incomingStop[field] ?? null;
    // A value the prior stop never carried is enrichment, not relabelling.
    if (before === null || before === '' || String(before).toLowerCase() === 'unknown') continue;
    if (sameFieldValue(before, after)) continue;
    changes.push({ field, before, after });
  }
  return changes;
}

/**
 * A PARTIAL stop omits with `null`; it does not erase with `null`.
 *
 * `PARTIAL_STOP_SCHEMA` has `required: []` and nullable types, so structured
 * output fills every field the model left alone with an explicit `null`.
 * Spreading that over the prior stop wipes name, type, difficulty and exposure —
 * and a null `name` reads as a rename, which is exactly the condition that
 * switches the evidence-bound guard off. Live attempt 1 on 2026-08-25 carried
 * precisely that shape.
 *
 * Empty strings are treated the same way, since the schema uses `startTime: ""`
 * for "not set". An explicitly empty ARRAY is a real value and is kept.
 */
function omitUnsetFields(stop) {
  const provided = {};
  for (const [key, value] of Object.entries(stop || {})) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    provided[key] = value;
  }
  return provided;
}

function failPatch(reasonCode, operationIndex = null, targetDiagnostics = null) {
  return {
    ok: false,
    plan: null,
    reasonCodes: [reasonCode],
    operationIndex,
    touchedDayNumbers: [],
    ...(targetDiagnostics ? { targetDiagnostics } : {}),
  };
}

/**
 * Bounded forensics for a target failure. A `plan_patch_target_not_found` that
 * cannot say what was asked for and what existed is unattributable, which is
 * exactly what the 2026-08-25 live refinement ran into.
 */
function targetDiagnosticsFor({ operation, index, dayNumber: day, stops, matchedCount, extra }) {
  return {
    operationIndex: index,
    op: operation?.op || null,
    dayNumber: day,
    requestedStopId: String(operation?.stopId || '').trim() || null,
    requestedStopName: String(operation?.stopName || '').trim() || null,
    availableStopIds: (stops || []).map((stop) => String(stop?.id || stop?.stopId || '')).filter(Boolean).slice(0, 24),
    availableStopNames: (stops || []).map((stop) => String(stop?.name || '')).filter(Boolean).slice(0, 24),
    matchedCount,
    ...(extra || {}),
  };
}

/**
 * Resolve a stop target. Deterministic where the answer is unambiguous; refuses
 * where it is not. `findIndex` used to take the first stop sharing a name,
 * which is a guess wearing a match's clothes.
 */
function resolveStopTarget({ operation, index, dayNum, stops }) {
  const hasReference = Boolean(String(operation?.stopId || '').trim())
    || Boolean(String(operation?.stopName || '').trim());
  if (!hasReference) {
    return {
      ok: false,
      reasonCode: 'plan_patch_target_missing',
      diagnostics: targetDiagnosticsFor({ operation, index, dayNumber: dayNum, stops, matchedCount: 0 }),
    };
  }
  const matches = [];
  stops.forEach((stop, stopIndex) => { if (stopMatches(stop, operation)) matches.push(stopIndex); });
  if (matches.length === 0) {
    return {
      ok: false,
      reasonCode: 'plan_patch_target_not_found',
      diagnostics: targetDiagnosticsFor({ operation, index, dayNumber: dayNum, stops, matchedCount: 0 }),
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      reasonCode: 'plan_patch_target_ambiguous',
      diagnostics: targetDiagnosticsFor({
        operation, index, dayNumber: dayNum, stops, matchedCount: matches.length,
      }),
    };
  }
  return { ok: true, stopIndex: matches[0] };
}

/**
 * Apply a bounded model-authored patch to the authoritative prior plan.
 * The model never supplies replacement values for days it did not target.
 */
// `transportation` (Phase 9C.1F.2) is the current planningState.transportation
// policy, supplied explicitly by the execution seam — this utility reads no
// globals. Absent → no authority → any proposed edge modeIntent is stripped.
function applyPlanPatch({ priorPlan = null, planPatch = null, transportation = null } = {}) {
  if (!priorPlan || !Array.isArray(priorPlan.days) || priorPlan.days.length === 0) {
    return failPatch('plan_patch_prior_missing');
  }
  const operations = Array.isArray(planPatch?.operations) ? planPatch.operations : [];
  if (operations.length === 0) return failPatch('plan_patch_operations_missing');

  const next = cloneValue(priorPlan);
  const touched = new Set();
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index] || {};
    const targetDayNumber = Number(operation.dayNumber);
    if (!Number.isInteger(targetDayNumber) || targetDayNumber <= 0) {
      return failPatch('plan_patch_day_invalid', index);
    }
    const dayIndex = next.days.findIndex((day, i) => dayNumber(day, i) === targetDayNumber);
    if (dayIndex < 0) return failPatch('plan_patch_target_not_found', index);
    const currentDay = next.days[dayIndex];

    if (operation.op === 'update_day') {
      if (!operation.day || !Array.isArray(operation.day.stops)) {
        return failPatch('plan_patch_day_invalid', index);
      }
      const suppliedNumber = Number(operation.day.dayNumber ?? operation.day.day);
      if (Number.isFinite(suppliedNumber) && suppliedNumber !== targetDayNumber) {
        return failPatch('plan_patch_day_mismatch', index);
      }
      next.days[dayIndex] = {
        ...cloneDay(operation.day),
        day: operation.day.day ?? currentDay.day ?? targetDayNumber,
        dayNumber: operation.day.dayNumber ?? currentDay.dayNumber ?? targetDayNumber,
      };
    } else if (operation.op === 'update_stop') {
      const stops = Array.isArray(currentDay.stops) ? currentDay.stops : [];
      if (!operation.stop || typeof operation.stop !== 'object') {
        return failPatch('plan_patch_target_not_found', index,
          targetDiagnosticsFor({ operation, index, dayNumber: targetDayNumber, stops, matchedCount: 0 }));
      }
      const target = resolveStopTarget({ operation, index, dayNum: targetDayNumber, stops });
      if (!target.ok) return failPatch(target.reasonCode, index, target.diagnostics);
      const current = stops[target.stopIndex];
      const raw = cloneValue(operation.stop);
      const provided = omitUnsetFields(raw);
      // Identity is the place. A rename means the stop now describes a
      // DIFFERENT place, so its unstated facts must not be inherited from the
      // one it replaced — an unstated exposure there is genuinely unknown, and
      // downstream eligibility has to be allowed to say so.
      const renamed = Object.prototype.hasOwnProperty.call(provided, 'name')
        && String(provided.name || '').trim().toLowerCase()
          !== String(current?.name || '').trim().toLowerCase();
      const incoming = renamed ? raw : provided;
      if (!renamed) {
        const evidenceFieldChanges = evidenceBoundChanges(current, incoming);
        if (evidenceFieldChanges.length > 0) {
          return failPatch('plan_patch_evidence_field_mutation', index, targetDiagnosticsFor({
            operation, index, dayNumber: targetDayNumber, stops, matchedCount: 1,
            extra: { evidenceFieldChanges },
          }));
        }
      }
      // Identity is server-owned once a stop has entered the canonical plan —
      // no patch, rename included, may relabel WHICH stop this is (9C.1D.1).
      stops[target.stopIndex] = { ...current, ...incoming, id: current.id };
    } else if (operation.op === 'add_stop') {
      if (!operation.stop || typeof operation.stop !== 'object' || !String(operation.stop.name || '').trim()) {
        return failPatch('plan_patch_stop_invalid', index);
      }
      if (!Array.isArray(currentDay.stops)) currentDay.stops = [];
      const newStop = cloneValue(operation.stop);
      const existingIds = currentDay.stops.map((s) => s?.id).filter(Boolean);
      newStop.id = ensureStopId(newStop, existingIds);
      currentDay.stops.push(newStop);
    } else if (operation.op === 'remove_stop') {
      const stops = Array.isArray(currentDay.stops) ? currentDay.stops : [];
      const target = resolveStopTarget({ operation, index, dayNum: targetDayNumber, stops });
      if (!target.ok) return failPatch(target.reasonCode, index, target.diagnostics);
      stops.splice(target.stopIndex, 1);
    } else if (operation.op === 'reorder_stops') {
      const stops = Array.isArray(currentDay.stops) ? currentDay.stops : [];
      const order = Array.isArray(operation.stopOrder) ? operation.stopOrder.map(String) : [];
      const idFor = (stop) => String(stop?.id || stop?.stopId || stop?.name || '');
      if (order.length !== stops.length || new Set(order).size !== stops.length) {
        return failPatch('plan_patch_reorder_invalid', index);
      }
      const byId = new Map(stops.map((stop) => [idFor(stop), stop]));
      if (order.some((id) => !byId.has(id))) return failPatch('plan_patch_reorder_invalid', index);
      currentDay.stops = order.map((id) => byId.get(id));
    } else {
      return failPatch('plan_patch_operation_unsupported', index);
    }

    const stops = next.days[dayIndex].stops || [];
    stops.forEach((stop, stopIndex) => { stop.order = stopIndex + 1; });

    // Phase 9C.1D.2 — every operation revalidates this day's relationship
    // structure against its (possibly changed) stop sequence, rather than
    // blindly carrying stale/now-invalid activityGroups/travelEdges forward.
    // `update_day` already replaced the day object wholesale above, so a
    // replacement that omits these fields does not inherit the prior day's —
    // this only re-validates whatever the CURRENT day object actually has.
    const patchedDay = next.days[dayIndex];
    if (patchedDay.activityGroups !== undefined) {
      patchedDay.activityGroups = normalizeDayActivityGroups(patchedDay);
    }
    if (patchedDay.travelEdges !== undefined) {
      patchedDay.travelEdges = normalizeDayTravelEdges(patchedDay, { transportation });
    }

    touched.add(targetDayNumber);
  }

  const response = String(planPatch?.response || '').trim();
  if (response) next.intro = response;
  const touchedDayNumbers = [...touched].sort((a, b) => a - b);
  // Drive minutes on a rewritten day were measured for the previous stops.
  // Clear them so finalize re-resolves legs for revision N+1 only.
  const plan = clearDerivedDriveStateOnDays(next, touchedDayNumbers);
  return {
    ok: true,
    plan,
    reasonCodes: [],
    operationIndex: null,
    touchedDayNumbers,
  };
}

/**
 * DELTA-TRUE GROUNDING. A bounded, deterministic before/after difference so a
 * traveler-facing explanation can be checked against what actually changed.
 *
 * The live 2026-08-25 patch told the traveler there was "no trail objective"
 * on a stop that had been an easy scenic drive all along — a true statement
 * about the result, describing a change that never happened. Prose may only
 * claim removals and reductions this diff actually contains.
 *
 * Artifact difference only. No reasoning, no prose, no model.
 */
const DIFFED_STOP_FIELDS = Object.freeze([
  'name', 'type', 'timeWindow', 'startTime', 'duration', 'difficulty',
  'physicalDifficulty', 'exposureLevel', 'walkingDistanceMiles', 'note', 'why', 'order',
]);

function describePatchMutation({ priorPlan = null, nextPlan = null } = {}) {
  const index = (plan) => {
    const map = new Map();
    for (const [i, day] of (plan?.days || []).entries()) {
      const num = dayNumber(day, i);
      for (const stop of day.stops || []) {
        map.set(`${num}::${stop?.id || stop?.stopId || stop?.name}`, { dayNumber: num, stop });
      }
    }
    return map;
  };
  const before = index(priorPlan);
  const after = index(nextPlan);

  const changedStops = [];
  const unchangedFields = new Set();
  for (const [key, prior] of before) {
    const next = after.get(key);
    if (!next) continue;
    const changed = {};
    for (const field of DIFFED_STOP_FIELDS) {
      const a = prior.stop?.[field] ?? null;
      const b = next.stop?.[field] ?? null;
      if (sameFieldValue(a, b)) unchangedFields.add(field);
      else changed[field] = { before: a, after: b };
    }
    if (Object.keys(changed).length > 0) {
      changedStops.push({ dayNumber: prior.dayNumber, name: prior.stop?.name ?? null, changed });
    }
  }
  const removedStops = [...before.entries()]
    .filter(([key]) => !after.has(key))
    .map(([, v]) => ({ dayNumber: v.dayNumber, name: v.stop?.name ?? null }));
  const addedStops = [...after.entries()]
    .filter(([key]) => !before.has(key))
    .map(([, v]) => ({ dayNumber: v.dayNumber, name: v.stop?.name ?? null }));

  const touched = new Set([
    ...changedStops.map((s) => s.dayNumber),
    ...removedStops.map((s) => s.dayNumber),
    ...addedStops.map((s) => s.dayNumber),
  ]);
  const unchangedDayNumbers = (priorPlan?.days || [])
    .map((day, i) => dayNumber(day, i))
    .filter((num) => !touched.has(num))
    .sort((a, b) => a - b);

  return {
    changedStops,
    addedStops,
    removedStops,
    unchangedFields: [...unchangedFields].sort(),
    unchangedDayNumbers,
  };
}

function allowsMissingDay(mutation, dayNum) {
  if (!mutation) return false;
  if (mutation.removeDayNumbers.includes(dayNum)) return true;
  if (mutation.shortenToDays != null && dayNum > mutation.shortenToDays) return true;
  return false;
}

function mergeRefinementPlan({ priorPlan = null, candidatePlan = null, userPrompt = '' } = {}) {
  const priorDays = Array.isArray(priorPlan?.days) ? priorPlan.days : [];
  const candidateDays = Array.isArray(candidatePlan?.days) ? candidatePlan.days : [];
  if (!candidatePlan) {
    return { plan: priorPlan || null, merged: false, mutation: parseExplicitPlanMutation(userPrompt) };
  }
  if (!priorDays.length) {
    return { plan: candidatePlan, merged: false, mutation: parseExplicitPlanMutation(userPrompt) };
  }

  const mutation = parseExplicitPlanMutation(userPrompt);
  const priorByNum = new Map();
  priorDays.forEach((day, index) => {
    priorByNum.set(dayNumber(day, index), cloneDay(day));
  });
  const candidateByNum = new Map();
  candidateDays.forEach((day, index) => {
    candidateByNum.set(dayNumber(day, index), cloneDay(day));
  });

  const mergedByNum = new Map(priorByNum);
  for (const [num, day] of candidateByNum.entries()) {
    mergedByNum.set(num, day);
  }
  for (const num of mutation.removeDayNumbers) {
    mergedByNum.delete(num);
  }
  if (mutation.shortenToDays != null) {
    for (const num of [...mergedByNum.keys()]) {
      if (num > mutation.shortenToDays && !candidateByNum.has(num)) {
        mergedByNum.delete(num);
      }
    }
  }

  const days = [...mergedByNum.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([num, day]) => ({
      ...day,
      day: day.day ?? num,
      dayNumber: day.dayNumber ?? num,
    }));

  return {
    plan: {
      ...candidatePlan,
      days,
    },
    merged: days.length !== candidateDays.length || candidateDays.length < priorDays.length,
    mutation,
  };
}

function evaluateRefinementOwnership({
  priorPlan = null,
  nextPlan = null,
  userPrompt = '',
  touchedDayNumbers = null,
} = {}) {
  const priorDays = Array.isArray(priorPlan?.days) ? priorPlan.days : [];
  const nextDays = Array.isArray(nextPlan?.days) ? nextPlan.days : [];
  if (!priorDays.length) return { ok: true, reasonCodes: [] };

  const mutation = parseExplicitPlanMutation(userPrompt);
  const priorNums = priorDays.map((day, index) => dayNumber(day, index));
  const nextNums = new Set(nextDays.map((day, index) => dayNumber(day, index)));
  const dropped = priorNums.filter((num) => !nextNums.has(num) && !allowsMissingDay(mutation, num));
  if (dropped.length) {
    return {
      ok: false,
      reasonCodes: ['refinement_dropped_unaffected_days'],
      droppedDayNumbers: dropped,
      changedDayNumbers: [],
    };
  }
  const hasExplicitTouchManifest = Array.isArray(touchedDayNumbers);
  const explicitlyTouched = new Set(
    hasExplicitTouchManifest ? touchedDayNumbers.map(Number) : []
  );
  const priorByNum = new Map(priorDays.map((day, index) => [dayNumber(day, index), day]));
  const nextByNum = new Map(nextDays.map((day, index) => [dayNumber(day, index), day]));
  const changed = hasExplicitTouchManifest ? [...priorByNum.keys()].filter((num) => {
    if (explicitlyTouched.has(num) || allowsMissingDay(mutation, num)) return false;
    return nextByNum.has(num) && !sameValue(priorByNum.get(num), nextByNum.get(num));
  }) : [];
  if (changed.length) {
    return {
      ok: false,
      reasonCodes: ['refinement_changed_unaffected_days'],
      droppedDayNumbers: [],
      changedDayNumbers: changed,
    };
  }
  return { ok: true, reasonCodes: [], droppedDayNumbers: [], changedDayNumbers: [] };
}

// Finalization may enrich provenance even on days outside the patch. Publishing
// those incidental changes would violate the user's mutation scope.
function preserveUntouchedDays({ priorPlan, nextPlan, touchedDayNumbers = [] }) {
  const touched = new Set(touchedDayNumbers.map(Number));
  const prior = new Map((priorPlan?.days || []).map((d, i) => [dayNumber(d, i), d]));
  return { ...nextPlan, days: (nextPlan?.days || []).map((d, i) => {
    const number = dayNumber(d, i);
    return !touched.has(number) && prior.has(number) ? cloneDay(prior.get(number)) : d;
  }) };
}

module.exports = {
  dayNumber,
  preserveUntouchedDays,
  EVIDENCE_BOUND_STOP_FIELDS,
  describePatchMutation,
  parseExplicitPlanMutation,
  isExplicitPlanRestructure,
  applyPlanPatch,
  normalizePlanPatchToolCalls,
  mergeRefinementPlan,
  evaluateRefinementOwnership,
};
