'use strict';

/**
 * Accepted canonical itineraries vs draft planning skeletons.
 *
 * A draft day skeleton records intended day count / destination for planning
 * intent. It is not a saved itinerary and must not enable day patches.
 *
 * Draft markers (status/id) are authoritative. Bare `{ dayNumber }` fixtures
 * without draft markers are treated as prior plan *structure* for understanding,
 * but only days with traveler stops are patchable (`isAcceptedCanonicalPlan`).
 */

function dayHasStops(day) {
  return Array.isArray(day?.stops) && day.stops.some((stop) => {
    if (!stop || typeof stop !== 'object') return false;
    return Boolean(String(stop.name || stop.canonicalPlaceName || '').trim() || stop.id);
  });
}

function isDraftDay(day) {
  if (!day || typeof day !== 'object') return true;
  if (day.status === 'draft') return true;
  if (String(day.id || '').startsWith('draft-day-')) return true;
  return false;
}

function isDraftPlan(plan) {
  // Absence of a plan is not a draft skeleton — callers distinguish "no plan"
  // via hasPriorPlanStructure / isAcceptedCanonicalPlan.
  if (!plan || typeof plan !== 'object') return false;
  if (plan.status === 'draft' || plan.canonicalPlanState === 'draft') return true;
  const days = Array.isArray(plan.days) ? plan.days : [];
  if (days.length === 0) return true;
  return days.every(isDraftDay);
}

/**
 * Non-draft day list exists — enough for continuity / refinement recognition.
 * Does NOT mean the plan is patchable.
 */
function hasPriorPlanStructure(plan) {
  if (!plan || typeof plan !== 'object') return false;
  if (isDraftPlan(plan)) return false;
  const days = Array.isArray(plan.days) ? plan.days : [];
  return days.length > 0;
}

/**
 * True only for an itinerary that can be day-patched (has traveler stops).
 */
function isAcceptedCanonicalPlan(plan) {
  if (!hasPriorPlanStructure(plan)) return false;
  const days = Array.isArray(plan.days) ? plan.days : [];
  return days.some((day) => day && typeof day === 'object' && day.status !== 'draft'
    && (dayHasStops(day) || day.dayStructure && require('./dayCompleteness').validateDayCompleteness(day).length === 0));
}

module.exports = {
  isDraftPlan,
  isDraftDay,
  isAcceptedCanonicalPlan,
  hasPriorPlanStructure,
  dayHasStops,
};
