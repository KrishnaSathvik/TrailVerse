'use strict';

/**
 * Stage 12 — deterministic text/number normalization shared by the manifest
 * builder and the consistency verifier so both agree on identity and units.
 */

/** Lowercased, punctuation-collapsed name for stable matching. */
function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Generic type words that may be trimmed from the END of a name to form a
// shorter alias — but only while ≥2 informative tokens remain (Stage 13.8 §5).
const GENERIC_SUFFIX_WORDS = new Set([
  'trail', 'trailhead', 'overlook', 'viewpoint', 'point', 'campground', 'lot',
  'area', 'center', 'visitor', 'loop', 'road', 'route', 'path', 'falls', 'lake',
  'valley', 'canyon', 'river', 'creek', 'drive',
]);

/**
 * Accepted aliases for a stop name (deterministic, no model).
 *
 * Stage 13.8 §5 — NEVER derive a single-token alias by stripping generic suffix
 * words. "Canyon Overlook Trail" → "canyon overlook trail" and "canyon overlook",
 * but NEVER "canyon" (which matched every ordinary use of the word and forced
 * false removed-stop failures). The full canonical name is always retained;
 * genuinely single-token canonical names keep that single token.
 */
function deriveAliases(name) {
  const norm = normalizeName(name);
  if (!norm) return [];
  const aliases = new Set([norm]);
  // Strip trailing generic type words one at a time, but stop before dropping
  // below two tokens — a derived alias must stay specific (≥2 informative tokens).
  let tokens = norm.split(' ');
  while (tokens.length > 2 && GENERIC_SUFFIX_WORDS.has(tokens[tokens.length - 1])) {
    tokens = tokens.slice(0, -1);
  }
  const trimmed = tokens.join(' ');
  if (trimmed && trimmed !== norm && tokens.length >= 2) aliases.add(trimmed);
  return [...aliases];
}

/**
 * Stage 13.8A §1 — removed-stop alias collision guard.
 *
 * A removed stop's aliases BLOCK prose, so an automatically derived alias that
 * collapses into the destination name itself ("Grand Canyon Visitor Center" →
 * "grand canyon") fires on every ordinary mention of the park. Automatic
 * derivation is therefore rejected when the alias equals a destination name or
 * destination alias, when it has no token outside the destination name, or when
 * its only non-destination tokens are generic geographic/type words.
 *
 * Curated aliases supplied by trusted metadata bypass this guard entirely — they
 * are a deliberate editorial choice, not an inference.
 */

// Extra tokens that carry no distinguishing information inside a destination.
// Used ONLY by the removed-stop guard (never by the permissive alias whitelist).
const GENERIC_ALIAS_TOKENS = new Set([
  ...GENERIC_SUFFIX_WORDS,
  'national', 'park', 'state', 'rim', 'basin', 'ridge', 'peak', 'springs',
  'meadow', 'meadows', 'bay', 'beach', 'island', 'gorge', 'pass', 'summit',
  'station', 'museum', 'lodge', 'entrance', 'shuttle', 'stop', 'junction',
  'village', 'north', 'south', 'east', 'west', 'upper', 'lower',
]);

// Trailing NPS designations, longest first, so "grand canyon national park"
// yields the well-known short destination alias "grand canyon".
const DESIGNATION_SUFFIXES = [
  'national historical park', 'national recreation area', 'national historic site',
  'national battlefield park', 'national military park', 'national monument',
  'national preserve', 'national seashore', 'national lakeshore', 'national memorial',
  'national battlefield', 'national forest', 'national park', 'state park', 'park',
];

/** Normalized destination names plus their designation-stripped short forms. */
function destinationAliasSet(destinationNames = []) {
  const set = new Set();
  for (const raw of destinationNames || []) {
    const norm = normalizeName(raw);
    if (!norm) continue;
    set.add(norm);
    for (const suffix of DESIGNATION_SUFFIXES) {
      if (norm.endsWith(` ${suffix}`)) {
        const short = norm.slice(0, norm.length - suffix.length - 1).trim();
        if (short) set.add(short);
        break;
      }
    }
  }
  return set;
}

/** Every ≥2-token form produced by stripping trailing generic type words. */
function suffixStrippedCandidates(norm) {
  const out = [];
  let tokens = norm.split(' ');
  while (tokens.length > 2 && GENERIC_SUFFIX_WORDS.has(tokens[tokens.length - 1])) {
    tokens = tokens.slice(0, -1);
    out.push(tokens.join(' '));
  }
  return out;
}

/**
 * @param {Object} params
 * @param {string} params.name                 canonical removed-stop name
 * @param {string[]} [params.curatedAliases]   trusted metadata aliases (kept as-is)
 * @param {string[]} [params.destinationNames] park/destination names for the trip
 * @returns {string[]} blocking aliases, canonical name first
 */
function deriveRemovedStopAliases({ name, curatedAliases = [], destinationNames = [] } = {}) {
  const norm = normalizeName(name);
  const destAliases = destinationAliasSet(destinationNames);
  const destTokens = new Set([...destAliases].flatMap((d) => d.split(' ')));

  const aliases = new Set();
  for (const curated of curatedAliases || []) {
    const c = normalizeName(curated);
    if (c) aliases.add(c);
  }
  // The canonical name blocks, unless it IS the destination (then only a curated
  // alias can block, because the bare destination name is not a usable signal).
  if (norm && !destAliases.has(norm)) aliases.add(norm);

  const acceptable = (alias) => {
    const tokens = alias.split(' ');
    if (tokens.length < 2) return false;
    if (destAliases.has(alias)) return false;
    const outside = tokens.filter((t) => !destTokens.has(t));
    // No token outside the destination name at all → it IS the destination.
    if (outside.length === 0) return false;
    // Shares the destination name and adds only generic feature/type words
    // ("yellowstone lake") → too common inside this itinerary's prose.
    if (outside.length < tokens.length && outside.every((t) => GENERIC_ALIAS_TOKENS.has(t))) return false;
    return true;
  };

  if (norm) {
    for (const candidate of suffixStrippedCandidates(norm)) {
      if (acceptable(candidate)) aliases.add(candidate);
    }
  }
  return [...aliases];
}

/**
 * Convert a duration expression in prose to minutes, or null if not a duration.
 * Handles "90 minutes", "1.5 hours", "one and a half hours", "2 hrs".
 */
const WORD_NUMBERS = {
  half: 0.5, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

// A single numeric duration token: "1.5 hours", "2 hrs", "90 minutes", "45 min",
// and the hyphenated adjective form "2-hour" / "90-minute". The hyphen/space
// between the number and unit is what lets "a 2-hour walk" be recognized.
const DUR_CORE = String.raw`(\d+(?:\.\d+)?)[\s-]*(hours?|hrs?|minutes?|mins?|min)`;

function unitMinutes(value, unit) {
  return /^h/.test(unit) ? value * 60 : value;
}

function parseDurationToMinutes(text) {
  const t = String(text || '').toLowerCase();
  // "one and a half hours"
  const wordMatch = t.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+and\s+a\s+half\s+hours?\b/);
  if (wordMatch) return (WORD_NUMBERS[wordMatch[1]] + 0.5) * 60;
  const halfHour = t.match(/\bhalf\s+an?\s+hour\b/);
  if (halfHour) return 30;
  // "1.5 hours" / "2 hrs" / "90 minutes" / "45 min" / "2-hour"
  const num = t.match(new RegExp(`${DUR_CORE}\\b`));
  if (num) return unitMinutes(parseFloat(num[1]), num[2]);
  return null;
}

/**
 * Stage 13.7 — context-aware difficulty classification.
 *
 * The Stage 12 verifier treated ANY difficulty word inside a stop segment as an
 * activity-difficulty claim, so "permits can be difficult to obtain" produced a
 * false conflict. This classifier only reports an activity difficulty when the
 * term modifies or predicates an activity noun (a hike/trail/walk/climb/…). When
 * a hard-end difficulty term appears WITHOUT that relationship, it is reported as
 * ambiguous (non-blocking) rather than a contradiction.
 */
const DIFFICULTY_SYNONYMS = {
  easy: 'easy', beginner: 'easy',
  moderate: 'moderate', intermediate: 'moderate',
  strenuous: 'strenuous', hard: 'strenuous', difficult: 'strenuous', challenging: 'strenuous', tough: 'strenuous',
};
const DIFFICULTY_TERMS = Object.keys(DIFFICULTY_SYNONYMS);
// Hard-end terms whose non-activity use ("difficult to obtain") is the classic
// false positive; only these raise ambiguous telemetry when unbound.
const HARD_END_TERMS = ['strenuous', 'hard', 'difficult', 'challenging', 'tough'];
// Nouns that denote the actual activity a difficulty rating applies to.
const ACTIVITY_NOUNS = [
  'hike', 'hikes', 'hiking', 'trail', 'trails', 'walk', 'walks', 'climb', 'climbs',
  'climbing', 'route', 'routes', 'trek', 'trekking', 'path', 'paths', 'ascent',
  'descent', 'scramble', 'loop', 'stroll', 'activity',
];
const TERM_ALT = DIFFICULTY_TERMS.join('|');
const NOUN_ALT = ACTIVITY_NOUNS.join('|');
// Intensifiers/number tokens allowed to sit between a difficulty term and its
// activity noun ("very strenuous hike", "moderate 2-hour walk"). Deliberately
// excludes "to", so "easy to reach trail" is NOT read as an easy trail.
const FILLER = String.raw`(?:(?:very|really|quite|fairly|pretty|moderately|somewhat|a|an|but|and|\d[\w-]*)\s+){0,2}`;
const LINK = String.raw`(?:is|was|are|were|feels?|felt|gets?|becomes?|can\s+be|will\s+be|is\s+a|is\s+quite|is\s+fairly|is\s+pretty|is\s+very)`;
const INTENS = String.raw`(?:(?:very|really|quite|fairly|pretty|moderately|somewhat|a|an)\s+){0,2}`;

// term → activity noun:  "challenging hike", "difficult climb", "moderate 2-hour walk"
const ADJ_BEFORE_NOUN = new RegExp(String.raw`\b(${TERM_ALT})\s+${FILLER}(?:${NOUN_ALT})\b`, 'i');
// activity noun → link → term:  "the trail is strenuous", "the route is moderately difficult"
const NOUN_BEFORE_ADJ = new RegExp(String.raw`\b(?:${NOUN_ALT})\b(?:\s+\w+){0,2}?\s+${LINK}\s+${INTENS}(${TERM_ALT})\b`, 'i');

function detectActivityDifficulty(text) {
  const t = String(text || '').toLowerCase();
  const before = t.match(ADJ_BEFORE_NOUN);
  if (before) return { difficulty: DIFFICULTY_SYNONYMS[before[1]], ambiguous: false };
  const after = t.match(NOUN_BEFORE_ADJ);
  if (after) return { difficulty: DIFFICULTY_SYNONYMS[after[1]], ambiguous: false };
  // No activity binding. Only a hard-end term (difficult/challenging/…) that is
  // present but unbound is worth non-blocking telemetry; a bare "easy" is not.
  const hasHardEnd = new RegExp(String.raw`\b(?:${HARD_END_TERMS.join('|')})\b`, 'i').test(t);
  return { difficulty: null, ambiguous: hasHardEnd };
}

/**
 * Stage 13.7 — context-aware duration classification.
 *
 * Only a numeric phrase in a genuine activity-duration construction ("spend 2
 * hours at…", "the hike takes 3 hours", "a 90-minute walk") is returned as the
 * activity duration. Frequencies ("every 15 minutes"), offsets ("arrive 30
 * minutes early"), drives ("the drive is 45 minutes"), waits, and permit windows
 * are recognized as non-activity and ignored. A leftover, unclassifiable numeric
 * phrase is reported as ambiguous (non-blocking) — never assumed to match.
 */
// Context tested on the text BEFORE a duration token.
const BEFORE_FREQUENCY = /\bevery\s*$/i;
const BEFORE_DRIVE = /\bdrive\b[^.]{0,15}$/i;
const BEFORE_WAIT = /\bwait\b[^.]{0,10}$/i;
const BEFORE_OPENS_IN = /\b(?:opens?|starts?|begins?|closes?|reopens?)\b[^.]{0,12}\bin\b[^.]{0,3}$/i;
const BEFORE_VERB_LED = /\b(?:spend|allow|budget|reserve|dedicate|set\s+aside|give\s+yourself|plan)\b[^.]{0,20}$/i;
const BEFORE_ACTIVITY_TAKES = new RegExp(String.raw`\b(?:${NOUN_ALT}|this|stop|visit|tour)\b[^.]{0,24}\b(?:takes?|lasts?|runs?|requires?|needs?)\b[^.]{0,12}$`, 'i');

// Context tested on the text AFTER a duration token (immediately following the unit).
const AFTER_OFFSET = /^\s*(?:early|earlier|before|ahead|prior|beforehand|in\s+advance|ahead\s+of)\b/i;
const AFTER_FREQUENCY = /^\s*(?:apart|intervals?)\b/i;
// Stage 13.8 §6 — an approach/transition ("a 5-minute walk FROM the visitor
// center", "a 10-minute shuttle ride TO the trailhead") is not the activity.
const AFTER_APPROACH = /^\s*(?:walk|hike|ride|drive|shuttle|stroll|trip|climb|trek|loop)\b\s+(?:ride\s+)?(?:from|to|toward|towards|back|away|up\s+to|down\s+to)\b/i;
// A duration adjective directly before an activity noun ("a 2-hour hike").
const AFTER_ADJ_NOUN = /^\s*(?:\w+\s+){0,1}(?:hike|walk|visit|tour|stroll|climb|trek|loop|activity)\b/i;

function isNonActivityContext(before, after) {
  return BEFORE_FREQUENCY.test(before) || BEFORE_DRIVE.test(before)
    || BEFORE_WAIT.test(before) || BEFORE_OPENS_IN.test(before)
    || AFTER_OFFSET.test(after) || AFTER_FREQUENCY.test(after) || AFTER_APPROACH.test(after);
}

function isActivityContext(before, after) {
  return BEFORE_VERB_LED.test(before) || BEFORE_ACTIVITY_TAKES.test(before) || AFTER_ADJ_NOUN.test(after);
}

function detectActivityDuration(text) {
  const t = String(text || '').toLowerCase();
  const core = new RegExp(DUR_CORE, 'ig');
  let ambiguous = false;
  // Scan each numeric duration token. Non-activity context (offset, frequency,
  // drive, wait, opens-in, approach) is checked FIRST and wins even when an
  // activity verb precedes ("plan to arrive 30 minutes before sunset").
  for (const m of t.matchAll(core)) {
    const before = t.slice(Math.max(0, m.index - 40), m.index);
    const after = t.slice(m.index + m[0].length);
    if (isNonActivityContext(before, after)) continue;
    if (isActivityContext(before, after)) return { minutes: unitMinutes(parseFloat(m[1]), m[2]), ambiguous: false };
    ambiguous = true;
  }
  return { minutes: null, ambiguous };
}

module.exports = {
  normalizeName,
  deriveAliases,
  deriveRemovedStopAliases,
  destinationAliasSet,
  parseDurationToMinutes,
  DIFFICULTY_SYNONYMS,
  ACTIVITY_NOUNS,
  detectActivityDifficulty,
  detectActivityDuration,
};
