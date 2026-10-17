'use strict';

/**
 * Stage 13.9 §4/§5 — deterministic trip-length resolution.
 *
 * ONE pure resolver, used BEFORE the structured token-budget selection so Phase A
 * starts at the right output ceiling instead of discovering the trip length by
 * burning a truncated attempt.
 *
 * Precedence (first hit wins):
 *   1. explicit validated structured numDays        → 'structured_num_days'
 *   2. valid inclusive start/end date range         → 'date_range'
 *   3. explicit deterministic duration phrase       → 'explicit_numeric_phrase'
 *                                                   | 'explicit_word_phrase'
 *                                                   | 'explicit_week_phrase'
 *   4. nothing deterministic                        → 'unknown'
 *
 * NON-GOALS (hard rules):
 *   - No LLM, no network, no clock, no I/O. Same input → same output, always.
 *   - AMBIGUOUS phrases never resolve: "next week", "this week", "the week of
 *     September 1", "during the weekend", "a few days", "several days". A calendar
 *     reference is not a duration.
 *   - The resolver NEVER mutates or stores the request text. Only the derived day
 *     count and a source label leave this module (§5 — no request text in metadata).
 */

// A trip longer than this is not a deterministic short-form duration; fail closed.
const MAX_RESOLVABLE_DAYS = 30;

const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
};

const RESOLUTION_SOURCE = {
  STRUCTURED_NUM_DAYS: 'structured_num_days',
  DATE_RANGE: 'date_range',
  EXPLICIT_NUMERIC_PHRASE: 'explicit_numeric_phrase',
  EXPLICIT_WORD_PHRASE: 'explicit_word_phrase',
  EXPLICIT_WEEK_PHRASE: 'explicit_week_phrase',
  UNKNOWN: 'unknown',
};

const UNKNOWN_RESOLUTION = Object.freeze({
  days: null,
  source: RESOLUTION_SOURCE.UNKNOWN,
  confidence: 'unknown',
});

function resolved(days, source, notes) {
  const out = { days, source, confidence: 'exact' };
  if (notes && notes.length) out.notes = notes;
  return out;
}

/** A day count that can drive a token budget: a whole number in a sane range. */
function validDayCount(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) return null;
  if (n < 1 || n > MAX_RESOLVABLE_DAYS) return null;
  return n;
}

// ── Date range ───────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse a date-only or ISO datetime value to a UTC day index; null when invalid. */
function toUtcDayIndex(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : Math.floor(value.getTime() / MS_PER_DAY);
  }
  const s = String(value).trim();
  if (!s) return null;
  // Accept 'YYYY-MM-DD' and full ISO timestamps only — never locale-dependent text.
  if (!/^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(s)) return null;
  const t = Date.parse(s.length === 10 ? `${s}T00:00:00Z` : s);
  if (Number.isNaN(t)) return null;
  return Math.floor(t / MS_PER_DAY);
}

/**
 * Inclusive day span of a start/end pair. Reversed or unparseable ranges resolve
 * to null (they fall through to the next precedence level — never to a guess).
 */
function daysFromDateRange(dates) {
  if (!dates || typeof dates !== 'object') return null;
  const start = toUtcDayIndex(dates.start != null ? dates.start : dates.startDate);
  const end = toUtcDayIndex(dates.end != null ? dates.end : dates.endDate);
  if (start == null || end == null) return null;
  if (end < start) return null; // reversed → does not resolve
  return validDayCount(end - start + 1);
}

// ── Request phrases ──────────────────────────────────────────────────────────

/**
 * Calendar-reference week phrases that are NOT durations. Masked out before any
 * duration scan so "next week in Yellowstone" can never resolve to 7 days.
 */
const AMBIGUOUS_WEEK_PATTERNS = [
  /\bweek\s+of\b/gi,                                            // "the week of September 1"
  /\b(?:next|this|last|that|coming|following|each|every|per)\s+week\b/gi,
  /\bin\s+(?:a|one|1)\s+week\b/gi,                              // "leaving in a week" (an offset)
  /\ba\s+week\s+from\b/gi,                                      // "a week from Tuesday"
];

/** Replace ambiguous week references with a neutral token (never fed to a model). */
function maskAmbiguousWeekPhrases(text) {
  let masked = text;
  for (const re of AMBIGUOUS_WEEK_PATTERNS) masked = masked.replace(re, '   ');
  return masked;
}

/** Collect every distinct day count a set of patterns finds. */
function scanDayCounts(text, patterns) {
  const found = new Set();
  for (const { re, map } of patterns) {
    const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    for (const match of text.matchAll(rx)) {
      const days = map(match);
      if (days != null) found.add(days);
    }
  }
  return [...found];
}

const NUMERIC_DAY_PATTERNS = [
  // "7-day trip", "7 day itinerary", "for 7 days", "10 days"
  { re: /\b(\d{1,2})\s*[-–—]?\s*days?\b/i, map: (m) => validDayCount(m[1]) },
];

const WORD_DAY_PATTERNS = [
  // "seven-day itinerary", "for seven days"
  {
    re: new RegExp(`\\b(${Object.keys(WORD_NUMBERS).join('|')})\\s*[-–—]?\\s*days?\\b`, 'i'),
    map: (m) => validDayCount(WORD_NUMBERS[m[1].toLowerCase()]),
  },
];

const WEEK_PATTERNS = [
  // "week-long trip", "a week-long Grand Canyon trip"
  { re: /\b(?:a|one|1)?\s*[-–—]?\s*weeks?\s*[-–—]?\s*long\b/i, map: () => 7 },
  // "a week in Yellowstone", "one week in Yosemite", "1 week"
  { re: /\b(?:a|one|1)\s+week\b/i, map: () => 7 },
  // "two weeks", "2 weeks"
  { re: /\b(?:two|2)\s+weeks\b/i, map: () => 14 },
];

/**
 * Resolve a duration from request text. Conflicting explicit counts inside one
 * request (e.g. "a 3-day or 5-day trip") fail CLOSED — better an unknown length
 * than a confidently wrong budget.
 */
function resolveFromRequestText(userRequest) {
  if (typeof userRequest !== 'string' || !userRequest.trim()) return null;
  const text = maskAmbiguousWeekPhrases(userRequest);

  const numeric = scanDayCounts(text, NUMERIC_DAY_PATTERNS);
  if (numeric.length === 1) return resolved(numeric[0], RESOLUTION_SOURCE.EXPLICIT_NUMERIC_PHRASE);
  if (numeric.length > 1) return null; // ambiguous → unknown

  const words = scanDayCounts(text, WORD_DAY_PATTERNS);
  if (words.length === 1) return resolved(words[0], RESOLUTION_SOURCE.EXPLICIT_WORD_PHRASE);
  if (words.length > 1) return null;

  const weeks = scanDayCounts(text, WEEK_PATTERNS);
  if (weeks.length === 1) return resolved(weeks[0], RESOLUTION_SOURCE.EXPLICIT_WEEK_PHRASE);
  return null;
}

// ── Public resolver ──────────────────────────────────────────────────────────

/** Pull an explicit numDays out of either constraint shape used in the codebase. */
function structuredNumDays(structuredConstraints) {
  if (!structuredConstraints || typeof structuredConstraints !== 'object') return null;
  const direct = validDayCount(structuredConstraints.numDays);
  if (direct != null) return direct;
  const nested = structuredConstraints.dates && validDayCount(structuredConstraints.dates.numDays);
  return nested != null ? nested : null;
}

/** The date pair to use: an explicit `dates` argument, else the constraints' own. */
function effectiveDates(structuredConstraints, dates) {
  if (dates && typeof dates === 'object') return dates;
  if (structuredConstraints && typeof structuredConstraints.dates === 'object') return structuredConstraints.dates;
  return null;
}

/**
 * Stage 13.9 §4 — resolve the expected trip length deterministically.
 *
 * @param {Object}  params
 * @param {Object}  [params.structuredConstraints] validated constraint object
 * @param {Object}  [params.dates]                 { start, end } (or startDate/endDate)
 * @param {string}  [params.userRequest]           raw user text (READ ONLY, never stored)
 * @returns {{days: number|null, source: string, confidence: 'exact'|'unknown', notes?: string[]}}
 *   Sanitized provenance ONLY — the request text never appears in the result.
 */
function resolveExpectedTripDays({ structuredConstraints = null, dates = null, userRequest = null } = {}) {
  const pair = effectiveDates(structuredConstraints, dates);
  const rangeDays = daysFromDateRange(pair);

  // 1. Explicit validated structured numDays wins (documented precedence). A date
  //    range that disagrees is recorded as a conflict note but does NOT override.
  const numDays = structuredNumDays(structuredConstraints);
  if (numDays != null) {
    const notes = rangeDays != null && rangeDays !== numDays ? ['date_range_conflict'] : [];
    return resolved(numDays, RESOLUTION_SOURCE.STRUCTURED_NUM_DAYS, notes);
  }

  // 2. A valid inclusive date range.
  if (rangeDays != null) return resolved(rangeDays, RESOLUTION_SOURCE.DATE_RANGE);

  // 3. An explicit deterministic duration phrase in the request.
  const fromText = resolveFromRequestText(userRequest);
  if (fromText) return fromText;

  // 4. Nothing deterministic — the caller keeps its conservative default.
  return { ...UNKNOWN_RESOLUTION };
}

/** Last user message text, for callers that only hold a message array. */
function latestUserRequestText(messages) {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m && m.role === 'user' && typeof m.content === 'string' && m.content.trim()) return m.content;
  }
  return null;
}

module.exports = {
  MAX_RESOLVABLE_DAYS,
  RESOLUTION_SOURCE,
  WORD_NUMBERS,
  daysFromDateRange,
  maskAmbiguousWeekPhrases,
  resolveFromRequestText,
  resolveExpectedTripDays,
  latestUserRequestText,
};
