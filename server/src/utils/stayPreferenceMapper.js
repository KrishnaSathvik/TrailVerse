'use strict';

/**
 * Maps raw accommodation strings and message cues to dual stay contract fields.
 * Offline only — no network I/O.
 */

const UNKNOWN = Object.freeze({
  accommodationClass: 'unknown',
  stayPreference: 'unknown',
});

/**
 * Canonical class values must round-trip through the raw map.
 *
 * `lodging` was absent, so an ALREADY-NORMALIZED constraint (accommodation:
 * 'lodging') failed to resolve here and the caller fell through to message
 * inference — which is how an explicit "No camping." request produced
 * lodging.type=camping / stayPreference=campground. An unmapped canonical value
 * is a precedence hole, not a missing synonym.
 *
 * `ACCOMMODATION_CLASSES` (travelLogisticsContract) is frozen to
 * camping | lodging | unknown, so the wider traveler semantics are expressed
 * inside that vocabulary rather than by widening it:
 *   RV camping → class `camping` + stayPreference `rv`
 *   mixed / undecided → class `unknown` (asserts no hard exclusion)
 */
const RAW_ACCOMMODATION_MAP = Object.freeze({
  lodging: { accommodationClass: 'lodging', stayPreference: 'unknown' },
  mixed: { accommodationClass: 'unknown', stayPreference: 'unknown' },
  unknown: { accommodationClass: 'unknown', stayPreference: 'unknown' },
  lodge: { accommodationClass: 'lodging', stayPreference: 'lodge' },
  hotel: { accommodationClass: 'lodging', stayPreference: 'hotel' },
  motel: { accommodationClass: 'lodging', stayPreference: 'hotel' },
  cabin: { accommodationClass: 'lodging', stayPreference: 'cabin' },
  airbnb: { accommodationClass: 'lodging', stayPreference: 'vacation_rental' },
  vrbo: { accommodationClass: 'lodging', stayPreference: 'vacation_rental' },
  vacation_rental: { accommodationClass: 'lodging', stayPreference: 'vacation_rental' },
  rv: { accommodationClass: 'camping', stayPreference: 'rv' },
  camping: { accommodationClass: 'camping', stayPreference: 'campground' },
  campground: { accommodationClass: 'camping', stayPreference: 'campground' },
  camp: { accommodationClass: 'camping', stayPreference: 'campground' },
  tent: { accommodationClass: 'camping', stayPreference: 'campground' },
  backcountry: { accommodationClass: 'camping', stayPreference: 'campground' },
});

const RV_STAY_CUE_PATTERN = /\b(?:rv\s+(?:campsite|site|park|campground|hookups?|camping)|campsite\s+with\s+hookups?|rv\s+hookups?|full\s+hookups?)\b/i;

const RV_VEHICLE_PATTERN = /\b(?:travel(?:ing|led)?\s+in\s+(?:a\s+)?(?:\d+-?\s*(?:foot|ft)\s+)?rv|driving\s+(?:a\s+)?(?:\d+-?\s*(?:foot|ft)\s+)?rv|our\s+rv)\b/i;

const MESSAGE_STAY_PATTERNS = [
  { pattern: /\b(?:airbnb|vrbo|vacation\s+rental)s?\b/i, result: { accommodationClass: 'lodging', stayPreference: 'vacation_rental' } },
  { pattern: /\blodges?\b/i, result: { accommodationClass: 'lodging', stayPreference: 'lodge' } },
  { pattern: /\b(?:hotels?|motels?)\b/i, result: { accommodationClass: 'lodging', stayPreference: 'hotel' } },
  { pattern: /\bcabins?\b/i, result: { accommodationClass: 'lodging', stayPreference: 'cabin' } },
  // Plurals and the bare verb matter here: "no campgrounds", "we do not want to
  // camp" and "avoid campsites" are all stay statements, and a pattern that only
  // matched the singular gerund read them as no statement at all.
  { pattern: /\b(?:backcountry|camping|campgrounds?|campsites?|camps?|tents?(?:\s+camping)?)\b/i, result: { accommodationClass: 'camping', stayPreference: 'campground' } },
];

/**
 * A stay cue inside a negation states what the traveler does NOT want. Matching
 * it as an affirmative preference is how "No camping." produced
 * accommodationClass=camping — the highest-impact defect this module had.
 */
const NEGATION_LOOKBEHIND_CHARS = 44;
const NEGATION_PATTERN =
  /\b(?:no|not|n't|non|without|avoid(?:ing)?|skip(?:ping)?|exclude|excluding|rather\s+not|instead\s+of|other\s+than|don'?t|do\s+not|would\s+not|won'?t|hate|dislike|never|anything\s+but)\b[^.!?;]{0,32}$/i;

function isNegatedAt(text, index) {
  const start = Math.max(0, index - NEGATION_LOOKBEHIND_CHARS);
  return NEGATION_PATTERN.test(text.slice(start, index));
}

/** Classifies every stay cue in the text as affirmed or negated. */
function scanStayCues(text) {
  const affirmed = [];
  const negatedClasses = new Set();
  for (const { pattern, result } of MESSAGE_STAY_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    if (isNegatedAt(text, match.index)) negatedClasses.add(result.accommodationClass);
    else affirmed.push(result);
  }
  return { affirmed, negatedClasses };
}

function normalizeRawAccommodation(rawAccommodation) {
  if (rawAccommodation == null) return null;
  const normalized = String(rawAccommodation).trim().toLowerCase();
  return normalized || null;
}

function mapFromRaw(rawAccommodation) {
  const key = normalizeRawAccommodation(rawAccommodation);
  if (!key) return null;

  if (RAW_ACCOMMODATION_MAP[key]) {
    return { ...RAW_ACCOMMODATION_MAP[key] };
  }

  if (key.includes('rv') && (key.includes('site') || key.includes('hookup') || key.includes('camp'))) {
    return { accommodationClass: 'camping', stayPreference: 'rv' };
  }

  return null;
}

function mapFromMessage(messageText) {
  if (!messageText || typeof messageText !== 'string') return null;

  const text = messageText.trim();
  if (!text) return null;

  const rvStayMatch = text.match(RV_STAY_CUE_PATTERN);
  if (rvStayMatch && !isNegatedAt(text, rvStayMatch.index)) {
    return { accommodationClass: 'camping', stayPreference: 'rv' };
  }

  const hasVehicleRv = RV_VEHICLE_PATTERN.test(text);
  const { affirmed, negatedClasses } = scanStayCues(text);

  // "Hotel or campground works" asserts no hard exclusion. Picking whichever
  // pattern happened to be listed first would invent a constraint the traveler
  // never stated, so competing affirmed classes resolve to unknown.
  const affirmedClasses = new Set(affirmed.map((r) => r.accommodationClass));
  if (affirmedClasses.size > 1) return { ...UNKNOWN };
  if (affirmed.length > 0) return { ...affirmed[0] };

  // Excluding camping leaves lodging as the only remaining class in this
  // vocabulary. The converse is NOT symmetric — "no hotels" still permits
  // cabins or rentals, so it narrows nothing and must not imply camping.
  if (negatedClasses.has('camping')) {
    return { accommodationClass: 'lodging', stayPreference: 'unknown' };
  }
  if (negatedClasses.size > 0 || hasVehicleRv) {
    return { ...UNKNOWN };
  }

  return null;
}

function mapStayPreference({
  rawAccommodation,
  messageText,
  previousStayPreference,
} = {}) {
  const fromRaw = mapFromRaw(rawAccommodation);
  const fromMessage = mapFromMessage(messageText);

  /**
   * Precedence: the traveler's explicit current-turn statement outranks a
   * structured value, which may be carried from an earlier turn or an entry
   * form. It only overrides when the two actually disagree on the CLASS —
   * "we're in a cabin" must not be downgraded by a raw value of `lodging` that
   * says the same thing less precisely.
   */
  if (fromRaw && fromMessage) {
    const contradicts =
      fromMessage.accommodationClass !== 'unknown'
      && fromRaw.accommodationClass !== 'unknown'
      && fromMessage.accommodationClass !== fromRaw.accommodationClass;
    if (contradicts) return fromMessage;
    // A concrete message preference refines an unspecified structured class.
    if (fromRaw.stayPreference === 'unknown' && fromMessage.stayPreference !== 'unknown'
      && fromMessage.accommodationClass === fromRaw.accommodationClass) {
      return fromMessage;
    }
    return fromRaw;
  }
  if (fromRaw) return fromRaw;
  if (fromMessage) return fromMessage;

  if (previousStayPreference && previousStayPreference !== 'unknown') {
    const fromPrevious = mapFromRaw(previousStayPreference);
    if (fromPrevious) return fromPrevious;
  }

  return { ...UNKNOWN };
}

/**
 * The class a concrete stay preference belongs to. One source of truth, so the
 * consistency invariant cannot drift from the mapping that produced the value.
 */
const STAY_PREFERENCE_CLASSES = Object.freeze({
  lodge: 'lodging',
  hotel: 'lodging',
  cabin: 'lodging',
  vacation_rental: 'lodging',
  campground: 'camping',
  rv: 'camping',
});

function accommodationClassOfStayPreference(stayPreference) {
  if (!stayPreference) return 'unknown';
  return STAY_PREFERENCE_CLASSES[String(stayPreference).trim().toLowerCase()] || 'unknown';
}

module.exports = {
  mapStayPreference,
  accommodationClassOfStayPreference,
  STAY_PREFERENCE_CLASSES,
};
