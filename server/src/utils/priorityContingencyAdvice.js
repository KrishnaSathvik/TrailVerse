'use strict';

/**
 * Distinguishes "plan me a day" from "what's a good backup plan if parking fails".
 * Shared by intent, evidence planning, and generation so the three boundaries
 * cannot drift.
 *
 * Access contingency is owned by the constraint-family resolver: inaccessibility
 * plus an alternative-ask. Downstream layers consume that fact instead of
 * re-scanning "backup plan" next to "parking".
 */

const { resolveAccessContingency } = require('./constraintFamilies');

const CONTINGENCY_PLAN_PHRASE =
  /\b(?:backup|contingency|alternative|fallback)\s+plans?\b|\bplans?\s+b\b/gi;

const ITINERARY_SIGNAL =
  /\b(plan|itinerary|day[- ]?by[- ]?day|build (?:me )?(?:a )?(?:trip|plan)|road trip|day\s*\d+)\b/i;

function stripContingencyPlanPhrases(text) {
  return String(text || '').replace(CONTINGENCY_PLAN_PHRASE, ' ');
}

function hasExplicitItinerarySignal(text) {
  return ITINERARY_SIGNAL.test(stripContingencyPlanPhrases(text));
}

function isAccessParkingDecision(text) {
  const family = resolveAccessContingency(text);
  if (!family.isAccessContingency) return false;
  return family.inaccessibility === 'parking_full'
    || family.inaccessibility === 'access_unavailable'
    || family.inaccessibility === 'shuttle_fail'
    || family.inaccessibility === 'closed';
}

function isPriorityContingencyAdvice(text) {
  const message = String(text || '');
  if (hasExplicitItinerarySignal(message)) return false;
  const family = resolveAccessContingency(message);
  if (!family.isAccessContingency) return false;
  return /\b(priorit(?:y|ize)|what should i\b)/i.test(message);
}

module.exports = {
  hasExplicitItinerarySignal,
  isAccessParkingDecision,
  isPriorityContingencyAdvice,
  stripContingencyPlanPhrases,
};
