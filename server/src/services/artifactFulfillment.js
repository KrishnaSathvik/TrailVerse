'use strict';

/**
 * Deterministic artifact fulfillment.
 *
 * A turn "passed" used to mean "the model produced text that survived truth and
 * safety validation". That is not the same thing as "the artifact the traveler
 * asked for actually exists". A required `itinerary_patch` terminated as plain
 * prose with `hasPlan: false` and validation still returned PASS: the traveler
 * read a paragraph describing an updated trip while the canonical plan on
 * screen stayed stale. This module closes that silent contract failure.
 *
 * Rules:
 *   itinerary       + required -> PASS only with a valid resulting canonical plan.
 *   itinerary_patch + required -> PASS only with a prior plan identified, a
 *                                 mutation applied, a resulting canonical plan,
 *                                 valid revision/identity ownership, and state
 *                                 that actually reflects the requested mutation.
 *   anything        + optional -> a canonical plan is not required.
 *
 * Prose alone is never fulfillment of a required mutation.
 */

const { isDraftPlan, isAcceptedCanonicalPlan } = require('../utils/canonicalPlanAcceptance');

const FULFILLMENT_REASONS = Object.freeze([
  'fulfilled',
  'not_required',
  'canonical_plan_missing',
  'canonical_plan_invalid',
  'prior_plan_missing',
  'patch_not_applied',
  'patch_produced_no_change',
  'plan_identity_lost',
]);

function isValidCanonicalPlan(plan) {
  if (!plan || typeof plan !== 'object') return false;
  if (isDraftPlan(plan)) return false;
  if (!Array.isArray(plan.days) || plan.days.length === 0) return false;
  return plan.days.every((day) => day && typeof day === 'object');
}

function isPatchablePriorPlan(plan) {
  return isAcceptedCanonicalPlan(plan);
}

function planIdentity(plan) {
  if (!plan || typeof plan !== 'object') return null;
  return plan.planId || plan.itineraryId || plan.id || null;
}

/**
 * @returns {{ requested: string|null, required: boolean, fulfilled: boolean,
 *             degraded: boolean, reasonCode: string }}
 */
function validateArtifactFulfillment({
  requestedArtifact = null,
  structurePolicy = 'optional',
  priorCanonicalPlan = null,
  resultingCanonicalPlan = null,
  patchResult = null,
  presentation = null,
} = {}) {
  const canonicalArtifact = requestedArtifact === 'itinerary' || requestedArtifact === 'itinerary_patch';
  const required = structurePolicy === 'required' && canonicalArtifact;

  const base = {
    requested: requestedArtifact,
    required,
    fulfilled: true,
    degraded: false,
    reasonCode: 'not_required',
  };

  if (!required) {
    // Optional / preferred: a canonical plan is welcome but never obligatory.
    return Object.freeze(base);
  }

  const fail = (reasonCode) => Object.freeze({
    ...base,
    fulfilled: false,
    degraded: true,
    reasonCode,
  });

  if (requestedArtifact === 'itinerary') {
    if (!resultingCanonicalPlan) return fail('canonical_plan_missing');
    if (!isValidCanonicalPlan(resultingCanonicalPlan)) return fail('canonical_plan_invalid');
    return Object.freeze({ ...base, reasonCode: 'fulfilled' });
  }

  // requestedArtifact === 'itinerary_patch'
  if (!isValidCanonicalPlan(priorCanonicalPlan)) return fail('prior_plan_missing');
  if (!patchResult || patchResult.applied !== true) return fail('patch_not_applied');
  if (!resultingCanonicalPlan) return fail('canonical_plan_missing');
  if (!isValidCanonicalPlan(resultingCanonicalPlan)) return fail('canonical_plan_invalid');

  // Revision / identity ownership: the mutation must be a mutation OF the prior
  // plan, not a replacement that quietly discards it.
  const priorId = planIdentity(priorCanonicalPlan);
  const nextId = planIdentity(resultingCanonicalPlan);
  if (priorId && nextId && priorId !== nextId) return fail('plan_identity_lost');

  // The changed state must reflect the requested mutation. An "applied" patch
  // that touched nothing has not fulfilled anything.
  const touched = Array.isArray(patchResult.touchedDayNumbers) ? patchResult.touchedDayNumbers : [];
  const changed = touched.length > 0
    || JSON.stringify(priorCanonicalPlan.days) !== JSON.stringify(resultingCanonicalPlan.days);
  if (!changed) return fail('patch_produced_no_change');

  void presentation;
  return Object.freeze({ ...base, reasonCode: 'fulfilled' });
}

/**
 * Traveler-facing copy for a required mutation that could NOT be applied.
 *
 * Ordinary prose must never imply the saved trip changed. This says plainly
 * that it did not, keeps the prior plan intact, and still delivers the advice
 * the model produced.
 *
 * TWO SHAPES, ONE CONTRACT. When the turn still renders the (unchanged) plan
 * beneath the message, the copy points at it. When the turn terminated without
 * rendering any plan — a ladder that exhausted, a budget stop, an unavailable
 * provider, exhausted validation — there is no "plan below" to point at, so the
 * copy names the SAVED itinerary instead. Both say the same load-bearing thing
 * and neither may ever imply the update succeeded.
 *
 * @param {string} modelProse advice to append. Callers on a failure terminal
 *        pass nothing: this message states only that the saved plan is
 *        unchanged, which is safe to return even after a truth/safety failure.
 *        Any ADDITIONAL recommendation must have cleared normal prose rules
 *        before it reaches here.
 * @param {{ planShown?: boolean }} [options]
 */
const FAILURE_CATEGORY_LEAD = Object.freeze({
  repetition_unresolved: 'I could not give the days enough distinct experiences from the available place information, so no new plan was saved.',
  day_value_unresolved: 'I could not build a worthwhile experience for every day from the available place information without adding filler, so no new plan was saved.',
  target_unresolved: 'I need a clearer target before changing the trip, so your saved plan has not been changed.',
  temporal_unresolved: 'I could not safely map that day reference onto your saved trip, so your plan has not been changed.',
  accessibility_unresolved: 'I could not confirm an accessible replacement from the available place information, so your saved plan has not been changed.',
  exposure_unresolved: 'I could not confirm a low-exposure replacement from the available place information, so your saved plan has not been changed.',
  no_eligible_replacement: 'I could not find a suitable replacement that still meets your constraints, so your saved plan has not been changed.',
  closure_conflict: 'I could not safely reconcile that access change with the rest of the day, so your saved plan has not been changed.',
  provider_unavailable: 'A required live data source was unavailable, so your saved plan has not been changed.',
  plan_unreconciled: 'I could not safely reconcile that edit with your saved itinerary, so your current plan has not been changed.',
});

function failureCategoryFromCodes(reasonCodes = []) {
  const codes = new Set(reasonCodes || []);
  if (codes.has('excessive_trip_repetition')) return 'repetition_unresolved';
  if (codes.has('insufficient_day_coverage')) return 'day_value_unresolved';
  if (codes.has('temporal_target_unresolved')) return 'temporal_unresolved';
  if (codes.has('refinement_target_unresolved') || codes.has('action_booking_unresolved') || codes.has('action_stop_unresolved')) {
    return 'target_unresolved';
  }
  if ([...codes].some((c) => /wheelchair|accessibility|stairs|pets|mobility/.test(c))) return 'accessibility_unresolved';
  if ([...codes].some((c) => /exposure|constraint_eligibility_unknown/.test(c))) return 'exposure_unresolved';
  if (codes.has('no_eligible_repair_candidate') || codes.has('repair_evidence_catalog_unavailable')) {
    return 'no_eligible_replacement';
  }
  if ([...codes].some((c) => /closure|closed/.test(c))) return 'closure_conflict';
  if ([...codes].some((c) => /provider|google_authorization|unavailable/.test(c))) return 'provider_unavailable';
  return 'plan_unreconciled';
}

function buildArtifactNotAppliedMessage(modelProse = '', { planShown = true, reasonCodes = [], failureCategory = null } = {}) {
  const advice = String(modelProse || '').trim();
  const category = failureCategory || failureCategoryFromCodes(reasonCodes);
  const categorized = FAILURE_CATEGORY_LEAD[category];
  const lead = categorized
    || (planShown
      ? "I couldn't update the saved plan, so the plan below has not been changed."
      : "I couldn't apply that change to your saved itinerary, so your current plan has not been changed.");
  if (!advice) {
    return categorized ? lead : `${lead} Please try that change again.`;
  }
  return `${lead} Here's the adjustment I'd make:\n\n${advice}`;
}

module.exports = {
  FULFILLMENT_REASONS,
  buildArtifactNotAppliedMessage,
  failureCategoryFromCodes,
  isValidCanonicalPlan,
  validateArtifactFulfillment,
};
