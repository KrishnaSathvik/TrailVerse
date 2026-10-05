'use strict';

/**
 * ONE produce-object grammar for "the traveler asked Trailie to produce a
 * trip artifact." TurnUnderstanding and TravelerJob both read this signal.
 *
 * Families, not spellings: a produce verb whose object is a trip/day/
 * itinerary, not a circumstance to navigate or a set of options to compare.
 */

const { normalizeUserText } = require('./lexicalNormalization');
const { stripContingencyPlanPhrases } = require('./priorityContingencyAdvice');
const { parseTripDuration } = require('./durationSemantics');

const OPTIONS_FRAME =
  /\b(?:(?:a |some )?(?:couple|few|number|handful)\s+(?:of\s+)?(?:different\s+|other\s+)?(?:ways|options|approaches|ideas|shapes|versions|angles)|(?:some|several|different|various|multiple)\s+(?:ways|options|approaches|ideas|shapes)|what\s+(?:are|would be)\s+(?:the\s+|some\s+)?(?:\w+\s+){0,2}(?:ways|options|approaches)|how\s+(?:could|should|would|might)\s+(?:we|i|you)\b|walk\s+(?:me|us)\s+through\s+(?:a\s+few|some|the)\b)/i;

const PRODUCE_VERB =
  /\b(?:build|create|make|write|put together|draw up|map out|lay out|sketch|draft|design|plan|come up with|work out|give|help|map)\b/i;

const ITINERARY_NOUN =
  /\b(?:itinerar(?:y|ies)|day[- ]?by[- ]?day|daily (?:plan|schedule|itinerary)|day plans?|trip plans?|each day|hour[- ]?by[- ]?hour)\b/i;

const ONE_DAY_ARTIFACT_NOUN =
  /\b(?:a |an |one |the |our |my )?(?:full |entire |whole )?day plans?\b|\bone[- ]day\s+(?:itinerary|plan|trip)\b/i;

const TRIP_NOUN = /\b(?:trip|itinerary|vacation|getaway|road\s*trip)\b/i;

const EXPLICIT_REDIRECT =
  /\b(?:actually|instead|rather than|let'?s do|go with|switch to|change to|move to)\b/i;

const PRIORITY_QUESTION =
  /\b(?:what should i\b|what(?:'s| is) the priority|priorit(?:y|ize))\b/i;

const DURATION_AFTER_FOR =
  /\bplan\s+for\s+(?:a\s+|an\s+|the\s+|one\s+|two\s+|three\s+|four\s+|five\s+|six\s+|seven\s+|\d{1,2}\s+)?(?:full\s+|entire\s+|whole\s+)?(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)?\s*(?:[- ]?days?|weeks?|weekend)\b/i;

function isOptionsFrame(text) {
  return OPTIONS_FRAME.test(text);
}

/**
 * "plan around crowds" / "plan my day if it rains" / "plan for rain".
 * "plan for one full day" / "plan for 3 days" is a trip object, not a condition.
 */
function isCircumstancePlan(text) {
  if (/\bplan\s+(?:around|ahead|based on)\b/i.test(text)) return true;
  if (/\bplan\s+(?:my|our)\s+\w+/i.test(text)) return true;
  if (/\bhow should i plan\b/i.test(text) && /\bif\b/i.test(text)) return true;
  if (/\bplan\s+for\b/i.test(text) && !DURATION_AFTER_FOR.test(text)) return true;
  return false;
}

function forbidsProduce(text) {
  if (/\b(?:no|not|without|skip|hold off on|rather not)\s+(?:a\s+|the\s+|any\s+)?(?:day[- ]?by[- ]?day|daily itinerary|itinerary)\b/i.test(text)) {
    return true;
  }
  if (/\b(?:logistics first|not the itinerary yet|before the itinerary|skeleton)\b/i.test(text)) return true;
  const negationNearArtifact = /\b(?:don'?t|do not|dont|no need to|not|without|never|skip|hold off(?: on)?|rather not|no)\b[^.!?]{0,48}?\b(?:itinerar(?:y|ies)|day[- ]?by[- ]?day|daily (?:plan|schedule|itinerary)|each day)\b/i;
  return negationNearArtifact.test(text);
}

/**
 * Produce verb whose object is a visit-day: "build me a day", "put together
 * an easy day", "design a photography day", "give us a Sequoia day".
 * "plan my day" is circumstance (possessive), not this family.
 */
const PLAN_DAY_ORDINAL =
  String.raw`(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|final|next)`;

const PRODUCE_ACTION =
  String.raw`(?:build|create|make|write|put together|draw up|map out|lay out|sketch|draft|design|plan|come up with|work out|give|help(?:\s+(?:me|us)\s+spend)?|map)`;

const DAY_TRIP_OBJECT = new RegExp(
  String.raw`\b${PRODUCE_ACTION}\b`
  + String.raw`\s+(?:me\s+|us\s+)?`
  + String.raw`(?:a|an|one|the)\s+`
  + String.raw`(?!${PLAN_DAY_ORDINAL}\s+days?\b)`
  + String.raw`(?:(?:full|entire|whole|easy|realistic|relaxed|scenic|quiet)\s+)*`
  + String.raw`(?:one[- ]day\s+)?`
  + String.raw`(?:[A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){0,2}\s+)?`
  + String.raw`days?\b`,
  'i',
);

const COUNTED_DAY_OBJECT = new RegExp(
  String.raw`\b${PRODUCE_ACTION}\b`
  + String.raw`\s+(?:me\s+|us\s+)?`
  + String.raw`(?:a|an|one|the|\d{1,2}|two|three|four|five|six|seven|eight|nine|ten)\s+`
  + String.raw`(?:full\s+|entire\s+|whole\s+)?`
  + String.raw`days?\b`,
  'i',
);

const TRIP_ARTIFACT_OBJECT = new RegExp(
  String.raw`\b${PRODUCE_ACTION}\b`
  + String.raw`\s+(?:me\s+|us\s+)?(?:a|an|the|our|my)?\s*`
  + String.raw`(?:\w+[- ]day\s+|\d{1,2}[- ]?day\s+)?`
  + String.raw`(?:road\s+)?(?:trip|itinerary|plan|vacation|getaway)\b`,
  'i',
);

const REQUEST_TRIP_ARTIFACT =
  /\b(?:i |we )?(?:need|want|would like|looking for)\b[^.!?]{0,40}\b(?:a |an |the |our |my )?(?:day plan|daily plan|trip plan|itinerary)\b/i;

const POSSESS_DAY_THEN_PRODUCE =
  /\b(?:we have|i have|we(?:'ve| have) got)\s+(?:a|an|one|the)\s+(?:full\s+|entire\s+|whole\s+)?days?\b[\s\S]{0,80}\b(?:plan|build|create|make|put together|design|map(?:\s+it|\s+this|\s+that|\s+out)?)\b/i;

const MAP_ROUTE_OR_DISPLAY =
  /\bon (?:a |the )?map\b|\bgoogle maps?\b|\bmap (?:the |a |this )?route\b|\bmap (?:from|between)\b|\bshow (?:me |us )?(?:this |it )?(?:on |in )?(?:a |the )?map\b/i;

const INTERROGATIVE_PRODUCE =
  /\bwhat would you\s+(?:plan|build|create|put together|design|make)\b/i;

const TRANSFORM_INTO_ITINERARY =
  /\bturn\b.{0,32}\binto\b.{0,24}\b(?:an?\s+)?(?:itinerary|day[- ]?by[- ]?day)\b/i;

const POLITE_ITINERARY =
  /\b(?:can you|could you|please|now|okay|ok)\b/i;

function empty() {
  return {
    askedToProduceTripArtifact: false,
    objectKind: null,
    impliedDurationDays: null,
    reasonCodes: [],
  };
}

function resolveProduceTripRequest(rawText, {
  destinationCount = 0,
  durationDays = null,
  relationship = null,
  visitWindow = null,
} = {}) {
  const text = normalizeUserText(rawText);
  if (!text) return empty();
  if (forbidsProduce(text)) {
    return { ...empty(), reasonCodes: ['produce_forbidden'] };
  }

  const scan = stripContingencyPlanPhrases(text);
  if (isOptionsFrame(text)) {
    return { ...empty(), reasonCodes: ['options_frame'] };
  }
  if (PRIORITY_QUESTION.test(text) && !TRIP_ARTIFACT_OBJECT.test(scan) && !DAY_TRIP_OBJECT.test(scan)) {
    return { ...empty(), reasonCodes: ['priority_question'] };
  }

  const parsedDurationDays = durationDays != null
    ? durationDays
    : parseTripDuration(text).durationDays;
  const circumstance = isCircumstancePlan(text);
  const mapRouteOrDisplay = MAP_ROUTE_OR_DISPLAY.test(text);
  const hasProduce = PRODUCE_VERB.test(scan) && !(mapRouteOrDisplay && !/\bmap out\b/i.test(scan) && !DAY_TRIP_OBJECT.test(scan) && !COUNTED_DAY_OBJECT.test(scan) && !POSSESS_DAY_THEN_PRODUCE.test(scan));
  const dayObject = DAY_TRIP_OBJECT.test(scan) || COUNTED_DAY_OBJECT.test(scan);
  const requestedArtifactNoun = REQUEST_TRIP_ARTIFACT.test(scan);
  const explicitNoun = TRANSFORM_INTO_ITINERARY.test(scan)
    || TRIP_ARTIFACT_OBJECT.test(scan)
    || requestedArtifactNoun
    || (ITINERARY_NOUN.test(text) && hasProduce)
    || (ITINERARY_NOUN.test(text) && POLITE_ITINERARY.test(text));
  const possessThenProduce = POSSESS_DAY_THEN_PRODUCE.test(scan);
  const interrogativeProduce = INTERROGATIVE_PRODUCE.test(scan)
    && (dayObject || parsedDurationDays != null || ITINERARY_NOUN.test(text) || /\b(?:a|one|full)\s+days?\b/i.test(scan));

  if (circumstance && !explicitNoun && !dayObject && !possessThenProduce && !interrogativeProduce) {
    return { ...empty(), reasonCodes: ['circumstance_object'] };
  }

  let objectKind = null;
  const oneDayArtifact = ONE_DAY_ARTIFACT_NOUN.test(scan)
    || dayObject
    || possessThenProduce
    || (requestedArtifactNoun && /\bday plans?\b/i.test(scan))
    || (/\bone[- ]day\b/i.test(scan) && ITINERARY_NOUN.test(scan));
  if (oneDayArtifact && (explicitNoun || dayObject || possessThenProduce || requestedArtifactNoun)) {
    objectKind = 'day_object';
  } else if (explicitNoun) objectKind = 'explicit_noun';
  else if (dayObject || possessThenProduce) objectKind = 'day_object';
  else if (interrogativeProduce && (parsedDurationDays === 1 || /\b(?:a|one|full)\s+days?\b/i.test(scan))) {
    objectKind = 'day_object';
  } else if (parsedDurationDays != null && hasProduce && destinationCount >= 1 && !circumstance) {
    objectKind = 'counted_trip';
  } else if (hasProduce && destinationCount >= 2 && (relationship === 'route' || relationship === 'combine') && !circumstance) {
    objectKind = 'multi_destination_trip';
  } else if (hasProduce && destinationCount >= 1 && EXPLICIT_REDIRECT.test(text) && !circumstance) {
    objectKind = 'destination_redirect';
  } else if (hasProduce && destinationCount >= 1 && visitWindow && !circumstance) {
    objectKind = 'visit_window_trip';
  } else if (interrogativeProduce && parsedDurationDays != null && destinationCount >= 1) {
    objectKind = 'counted_trip';
  }

  if (!objectKind) {
    return { ...empty(), reasonCodes: ['no_trip_object'] };
  }

  const impliedDurationDays = (objectKind === 'day_object' && (parsedDurationDays == null || parsedDurationDays === 1))
    ? 1
    : null;

  return {
    askedToProduceTripArtifact: true,
    objectKind,
    impliedDurationDays,
    reasonCodes: ['produce_trip_artifact', objectKind],
  };
}

function askedToProduceTripArtifact(text, ctx) {
  return resolveProduceTripRequest(text, ctx).askedToProduceTripArtifact;
}

module.exports = {
  OPTIONS_FRAME,
  PRODUCE_VERB,
  ITINERARY_NOUN,
  TRIP_NOUN,
  resolveProduceTripRequest,
  askedToProduceTripArtifact,
  isCircumstancePlan,
  isOptionsFrame,
  forbidsProduce,
};
