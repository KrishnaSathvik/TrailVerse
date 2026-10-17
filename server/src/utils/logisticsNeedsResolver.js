'use strict';

/**
 * Pure demand gate for Travel & Stay Logistics v1.
 * Decides which logistics slices to activate — no provider I/O.
 */

const TRIP_PLANNING_INTENTS = new Set([
  'full_trip',
  'simple_itinerary',
  'refinement',
  'trip_refinement',
  'lodging_strategy',
  'transport',
  'flight_strategy',
]);

const INSIDE_PARK_STAY_PREFERENCES = new Set(['lodge', 'cabin']);
const GATEWAY_STAY_PREFERENCES = new Set(['hotel', 'lodge', 'cabin']);
const CAMPING_STAY_PREFERENCES = new Set(['campground', 'rv']);

function emptyLogisticsNeeds() {
  return {
    routeLegs: false,
    airports: false,
    insideParkLodging: false,
    gatewayLodging: false,
    campgrounds: false,
    rvFilter: false,
    vacationRentalHint: false,
    reasons: [],
  };
}

function normalizeText(messageText) {
  return typeof messageText === 'string' ? messageText.trim() : '';
}

function hasRoadTripShape(text) {
  // Explicit "road trip" only — bare "A to B to C" phrasing (e.g. skill levels) is not route shape.
  return /\broad\s*trip\b/i.test(text);
}

function detectMessageCues(text) {
  return {
    fly: /\b(?:fly|flying|flight|airport|airports)\b/i.test(text),
    driveTime: /\b(?:driving|drive\s*time|hours?\s+driving|max\s+\d+\s+hours?\s+driving)\b/i.test(text),
    roadTrip: /\broad\s*trip\b/i.test(text),
    routeShape: hasRoadTripShape(text),
    lodge: /\blodge\b/i.test(text),
    hotel: /\b(?:hotel|motel)\b/i.test(text),
    cabin: /\bcabin\b/i.test(text),
    camp: /\b(?:camp|camping|campground)\b/i.test(text),
  };
}

function inferStayFromMessage(cues) {
  if (cues.camp) return 'campground';
  if (cues.lodge) return 'lodge';
  if (cues.hotel) return 'hotel';
  if (cues.cabin) return 'cabin';
  return null;
}

function resolveLogisticsNeeds({
  planningState = null,
  tripState = null,
  intent = null,
  messageText = '',
  tripScope = null,
} = {}) {
  void tripState;

  const primaryIntent = intent?.primaryIntent || null;
  if (!TRIP_PLANNING_INTENTS.has(primaryIntent)) {
    return emptyLogisticsNeeds();
  }

  const text = normalizeText(messageText);
  const cues = detectMessageCues(text);
  const planning = planningState || {};
  const transport = planning.transportation || {};
  const lodging = planning.lodging || {};
  const scope = tripScope || {};

  const mode = transport.mode || null;
  const stayPreference = lodging.stayPreference || 'unknown';
  const accommodationClass = lodging.type || lodging.accommodationClass || 'unknown';

  const hasScopeRouteLegs = Array.isArray(scope.routeLegs) && scope.routeLegs.length > 0;
  const hasPersistedDeparture = Boolean(transport.departureCity || transport.departureAirportCode);
  const hasPersistedFly = mode === 'fly' && hasPersistedDeparture;
  const hasPersistedDrive = mode === 'drive';
  const hasPersistedStay = stayPreference !== 'unknown';
  const hasPersistedCampingClass = accommodationClass === 'camping';

  const hasTransportSignal = Boolean(
    mode === 'fly'
    || mode === 'drive'
    || hasPersistedFly
    || hasPersistedDrive
    || hasScopeRouteLegs
    || cues.fly
    || cues.driveTime
    || cues.roadTrip
    || cues.routeShape
  );

  const hasStaySignal = Boolean(
    hasPersistedStay
    || hasPersistedCampingClass
    || cues.lodge
    || cues.hotel
    || cues.cabin
    || cues.camp
  );

  const isFullTripLike = primaryIntent === 'full_trip' || primaryIntent === 'simple_itinerary';
  const isRefinement = primaryIntent === 'refinement' || primaryIntent === 'trip_refinement';
  const isLodgingStrategy = primaryIntent === 'lodging_strategy';

  if ((isFullTripLike || isRefinement) && !hasTransportSignal && !hasStaySignal) {
    return emptyLogisticsNeeds();
  }

  const effectiveStay = stayPreference !== 'unknown'
    ? stayPreference
    : (isLodgingStrategy ? inferStayFromMessage(cues) : null);

  const needs = emptyLogisticsNeeds();
  const reasons = [];

  if (hasPersistedDrive || hasScopeRouteLegs || cues.driveTime || cues.roadTrip || cues.routeShape) {
    needs.routeLegs = true;
    if (hasPersistedDrive) reasons.push('transport_mode_drive');
    if (hasScopeRouteLegs) reasons.push('trip_scope_route_legs');
    if (cues.roadTrip || cues.routeShape) reasons.push('message_road_trip');
    if (cues.driveTime) reasons.push('message_drive_time');
  }

  if (mode === 'fly' || cues.fly || hasPersistedFly) {
    needs.airports = true;
    if (mode === 'fly') reasons.push('transport_mode_fly');
    if (cues.fly) reasons.push('message_fly_cue');
    if (hasPersistedFly) reasons.push('persisted_departure_context');
  }

  const activatesInsidePark = (effectiveStay && INSIDE_PARK_STAY_PREFERENCES.has(effectiveStay))
    || (isLodgingStrategy && (cues.lodge || cues.cabin));

  if (activatesInsidePark) {
    needs.insideParkLodging = true;
    if (effectiveStay && INSIDE_PARK_STAY_PREFERENCES.has(effectiveStay)) {
      reasons.push('stay_preference_inside_park');
    } else {
      reasons.push('lodging_strategy_lodge_cue');
    }
  }

  const activatesGateway = (effectiveStay && GATEWAY_STAY_PREFERENCES.has(effectiveStay))
    || (isLodgingStrategy && cues.hotel)
    || (needs.insideParkLodging && effectiveStay && INSIDE_PARK_STAY_PREFERENCES.has(effectiveStay));

  if (activatesGateway) {
    needs.gatewayLodging = true;
    if (effectiveStay && GATEWAY_STAY_PREFERENCES.has(effectiveStay)) {
      reasons.push('stay_preference_gateway');
    } else if (isLodgingStrategy && cues.hotel) {
      reasons.push('lodging_strategy_hotel_cue');
    } else {
      reasons.push('inside_park_gateway_fallback');
    }
  }

  const activatesCampgrounds = (effectiveStay && CAMPING_STAY_PREFERENCES.has(effectiveStay))
    || (isLodgingStrategy && (hasPersistedCampingClass || cues.camp));

  if (activatesCampgrounds) {
    needs.campgrounds = true;
    if (effectiveStay && CAMPING_STAY_PREFERENCES.has(effectiveStay)) {
      reasons.push('stay_preference_camping');
    } else {
      reasons.push('lodging_strategy_camping');
    }
  }

  if (effectiveStay === 'rv') {
    needs.rvFilter = true;
    reasons.push('stay_preference_rv');
  }

  if (effectiveStay === 'vacation_rental') {
    needs.vacationRentalHint = true;
    reasons.push('stay_preference_vacation_rental');
  }

  needs.reasons = [...new Set(reasons)];
  return needs;
}

module.exports = {
  resolveLogisticsNeeds,
};
