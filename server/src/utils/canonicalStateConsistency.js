'use strict';

/**
 * Canonical-state consistency invariant.
 *
 * THE DEFECT THIS EXISTS FOR
 * --------------------------
 * A traveler said "No camping." and supplied accommodation=lodging. The
 * normalized constraint recorded `accommodation: 'lodging'` correctly, while
 * the planning state that actually feeds evidence selection and generation
 * recorded `lodging.type: 'camping'` / `stayPreference: 'campground'`. Both
 * representations survived, disagreeing, and every entry path inherited the
 * contradiction identically.
 *
 * Fixing the one mapping that produced it is necessary but not sufficient:
 * hard constraints and planning state are two representations of the same
 * facts, built by different code, and nothing asserted they agree. This module
 * is that assertion — applied generically, after the merge, before the state is
 * handed downstream.
 *
 * PRECEDENCE (highest first)
 *   1. the traveler's explicit current-turn message      (resolved upstream in
 *      stayPreferenceMapper / constraint extraction)
 *   2. normalized hard current-turn constraints          ← authoritative here
 *   3. newest valid persisted planning state
 *   4. entry / form context
 *   5. older, default and legacy fields
 *
 * A default must never override an explicit traveler constraint, so every rule
 * below resolves toward the constraint, never away from it.
 *
 * Offline only — pure functions, no network and no I/O.
 */

const { accommodationClassOfStayPreference } = require('./stayPreferenceMapper');

const HARD_MOBILITY_FLAGS = Object.freeze([
  'wheelchair', 'stroller', 'avoidStairs', 'requiresFrequentBreaks',
]);

function classOfAccommodation(value) {
  if (!value) return 'unknown';
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'lodging' || normalized === 'camping') return normalized;
  return accommodationClassOfStayPreference(normalized);
}

/**
 * Each rule reports a contradiction and returns the corrected value. Rules
 * mutate a working copy, never the caller's object.
 */
const RULES = [
  {
    id: 'accommodation_constraint_vs_planning_state',
    apply(state, constraints, report) {
      const constraintClass = classOfAccommodation(constraints.accommodation);
      if (constraintClass === 'unknown') return;
      const stateClass = classOfAccommodation(state.lodging.type);
      if (stateClass === 'unknown' || stateClass === constraintClass) return;
      report({
        id: 'accommodation_constraint_vs_planning_state',
        constraint: `accommodation=${constraintClass}`,
        state: `lodging.type=${state.lodging.type}`,
        resolution: `lodging.type=${constraintClass}`,
      });
      state.lodging.type = constraintClass;
    },
  },
  {
    // The stay preference is the finer-grained half of the same fact. A lodging
    // class carrying `campground` is exactly the state that reached generation.
    id: 'accommodation_class_vs_stay_preference',
    apply(state, constraints, report) {
      const stayPreference = state.lodging.stayPreference;
      if (!stayPreference || stayPreference === 'unknown') return;
      const preferenceClass = accommodationClassOfStayPreference(stayPreference);
      const stateClass = classOfAccommodation(state.lodging.type);
      if (preferenceClass === 'unknown' || stateClass === 'unknown') return;
      if (preferenceClass === stateClass) return;
      report({
        id: 'accommodation_class_vs_stay_preference',
        constraint: `lodging.type=${state.lodging.type}`,
        state: `lodging.stayPreference=${stayPreference}`,
        resolution: 'lodging.stayPreference=null',
      });
      // Cleared rather than guessed: excluding camping says nothing about
      // whether the traveler wants a hotel, a cabin or a rental.
      state.lodging.stayPreference = null;
    },
  },
  {
    id: 'hard_mobility_flags',
    apply(state, constraints, report) {
      const source = constraints.mobility;
      if (!source || typeof source !== 'object') return;
      for (const flag of HARD_MOBILITY_FLAGS) {
        if (source[flag] !== true || state.mobility[flag] === true) continue;
        report({
          id: 'hard_mobility_flags',
          constraint: `mobility.${flag}=true`,
          state: `mobility.${flag}=${JSON.stringify(state.mobility[flag])}`,
          resolution: `mobility.${flag}=true`,
        });
        state.mobility[flag] = true;
      }
    },
  },
  {
    id: 'max_walk_distance',
    apply(state, constraints, report) {
      const limit = constraints.mobility?.maxWalkMilesPerSegment;
      if (limit == null) return;
      const current = state.mobility.maxWalkMilesPerSegment;
      if (current == null || Number(current) <= Number(limit)) return;
      report({
        id: 'max_walk_distance',
        constraint: `mobility.maxWalkMilesPerSegment=${limit}`,
        state: `mobility.maxWalkMilesPerSegment=${current}`,
        resolution: `mobility.maxWalkMilesPerSegment=${limit}`,
      });
      state.mobility.maxWalkMilesPerSegment = Number(limit);
    },
  },
  {
    id: 'avoid_exposure',
    apply(state, constraints, report) {
      if (constraints.avoidExposure !== true) return;
      if (state.preferences.avoidExposure === true) return;
      report({
        id: 'avoid_exposure',
        constraint: 'avoidExposure=true',
        state: `preferences.avoidExposure=${JSON.stringify(state.preferences.avoidExposure)}`,
        resolution: 'preferences.avoidExposure=true',
      });
      state.preferences.avoidExposure = true;
    },
  },
  {
    id: 'hiking_preference',
    apply(state, constraints, report) {
      const requested = constraints.activityPreferences?.hiking;
      if (!requested) return;
      const normalized = String(requested).toLowerCase();
      if (state.activityPreferences.hiking === normalized) return;
      report({
        id: 'hiking_preference',
        constraint: `activityPreferences.hiking=${normalized}`,
        state: `activityPreferences.hiking=${JSON.stringify(state.activityPreferences.hiking)}`,
        resolution: `activityPreferences.hiking=${normalized}`,
      });
      state.activityPreferences.hiking = normalized;
    },
  },
  {
    // A wheelchair user cannot also hold a hard-hiking preference. Cleared to
    // unknown rather than downgraded, because the correct replacement value is
    // a traveler decision, not an inference.
    id: 'wheelchair_vs_hard_hiking',
    apply(state, constraints, report) {
      if (state.mobility.wheelchair !== true) return;
      if (state.activityPreferences.hiking !== 'hard') return;
      report({
        id: 'wheelchair_vs_hard_hiking',
        constraint: 'mobility.wheelchair=true',
        state: 'activityPreferences.hiking=hard',
        resolution: 'activityPreferences.hiking=null',
      });
      state.activityPreferences.hiking = null;
    },
  },
  {
    id: 'party_size',
    apply(state, constraints, report) {
      const size = Number(constraints.groupSize);
      if (!Number.isFinite(size) || size < 1) return;
      if (Number(state.travelers.count) === size) return;
      report({
        id: 'party_size',
        constraint: `groupSize=${size}`,
        state: `travelers.count=${state.travelers.count}`,
        resolution: `travelers.count=${size}`,
      });
      state.travelers.count = size;
    },
  },
  {
    id: 'trip_duration',
    apply(state, constraints, report) {
      const days = Number(constraints.dates?.numDays);
      if (!Number.isFinite(days) || days < 1) return;
      if (Number(state.dates.durationDays) === days) return;
      report({
        id: 'trip_duration',
        constraint: `dates.numDays=${days}`,
        state: `dates.durationDays=${state.dates.durationDays}`,
        resolution: `dates.durationDays=${days}`,
      });
      state.dates.durationDays = days;
    },
  },
];

/**
 * @returns {{ state: Object, contradictions: Array<Object> }} the reconciled
 * planning state and every contradiction that had to be resolved to produce it.
 */
function resolveCanonicalStateConsistency({ constraints = null, planningState = null } = {}) {
  if (!planningState || typeof planningState !== 'object') {
    return { state: planningState, contradictions: [] };
  }
  const c = constraints && typeof constraints === 'object' ? constraints : {};
  const state = {
    ...planningState,
    lodging: { ...(planningState.lodging || {}) },
    mobility: { ...(planningState.mobility || {}) },
    preferences: { ...(planningState.preferences || {}) },
    travelers: { ...(planningState.travelers || {}) },
    dates: { ...(planningState.dates || {}) },
    activityPreferences: { ...(planningState.activityPreferences || {}) },
  };

  const contradictions = [];
  const report = (entry) => contradictions.push(entry);
  for (const rule of RULES) {
    try {
      rule.apply(state, c, report);
    } catch {
      // A rule must never be able to break state assembly. An unevaluated rule
      // is reported as such rather than silently dropped.
      contradictions.push({ id: rule.id, resolution: 'rule_failed_open' });
    }
  }
  return { state, contradictions };
}

/** Detect-only: used by tests and diagnostics that must not mutate state. */
function findCanonicalStateContradictions(args) {
  return resolveCanonicalStateConsistency(args).contradictions;
}

module.exports = {
  RULE_IDS: Object.freeze(RULES.map((rule) => rule.id)),
  HARD_MOBILITY_FLAGS,
  classOfAccommodation,
  resolveCanonicalStateConsistency,
  findCanonicalStateContradictions,
};
