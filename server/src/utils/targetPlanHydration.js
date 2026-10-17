'use strict';

/**
 * WP-TU Phase 4 Task 10B/12 — single-document target-plan hydration.
 *
 * Mirrors `prepareChatContext`'s own `TripPlan.findById(tripId)` pattern
 * (ai.js), but ADDS the ownership check that lookup does not need (that
 * caller trusts `tripId` alone because it is the traveler's OWN active trip
 * id). This fetch is for a DIFFERENT, historical trip a resolved
 * `targetTripId` points at, so ownership is not optional: the resolver's
 * `candidatePlans` were themselves scoped to one `userId`
 * (`candidatePlanDiscovery.js`), and this fetch must honor the same scope
 * even though it addresses one document by id rather than a list.
 *
 * Pure DATA RETRIEVAL — no target decision happens here (that is Task 9's
 * `resolveTargetTripId`) and no interpretation of the plan happens here
 * either. Never throws; every failure resolves to `{ ok: false, reason }`
 * so the caller's fail-closed gate has a stable contract to branch on.
 *
 * WP-TU Phase 4 Task 12 — ALSO resolves the target's REAL current canonical
 * identity (`priorCanonicalIdentity`), reusing the IDENTICAL precedence
 * `resolveCanonicalWriteTarget` (tripWriteContract.js) already established
 * for validating an INCOMING write, applied here to reading a stored trip's
 * CURRENT state instead: if the stored plan itself carries a `responseId`,
 * that is authoritative and the conversation is never consulted; only when
 * the plan carries no identity does the conversation's
 * `latestCanonicalAssistantTarget` become authoritative. This is what fixed
 * Task 11's discovered regression — the target-write version projection
 * (`projectTargetPlanVersion`, trailieV2ExecutionService.js) was previously
 * fed an always-0 baseline whenever a trip's real identity lived on its
 * conversation instead of its plan (true for every trip the V2 pipeline
 * ever built, since that pipeline never stamps `plan.responseVersion`).
 */

const { latestCanonicalAssistantTarget } = require('../validation/tripWriteContract');

const ELIGIBLE_STATUS = 'active';

/**
 * Same malformed-identity shape `resolveCanonicalWriteTarget` already
 * refuses (`plan_identity_incomplete`): a plan carrying half an identity
 * (`responseId` present, `responseVersion` not a finite number) is
 * malformed, not "no identity" — left unchecked it would silently fall
 * through to the conversation and use a possibly-unrelated version number.
 */
function isMalformedPlanIdentity(plan) {
  return Boolean(plan)
    && typeof plan.responseId === 'string'
    && plan.responseId.length > 0
    && !Number.isFinite(plan.responseVersion);
}

/**
 * The exact `resolveCanonicalWriteTarget` precedence (tripWriteContract.js
 * ~line 290-298), applied to a STORED trip's current state rather than an
 * incoming write: plan-identity-present wins outright (conversation never
 * consulted, even if present and different); otherwise the conversation's
 * latest canonical assistant message is authoritative; a truly virgin
 * target (neither carries identity) resolves to `null`, which the caller
 * floors at version 0 (so the next write becomes version 1) — unchanged
 * fallback behavior for that one specific case, just no longer conflated
 * with "the conversation says version 7".
 */
function resolveStoredCanonicalIdentity({ plan, conversation }) {
  if (plan && typeof plan.responseId === 'string' && plan.responseId.length > 0) {
    return {
      responseId: plan.responseId,
      responseVersion: plan.responseVersion,
      responseRevision: plan.responseRevision ?? null,
      itineraryHash: plan.itineraryHash ?? null,
    };
  }
  return latestCanonicalAssistantTarget(conversation);
}

async function loadTargetPlanById({ tripId, userId, logPrefix = '[AI]' } = {}) {
  if (!tripId || !userId) {
    return { ok: false, reason: 'missing_identifier' };
  }
  try {
    // eslint-disable-next-line global-require
    const TripPlan = require('../models/TripPlan');
    const doc = await TripPlan.findById(tripId)
      .select('userId parkCode parkName title formData planningState plan status conversation')
      .lean();
    if (!doc) {
      return { ok: false, reason: 'not_found' };
    }
    if (!doc.userId || String(doc.userId) !== String(userId)) {
      return { ok: false, reason: 'wrong_owner' };
    }
    if ((doc.status || ELIGIBLE_STATUS) !== ELIGIBLE_STATUS) {
      return { ok: false, reason: 'ineligible_status' };
    }
    if (!doc.plan?.days?.length) {
      return { ok: false, reason: 'no_canonical_plan' };
    }
    if (isMalformedPlanIdentity(doc.plan)) {
      // Mirrors resolveCanonicalWriteTarget's own `plan_identity_incomplete`
      // handling for this exact shape — fail closed rather than guess.
      return { ok: false, reason: 'plan_identity_incomplete' };
    }
    return {
      ok: true,
      tripId: String(doc._id),
      plan: doc.plan,
      parkCode: doc.parkCode || null,
      parkName: doc.parkName || null,
      title: doc.title || null,
      // WP-TU Phase 4 Task 12 — the target's REAL current canonical
      // identity, or `null` for a truly virgin target (neither plan nor
      // conversation carries one).
      priorCanonicalIdentity: resolveStoredCanonicalIdentity({ plan: doc.plan, conversation: doc.conversation }),
    };
  } catch (err) {
    console.warn(`${logPrefix} target-plan hydration failed:`, err.message);
    return { ok: false, reason: 'error' };
  }
}

module.exports = { loadTargetPlanById };
