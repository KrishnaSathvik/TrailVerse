'use strict';

/**
 * Phase 9C.1F.1 — durable traveler transport constraint (trip level).
 *
 * The ONE question this contract answers for later routing phases:
 *   "May Trailie assume a driving / private-vehicle transfer for this trip?"
 *
 *   transportation.drivingPolicy        'prohibited' | null
 *   transportation.drivingPolicyReason  one of DRIVING_POLICY_REASONS | null
 *
 * `null` means "nothing explicit was said" — NOT "driving allowed". The pre-
 * existing availability fields stay independent and keep their meaning:
 *   transportation.mode        'fly' | 'drive' | null  (how the trip is reached)
 *   transportation.rentalCar   true | false | null     (a car is / is not available)
 * Availability never implies a stop-level edge mode; a prohibition never
 * establishes the positive mode of any edge. `day.travelEdges` is untouched.
 *
 * Reconciliation (deterministic, idempotent) — a prohibition must not coexist
 * with an unconditional drive assumption in the same state object:
 *   drivingPolicy=prohibited  ⇒ mode 'drive' → null   ('fly' is left alone)
 *   reason no_car             ⇒ rentalCar true → false (the traveler said so)
 *   any other reason          ⇒ rentalCar true → null  (withdrawn, not falsified)
 */

const DRIVING_POLICY_VALUES = Object.freeze(['prohibited']);
const DRIVING_POLICY_REASONS = Object.freeze([
  'no_car',
  'no_driving',
  'shuttle_only',
  'walking_only',
  'bike_only',
]);

const POLICY_SET = new Set(DRIVING_POLICY_VALUES);
const REASON_SET = new Set(DRIVING_POLICY_REASONS);

function normalizeDrivingPolicyFields(raw) {
  const policy = raw && POLICY_SET.has(raw.drivingPolicy) ? raw.drivingPolicy : null;
  const reason = policy && raw && REASON_SET.has(raw.drivingPolicyReason)
    ? raw.drivingPolicyReason
    : null;
  return { drivingPolicy: policy, drivingPolicyReason: reason };
}

/** Mutates `transportation` in place; returns it. */
function reconcileTransportationDrivingPolicy(transportation) {
  if (!transportation || typeof transportation !== 'object') return transportation;
  if (transportation.drivingPolicy !== 'prohibited') {
    if (transportation.drivingPolicyReason !== undefined) transportation.drivingPolicyReason = null;
    return transportation;
  }
  if (transportation.mode === 'drive') transportation.mode = null;
  if (transportation.rentalCar === true) {
    transportation.rentalCar = transportation.drivingPolicyReason === 'no_car' ? false : null;
  }
  return transportation;
}

// ── Phase 9C.1F.2 — edge-level drive intent authorization ────────────────────
//
// `drive` is the only V1 positive edge mode. Unknown is the field being ABSENT
// (no literal 'unknown'). The model proposes it per edge; the server keeps it
// only when the DURABLE 9C.1F.1 policy authorizes. Availability is never
// turned into intent here — that would make every transfer a car transfer.
//
// INVARIANT FOR PHASE 9C.2 (route dispatch): a persisted `modeIntent:'drive'`
// is planning intent, never routing authority on its own. Dispatch must always
// re-check `canAuthorizeDrivingIntent(currentPlanningState.transportation)`.
const TRAVEL_EDGE_MODE_INTENTS = Object.freeze(['drive']);
const MODE_INTENT_SET = new Set(TRAVEL_EDGE_MODE_INTENTS);

/**
 * Pure. Reads ONLY `planningState.transportation` fields — never
 * `tripScope.transportMode` (broad regex, says drive for "no driving") and
 * never raw traveler text.
 */
function canAuthorizeDrivingIntent(transportation) {
  if (!transportation || typeof transportation !== 'object') return false;
  if (transportation.drivingPolicy === 'prohibited') return false; // absolute veto
  if (transportation.rentalCar === false) return false;            // conservative
  return transportation.mode === 'drive' || transportation.rentalCar === true;
}

/**
 * The mode a model-authored edge is allowed to keep, or null (= omit the field).
 * Only exactly 'drive', and only when authorized by the supplied policy.
 */
function authorizeTravelEdgeModeIntent(rawModeIntent, transportation) {
  if (typeof rawModeIntent !== 'string' || !MODE_INTENT_SET.has(rawModeIntent)) return null;
  return canAuthorizeDrivingIntent(transportation) ? rawModeIntent : null;
}

module.exports = {
  TRAVEL_EDGE_MODE_INTENTS,
  canAuthorizeDrivingIntent,
  authorizeTravelEdgeModeIntent,
  DRIVING_POLICY_VALUES,
  DRIVING_POLICY_REASONS,
  normalizeDrivingPolicyFields,
  reconcileTransportationDrivingPolicy,
};
