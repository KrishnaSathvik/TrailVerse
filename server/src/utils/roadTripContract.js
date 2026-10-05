'use strict';

/**
 * Planning Readiness Pass #3 — multi-destination / road-trip planning contract.
 * Offline, provider-neutral. No destination hardcodes.
 */

const {
  resolveDestinationsFromMessage,
  resolveOriginFromMessage,
  toPlannerEntities,
} = require('./genericDestinationResolver');
const { parseCountToken } = require('./planningInputContract');
const { resolveDrivingMinimization } = require('./constraintFamilies');
const {
  resolveDestinationRelationship,
  relationshipImpliesTravelBetweenDestinations,
  CHOICE_RELATIONSHIPS,
} = require('./destinationRelationship');

const TRIP_SCOPE_TYPES = Object.freeze(['single_destination', 'comparison_set', 'multi_destination', 'road_trip']);
const ROUTE_SHAPES = Object.freeze(['one_way', 'loop', 'unknown']);

function emptyTripScope() {
  return {
    type: 'single_destination',
    destinationRelationship: 'unknown',
    destinationRelationshipConfidence: 0,
    origin: null,
    destinations: [],
    destinationOrderExplicit: false,
    userSuppliedOrder: true,
    optimizationRequested: false,
    transportMode: null,
    routeShape: 'unknown',
    maxDailyDriveMinutes: null,
    drivingFeasibilityRequired: false,
    routeLegs: [],
    unresolvedRouteLegs: [],
  };
}

function parseMaxDailyDriveMinutes(message) {
  return resolveDrivingMinimization(message).maxDailyDriveMinutes;
}

function detectRouteShape(message) {
  const text = String(message || '');
  if (/\b(?:loop|round[- ]?trip|return to|back to)\b/i.test(text)) return 'loop';
  if (/\b(?:one[- ]?way|finish(?:ing)? at|end(?:ing)? (?:at|in)|start(?:ing)? (?:at|in).{0,40}finish)\b/i.test(text)) {
    return 'one_way';
  }
  return 'unknown';
}

function detectOptimizationRequested(message) {
  return /\b(?:most efficient order|best order|optimal(?:\s+order)?|reorder|optimize(?:\s+the)?\s+route|efficient(?:\s+route)?)\b/i.test(
    String(message || '')
  );
}

/**
 * Detect an explicit traveler constraint that driving must stay feasible/manageable
 * — distinct from an ordinary question about driving conditions, roads, or weather.
 * Deliberately keyword-anchored (mirrors parseMaxDailyDriveMinutes): only imperative
 * "keep it reasonable / minimize / don't overdo it" phrasing counts, not mentions of
 * "driving" alone.
 */
function detectDrivingFeasibilityConstraint(message) {
  return resolveDrivingMinimization(message).minimizeDriving === true;
}

function isExplicitRoadTrip(message) {
  return /\broad\s*trip\b/i.test(String(message || '')) ||
    /\bdrive from\b/i.test(String(message || '')) ||
    /\bdriving (?:tour|from|to)\b/i.test(String(message || ''));
}

function isCompareOnly(message) {
  return /\bcompar(?:e|ing|ison)\b/i.test(String(message || ''));
}

function destinationOrderLooksExplicit(message, destinations) {
  if (!destinations || destinations.length < 2) return false;
  const text = String(message || '');
  if (/\b(?:through|via|then|→|->)\b/i.test(text)) return true;
  if (/\bfrom\b.+\bthrough\b/i.test(text)) return true;
  // "A + B" / "A and B" in planning context preserves mention order as explicit enough
  if (/\+|,\s*and\b|\band\b/i.test(text)) return true;
  return destinations.length >= 2;
}

/**
 * Build ordered route legs between origin (optional) and destinations.
 * Does NOT invent drive durations.
 *
 * Phase 9B.1 note: the leg statuses below ('unresolved_endpoint',
 * 'unresolved_coordinates', 'requires_driving_evidence') are this module's
 * own ROUTE-LEG layer vocabulary — a leg BETWEEN two already-identified
 * entities. This is a distinct concept from the DESTINATION/ENTITY-identity
 * layer's own coordinate status ('resolved' / 'unresolved_coords', used in
 * genericDestinationResolver.js / planningGeography.js / planningState.js /
 * trailieV2ExecutionService.js), which describes one entity's own coordinate
 * state before any leg exists. The similarly-spelled names are not a bug to
 * unify into one enum — each layer is internally consistent on its own.
 */
function buildRouteLegs({ origin = null, destinations = [], routeShape = 'unknown' } = {}) {
  const points = [];
  if (origin) points.push(origin);
  for (const d of destinations || []) points.push(d);

  const legs = [];
  const unresolved = [];

  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const leg = {
      ordinal: legs.length,
      fromEntityId: from?.entityId || null,
      toEntityId: to?.entityId || null,
      fromDisplayName: from?.displayName || null,
      toDisplayName: to?.displayName || null,
      fromHasCoordinates: from?.latitude != null && from?.longitude != null,
      toHasCoordinates: to?.latitude != null && to?.longitude != null,
      driveDurationMinutes: null,
      distance: null,
      status: 'pending_evidence',
    };

    if (!leg.fromEntityId || !leg.toEntityId) {
      leg.status = 'unresolved_endpoint';
      unresolved.push(leg);
    } else if (!leg.fromHasCoordinates || !leg.toHasCoordinates) {
      leg.status = 'unresolved_coordinates';
      unresolved.push(leg);
    } else {
      leg.status = 'requires_driving_evidence';
    }
    legs.push(leg);
  }

  if (routeShape === 'loop' && origin && destinations.length > 0) {
    const last = destinations[destinations.length - 1];
    const loopLeg = {
      ordinal: legs.length,
      fromEntityId: last?.entityId || null,
      toEntityId: origin?.entityId || null,
      fromDisplayName: last?.displayName || null,
      toDisplayName: origin?.displayName || null,
      fromHasCoordinates: last?.latitude != null && last?.longitude != null,
      toHasCoordinates: origin?.latitude != null && origin?.longitude != null,
      driveDurationMinutes: null,
      distance: null,
      status: 'pending_evidence',
      isLoopReturn: true,
    };
    if (!loopLeg.fromHasCoordinates || !loopLeg.toHasCoordinates || !loopLeg.fromEntityId || !loopLeg.toEntityId) {
      loopLeg.status = 'unresolved_coordinates';
      unresolved.push(loopLeg);
    } else {
      loopLeg.status = 'requires_driving_evidence';
    }
    legs.push(loopLeg);
  }

  return { routeLegs: legs, unresolvedRouteLegs: unresolved };
}

/**
 * Build the normalized multi-destination / road-trip contract for a user message.
 */
function buildTripScopeFromMessage(message, options = {}) {
  const text = String(message || '');
  const destinations = options.destinations || resolveDestinationsFromMessage(text, options);
  const origin = options.origin !== undefined ? options.origin : resolveOriginFromMessage(text);
  // The relationship — not the destination count — decides whether travel
  // between destinations is part of what the traveler asked for.
  const relationshipResult = options.destinationRelationship
    ? { relationship: options.destinationRelationship, confidence: options.destinationRelationshipConfidence ?? 0.9, reasonCodes: ['supplied_by_understanding'] }
    : resolveDestinationRelationship(text, destinations);
  const relationship = relationshipResult.relationship;
  const compare = CHOICE_RELATIONSHIPS.includes(relationship) || isCompareOnly(text);
  const roadTrip = isExplicitRoadTrip(text);
  const optimizationRequested = detectOptimizationRequested(text);
  const routeShape = detectRouteShape(text);
  const maxDailyDriveMinutes = parseMaxDailyDriveMinutes(text);
  // A numeric cap is itself an explicit feasibility ask, even without "realistic"/"minimize" wording.
  const drivingFeasibilityRequired = detectDrivingFeasibilityConstraint(text) || maxDailyDriveMinutes != null;
  const orderExplicit = !optimizationRequested && destinationOrderLooksExplicit(text, destinations);

  // Destination COUNT is evidence, not the decision. Two parks the traveler is
  // choosing between is not a two-park trip: `comparison_set` keeps both as
  // candidates while asserting no trip shape at all. Calling it
  // `multi_destination` made a choice look like a road trip, which demanded an
  // inter-destination identity/route contract nobody asked for and stonewalled
  // the turn before the model was ever called.
  let type = 'single_destination';
  if (compare) {
    type = destinations.length > 1 ? 'comparison_set' : 'single_destination';
  } else if (roadTrip) {
    type = 'road_trip';
  } else if (destinations.length > 1) {
    type = 'multi_destination';
  }

  const transportMode = roadTrip || /\b(?:drive|driving|road)\b/i.test(text)
    ? 'drive'
    : null;

  const travelBetweenDestinations = relationshipImpliesTravelBetweenDestinations(relationship);
  const needsRouteLegs =
    type === 'road_trip' ||
    (type === 'multi_destination' && !compare && travelBetweenDestinations && transportMode === 'drive');

  const { routeLegs, unresolvedRouteLegs } = needsRouteLegs
    ? buildRouteLegs({
      origin: type === 'road_trip' ? origin : null,
      destinations,
      routeShape: type === 'road_trip' ? routeShape : 'unknown',
    })
    : { routeLegs: [], unresolvedRouteLegs: [] };

  // Multi-destination itinerary without explicit road-trip still needs adjacent park legs
  // when planning a combined trip (not compare).
  let finalLegs = routeLegs;
  let finalUnresolved = unresolvedRouteLegs;
  if (
    type === 'multi_destination'
    && !compare
    && travelBetweenDestinations
    && finalLegs.length === 0
    && destinations.length > 1
  ) {
    const built = buildRouteLegs({ origin: null, destinations, routeShape: 'unknown' });
    finalLegs = built.routeLegs;
    finalUnresolved = built.unresolvedRouteLegs;
  }

  return {
    type,
    destinationRelationship: relationship,
    destinationRelationshipConfidence: relationshipResult.confidence,
    origin: type === 'road_trip' ? origin : (origin && roadTrip ? origin : null),
    destinations,
    destinationOrderExplicit: orderExplicit,
    userSuppliedOrder: !optimizationRequested,
    optimizationRequested,
    transportMode: type === 'road_trip' ? 'drive' : transportMode,
    routeShape: type === 'road_trip' ? routeShape : 'unknown',
    maxDailyDriveMinutes,
    drivingFeasibilityRequired,
    routeLegs: finalLegs,
    unresolvedRouteLegs: finalUnresolved,
  };
}

/**
 * Apply tripScope onto tripState (runtime contract only — not Mongo persistence).
 */
function applyTripScopeToTripState(tripState, tripScope) {
  if (!tripState || !tripScope) return tripState;
  const next = tripState;
  // Authoritative multi-destination / road-trip contract. `destination` singleton
  // remains for backward-compatible single-park Trailie (primary focus).
  next.roadTrip = tripScope;
  next.tripScope = tripScope; // alias kept for Pass #3 callers
  if (tripScope.transportMode) {
    next.transportation = next.transportation || {};
    next.transportation.mode = tripScope.transportMode;
  }
  if (tripScope.origin?.displayName) {
    next.transportation = next.transportation || {};
    next.transportation.startLocation = tripScope.origin.displayName;
  }
  if (tripScope.destinations?.length) {
    const primary = tripScope.destinations[0];
    next.destination = next.destination || {};
    if (primary.parkCode) next.destination.parkCode = primary.parkCode;
    if (primary.displayName) next.destination.parkName = primary.displayName;
  }
  if (tripScope.maxDailyDriveMinutes != null) {
    next.preferences = next.preferences || {};
    next.preferences.maxDailyDriveMinutes = tripScope.maxDailyDriveMinutes;
  }
  return next;
}

/**
 * Planner entities: destinations in order; for road trips prepend origin when resolved with coords.
 */
function plannerEntitiesFromTripScope(tripScope, { requireCoordinates = true } = {}) {
  if (!tripScope) return [];
  const destEntities = toPlannerEntities(tripScope.destinations || [], {
    includeUnresolvedCoords: !requireCoordinates,
  });
  if (tripScope.type !== 'road_trip' || !tripScope.origin) return destEntities;

  const originEntities = toPlannerEntities([tripScope.origin], {
    includeUnresolvedCoords: !requireCoordinates,
  });
  // Origin is for route legs; planner destination topics should still target parks.
  // Return park destinations for per-park evidence; routeScope uses ordered park list.
  // Origin→first park is handled via explicit routeLegs in validators / optional first entity.
  return destEntities;
}

/**
 * Build driving_time routeScope objects for Evidence Planner from tripScope legs
 * that have coordinates on both ends (excluding unresolved).
 */
function drivingRouteScopesFromTripScope(tripScope) {
  if (!tripScope?.routeLegs?.length) return [];
  const byId = new Map();
  if (tripScope.origin?.entityId) byId.set(tripScope.origin.entityId, tripScope.origin);
  for (const d of tripScope.destinations || []) {
    if (d.entityId) byId.set(d.entityId, d);
  }

  const scopes = [];
  for (const leg of tripScope.routeLegs) {
    if (leg.status !== 'requires_driving_evidence') continue;
    const from = byId.get(leg.fromEntityId);
    const to = byId.get(leg.toEntityId);
    if (!from || !to) continue;
    if (from.latitude == null || from.longitude == null || to.latitude == null || to.longitude == null) {
      continue;
    }
    scopes.push({
      origin: {
        entityId: from.entityId,
        displayName: from.displayName,
        latitude: from.latitude,
        longitude: from.longitude,
      },
      destination: {
        entityId: to.entityId,
        displayName: to.displayName,
        latitude: to.latitude,
        longitude: to.longitude,
      },
      travelMode: 'driving',
      legOrdinal: leg.ordinal,
      isLoopReturn: !!leg.isLoopReturn,
    });
  }
  return scopes;
}

module.exports = {
  TRIP_SCOPE_TYPES,
  ROUTE_SHAPES,
  emptyTripScope,
  parseMaxDailyDriveMinutes,
  detectDrivingFeasibilityConstraint,
  detectRouteShape,
  detectOptimizationRequested,
  isExplicitRoadTrip,
  buildRouteLegs,
  buildTripScopeFromMessage,
  applyTripScopeToTripState,
  plannerEntitiesFromTripScope,
  drivingRouteScopesFromTripScope,
  parseCountToken,
};
