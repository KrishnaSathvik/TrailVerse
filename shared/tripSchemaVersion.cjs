'use strict';

/**
 * Canonical TripPlan schema version (Architecture Lock Step 8).
 *
 * Distinct from:
 * - plan.version            → document envelope (buildPlanDocument sets 1)
 * - responseVersion         → CAS / response identity ordering
 * - presentation.schemaVersion → UI presentation manifest
 * - PLAYBACK_SCHEMA_VERSION → Demo playback fixture wrapper
 * - trailieDemoResponses.version → legacy Demo catalog revision
 * - canonicalContract       → historical string marker on accepted plans
 *
 * Bump TRIP_SCHEMA_VERSION only when the canonical TripPlan shape changes in a
 * way that readers must interpret differently (new required day-shape fields,
 * renamed stop identity, incompatible travelEdge contract, etc.). Additive
 * optional fields that older readers ignore do not require a bump.
 */

const TRIP_SCHEMA_VERSION = 1;

const SUPPORTED_TRIP_SCHEMA_VERSIONS = Object.freeze([TRIP_SCHEMA_VERSION]);

const UNSUPPORTED_TRIP_SCHEMA_VERSION = 'unsupported_trip_schema_version';

function hasOwn(value, key) {
  return value != null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key);
}

/** Explicit value when present; null when legacy/missing. */
function readTripSchemaVersion(plan) {
  if (!hasOwn(plan, 'tripSchemaVersion')) return null;
  return plan.tripSchemaVersion;
}

function isSupportedTripSchemaVersion(version) {
  return SUPPORTED_TRIP_SCHEMA_VERSIONS.includes(version);
}

/**
 * @returns {{
 *   ok: boolean,
 *   version: number|null,
 *   legacy: boolean,
 *   code: null|string
 * }}
 */
function evaluateTripSchemaVersion(plan) {
  const explicit = readTripSchemaVersion(plan);
  if (explicit == null) {
    return { ok: true, version: TRIP_SCHEMA_VERSION, legacy: true, code: null };
  }
  if (typeof explicit !== 'number' || !Number.isInteger(explicit) || !isSupportedTripSchemaVersion(explicit)) {
    return { ok: false, version: explicit, legacy: false, code: UNSUPPORTED_TRIP_SCHEMA_VERSION };
  }
  return { ok: true, version: explicit, legacy: false, code: null };
}

/**
 * Assign CURRENT when missing/legacy. Never silently downgrade an unsupported
 * future version — caller must reject via evaluateTripSchemaVersion.
 */
function stampTripSchemaVersion(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return plan;
  const evaluation = evaluateTripSchemaVersion(plan);
  if (!evaluation.ok) return plan;
  if (plan.tripSchemaVersion === TRIP_SCHEMA_VERSION) return plan;
  return { ...plan, tripSchemaVersion: TRIP_SCHEMA_VERSION };
}

module.exports = {
  TRIP_SCHEMA_VERSION,
  SUPPORTED_TRIP_SCHEMA_VERSIONS,
  UNSUPPORTED_TRIP_SCHEMA_VERSION,
  readTripSchemaVersion,
  isSupportedTripSchemaVersion,
  evaluateTripSchemaVersion,
  stampTripSchemaVersion,
};
