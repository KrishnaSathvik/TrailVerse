'use strict';

/**
 * Stage 12 — deterministic itinerary prose manifest.
 *
 * A pure projection of the FROZEN itinerary into the identity/critical-field set
 * the verifier checks prose against. Deterministic and stably ordered for the
 * same finalized itinerary, tied to the exact `itineraryHash`. No pre-correction
 * draft content, no prompts/conversation, no private profile data.
 */

const { normalizeName, deriveAliases, deriveRemovedStopAliases } = require('./proseTextNormalize');

const MANIFEST_VERSION = 'v1';

function buildStop(stop, order) {
  return {
    stopId: stop.id,
    order: Number.isFinite(stop.order) ? stop.order : order,
    canonicalName: stop.name || '',
    normalizedName: normalizeName(stop.name),
    acceptedAliases: deriveAliases(stop.name),
    activityType: stop.type || null,
    durationMinutes: Number.isFinite(stop.duration) ? stop.duration : null,
    difficulty: stop.difficulty || null,
    parkCode: stop.parkCode || null,
    parkName: stop.parkName || null,
    startTime: stop.startTime || null,
    timeWindow: stop.timeWindow || null,
    endTime: stop.endTime || null,
    latitude: stop.latitude ?? null,
    longitude: stop.longitude ?? null,
    coordinateSource: stop.coordinateSource || null,
  };
}

function buildTransitions(stops) {
  const transitions = [];
  for (let i = 1; i < stops.length; i += 1) {
    const to = stops[i];
    if (Number.isFinite(to.drivingTimeFromPreviousMin) && to.drivingTimeFromPreviousMin > 0) {
      transitions.push({
        fromStopId: stops[i - 1].id,
        toStopId: to.id,
        driveMinutes: to.drivingTimeFromPreviousMin,
        distanceMiles: Number.isFinite(to.distanceFromPreviousMiles) ? to.distanceFromPreviousMiles : null,
      });
    }
  }
  return transitions;
}

/**
 * @param {Object} params
 * @param {Object} params.itinerary          frozen itinerary
 * @param {string} params.itineraryHash
 * @param {string[]} [params.corrections]     human-readable correction ledger
 * @param {Array} [params.removedStops]        [{ name }] removed during correction
 * @param {Object[]} [params.feasibilityIssues]
 * @param {Object} [params.resolvedMetadata]
 * @returns {Object} manifest
 */
function buildItineraryProseManifest({
  itinerary,
  itineraryHash = null,
  corrections = [],
  removedStops = [],
  feasibilityIssues = [],
  resolvedMetadata = {},
} = {}) {
  const days = (itinerary?.days || []).map((day, dayIndex) => {
    const stops = (day.stops || []).map((s, i) => buildStop(s, i));
    return {
      dayId: day.id,
      dayNumber: Number.isFinite(day.dayNumber) ? day.dayNumber : dayIndex + 1,
      date: day.date || null,
      title: day.label || null,
      stops,
      transitions: buildTransitions(day.stops || []),
      overnightLocation: day.overnightLocation || null,
    };
  });

  const destinationNames = [
    ...new Set(
      [
        resolvedMetadata.parkName,
        ...(resolvedMetadata.parkNames || []),
        ...days.flatMap((d) => d.stops.map((s) => s.parkName)),
      ].filter(Boolean)
    ),
  ];

  // Stage 13.8A §1 — removed-stop aliases BLOCK prose, so they are derived with
  // the destination-collision guard (never the permissive whitelist derivation).
  const removedStopAliases = [
    ...new Set(
      (removedStops || [])
        .map((r) => (typeof r === 'string' ? { name: r } : r || {}))
        .filter((r) => r.name)
        .flatMap((r) =>
          deriveRemovedStopAliases({
            name: r.name,
            curatedAliases: r.aliases || [],
            destinationNames,
          })
        )
    ),
  ];

  return {
    manifestVersion: MANIFEST_VERSION,
    itineraryHash,
    trip: {
      destinationNames,
      startDate: resolvedMetadata.startDate || null,
      endDate: resolvedMetadata.endDate || null,
      totalDays: days.length,
    },
    days,
    removedStopAliases,
    changedFieldConstraints: [],
    finalFeasibilityIssues: (feasibilityIssues || []).map((i) => ({
      id: i.id,
      type: i.type,
      severity: i.severity,
      message: i.message,
    })),
  };
}

module.exports = { MANIFEST_VERSION, buildItineraryProseManifest };
