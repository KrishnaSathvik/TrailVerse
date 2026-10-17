'use strict';

const PRIMARY_INTENTS = Object.freeze([
  'general_qa',
  'destination_discovery',
  'place_discovery',
  'compare',
  'lodging_strategy',
  'hotel_live_search',
  'flight_strategy',
  'flight_live_search',
  'transport',
  'local_business_food',
  'activities_tours_events',
  'permit_camping',
  'simple_itinerary',
  'full_trip',
  'deep_research',
  'live_in_trip_assistance',
  'trip_refinement',
  'meta_help',
  'unsupported_non_travel',
]);

const INTENT_CLASSIFIER_VERSION = 'trailie-intent-v2.0.0';
const VERTICALS = Object.freeze([
  'parks',
  'places',
  'lodging',
  'flights',
  'transport',
  'food_local',
  'activities',
  'events',
  'permits',
  'camping',
  'weather',
  'safety',
  'itinerary',
]);
const DEPTHS = Object.freeze(['quick', 'standard', 'planning', 'deep']);
const FRESHNESS_LEVELS = Object.freeze(['stable', 'current', 'live', 'safety_critical']);
const ACTIONABILITY_LEVELS = Object.freeze([
  'informational',
  'recommendation',
  'planning',
  'transactional',
  'mutation',
]);
const SCOPES = Object.freeze(['general', 'single_destination', 'multi_destination', 'active_trip', 'non_travel']);

/** @deprecated Prefer genericDestinationResolver / parkExtractor catalog — kept only for legacy single-name hints in tests. */
const PARK_CODES = Object.freeze({
  yosemite: 'yose',
  yellowstone: 'yell',
  'grand canyon': 'grca',
  'zion': 'zion',
  'bryce canyon': 'brca',
  sequoia: 'sequ',
  'kings canyon': 'kica',
  'death valley': 'deva',
  acadia: 'acad',
  denali: 'dena',
  glacier: 'glac',
  'grand teton': 'grte',
  olympic: 'olym',
  'mount rainier': 'mora',
  'joshua tree': 'jotr',
});

const { resolveDestinationsFromMessage } = require('../utils/genericDestinationResolver');
const {
  hasExplicitItinerarySignal,
  isPriorityContingencyAdvice,
} = require('../utils/priorityContingencyAdvice');
const {
  extractDurationDays: extractSpokenDurationDays,
  resolveTravelerJob,
  jobToPrimaryIntent,
  TRAVELER_JOBS,
} = require('./trailieTravelerJobResolver');
const { ARTIFACTS, STRUCTURE_POLICIES } = require('./turnUnderstanding');
const { deriveExecutionContract, INTENT_SOURCES } = require('./trailieExecutionContract');
const { isAcceptedCanonicalPlan, isDraftPlan, hasPriorPlanStructure } = require('../utils/canonicalPlanAcceptance');
const { DESTINATION_RELATIONSHIPS } = require('../utils/destinationRelationship');
const {
  resolveTopicActions,
  topicMayOwnJob,
} = require('../utils/dominantIntentArbitration');

const SAFETY_CRITICAL = /\b(wildfire|smoke|emergency|evacuat(?:e|ion)|flash flood|air quality warning)\b/i;
const LIVE_TIME = /\b(right now|currently|today|tonight|tomorrow|open now|this weekend|next friday|available|availability|active alerts?|still closed)\b/i;
const OPERATIONAL = /(?:\b(?:road|trail|route|shuttle)\b.{0,40}\b(?:open|closed|closure|running|status|condition)\b|\b(?:open|closed|closure|running|status|condition)\b.{0,40}\b(?:road|trail|route|shuttle)\b|\bactive alerts?\b|\b(?:wildfire|smoke|emergency)\b)/i;
// Active-trip mutation cues. Keep general — do not special-case demo sentences.
// Requires hasActiveTrip/hasItinerary; without an active plan these must not
// blindly become trip_refinement.
const REFINEMENT = /\b(make day\s*\d+|make it|more relaxed|less rushed|remove|delete|swap|replace|adjust|change|update|refine|avoid|move .{0,40}(?:tomorrow|today|day\s*\d+)|add (?:a |an |one )?(?:sunset|sunrise|stop|hike|viewpoint|day|plan)|add .* (?:day|plan)|this plan|the plan)\b/i;
const DEEP_RESEARCH = /\b(deep research|research report|comprehensive research|in-depth research|deep dive)\b/i;
const LODGING = /\b(hotels?|motels?|lodg(?:e|ing)|cabins?|rooms?|airbnb|accommodations?|where should (?:we|i) stay|stay inside|stay around)\b/i;
const FLIGHT = /\b(flights?|fly into|airport|airfare)\b/i;
const LIVE_INVENTORY = /\b(find|show|book|available|availability|cheapest|price|under\s*\$|below\s*\$|tonight|tomorrow|next friday|this weekend)\b/i;
const TRANSPORT = /\b(shuttle|transit|bus|train|airport|drives?|driving|roads?|without a car|parking|where (?:should|can) i park|route|road trip|access options?)\b/i;
const FOOD = /\b(restaurants?|food|eat|dinner|lunch|breakfast|coffee shops?|cafes?|dining)\b/i;
const ACTIVITIES = /\b(things to do|activities|hikes?|hiking|viewpoints?|tours?|rafting|ranger programs?|guided|wildlife)\b/i;
const EVENTS = /\b(events?|happening|ranger programs?)\b/i;
const PERMITS = /\b(permits?|lottery|timed entry|reservations?)\b/i;
const CAMPING = /\b(campgrounds?|camping|campsites?)\b/i;
const COMPARE = /\b(compare|versus|vs\.?|which is better(?:\s+between)?|should i (?:choose|pick)|pick one|help me (?:choose|pick) between)\b/i;
const DESTINATION_DISCOVERY = /\b(best national parks?|recommend (?:a |some )?(?:national )?parks?|where should i go|where should we go|help me (?:pick|choose) (?:a )?(?:park|destination))\b/i;
const PLACE_DISCOVERY = /\b(things to do|best .* hikes?|what .* (?:see|do)|viewpoints?|attractions?)\b/i;
const META_HELP = /\b(what can trailie|how do i .*trailie|can you search the web|what can you do|how does trailie)\b/i;
const NON_TRAVEL = /\b(python|javascript|sort an array|integral of|algebra|recipe|chocolate cake|write (?:a )?function|debug my code)\b/i;

function addVerticals(target, values) {
  for (const value of values) if (!target.includes(value)) target.push(value);
}

function extractDurationDays(message) {
  return extractSpokenDurationDays(message);
}

function hasMultiDestinationTrip(message) {
  if (/\b(?:through|across)\b/i.test(message) && /\b(?:and|,)\b/i.test(message)) return true;
  if (/\broad trip through\b/i.test(message)) return true;
  const destinations = resolveDestinationsFromMessage(message);
  return destinations.length >= 2 && hasExplicitItinerarySignal(message);
}

function isPermitInformationalAsk(message) {
  return (
    /\b(?:do i need|need (?:a )?(?:permit|reservation)|how (?:do|does|to)\b.{0,40}\b(?:permit|reservation|campground)|without (?:a )?reservation|can i (?:get|obtain|secure)\b.{0,30}\b(?:permit|reservation)|lottery|timed entry)\b/i.test(
      message
    ) ||
    /\b(?:are any|is there|available|availability)\b.{0,40}\b(?:campground|campsite|permit|reservation)s?\b/i.test(
      message
    ) ||
    /\bcan i camp\b.{0,40}\b(?:overnight|without|reservation|permit)\b/i.test(message)
  );
}

/**
 * Destination + duration + party/lodging/camping (or want+activities) = trip planning
 * even without an explicit "plan"/"itinerary" verb.
 * Does not swallow event/permit Q&A or pure activity lookups.
 */
function isImplicitTripPlanning(message, durationDays) {
  if (durationDays == null) return false;
  if (isPermitInformationalAsk(message)) return false;
  if (
    /\b(?:what|which|are there|any)\b.{0,48}\b(?:events?|ranger programs?|tours?|happening)\b/i.test(
      message
    )
  ) {
    return false;
  }

  const destinations = resolveDestinationsFromMessage(message);
  if (!destinations.length) return false;

  const hasParty =
    /\b(?:friends?|family|kids?|children|couple|solo|group|of us|together)\b/i.test(message) ||
    /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:friends|people|adults|kids|children)\b/i.test(
      message
    );
  const hasLodgingOrCamping =
    CAMPING.test(message) ||
    LODGING.test(message) ||
    /\b(?:camp|hotel|cabin|lodging|motel|airbnb)\b/i.test(message);
  const wantsActivities =
    ACTIVITIES.test(message) &&
    /\b(?:want|we(?:'ll| will)|looking for|trip)\b/i.test(message);

  return hasParty || hasLodgingOrCamping || wantsActivities;
}

function buildEntities(message) {
  const entities = [];
  const destinations = resolveDestinationsFromMessage(message);
  for (const dest of destinations) {
    if (!dest.parkCode) continue;
    entities.push({
      type: 'destination',
      role: 'target',
      canonicalId: `park:nps:${dest.parkCode}`,
      confidence: dest.resolutionConfidence ?? 1,
    });
  }
  if (/\b(?:today|tonight|tomorrow|this weekend|next friday|[A-Z][a-z]+\s+\d{1,2})\b/.test(message)) {
    entities.push({ type: 'date_window', role: 'constraint', canonicalId: null, confidence: 0.9 });
  }
  return entities;
}

/**
 * @param {object} [params.understanding] pre-built (optionally semantically
 *   refined) TurnUnderstanding. Supplied when a turn has already been through
 *   the semantic resolver so the classification reflects the refined reading.
 */
function classifyTrailieIntent({ userPrompt = '', priorTripState = null, understanding = null, officialPlaces = null } = {}) {
  const message = String(userPrompt || '').trim();
  const verticals = [];
  const reasonCodes = [];
  const travelerJobResolved = resolveTravelerJob({ userPrompt: message, priorTripState, understanding, officialPlaces });
  const durationDays = travelerJobResolved.durationDays;
  const topicActions = resolveTopicActions(message, {
    produce: travelerJobResolved.job === 'day_by_day_itinerary'
      || travelerJobResolved.understanding?.askedToProduceTripArtifact === true,
  });
  const activeTrip = priorTripState?.hasActiveTrip === true || priorTripState?.hasItinerary === true;
  const safetyCritical = SAFETY_CRITICAL.test(message);
  const liveTime = LIVE_TIME.test(message);
  const operational = OPERATIONAL.test(message);
  const safetyOperational = safetyCritical || /\b(?:closed|closure|active alerts?)\b|\broad\b.{0,30}\bopen\b/i.test(message);
  const multiDestination = hasMultiDestinationTrip(message);

  if (/\b(?:national parks?|yosemite|yellowstone|acadia|denali|glacier|zion|sequoia|olympic|grand canyon|death valley|bryce canyon|mount rainier)\b/i.test(message)) addVerticals(verticals, ['parks']);
  if (/\bweather\b/i.test(message)) addVerticals(verticals, ['weather']);
  if (LODGING.test(message)) addVerticals(verticals, ['lodging']);
  if (FLIGHT.test(message)) addVerticals(verticals, ['flights']);
  if (TRANSPORT.test(message)) addVerticals(verticals, ['transport']);
  if (FOOD.test(message)) addVerticals(verticals, ['food_local']);
  if (ACTIVITIES.test(message)) addVerticals(verticals, ['activities']);
  if (EVENTS.test(message)) addVerticals(verticals, ['events']);
  if (PERMITS.test(message)) addVerticals(verticals, ['permits']);
  if (CAMPING.test(message)) addVerticals(verticals, ['camping', 'permits']);
  if (safetyOperational) addVerticals(verticals, ['safety']);
  if (
    travelerJobResolved.job !== 'trip_skeleton'
    && !travelerJobResolved.forbidsDayByDay
    && (hasExplicitItinerarySignal(message) || (activeTrip && REFINEMENT.test(message)))
  ) addVerticals(verticals, ['itinerary']);

  let primaryIntent = 'general_qa';
  let depth = 'quick';
  let actionability = /\b(best|recommend|should)\b/i.test(message) ? 'recommendation' : 'informational';
  let scope = 'single_destination';
  let confidence = 0.9;

  const jobOverrideIntents = new Set([
    'trip_duration_advice',
    'trip_skeleton',
    'origin_refinement',
    'constraint_update',
    'place_discovery',
    'access_contingency',
    'route_planning',
    'permits_reservations',
  ]);
  const applyJobOverride = jobOverrideIntents.has(travelerJobResolved.job)
    || (travelerJobResolved.job === 'day_by_day_itinerary'
      && !hasExplicitItinerarySignal(message)
      && !/\bmake day\s*\d+\b/i.test(message))
    || (travelerJobResolved.job === 'itinerary_refinement'
      && travelerJobResolved.reasonCodes.includes('pace_refinement'))
    || (travelerJobResolved.job === 'airport_strategy'
      && travelerJobResolved.reasonCodes.includes('gateway_city_strategy'));

  if (applyJobOverride) {
    primaryIntent = jobToPrimaryIntent(travelerJobResolved);
    reasonCodes.push(...travelerJobResolved.reasonCodes);
    if (primaryIntent === 'trip_refinement') {
      verticals.splice(0, verticals.length, 'itinerary');
      depth = 'planning';
      actionability = 'mutation';
      scope = 'active_trip';
      confidence = 0.96;
      reasonCodes.push('active_trip_mutation');
    } else if (primaryIntent === 'flight_strategy') {
      depth = 'standard';
      actionability = 'recommendation';
      confidence = 0.94;
      addVerticals(verticals, ['flights', 'transport']);
    } else if (primaryIntent === 'simple_itinerary' || primaryIntent === 'full_trip') {
      depth = primaryIntent === 'full_trip' ? 'deep' : 'planning';
      actionability = 'planning';
      confidence = 0.97;
      addVerticals(verticals, ['itinerary']);
      reasonCodes.push('explicit_itinerary_request');
      if (durationDays != null) {
        reasonCodes.push(durationDays >= 4 ? 'long_trip_duration' : 'short_trip_duration');
      }
      if (hasMultiDestinationTrip(message) || resolveDestinationsFromMessage(message).length >= 2) {
        reasonCodes.push('multi_destination_trip');
        scope = 'multi_destination';
      }
    } else if (travelerJobResolved.job === 'trip_skeleton') {
      depth = 'planning';
      actionability = 'planning';
      confidence = 0.95;
      addVerticals(verticals, ['parks']);
      const itineraryIdx = verticals.indexOf('itinerary');
      if (itineraryIdx >= 0) verticals.splice(itineraryIdx, 1);
    } else if (travelerJobResolved.job === 'access_contingency') {
      depth = 'standard';
      actionability = 'recommendation';
      confidence = 0.96;
      addVerticals(verticals, ['transport']);
    } else if (travelerJobResolved.job === 'trip_duration_advice') {
      depth = 'standard';
      actionability = 'recommendation';
      confidence = 0.95;
    } else if (travelerJobResolved.job === 'route_planning') {
      depth = /\bwithout a car\b/i.test(message) ? 'standard' : 'quick';
      actionability = /\bwhere should i park\b/i.test(message) ? 'recommendation' : 'informational';
      confidence = 0.95;
      addVerticals(verticals, ['transport']);
    } else if (travelerJobResolved.job === 'permits_reservations') {
      depth = /\bhow .* work\b/i.test(message) || LIVE_INVENTORY.test(message) ? 'standard' : 'quick';
      actionability = LIVE_INVENTORY.test(message) ? 'transactional' : 'informational';
      confidence = 0.96;
    } else if (primaryIntent === 'place_discovery' || primaryIntent === 'destination_discovery') {
      depth = 'standard';
      actionability = 'recommendation';
      confidence = 0.93;
      if (primaryIntent === 'place_discovery') addVerticals(verticals, ['activities']);
      else addVerticals(verticals, ['parks']);
    }
  } else if (META_HELP.test(message)) {
    primaryIntent = 'meta_help';
    verticals.splice(0, verticals.length, ...(/save this trip/i.test(message) ? ['itinerary'] : []));
    scope = 'general';
    confidence = 0.97;
    reasonCodes.push('trailie_meta_question');
  } else if (NON_TRAVEL.test(message)) {
    primaryIntent = 'unsupported_non_travel';
    verticals.splice(0);
    scope = 'non_travel';
    confidence = 0.98;
    reasonCodes.push('non_travel_request');
  } else if (activeTrip && REFINEMENT.test(message)) {
    primaryIntent = 'trip_refinement';
    verticals.splice(0, verticals.length, 'itinerary');
    depth = 'planning';
    actionability = 'mutation';
    scope = 'active_trip';
    confidence = 0.98;
    addVerticals(verticals, ['itinerary']);
    reasonCodes.push('active_trip_mutation');
  } else if (DEEP_RESEARCH.test(message)) {
    primaryIntent = 'deep_research';
    depth = 'deep';
    actionability = 'informational';
    confidence = 0.96;
    if (/\bparks?\b/i.test(message)) addVerticals(verticals, ['parks']);
    reasonCodes.push('explicit_deep_research');
  } else if (operational) {
    primaryIntent = 'live_in_trip_assistance';
    depth = FOOD.test(message) || LODGING.test(message) ? 'standard' : 'quick';
    actionability = /\bwhat should i do|where can we eat\b/i.test(message) ? 'recommendation' : 'informational';
    confidence = 0.98;
    reasonCodes.push(safetyCritical ? 'safety_critical_signal' : 'operational_status_request');
    if (!safetyCritical) reasonCodes.push('operational_status_request');
    if (/\broad|route|shuttle\b/i.test(message)) addVerticals(verticals, ['transport']);
  } else if (LODGING.test(message) && LIVE_INVENTORY.test(message)) {
    primaryIntent = 'hotel_live_search';
    depth = 'standard';
    actionability = 'transactional';
    confidence = 0.97;
    reasonCodes.push('live_inventory_request');
  } else if (FLIGHT.test(message) && LIVE_INVENTORY.test(message)) {
    primaryIntent = 'flight_live_search';
    depth = 'standard';
    actionability = 'transactional';
    confidence = 0.97;
    reasonCodes.push('live_inventory_request');
  } else if (FLIGHT.test(message)) {
    primaryIntent = 'flight_strategy';
    depth = 'standard';
    actionability = 'recommendation';
    confidence = 0.94;
    addVerticals(verticals, ['flights']);
    if (/\bairport|fly into\b/i.test(message)) addVerticals(verticals, ['transport']);
    reasonCodes.push('flight_planning_advice');
  } else if (COMPARE.test(message)) {
    // Compare before itinerary / implicit trip framing: duration language
    // ("3 days") must not swallow explicit park choice / pick-one questions.
    primaryIntent = 'compare';
    depth = 'standard';
    actionability = 'recommendation';
    scope = 'multi_destination';
    confidence = 0.96;
    reasonCodes.push('explicit_comparison');
  } else if (isPriorityContingencyAdvice(message)) {
    primaryIntent = 'general_qa';
    depth = 'standard';
    actionability = 'recommendation';
    confidence = 0.96;
    addVerticals(verticals, ['transport']);
    reasonCodes.push('priority_contingency_advice');
    scope = 'single_destination';
  } else if (
    !travelerJobResolved.forbidsDayByDay
    && travelerJobResolved.job !== 'trip_duration_advice'
    && (hasExplicitItinerarySignal(message) || /\bmake day\s*\d+\b/i.test(message))
  ) {
    const fullTrip = durationDays != null ? durationDays >= 4 : multiDestination;
    primaryIntent = fullTrip ? 'full_trip' : 'simple_itinerary';
    depth = fullTrip ? 'deep' : 'planning';
    actionability = 'planning';
    confidence = 0.97;
    addVerticals(verticals, ['itinerary']);
    if (/\bday\s*\d+\b/i.test(message)) reasonCodes.push('day_structure_signal');
    else reasonCodes.push('explicit_itinerary_request');
    if (durationDays != null) reasonCodes.push(durationDays >= 4 ? 'long_trip_duration' : 'short_trip_duration');
    if (multiDestination) reasonCodes.push('multi_destination_trip');
    if (/\b(?:two kids|multiple constraints|no drives over|wheelchair|budget).{0,80}\b/i.test(message)) reasonCodes.push('complex_constraints');
    scope = multiDestination ? 'multi_destination' : 'single_destination';
  } else if (
    isImplicitTripPlanning(message, durationDays) &&
    !isPermitInformationalAsk(message)
  ) {
    const fullTrip = durationDays != null ? durationDays >= 4 : multiDestination;
    primaryIntent = fullTrip ? 'full_trip' : 'simple_itinerary';
    depth = fullTrip ? 'deep' : 'planning';
    actionability = 'planning';
    confidence = 0.94;
    addVerticals(verticals, ['itinerary']);
    reasonCodes.push('implicit_trip_framing');
    if (durationDays != null) reasonCodes.push(durationDays >= 4 ? 'long_trip_duration' : 'short_trip_duration');
    if (multiDestination) reasonCodes.push('multi_destination_trip');
    scope = multiDestination ? 'multi_destination' : 'single_destination';
  } else if (
    (CAMPING.test(message) || (PERMITS.test(message) && topicMayOwnJob('permits_reservations', topicActions)))
    && !hasExplicitItinerarySignal(message)
  ) {
    primaryIntent = 'permit_camping';
    depth = /\bhow .* work\b/i.test(message) || LIVE_INVENTORY.test(message) ? 'standard' : 'quick';
    actionability = LIVE_INVENTORY.test(message) ? 'transactional' : 'informational';
    confidence = 0.96;
    reasonCodes.push('permit_or_camping_request');
    if (LIVE_INVENTORY.test(message)) reasonCodes.push('live_inventory_request');
  } else if (LODGING.test(message)) {
    primaryIntent = 'lodging_strategy';
    depth = 'standard';
    actionability = 'recommendation';
    confidence = 0.95;
    reasonCodes.push('lodging_advice');
  } else if (FOOD.test(message)) {
    primaryIntent = 'local_business_food';
    depth = /\bright now\b/i.test(message) ? 'quick' : 'standard';
    actionability = 'recommendation';
    confidence = 0.95;
    reasonCodes.push('local_food_request');
  } else if (EVENTS.test(message) || /\b(?:guided|rafting tour)\b/i.test(message)) {
    primaryIntent = 'activities_tours_events';
    depth = liveTime && /\btoday\b/i.test(message) ? 'quick' : 'standard';
    actionability = 'recommendation';
    confidence = 0.95;
    reasonCodes.push('activity_event_request');
  } else if (TRANSPORT.test(message) && topicMayOwnJob('route_planning', topicActions)) {
    primaryIntent = 'transport';
    depth = /\bwithout a car\b/i.test(message) ? 'standard' : 'quick';
    actionability = /\bwhere should i park\b/i.test(message) ? 'recommendation' : 'informational';
    confidence = 0.95;
    reasonCodes.push('transport_question');
  } else if (DESTINATION_DISCOVERY.test(message)) {
    primaryIntent = 'destination_discovery';
    depth = 'standard';
    actionability = 'recommendation';
    confidence = 0.94;
    if (verticals.length === 0) addVerticals(verticals, [/\bnational park\b/i.test(message) ? 'parks' : 'places']);
    reasonCodes.push('open_ended_destination_choice');
  } else if (PLACE_DISCOVERY.test(message) && topicMayOwnJob('place_discovery', topicActions)) {
    primaryIntent = 'place_discovery';
    depth = 'standard';
    actionability = 'recommendation';
    confidence = 0.94;
    addVerticals(verticals, ['activities']);
    reasonCodes.push('destination_activity_discovery');
  } else {
    primaryIntent = 'general_qa';
    confidence = /\btrip\b/i.test(message) && !/\b(?:park|travel|visit|road|hotel|flight)\b/i.test(message) ? 0.62 : 0.9;
    reasonCodes.push(confidence < 0.8 ? 'ambiguous_travel_request' : 'general_travel_question');
  }

  // -------------------------------------------------------------------------
  // ExecutionContract reconciliation — the canonical understanding is the
  // authority on WHICH ARTIFACT this turn may require. The legacy ladder above
  // keeps its useful roles (topical verticals, freshness, model-routing depth)
  // but may not contradict explicit canonical semantics.
  //
  // Precedence: RAW MESSAGE -> TurnUnderstanding -> ExecutionContract ->
  // legacy/public intent metadata -> evidence + generation.
  // -------------------------------------------------------------------------
  const priorPlanCandidate = priorTripState?.existingCanonicalPlan
    || priorTripState?.canonicalPlan
    || null;
  const hasPriorPlan = !isDraftPlan(priorPlanCandidate)
    && (priorTripState?.hasItinerary === true || hasPriorPlanStructure(priorPlanCandidate));
  const patchablePrior = isAcceptedCanonicalPlan(priorPlanCandidate)
    || (priorTripState?.hasItinerary === true && !priorPlanCandidate);
  const executionContract = deriveExecutionContract({
    understanding: travelerJobResolved.understanding,
    travelerJob: travelerJobResolved.job,
    legacy: { primaryIntent, depth, verticals },
    // Patchability: accepted stops, or thin hasItinerary flag without a draft.
    hasPriorPlan: patchablePrior,
  });

  // CEILING — downstream classification may not require a stronger artifact
  // than the canonical structure policy allows. A duration ("four days") is
  // not a request for a day-by-day plan, and an explicit prohibition is
  // absolute.
  //
  // The `verticals` list is a TOPICAL/evidence hint, so an escalation blocked
  // here keeps its topical influence and is recorded as a reconciliation. An
  // explicit PROHIBITION is different: the traveler said not to build it, and
  // no downstream stage may carry the artifact vertical at all.
  if (!executionContract.allowsCanonicalPlanArtifact) {
    reasonCodes.push(...executionContract.reasonCodes.filter(
      (code) => code === 'legacy_artifact_escalation_blocked'
        || code === 'legacy_artifact_prohibition_enforced'
    ));
    if (executionContract.forbiddenArtifacts.includes('itinerary')) {
      const itineraryIdx = verticals.indexOf('itinerary');
      if (itineraryIdx >= 0) verticals.splice(itineraryIdx, 1);
    }
  }

  // FLOOR — an artifact the traveler explicitly asked for cannot be silently
  // downgraded to prose because no phrase pattern recognised the request.
  if (executionContract.requiresCanonicalPlanArtifact) {
    const jobIntent = jobToPrimaryIntent(travelerJobResolved);
    if (jobIntent === 'trip_refinement' || jobIntent === 'simple_itinerary' || jobIntent === 'full_trip') {
      if (primaryIntent !== jobIntent) {
        primaryIntent = jobIntent;
        reasonCodes.push('legacy_artifact_downgrade_blocked');
      }
      addVerticals(verticals, ['itinerary']);
      if (jobIntent === 'trip_refinement') {
        actionability = 'mutation';
        scope = 'active_trip';
        depth = depth === 'quick' ? 'planning' : depth;
      } else {
        actionability = 'planning';
        depth = depth === 'quick' ? 'planning' : depth;
      }
      confidence = Math.max(confidence, 0.95);
    }
  }

  const compound = verticals.length >= 2 && (
    /\band\b/i.test(message) ||
    [LODGING, FOOD, FLIGHT, TRANSPORT, PERMITS, ACTIVITIES].filter((pattern) => pattern.test(message)).length >= 2
  );
  if (compound) reasonCodes.unshift('compound_request');
  if (liveTime) reasonCodes.push('live_time_signal');

  let freshness = 'stable';
  if (safetyCritical) freshness = 'safety_critical';
  else if (liveTime || primaryIntent.endsWith('_live_search') || primaryIntent === 'live_in_trip_assistance') freshness = 'live';
  else if ([
    'lodging_strategy', 'flight_strategy', 'transport', 'local_business_food',
    'activities_tours_events', 'permit_camping', 'simple_itinerary', 'full_trip',
    'deep_research', 'trip_refinement',
  ].includes(primaryIntent)
    || /\bentrance fee\b/i.test(message)
    || reasonCodes.includes('priority_contingency_advice')) freshness = 'current';

  if (primaryIntent === 'deep_research' && /\bwinter\b/i.test(message)) freshness = 'current';
  const parkVerticalIntents = new Set(['general_qa', 'destination_discovery', 'compare', 'deep_research']);
  if (!parkVerticalIntents.has(primaryIntent) || (primaryIntent === 'general_qa' && verticals.includes('weather'))) {
    const parkIndex = verticals.indexOf('parks');
    if (parkIndex >= 0) verticals.splice(parkIndex, 1);
  }
  const orderedVerticals = VERTICALS.filter((vertical) => verticals.includes(vertical));
  const uniqueReasons = [...new Set(reasonCodes)];

  return {
    version: INTENT_CLASSIFIER_VERSION,
    source: 'deterministic',
    primaryIntent,
    travelerJob: travelerJobResolved.job,
    verticals: orderedVerticals,
    depth,
    freshness,
    actionability,
    scope,
    entities: buildEntities(message),
    confidence,
    reasonCodes: uniqueReasons,
    compound,
    requiresLunaShadow: confidence < 0.8 || compound,
    // Canonical turn understanding travels WITH the intent so downstream stages
    // (evidence hardness, structured-output policy) read one contract instead
    // of re-deriving meaning from the raw message.
    understanding: travelerJobResolved.understanding || null,
    understandingConfidence: travelerJobResolved.understanding?.confidence ?? null,
    structurePolicy: travelerJobResolved.structurePolicy || 'optional',
    requestedArtifact: travelerJobResolved.understanding?.requestedArtifact || null,
    forbiddenArtifacts: travelerJobResolved.understanding?.forbiddenArtifacts || [],
    destinationRelationship: travelerJobResolved.understanding?.destinationRelationship || null,
    // WP-TU Phase 2 Task 3 — propagate Task 1b's TurnTripContext composition
    // (relationship/activeContextAction) onto the AUTHORITATIVE classification
    // result, so downstream internal consumers (Task 4/5: tripScope sync,
    // entryContext neutralization) can read it from this one object instead
    // of re-calling resolveTravelerJob themselves. Internal plumbing only —
    // deliberately NOT added to executeTrailieV2Turn's narrowed `publicIntent`
    // / traveler-facing response shape.
    tripContext: travelerJobResolved.tripContext || null,
    // Downstream ownership contract + provenance. Consumers read THIS to decide
    // whether a canonical plan may/must be produced — never the primary intent.
    executionContract,
    intentSource: executionContract.intentSource,
  };
}

function validateIntentClassification(value) {
  const errors = [];
  const expectedKeys = [
    'actionability', 'compound', 'confidence', 'depth', 'destinationRelationship',
    'entities', 'executionContract', 'forbiddenArtifacts', 'freshness', 'intentSource',
    'primaryIntent', 'reasonCodes', 'requestedArtifact', 'requiresLunaShadow', 'scope',
    'source', 'structurePolicy', 'travelerJob', 'tripContext', 'understanding',
    'understandingConfidence', 'version', 'verticals',
  ];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, errors: ['classification_not_object'] };
  }
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) errors.push('classification_keys_invalid');
  if (!PRIMARY_INTENTS.includes(value.primaryIntent)) errors.push('primary_intent_invalid');
  if (!TRAVELER_JOBS.includes(value.travelerJob)) errors.push('traveler_job_invalid');
  if (!Array.isArray(value.verticals) || value.verticals.some((item) => !VERTICALS.includes(item))) errors.push('verticals_invalid');
  if (!DEPTHS.includes(value.depth)) errors.push('depth_invalid');
  if (!FRESHNESS_LEVELS.includes(value.freshness)) errors.push('freshness_invalid');
  if (!ACTIONABILITY_LEVELS.includes(value.actionability)) errors.push('actionability_invalid');
  if (!SCOPES.includes(value.scope)) errors.push('scope_invalid');
  if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) errors.push('confidence_invalid');
  if (!Array.isArray(value.reasonCodes) || value.reasonCodes.some((item) => !/^[a-z0-9_]{1,80}$/.test(item))) errors.push('reason_codes_invalid');
  if (!Array.isArray(value.entities) || value.entities.some((entity) => {
    if (!entity || typeof entity !== 'object') return true;
    const entityKeys = Object.keys(entity).sort();
    return JSON.stringify(entityKeys) !== JSON.stringify(['canonicalId', 'confidence', 'role', 'type']) ||
      !['destination', 'date_window'].includes(entity.type) ||
      !['target', 'constraint'].includes(entity.role) ||
      (entity.canonicalId !== null && !/^park:nps:[a-z0-9]+$/.test(entity.canonicalId)) ||
      !Number.isFinite(entity.confidence);
  })) errors.push('entities_invalid');
  if (typeof value.compound !== 'boolean') errors.push('compound_invalid');
  if (typeof value.requiresLunaShadow !== 'boolean') errors.push('luna_shadow_flag_invalid');
  if (!['deterministic', 'luna_shadow'].includes(value.source)) errors.push('source_invalid');
  if (value.version !== INTENT_CLASSIFIER_VERSION) errors.push('version_invalid');
  // Turn-understanding surface: bounded vocabularies, same strictness as the
  // rest of the envelope.
  if (!STRUCTURE_POLICIES.includes(value.structurePolicy)) errors.push('structure_policy_invalid');
  if (value.requestedArtifact !== null && !ARTIFACTS.includes(value.requestedArtifact)) {
    errors.push('requested_artifact_invalid');
  }
  if (!Array.isArray(value.forbiddenArtifacts)
    || value.forbiddenArtifacts.some((item) => !ARTIFACTS.includes(item))) {
    errors.push('forbidden_artifacts_invalid');
  }
  if (value.destinationRelationship !== null
    && !DESTINATION_RELATIONSHIPS.includes(value.destinationRelationship)) {
    errors.push('destination_relationship_invalid');
  }
  if (value.understandingConfidence !== null
    && !(Number.isFinite(value.understandingConfidence)
      && value.understandingConfidence >= 0
      && value.understandingConfidence <= 1)) {
    errors.push('understanding_confidence_invalid');
  }
  if (value.understanding !== null
    && (typeof value.understanding !== 'object' || Array.isArray(value.understanding))) {
    errors.push('understanding_invalid');
  }
  // WP-TU Phase 2 Task 3 — tripContext is null (no destination-bearing
  // reading yet) or the strict two-field TurnTripContext composition.
  if (value.tripContext !== null) {
    const relationshipValid = ['new', 'continuation', 'historical_reference'].includes(value.tripContext?.relationship);
    const actionValid = ['preserve', 'set'].includes(value.tripContext?.activeContextAction);
    if (typeof value.tripContext !== 'object' || Array.isArray(value.tripContext) || !relationshipValid || !actionValid) {
      errors.push('trip_context_invalid');
    }
  }
  if (!value.executionContract || typeof value.executionContract !== 'object') {
    errors.push('execution_contract_invalid');
  }
  if (!INTENT_SOURCES.includes(value.intentSource)) errors.push('intent_source_invalid');
  // Deterministic invariant: an explicitly PROHIBITED artifact may never appear
  // as an execution vertical, and a blocked escalation may never leave the
  // contract claiming the artifact is allowed.
  if (Array.isArray(value.forbiddenArtifacts)
    && value.forbiddenArtifacts.includes('itinerary')
    && Array.isArray(value.verticals)
    && value.verticals.includes('itinerary')) {
    errors.push('artifact_prohibition_violated');
  }
  if (value.executionContract
    && value.executionContract.allowsCanonicalPlanArtifact === true
    && Array.isArray(value.forbiddenArtifacts)
    && value.forbiddenArtifacts.includes('itinerary')) {
    errors.push('artifact_escalation_ceiling_violated');
  }
  return { valid: errors.length === 0, errors };
}

module.exports = {
  ACTIONABILITY_LEVELS,
  DEPTHS,
  FRESHNESS_LEVELS,
  INTENT_CLASSIFIER_VERSION,
  PRIMARY_INTENTS,
  SCOPES,
  VERTICALS,
  classifyTrailieIntent,
  validateIntentClassification,
};
