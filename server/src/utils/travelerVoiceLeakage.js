'use strict';

/**
 * TRAVELER-VOICE LEAKAGE SCANNER (P1-2/P1-3 presentation boundary).
 *
 * A pure, offline detector for internal/machine vocabulary that must never
 * reach a traveler-visible field — intro, narrativeSections[].markdown,
 * day.label, stop.note, stop.why, stop.alternatives[].note, patch response.
 *
 * NOT wired into generation, validation, or repair. This module changes no
 * planning, evidence, validation, or repair behavior — it exists so tests can
 * pin the presentation boundary against real captured output and catch a
 * regression before it reaches a traveler, the way the fixed schema
 * descriptions and instruction text (itineraryToolSchema.js,
 * dayContainedAnchorRepair.js, dayContainedCoverageRepair.js,
 * legalStopSubstitutionRepair.js) are meant to prevent it at the source.
 *
 * Some phrases below have a legitimate ordinary-English reading ("repair",
 * "coverage", "obligation") — this scanner still flags them, because the
 * acceptance bar is "unless ordinary English meaning genuinely applies", a
 * human judgment call, not something a regex can decide. Treat a match as
 * "go read this sentence", not an automatic defect.
 */

const BANNED_PATTERNS = Object.freeze([
  // Literal leaked phrases (2026-08-31 product audit, docs/plan-ai-audit-2026-08-31).
  { id: 'requires_no_changes', re: /requires no changes/i },
  { id: 'have_not_invented', re: /I have not invented/i },

  // Internal system vocabulary — how Trailie's own machinery talks about a
  // plan, never how a travel companion talks about a trip.
  { id: 'canonical_plan', re: /\bcanonical (?:itinerary|plan)\b/i },
  { id: 'evidence_bundle', re: /\b(?:frozen )?evidence bundle\b/i },
  { id: 'existing_stop', re: /\bexisting stops?\b/i },
  { id: 'replacement_experience', re: /\breplacement experience\b/i },
  { id: 'validator', re: /\bvalidators?\b/i },
  { id: 'repair', re: /\brepairs?(?:ed|ing)?\b/i },
  { id: 'obligation', re: /\bobligations?\b/i },
  { id: 'coverage', re: /\bcoverage\b/i },
  { id: 'constraint_eligibility', re: /\bconstraint eligib\w*\b/i },
  { id: 'candidate', re: /\b(?:compatible |eligible )?candidates?\b/i },
  { id: 'supplied_information', re: /\bsupplied information\b/i },
  { id: 'evidence_supported', re: /\bevidence[- ]supported\b/i },

  // Raw identifiers/tool vocabulary that should never survive into prose.
  { id: 'place_ref', re: /\bplaceRef\b/i },
  { id: 'stop_ref', re: /\bstopRef\b/i },
  { id: 'day_ref', re: /\bdayRef\b/i },
  { id: 'stop_id', re: /\bstopId\b/i },
  { id: 'patch_mechanics', re: /\b(?:patch_itinerary|apply the patch|bounded (?:patch|operation))\b/i },
]);

/**
 * Scan one string. Returns the matches found (empty array = clean).
 * @param {string} text
 * @returns {{ id: string, match: string }[]}
 */
function scanTextForVoiceLeakage(text) {
  const source = typeof text === 'string' ? text : '';
  if (!source.trim()) return [];
  const hits = [];
  for (const { id, re } of BANNED_PATTERNS) {
    const match = source.match(re);
    if (match) hits.push({ id, match: match[0] });
  }
  return hits;
}

/**
 * Walk a `create_itinerary`/patch-shaped plan object and collect every
 * traveler-visible string field, tagged with where it came from.
 * Accepts the loose shapes seen across captures (`plan.days`, `.day`
 * vs `.dayNumber`, patch `response` at the top level).
 */
function collectTravelerVisibleFields(plan) {
  const out = [];
  if (!plan || typeof plan !== 'object') return out;
  if (typeof plan.intro === 'string') out.push({ field: 'intro', text: plan.intro });
  if (typeof plan.response === 'string') out.push({ field: 'response', text: plan.response });
  for (const section of Array.isArray(plan.narrativeSections) ? plan.narrativeSections : []) {
    if (typeof section?.markdown === 'string') out.push({ field: 'narrativeSections[].markdown', text: section.markdown });
  }
  for (const alt of Array.isArray(plan.alternatives) ? plan.alternatives : []) {
    if (typeof alt?.note === 'string') out.push({ field: 'alternatives[].note', text: alt.note });
  }
  for (const day of Array.isArray(plan.days) ? plan.days : []) {
    const dayNumber = day?.dayNumber ?? day?.day ?? '?';
    if (typeof day?.label === 'string') out.push({ field: `days[${dayNumber}].label`, text: day.label });
    for (const stop of Array.isArray(day?.stops) ? day.stops : []) {
      if (typeof stop?.note === 'string') out.push({ field: `days[${dayNumber}].stops[${stop.name || '?'}].note`, text: stop.note });
      if (typeof stop?.why === 'string') out.push({ field: `days[${dayNumber}].stops[${stop.name || '?'}].why`, text: stop.why });
      for (const alt of Array.isArray(stop?.alternatives) ? stop.alternatives : []) {
        if (typeof alt?.note === 'string') {
          out.push({ field: `days[${dayNumber}].stops[${stop.name || '?'}].alternatives[].note`, text: alt.note });
        }
      }
    }
  }
  return out;
}

/**
 * Scan an entire plan/patch-response object. Returns every hit with its
 * field path, so a failing test can name exactly what leaked and where.
 */
function scanPlanForVoiceLeakage(plan) {
  const hits = [];
  for (const { field, text } of collectTravelerVisibleFields(plan)) {
    for (const hit of scanTextForVoiceLeakage(text)) {
      hits.push({ ...hit, field, text });
    }
  }
  return hits;
}

module.exports = {
  BANNED_PATTERNS,
  scanTextForVoiceLeakage,
  collectTravelerVisibleFields,
  scanPlanForVoiceLeakage,
};
