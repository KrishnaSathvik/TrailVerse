'use strict';

/**
 * EARLY STRUCTURAL ARTIFACT VALIDATION (constructor reliability pass, 2026-08-24).
 *
 * WHY THIS STAGE EXISTS
 * ---------------------
 * `duration: 0` is emitted by the MODEL, in the tool artifact itself — proven by
 * the 2026-08-24 Canyonlands plan-stage captures, where `rawPlan` (the earliest
 * snapshot, taken immediately after `normalizeToolCalls` and
 * `normalizeCanonicalBackup`) already carried `[0,0,0,0,0,0,0,0]` and every later
 * stage carried the identical array. No server layer introduces it and no server
 * layer may repair it: inventing 30/45/60 minutes would fabricate traveler-facing
 * facts, so an invalid duration is rejected, never defaulted (P0-C).
 *
 * A plan whose day carries no positive duration anywhere can never be delivered.
 * Running evidence enrichment, the Maps route bridge, constraint finalization,
 * correction passes and semantic completeness over such an artifact is
 * deterministic wasted work, so the verdict is reached here instead — right after
 * the artifact is parsed and minimally normalized.
 *
 * DELIBERATELY NARROW
 * -------------------
 * This stage repeats verdicts `evaluateItineraryCompleteness` already reaches, at
 * exactly the same thresholds, so no plan changes outcome. In particular a day
 * with SOME zero-duration stops is NOT rejected here: delivered plans in the
 * artifact record contain them (Rainier 2026-08-18, Valley of Fire 2026-08-12),
 * and tightening that threshold is a separate decision with its own evidence.
 *
 * Nothing semantic belongs here — no experience anchors, no coverage, no
 * evidence, no eligibility. Those need the frozen bundle and the traveler's
 * words; these four do not.
 */

const { namedStops } = require('./itineraryCompleteness');

/** The complete, bounded set of codes this stage may emit. */
const STRUCTURAL_REASON_CODES = Object.freeze([
  'empty_itinerary',
  'underfilled_day_count',
  'empty_day',
  'zero_duration_stops',
]);

/**
 * Which acceptance obligations this stage is able to judge. The repair ledger
 * reads this to tell "the candidate satisfied it" apart from "nothing tested
 * it" — a structurally rejected attempt proves nothing about sunrise coverage.
 */
const STRUCTURAL_OBLIGATIONS = Object.freeze([
  'day_count',
  'non_empty_days',
  'positive_stop_durations',
]);

/** Requested trip length from either canonical constraint shape. */
function expectedDayCount(constraints) {
  const raw = constraints?.dates?.numDays
    ?? constraints?.dates?.durationDays
    ?? constraints?.durationDays
    ?? constraints?.visitWindow?.durationDays
    ?? null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function dayLabel(day, index) {
  return Number.isFinite(Number(day?.day)) ? Number(day.day) : index + 1;
}

/**
 * @param {Object} params
 * @param {Object|null} params.itineraryData  parsed + minimally normalized plan
 * @param {Object|null} params.constraints    canonical structured constraints
 * @returns {{
 *   ok: boolean,
 *   reasonCodes: string[],
 *   dayDiagnostics: Array<{dayIndex:number,dayNumber:number,codes:string[],zeroDurationStopNames?:string[]}>,
 *   evaluatedObligations: string[],
 * }}
 */
function evaluateStructuralArtifact({ itineraryData = null, constraints = null, userPrompt = '', touchedDayNumbers = null } = {}) {
  const evaluatedObligations = [...STRUCTURAL_OBLIGATIONS];
  const days = Array.isArray(itineraryData?.days) ? itineraryData.days : [];
  if (days.length === 0) {
    return {
      ok: false,
      reasonCodes: ['empty_itinerary'],
      dayDiagnostics: [],
      evaluatedObligations,
    };
  }

  const reasonCodes = [];
  const dayDiagnostics = [];

  const expected = expectedDayCount(constraints);
  if (expected !== null && days.length < expected) {
    reasonCodes.push('underfilled_day_count');
  }

  for (let i = 0; i < days.length; i += 1) {
    const day = days[i];
    const named = namedStops(day);
    const intent = require('./dayIntentSemantics').resolveDayIntent({ userPrompt, constraints, dayNumber: Number(day.dayNumber || day.day || i + 1), dayCount: days.length, touchedDayNumbers });
    if (intent.kind === 'rest' && !named.length) continue;
    if (named.length === 0) {
      reasonCodes.push('empty_day');
      dayDiagnostics.push({ dayIndex: i, dayNumber: dayLabel(day, i), codes: ['empty_day'] });
      continue;
    }
    const zeroDuration = named.filter((s) => !(Number(s?.duration) > 0));
    if (zeroDuration.length === named.length) {
      reasonCodes.push('zero_duration_stops');
      dayDiagnostics.push({
        dayIndex: i,
        dayNumber: dayLabel(day, i),
        codes: ['zero_duration_stops'],
        zeroDurationStopNames: zeroDuration.map((s) => s?.name).filter(Boolean).slice(0, 8),
      });
    }
  }

  const unique = [...new Set(reasonCodes)];
  return { ok: unique.length === 0, reasonCodes: unique, dayDiagnostics, evaluatedObligations };
}

/**
 * Deterministic repair text for a structural rejection.
 *
 * Naming the defect is what makes it targetable: the 2026-08-23 Acadia turn was
 * told its day coverage was insufficient, added a third stop, left every
 * duration at 0, and burned the ladder repairing the wrong thing. This text says
 * "the stops are right, the number is missing" — and never supplies the number.
 */
/**
 * POSITIVE DURATION — the invariant this module enforces, in the words the
 * model is given.
 *
 * It lives here, next to the validator, because a rule stated anywhere else can
 * drift from the thing that rejects plans. It cost a full wasted inference on
 * ~40% of turn wall clock to learn that: attempt 1 was told "when those fields
 * are missing, do not invent precision" while the repair was told duration must
 * be greater than zero, and the model complied the moment it was actually asked.
 *
 * ONE wording, consumed by the attempt-1 contract AND by the repair below.
 * Repair may add which days and stops failed; it must never restate the rule.
 */
const POSITIVE_DURATION_INVARIANT = [
  'Every stop must have a positive duration in minutes. Never emit duration 0 — not as unknown,',
  'not as a placeholder, not as "decide later", and not because the trip facts did not supply one.',
  'Duration is a PLANNING ESTIMATE you author, not a fact you must find: when the source has a',
  'duration, respect it; when it does not, choose a realistic positive estimate that fits the',
  'activity, the traveler\'s pace and the rest of the day. Do not present an estimate as an',
  'official or evidence-supplied figure.',
].join(' ');

function buildStructuralRepairInstructions({ reasonCodes = [], dayDiagnostics = [] } = {}) {
  const codes = [...new Set((reasonCodes || []).filter((c) => typeof c === 'string'))];
  if (codes.length === 0) return '';
  const lines = [];

  if (codes.includes('empty_itinerary')) {
    lines.push('The plan contained no days at all. Return the full day-by-day itinerary the traveler asked for.');
  }

  if (codes.includes('zero_duration_stops')) {
    const zeroDays = (dayDiagnostics || []).filter((d) => (d.codes || []).includes('zero_duration_stops'));
    const dayList = zeroDays.map((d) => `Day ${d.dayNumber}`).join(', ');
    const names = [...new Set(zeroDays.flatMap((d) => d.zeroDurationStopNames || []))].slice(0, 8);
    // The rule itself comes from the shared invariant; only the specifics of
    // THIS failure are added here.
    lines.push(
      `${dayList || 'One or more days'} had every stop set to a duration of 0${names.length ? ` (${names.join(', ')})` : ''}. `
      + `${POSITIVE_DURATION_INVARIANT} `
      + 'Keep the same stops, the same order and the same day structure — do not add stops, remove stops or rebuild the day.'
    );
  }

  if (codes.includes('empty_day')) {
    const emptyDays = (dayDiagnostics || []).filter((d) => (d.codes || []).includes('empty_day'));
    const dayList = emptyDays.map((d) => `Day ${d.dayNumber}`).join(', ');
    lines.push(
      `${dayList || 'One or more days'} contained no named stops. Every day must contain named places from the trip facts; do not return a day as a placeholder.`
    );
  }

  if (codes.includes('underfilled_day_count')) {
    lines.push('The plan is shorter than the trip the traveler asked for. Return every requested day; do not shrink trip length.');
  }

  return lines.join('\n');
}

module.exports = {
  STRUCTURAL_REASON_CODES,
  POSITIVE_DURATION_INVARIANT,
  STRUCTURAL_OBLIGATIONS,
  evaluateStructuralArtifact,
  buildStructuralRepairInstructions,
  expectedDayCount,
};
