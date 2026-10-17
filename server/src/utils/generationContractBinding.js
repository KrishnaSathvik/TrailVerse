'use strict';

/**
 * TIER-1 GENERATION CONTRACT BINDING.
 *
 * The canonical itinerary shape is unchanged. What shrinks is the MODEL
 * generation contract: fields that are derived, server-known, or always
 * uninformative are no longer asked of the model, and are restored here —
 * deterministically, immediately after the tool artifact is parsed, and
 * therefore BEFORE every consumer that reads them.
 *
 *   reduced model artifact
 *     → this binding (park identity + canonical defaults)
 *     → evidence enrichment
 *     → Maps route bridge          (reads stop.parkCode, restored above)
 *     → finalizeItinerary          (owns coordinateSource; may fill coordinates)
 *     → completeness / fit / review / persistence
 *
 * Nothing here invents traveler-facing content. Every value is either a
 * canonical default the corpus already showed on 100% of stops, a projection
 * of a field the model still authors, or an identity the server resolved
 * before the turn started.
 */

const { NON_PARK_TYPES } = require('./itineraryParkIdentity');

/**
 * Stop fields removed from the model contract whose canonical value the server
 * restores unconditionally. Park identity is NOT in this list: it is restored
 * only on the single-destination branch (see `resolveParkIdentityBinding`).
 */
const TIER1_MODEL_OWNED_STOP_FIELDS = Object.freeze([
  'startTime',
  'drivingTimeFromPreviousMin',
  'physicalDifficulty',
]);

/**
 * SINGLE-DESTINATION PARK IDENTITY.
 *
 * Returns a binding only when the turn resolved exactly one destination and
 * that destination is the primary NPS park. Anything else — two parks, a park
 * plus a non-park place, an unresolved destination, or a declared
 * `destinationCount` above one — returns null, which leaves stop-level park
 * identity model-authored exactly as it is today.
 *
 * Failing conservative is the point: the corpus contains 0/20 multi-park plans,
 * so that branch is unexercised and must not be assumed away.
 */
function resolveParkIdentityBinding(resolvedContext) {
  const entities = Array.isArray(resolvedContext?.resolvedEntities)
    ? resolvedContext.resolvedEntities
    : [];
  if (entities.length > 1) return null;

  const parkCode = resolvedContext?.primaryPark?.parkCode
    ? String(resolvedContext.primaryPark.parkCode).trim().toLowerCase()
    : null;
  if (!parkCode) return null;

  if (entities.length === 1) {
    const entityId = String(entities[0]?.entityId || '').trim().toLowerCase();
    if (entityId !== `nps:park:${parkCode}`) return null;
  }

  const declared = Number(resolvedContext?.destinationCount);
  if (Number.isFinite(declared) && declared > 1) return null;

  const parkName = resolvedContext?.primaryPark?.parkName
    || resolvedContext?.primaryPark?.fullName
    || null;
  return { parkCode, parkName: parkName ? String(parkName) : null };
}

/**
 * `physicalDifficulty` was identical to `difficulty` on 194 of the 194 corpus
 * stops carrying both, and its only reader is `planStageCapture`'s alias
 * fallback. This projection preserves that implemented behavior.
 *
 * It is COMPATIBILITY, not a claim that the two concepts are the same. Giving
 * `physicalDifficulty` an independent meaning is a separate migration, and the
 * pins in `generationContractTier1.test.js` exist so it cannot happen by
 * accident.
 */
function projectPhysicalDifficulty(stop) {
  if (stop.physicalDifficulty !== undefined && stop.physicalDifficulty !== null) {
    return stop.physicalDifficulty;
  }
  return stop.difficulty ?? null;
}

/**
 * TWO FIELDS ARE DELIBERATELY NOT WRITTEN HERE.
 *
 * `latitude` / `longitude` — `enrichKnownStopLocations` skips a stop when
 * `Number.isFinite(Number(stop.latitude))`, and `Number(null)` is 0, which is
 * finite. Writing a canonical null would therefore switch the known-stop
 * catalog OFF for every stop; the captured replay caught 15 stops losing their
 * `trailverse_catalog` position. Leaving the keys absent preserves exactly
 * today's behavior, and `normalizeItineraryCoordinates` still produces the
 * canonical null inside `finalizeItinerary`. (That guard is a latent bug in its
 * own right — it disables the catalog for any stop where the model writes an
 * explicit null — but fixing it changes which stops get coordinates on paths
 * this slice does not touch.)
 *
 * `coordinateSource` — `finalizeItinerary` stamps provenance after
 * normalization and must stay its only writer.
 */
function bindStop(stop) {
  if (!stop || typeof stop !== 'object') return stop;
  return {
    ...stop,
    // The corpus emitted "" on 275/275 stops and the one consumer
    // (`constraintEngine`'s overlap check) treats it as absent. Omission must
    // stay omission — never become a meaningful scheduled clock time.
    startTime: typeof stop.startTime === 'string' ? stop.startTime : '',
    // `routeEvidenceDriveBridge` overwrites this with verified Maps minutes
    // wherever a route exists; canonical null is correct where none does.
    drivingTimeFromPreviousMin: stop.drivingTimeFromPreviousMin ?? null,
    physicalDifficulty: projectPhysicalDifficulty(stop),
  };
}

/**
 * @param {Object} params
 * @param {Object|null} params.itineraryData        parsed create_itinerary artifact
 * @param {{parkCode: string, parkName: ?string}|null} [params.parkIdentityBinding]
 * @returns {Object|null} canonical-shaped plan; the input is never mutated
 */
function bindGeneratedItineraryContract({ itineraryData, parkIdentityBinding = null } = {}) {
  if (!itineraryData || typeof itineraryData !== 'object' || !Array.isArray(itineraryData.days)) {
    return itineraryData;
  }

  let bound = {
    ...itineraryData,
    days: itineraryData.days.map((day) => (
      day && typeof day === 'object'
        ? { ...day, stops: (day.stops || []).map(bindStop) }
        : day
    )),
  };

  if (parkIdentityBinding?.parkCode) {
    // THE RESOLVED DESTINATION WINS.
    //
    // `enrichItineraryParkIdentity` derives identity from park names appearing
    // in stop text before falling back to the single-park conversation. On a
    // turn where the server ALREADY resolved the destination, that ordering is
    // backwards, and the replay caught it: a Theodore Roosevelt stop named
    // "Petrified Forest Trailhead" was reassigned to Petrified Forest National
    // Park in Arizona. THRO has its own petrified forest.
    //
    // A code the server resolved is not a guess, so nothing may outrank it.
    // Stop types that are never inside a park boundary still stay unassigned.
    bound = {
      ...bound,
      days: bound.days.map((day) => {
        const stops = (day.stops || []).map((stop) => {
          if (!stop || typeof stop !== 'object') return stop;
          if (NON_PARK_TYPES.has(stop.type)) {
            return { ...stop, parkCode: null, parkName: null };
          }
          return {
            ...stop,
            parkCode: parkIdentityBinding.parkCode,
            parkName: parkIdentityBinding.parkName,
          };
        });
        const stopParkCodes = [...new Set(stops.map((s) => s?.parkCode).filter(Boolean))];
        return { ...day, stops, ...(stopParkCodes.length ? { parkCodes: stopParkCodes } : {}) };
      }),
    };
  }

  return bound;
}

module.exports = {
  TIER1_MODEL_OWNED_STOP_FIELDS,
  bindGeneratedItineraryContract,
  resolveParkIdentityBinding,
};
