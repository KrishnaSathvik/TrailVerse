'use strict';

/**
 * Trip duration semantics.
 *
 * Replaces two divergent phrase-list regexes (one in turnUnderstanding's
 * resolveTemporalScope, one in travelerStateExtraction's extractSpokenDuration)
 * that between them accepted "four days" and "three full days" but not
 * "three relaxed days", "six nights", or "a six-night trip". Appending more
 * alternatives to those lists is how the gate failures kept arriving one
 * phrasing at a time, so this parses the GRAMMAR instead:
 *
 *     <count> [up to two modifiers] <unit>
 *
 * The parse result keeps the traveler's own semantics (amount + unit) and a
 * separate, documented translation into canonical fields. Duration is never
 * inferred from a visit window here — "somewhere in October" is WHEN, not
 * HOW LONG, and conflating them produced a 31-day trip.
 *
 * When several counted spans appear, trip-length grammar outranks a later
 * activity-role span ("4-day trip … one alpine day" stays 4). Last match of
 * the winning role still wins.
 *
 * Offline, pure, no I/O.
 */

const WORD_NUMBERS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20,
});

const NUMBER_TOKEN = `\\d{1,2}|${Object.keys(WORD_NUMBERS).join('|')}`;

/**
 * <count> <modifier>{0,2} <unit>. The lazy modifier group is what admits
 * "three relaxed days" and "three really relaxed days" without inventing a
 * special case for either, while the {0,2} bound stops the match from running
 * across a clause boundary ("two of the best days out there").
 */
const DURATION_PHRASE = new RegExp(
  `\\b(${NUMBER_TOKEN})\\s*[-\\s]\\s*((?:[a-z]+[-\\s]){0,2}?)(days?|nights?|weeks?)\\b`,
  'gi',
);

/** "a week" / "about a week" / "a weekend". */
const ARTICLE_UNIT = /\b(?:about\s+|roughly\s+|around\s+)?a\s+(week|weekend)\b/i;
const LONG_WEEKEND = /\blong weekend\b/i;
const BARE_WEEKEND = /\bweekend\b/i;
/** "next weekend" / "this weekend" is WHEN, not HOW LONG. */
const DATE_WEEKEND = /\b(?:next|this|that|coming|following|last)\s+weekend\b/i;

function countOf(token) {
  const raw = String(token || '').toLowerCase();
  if (/^\d+$/.test(raw)) return Number(raw);
  return WORD_NUMBERS[raw] ?? null;
}

function unitOf(token) {
  const raw = String(token || '').toLowerCase();
  if (raw.startsWith('night')) return 'night';
  if (raw.startsWith('week')) return 'week';
  return 'day';
}

/**
 * Canonical translation policy — stated once, here, rather than implied by a
 * regex somewhere downstream.
 *
 *   N days    -> durationDays = N          lodgingNights = null
 *   N nights  -> durationDays = N + 1      lodgingNights = N
 *   N weeks   -> durationDays = N * 7      lodgingNights = null
 *   weekend   -> durationDays = 2          long weekend -> 3
 *
 * Nights become N+1 calendar days because a traveler booking six nights is
 * describing lodging, and the trip that surrounds six nights spans seven days
 * including the arrival and departure days. `lodgingNights` is preserved so a
 * consumer that needs the lodging count never has to reverse the arithmetic.
 */
function canonicalize(amount, unit) {
  if (!Number.isInteger(amount) || amount <= 0) return { durationDays: null, lodgingNights: null };
  if (unit === 'night') return { durationDays: amount + 1, lodgingNights: amount };
  if (unit === 'week') return { durationDays: amount * 7, lodgingNights: null };
  return { durationDays: amount, lodgingNights: null };
}

/**
 * Pace/completeness modifiers describe HOW LONG the trip feels ("three relaxed
 * days"). Content/theme modifiers describe a ROLE inside the trip ("one alpine
 * day", "two river days") and must not overwrite an explicit trip length.
 */
const DURATION_QUALIFIERS = new Set([
  'full', 'whole', 'entire', 'consecutive', 'relaxed', 'easy', 'busy', 'packed',
  'free', 'extra', 'straight', 'solid', 'really', 'very', 'quite', 'pretty',
  'fairly', 'super', 'more', 'complete', 'long', 'short',
]);

function durationSpanRole(text, match) {
  const qualifier = (match[2] || '').trim().toLowerCase().replace(/[-\s]+/g, ' ').trim();
  const after = text.slice(match.index + match[0].length, match.index + match[0].length + 28);
  const before = text.slice(Math.max(0, match.index - 24), match.index);
  if (/^\s*(?:trip|itinerary|vacation|getaway|visit|tour|stay|road\s*trip)\b/i.test(after)) {
    return 'trip_length';
  }
  if (/^\s*(?:in|at|for|across|through)\b/i.test(after)) return 'trip_length';
  if (/\b(?:for|spend(?:ing)?|have|lasts?|lasting|over)\s+$/i.test(before)) return 'trip_length';
  const words = qualifier ? qualifier.split(' ').filter(Boolean) : [];
  if (words.length === 0) return 'trip_length';
  if (words.every((word) => DURATION_QUALIFIERS.has(word))) return 'trip_length';
  return 'activity_role';
}

/**
 * @returns {{
 *   amount: number|null, unit: 'day'|'night'|'week'|'weekend'|null,
 *   qualifier: string|null, explicitness: 'explicit'|'idiomatic'|'none',
 *   supportingSpan: string|null, durationDays: number|null, lodgingNights: number|null,
 *   source: string|null
 * }}
 */
function parseTripDuration(text = '') {
  const msg = String(text || '');
  const none = {
    amount: null, unit: null, qualifier: null, explicitness: 'none',
    supportingSpan: null, durationDays: null, lodgingNights: null, source: null,
  };
  if (!msg.trim()) return none;

  // Trip-length spans outrank subordinate activity-role spans ("4-day trip"
  // plus later "one alpine day"). Among spans of the same role, the last wins.
  const tripLength = [];
  const activityRole = [];
  for (const match of msg.matchAll(DURATION_PHRASE)) {
    // An ordinal subset locates part of an existing trip; it does not resize it.
    const before = msg.slice(Math.max(0, match.index - 30), match.index);
    if (/\b(?:first|last|final|remaining)\s+$/i.test(before)) continue;
    const amount = countOf(match[1]);
    if (amount == null) continue;
    const span = {
      amount,
      unit: unitOf(match[3]),
      qualifier: (match[2] || '').trim() || null,
      supportingSpan: match[0].trim(),
      index: match.index,
    };
    if (durationSpanRole(msg, match) === 'activity_role') activityRole.push(span);
    else tripLength.push(span);
  }
  const last = (tripLength.length ? tripLength : activityRole).pop() || null;
  if (last) {
    return {
      amount: last.amount,
      unit: last.unit,
      qualifier: last.qualifier,
      supportingSpan: last.supportingSpan,
      explicitness: 'explicit',
      source: last.unit === 'night' ? 'explicit_night_count' : 'explicit_day_count',
      ...canonicalize(last.amount, last.unit),
    };
  }

  const article = msg.match(ARTICLE_UNIT);
  if (article && article[1].toLowerCase() === 'week') {
    return {
      amount: 1, unit: 'week', qualifier: null, explicitness: 'idiomatic',
      supportingSpan: article[0].trim(), source: 'explicit_week', ...canonicalize(1, 'week'),
    };
  }

  // "next weekend" names WHEN. Only a bare/long weekend names HOW LONG.
  if (!DATE_WEEKEND.test(msg)) {
    if (LONG_WEEKEND.test(msg)) {
      return {
        amount: 3, unit: 'weekend', qualifier: 'long', explicitness: 'idiomatic',
        supportingSpan: 'long weekend', source: 'weekend_as_duration',
        durationDays: 3, lodgingNights: null,
      };
    }
    if (BARE_WEEKEND.test(msg)) {
      return {
        amount: 2, unit: 'weekend', qualifier: null, explicitness: 'idiomatic',
        supportingSpan: 'weekend', source: 'weekend_as_duration',
        durationDays: 2, lodgingNights: null,
      };
    }
  }

  return none;
}

module.exports = { parseTripDuration, WORD_NUMBERS, durationSpanRole };
