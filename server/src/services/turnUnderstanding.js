'use strict';

/**
 * ONE canonical semantic understanding of the current turn.
 *
 * Everything downstream — traveler job, evidence planning, artifact
 * requirements, model routing — reads this contract instead of re-deriving
 * meaning from raw phrase matches. Keeping understanding in one place is what
 * stops a single missed phrase from silently reshaping the whole execution
 * path (a wrong itinerary inference used to demand structured output, burn
 * three attempts, and discard usable prose).
 *
 * Deterministic Stage A only. When Stage A is not confident enough, this
 * contract says so (`needsSemanticResolution`) and a bounded semantic resolver
 * may fill the gap — see semanticTurnResolver. No provider calls happen here.
 *
 * No destination-specific branches. Families over phrase enumeration.
 */

const { isConfirmedLodgingBooking } = require('./tripMutationCommit');
const { resolveTurnSufficiencyDecision } = require('../utils/turnSufficiencyDecision');
const { isDraftPlan, hasPriorPlanStructure } = require('../utils/canonicalPlanAcceptance');
const { normalizeUserText } = require('../utils/lexicalNormalization');
const { resolveDestinationsFromMessage } = require('../utils/genericDestinationResolver');
const { resolveDestinationRelationship, isChoiceFrame } = require('../utils/destinationRelationship');
const { resolveComparisonSelection } = require('../utils/comparisonSelectionObligation');
const { resolveAccessContingency } = require('../utils/constraintFamilies');
const { parseTripDuration } = require('../utils/durationSemantics');
const { resolveRefinementIntent } = require('../utils/refinementSemantics');
const {
  extractExplicitConstraints,
  extractSoftPreferences,
} = require('../utils/constraintSemantics');
const { taskFamilyForJob } = require('./travelerJobTaskFamilyMap');
const { stripContingencyPlanPhrases } = require('../utils/priorityContingencyAdvice');
const {
  resolveProduceTripRequest,
  PRODUCE_VERB,
  ITINERARY_NOUN,
  isOptionsFrame,
} = require('../utils/produceTripRequest');
const {
  resolveTopicActions,
  topicMayOwnJob,
} = require('../utils/dominantIntentArbitration');

/** The semantic family an active traveler job belongs to. */
function jobBelongsToFamily(job) {
  return taskFamilyForJob(job);
}

// ---------------------------------------------------------------------------
// Bounded vocabularies
// ---------------------------------------------------------------------------

const TASK_FAMILIES = Object.freeze([
  'comparison',
  'duration_advice',
  'trip_skeleton',
  'itinerary',
  'itinerary_refinement',
  'route_strategy',
  'airport_strategy',
  'lodging_strategy',
  'campground_strategy',
  'permits_reservations',
  'access_current',
  'cost_budget',
  'activity_advice',
  'destination_advice',
  'destination_discovery',
  'deep_research',
  'meta_help',
  'non_travel',
  'general_advice',
]);

/**
 * How firmly the family was established. Confidence is derived from THIS plus
 * corroborating signals — never from which branch happened to match, so two
 * equally explicit turns can score alike even via different branches.
 */
const RESOLUTION_STRENGTH = Object.freeze({
  EXPLICIT: 'explicit',     // the traveler named the task or artifact outright
  STRONG: 'strong',         // an unambiguous subject/frame carries it
  CONTEXTUAL: 'contextual', // resolved via the active decision or trip shape
  WEAK: 'weak',             // nothing but the generic fall-through
});

const STRENGTH_BASE = Object.freeze({
  explicit: 0.92,
  strong: 0.84,
  contextual: 0.74,
  weak: 0.40,
});

/** Why a turn could not be resolved deterministically. */
const SEMANTIC_RESOLUTION_REASONS = Object.freeze([
  'elliptical_reference',
  'conflicting_task_signals',
  'unclear_destination_relationship',
  'unresolved_comparison_entity',
  'unclear_artifact_intent',
  'ambiguous_active_decision',
  'other',
]);

const ARTIFACTS = Object.freeze([
  'none',
  'plain_answer',
  'comparison',
  'trip_skeleton',
  'itinerary',
  'itinerary_patch',
  'route',
]);

const DESTINATION_RELATIONSHIPS = Object.freeze([
  'single',
  'compare',
  'alternative_choice',
  'combine',
  'route',
  'regional_set',
  'unknown',
]);

const STRUCTURE_POLICIES = Object.freeze(['optional', 'preferred', 'required']);

const OPERATIONAL_SUBJECTS = Object.freeze([
  'reservations_permits',
  'access_status',
  'parking',
  'transit',
  'weather',
  'fees',
]);

// ---------------------------------------------------------------------------
// Semantic families (concept families, not sentence enumerations)
// ---------------------------------------------------------------------------

/**
 * Produce-object grammar lives in utils/produceTripRequest. TurnUnderstanding
 * and TravelerJob share that one signal; do not reintroduce parallel verb
 * lexicons here.
 */
/** Negation/deferral operators. */
const NEGATION = /\b(?:don'?t|do not|dont|no need to|not|without|never|skip|hold off(?: on)?|rather not|no)\b/i;

const SKELETON_LANGUAGE =
  /\b(?:skeleton|logistics first|shape of the trip|trip shape|rough (?:plan|outline|shape)|outline|high[- ]level|overview first|which parks?.{0,32}(?:together|make sense)|where (?:should|do) i base|bases?\b)/i;

/** Choice/disjunction between named destinations. */
const CHOICE_LANGUAGE =
  /\b(?:compare|comparison|versus|vs\.?|which (?:one|is|would|fits?|makes?)|would you (?:pick|choose|go with|recommend)|should (?:i|we) (?:pick|choose|do|go with)|pick one|deciding between|decide between|torn between|choosing between|leaning toward|leaning towards|better (?:for|choice|fit|option)|or\b)/i;
const COMBINE_LANGUAGE =
  /\b(?:both|combine|together in (?:one|the same) trip|same trip|one trip|split (?:a |the |my |our )?\w*\s*(?:week|days?|time|trip)?\s*between|visit .{0,40}\band\b|add(?:ing)? .{0,30}\bto the trip\b|pair(?:ing)? .{0,20}\bwith\b)/i;
const ROUTE_LANGUAGE =
  /\b(?:road\s*trip|drive from|driving (?:tour|from|to)|from .{1,40} to .{1,40}|loop|route between|drive between|circuit)\b/i;
const REGIONAL_LANGUAGE =
  /\b(?:region|regional|area|southern|northern|eastern|western|central|all (?:five|four|three|the) parks?|mighty five|which parks?|parks? (?:in|around|near))\b/i;

/** Reservation/permit concept family — verbs and nouns, not one spelling. */
const RESERVATION_FAMILY =
  /\b(?:reserv(?:e|es|ed|ing|ation|ations)|book(?:s|ed|ing)?|pre[- ]?book|timed[- ]?entry|entry (?:ticket|permit|reservation)s?|permits?|permitting|lotter(?:y|ies)|tickets?|secure (?:a |an |our |my )?(?:spot|slot|permit|place|reservation)|sign up for)\b/i;
/**
 * Arranging-something-in-advance verbs. Alone they are too broad ("secure",
 * "arrange"); paired with pre-trip framing they clearly mean the reservation
 * family: "What needs to be secured before we go?"
 */
const ARRANGE_VERBS = /\b(?:secur(?:e|ed|ing)|arrang(?:e|ed|ing)|sort(?:ed)? out|line up|lock in|set up|get (?:a|an|our|my)?\s*(?:spot|slot|pass|permit))\b/i;
const ACCESS_STATUS_FAMILY =
  /\b(?:open|opens|opening|closed|closure|closures|status|conditions?|running|operating|accessible|alerts?|wildfire|smoke|emergency|snow|plowed)\b/i;
const PARKING_FAMILY = /\b(?:parking|park(?:ing)? lot|where (?:should|can|do) (?:i|we) park|lots? fill)\b/i;
const TRANSIT_FAMILY = /\b(?:shuttle|transit|bus|train|without a car|public transport)\b/i;
const WEATHER_FAMILY = /\b(?:weather|forecast|temperature|rain|snow(?:fall)?|conditions? outside)\b/i;
const FEE_FAMILY = /\b(?:fees?|entrance (?:fee|cost)|price|how much (?:is|does|will)|cost)\b/i;

/** Pre-trip preparation framing ("before I go", "what do I need to…"). */
const PRE_TRIP_PREP =
  /\b(?:before (?:i|we) (?:go|leave|head|arrive|get there)|ahead of time|in advance|need to (?:do|know|arrange|sort)|what do (?:i|we) need)\b/i;

/** Explicit trip-duration statements. */
const DURATION_DIGIT = /\b(\d{1,2})\s*(?:full\s+)?[- ]?days?\b/i;
const WORD_NUMBERS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
});
const DURATION_WORD = new RegExp(`\\b(${Object.keys(WORD_NUMBERS).join('|')})\\s*(?:full\\s+)?[- ]?days?\\b`, 'i');

/**
 * A weekend can be a DATE ("going next weekend") or a DURATION ("we have the
 * whole weekend"). Only the second is a trip length.
 */
const DATE_WEEKEND = /\b(?:next|this|that|coming|following|upcoming)\s+(?:weekend|week|month|friday|saturday|sunday|monday|tuesday|wednesday|thursday)\b/i;
const DURATION_WEEKEND =
  /\b(?:a|the|one|whole|entire|full|our|my)\s+(?:\w+\s+){0,2}(?:long\s+)?weekend\b|\b(?:have|spend(?:ing)?|staying|there for|for)\s+(?:the\s+|a\s+)?(?:long\s+)?weekend\b/i;
const VISIT_WINDOW =
  /\b(?:next|this|that|coming|following|upcoming)\s+(?:weekend|week|month|spring|summer|fall|autumn|winter|year|january|february|march|april|may|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b(?:early|mid|middle of|late)[- ]?(?:january|february|march|april|may|june|july|august|september|october|november|december|spring|summer|fall|autumn|winter)\b|\b(?:in|during|over)\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\b|\b(?:today|tonight|tomorrow)\b/i;

const AIRPORT_FAMILY = /\b(?:airports?|fly(?:ing)? into|flights?|airfare|land (?:in|at))\b/i;
const LODGING_FAMILY =
  /\b(?:hotels?|motels?|lodg(?:e|es|ing)|cabins?|rooms?|airbnb|accommodations?|where (?:should|do|can) (?:we|i) stay|stay (?:inside|near|around|at)|bases?\b|changing hotels?)\b/i;
const CAMPING_FAMILY = /\b(?:campgrounds?|camping|campsites?|rv sites?|tent sites?)\b/i;
const BUDGET_FAMILY = /\b(?:budget|how much (?:will|does|should|is)|costs?|expensive|afford)\b/i;
const ACTIVITY_FAMILY =
  /\b(?:things to do|what (?:should|would|can|do) (?:we|i) (?:do|see)|worth (?:visiting|it|a visit|two days|going)|viewpoints?|attractions?|wildlife|photograph(?:y|s)?|scenic|sunset|sunrise|stargaz|hikes?\b)/i;
/** Classes the traveler-job resolver already recognizes — mirrored here so a
 *  clearly-understood turn never collapses into the generic family. */
const META_HELP_FAMILY =
  /\b(?:what can trailie|how do(?:es)? .{0,20}trailie|can you search the web|what can you do|how does trailie|save this trip)\b/i;
const NON_TRAVEL_FAMILY =
  /\b(?:python|javascript|sort an array|integral of|algebra|recipe|chocolate cake|write (?:a )?function|debug my code)\b/i;
const DESTINATION_DISCOVERY_FAMILY =
  /\b(?:best national parks?|recommend (?:a |some )?(?:national )?parks?|where should (?:i|we) go|help me (?:pick|choose) (?:a )?(?:park|destination)|which park should)\b/i;
const DEEP_RESEARCH_FAMILY =
  /\b(?:deep research|research report|comprehensive research|in-depth research|deep dive)\b/i;
const OPERATIONAL_STATUS_FAMILY =
  /(?:\b(?:road|trail|route|shuttle|pass|gate)\b.{0,40}\b(?:open|closed|closure|running|status|condition)\b|\b(?:open|closed|closure|running|status|condition)\b.{0,40}\b(?:road|trail|route|shuttle|pass|gate)\b|\bactive alerts?\b|\b(?:wildfire|smoke|emergency)\b)/i;
const TRANSPORT_TOPIC_FAMILY =
  /\b(?:shuttle|transit|bus|train|without a car|parking|where (?:should|can) (?:i|we) park|road trip|drives?|driving|roads?)\b/i;

const DURATION_ADVICE_FAMILY =
  /\b(?:is|are|would|will)\b.{0,48}\b(?:enough|too (?:short|long|much)|sufficient|worth)\b|\bhow (?:many|much) (?:days|time)\b|\benough (?:time|days)\b/i;

/** A day of the existing plan, named however the traveler names it. */
const PLAN_DAY_REFERENCE =
  /\b(?:day\s*\d+|(?:the\s+)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|final|next)\s+day)\b/i;
// "fix" is deliberately NOT in the bare verb list above: it is a
// general-purpose problem-solving verb ("fix jet lag", "fix a flat tire")
// that says nothing about an existing plan on its own, unlike "swap"/
// "replace"/"adjust". It only counts as a refinement verb when it sits next
// to an actual reference INTO the plan (a day number) — the same narrowly-
// scoped pattern "move"/"make"/"change" etc. already use one line below.
const REFINEMENT_FAMILY = new RegExp(
  '\\b(?:make (?:it|the trip|this|our)|keep (?:the|this|our|same) (?:trip|plan|days?)|cut|drop|remove|swap|replace'
  + '|add|include|insert|avoid|skip'
  + '|change|update|adjust|refine|simplify|slower|more relaxed|less rushed|shorten|lighten'
  + `|(?:make|change|adjust|swap|redo|rework|ease|lighten|shorten|fix)\\b[^.!?]{0,24}${PLAN_DAY_REFERENCE.source})`,
  'i'
);

/**
 * A question asks ABOUT the plan; a statement changes the facts the plan was
 * built on. "What's on day 2?" must stay a question, while "we're not getting
 * in until late the first day" is a new constraint on day 1.
 */
const QUESTION_FRAME =
  /\?\s*$|^\s*(?:what|when|where|which|who|why|how|is|are|do|does|did|can|could|should|would|will|any)\b/i;

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

// ---------------------------------------------------------------------------
// Temporal semantics — a date is not a trip length
// ---------------------------------------------------------------------------

function resolveTemporalScope(text) {
  const scope = {
    visitWindow: null,
    durationDays: null,
    lodgingNights: null,
    durationUnit: null,
    durationSource: null,
    availableHours: null,
  };

  const windowMatch = text.match(VISIT_WINDOW);
  if (windowMatch) scope.visitWindow = windowMatch[0].trim().toLowerCase();

  // One shared grammar-based parser (see utils/durationSemantics). The phrase
  // lists this replaced accepted "three full days" but not "three relaxed
  // days", and had no concept of nights at all.
  const duration = parseTripDuration(text);
  scope.durationDays = duration.durationDays;
  scope.lodgingNights = duration.lodgingNights;
  scope.durationUnit = duration.unit;
  scope.durationSource = duration.source
    || (DATE_WEEKEND.test(text) ? 'visit_window_only' : null);

  const hourDigit = [...text.matchAll(/\b(\d{1,2})\s*[- ]?hours?\b/gi)];
  if (hourDigit.length) {
    scope.availableHours = Number(hourDigit[hourDigit.length - 1][1]) || null;
  } else if (/\bhalf[- ]?day\b/i.test(text)) {
    scope.availableHours = 4;
  }

  return scope;
}

// ---------------------------------------------------------------------------
// Destination relationship — count is NOT relationship
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Artifact request / prohibition
// ---------------------------------------------------------------------------

/**
 * What the traveler wants to KNOW is separate from what artifact the system
 * should BUILD. A prohibition always wins over a weaker positive inference.
 *
 * Fresh itinerary production is owned by `resolveProduceTripRequest` — one
 * produce-object grammar shared with TravelerJob. Do not re-scan a narrower
 * verb list here.
 */
function resolveArtifactIntent(text, {
  hasPriorPlan = false, temporal, destinationCount = 0, priorPlan = null, relationship = null,
  produce = null,
}) {
  const forbidden = [];
  const reasonCodes = [];

  if (forbidsItinerary(text)) {
    forbidden.push('itinerary');
    reasonCodes.push('explicit_artifact_prohibition');
  }

  const artifactScanText = stripContingencyPlanPhrases(text);
  const producesArtifact = PRODUCE_VERB.test(artifactScanText);
  const asksForOptions = isOptionsFrame(text);
  const produceRequest = produce || resolveProduceTripRequest(text, {
    destinationCount,
    durationDays: temporal?.durationDays,
    relationship,
    visitWindow: temporal?.visitWindow,
  });
  const explicitFreshItineraryRequest = produceRequest.askedToProduceTripArtifact;
  if (produceRequest.askedToProduceTripArtifact) {
    reasonCodes.push(...produceRequest.reasonCodes);
  } else if (produceRequest.reasonCodes.some((code) => (
    code === 'produce_forbidden' || code === 'options_frame' || code === 'circumstance_object' || code === 'priority_question'
  ))) {
    reasonCodes.push(...produceRequest.reasonCodes);
  }

  if (forbidden.includes('itinerary')) {
    const skeleton = SKELETON_LANGUAGE.test(text) || producesArtifact || temporal.durationDays != null;
    return {
      requestedArtifact: skeleton ? 'trip_skeleton' : 'plain_answer',
      forbiddenArtifacts: forbidden,
      artifactConfidence: 0.95,
      reasonCodes,
      produceRequest,
    };
  }

  // Refinement is decided by CONTEXT, not by phrasing: an active canonical plan
  // + a reference into it + modification intent. See utils/refinementSemantics.
  // The previous rule needed either an edit verb or the literal words "day N",
  // so "we'll be tired the second morning, so make that part easier" against a
  // real plan resolved to plain_answer and patched nothing (gate #3 D).
  const refinement = resolveRefinementIntent({ text, priorPlan, hasPriorPlan });

  if (refinement.isRefinement && !explicitFreshItineraryRequest) {
    reasonCodes.push('refines_existing_plan', ...refinement.reasonCodes);
    return {
      requestedArtifact: 'itinerary_patch',
      forbiddenArtifacts: forbidden,
      artifactConfidence: 0.9,
      refinementTarget: refinement.target,
      refinementDimensions: refinement.dimensions,
      reasonCodes,
      produceRequest,
    };
  }
  // The legacy edit-verb family stays as a floor: anything it already caught
  // remains a refinement even if the contextual resolver is more conservative.
  if (hasPriorPlan && REFINEMENT_FAMILY.test(text) && !explicitFreshItineraryRequest) {
    reasonCodes.push('refines_existing_plan', 'legacy_edit_verb_family');
    return {
      requestedArtifact: 'itinerary_patch',
      forbiddenArtifacts: forbidden,
      artifactConfidence: 0.9,
      refinementTarget: 'unknown',
      refinementDimensions: ['edit'],
      reasonCodes,
      produceRequest,
    };
  }

  if (explicitFreshItineraryRequest) {
    reasonCodes.push('explicit_itinerary_request');
    return {
      requestedArtifact: 'itinerary',
      forbiddenArtifacts: forbidden,
      artifactConfidence: 0.95,
      reasonCodes,
      produceRequest,
    };
  }

  if (SKELETON_LANGUAGE.test(text)) {
    reasonCodes.push('skeleton_language');
    return {
      requestedArtifact: 'trip_skeleton',
      forbiddenArtifacts: forbidden,
      artifactConfidence: 0.8,
      reasonCodes,
      produceRequest,
    };
  }

  // P0-3 (audit 2026-08-31) — a trip-scope DECLARATION is an organizing
  // request. "3 days in Zion, easy walks, bad knee, sunrise/sunset, no scary
  // exposure" names a destination and a multi-day visit and then describes
  // how the traveler wants those days to feel; a human reads that as "shape
  // this visit for me", not as a question. The constraint language must never
  // count as evidence AGAINST planning — before this rule the traveler who
  // shared the most got demoted to prose.
  //
  // Duration alone does not qualify: a message whose point is a question
  // ("I'll be in Zion for 3 days. Is Angels Landing worth it?", "How crowded
  // is Zion on a 3-day trip?") keeps its interrogative job. Grammar, not
  // phrase lists, is the discriminator.
  const declaresTripScope =
    destinationCount >= 1
    && temporal.durationDays != null
    && temporal.durationDays >= 2
    && !asksForOptions
    && !containsInterrogativeClause(text);
  if (declaresTripScope) {
    reasonCodes.push('trip_scope_declaration');
    return {
      requestedArtifact: 'itinerary',
      forbiddenArtifacts: forbidden,
      artifactConfidence: 0.9,
      reasonCodes,
      produceRequest,
    };
  }

  return {
    requestedArtifact: 'plain_answer',
    forbiddenArtifacts: forbidden,
    artifactConfidence: 0.6,
    reasonCodes,
    produceRequest,
  };
}

/**
 * Does any clause read as a question? Closed-class grammar only — sentence-
 * initial wh-words and interrogative auxiliaries, or an explicit question
 * mark — never topic phrases. Negated auxiliaries ("Can't do big hikes",
 * "Don't want exposure") are declarations, not questions.
 */
const INTERROGATIVE_LEAD =
  /^(?:who|whom|whose|what|when|where|why|how|which|is|are|am|was|were|do|does|did|can|could|should|would|shall|may|might)\b/i;
const NEGATED_AUX_LEAD = /^(?:do|does|did|can|could|should|would|is|are|was|were)(?:n?['’]t\b|\s+not\b)/i;

function containsInterrogativeClause(text) {
  const raw = String(text || '');
  if (raw.includes('?')) return true;
  return raw
    .split(/[.!;\n]+/)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .some((clause) => INTERROGATIVE_LEAD.test(clause) && !NEGATED_AUX_LEAD.test(clause));
}

function forbidsItinerary(text) {
  if (/\b(?:no|not|without|skip|hold off on|rather not)\s+(?:a\s+|the\s+|any\s+)?(?:day[- ]?by[- ]?day|daily itinerary|itinerary)\b/i.test(text)) {
    return true;
  }
  if (/\b(?:logistics first|not the itinerary yet|before the itinerary|skeleton)\b/i.test(text)) return true;
  // Negation operator within a short window of the artifact noun, e.g.
  // "Don't build the daily itinerary yet" / "no need to plan each day".
  const negationNearArtifact = new RegExp(
    `${NEGATION.source}\\b[^.!?]{0,48}?${ITINERARY_NOUN.source}`,
    'i'
  );
  return negationNearArtifact.test(text);
}

// ---------------------------------------------------------------------------
// Operational subjects
// ---------------------------------------------------------------------------

function resolveOperationalSubjects(text) {
  const subjects = [];
  // "We booked a hotel in Springdale" is a trip fact, not a permit question.
  if (!isConfirmedLodgingBooking(text) && (RESERVATION_FAMILY.test(text) || (PRE_TRIP_PREP.test(text) && ARRANGE_VERBS.test(text)))) {
    subjects.push('reservations_permits');
  }
  if (ACCESS_STATUS_FAMILY.test(text) && /\b(?:road|trail|shuttle|route|park|entrance|pass|gate|alert)\b/i.test(text)) {
    subjects.push('access_status');
  }
  if (PARKING_FAMILY.test(text)) subjects.push('parking');
  if (TRANSIT_FAMILY.test(text)) subjects.push('transit');
  if (WEATHER_FAMILY.test(text)) subjects.push('weather');
  if (FEE_FAMILY.test(text)) subjects.push('fees');
  return unique(subjects).filter((s) => OPERATIONAL_SUBJECTS.includes(s));
}

// ---------------------------------------------------------------------------
// Task family
// ---------------------------------------------------------------------------

function resolveTaskFamily(text, ctx) {
  const {
    relationship, artifact, operationalSubjects, temporal, priorJob, hasPriorPlan,
    destinationCount,
  } = ctx;
  const produceNow = artifact.requestedArtifact === 'itinerary';
  const topicActions = resolveTopicActions(text, { produce: produceNow });
  const reasonCodes = [];
  const S = RESOLUTION_STRENGTH;
  const family = (taskFamily, strength, code) => {
    reasonCodes.push(code);
    return { taskFamily, strength, reasonCodes };
  };

  // Classes that are fully determined by the request itself. These are resolved
  // FIRST and at full strength: a non-travel or meta request is understood, not
  // ambiguous, and must never be treated as something a semantic model should
  // reinterpret.
  if (NON_TRAVEL_FAMILY.test(text)) return family('non_travel', S.EXPLICIT, 'non_travel_request');
  if (META_HELP_FAMILY.test(text)) return family('meta_help', S.EXPLICIT, 'trailie_meta_question');
  if (DEEP_RESEARCH_FAMILY.test(text)) return family('deep_research', S.EXPLICIT, 'explicit_deep_research');

  if (artifact.forbiddenArtifacts.includes('itinerary')) {
    return family('trip_skeleton', S.EXPLICIT, 'artifact_prohibition_owns_task');
  }

  if (relationship === 'compare' || relationship === 'alternative_choice') {
    return family('comparison', S.EXPLICIT, 'destination_choice');
  }

  if (artifact.requestedArtifact === 'itinerary_patch') {
    return family('itinerary_refinement', S.EXPLICIT, 'refines_existing_plan');
  }
  if (artifact.requestedArtifact === 'itinerary') {
    return family('itinerary', S.EXPLICIT, 'explicit_itinerary_request');
  }

  if (
    topicMayOwnJob('access_contingency', topicActions)
    && (topicActions.contingency.isAccessContingency || topicActions.weatherContingency)
  ) {
    return family('access_current', S.STRONG, 'access_contingency');
  }

  // "Campground reservations" is a camping question that happens to involve a
  // reservation, so the more specific subject owns the turn.
  if (CAMPING_FAMILY.test(text)) return family('campground_strategy', S.STRONG, 'camping_question');

  // Operational questions are answered directly. A visit date does not make
  // them itinerary requests.
  if (isConfirmedLodgingBooking(text)) {
    return family('lodging_strategy', S.EXPLICIT, 'user_lodging_booking');
  }

  if (
    operationalSubjects.includes('reservations_permits')
    && topicMayOwnJob('permits_reservations', topicActions)
  ) {
    return family('permits_reservations', S.STRONG, 'reservation_permit_question');
  }
  if (OPERATIONAL_STATUS_FAMILY.test(text)) {
    return family('access_current', S.STRONG, 'operational_status_request');
  }
  if (operationalSubjects.includes('access_status')) {
    return family('access_current', S.STRONG, 'access_status_question');
  }

  if (DESTINATION_DISCOVERY_FAMILY.test(text)) {
    return family('destination_discovery', S.STRONG, 'open_ended_destination_choice');
  }

  if (DURATION_ADVICE_FAMILY.test(text) && !ACTIVITY_FAMILY.test(text)) {
    return family('duration_advice', S.STRONG, 'duration_advice');
  }

  if (AIRPORT_FAMILY.test(text)) return family('airport_strategy', S.STRONG, 'airport_question');
  if (LODGING_FAMILY.test(text)) return family('lodging_strategy', S.STRONG, 'lodging_question');
  if (BUDGET_FAMILY.test(text)) return family('cost_budget', S.STRONG, 'budget_question');

  // Transport/parking/shuttle topics are a real subject, not a fall-through.
  // Preference-only driving language and parking-status questions are vetoed
  // by dominant-action arbitration; route questions still own the family.
  if (
    topicMayOwnJob('route_planning', topicActions)
    && (topicActions.primaryRouteAsk || TRANSPORT_TOPIC_FAMILY.test(text))
  ) {
    return family('route_strategy', S.STRONG, 'transport_question');
  }

  if (relationship === 'route' || relationship === 'combine') {
    return family('route_strategy', S.CONTEXTUAL, 'multi_destination_trip_shape');
  }
  if (relationship === 'regional_set') {
    return family('trip_skeleton', S.CONTEXTUAL, 'regional_trip_shape');
  }

  if (hasPriorPlan && REFINEMENT_FAMILY.test(text)) {
    return family('itinerary_refinement', S.CONTEXTUAL, 'active_trip_mutation');
  }

  if (
    topicMayOwnJob('place_discovery', topicActions)
    && (topicActions.primaryPhotographyAsk || ACTIVITY_FAMILY.test(text))
  ) {
    return family('activity_advice', S.STRONG, 'activity_question');
  }

  void temporal;
  void priorJob;
  // General advice is a legitimate ANSWER class, not a parser failure. When the
  // turn names a destination and asks something answerable, say so with
  // confidence; only a contentless turn is genuinely weak.
  const answerable = destinationCount > 0 && text.split(/\s+/).length >= 4;
  return family(
    'general_advice',
    answerable ? S.STRONG : S.WEAK,
    answerable ? 'answerable_general_question' : 'general_travel_question'
  );
}

/**
 * Confidence = how strongly the reading is supported, on one scale for every
 * branch. Bounded and explainable; no statistical calibration is implied.
 */
function computeConfidence({ strength, positives, negatives }) {
  const base = STRENGTH_BASE[strength] ?? STRENGTH_BASE.weak;
  const corroboration = Math.min(positives.length, 2) * 0.03;
  const doubt = negatives.length * 0.15;
  const score = base + corroboration - doubt;
  return Math.max(0.15, Math.min(0.98, Number(score.toFixed(3))));
}

// ---------------------------------------------------------------------------
// Structure policy — only an explicit request may force structured output
// ---------------------------------------------------------------------------

function resolveStructurePolicy({ artifact, taskFamily, hasPriorPlan }) {
  if (artifact.forbiddenArtifacts.includes('itinerary')) return 'optional';
  if (artifact.requestedArtifact === 'itinerary_patch' && hasPriorPlan) return 'required';
  if (artifact.requestedArtifact === 'itinerary' && artifact.artifactConfidence >= 0.9) return 'required';
  if (taskFamily === 'itinerary' || taskFamily === 'itinerary_refinement') return 'preferred';
  return 'optional';
}

// ---------------------------------------------------------------------------

/**
 * WP-TU Phase 1a (TurnTripContext) — hydrate one `resolveDestinationsFromMessage`
 * entry into the shape `TurnTripContext.subjectDestinations`/`primaryDestination`
 * need (name/parkCode/lat/lon/source/confidence). Pure projection of fields
 * already present on `d` (`displayName`/`parkCode`/`latitude`/`longitude`/
 * `source`/`resolutionConfidence`) — no new resolution, no new destination logic.
 */
function hydrateSubjectDestination(d) {
  return {
    name: d.displayName || null,
    parkCode: d.parkCode || null,
    lat: d.latitude ?? null,
    lon: d.longitude ?? null,
    source: d.source || null,
    confidence: d.resolutionConfidence ?? null,
    mentionedPlaces: Array.isArray(d.mentionedPlaces) ? d.mentionedPlaces : [],
  };
}

/**
 * Build the canonical understanding of this turn. Deterministic and offline.
 */
function buildTurnUnderstanding({ userPrompt = '', priorTripState = null, officialPlaces = null } = {}) {
  const originalText = String(userPrompt || '');
  const text = normalizeUserText(originalText);

  const priorJob = priorTripState?.activeDecision?.kind || priorTripState?.lastTravelerJob || null;
  const priorPlanCandidate = priorTripState?.existingCanonicalPlan
    || priorTripState?.canonicalPlan
    || priorTripState?.priorPlan
    || null;
  // Draft skeletons never count as a prior itinerary. hasItinerary alone still
  // covers thin continuity state (active trip flag without hydrated days).
  const hasPriorPlan = !isDraftPlan(priorPlanCandidate)
    && (priorTripState?.hasItinerary === true || hasPriorPlanStructure(priorPlanCandidate));

  const destinations = resolveDestinationsFromMessage(text, officialPlaces ? { officialPlaces } : {}) || [];
  const relationshipResult = resolveDestinationRelationship(text, destinations);
  const comparisonSelection = resolveComparisonSelection({ text, destinations });
  const accessContingency = resolveAccessContingency(text);
  const temporal = resolveTemporalScope(text);
  const produceRequest = resolveProduceTripRequest(text, {
    destinationCount: destinations.length,
    durationDays: temporal.durationDays,
    relationship: relationshipResult.relationship,
    visitWindow: temporal.visitWindow,
  });
  if (produceRequest.impliedDurationDays != null && temporal.durationDays == null) {
    temporal.durationDays = produceRequest.impliedDurationDays;
    temporal.durationUnit = temporal.durationUnit || 'day';
    temporal.durationSource = 'produce_day_object';
  }
  const artifact = resolveArtifactIntent(text, {
    hasPriorPlan,
    temporal,
    destinationCount: destinations.length,
    priorPlan: hasPriorPlanStructure(priorPlanCandidate) ? priorPlanCandidate : null,
    relationship: relationshipResult.relationship,
    produce: produceRequest,
  });
  const operationalSubjects = resolveOperationalSubjects(text);

  const task = resolveTaskFamily(text, {
    relationship: relationshipResult.relationship,
    artifact,
    operationalSubjects,
    temporal,
    priorJob,
    hasPriorPlan,
    destinationCount: destinations.length,
  });

  const explicitConstraints = extractExplicitConstraints(text);
  const softPreferences = extractSoftPreferences(text);

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const isShortFollowUp = wordCount <= 12 && destinations.length === 0;
  const continuationOfActiveDecision = Boolean(
    priorJob && isShortFollowUp && task.strength !== RESOLUTION_STRENGTH.EXPLICIT
  );
  // A topic shift means the traveler moved to a DIFFERENT decision while one
  // was open — not merely that the new turn is confident.
  const topicShift = Boolean(
    priorJob
    && !continuationOfActiveDecision
    && task.strength !== RESOLUTION_STRENGTH.WEAK
    && jobBelongsToFamily(priorJob) !== task.taskFamily
  );

  const structurePolicy = resolveStructurePolicy({
    artifact,
    taskFamily: task.taskFamily,
    hasPriorPlan,
  });

  // ---- confidence: how strongly this reading is supported --------------
  const positives = [];
  const negatives = [];
  if (artifact.forbiddenArtifacts.length) positives.push('explicit_artifact_prohibition');
  if (artifact.requestedArtifact === 'itinerary' || artifact.requestedArtifact === 'itinerary_patch') {
    positives.push('explicit_artifact_request');
  }
  if (operationalSubjects.length) positives.push('explicit_operational_subject');
  if (destinations.length > 0) positives.push('resolved_destination');
  if (temporal.durationDays != null) positives.push('explicit_duration');
  if (explicitConstraints.length) positives.push('explicit_constraint');
  if (continuationOfActiveDecision) positives.push('active_decision_continuity');

  const relationshipUnclear = destinations.length > 1 && relationshipResult.relationship === 'unknown';
  // Choice language with only ONE entity resolved: the frame expects another
  // destination that entity resolution did not find. Reporting "single" here
  // would be false certainty.
  const comparisonEntityMissing = destinations.length === 1 && isChoiceFrame(text);
  // A conflict means the traveler both asked for and forbade the artifact —
  // NOT that the prohibition itself contains the word "build" ("don't build
  // the itinerary yet" is one coherent instruction, not a contradiction).
  const artifactConflict = artifact.forbiddenArtifacts.includes('itinerary')
    && /(?:^|[.!?;]\s*)(?!\s*(?:don'?t|do not|no|never|skip|hold off))[^.!?;]{0,40}\b(?:build|create|make)\b[^.!?;]{0,24}\b(?:the |an |a )?(?:itinerary|day[- ]?by[- ]?day)\b/i.test(text);

  if (relationshipUnclear) negatives.push('unclear_destination_relationship');
  if (comparisonEntityMissing) negatives.push('unresolved_comparison_entity');
  if (artifactConflict) negatives.push('unclear_artifact_intent');
  if (isShortFollowUp && !priorJob && task.strength === RESOLUTION_STRENGTH.WEAK) {
    negatives.push('elliptical_without_context');
  }

  const confidence = computeConfidence({ strength: task.strength, positives, negatives });

  // ---- underspecification is not semantic ambiguity ---------------------
  // A model cannot invent preferences the traveler never expressed; the right
  // response is a broad answer or a clarifying question, not a semantic call.
  const missingInformation = [];
  if (task.taskFamily === 'general_advice'
    && task.strength === RESOLUTION_STRENGTH.WEAK
    && destinations.length === 0
    && !priorJob) {
    missingInformation.push('destination');
    if (temporal.durationDays == null && !temporal.visitWindow) missingInformation.push('dates_or_duration');
  }
  const underspecified = missingInformation.length > 0;

  const sufficiencyDecision = resolveTurnSufficiencyDecision({
    userText: originalText || text,
    requestedArtifact: artifact.requestedArtifact,
    askedToProduceTripArtifact: produceRequest.askedToProduceTripArtifact === true,
    destinations,
    temporalScope: temporal,
    constraints: { dates: { numDays: temporal.durationDays } },
    metadata: {
      parkCode: destinations[0]?.parkCode || null,
      parkName: destinations[0]?.displayName || null,
    },
    priorPlan: hasPriorPlanStructure(priorPlanCandidate) ? priorPlanCandidate : null,
    hasPriorPlan,
    isRefinement: Boolean(hasPriorPlan && (
      artifact.requestedArtifact === 'itinerary_patch'
      || (priorJob && continuationOfActiveDecision)
    )),
  });

  // ---- semantic resolution: only genuine, model-resolvable ambiguity ----
  const semanticResolutionReasons = [];
  // Fully-determined classes are understood. Sending them to a model would buy
  // nothing and would spend a call reinterpreting a Python question.
  const selfDetermined = ['non_travel', 'meta_help'].includes(task.taskFamily);
  if (!selfDetermined && !underspecified) {
    if (comparisonEntityMissing) semanticResolutionReasons.push('unresolved_comparison_entity');
    if (relationshipUnclear) semanticResolutionReasons.push('unclear_destination_relationship');
    if (artifactConflict) semanticResolutionReasons.push('unclear_artifact_intent');
    if (isShortFollowUp && priorJob && task.strength !== RESOLUTION_STRENGTH.EXPLICIT) {
      semanticResolutionReasons.push('elliptical_reference');
    }
  }
  const needsSemanticResolution = semanticResolutionReasons.length > 0;

  return {
    contractVersion: 2,
    originalText,
    normalizedText: text,

    taskFamily: task.taskFamily,
    taskStrength: task.strength,
    confidence,

    requestedArtifact: artifact.requestedArtifact,
    forbiddenArtifacts: artifact.forbiddenArtifacts,
    structurePolicy,
    askedToProduceTripArtifact: produceRequest.askedToProduceTripArtifact === true,

    destinationRelationship: relationshipResult.relationship,
    destinationRelationshipConfidence: relationshipResult.confidence,
    comparisonSelectionRequired: comparisonSelection.required === true,
    comparisonSelectionException: comparisonSelection.exception || null,
    actionableContingencyRequired: accessContingency.isAccessContingency === true
      && artifact.requestedArtifact !== 'itinerary',
    destinationRefs: destinations.map((d) => ({
      entityId: d.entityId || null,
      parkCode: d.parkCode || null,
      displayName: d.displayName || null,
    })),
    // WP-TU Phase 1a (TurnTripContext) — additive hydrated projection of the
    // same `destinations` resolved above. `primaryDestination` is the
    // first-order entry (`destinations` is already ordered by first mention
    // in `resolveDestinationsFromMessage`). No new destination-resolution
    // logic; see hydrateSubjectDestination().
    subjectDestinations: destinations.map(hydrateSubjectDestination),
    primaryDestination: destinations.length > 0 ? hydrateSubjectDestination(destinations[0]) : null,
    // Pass-through only — populated by the prior-state builder (plan Task 1c,
    // not wired here). buildTurnUnderstanding performs no continuity
    // reasoning of its own for this field, and does not read or affect
    // continuationOfActiveDecision/priorJob/topicShift below, which stay
    // exactly as they were.
    priorConversationalSubject: priorTripState?.lastConversationalSubject || null,

    operationalSubjects,
    temporalScope: temporal,

    continuationOfActiveDecision,
    priorJob,
    topicShift,

    explicitConstraints,
    softPreferences,

    understandingSource: 'deterministic',
    needsSemanticResolution,
    semanticResolutionReasons,
    underspecified,
    missingInformation,
    executionDecision: sufficiencyDecision.decision,
    materialMissingInformation: sufficiencyDecision.materialMissingInformation,
    clarificationNeeded: sufficiencyDecision.clarificationNeeded,
    confidenceSignals: { positives, negatives },
    reasonCodes: unique([
      ...task.reasonCodes,
      ...artifact.reasonCodes,
      ...relationshipResult.reasonCodes,
      ...comparisonSelection.reasonCodes,
      temporal.durationSource,
    ]),
  };
}

module.exports = {
  TASK_FAMILIES,
  ARTIFACTS,
  DESTINATION_RELATIONSHIPS,
  STRUCTURE_POLICIES,
  OPERATIONAL_SUBJECTS,
  RESOLUTION_STRENGTH,
  SEMANTIC_RESOLUTION_REASONS,
  buildTurnUnderstanding,
  // exported for focused tests and for reuse by adjacent contracts
  resolveTemporalScope,
  resolveArtifactIntent,
  forbidsItinerary,
  computeConfidence,
};
