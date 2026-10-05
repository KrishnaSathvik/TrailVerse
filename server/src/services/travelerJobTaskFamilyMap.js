'use strict';

/**
 * The explicit contract between TRAVELER_JOBS (execution classes) and
 * TASK_FAMILIES (semantic classes).
 *
 * Without this mapping the two enums drift, and a job the system understands
 * perfectly well silently collapses into `general_advice` — which is what made
 * a third of measured turns look like semantic ambiguity when they were nothing
 * of the kind.
 *
 * Every traveler job must map to a family, or be listed as an intentional
 * generic. A coverage test enforces it.
 */

const JOB_TO_TASK_FAMILY = Object.freeze({
  destination_compare: 'comparison',
  trip_duration_advice: 'duration_advice',
  trip_skeleton: 'trip_skeleton',
  day_by_day_itinerary: 'itinerary',
  itinerary_refinement: 'itinerary_refinement',
  preference_update: 'itinerary_refinement',
  constraint_update: 'itinerary_refinement',
  route_planning: 'route_strategy',
  airport_strategy: 'airport_strategy',
  origin_refinement: 'airport_strategy',
  lodging_strategy: 'lodging_strategy',
  campground_strategy: 'campground_strategy',
  permits_reservations: 'permits_reservations',
  current_conditions: 'access_current',
  access_contingency: 'access_current',
  budget_cost: 'cost_budget',
  place_discovery: 'activity_advice',
  destination_discovery: 'destination_discovery',
  deep_research: 'deep_research',
  meta_help: 'meta_help',
  unsupported_non_travel: 'non_travel',
  // Intentionally generic: the job itself carries no narrower semantics.
  general_advice: 'general_advice',
});

/** Jobs deliberately mapped to the generic family, with the reason recorded. */
const INTENTIONAL_GENERICS = Object.freeze({
  general_advice: 'the job is the generic answer class; no narrower semantics exist',
});

function taskFamilyForJob(job) {
  return JOB_TO_TASK_FAMILY[job] || null;
}

/** Classes that are fully determined and must never seek semantic resolution. */
const SELF_DETERMINED_FAMILIES = Object.freeze(['non_travel', 'meta_help']);

module.exports = {
  JOB_TO_TASK_FAMILY,
  INTENTIONAL_GENERICS,
  SELF_DETERMINED_FAMILIES,
  taskFamilyForJob,
};
