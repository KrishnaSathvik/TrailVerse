'use strict';

/**
 * ONE canonical runtime projection: the READ-side counterpart of
 * `canonicalConstraintTranslation`, which owns the write side.
 *
 * Trailie ended up holding a traveler constraint in more than one shape at
 * once, and consumers each learned a different one:
 *
 *   completeness              knew  constraints.mobility + planningState.mobility
 *   travelerFitEvaluation     knew  constraints.mobilityRaw + flat root fields
 *   evidence planning         knew  constraints.mobility only
 *
 * Only the first is production state. `mobilityRaw` has no producer anywhere in
 * `server/src`, and the flat root fields are the shape the OFFLINE GATE
 * HARNESSES write for human-legible telemetry — so travelerFitEvaluation could
 * not see a wheelchair the traveler had explicitly stated, while a replayed
 * capture appeared to work.
 *
 * There are exactly TWO legitimate dialects and this module is the only place
 * that knows the precedence between them:
 *
 *     current-turn canonical value   (constraints.mobility.*)
 *          ↓ if absent
 *     durable planning state         (constraints.planningState.mobility.*)
 *          ↓
 *     null
 *
 * Deliberately NOT read: `constraints.mobilityRaw`, `constraints.rawMobility`,
 * `constraints.<field>` at the root, `constraints.preferences.*`. Those are
 * harness/legacy dialects. Adding one back here is how the next flattened
 * capture gets to masquerade as production state.
 *
 * Precedence is per FIELD, not per object: the current turn re-extracts
 * mobility from the message alone (`parseConstraints` does not consume
 * `seed.mobility`), so on a refinement turn `constraints.mobility` is a fully
 * populated object of nulls sitting in front of durable state.
 *
 * Pure, deterministic, dependency-free.
 */

/** The canonical mobility field set, as `travelerStateExtraction` produces it. */
const MOBILITY_FIELDS = Object.freeze([
  'maxWalkMilesPerSegment',
  'walkingTolerance',
  'requiresFrequentBreaks',
  'wheelchair',
  'stroller',
  'avoidStairs',
]);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Current-turn value if it exists, else the durable one, else null.
 * @param {object|null} constraints runtime constraints
 * @param {string} field a canonical mobility field
 * @returns {*} the resolved value, or null
 */
function runtimeMobilityField(constraints, field) {
  if (!isObject(constraints)) return null;
  const current = isObject(constraints.mobility) ? constraints.mobility[field] : undefined;
  if (current != null) return current;
  const planningState = constraints.planningState;
  const durable = isObject(planningState) && isObject(planningState.mobility)
    ? planningState.mobility[field]
    : undefined;
  return durable == null ? null : durable;
}

/**
 * The whole canonical mobility shape, every field present, absent ones null.
 * @param {object|null} constraints runtime constraints
 * @returns {Readonly<object>}
 */
function resolveRuntimeMobility(constraints) {
  const resolved = {};
  for (const field of MOBILITY_FIELDS) {
    resolved[field] = runtimeMobilityField(constraints, field);
  }
  return Object.freeze(resolved);
}

/** True when the traveler stated any hard mobility need or walking limit. */
function hasRuntimeMobilityConstraint(constraints) {
  const mobility = resolveRuntimeMobility(constraints);
  return Number(mobility.maxWalkMilesPerSegment) > 0
    || mobility.walkingTolerance === 'limited'
    || mobility.requiresFrequentBreaks === true
    || mobility.wheelchair === true
    || mobility.stroller === true
    || mobility.avoidStairs === true;
}

function firstNonNull(...values) {
  for (const value of values) {
    if (value != null) return value;
  }
  return null;
}

/**
 * Fitness. `parseConstraints` emits `fitnessLevel`; planningState stores
 * `preferences.fitness`. `constraints.fitness` is a harness dialect.
 */
function resolveRuntimeFitness(constraints) {
  if (!isObject(constraints)) return null;
  return firstNonNull(
    constraints.fitnessLevel,
    isObject(constraints.planningState) && isObject(constraints.planningState.preferences)
      ? constraints.planningState.preferences.fitness
      : null
  );
}

/**
 * Pace. Flat root IS canonical here — `canonicalConstraintTranslation` routes
 * `pace` to `['pace']` — and `parseConstraints` seeds it from persisted state,
 * so unlike mobility it survives a refinement turn on its own.
 */
function resolveRuntimePace(constraints) {
  if (!isObject(constraints)) return null;
  return firstNonNull(
    constraints.pace,
    isObject(constraints.planningState) && isObject(constraints.planningState.preferences)
      ? constraints.planningState.preferences.pace
      : null
  );
}

/**
 * An activity preference (`hiking`, `photography`, `wildlife`).
 * `constraints.activityPreferences` is re-extracted from the current message
 * every turn exactly like `constraints.mobility`, so it needs the same
 * fallthrough to durable state.
 */
function resolveRuntimeActivityPreference(constraints, field) {
  if (!isObject(constraints)) return null;
  const current = isObject(constraints.activityPreferences)
    ? constraints.activityPreferences[field]
    : undefined;
  if (current != null) return current;
  const planningState = constraints.planningState;
  const durable = isObject(planningState) && isObject(planningState.activityPreferences)
    ? planningState.activityPreferences[field]
    : undefined;
  return durable == null ? null : durable;
}

/**
 * Whether the party includes older travellers. `parseConstraints` writes the
 * flat field from the CURRENT message only; the durable copy is
 * `planningState.travelers.hasOlderTravelers`.
 */
function resolveRuntimeHasOlderTravelers(constraints) {
  if (!isObject(constraints)) return false;
  if (constraints.hasOlderTravelers === true) return true;
  const planningState = constraints.planningState;
  return Boolean(
    isObject(planningState)
    && isObject(planningState.travelers)
    && planningState.travelers.hasOlderTravelers === true
  );
}

/** Transport mode lives only on the durable planning state. */
function resolveRuntimeTransportMode(constraints) {
  if (!isObject(constraints)) return null;
  const planningState = constraints.planningState;
  if (!isObject(planningState) || !isObject(planningState.transportation)) return null;
  return planningState.transportation.mode == null ? null : planningState.transportation.mode;
}

module.exports = {
  MOBILITY_FIELDS,
  hasRuntimeMobilityConstraint,
  resolveRuntimeActivityPreference,
  resolveRuntimeHasOlderTravelers,
  resolveRuntimeFitness,
  resolveRuntimeMobility,
  resolveRuntimePace,
  resolveRuntimeTransportMode,
  runtimeMobilityField,
};
