'use strict';

/**
 * P1-6 — TRAVELER-FACING REQUIREMENTS, ATTACHED TO THE EXACT STOP/DAY.
 *
 * `evaluateTravelerFit` (travelerFitEvaluation.js) already computes ACTION_REQUIRED
 * obligations — permit/reservation, shuttle-or-boat access, seasonal access,
 * remote self-sufficiency — bound to a specific day/stop by PLACE IDENTITY (see
 * operationalFactExtraction.js). On an ACCEPTED plan (`travelerFit.ok === true`)
 * that array (`travelerFit.requirements`) was computed in
 * trailieV2ExecutionService.js and then discarded: nothing ever attached it to
 * the `itineraryData` the response envelope carries forward. The model was the
 * only remaining place a permit/shuttle/seasonal-access obligation could show
 * up — as prose, unowned by any machine value, easy to omit, weaken, or repeat
 * across intro/stop/closing.
 *
 * This module is a PURE PROJECTION, same discipline as
 * `buildTravelerFitDayDiagnostics` in travelerFitEvaluation.js: it does not
 * evaluate anything, does not change what fit/completeness/repair decided, and
 * invents no fact. It only places facts `evaluateTravelerFit` already produced
 * onto the day/stop they belong to, and collapses an identical obligation
 * shared by several stops in one day into a single grouped card instead of
 * repeating it.
 *
 * NOT HANDLED HERE: HARD_CAPABILITY findings (`vehicle_dimension`,
 * `vehicle_capability`, `unpaved_or_rough_road`, `technical_access`) never
 * reach this projector. A stop `evaluateTravelerFit` classifies INCOMPATIBLE or
 * UNKNOWN always fails the `traveler_fit` gate that produced this itinerary
 * (trailieV2ExecutionService.js) — an ACCEPTED plan by construction contains no
 * such stop, so there is nothing for a per-stop hard-incompatibility card to
 * attach to. Surfacing "why we routed around X" for a place the accepted plan
 * no longer names would need a gate-adjacent data path (e.g. carrying the
 * losing candidate's fact across the retry that removed it) — that touches
 * repair/retry machinery, out of this pass's scope. The category/severity
 * vocabulary below still supports `hard_incompatibility` so the moment such a
 * fact IS available bound to a surviving stop (a road named with legitimate
 * shuttle access, for instance), it renders correctly with no further schema
 * change.
 */

const CATEGORY_FOR_KIND = Object.freeze({
  permit: 'action_required',
  water_or_shuttle_access: 'action_required',
  remote_self_sufficiency: 'action_required',
  seasonal_access: 'condition_check',
  vehicle_dimension: 'hard_incompatibility',
  vehicle_capability: 'hard_incompatibility',
  unpaved_or_rough_road: 'hard_incompatibility',
  technical_access: 'hard_incompatibility',
});

const SEVERITY_FOR_KIND = Object.freeze({
  permit: 'required',
  water_or_shuttle_access: 'required',
  remote_self_sufficiency: 'advisory',
  seasonal_access: 'check',
  vehicle_dimension: 'blocking',
  vehicle_capability: 'blocking',
  unpaved_or_rough_road: 'blocking',
  technical_access: 'blocking',
});

const TITLE_FOR_KIND = Object.freeze({
  permit: 'Permit required',
  water_or_shuttle_access: 'Shuttle or boat access required',
  remote_self_sufficiency: 'Come prepared',
  seasonal_access: 'Seasonal access',
  vehicle_dimension: 'Vehicle restriction',
  vehicle_capability: 'Vehicle restriction',
  unpaved_or_rough_road: 'Rough-road access',
  technical_access: 'Technical access required',
});

function stableId(parts) {
  return parts.filter((p) => p !== null && p !== undefined && p !== '').join('|');
}

/**
 * Group raw per-stop requirement rows (`travelerFit.requirements`) into cards:
 * same day + same kind + same requirement text collapses into ONE card naming
 * every stop it applies to, instead of one card per stop. This is what keeps a
 * shared permit from being repeated under three different stops in the same
 * district.
 */
function groupRequirements(rows) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const kind = row?.kind;
    if (!kind) continue;
    const dayNumber = Number.isInteger(row?.dayNumber) ? row.dayNumber : null;
    const text = typeof row?.requirement === 'string' ? row.requirement.trim() : '';
    const key = stableId([dayNumber, kind, text]);
    if (!groups.has(key)) {
      groups.set(key, {
        kind,
        dayNumber,
        requirement: text || null,
        plannerRule: row?.plannerRule ?? null,
        confidence: row?.confidence ?? null,
        source: row?.source ?? null,
        binding: row?.binding ?? null,
        observedValue: row?.observedValue ?? null,
        limitValue: row?.limitValue ?? null,
        stopNames: [],
      });
    }
    const group = groups.get(key);
    const stopName = typeof row?.stopName === 'string' ? row.stopName.trim() : '';
    if (stopName && !group.stopNames.includes(stopName)) group.stopNames.push(stopName);
  }
  return [...groups.values()];
}

/** One presentation-ready requirement record, machine-owned end to end. */
function toRecord(group, { stopsOnDay = null } = {}) {
  const kind = group.kind;
  const category = CATEGORY_FOR_KIND[kind] || 'action_required';
  const severity = SEVERITY_FOR_KIND[kind] || 'required';
  const title = TITLE_FOR_KIND[kind] || 'Good to know';
  // A card naming every named stop on its day is functionally day scope, not a
  // per-stop dependency — group it there instead of repeating it under each one.
  const coversWholeDay = stopsOnDay != null && stopsOnDay > 1
    && group.stopNames.length >= stopsOnDay;
  const scope = group.dayNumber == null ? 'trip' : (coversWholeDay ? 'day' : 'stop');
  return {
    id: stableId([scope, group.dayNumber, kind, group.stopNames.join(',')]) || `${kind}-${group.requirement || ''}`,
    kind,
    category,
    severity,
    scope,
    dayNumber: group.dayNumber,
    stopNames: group.stopNames,
    title,
    requirement: group.requirement,
    observedValue: group.observedValue,
    limitValue: group.limitValue,
    plannerRule: group.plannerRule,
    confidence: group.confidence,
    source: group.source,
    binding: group.binding,
  };
}

/**
 * Attach machine-owned requirement records onto the exact stop/day/trip they
 * describe. Returns a NEW itineraryData object — the input is never mutated,
 * so a caller still holding the pre-projection object (e.g. for hashing before
 * this runs) is unaffected.
 *
 * @param {Object} itineraryData  the finalized, accepted plan (has `.days`)
 * @param {Array}  requirements   `travelerFit.requirements` — ACTION_REQUIRED
 *                                rows, one per (stop, kind) that survived to
 *                                the accepted plan.
 * @returns {Object} itineraryData, with `.requirements` present only on the
 *   stops/days/trip that actually carry one. An ordinary stop/day/trip is
 *   returned byte-identical (no empty `requirements: []` noise).
 */
function attachTravelerRequirements({ itineraryData, requirements = [] } = {}) {
  if (!itineraryData || !Array.isArray(itineraryData.days)) return itineraryData;
  const days = itineraryData.days;
  const groups = groupRequirements(requirements);
  if (groups.length === 0) return itineraryData;

  const stopCountByDay = new Map();
  for (const day of days) {
    const dayNumber = Number.isFinite(Number(day?.dayNumber)) ? Number(day.dayNumber) : null;
    if (dayNumber != null) {
      stopCountByDay.set(dayNumber, (day?.stops || []).filter((s) => String(s?.name || '').trim()).length);
    }
  }

  const records = groups.map((group) => toRecord(group, { stopsOnDay: stopCountByDay.get(group.dayNumber) ?? null }));

  const tripLevel = records.filter((r) => r.scope === 'trip');
  const dayLevelByDay = new Map();
  const stopLevelByDay = new Map();
  for (const r of records) {
    if (r.scope === 'day') {
      if (!dayLevelByDay.has(r.dayNumber)) dayLevelByDay.set(r.dayNumber, []);
      dayLevelByDay.get(r.dayNumber).push(r);
    } else if (r.scope === 'stop') {
      if (!stopLevelByDay.has(r.dayNumber)) stopLevelByDay.set(r.dayNumber, []);
      stopLevelByDay.get(r.dayNumber).push(r);
    }
  }

  const nextDays = days.map((day) => {
    const dayNumber = Number.isFinite(Number(day?.dayNumber)) ? Number(day.dayNumber) : null;
    const dayRequirements = dayNumber != null ? (dayLevelByDay.get(dayNumber) || []) : [];
    const stopReqs = dayNumber != null ? (stopLevelByDay.get(dayNumber) || []) : [];
    const stops = (day?.stops || []).map((stop) => {
      const name = String(stop?.name || '').trim();
      const mine = name ? stopReqs.filter((r) => r.stopNames.includes(name)) : [];
      if (mine.length === 0) return stop;
      return { ...stop, requirements: mine };
    });
    if (dayRequirements.length === 0) return { ...day, stops };
    return { ...day, stops, requirements: dayRequirements };
  });

  if (tripLevel.length === 0) return { ...itineraryData, days: nextDays };
  return { ...itineraryData, days: nextDays, requirements: tripLevel };
}

module.exports = {
  attachTravelerRequirements,
  groupRequirements,
  CATEGORY_FOR_KIND,
  SEVERITY_FOR_KIND,
  TITLE_FOR_KIND,
};
