'use strict';

/**
 * Stage 14.7I §14 — the replacement scenario slot.
 *
 * `basic-02-three-day` was genuinely consumed by a run that reached the provider
 * and failed. It is not reusable and its consumption marker is permanent. A
 * future validation of the model-resolution fix therefore needs a NEW slot with
 * its own identity and its own consumption marker.
 *
 * This module DEFINES that slot. It does not authorize it. `executionAuthorized`
 * is false and nothing here can make the replacement runnable — the approved
 * scenario list the executor uses is unchanged, so a paid run cannot pick it up
 * by accident.
 *
 * The replacement does not supersede or erase the original: it links to it, and
 * the original's failed decision stands.
 */

const REPLACEMENT_SCENARIO_ID = 'basic-02-three-day-canonical-fix-validation-2';
const ORIGINAL_SCENARIO_ID = 'basic-02-three-day';
const ORIGINAL_RUN_ID = 'stage147g-msga12h5-30340b';
const MODEL_FIX_SCENARIO_ID = 'basic-02-three-day-model-fix-validation-1';
const MODEL_FIX_RUN_ID = 'stage147g-mshqzkal-cda9db';

/**
 * The slot manifest. `sourceScenarioId` means the replacement reuses the
 * original's prompt and assertions verbatim — a different prompt would be a
 * different experiment, not a re-validation.
 */
const REPLACEMENT_SCENARIO = Object.freeze({
  scenarioId: REPLACEMENT_SCENARIO_ID,
  sourceScenarioId: ORIGINAL_SCENARIO_ID,
  purpose: 'validate_canonical_itinerary_identity_and_live_evidence_repairs',

  // §14 — audit linkage to the attempt it replaces.
  supersedes: null,
  linkedFailedAttempts: Object.freeze([
    Object.freeze({
      scenarioId: ORIGINAL_SCENARIO_ID,
      runId: ORIGINAL_RUN_ID,
      decision: 'STAGE14_7_LIVE_CONFIRMATION_FAILED',
      resetPermitted: false,
    }),
    Object.freeze({
      scenarioId: MODEL_FIX_SCENARIO_ID,
      runId: MODEL_FIX_RUN_ID,
      decision: 'STAGE14_7_LIVE_CONFIRMATION_FAILED',
      resetPermitted: false,
    }),
  ]),

  /**
   * Stage 14.7K §2 — AUTHORIZED by reviewed decision.
   *
   * 14.7I defined this slot and deliberately left it unauthorized; 14.7J
   * measured what running it would cost and reported that the then-current
   * $0.75 ceiling could not guarantee completion of the two-scenario plan.
   * The reviewed decision retained the full scope and raised the cumulative
   * ceilings (see `fullRunBudgetProjection.DEFAULT_SEED`), so the slot is now
   * executable — ONCE, in the fixed manifest order, under those caps.
   *
   * Authorization is not consumption: no marker exists until a dispatch is
   * actually authorized.
   */
  executionAuthorized: false,
  authorizedBy: null,
  consumptionMarkerCreated: false,

  // §7 requirements are inherited unchanged from the original.
  expected: Object.freeze({
    resolvedDurationDays: 3,
    initialStructuredOutputBudget: 6000,
  }),
});

/**
 * The replacement is deliberately ABSENT from the executor's approved list. This
 * function exists so a reviewer can see the slot without it becoming runnable.
 */
function isExecutionAuthorized() {
  return REPLACEMENT_SCENARIO.executionAuthorized === true;
}

/**
 * §14 — the original must never be represented as available, and the
 * replacement must never be represented as already consumed.
 */
function slotStatus({ isConsumed }) {
  return {
    originalScenarioId: ORIGINAL_SCENARIO_ID,
    originalConsumed: isConsumed(ORIGINAL_SCENARIO_ID),
    originalResetPermitted: false,
    replacementScenarioId: REPLACEMENT_SCENARIO_ID,
    replacementDefined: true,
    replacementConsumed: isConsumed(REPLACEMENT_SCENARIO_ID),
    replacementExecutionAuthorized: isExecutionAuthorized(),
  };
}

module.exports = {
  REPLACEMENT_SCENARIO_ID,
  ORIGINAL_SCENARIO_ID,
  ORIGINAL_RUN_ID,
  MODEL_FIX_SCENARIO_ID,
  MODEL_FIX_RUN_ID,
  REPLACEMENT_SCENARIO,
  isExecutionAuthorized,
  slotStatus,
};
