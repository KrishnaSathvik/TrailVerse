'use strict';

/**
 * REPAIR LEDGER — the cumulative acceptance contract for one turn.
 *
 * THE DEFECT THIS EXISTS TO FIX
 * -----------------------------
 * The router replaced its repair state on every attempt
 * (`repairReasonCodes = boundedReasons(validation.reasonCodes)`), and the
 * execution service did the same with `lastRepairInstructions`. Attempt N
 * therefore knew ONLY attempt N-1's failure. Worse, repair text was gated on
 * `retry`, which is false on escalation, so the Sol attempt received no
 * validator feedback at all.
 *
 * The 2026-08-24 Canyonlands ladder is the proof: attempt 1 had golden-hour
 * stops with zero durations; attempt 2 fixed the durations and collapsed the
 * trip to four stops; attempt 3 — the blind escalation — went back to zero
 * durations. Three fresh generations taking turns forgetting different
 * requirements.
 *
 * WHAT THE LEDGER IS
 * ------------------
 * A bounded record of CONTRACT OBLIGATIONS — the traveler's stated trip shape
 * plus the structural invariants — and, for each, whether some candidate has
 * already demonstrated it is satisfiable. It is NOT a store of model-generated
 * travel facts: it never remembers a stop, a place name or a sentence of prose,
 * only which obligations are owed and which have been met.
 *
 * An obligation counts as satisfied only when a validator ACTUALLY EVALUATED it
 * and did not complain. An attempt rejected by the early structural stage never
 * reached the golden-hour check, so it proves nothing about golden hour — the
 * ledger records that honestly rather than assuming.
 */

/**
 * Traveler asks come from the validator itself, never a copy. The ledger must
 * promise the model exactly the requirements some validator can actually check:
 * a private regex here would drift and start asserting obligations that no
 * reason code enforces.
 */
const { REQUESTED_EXPERIENCE_ASKS } = require('./itineraryCompleteness');

const HIKE_ASK = REQUESTED_EXPERIENCE_ASKS.hike;
const GOLDEN_HOUR_ASK = REQUESTED_EXPERIENCE_ASKS.goldenHour;
const SCENIC_ASK = REQUESTED_EXPERIENCE_ASKS.scenic;
const SCENIC_DRIVE_ASK = REQUESTED_EXPERIENCE_ASKS.scenicDrive;
const WILDLIFE_ASK = REQUESTED_EXPERIENCE_ASKS.wildlife;
const GEOTHERMAL_ASK = REQUESTED_EXPERIENCE_ASKS.geothermal;
const PHOTOGRAPHY_ASK = REQUESTED_EXPERIENCE_ASKS.photography;
const BEACH_ASK = REQUESTED_EXPERIENCE_ASKS.beach;
const WATERFALL_ASK = REQUESTED_EXPERIENCE_ASKS.waterfall;
const HISTORIC_ASK = REQUESTED_EXPERIENCE_ASKS.historic;
const BACKUP_ASK = REQUESTED_EXPERIENCE_ASKS.backup;

const SAFE_CODE = /^[a-z0-9_]{1,64}$/;
const MAX_LIST = 12;

/**
 * Reason code → obligation. One obligation may be reached by several codes
 * (`empty_itinerary` and `underfilled_day_count` are both "the trip is short").
 */
const OBLIGATION_FOR_REASON_CODE = Object.freeze({
  // PHASE 4Q — the position-independent code. The `_anchor` variant is kept so a
  // historical replay still maps to the same obligation; nothing emits it now.
  unverified_access_dependency: 'traveler_access_fit',
  unverified_access_dependency_anchor: 'traveler_access_fit',
  traveler_fit_incompatible: 'traveler_access_fit',
  zero_duration_stops: 'positive_stop_durations',
  empty_day: 'non_empty_days',
  empty_itinerary: 'day_count',
  underfilled_day_count: 'day_count',
  missing_experience_anchor: 'experience_anchor_every_day',
  insufficient_day_coverage: 'day_coverage_every_day',
  duplicate_base_experience: 'distinct_day_experiences',
  missing_requested_hike: 'requested_hike',
  missing_requested_sunset: 'requested_golden_hour',
  missing_requested_scenic: 'requested_scenic',
  missing_requested_scenic_drive: 'requested_scenic_drive',
  missing_requested_wildlife: 'requested_wildlife',
  missing_requested_geothermal: 'requested_geothermal',
  missing_requested_photography: 'requested_photography',
  missing_requested_beach: 'requested_beach',
  missing_requested_waterfall: 'requested_waterfall',
  missing_requested_historic: 'requested_historic',
  missing_requested_experience_coverage: 'requested_experience_coverage',
  missing_backup_plan: 'backup_plan',
  constraint_eligibility_unknown: 'exposure_eligibility',
  exposure_prose_conflict: 'exposure_eligibility',
  exposure_constraint_violation: 'exposure_eligibility',
  mobility_distance_exceeds_limit: 'mobility_eligibility',
  mobility_eligibility_unknown: 'mobility_eligibility',
  mobility_prose_claim_unsupported: 'mobility_eligibility',
  comparison_selection_missing: 'comparison_selection',
  comparison_selection_deferred: 'comparison_selection',
  comparison_selection_out_of_scope: 'comparison_selection',
  comparison_selection_exception_unstated: 'comparison_selection',
});

/**
 * Structural invariants are HARD: losing one is never an acceptable trade for
 * clearing several softer defects (P0-L).
 */
const HARD_OBLIGATIONS = new Set([
  'positive_stop_durations',
  'non_empty_days',
  'day_count',
  'requested_hike',
  'requested_golden_hour',
  'requested_scenic',
  'requested_scenic_drive',
  'requested_wildlife',
  'requested_geothermal',
  'requested_photography',
  'requested_beach',
  'requested_waterfall',
  'requested_historic',
  'requested_experience_coverage',
  'backup_plan',
  'exposure_eligibility',
  'mobility_eligibility',
  'traveler_access_fit',
]);

function spelledCount(n) {
  return ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] || String(n);
}

function requestedDays(constraints) {
  const raw = constraints?.dates?.numDays
    ?? constraints?.dates?.durationDays
    ?? constraints?.durationDays
    ?? constraints?.visitWindow?.durationDays
    ?? null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * P0-J — `missing_requested_sunset` covers the whole golden-hour family. Echo
 * the traveler's own word back, so a sunrise request is never repaired as
 * "add a sunset".
 */
function goldenHourWords(prompt) {
  const found = [];
  for (const re of [/\bsunrise\b/i, /\bsunset\b/i, /\bgolden hour\b/i, /\bgolden light\b/i, /\bevening glow\b/i]) {
    const m = String(prompt || '').match(re);
    if (m) found.push(m[0].toLowerCase());
  }
  return [...new Set(found)];
}

/**
 * Deterministic obligations for this turn: structural invariants that always
 * hold, the requested trip length, and the traveler's explicit experience asks.
 * `preserveOnly` obligations have no constructor reason code of their own — they
 * are traveler constraints that must survive every repair, not defects to fix.
 */
/** Phase 9C.1D.5B — per-request named obligations are hard by construction. */
const NAMED_OBLIGATION_ID = /^requested_named_experience_\d+$/;

function deriveObligations({ constraints = null, userPrompt = '', namedExperienceRequirements = null } = {}) {
  const prompt = String(userPrompt || '');
  const obligations = new Map();
  const add = (id, label, { preserveOnly = false, fix = null, reasonCode = null } = {}) => {
    obligations.set(id, {
      id, label, preserveOnly, fix, reasonCode, hard: HARD_OBLIGATIONS.has(id) || NAMED_OBLIGATION_ID.test(id),
    });
  };

  const days = requestedDays(constraints);
  if (days !== null) {
    add('day_count', `the full ${spelledCount(days)}-day trip (${days} days, none dropped)`, {
      fix: `Return all ${days} days.`,
    });
  }
  add('non_empty_days', 'every day carries named places from the trip facts', {
    fix: 'Give every day real named stops.',
  });
  add('positive_stop_durations', 'every stop has a duration greater than zero minutes', {
    fix: 'Set a realistic positive duration on every stop. Do not leave any at 0.',
  });
  add('experience_anchor_every_day', 'every sightseeing day has a real experience, not only logistics and rest', {
    fix: 'Give each flagged day something the traveller would say they DID that day — a walk, a wildlife or photography outing, a viewpoint they linger at, a site they go into — that this traveller can actually reach. Another visitor center or information desk does not resolve it, and neither does reaching for the most remote or demanding place available. A real scenic drive can count when the drive itself is the experience.',
  });
  add('day_coverage_every_day', 'every day has enough distinct content to be worth a day', {
    fix: 'Make each flagged day worthwhile with the smallest grounded change: deepen an evidence-supported experience, preserve a context-justified light day, replace weak support, or add one eligible experience. Never accumulate filler.',
  });
  add('distinct_day_experiences', 'no day repeats the same experience under a renamed stop', {
    fix: 'Replace the renamed duplicate with a genuinely different experience.',
  });
  add('traveler_access_fit', 'every day is built around places this traveller can actually reach', {
    fix: 'Anchor the flagged day on a place reachable the ordinary way; state any access requirement plainly rather than presenting it as a normal stop.',
  });

  if (HIKE_ASK.test(prompt)) {
    add('requested_hike', 'the walks/hikes the traveler asked for', {
      fix: 'Include an identifiable walk or hike from the trip facts.',
    });
  }
  // Phase 9C.1D.5B — EXPLICIT NAMED EXPERIENCES. The one exception to "the ledger
  // never remembers a place name": these names are the traveler's own words and
  // the MACHINE-resolved evidence name, never model-generated travel facts. They
  // exist precisely so a retry cannot shrink "Mist Trail" into "a hike".
  for (const requirement of namedExperienceRequirements || []) {
    if (requirement?.status !== 'resolved' || !NAMED_OBLIGATION_ID.test(requirement.obligationId || '')) continue;
    add(
      requirement.obligationId,
      `explicit traveler requirement: "${requirement.requestedName}" — the place named "${requirement.canonicalPlaceName}" in the trip facts`,
      {
        reasonCode: requirement.reasonCode,
        fix: `Include "${requirement.canonicalPlaceName}" as its own stop, named exactly that way${
          (requirement.equivalents || []).length
            ? ` (the same place is also officially listed as ${requirement.equivalents.map((e) => `"${e.placeName}"`).join(' or ')}; either name counts once)`
            : ''
        }. No other place replaces it — not a similar hike, walk, or viewpoint.`,
      },
    );
  }

  const golden = goldenHourWords(prompt);
  if (golden.length > 0 || GOLDEN_HOUR_ASK.test(prompt)) {
    const words = golden.length > 0 ? golden.join(' / ') : 'golden hour';
    add('requested_golden_hour', `the ${words} experience the traveler asked for`, {
      fix: `Include an identifiable ${words} stop from the trip facts, at the right time of day.`,
    });
  }
  if (SCENIC_ASK.test(prompt)) {
    add('requested_scenic', 'the scenery / viewpoints the traveler asked for', {
      fix: 'Include identifiable scenic viewpoints from the trip facts.',
    });
  }
  if (SCENIC_DRIVE_ASK.test(prompt)) {
    add('requested_scenic_drive', 'the scenic drive / scenic road the traveler asked for', {
      fix: 'Include an identifiable scenic drive, loop road, or scenic route from the trip facts — not a landmark that is merely scenic.',
    });
  }
  if (WILDLIFE_ASK.test(prompt)) {
    add('requested_wildlife', 'the wildlife the traveler asked for', {
      fix: 'Include an identifiable wildlife-oriented stop from the trip facts, not a visitor-center mention of wildlife.',
    });
  }
  if (GEOTHERMAL_ASK.test(prompt)) {
    add('requested_geothermal', 'the geyser / geothermal experience the traveler asked for', {
      fix: 'Include an identifiable geyser, hot spring, or geothermal feature from the trip facts.',
    });
  }
  if (PHOTOGRAPHY_ASK.test(prompt)) {
    add('requested_photography', 'the photography experience the traveler asked for', {
      fix: 'Include a stop that is actually a photography / sunrise / sunset experience, not generic scenery.',
    });
  }
  if (BEACH_ASK.test(prompt)) {
    add('requested_beach', 'the beach / coast experience the traveler asked for', {
      fix: 'Include an identifiable beach or coastal stop from the trip facts.',
    });
  }
  if (WATERFALL_ASK.test(prompt)) {
    add('requested_waterfall', 'the waterfall experience the traveler asked for', {
      fix: 'Include an identifiable waterfall from the trip facts.',
    });
  }
  if (HISTORIC_ASK.test(prompt)) {
    add('requested_historic', 'the historic / cultural experience the traveler asked for', {
      fix: 'Include an identifiable historic or cultural site from the trip facts.',
    });
  }
  if (
    SCENIC_DRIVE_ASK.test(prompt)
    || GEOTHERMAL_ASK.test(prompt)
    || WILDLIFE_ASK.test(prompt)
    || PHOTOGRAPHY_ASK.test(prompt)
    || BEACH_ASK.test(prompt)
    || WATERFALL_ASK.test(prompt)
    || HISTORIC_ASK.test(prompt)
    || SCENIC_ASK.test(prompt)
    || HIKE_ASK.test(prompt)
  ) {
    add('requested_experience_coverage', 'every explicitly requested experience dimension is genuinely represented', {
      fix: 'Keep each requested experience dimension in the plan when the trip facts include a matching candidate. Relaxed pacing may reduce stop count, not drop a requested category.',
    });
  }
  if (BACKUP_ASK.test(prompt)) {
    add('backup_plan', 'the backup / contingency plan the traveler asked for', {
      fix: 'Populate trip-level alternatives with an independent evidence-backed fallback.',
    });
  }

  // Traveler constraints carried on every attempt. No constructor code owns
  // these, so they are preserve-only: never "fix this", always "keep this".
  const pace = constraints?.pace ?? constraints?.preferences?.pace;
  if (typeof pace === 'string' && pace.trim()) {
    add('pace', `${pace.trim()} pacing`, { preserveOnly: true });
  }
  const fitness = constraints?.fitness ?? constraints?.preferences?.fitness;
  if (typeof fitness === 'string' && fitness.trim()) {
    add('fitness', `${fitness.trim()} physical effort`, { preserveOnly: true });
  }
  if (constraints?.avoidExposure === true) {
    add('exposure_eligibility', 'the no-exposure preference', {
      fix: 'Use only stops with confirmed low exposure.',
    });
  }
  const interests = constraints?.interests ?? constraints?.preferences?.interests;
  if (Array.isArray(interests) && interests.length > 0) {
    add('interests', `the stated interests (${interests.slice(0, 6).join(', ')})`, { preserveOnly: true });
  }
  return obligations;
}

function bounded(list) {
  return [...new Set(list)].filter((c) => typeof c === 'string' && SAFE_CODE.test(c)).slice(0, MAX_LIST);
}

/**
 * @param {Object} params
 * @param {Object|null} params.constraints  canonical structured constraints
 * @param {string} params.userPrompt        the traveler's own words
 */
function createRepairLedger({ constraints = null, userPrompt = '', namedExperienceRequirements = null } = {}) {
  const obligations = deriveObligations({ constraints, userPrompt, namedExperienceRequirements });
  /** Named obligations map from their own per-request reason code. */
  const obligationForCode = (code) => OBLIGATION_FOR_REASON_CODE[code]
    || [...obligations.values()].find((o) => o.reasonCode && o.reasonCode === code)?.id
    || null;
  /** Obligations some candidate has already demonstrated satisfiable. */
  const demonstrated = new Set();
  /** Obligations currently owed (cleared only when a later attempt satisfies them). */
  const outstanding = new Set();
  /** Obligations that were demonstrated and then lost again. */
  const regressedEver = new Set();
  /** Failing codes with no obligation mapping — carried verbatim so nothing is lost. */
  const unmappedCodes = new Set();
  const attempts = [];

  function labelFor(id) {
    return obligations.get(id)?.label || id;
  }

  /**
   * @param {Object} params
   * @param {number} params.attempt
   * @param {string[]} params.reasonCodes            what this attempt's validators emitted
   * @param {string[]} params.evaluatedObligations   which obligations actually got judged
   * @returns {{attempt:number, progress:'PROGRESS'|'NO_PROGRESS'|'REGRESSION',
   *   satisfied:string[], failed:string[], regressed:string[], discovered:string[]}}
   */
  function recordAttempt({ attempt = attempts.length + 1, reasonCodes = [], evaluatedObligations = [], requestedExperienceCoverage = null } = {}) {
    const codes = bounded(reasonCodes);
    const evaluated = new Set(
      bounded(evaluatedObligations).filter((id) => obligations.has(id))
    );

    const failed = new Set();
    for (const code of codes) {
      const id = obligationForCode(code);
      if (id && obligations.has(id)) {
        failed.add(id);
        // A code proves its obligation was judged even if the caller's
        // `evaluatedObligations` was conservative.
        evaluated.add(id);
      } else {
        unmappedCodes.add(code);
      }
    }

    const dimensionObligation = (dimension) => ({ hiking: 'requested_hike', viewpoint: 'requested_scenic' }[dimension]
      || `requested_${dimension}`);
    const unavailable = new Set((requestedExperienceCoverage?.unavailable || []).map(dimensionObligation));
    if (unavailable.size && !requestedExperienceCoverage.missing.length) unavailable.add('requested_experience_coverage');
    // Unavailable is a truthful limitation, not fulfillment or a repair target.
    for (const id of unavailable) {
      demonstrated.delete(id);
      outstanding.delete(id);
    }
    const satisfied = [...evaluated].filter((id) => !failed.has(id) && !unavailable.has(id));

    const regressed = [...failed].filter((id) => demonstrated.has(id));
    const clearedNow = satisfied.filter((id) => outstanding.has(id));
    const discovered = [...failed].filter((id) => !demonstrated.has(id) && !outstanding.has(id));

    for (const id of satisfied) {
      demonstrated.add(id);
      outstanding.delete(id);
    }
    for (const id of failed) {
      outstanding.add(id);
      if (regressed.includes(id)) regressedEver.add(id);
    }
    if (codes.length === 0) unmappedCodes.clear();

    // P0-L — losing an obligation an earlier candidate already met is a
    // REGRESSION whatever else improved. A satisfied/failed COUNT would call
    // the 2026-08-24 Canyonlands attempt 3 progress: it cleared two coverage
    // defects while putting every duration back to 0.
    let progress;
    if (regressed.length > 0) {
      progress = 'REGRESSION';
    } else if (clearedNow.length > 0 || (failed.size === 0 && evaluated.size > 0)) {
      progress = 'PROGRESS';
    } else {
      progress = 'NO_PROGRESS';
    }

    const record = Object.freeze({
      attempt,
      progress,
      satisfied: bounded(satisfied),
      failed: bounded([...failed]),
      regressed: bounded(regressed),
      discovered: bounded(discovered),
      ...(requestedExperienceCoverage ? {
        unavailable: bounded([...unavailable].filter((id) => obligations.has(id))),
        requestedExperienceCoverage: {
          represented: [...requestedExperienceCoverage.represented],
          missing: [...requestedExperienceCoverage.missing],
          unavailable: [...requestedExperienceCoverage.unavailable],
        },
      } : {}),
    });
    attempts.push(record);
    return record;
  }

  /**
   * P0-H — the bounded, validator-derived contract the next attempt receives.
   * Contains obligations and defect names only: no chain-of-thought, no model
   * prose, no invented travel facts.
   */
  function buildRepairContract() {
    const fix = [...outstanding].filter((id) => obligations.has(id));
    if (fix.length === 0 && unmappedCodes.size === 0) return '';

    // P0-F — the ORIGINAL contract, not the latest error. Everything the
    // traveler asked for that is not currently broken must be preserved,
    // whether or not a candidate has demonstrated it yet.
    const preserve = [...obligations.values()]
      .filter((o) => !fix.includes(o.id))
      .map((o) => {
        const note = regressedEver.has(o.id) || demonstrated.has(o.id)
          ? ' (an earlier attempt already got this right — do not lose it again)'
          : '';
        return `- ${o.label}${note}`;
      })
      .slice(0, MAX_LIST);

    const lines = [];
    if (preserve.length > 0) {
      lines.push('MUST PRESERVE:', ...preserve);
    }
    const fixLines = fix.map((id) => {
      const o = obligations.get(id);
      const regressedNote = regressedEver.has(id)
        ? ' A previous attempt already satisfied this and this one lost it; restore it without giving up anything else on this list.'
        : '';
      return `- ${o.label}.${o.fix ? ` ${o.fix}` : ''}${regressedNote}`;
    });
    for (const code of [...unmappedCodes].slice(0, MAX_LIST)) {
      fixLines.push(`- ${code}`);
    }
    if (fixLines.length > 0) {
      lines.push('MUST FIX:', ...fixLines.slice(0, MAX_LIST));
    }
    return lines.join('\n');
  }

  return {
    obligationIds: () => [...obligations.keys()],
    labelFor,
    recordAttempt,
    buildRepairContract,
    summary: () => attempts.map((a) => ({ ...a })),
    outstanding: () => [...outstanding],
    demonstrated: () => [...demonstrated],
  };
}

module.exports = {
  createRepairLedger,
  deriveObligations,
  OBLIGATION_FOR_REASON_CODE,
  HARD_OBLIGATIONS,
};
