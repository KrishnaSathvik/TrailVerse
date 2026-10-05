'use strict';

/**
 * Stage 14.8B.1 — active-trip destination integrity.
 *
 * THE DEFECT THIS FIXES
 * ---------------------
 * Stage 14.8B renamed a locked Yosemite plan to "Total":
 *
 *   assistant answer 1 contained the bullet "Total: roughly $450-650"
 *     → the summary label entered the offered-destination options list
 *   the follow-up contained "for that day"
 *     → a bare pronoun was read as destination-selection intent
 *   the follow-up contained "the total walking"
 *     → the word "total" matched the fake option
 *   result: { name: "Total", parkCode: "yose" } — a MIXED identity
 *
 * Three independent guards close it, so no single regex is load-bearing:
 *
 *   §5 eligibility  — a summary label can never be a destination option
 *   §4 intent       — a pronoun bound to a modifier noun is not a destination choice
 *   §6 canonicality — a name and a parkCode may never drift apart
 *
 * Pure and I/O-free: no provider, no network, no database.
 */

const { extractAllParksFromMessage } = require('../utils/parkExtractor');

const DESTINATION_REJECTION = Object.freeze({
  NOT_DESTINATION_INTENT: 'not_destination_intent',
  NON_DESTINATION_OPTION: 'non_destination_option',
  CANONICAL_IDENTITY_MISMATCH: 'canonical_identity_mismatch',
  GENERIC_TOKEN: 'generic_token',
  LOCKED_DESTINATION_PRESERVED: 'locked_destination_preserved',
});

/**
 * Words and headings that appear in trip prose and are never destinations.
 * Matched against the WHOLE normalized name, never as a substring, so a real
 * place containing one of these words (e.g. "Cost Rica") is unaffected.
 */
const GENERIC_DESTINATION_LABELS = new Set([
  'total', 'totals', 'budget', 'cost', 'costs', 'estimated costs', 'walking',
  'total walking', 'mileage', 'distance', 'option', 'options', 'alternative',
  'alternatives', 'day', 'days', 'night', 'nights', 'morning', 'midday',
  'afternoon', 'evening', 'at a glance', "don't forget", 'dont forget',
  'lodging', 'hotel', 'hotels', 'food', 'meals', 'entrance', 'entrance fee',
  'fees', 'parking', 'getting there', 'where to stay', 'what to pack',
  'tips', 'notes', 'note', 'summary', 'overview', 'highlights', 'pace',
  'itinerary', 'plan', 'stop', 'stops', 'activity', 'activities', 'transport',
  'transportation', 'weather', 'permits', 'shuttle', 'crowds',
]);

/** Suffixes that are positive evidence of a real destination entity. */
const DESTINATION_SUFFIX =
  /\b(national park|national monument|national forest|national preserve|national seashore|national lakeshore|national recreation area|national historic(?:al)? (?:park|site)|national memorial|national battlefield|state park|provincial park|wilderness|national park and preserve)\b/i;

/**
 * Nouns a demonstrative or ordinal can bind to that scope a MODIFICATION
 * rather than a destination choice. "that day" / "the second day" are edits;
 * "that park" / "the second park" are selections.
 */
const MODIFIER_SCOPE_NOUNS = [
  'day', 'days', 'night', 'morning', 'midday', 'afternoon', 'evening',
  'stop', 'stops', 'leg', 'walk', 'walking', 'hike', 'hikes', 'trail',
  'drive', 'meal', 'lunch', 'dinner', 'breakfast', 'budget', 'cost',
  'costs', 'distance', 'mileage', 'pace', 'itinerary', 'plan', 'route',
  'activity', 'activities', 'lodging', 'hotel', 'schedule', 'one thing',
];

/** Nouns that mark the referent as an actual destination candidate. */
const DESTINATION_SCOPE_NOUNS = [
  'park', 'parks', 'destination', 'destinations', 'option', 'options',
  'place', 'places', 'spot', 'trip', 'one',
];

/**
 * Stage 14.8E.1 §3 — action verbs alone mean nothing. "pick the three best
 * photo stops" and "pick Zion instead" share a verb and differ entirely in
 * what they act on, so the OBJECT decides.
 */
const SELECTION_VERB =
  /\b(?:go with|going with|let'?s go with|let'?s do|pick|choose|choosing|select|selecting|switch to|change to|i'?ll take|take)\b/i;

/** §4 — explicit trip mutation. Only these move a locked trip's destination. */
const TRIP_MUTATION =
  /\b(?:switch|change|move)\s+(?:this|the|our|my)?\s*trip\s+to\b|\bmake\s+(?:this|it)\s+a[n]?\s+.{2,40}?\s+trip\b|\bmake\s+(?:that|this|it)\s+(?:my|the)\s+destination\b/i;

/** A bare reference to the existing trip is NOT a destination change (§4). */
const EXISTING_TRIP_REFERENCE =
  /\b(?:this|the|our|same|that)\s+(?:same\s+)?trip\b/i;

/** Nouns whose selection is an edit to the plan, not a change of destination. */
const NON_DESTINATION_OBJECTS = [
  'stop', 'stops', 'walk', 'walks', 'hike', 'hikes', 'trail', 'trails',
  'viewpoint', 'viewpoints', 'view', 'views', 'photo', 'photos', 'shot', 'shots',
  'day', 'days', 'night', 'nights', 'morning', 'afternoon', 'evening',
  'restaurant', 'restaurants', 'meal', 'meals', 'lunch', 'dinner', 'breakfast',
  'hotel', 'hotels', 'lodging', 'campground', 'campgrounds', 'room', 'rooms',
  'activity', 'activities', 'route', 'routes', 'pace', 'budget', 'cost', 'costs',
  'gear', 'item', 'items', 'essentials', 'list', 'order', 'time', 'times',
  'what', 'when', 'how',
];

/**
 * Preference phrasings put the object BEFORE the phrase — "the Sedona option
 * sounds best" — so they are matched separately and read backwards.
 */
const SELECTION_PREFERENCE =
  /\b(?:sounds best|sounds good|sounds great|works best|is best|i prefer|prefer|instead of)\b/i;

const EXPLICIT_SELECTION = new RegExp(
  `${SELECTION_VERB.source}|${SELECTION_PREFERENCE.source}`, 'i'
);

const ORDINAL_WORD = /\b(first|1st|second|2nd|third|3rd|fourth|4th|top|#\d)\b/i;
const DEMONSTRATIVE = /\b(that|this|those|these|it)\b/i;

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/^[^a-z0-9']+|[^a-z0-9')]+$/g, '')
    .trim();
}

/** Resolves a name to a canonical NPS park code, or null. */
function canonicalizeDestinationName(name) {
  const parks = extractAllParksFromMessage(String(name || ''));
  if (!parks.length) return null;
  return { parkCode: parks[0].parkCode || null, parkName: parks[0].parkName || null };
}

/**
 * §5 — may this candidate ever be selected as a destination?
 *
 * A plain phrase does not become a high-confidence destination merely because
 * it appeared in a bullet. Positive evidence is a park code, a destination
 * suffix, or a multi-word proper phrase that is not a summary label.
 */
function isEligibleDestinationOption(candidate) {
  const name = normalizeName(candidate?.name);
  if (!name) {
    return { eligible: false, reason: DESTINATION_REJECTION.NON_DESTINATION_OPTION };
  }

  // A `Label: value` bullet is a summary row, not an offered option.
  if (candidate?.followedByColon && name.split(' ').length <= 4) {
    return { eligible: false, reason: DESTINATION_REJECTION.NON_DESTINATION_OPTION };
  }

  if (GENERIC_DESTINATION_LABELS.has(name)) {
    return { eligible: false, reason: DESTINATION_REJECTION.GENERIC_TOKEN };
  }

  // "Day 2", "Option 3" — a generic label with an index is still a label.
  if (/^(day|night|option|alternative|stop|leg|week)\s*\d+$/.test(name)) {
    return { eligible: false, reason: DESTINATION_REJECTION.GENERIC_TOKEN };
  }

  if (candidate?.parkCode) return { eligible: true, reason: null };
  if (DESTINATION_SUFFIX.test(name)) return { eligible: true, reason: null };
  if (canonicalizeDestinationName(candidate?.name)) return { eligible: true, reason: null };

  const words = name.split(' ');

  // Stage 14.8E.1 §5 — clause debris. A candidate led by a conjunction or
  // preposition, carrying a negation, or issuing an instruction is a fragment
  // of a sentence, never a place.
  if (/^(and|but|or|if|so|then|because|without|with|for|from|to|of|in|on|at|by)\b/.test(name)) {
    return { eligible: false, reason: DESTINATION_REJECTION.NON_DESTINATION_OPTION };
  }
  if (/\b(don't|do not|dont|never|no more|avoid|skip)\b/.test(name)) {
    return { eligible: false, reason: DESTINATION_REJECTION.NON_DESTINATION_OPTION };
  }
  if (/\b(check|add|keep|tell|make|show|give|find|include|remove|adjust)\b/.test(name)) {
    return { eligible: false, reason: DESTINATION_REJECTION.NON_DESTINATION_OPTION };
  }

  // §6 — POSITIVE evidence is required. A real destination phrase carries a
  // proper noun; "the best photo stops" carries none. Absence from the generic
  // denylist is explicitly not sufficient.
  const properNouns = String(candidate?.name || '')
    .split(/\s+/)
    .filter((w) => /^[A-Z][a-z'’-]{1,}$/.test(w))
    .filter((w) => !/^(The|A|An|And|But|Or|If|For|From|With|Don|Best|Three|Two|New)$/.test(w));
  if (properNouns.length === 0) {
    return { eligible: false, reason: DESTINATION_REJECTION.GENERIC_TOKEN };
  }

  // A bare single word with no destination evidence is prose, not a place.
  if (words.length < 2) {
    return { eligible: false, reason: DESTINATION_REJECTION.GENERIC_TOKEN };
  }

  // A place name is a short noun phrase. A packing-list line such as
  // "Bear-proof food storage if you're picnicking outdoors" is a sentence, and
  // sentences are not destinations.
  if (words.length > 6) {
    return { eligible: false, reason: DESTINATION_REJECTION.NON_DESTINATION_OPTION };
  }
  if (/\b(if|for|with|provided|because|when|while|unless|so|but|your|you're|youre)\b/.test(name)) {
    return { eligible: false, reason: DESTINATION_REJECTION.NON_DESTINATION_OPTION };
  }

  return { eligible: true, reason: null };
}

/** Finds the noun a demonstrative/ordinal is bound to, if any. */
function boundNounFor(message, anchorRe) {
  const text = String(message || '').toLowerCase();
  const anchor = text.match(anchorRe);
  if (!anchor) return null;

  const after = text.slice(anchor.index + anchor[0].length, anchor.index + anchor[0].length + 40);
  const words = after.replace(/^[^a-z0-9]+/, '').split(/[^a-z0-9]+/).filter(Boolean);

  for (const noun of [...MODIFIER_SCOPE_NOUNS, ...DESTINATION_SCOPE_NOUNS]) {
    const parts = noun.split(' ');
    if (parts.every((p, i) => words[i] === p)) return noun;
  }
  // Allow one filler word ("the second whole day").
  const shifted = words.slice(1);
  for (const noun of [...MODIFIER_SCOPE_NOUNS, ...DESTINATION_SCOPE_NOUNS]) {
    const parts = noun.split(' ');
    if (parts.every((p, i) => shifted[i] === p)) return noun;
  }
  return null;
}

/**
 * §4 — does this message actually ask to change the destination?
 *
 * A demonstrative or ordinal bound to a modifier noun ("that day", "the second
 * day") is an edit to the existing plan. Destination intent needs either an
 * explicit selection phrase or a referent that is itself a destination.
 */
/**
 * Stage 14.8E.1 §3 — what does the selection verb ACT ON?
 *
 * Scans the window after the verb and returns the first thing that settles the
 * question: a canonical park name (destination), a destination-scope noun
 * (destination), or a plan-edit noun (not a destination).
 */
function classifySelectionObject(text) {
  const match = String(text).match(SELECTION_VERB);
  if (!match) return { verbPresent: false, object: null, kind: null };

  const after = String(text).slice(match.index + match[0].length);
  const window = after.split(/[.?!;]/)[0] || '';
  const words = window.trim().split(/\s+/).filter(Boolean).slice(0, 8);

  for (let i = 0; i < words.length; i += 1) {
    const bare = words[i].toLowerCase().replace(/[^a-z']/g, '');
    if (!bare) continue;

    // A park name anywhere in the object window settles it as a destination.
    const phrase = words.slice(i, i + 3).join(' ');
    if (canonicalizeDestinationName(phrase)) {
      return { verbPresent: true, object: phrase, kind: 'destination' };
    }
    if (NON_DESTINATION_OBJECTS.includes(bare)) {
      return { verbPresent: true, object: bare, kind: 'plan_edit' };
    }
    if (DESTINATION_SCOPE_NOUNS.includes(bare) && bare !== 'trip') {
      return { verbPresent: true, object: bare, kind: 'destination' };
    }
  }
  return { verbPresent: true, object: null, kind: 'unresolved' };
}

/** Reads the object that PRECEDES a preference phrase ("… sounds best"). */
function classifyPreferenceObject(text) {
  const match = String(text).match(SELECTION_PREFERENCE);
  if (!match) return { present: false, object: null, kind: null };

  const before = String(text).slice(0, match.index);
  const words = before.trim().split(/\s+/).filter(Boolean).slice(-6);

  for (let i = words.length - 1; i >= 0; i -= 1) {
    const bare = words[i].toLowerCase().replace(/[^a-z']/g, '');
    if (!bare) continue;
    if (NON_DESTINATION_OBJECTS.includes(bare)) {
      return { present: true, object: bare, kind: 'plan_edit' };
    }
    if (DESTINATION_SCOPE_NOUNS.includes(bare) && bare !== 'trip') {
      return { present: true, object: bare, kind: 'destination' };
    }
    if (canonicalizeDestinationName(words.slice(Math.max(0, i - 2), i + 1).join(' '))) {
      return { present: true, object: bare, kind: 'destination' };
    }
  }
  return { present: true, object: null, kind: 'unresolved' };
}

function classifyDestinationChangeIntent(userMessage) {
  const text = String(userMessage || '');
  if (!text.trim()) return { intent: false, kind: 'empty', boundNoun: null };

  // §4 — an explicit trip mutation is decisive in either direction, and must be
  // checked before the bare "this trip" reference below.
  if (TRIP_MUTATION.test(text)) {
    return { intent: true, kind: 'trip_mutation', boundNoun: 'trip' };
  }

  const demonstrativeNoun = boundNounFor(text, DEMONSTRATIVE);
  const ordinalNoun = boundNounFor(text, ORDINAL_WORD);
  const boundNoun = ordinalNoun || demonstrativeNoun;

  if (boundNoun && MODIFIER_SCOPE_NOUNS.includes(boundNoun)) {
    return { intent: false, kind: 'modifier_reference', boundNoun };
  }

  // §3 — the object of the action decides. A verb acting on stops, walks,
  // viewpoints, days or gear is a plan edit however selective it sounds.
  const selection = classifySelectionObject(text);
  if (selection.verbPresent && selection.kind === 'plan_edit') {
    return { intent: false, kind: 'plan_edit_selection', boundNoun: selection.object };
  }
  if (selection.verbPresent && selection.kind === 'destination') {
    return { intent: true, kind: 'explicit_selection', boundNoun: selection.object };
  }

  const preference = classifyPreferenceObject(text);
  if (preference.present && preference.kind === 'plan_edit') {
    return { intent: false, kind: 'plan_edit_selection', boundNoun: preference.object };
  }
  if (preference.present && preference.kind === 'destination') {
    return { intent: true, kind: 'referent_selection', boundNoun: preference.object };
  }

  const explicit = EXPLICIT_SELECTION.test(text);
  const ordinalPresent = ORDINAL_WORD.test(text);
  const affirmative = /\b(yes|yeah|sure|ok|okay)\b/i.test(text);
  const destinationReferent = Boolean(boundNoun && DESTINATION_SCOPE_NOUNS.includes(boundNoun));

  // §4 — "this trip" / "the trip" REFERS to the existing trip. It is no longer
  // treated as destination evidence; only TRIP_MUTATION above moves a trip.
  const destinationNounPresent =
    /\b(park|parks|destination|destinations)\b/i.test(text)
    || (/\btrip\b/i.test(text) && !EXISTING_TRIP_REFERENCE.test(text));

  if (explicit && (destinationReferent || ordinalPresent || destinationNounPresent)) {
    return { intent: true, kind: 'explicit_selection', boundNoun };
  }
  // An ordinal bound to a DESTINATION noun is a selection in its own right —
  // "the second one", "the third option". The modifier check above already
  // removed "the second day", so this cannot re-open that hole.
  if (destinationReferent && (explicit || ordinalPresent || affirmative)) {
    return { intent: true, kind: 'referent_selection', boundNoun };
  }
  if (explicit) return { intent: true, kind: 'explicit_selection', boundNoun };

  return { intent: false, kind: 'no_selection_evidence', boundNoun };
}

/** §11 — a destination identity is coherent or it fails closed. */
function assertDestinationIdentityConsistent(destination, related = {}) {
  const mismatches = [];
  let canonicalNameMatchesParkCode = true;

  if (destination?.parkCode) {
    const canonical = canonicalizeDestinationName(destination.name);
    if (!canonical || canonical.parkCode !== destination.parkCode) {
      canonicalNameMatchesParkCode = false;
      mismatches.push('name_park_code');
    }
  }

  const locked = related.lockedPlanDestination;
  if (destination && locked && locked.parkCode && destination.parkCode
      && locked.parkCode !== destination.parkCode) {
    mismatches.push('primary_vs_locked');
  }

  const itinerary = related.itineraryDestination;
  if (destination && itinerary && itinerary.parkCode && destination.parkCode
      && itinerary.parkCode !== destination.parkCode) {
    mismatches.push('itinerary_vs_active');
  }

  return { consistent: mismatches.length === 0, canonicalNameMatchesParkCode, mismatches };
}

/**
 * §6/§7 — the single decision point for changing an active destination.
 *
 * Returns the destination to use plus bounded diagnostics. The previous
 * destination is preserved on every rejection, so a failed mutation can never
 * leave a half-applied identity behind.
 */
function resolveDestinationMutation({ previous = null, candidate = null, intent = null }) {
  const diagnose = (accepted, reason, canonical = null) => ({
    previousDestination: previous?.name || null,
    candidateDestination: candidate?.name || null,
    candidateSource: candidate?.source || null,
    candidateEntityType: candidate?.type || (candidate?.parkCode ? 'nps' : 'unknown'),
    destinationChangeIntent: Boolean(intent?.intent),
    candidateCanonicalizationResult: canonical,
    mutationAccepted: accepted,
    rejectionReason: reason,
  });

  const keep = (reason, canonical = null) => ({
    mutationAccepted: false,
    rejectionReason: reason,
    destination: previous,
    diagnostics: diagnose(false, reason, canonical),
  });

  if (!candidate) return keep(DESTINATION_REJECTION.LOCKED_DESTINATION_PRESERVED);

  // Intent is judged on the MESSAGE and is checked first: if the user is not
  // asking to change destination, the candidate never needs evaluating, and
  // the diagnostic names the real reason rather than a property of a candidate
  // that should never have been considered.
  if (previous && intent && intent.intent === false) {
    return keep(DESTINATION_REJECTION.NOT_DESTINATION_INTENT);
  }

  const eligibility = isEligibleDestinationOption(candidate);
  if (!eligibility.eligible) return keep(eligibility.reason);

  const canonical = canonicalizeDestinationName(candidate.name);
  const canonicalResult = canonical ? canonical.parkCode : null;

  // §6 — if a parkCode is asserted, the name must canonicalize to it. This is
  // what makes `{ name: "Total", parkCode: "yose" }` impossible.
  if (candidate.parkCode && (!canonical || canonical.parkCode !== candidate.parkCode)) {
    return keep(DESTINATION_REJECTION.CANONICAL_IDENTITY_MISMATCH, canonicalResult);
  }

  // A candidate with no code that cannot canonicalize may not silently inherit
  // the previous park's code — that is exactly how identities got mixed.
  if (previous?.parkCode && !candidate.parkCode
      && (!canonical || canonical.parkCode !== previous.parkCode)) {
    return keep(DESTINATION_REJECTION.CANONICAL_IDENTITY_MISMATCH, canonicalResult);
  }

  return {
    mutationAccepted: true,
    rejectionReason: null,
    destination: {
      ...candidate,
      ...(canonical?.parkCode ? { parkCode: canonical.parkCode } : {}),
    },
    diagnostics: diagnose(true, null, canonicalResult),
  };
}

module.exports = {
  DESTINATION_REJECTION,
  DESTINATION_SUFFIX,
  GENERIC_DESTINATION_LABELS,
  MODIFIER_SCOPE_NOUNS,
  assertDestinationIdentityConsistent,
  canonicalizeDestinationName,
  classifyDestinationChangeIntent,
  isEligibleDestinationOption,
  resolveDestinationMutation,
};
