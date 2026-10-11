'use strict';

const { buildPlanDocument } = require('../utils/trailiePipelineUtils');
const { validateTripWriteCandidate } = require('../validation/tripWriteContract');
const { resolveCanonicalResponsePersistence, latestCanonicalAssistantIdentity } = require('../utils/canonicalPersistence');

/**
 * Shared model-first commit contract (docs/trailie-architecture.md Step 3).
 *
 * Guest and authenticated stores differ only in durable ownership/storage.
 * Both must run the same write-candidate + response-identity checks before
 * persisting. Mutation trust (validateSimpleMutation) stays upstream in the runtime.
 */

function buildAssistantMessage({ response, mutation, id }) {
  return {
    ...(id != null ? { id } : {}),
    role: 'assistant',
    content: response.content,
    responseId: response.responseId,
    responseVersion: response.responseVersion,
    contentHash: response.contentHash,
    itineraryHash: response.itineraryHash,
    provider: response.provider,
    model: response.model,
    hasItinerary: Boolean(mutation?.plan),
    ...(response.artifactStatus ? { artifactStatus: response.artifactStatus } : {}),
    ...(response.presentation ? { presentation: response.presentation } : {}),
    ...(mutation?.plan ? { canonicalPlan: response.itineraryData } : {}),
  };
}

function buildIncomingPlan({ snapshot, response, mutation }) {
  if (!mutation?.plan) return undefined;
  const plan = buildPlanDocument({
    itineraryData: mutation.plan,
    identity: response,
    parkName: snapshot.parkName,
    parkCode: snapshot.parkCode,
  });
  // A patch carries old plan metadata. It cannot override this turn's identity.
  Object.assign(plan, {
    responseId: response.responseId,
    responseVersion: response.responseVersion,
    contentHash: response.contentHash,
    itineraryHash: response.itineraryHash,
  });
  return plan;
}

function buildIncomingConversation({ snapshot, response, message, mutation }) {
  const old = snapshot.conversation || [];
  const nextId = Math.max(0, ...old.map(m => Number(m.id) || 0)) + 1;
  const user = { id: nextId, role: 'user', content: message };
  const assistant = buildAssistantMessage({ response, mutation, id: nextId + 1 });
  return { conversation: [...old, user, assistant], old, plan: buildIncomingPlan({ snapshot, response, mutation }) };
}

/**
 * Prepare and validate a canonical turn write shared by TripPlan and guest stores.
 *
 * @returns {{ ok: true, conversation, plan, old } | { ok: false, status, code }}
 */
function prepareCanonicalStoreCommit({
  snapshot,
  response,
  message,
  mutation,
  operation,
  targetTripId = null,
} = {}) {
  if (!snapshot || !response || typeof message !== 'string') {
    return { ok: false, status: 400, code: 'canonical_commit_invalid' };
  }
  const { conversation, old, plan } = buildIncomingConversation({ snapshot, response, message, mutation });
  const verdict = validateTripWriteCandidate({
    operation,
    existingTrip: snapshot,
    incomingConversation: conversation,
    incomingPlan: plan,
    targetTripId,
  });
  if (!verdict.ok) return { ok: false, status: 400, code: verdict.code };

  // A prose-only turn advances the conversation while retaining the older
  // itinerary. Guard the newest response, not that retained plan's version.
  const latestResponse = latestCanonicalAssistantIdentity(old);
  const identityPlan = latestResponse?.responseVersion > (snapshot.plan?.responseVersion || 0)
    ? null
    : snapshot.plan;
  const decision = resolveCanonicalResponsePersistence({
    incomingPlan: plan,
    incomingConversation: conversation,
    expectedPreviousVersion: response.responseVersion - 1,
    existingPlan: identityPlan,
    existingConversation: old,
  });
  if (!decision.success) return { ok: false, status: 409, code: decision.reason };

  return { ok: true, conversation, plan: plan || null, old, decision, verdict };
}

module.exports = {
  buildAssistantMessage,
  buildIncomingPlan,
  buildIncomingConversation,
  prepareCanonicalStoreCommit,
};
