'use strict';

const { isAcceptedCanonicalPlan, hasPriorPlanStructure } = require('../utils/canonicalPlanAcceptance');

/**
 * Conversation-aware traveler job. Regex remains a fast path; this resolver
 * is the source of truth for duration spelling, negation, and follow-up state.
 * No destination-specific branches.
 */

const { CITIES } = require('../utils/cityCoordinates');
const { resolveDestinationsFromMessage } = require('../utils/genericDestinationResolver');
const { normalizeUserText } = require('../utils/lexicalNormalization');
const { buildTurnUnderstanding } = require('./turnUnderstanding');
const {
  hasExplicitItinerarySignal,
  isPriorityContingencyAdvice,
  isAccessParkingDecision,
} = require('../utils/priorityContingencyAdvice');
const { askedToProduceTripArtifact } = require('../utils/produceTripRequest');
const { resolveAccessContingency } = require('../utils/constraintFamilies');
const {
  resolveTopicActions,
  topicMayOwnJob,
} = require('../utils/dominantIntentArbitration');

const TRAVELER_JOBS = Object.freeze([
  'general_advice',
  'trip_duration_advice',
  'destination_compare',
  'trip_skeleton',
  'day_by_day_itinerary',
  'itinerary_refinement',
  'access_contingency',
  'airport_strategy',
  'origin_refinement',
  'lodging_strategy',
  'campground_strategy',
  'permits_reservations',
  'current_conditions',
  'budget_cost',
  'route_planning',
  'preference_update',
  'constraint_update',
  'place_discovery',
  'destination_discovery',
  'deep_research',
  'meta_help',
  'unsupported_non_travel',
]);

const WORD_DAYS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20,
});

const AIRPORT_JOBS = new Set(['airport_strategy', 'origin_refinement']);
const CITY_KEYS = Object.keys(CITIES).sort((a, b) => b.length - a.length);

const DURATION_ADVICE =
  /\b(?:is|are|would)\b.{0,48}\b(?:enough|too (?:short|long|much)|sufficient)\b|\bhow many days\b|\benough (?:time|days)\b|\bcan (?:i|we) (?:do|see|cover|fit)\b.{0,40}\bin \d+[ -]?days?\b/i;
const FORBIDS_DAY_BY_DAY =
  /\b(?:don'?t|do not|no need to|without|not)\b.{0,48}\b(?:day[- ]?by[- ]?day|daily itinerary|each day|an itinerary yet)\b|\bno day[- ]?by[- ]?day\b|\b(?:skeleton|logistics first|not the itinerary yet)\b/i;
const EXPLICIT_DAY_BY_DAY =
  /\b(?:itinerary|day[- ]?by[- ]?day|build (?:me )?(?:the |a )?(?:trip|plan|itinerary)|plan me (?:a |one )?(?:day|trip)|create (?:a |an )?(?:\d+[ -]?day |weekend )?itinerary|turn this into an itinerary)\b/i;
const PACE_REFINEMENT =
  /\b(?:make (?:the |this )?(?:trip|plan|itinerary|it)|make it)\b.{0,28}\b(?:slower|more relaxed|less rushed|easier|relaxed)\b|\bmake day\s*\d+\b.{0,28}\b(?:slower|more relaxed|less rushed|easier|relaxed)\b|\bmore relaxed\b|\bless rushed\b|\bslower pace\b/i;
const CONSTRAINT_UPDATE =
  /\b(?:don'?t like|do not like|hate|avoid|no more|can't do|cannot do)\b.{0,40}\b(?:expos(?:ed|ure)|scary|heights?|drop[- ]?offs?|hikes?|hiking|trails?)\b|\bno (?:scary )?expos/i;
const ORIGIN_FOLLOW =
  /\b(?:i(?:'m| am) )?(?:coming|flying|driving|leaving|departing)?\s*from\s+[A-Za-z][A-Za-z .'-]{1,40}/i;
const GATEWAY_OR_BETTER =
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+or\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b.{0,40}\bbetter\b/i;
const COMPARE =
  /\b(compare|versus|vs\.?|which is better(?:\s+between)?|should i (?:choose|pick)|pick one|help me (?:choose|pick) between)\b/i;
const LODGING = /\b(hotels?|motels?|lodg(?:e|ing)|cabins?|rooms?|airbnb|accommodations?|where should (?:we|i) stay|stay inside|stay around)\b/i;
const FLIGHT = /\b(flights?|fly into|airport|airfare)\b/i;
const CAMPING = /\b(campgrounds?|camping|campsites?)\b/i;
const PERMITS = /\b(permits?|lottery|timed entry|reservations?)\b/i;
const TRANSPORT = /\b(shuttle|transit|bus|train|drives?|driving|roads?|without a car|parking|where (?:should|can) i park|route|road trip)\b/i;
const BUDGET = /\b(budget|how much (?:will|does|should)|cost|entrance fee)\b/i;
const META_HELP = /\b(what can trailie|how do i .*trailie|can you search the web|what can you do|how does trailie)\b/i;
const NON_TRAVEL = /\b(python|javascript|sort an array|integral of|algebra|recipe|chocolate cake|write (?:a )?function|debug my code)\b/i;
const DEEP_RESEARCH = /\b(deep research|research report|comprehensive research|in-depth research|deep dive)\b/i;
const DESTINATION_DISCOVERY = /\b(best national parks?|recommend (?:a |some )?(?:national )?parks?|where should i go|where should we go|help me (?:pick|choose) (?:a )?(?:park|destination))\b/i;
const PLACE_DISCOVERY = /\b(things to do|best .{0,40}(?:hikes?|walks?|views?|photography|wildlife)|what .{0,40}(?:see|do)|viewpoints?|attractions?|wildlife|photography|romantic|no hiking|hate hiking|without hiking)\b/i;
const TIME_BOUNDED_VISIT =
  /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|a few)\s*[- ]?hours?\b|\bhalf[- ]?day\b|\bshort visit\b/i;
const OPERATIONAL = /(?:\b(?:road|trail|route|shuttle)\b.{0,40}\b(?:open|closed|closure|running|status|condition)\b|\b(?:open|closed|closure|running|status|condition)\b.{0,40}\b(?:road|trail|route|shuttle)\b|\bactive alerts?\b|\b(?:wildfire|smoke|emergency)\b)/i;

function extractDurationDays(message) {
  const text = normalizeUserText(message);
  const digit = text.match(/\b(\d{1,2})\s*[- ]?days?\b/i);
  if (digit) return Number(digit[1]);
  const word = text.match(new RegExp(`\\b(${Object.keys(WORD_DAYS).join('|')})\\s*[- ]?days?\\b`, 'i'));
  if (word) return WORD_DAYS[word[1].toLowerCase()];
  if (/\ba week\b/i.test(text)) return 7;
  if (/\bweekend\b/i.test(text)) return 2;
  const dayNumbers = [...text.matchAll(/\bday\s*(\d{1,2})\b/gi)].map((entry) => Number(entry[1]));
  return dayNumbers.length ? Math.max(...dayNumbers) : null;
}

function mentionedCatalogCities(message) {
  const lower = String(message || '').toLowerCase();
  const found = [];
  for (const key of CITY_KEYS) {
    const pattern = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(lower)) found.push(key);
  }
  return found;
}

function isGatewayCityChoice(message) {
  const destinations = resolveDestinationsFromMessage(message);
  if (!destinations.length) return false;
  if (COMPARE.test(message) && destinations.length >= 2) return false;
  const cities = mentionedCatalogCities(message);
  if (cities.length >= 2 && /\b(better|which|or)\b/i.test(message)) return true;
  return GATEWAY_OR_BETTER.test(message) && /\bbetter\b/i.test(message);
}

function askedToProduceTrip(turn, message) {
  if (turn?.askedToProduceTripArtifact === true) return true;
  if (turn?.requestedArtifact === 'itinerary') return true;
  return askedToProduceTripArtifact(message, {
    destinationCount: turn?.subjectDestinations?.length || 0,
    durationDays: turn?.temporalScope?.durationDays ?? null,
    relationship: turn?.destinationRelationship || null,
    visitWindow: turn?.temporalScope?.visitWindow || null,
  });
}

function isOriginOnlyFollowUp(message) {
  const text = String(message || '').trim();
  if (!ORIGIN_FOLLOW.test(text)) return false;
  if (FLIGHT.test(text) && /\bwhich airport|fly into\b/i.test(text)) return false;
  if (EXPLICIT_DAY_BY_DAY.test(text) || askedToProduceTripArtifact(text)) return false;
  return text.length < 120;
}

function isCompatibleAirportFollowUp(message) {
  const text = String(message || '').trim();
  if (!text || text.length > 140) return false;
  return isOriginOnlyFollowUp(text)
    || ORIGIN_FOLLOW.test(text)
    || /\bwhat about\b.{0,48}\??/i.test(text)
    || /\bwhich is cheaper\b|\bhow far is that\b|\bactually we(?:'re| are) flying\b/i.test(text);
}

function isCompatibleLodgingFollowUp(message) {
  const text = String(message || '').trim();
  if (!text || text.length > 140) return false;
  return /\bcloser to (?:the )?(?:(?:north|south|east|west) )?(?:entrance|gate|park)\b|\binside the park\b|\bnear (?:the )?(?:(?:north|south|east|west) )?(?:entrance|gate)\b/i.test(text);
}

function isCompatibleCampgroundFollowUp(message) {
  const text = String(message || '').trim();
  if (!text || text.length > 140) return false;
  return /\b\d{2,3}[ -]?foot\b.{0,16}\b(?:rv|trailer)\b|\b(?:we have |our )?(?:an? )?(?:rv|trailer)\b|\bhookups?\b/i.test(text);
}

// WP-TU Phase 1b (TurnTripContext) — jobs that operate on an EXISTING plan
// (an edit), never a fresh build. Deliberately narrower than
// shouldForceStructuredItinerary()/shouldShowDayByDayItinerary() below, which
// lump 'day_by_day_itinerary' and 'itinerary_refinement' together for a
// different purpose (structured-output routing) — here the new/refinement
// split is exactly the distinction that matters.
const REFINEMENT_JOBS = new Set(['itinerary_refinement', 'preference_update', 'constraint_update']);

/**
 * WP-TU Phase 1b — same-destination comparison for TurnTripContext. Compares
 * by parkCode first (case-insensitive), falling back to name when parkCode is
 * absent (e.g. a non-NPS place). No network/catalog lookups.
 */
function isSameTripContextDestination(a, b) {
  if (!a || !b) return false;
  const aCode = a.parkCode ? String(a.parkCode).toLowerCase() : null;
  const bCode = b.parkCode ? String(b.parkCode).toLowerCase() : null;
  if (aCode && bCode) return aCode === bCode;
  const aName = String(a.name || a.parkName || '').toLowerCase().trim();
  const bName = String(b.name || b.parkName || '').toLowerCase().trim();
  return Boolean(aName) && aName === bName;
}

/**
 * WP-TU Phase 1c — does `destination` match ANY destination named in the
 * prior conversational subject? `priorSubject` is now a multi-destination
 * shape (`{ subjectDestinations, primaryDestination, destinationRelationship }`
 * | null, per Phase 1c) — a comparison subject like "Yosemite or Sequoia"
 * must let a later turn naming EITHER park read as continuation, not just a
 * re-mention of whichever one happened to be listed first.
 */
function matchesConversationalSubject(destination, priorSubject) {
  if (!destination || !priorSubject) return false;
  const candidates = Array.isArray(priorSubject.subjectDestinations) && priorSubject.subjectDestinations.length
    ? priorSubject.subjectDestinations
    : (priorSubject.primaryDestination ? [priorSubject.primaryDestination] : []);
  return candidates.some((candidate) => isSameTripContextDestination(destination, candidate));
}

/**
 * WP-TU Phase 1b — is `job` a genuine NEW-itinerary-BUILD job, never an edit
 * of an existing plan? Trusts `job` completely — no independent re-reading
 * of the raw message text at this layer (no keyword fallback). The prior
 * version of this function fell back to a bare `hasPlanVerb(message)` check
 * when `job` didn't look itinerary-shaped, which produced false positives
 * for "plan around crowds", "plan my day if it rains", "plan around sunset
 * timing" — advice questions about a CONDITION, not requests to build a
 * trip. The correct fix is upstream: `resolveArtifactIntent` in
 * turnUnderstanding.js now distinguishes the build frame (the object of
 * "plan" is the trip/destination/duration) from the advice frame (the
 * object is a circumstance to navigate), so `job` itself is now trustworthy
 * for "Actually plan Badlands instead" → `day_by_day_itinerary`, and this
 * layer no longer needs — or is permitted — its own keyword authority.
 */
function isGenuineNewItineraryBuildJob({ job, turn }) {
  return job === 'day_by_day_itinerary' && turn.requestedArtifact !== 'itinerary_patch';
}

/**
 * WP-TU Phase 1b (TurnTripContext) — the atomic composition of `relationship`
 * and `activeContextAction`, added as a sibling of `job`. Deliberately does
 * NOT read continuationOfActiveDecision/topicShift/priorJob: those answer "is
 * this the same active TASK", not "is this the same conversational SUBJECT" —
 * see the turn-understanding-implementation plan's Established Facts, Q2.
 * Uses `turn.priorConversationalSubject` (Task 1a) instead.
 *
 * `relationship` describes how this turn's subject relates to the immediately
 * relevant prior conversational subject — never whether the active trip is
 * preserved or replaced (that is `activeContextAction` alone, spec §5.3).
 */
function resolveTripContext({ job, turn, priorTripState }) {
  const primaryDestination = turn.primaryDestination || null;
  const priorSubject = turn.priorConversationalSubject || null;
  const activeDestination = priorTripState?.primaryDestination
    || priorTripState?.lockedPlanDestination
    || null;

  let relationship;
  if (!primaryDestination) {
    // A bare follow-up names no destination of its own — it continues
    // whatever subject (conversational or active) was already in play.
    relationship = 'continuation';
  } else if (
    matchesConversationalSubject(primaryDestination, priorSubject)
    || isSameTripContextDestination(primaryDestination, activeDestination)
  ) {
    relationship = 'continuation';
  } else if (REFINEMENT_JOBS.has(job) || turn.requestedArtifact === 'itinerary_patch') {
    // Explicitly names a DIFFERENT destination than the current subject/
    // active trip, but asks for an edit rather than a fresh build — this
    // points at a specific other plan, not a redirection of this one.
    relationship = 'historical_reference';
  } else {
    relationship = 'new';
  }

  // `set` only for an explicit, itinerary-shaped redirection: a NEW build
  // (never an edit) naming a destination that differs from whatever trip is
  // currently active. A new/different subject alone (relationship: 'new')
  // never implies `set` on its own — see the six pinned cases. `job` is
  // trusted completely here — no independent keyword re-interpretation of
  // the raw message at this layer (see isGenuineNewItineraryBuildJob).
  let activeContextAction;
  if (relationship === 'historical_reference') {
    activeContextAction = 'preserve';
  } else if (
    primaryDestination
    && !isSameTripContextDestination(primaryDestination, activeDestination)
    && isGenuineNewItineraryBuildJob({ job, turn })
  ) {
    activeContextAction = 'set';
  } else {
    activeContextAction = 'preserve';
  }

  return { relationship, activeContextAction };
}

function resolveTravelerJob({ userPrompt = '', priorTripState = null, understanding = null, officialPlaces = null } = {}) {
  // Every matcher below reads normalized text: typographic punctuation is how
  // phones spell ordinary English, and it must not change meaning.
  const message = normalizeUserText(userPrompt);
  const turn = understanding || buildTurnUnderstanding({ userPrompt, priorTripState, officialPlaces });
  // A visit date ("next weekend") is not a trip length; only the understanding
  // contract knows the difference.
  const durationDays = turn.temporalScope.durationDays;
  const priorJob = priorTripState?.activeDecision?.kind
    || priorTripState?.lastTravelerJob
    || null;
  const hasItinerary = hasPriorPlanStructure(priorTripState?.existingCanonicalPlan)
    || hasPriorPlanStructure(priorTripState?.canonicalPlan)
    || (priorTripState?.hasItinerary === true
      && hasPriorPlanStructure(priorTripState?.existingCanonicalPlan));
  const hasActiveTrip = priorTripState?.hasActiveTrip === true || hasItinerary
    || Boolean(priorTripState?.primaryDestination);
  const reasonCodes = [];
  const forbidsDayByDay = turn.forbiddenArtifacts.includes('itinerary')
    || FORBIDS_DAY_BY_DAY.test(message);

  const result = (job, extra = {}) => ({
    job,
    durationDays,
    forbidsDayByDay,
    inherited: extra.inherited === true,
    understanding: turn,
    structurePolicy: extra.structurePolicy || turn.structurePolicy,
    reasonCodes: [...new Set([...(extra.reasonCodes || []), ...reasonCodes])],
    tripContext: resolveTripContext({ job, turn, priorTripState }),
  });

  // ---- Understanding-owned decisions -------------------------------------
  // These four run ahead of the phrase matchers because they are exactly the
  // places where phrase enumeration was silently wrong: a choice between two
  // destinations, a forbidden artifact, an operational verb, and a date that
  // only looked like a duration.

  if (turn.comparisonSelectionRequired === true) {
    return result('destination_compare', {
      reasonCodes: ['comparison_selection_required', 'explicit_comparison'],
    });
  }

  if (turn.destinationRelationship === 'compare' || turn.destinationRelationship === 'alternative_choice') {
    if (!isGatewayCityChoice(message)) {
      return result('destination_compare', {
        reasonCodes: [
          'explicit_comparison',
          ...(turn.comparisonSelectionRequired ? ['comparison_selection_required'] : []),
          ...turn.reasonCodes.filter((c) => c === 'destination_disjunction'),
        ],
      });
    }
  }

  if (turn.forbiddenArtifacts.includes('itinerary')) {
    return result('trip_skeleton', { reasonCodes: ['explicit_not_day_by_day'] });
  }


  if (META_HELP.test(message)) return result('meta_help', { reasonCodes: ['trailie_meta_question'] });
  if (NON_TRAVEL.test(message)) return result('unsupported_non_travel', { reasonCodes: ['non_travel_request'] });

  if (COMPARE.test(message) && !isGatewayCityChoice(message)) {
    return result('destination_compare', { reasonCodes: ['explicit_comparison'] });
  }

  const produceNow = askedToProduceTrip(turn, message);
  const accessContingency = resolveAccessContingency(message);
  const topicActions = resolveTopicActions(message, { produce: produceNow });
  // Family-true contingency is a concept, not "backup plan" collocation.
  // Produce-object turns keep the 12A itinerary contract; the fallback is a
  // secondary constraint, not a job steal. Topic matchers below may own the
  // job only when 12C says the traveler asked for that topic as the action.
  if (accessContingency.isAccessContingency && !produceNow && turn.requestedArtifact !== 'itinerary_patch') {
    const reasonCodes = [...accessContingency.reasonCodes];
    if (isPriorityContingencyAdvice(message)) reasonCodes.push('priority_contingency_advice');
    else if (isAccessParkingDecision(message)) reasonCodes.push('parking_access_decision');
    return result('access_contingency', { reasonCodes });
  }

  if (
    turn.taskFamily === 'permits_reservations'
    && turn.requestedArtifact !== 'itinerary'
    && !hasExplicitItinerarySignal(message)
    && !produceNow
    && topicMayOwnJob('permits_reservations', topicActions)
  ) {
    return result('permits_reservations', { reasonCodes: ['permit_or_camping_request'] });
  }

  // GATE, not a reorder: "Fix/Adjust/Change Day 2, it is too much driving."
  // matches DURATION_ADVICE's bare "is ... too much" grammar too, but the
  // artifact-frame resolver (turnUnderstanding.js, via resolveRefinementIntent)
  // has ALREADY determined — from the SAME message — that this names a day of
  // the active plan AND carries modification intent, i.e. a real mutation
  // request, not a question. That explicit, already-authoritative signal must
  // outrank the broader duration-question phrase matcher. An ordinary duration
  // question ("Is 3 days too much for Yellowstone?", "Would 5 days be too
  // long?") never resolves requestedArtifact to 'itinerary_patch' in the first
  // place (no day/plan reference for the artifact resolver to bind to), so
  // this gate never touches it — duration advice keeps working exactly as
  // before, with or without an active plan.
  if (
    DURATION_ADVICE.test(message)
    && !askedToProduceTrip(turn, message)
    && !forbidsDayByDay
    && turn.requestedArtifact !== 'itinerary_patch'
  ) {
    return result('trip_duration_advice', { reasonCodes: ['duration_advice'] });
  }

  if (forbidsDayByDay && (askedToProduceTrip(turn, message) || durationDays != null)) {
    return result('trip_skeleton', { reasonCodes: ['explicit_not_day_by_day'] });
  }

  if (
    turn.requestedArtifact !== 'itinerary_patch'
    && (isPriorityContingencyAdvice(message) || isAccessParkingDecision(message))
  ) {
    if (!produceNow) {
      return result('access_contingency', {
        reasonCodes: [isPriorityContingencyAdvice(message) ? 'priority_contingency_advice' : 'parking_access_decision'],
      });
    }
  }

  if (isGatewayCityChoice(message)) {
    return result('airport_strategy', { reasonCodes: ['gateway_city_strategy'] });
  }

  if (AIRPORT_JOBS.has(priorJob) && isOriginOnlyFollowUp(message)) {
    return result('origin_refinement', { inherited: true, reasonCodes: ['origin_follow_up'] });
  }

  if (hasItinerary && PACE_REFINEMENT.test(message)) {
    return result('itinerary_refinement', { reasonCodes: ['pace_refinement'] });
  }

  if (
    hasItinerary
    && CONSTRAINT_UPDATE.test(message)
    && !askedToProduceTrip(turn, message)
    && turn.requestedArtifact !== 'itinerary_patch'
  ) {
    return result('constraint_update', { reasonCodes: ['constraint_follow_up'] });
  }

  // An explicitly requested canonical artifact is owned by the understanding
  // contract, ahead of the remaining phrase ladder. The ladder could not see
  // "keep the trip, but keep the walking pretty light" as a plan mutation, so
  // the job regressed to general_advice, plan ownership was lost, and a
  // required patch terminated as prose. The contract already knew.
  if (turn.requestedArtifact === 'itinerary_patch') {
    return result('itinerary_refinement', { reasonCodes: ['refines_existing_plan'] });
  }
  if (turn.requestedArtifact === 'itinerary' && turn.structurePolicy === 'required') {
    return result('day_by_day_itinerary', { reasonCodes: ['explicit_itinerary_request'] });
  }

  if (askedToProduceTrip(turn, message) && !forbidsDayByDay) {
    return result('day_by_day_itinerary', { reasonCodes: ['explicit_itinerary_request'] });
  }

  if (DEEP_RESEARCH.test(message)) {
    return result('deep_research', { reasonCodes: ['explicit_deep_research'] });
  }

  if (OPERATIONAL.test(message)) {
    return result('current_conditions', { reasonCodes: ['operational_status_request'] });
  }

  if (FLIGHT.test(message)) {
    return result('airport_strategy', { reasonCodes: ['flight_planning_advice'] });
  }

  if (CAMPING.test(message) && !hasExplicitItinerarySignal(message)) {
    return result('campground_strategy', { reasonCodes: ['permit_or_camping_request'] });
  }

  if (
    PERMITS.test(message)
    && !hasExplicitItinerarySignal(message)
    && topicMayOwnJob('permits_reservations', topicActions)
  ) {
    return result('permits_reservations', { reasonCodes: ['permit_or_camping_request'] });
  }

  if (LODGING.test(message)) {
    return result('lodging_strategy', { reasonCodes: ['lodging_advice'] });
  }

  if (BUDGET.test(message) && !askedToProduceTrip(turn, message)) {
    return result('budget_cost', { reasonCodes: ['budget_question'] });
  }

  if (topicMayOwnJob('route_planning', topicActions) && (
    topicActions.primaryRouteAsk || (TRANSPORT.test(message) && !askedToProduceTrip(turn, message))
  )) {
    if (accessContingency.isAccessContingency) {
      return result('access_contingency', { reasonCodes: accessContingency.reasonCodes });
    }
    return result('route_planning', { reasonCodes: ['transport_question'] });
  }

  if (AIRPORT_JOBS.has(priorJob) && ORIGIN_FOLLOW.test(message) && !askedToProduceTrip(turn, message)) {
    return result('origin_refinement', { inherited: true, reasonCodes: ['origin_follow_up'] });
  }

  if (AIRPORT_JOBS.has(priorJob) && isCompatibleAirportFollowUp(message)) {
    return result('airport_strategy', { inherited: true, reasonCodes: ['active_decision_follow_up'] });
  }

  if (priorJob === 'lodging_strategy' && isCompatibleLodgingFollowUp(message)) {
    return result('lodging_strategy', { inherited: true, reasonCodes: ['active_decision_follow_up'] });
  }

  if (priorJob === 'campground_strategy' && isCompatibleCampgroundFollowUp(message)) {
    return result('campground_strategy', { inherited: true, reasonCodes: ['active_decision_follow_up'] });
  }

  if (
    askedToProduceTrip(turn, message)
    && durationDays != null
    && !forbidsDayByDay
  ) {
    return result('day_by_day_itinerary', { reasonCodes: ['duration_plus_plan'] });
  }

  if (TIME_BOUNDED_VISIT.test(message) && !forbidsDayByDay && resolveDestinationsFromMessage(message).length) {
    return result('day_by_day_itinerary', { reasonCodes: ['time_bounded_visit'] });
  }

  if (DESTINATION_DISCOVERY.test(message)) {
    return result('destination_discovery', { reasonCodes: ['open_ended_destination_choice'] });
  }

  if (
    topicMayOwnJob('place_discovery', topicActions)
    && durationDays == null
    && (topicActions.primaryPhotographyAsk || PLACE_DISCOVERY.test(message))
  ) {
    return result('place_discovery', { reasonCodes: ['destination_activity_discovery'] });
  }

  if (hasItinerary && /\b(?:add|remove|swap|replace|change|update|refine|avoid)\b/i.test(message)) {
    return result('itinerary_refinement', { reasonCodes: ['active_trip_mutation'] });
  }

  return result('general_advice', { reasonCodes: ['general_travel_question'] });
}

function jobToPrimaryIntent(resolved) {
  const job = resolved?.job;
  const durationDays = resolved?.durationDays;
  switch (job) {
    case 'destination_compare':
      return 'compare';
    case 'trip_duration_advice':
    case 'trip_skeleton':
    case 'general_advice':
    case 'budget_cost':
    case 'access_contingency':
      return 'general_qa';
    case 'day_by_day_itinerary': {
      // WP-TU Phase 2 Task 4A follow-up — a multi-destination build ("Plan
      // Yosemite, Sequoia, and Death Valley") is full-trip SCALE even with no
      // stated day count, exactly like the legacy classification ladder this
      // FLOOR overrides already treated it (see trailieIntentClassifier.js's
      // `multiDestination` fallback). Reads the ALREADY-COMPUTED
      // `subjectDestinations` this same `resolved.understanding` carries — no
      // new regex, no raw-message re-parsing, no new taxonomy value.
      const multiDestination = (resolved?.understanding?.subjectDestinations?.length || 0) >= 2;
      return (durationDays != null && durationDays >= 4) || multiDestination
        ? 'full_trip'
        : 'simple_itinerary';
    }
    case 'itinerary_refinement':
    case 'preference_update':
    case 'constraint_update':
      return 'trip_refinement';
    case 'airport_strategy':
    case 'origin_refinement':
      return 'flight_strategy';
    case 'lodging_strategy':
      return 'lodging_strategy';
    case 'campground_strategy':
    case 'permits_reservations':
      return 'permit_camping';
    case 'current_conditions':
      return 'live_in_trip_assistance';
    case 'route_planning':
      return 'transport';
    case 'place_discovery':
      return 'place_discovery';
    case 'destination_discovery':
      return 'destination_discovery';
    case 'deep_research':
      return 'deep_research';
    case 'meta_help':
      return 'meta_help';
    case 'unsupported_non_travel':
      return 'unsupported_non_travel';
    default:
      return 'general_qa';
  }
}

function shouldForceStructuredItinerary(resolved) {
  return resolved?.job === 'day_by_day_itinerary' || resolved?.job === 'itinerary_refinement';
}

function shouldShowDayByDayItinerary(resolved) {
  return shouldForceStructuredItinerary(resolved) || resolved?.job === 'constraint_update';
}

module.exports = {
  TRAVELER_JOBS,
  extractDurationDays,
  resolveTravelerJob,
  jobToPrimaryIntent,
  shouldForceStructuredItinerary,
  shouldShowDayByDayItinerary,
  // WP-TU Phase 3 Task 6 — read-only plumbing export. `resolveTripContext`
  // already uses this SAME set (plus `requestedArtifact === 'itinerary_patch'`)
  // to decide its own `historical_reference` branch; Task 6 reuses it
  // identically for `resolvedEntities`'s refinement gate rather than
  // re-deriving the job list.
  REFINEMENT_JOBS,
};
