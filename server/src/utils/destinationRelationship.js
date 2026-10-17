'use strict';

/**
 * How the destinations in a turn relate to each other — which is NOT the same
 * question as how many there are.
 *
 * "Acadia or the Smokies?" names two parks and implies no travel between them.
 * Deriving a route (and therefore hard inter-destination driving evidence) from
 * destination count alone is what turned a comparison into an unanswerable turn.
 *
 * Shared by the turn-understanding contract and the trip-scope builder so both
 * read one definition. Offline, provider-neutral, no destination hardcodes.
 */

const { normalizeUserText } = require('./lexicalNormalization');

const DESTINATION_RELATIONSHIPS = Object.freeze([
  'single',
  'compare',
  'alternative_choice',
  'combine',
  'route',
  'regional_set',
  'unknown',
]);

/** Relationships that involve actually travelling between the destinations. */
const TRAVEL_RELATIONSHIPS = Object.freeze(['route', 'combine', 'regional_set']);
/** Relationships where the traveler picks ONE — never a route. */
const CHOICE_RELATIONSHIPS = Object.freeze(['compare', 'alternative_choice']);

/**
 * Explicit comparison, by verb OR by noun. A traveler asking for "the
 * tradeoffs between A and B" or "the differences between A and B" is comparing
 * just as plainly as one who says "compare" — and without the noun family the
 * "between ... and" conjunction is read as combining the two into one trip.
 */
const EXPLICIT_COMPARE =
  /\bcompar(?:e|ing|ison|isons)\b|\bversus\b|\bvs\.?\b|\btrade[- ]?offs?\b|\bdifferences?\b|\bpros and cons\b|\bhow (?:do|does|would|are|is) .{0,60}\b(?:differ(?:ent)?|compare)\b/i;

/**
 * "between X and Y" is a CHOICE frame. The conjunction inside it joins the
 * alternatives being chosen from — it does not join destinations into one trip,
 * so the plain conjunction rule must not claim it.
 */
const BETWEEN_FRAME =
  /\b(?:between|among)\b[^.?!]{0,80}\band\b/i;
/**
 * Verbs that make "between A and B" a CHOICE. Deliberately excludes
 * distribution verbs: "split a week between A and B" allocates time to both,
 * which is a combination, not a decision.
 */
const BETWEEN_CHOICE_VERB =
  /\b(?:decid(?:e|ing)|choos(?:e|ing)|chose|pick(?:ing)?|torn|undecided|weigh(?:ing)?|debating|deciding)\b/i;
const BETWEEN_DISTRIBUTION_VERB = /\b(?:split|divide|share|spread|allocate|balance)\b/i;
/**
 * Indecision is a choice frame even when no decision VERB is present. A
 * traveler who is "going back and forth between A and B" or "on the fence"
 * is choosing, not combining — but the joiner in that sentence is "and", so
 * without this family the conjunction rule below confidently returns
 * `combine` and the turn is answered as a road trip nobody asked for.
 *
 * This is a concept family (vacillation), not a list of sentences.
 */
const INDECISION_FRAME =
  /\b(?:(?:going|go|keep going|been going)\s+back and forth|back and forth|can'?t\s+(?:decide|choose|pick|settle|make up (?:my|our) mind)|cannot\s+(?:decide|choose|pick)|on the fence|waffl(?:e|ing)|flip[- ]?flop(?:ping|ped)?|vacillating|keep (?:changing|switching|flipping) (?:my|our) mind|keep switching between|undecided|not sure which|unsure which|debating|torn|trying to (?:decide|choose|pick)|narrow(?:ing)? it down)\b/i;

/**
 * ORDER-INDEPENDENT ALTERNATIVE EVIDENCE.
 *
 * The 2026-08-23 gate #2 failure was structural, not lexical: the choice cue
 * was recognised, but only inside `BETWEEN_FRAME`, which demands the surface
 * order "between ... and". A traveler who writes
 *
 *   "Joshua Tree and Death Valley both sound good ... I keep changing my mind
 *    between them"
 *
 * names the entities FIRST and refers back to them anaphorically, so the frame
 * missed and the conjunction rule confidently returned `combine`.
 *
 * Relationship is a property of the turn, not of token order. These families
 * detect that the traveler is deciding AMONG a candidate set wherever the cue
 * sits — before, between, or after the destinations, or purely anaphoric.
 */
/** "between them", "one of them", "either one", "the other one". */
const ANAPHORIC_ALTERNATIVES =
  /\b(?:between (?:them|the two|those|these)|among (?:them|those)|one of (?:them|those|the two)|either (?:one|of them)|the other one|which one|whichever one)\b/i;
/** Surface markers that a set is being chosen FROM. */
const ALTERNATIVE_MARKER =
  /\b(?:or|either|between|among|one of|which (?:one|of))\b/i;
/** Explicit "we can only take one of these". */
const SINGLE_SELECTION_FRAME =
  /\b(?:only (?:choose|pick|do|visit|manage) one|can only (?:choose|pick|do|visit|manage)|choose (?:just )?one|pick (?:just )?one|probably only .{0,16}one|just one of)\b/i;
/**
 * A stated commitment to visiting BOTH. This outranks indecision: a traveler
 * who says "on the same trip" has already decided the relationship, whatever
 * else the sentence expresses.
 */
const SAME_TRIP_COMMITMENT =
  /\b(?:same trip|one trip|do both|see both|visit both|both parks|fit .{0,24} into one|hit both)\b/i;

/**
 * Comparative frames: "better than", "easier than", "quieter, A or B".
 * Detected by grammar (comparative marker + than / disjunction), not by a list
 * of adjectives.
 */
const COMPARATIVE_FRAME =
  /\b(?:better|worse|easier|harder|quieter|busier|cheaper|closer|further|farther|nicer|prettier|warmer|colder|shorter|longer|\w{3,}(?:er))\s+than\b|\bmore\s+\w+\s+than\b|\bless\s+\w+\s+than\b/i;
const CHOICE_LANGUAGE =
  /\b(?:which (?:one|is|would|fits?|makes?)|would you (?:pick|choose|go with|recommend)|should (?:i|we) (?:pick|choose|go with)|pick one|deciding between|decide between|torn between|choosing between|(?:your )?choice between|leaning toward|leaning towards|better (?:for|choice|fit|option)|either)\b/i;
const COMBINE_LANGUAGE =
  /\b(?:both|combine|together in (?:one|the same) trip|same trip|one trip|split (?:a |the |my |our )?\w*\s*(?:week|days?|time|trip)?\s*between|add(?:ing)? .{0,30}\bto the trip\b|pair(?:ing)? .{0,20}\bwith\b|visit .{0,40}\band\b)/i;
const ROUTE_LANGUAGE =
  /\b(?:road\s*trip|drive from|driving (?:tour|from|to)|from .{1,40} to .{1,40}|loop|route between|drive between|circuit)\b/i;
const REGIONAL_LANGUAGE =
  /\b(?:region|regional|southern|northern|eastern|western|central|all (?:five|four|three|the) parks?|mighty five|which parks?|parks? (?:in|around|near))\b/i;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A disjunction spanning a destination mention ("Acadia or the Smokies").
 * This is the single strongest signal that the traveler wants to choose one.
 */
function hasDestinationJoiner(text, destinations, joiner) {
  if (!Array.isArray(destinations) || destinations.length < 2) return false;
  const lower = normalizeUserText(text).toLowerCase();
  for (const destination of destinations) {
    const name = String(destination?.displayName || destination?.parkName || '').toLowerCase();
    const head = name.split(/\s+/)[0];
    if (!head) continue;
    const pattern = new RegExp(
      `${escapeRegex(head)}[^.?!]{0,40}\\b${joiner}\\b|\\b${joiner}\\b[^.?!]{0,40}${escapeRegex(head)}`,
      'i'
    );
    if (pattern.test(lower)) return true;
  }
  return false;
}

/** "Acadia or the Smokies" — the traveler picks one. */
function hasDestinationDisjunction(text, destinations) {
  return hasDestinationJoiner(text, destinations, 'or');
}

/** "Yellowstone and Grand Teton" — the traveler visits both. */
function hasDestinationConjunction(text, destinations) {
  return hasDestinationJoiner(text, destinations, 'and');
}

/** "deciding between A and B" / "torn between A and B". */
function isBetweenChoiceFrame(message) {
  const text = normalizeUserText(message);
  if (!BETWEEN_FRAME.test(text)) return false;
  if (BETWEEN_DISTRIBUTION_VERB.test(text)) return false;
  return BETWEEN_CHOICE_VERB.test(text) || INDECISION_FRAME.test(text);
}

/** Any frame that asks the traveler to pick one destination over another. */
function isChoiceFrame(message) {
  const text = normalizeUserText(message);
  return isBetweenChoiceFrame(text)
    || COMPARATIVE_FRAME.test(text)
    || EXPLICIT_COMPARE.test(text)
    || SINGLE_SELECTION_FRAME.test(text)
    || (INDECISION_FRAME.test(text)
      && (ALTERNATIVE_MARKER.test(text) || ANAPHORIC_ALTERNATIVES.test(text)))
    || (CHOICE_LANGUAGE.test(text) && /\b(?:or|between|than)\b/i.test(text));
}

/**
 * Resolve the relationship. Confidence matters downstream: weakly-inferred
 * relationships must not be allowed to create hard evidence dependencies.
 */
function resolveDestinationRelationship(message, destinations = []) {
  const text = normalizeUserText(message);
  const count = Array.isArray(destinations) ? destinations.length : 0;
  const reasonCodes = [];

  const choiceFrame = isChoiceFrame(text);

  if (count <= 1) {
    if (count === 1 && REGIONAL_LANGUAGE.test(text) && /\bparks?\b/i.test(text)) {
      reasonCodes.push('regional_language_single_anchor');
      return { relationship: 'regional_set', confidence: 0.7, reasonCodes };
    }
    // The language clearly frames a choice, but entity resolution found only
    // one destination. Reporting `single` would be false certainty about a
    // sentence that plainly names another place we failed to resolve.
    if (count === 1 && choiceFrame) {
      reasonCodes.push('unresolved_comparison_entity');
      return { relationship: 'unknown', confidence: 0.35, reasonCodes };
    }
    // "the other one" / "between them" with nothing resolved this turn: the
    // candidate set lives in prior state, not in this sentence. Reporting
    // `single` would assert a selection the traveler has not made.
    if (count === 0 && ANAPHORIC_ALTERNATIVES.test(text)) {
      reasonCodes.push('anaphoric_alternative_without_local_entities');
      return { relationship: 'unknown', confidence: 0.3, reasonCodes };
    }
    return {
      relationship: count === 1 ? 'single' : 'unknown',
      confidence: count === 1 ? 0.95 : 0.4,
      reasonCodes,
    };
  }

  if (ROUTE_LANGUAGE.test(text)) {
    reasonCodes.push('explicit_route_language');
    return { relationship: 'route', confidence: 0.95, reasonCodes };
  }
  if (EXPLICIT_COMPARE.test(text)) {
    reasonCodes.push('explicit_comparison');
    return { relationship: 'compare', confidence: 0.95, reasonCodes };
  }

  const disjunction = hasDestinationDisjunction(text, destinations);

  // A stated commitment to visiting both settles the relationship before any
  // choice evidence is weighed: "we want to do both on the same trip" is a
  // combination even if the traveler also sounds undecided about the order.
  const committedToBoth = SAME_TRIP_COMMITMENT.test(text);

  // The choice frames run BEFORE the conjunction rule: "deciding between A and
  // B" and "is A better than B" both contain joiners that would otherwise be
  // read as combining the destinations into one trip.
  if (isBetweenChoiceFrame(text)) {
    reasonCodes.push('between_choice_frame');
    return { relationship: 'alternative_choice', confidence: 0.9, reasonCodes };
  }
  // ORDER-INDEPENDENT: the cue may sit anywhere, or refer back anaphorically.
  // With two or more resolved candidates, indecision IS the relationship —
  // requiring the entities to follow the word "between" tied semantics to
  // typing order and produced a confidently wrong `combine`.
  if (!committedToBoth && INDECISION_FRAME.test(text)
    && (ALTERNATIVE_MARKER.test(text) || ANAPHORIC_ALTERNATIVES.test(text) || count >= 2)) {
    reasonCodes.push('indecision_over_candidate_set');
    return { relationship: 'alternative_choice', confidence: 0.88, reasonCodes };
  }
  if (!committedToBoth && SINGLE_SELECTION_FRAME.test(text)) {
    reasonCodes.push('single_selection_frame');
    return { relationship: 'alternative_choice', confidence: 0.88, reasonCodes };
  }
  if (COMPARATIVE_FRAME.test(text)) {
    reasonCodes.push('comparative_frame');
    return { relationship: 'alternative_choice', confidence: 0.88, reasonCodes };
  }
  if (disjunction || CHOICE_LANGUAGE.test(text)) {
    reasonCodes.push(disjunction ? 'destination_disjunction' : 'choice_language');
    return {
      relationship: 'alternative_choice',
      confidence: disjunction ? 0.9 : 0.75,
      reasonCodes,
    };
  }
  if (COMBINE_LANGUAGE.test(text) || hasDestinationConjunction(text, destinations)) {
    reasonCodes.push(COMBINE_LANGUAGE.test(text) ? 'combine_language' : 'destination_conjunction');
    return { relationship: 'combine', confidence: 0.85, reasonCodes };
  }
  if (REGIONAL_LANGUAGE.test(text)) {
    reasonCodes.push('regional_language');
    return { relationship: 'regional_set', confidence: 0.75, reasonCodes };
  }

  reasonCodes.push('multiple_destinations_unclear_relationship');
  return { relationship: 'unknown', confidence: 0.4, reasonCodes };
}

/** Only these relationships may generate inter-destination travel evidence. */
function relationshipImpliesTravelBetweenDestinations(relationship) {
  return TRAVEL_RELATIONSHIPS.includes(relationship);
}

/** A hard (turn-blocking) driving requirement needs an unambiguous route. */
function relationshipJustifiesHardDrivingEvidence(relationship, confidence = 0) {
  if (!relationshipImpliesTravelBetweenDestinations(relationship)) return false;
  return relationship === 'route' && confidence >= 0.9;
}

module.exports = {
  DESTINATION_RELATIONSHIPS,
  TRAVEL_RELATIONSHIPS,
  CHOICE_RELATIONSHIPS,
  resolveDestinationRelationship,
  relationshipImpliesTravelBetweenDestinations,
  relationshipJustifiesHardDrivingEvidence,
  hasDestinationDisjunction,
  hasDestinationConjunction,
  isChoiceFrame,
  isBetweenChoiceFrame,
};
