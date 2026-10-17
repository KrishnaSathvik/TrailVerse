'use strict';

const { hashPayload } = require('../utils/canonicalResponse');
const { extractStoredItineraryData } = require('../utils/storedRevisionValidation');
const { validateTripWriteCandidate } = require('../validation/tripWriteContract');
const {
  evaluateTripSchemaVersion,
  stampTripSchemaVersion,
} = require('../../../shared/tripSchemaVersion.cjs');

/**
 * Sync the owning assistant turn's itineraryHash (and canonicalPlan body) so
 * validateTripWriteCandidate's plan↔message identity check passes. Does not
 * append user/assistant turns — only updates the existing owning message.
 */
function syncConversationItineraryIdentity(conversation, plan) {
  if (!Array.isArray(conversation) || !plan?.responseId) {
    return Array.isArray(conversation) ? conversation : [];
  }
  const itineraryData = extractStoredItineraryData(plan);
  return conversation.map((message) => {
    if (!message || message.role !== 'assistant' || message.responseId !== plan.responseId) {
      return message;
    }
    return {
      ...message,
      itineraryHash: plan.itineraryHash,
      ...(message.canonicalPlan != null ? { canonicalPlan: itineraryData } : {}),
      hasItinerary: true,
    };
  });
}

/**
 * Prepare a manual plan write that shares TripPlan write-candidate validation
 * and CAS semantics with AI commits, without fabricating chat turns or going
 * through response-turn idempotency (prepareCanonicalStoreCommit).
 *
 * @returns {{ ok: true, plan, conversation } | { ok: false, status, code }}
 */
function prepareManualPlanCommit({ snapshot, plan, targetTripId = null } = {}) {
  if (!snapshot || !plan || !Array.isArray(plan.days)) {
    return { ok: false, status: 400, code: 'manual_mutation_invalid' };
  }

  const schema = evaluateTripSchemaVersion(plan);
  if (!schema.ok) {
    return { ok: false, status: 400, code: schema.code };
  }

  const stamped = stampTripSchemaVersion(plan);
  const stored = snapshot.plan && typeof snapshot.plan === 'object' ? snapshot.plan : {};
  const itineraryHash = hashPayload(extractStoredItineraryData(stamped));

  const nextPlan = {
    ...stamped,
    // Preserve AI response identity; only the itinerary body/hash changes.
    responseId: stored.responseId,
    responseVersion: stored.responseVersion,
    contentHash: stored.contentHash,
    responseRevision: stored.responseRevision,
    lifecycleStatus: stored.lifecycleStatus,
    previousRevision: stored.previousRevision,
    itineraryReadyAt: stored.itineraryReadyAt,
    proseReadyAt: stored.proseReadyAt,
    itineraryHash,
  };

  const conversation = syncConversationItineraryIdentity(
    snapshot.conversation || [],
    nextPlan,
  );

  const verdict = validateTripWriteCandidate({
    operation: 'update',
    existingTrip: snapshot,
    incomingConversation: conversation,
    incomingPlan: nextPlan,
    targetTripId,
  });
  if (!verdict.ok) {
    return { ok: false, status: 400, code: verdict.code };
  }

  return { ok: true, plan: nextPlan, conversation, verdict };
}

module.exports = {
  prepareManualPlanCommit,
  syncConversationItineraryIdentity,
};
