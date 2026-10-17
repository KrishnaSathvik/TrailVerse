'use strict';

/**
 * Controlled traveler-state extraction from prose.
 * Does not invent values. Shared by constraint parsing and planningState.
 */

const { WORD_TO_NUMBER, extractTravelPartySemantics, userAvoidsTrailExposure } = require('./planningInputContract');
const { normalizeUserText } = require('./lexicalNormalization');
const { extractExplicitConstraints, constraintValue } = require('./constraintSemantics');
const { resolveHikingDistance, resolveHikingEffort, resolvePhotography } = require('./constraintFamilies');

const { parseTripDuration } = require('./durationSemantics');

const WORD_DAYS = Object.freeze({
  ...WORD_TO_NUMBER,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
});

const WORD_DAY_ALTS = Object.keys(WORD_DAYS).join('|');

function lastNumberFromMatches(matches) {
  if (!matches.length) return null;
  return matches[matches.length - 1];
}

function extractSpokenDuration(text = '') {
  const msg = String(text || '');
  // Shared grammar parser — see utils/durationSemantics. Previously a phrase
  // list here diverged from the one in turnUnderstanding, so "six nights" and
  // "three relaxed days" parsed differently depending on which resolver ran.
  const duration = parseTripDuration(msg);

  let availableHours = null;
  const hourDigit = [...msg.matchAll(/\b(\d{1,2})\s*[- ]?hours?\b/gi)];
  const hourWord = [...msg.matchAll(new RegExp(`\\b(${WORD_DAY_ALTS})\\s*[- ]?hours?\\b`, 'gi'))];
  if (hourDigit.length) {
    availableHours = Number(hourDigit[hourDigit.length - 1][1]);
  } else if (hourWord.length) {
    availableHours = WORD_DAYS[String(hourWord[hourWord.length - 1][1]).toLowerCase()] || null;
  } else if (/\bhalf[- ]?day\b/i.test(msg)) {
    availableHours = 4;
  }

  return {
    durationDays: duration.durationDays,
    lodgingNights: duration.lodgingNights,
    availableHours: Number.isFinite(availableHours) && availableHours > 0 ? availableHours : null,
  };
}


function extractMobilityConstraints(text = '') {
  const msg = normalizeUserText(text);
  const result = {
    maxWalkMilesPerSegment: null,
    maxWalkMinutesPerSegment: null,
    // Bounded, non-numeric limitation. Travelers say "keep the walking light"
    // far more often than they give a mileage, and that still has to survive
    // into canonical state — otherwise only the model sees the constraint while
    // candidate eligibility and validation do not.
    walkingTolerance: null,
    requiresFrequentBreaks: null,
    wheelchair: null,
    stroller: null,
    avoidStairs: null,
  };
  if (!msg.trim()) return result;

  const grounded = extractExplicitConstraints(msg);
  const distance = resolveHikingDistance(msg);
  const tolerance = constraintValue(grounded, 'walkingTolerance') || distance.walkingTolerance;
  if (tolerance) result.walkingTolerance = tolerance;
  if (distance.maxWalkMilesPerSegment != null) {
    result.maxWalkMilesPerSegment = distance.maxWalkMilesPerSegment;
  } else {
    const mileCap = constraintValue(grounded, 'maxWalkMilesPerSegment');
    if (mileCap != null) result.maxWalkMilesPerSegment = mileCap;
  }
  if (distance.maxWalkMinutesPerSegment != null) {
    result.maxWalkMinutesPerSegment = distance.maxWalkMinutesPerSegment;
  }

  if (/\bfrequent breaks?\b|\bneeds? breaks?\b|\brest often\b/i.test(msg)) {
    result.requiresFrequentBreaks = true;
  }
  if (/\bwheelchair\b/i.test(msg)) result.wheelchair = true;
  if (/\bstroller\b/i.test(msg)) result.stroller = true;
  if (/\b(?:limited stairs|avoid stairs|no stairs|can't do stairs)\b/i.test(msg)) {
    result.avoidStairs = true;
  }
  return result;
}

function extractPartyExtras(text = '') {
  const msg = String(text || '');
  const party = extractTravelPartySemantics(msg);
  const hasOlderTravelers = /\b(?:late \d0s|in (?:their|the) \d0s|older (?:parents|travelers?|adults?)|elderly|seniors?|grandparents?)\b/i.test(msg)
    ? true
    : null;
  return {
    travelParty: party.travelParty,
    hasChildren: party.hasChildren,
    childrenCount: party.childrenCount,
    hasOlderTravelers,
  };
}

function extractActivityPreferences(text = '') {
  const msg = normalizeUserText(text);
  const result = {
    hiking: null,
    avoidExposure: null,
    avoidScrambling: null,
    photography: null,
    photographyTiming: null,
    wildlife: null,
  };
  const grounded = extractExplicitConstraints(msg);
  const hiking = resolveHikingEffort(msg);
  if (hiking.value) {
    result.hiking = hiking.value;
  } else if (/\b(?:hard|strenuous|difficult|challenging)\s+hikes?\b|\bhikes?\s+(?:that are )?(?:hard|strenuous|difficult)\b/i.test(msg)
    && !/\b(?:avoid|no |nothing |not )\b.{0,16}\b(?:hard|strenuous|difficult|challenging)\b/i.test(msg)) {
    // Positive hard-hike preference is not an aversion family; named questions
    // are already excluded by resolveHikingEffort.
    result.hiking = 'hard';
  } else if (constraintValue(grounded, 'hiking')) {
    result.hiking = constraintValue(grounded, 'hiking');
  }
  if (userAvoidsTrailExposure(msg) || constraintValue(grounded, 'avoidExposure') === true) {
    result.avoidExposure = true;
  }
  if (/\b(?:no |avoid |without )scrambl/i.test(msg)) result.avoidScrambling = true;
  const photography = resolvePhotography(msg);
  if (photography.photography) {
    result.photography = true;
    if (photography.photographyTiming) result.photographyTiming = photography.photographyTiming;
  }
  if (/\bwildlife\b/i.test(msg)) result.wildlife = true;
  return result;
}

// ── Phase 9C.1F.1 — trip-level transport constraint ──────────────────────────
//
// Only EXPLICIT trip-level statements count. Questions ("is the shuttle
// running?"), local mentions ("walk to the viewpoint") and bare nouns ("car",
// "parking") are not constraints in either direction. Everything is evaluated
// per sentence so a question mark can veto the sentence it belongs to.

const SENTENCE_SPLIT = /(?<=[.!?])\s+|\n+/;

const CAR_NOUN = String.raw`(?:car|vehicle|rental(?:\s+car)?|suv|truck)`;
const NEG = String.raw`(?:won'?t|will\s+not|don'?t|do\s+not|not\s+going\s+to|aren'?t\s+going\s+to|are\s+not\s+going\s+to|not|never)`;

const PROHIBITION_PATTERNS = Object.freeze([
  // Reasons that also say what the traveler WILL do come first: they are more
  // informative than a bare negation in the same sentence.
  ['shuttle_only', new RegExp(String.raw`\bshuttles?\s+only\b|\bonly\s+(?:use|take|ride|using|taking|riding)\s+(?:the\s+)?(?:park\s+)?shuttles?\b|\b(?:use|take|ride)\s+(?:the\s+)?(?:park\s+)?shuttles?\s+only\b|\brely(?:ing)?\s+(?:only|solely|entirely)\s+on\s+(?:the\s+)?shuttles?\b`, 'i')],
  ['walking_only', new RegExp(String.raw`\bwalk(?:ing)?[-\s]only\b|\bonly\s+(?:on\s+foot|walking)\b|\bon\s+foot\s+only\b`, 'i')],
  ['bike_only', new RegExp(String.raw`\b(?:bike|biking|bicycle|bicycling|cycling)[-\s]only\b|\bonly\s+(?:by\s+)?(?:bike|bicycle)\b`, 'i')],
  ['no_driving', new RegExp(String.raw`\bno\s+driving\b|\bwithout\s+(?:any\s+)?driving\b|\b(?:don'?t|do\s+not|won'?t|will\s+not)\s+(?:want|plan|intend|wish)\s+to\s+(?:be\s+)?driv(?:e|ing)\b(?!\s+(?:all\s+day|too\b|so\s+much|for\s+hours|more\s+than|much|a\s+lot|far|long\b))|\b(?:please\s+)?(?:don'?t|do\s+not)\s+(?:make|have)\s+(?:us|me)\s+drive\b(?!\s+(?:all\s+day|too\b|so\s+much|for\s+hours|more\s+than|much|a\s+lot))|\b(?:we|i)\s+(?:won'?t|will\s+not|aren'?t|are\s+not|am\s+not)\s+(?:be\s+)?driving\b|\bno\s+driving\s+at\s+all\b`, 'i')],
  ['no_car', new RegExp(String.raw`\bwithout\s+a\s+${CAR_NOUN}\b|\bno\s+${CAR_NOUN}\b|\bcar[-\s]free\b|\b${NEG}\s+(?:be\s+)?(?:have|having|bring|bringing|rent|renting|get|getting|take|taking)\s+(?:a|the|our|my|any)\s+${CAR_NOUN}\b`, 'i')],
]);

const RENTAL_CAR_PATTERN = /\brental\s+car\b|\bcar\s+rental\b|\brent(?:ing|ed)?\s+(?:a|the|our)\s+(?:car|vehicle|suv|truck)\b/i;

const RESTORATION_PATTERNS = Object.freeze([
  RENTAL_CAR_PATTERN,
  new RegExp(String.raw`\b(?:we|i)(?:'ll|\s+will|'re|\s+are|'ve|\s+have|'d)?\s+(?:now\s+|actually\s+)?(?:have|having|got|bring|bringing|take|taking|drive|driving)\s+(?:a|the|our|my)\s+(?:own\s+)?${CAR_NOUN}\b`, 'i'),
  /\broad\s*trip\b/i,
  /\bdrive\s+from\b/i,
  /\b(?:we|i)(?:'ll|\s+will|'re|\s+are)\s+(?:be\s+)?driv(?:e|ing)\b/i,
]);

function isQuestionSentence(sentence) {
  return /\?\s*$/.test(sentence);
}

/**
 * @returns {{
 *   drivingPolicy: 'prohibited'|null,
 *   drivingPolicyReason: string|null,
 *   clearDrivingPolicy: boolean,
 *   rentalCar: true|null,
 * }}
 * `clearDrivingPolicy` is true only when the traveler EXPLICITLY restored car /
 * driving availability and said nothing prohibitive in the same message.
 * Silence never clears.
 */
function extractTransportConstraints(text = '') {
  const out = { drivingPolicy: null, drivingPolicyReason: null, clearDrivingPolicy: false, rentalCar: null };
  const raw = typeof text === 'string' ? text : '';
  if (!raw.trim()) return out;

  const sentences = raw.split(SENTENCE_SPLIT).map((s) => s.trim()).filter(Boolean)
    .filter((s) => !isQuestionSentence(s));
  if (!sentences.length) return out;

  // Last matching sentence wins within a message; within a sentence the
  // pattern order above is the priority.
  let reason = null;
  for (const sentence of sentences) {
    for (const [candidate, pattern] of PROHIBITION_PATTERNS) {
      if (pattern.test(sentence)) { reason = candidate; break; }
    }
  }
  if (reason) {
    out.drivingPolicy = 'prohibited';
    out.drivingPolicyReason = reason;
    return out;
  }

  for (const sentence of sentences) {
    if (RESTORATION_PATTERNS.some((p) => p.test(sentence))) out.clearDrivingPolicy = true;
    if (RENTAL_CAR_PATTERN.test(sentence)) out.rentalCar = true;
  }
  return out;
}

module.exports = {
  extractTransportConstraints,
  extractSpokenDuration,
  extractMobilityConstraints,
  extractPartyExtras,
  extractActivityPreferences,
};
