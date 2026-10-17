'use strict';

/**
 * Constraint & preference semantics — ONE definition shared by the turn
 * understanding contract and canonical traveler-state extraction.
 *
 * Two rules govern everything here:
 *   1. Families, not sentences. "hates exposed trails", "no cliff edges", and
 *      "we aren't comfortable with drop-offs" are one concept.
 *   2. Nothing is invented. A stated concern ("my knee has been bothering me")
 *      is not a measured capability; only an explicit limit produces a number.
 *
 * Every extracted value carries the span it came from so downstream stages can
 * show their work and never attribute a constraint the traveler never gave.
 */

const { normalizeUserText } = require('./lexicalNormalization');
const { parseTravelerVehicle } = require('./vehicleDimensionContract');
const {
  resolveHikingEffort,
  resolveHikingDistance,
  resolvePace,
  resolveDrivingMinimization,
  resolvePhotography,
} = require('./constraintFamilies');

const EXPOSURE_TARGET = /(?:expos(?:ed|ure)|drop[- ]?offs?|sheer (?:drops?|edges?)|cliff[- ]?edges?|ledges?|heights?|scary|vertigo|narrow ledges?)/i;
// Aversion FAMILY, both orders. Travelers say "we avoid drop-offs" and
// "drop-offs make her uneasy" with equal frequency, and a one-directional
// pattern silently loses half of them.
const AVERSION_VERBS =
  '(?:no|not|nothing|none of|avoid|avoids|without|hate|hates|dislikes?|don\'?t like|do not like'
  + '|uncomfortable with|(?:are|is|am|was|were)n\'?t comfortable|not comfortable'
  + '|uneasy|uneasiness|nervous|anxious|wary|leery|skittish|freaks? out|panics?'
  + '|afraid of|scared of|nervous about|can\'?t do|cannot do|terrified of|fear of'
  + '|keep (?:us|me|her|him|them|everyone) away from)';
const EXPOSURE_AVOIDANCE = new RegExp(
  `\\b${AVERSION_VERBS}\\b[^.!?]{0,60}${EXPOSURE_TARGET.source}`
  + `|${EXPOSURE_TARGET.source}[^.!?]{0,60}\\b${AVERSION_VERBS}\\b`,
  'i'
);
/**
 * Explicit reversal of a previously stated aversion. Only an unambiguous
 * "that is fine now" clears a hard constraint — silence never does.
 */
const EXPOSURE_ACCEPTANCE = new RegExp(
  `${EXPOSURE_TARGET.source}[^.!?]{0,40}\\b(?:(?:is|are|'?s|'?re)\\s+(?:actually\\s+|totally\\s+|really\\s+)?(?:fine|ok|okay|no problem|not an issue|alright))`
  + `|\\b(?:we|i|they|he|she)(?:'?re| are| am|'?m)?\\s+(?:actually\\s+)?(?:fine|ok|okay|comfortable|good)\\s+with\\s+[^.!?]{0,40}${EXPOSURE_TARGET.source}`
  + `|\\b(?:don'?t|doesn'?t|do not)\\s+(?:actually\\s+)?(?:mind|bother)\\b[^.!?]{0,40}${EXPOSURE_TARGET.source}`
  // `do not` / `does not` belong here as much as the contractions. Without them
  // an uncontracted, target-first acceptance missed acceptance — and then the
  // bare `not`, itself an AVERSION_VERB, matched the aversion pattern inside
  // "the drop-offs do not bother us", inverting the traveler's meaning.
  + `|${EXPOSURE_TARGET.source}[^.!?]{0,40}\\b(?:don'?t|doesn'?t|do not|does not)\\s+(?:actually\\s+)?(?:mind|bother)\\b`,
  'i'
);
/** "exposure to social media" is not trail exposure. */
const EXPOSURE_FALSE_POSITIVE = /\bexposure\s+to\s+(?:social\s+media|instagram|tiktok|facebook|phones?|screens?|news|people|crowds|the\s+sun|sunlight|uv)\b/i;

const WALKING_TARGET = /(?:walk(?:ing|s)?|on our feet|on my feet|standing|steps|mileage|miles)/i;
const WALKING_LIMIT = new RegExp(
  `\\b(?:cut|drop|avoid|skip|no|not much|minimal|limit|light|keep .{0,20}light|nothing .{0,24}(?:requires?|needs?|involves?)|can'?t do|cannot do|can'?t manage|too much)\\b[^.!?]{0,48}${WALKING_TARGET.source}`,
  'i'
);
const WALKING_LIMIT_ALT =
  /\b(?:not?\s+(?:much|a lot of|long)\s+walk(?:ing)?|long walks?\s+(?:are|is)\s+(?:out|too much)|nothing that requires much walking|minimal walking|short walks? only)\b/i;
/**
 * Target BEFORE limiter — "keep the walking pretty light", "make the walking
 * shorter". The limiter-first pattern above cannot see these, and losing them
 * meant the constraint reached only the generation prompt, never canonical
 * state.
 */
const WALKING_LIMIT_REVERSED = new RegExp(
  `\\b(?:keep|make|hold|get|bring)\\b[^.!?]{0,32}${WALKING_TARGET.source}[^.!?]{0,24}`
  + '\\b(?:light(?:er)?|short(?:er)?|minimal|easy|easier|manageable|down|to a minimum)\\b',
  'i'
);
const WALK_MILE_CAP =
  /\b(?:can(?:not|'t)|could(?:n't)?|no more than|not more than|limit(?:ed)? to|max(?:imum)?(?: of)?|under|less than)\b[^.!?]{0,48}?\b(?:about |around |roughly |~)?(a|one|\d+(?:\.\d+)?)\s*miles?\b/i;

const DRIVE_AVERSION =
  /\b(?:avoid|rather not|don'?t want|minimi[sz]e|reduce|cut|less|too much|hate)\b[^.!?]{0,48}\b(?:driving|drive time|the car|in the car|behind the wheel|road time)\b|\b(?:less|shorter|fewer) (?:driving|drives?)\b/i;
const LODGING_STABILITY =
  /\b(?:hate changing hotels?|don'?t want to change hotels?|not changing hotels?|fewer hotels?|one hotel|same hotel|stay put|packing and unpacking|move hotels? every night|changing hotels? every night)\b/i;

// ---------------------------------------------------------------------------

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function spanFor(text, regex) {
  const match = String(text || '').match(regex);
  return match ? match[0].trim().slice(0, 120) : null;
}

/**
 * Explicit, grounded constraints. Every value must be attributable to language
 * in the current turn — nothing is inferred from implication. "My knee has been
 * bothering me" is a concern, not a numeric walking capability.
 */
function extractExplicitConstraints(rawText) {
  const text = normalizeUserText(rawText);
  const constraints = [];
  const push = (field, value, regex, confidence = 0.95) => {
    constraints.push({
      field,
      value,
      source: 'current_message',
      span: spanFor(text, regex),
      confidence,
    });
  };

  // An explicit reversal in the CURRENT message outranks an aversion phrase in
  // the same message and, downstream, outranks persisted state. Silence never
  // clears a hard constraint; only this does.
  if (EXPOSURE_ACCEPTANCE.test(text) && !EXPOSURE_FALSE_POSITIVE.test(text)) {
    push('avoidExposure', false, EXPOSURE_ACCEPTANCE);
  } else if (EXPOSURE_AVOIDANCE.test(text) && !EXPOSURE_FALSE_POSITIVE.test(text)) {
    push('avoidExposure', true, EXPOSURE_AVOIDANCE);
  }

  const mileCap = text.match(WALK_MILE_CAP);
  const capValue = mileCap ? parseMileToken(mileCap[1]) : null;
  const mentionsWalking = /\bwalk(?:ing|s)?\b|\bhik(?:e|es|ing)\b/i.test(text);
  const distance = resolveHikingDistance(text);
  if (distance.maxWalkMilesPerSegment != null) {
    push('maxWalkMilesPerSegment', distance.maxWalkMilesPerSegment, WALK_MILE_CAP);
    constraints[constraints.length - 1].span = distance.span;
  } else if (capValue != null && mentionsWalking) {
    push('maxWalkMilesPerSegment', capValue, WALK_MILE_CAP);
  } else if (distance.maxWalkMinutesPerSegment != null) {
    constraints.push({
      field: 'maxWalkMinutesPerSegment',
      value: distance.maxWalkMinutesPerSegment,
      source: 'current_message',
      span: distance.span,
      confidence: 0.95,
    });
  } else if (
    distance.walkingTolerance === 'limited'
    || WALKING_LIMIT.test(text)
    || WALKING_LIMIT_ALT.test(text)
    || WALKING_LIMIT_REVERSED.test(text)
  ) {
    const matched = WALKING_LIMIT.test(text)
      ? WALKING_LIMIT
      : WALKING_LIMIT_ALT.test(text) ? WALKING_LIMIT_ALT : WALKING_LIMIT_REVERSED;
    push('walkingTolerance', 'limited', matched);
    if (distance.span && !spanFor(text, matched)) {
      constraints[constraints.length - 1].span = distance.span;
    }
  }

  const hiking = resolveHikingEffort(text);
  if (hiking.value) {
    constraints.push({
      field: 'hiking',
      value: hiking.value,
      source: 'current_message',
      span: hiking.span,
      confidence: 0.95,
    });
  }

  const pace = resolvePace(text);
  if (pace.value) {
    constraints.push({
      field: 'pace',
      value: pace.value,
      source: 'current_message',
      span: pace.span,
      confidence: 0.9,
    });
  }

  const driving = resolveDrivingMinimization(text);
  if (driving.maxDailyDriveMinutes != null) {
    constraints.push({
      field: 'maxDailyDriveMinutes',
      value: driving.maxDailyDriveMinutes,
      source: 'current_message',
      span: driving.span,
      confidence: 0.95,
    });
  }

  // P0-5 — the traveler's vehicle is canonical state, not background prose.
  // "our 24-foot RV" carries a dimension that official road limits must be
  // compared against; surviving only as raw text is how a 24-ft RV got
  // planned onto a 21-ft road.
  const vehicle = parseTravelerVehicle(text);
  if (vehicle) {
    constraints.push({
      field: 'vehicle',
      value: { kind: vehicle.kind, lengthFeet: vehicle.lengthFeet },
      source: 'current_message',
      span: vehicle.raw,
      confidence: 0.95,
    });
  }

  return constraints;
}

function parseMileToken(token) {
  const raw = String(token || '').toLowerCase();
  if (raw === 'a' || raw === 'one') return 1;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 30 ? n : null;
}

function extractSoftPreferences(rawText) {
  const text = normalizeUserText(rawText);
  const prefs = [];
  const push = (field, value, regex) => {
    prefs.push({ field, value, source: 'current_message', span: spanFor(text, regex) });
  };
  const driving = resolveDrivingMinimization(text);
  if (driving.minimizeDriving && driving.maxDailyDriveMinutes == null) {
    prefs.push({
      field: 'minimizeDriving',
      value: true,
      source: 'current_message',
      span: driving.span,
    });
  } else if (DRIVE_AVERSION.test(text) && driving.maxDailyDriveMinutes == null) {
    push('minimizeDriving', true, DRIVE_AVERSION);
  }
  if (LODGING_STABILITY.test(text)) push('minimizeLodgingChanges', true, LODGING_STABILITY);
  const photography = resolvePhotography(text);
  if (photography.photography) {
    prefs.push({
      field: 'photography',
      value: true,
      source: 'current_message',
      span: photography.span,
    });
    if (photography.photographyTiming) {
      prefs.push({
        field: 'photographyTiming',
        value: photography.photographyTiming,
        source: 'current_message',
        span: photography.span,
      });
    }
  }
  if (/\bwildlife\b/i.test(text)) push('wildlife', true, /\bwildlife\b/i);
  if (/\bfall colou?r|autumn colou?r|foliage\b/i.test(text)) {
    push('fallColor', true, /\bfall colou?r|autumn colou?r|foliage\b/i);
  }
  return prefs;
}


/** Convenience: the value of one grounded field, or null. */
function constraintValue(constraints, field) {
  const hit = (constraints || []).find((item) => item.field === field);
  return hit ? hit.value : null;
}

module.exports = {
  extractExplicitConstraints,
  extractSoftPreferences,
  constraintValue,
  parseMileToken,
  EXPOSURE_AVOIDANCE,
  EXPOSURE_ACCEPTANCE,
  EXPOSURE_FALSE_POSITIVE,
  WALKING_LIMIT,
  WALKING_LIMIT_ALT,
  WALKING_LIMIT_REVERSED,
  WALK_MILE_CAP,
  DRIVE_AVERSION,
  LODGING_STABILITY,
};
