const { hashPayload } = require('./canonicalResponse');
const { LIFECYCLE_STATUS } = require('./planPersistence');

/**
 * Stage 14.4 §3 — is a stored trip actually recoverable?
 *
 * Pure, and evaluated BEFORE any lease is acquired and any provider is called,
 * so a malformed stored revision costs nothing. Nothing here normalizes or
 * repairs: a stored response that does not exactly satisfy the revision-1
 * contract is refused, because generating prose against a half-written or
 * tampered checkpoint is how a user ends up with notes describing a different
 * itinerary than the one they can see.
 */

const RECOVERY_DECISION = {
  RECOVERABLE: 'recoverable',
  ALREADY_COMPLETE: 'already_complete',
  REFUSED: 'refused',
};

const refuse = (code) => ({ decision: RECOVERY_DECISION.REFUSED, code });

function findAssistantTurn(conversation, responseId) {
  if (!Array.isArray(conversation)) return null;
  const matches = conversation.filter((m) => m && m.role === 'assistant' && m.responseId === responseId);
  // Two assistant turns for one responseId is exactly the corruption the
  // revision model exists to prevent. Refuse rather than pick one.
  return matches.length === 1 ? matches[0] : null;
}

/**
 * @param {{trip: Object, responseId: string}} params
 * @returns {{decision: string, code?: string, context?: Object}}
 */
function evaluateStoredRevisionForRecovery({ trip, responseId } = {}) {
  if (!trip || !responseId) return refuse('not_found');

  const plan = trip.plan;
  if (!plan || typeof plan !== 'object') return refuse('not_found');
  if (plan.responseId !== responseId) return refuse('not_found');

  const assistant = findAssistantTurn(trip.conversation, responseId);
  if (!assistant) return refuse('not_found');

  // The plan and the assistant turn must describe the SAME canonical response.
  if (assistant.responseId !== plan.responseId) return refuse('not_found');
  if (plan.itineraryHash !== assistant.itineraryHash) return refuse('identity_mismatch');

  const storedRevision = plan.responseRevision == null ? 2 : Number(plan.responseRevision);

  // Already finished — a normal, cost-free outcome, not an error.
  if (storedRevision === 2) {
    return {
      decision: RECOVERY_DECISION.ALREADY_COMPLETE,
      context: {
        responseId,
        responseVersion: plan.responseVersion,
        plan,
        assistant,
      },
    };
  }

  if (storedRevision !== 1) return refuse('unsupported_revision');
  if (plan.lifecycleStatus !== LIFECYCLE_STATUS.ITINERARY_READY) {
    return refuse('unsupported_lifecycle_status');
  }
  if ((assistant.content ?? '') !== '') return refuse('revision_1_content_not_empty');
  if (!plan.itineraryHash) return refuse('missing_itinerary_hash');
  if (!Number.isFinite(Number(plan.responseVersion))) return refuse('missing_response_version');

  const days = plan.days;
  if (!Array.isArray(days) || days.length === 0) return refuse('missing_itinerary_data');

  // Recompute the hash from the stored itinerary. If the row was edited under us,
  // this is what catches it — the stored hash alone proves nothing.
  const itineraryData = extractStoredItineraryData(plan);
  if (hashPayload(itineraryData) !== plan.itineraryHash) {
    return refuse('stored_itinerary_hash_mismatch');
  }

  return {
    decision: RECOVERY_DECISION.RECOVERABLE,
    context: {
      responseId,
      responseVersion: Number(plan.responseVersion),
      itineraryHash: plan.itineraryHash,
      itineraryData,
      feasibilityIssues: Array.isArray(plan.feasibilityIssues) ? plan.feasibilityIssues : [],
      parkName: plan.parkName ?? null,
      parkCode: plan.parkCode ?? null,
      plan,
      assistant,
    },
  };
}

/**
 * The itinerary payload the hash was taken over. `buildPlanDocument` spreads
 * `itineraryData` into the plan alongside its own bookkeeping fields, so the
 * hashed subset has to be reconstructed by removing those.
 */
const PLAN_ONLY_FIELDS = new Set([
  'type', 'version', 'generatedAt', 'createdFrom', 'parkName', 'parkCode',
  'responseId', 'responseVersion', 'contentHash', 'itineraryHash',
  'responseRevision', 'previousRevision', 'lifecycleStatus',
  'itineraryReadyAt', 'proseReadyAt',
  'feasibilityIssues', 'reviewMeta', 'auditTrail',
]);

function extractStoredItineraryData(plan) {
  const source = typeof plan.toObject === 'function' ? plan.toObject() : plan;
  const out = {};
  for (const [k, v] of Object.entries(source)) {
    if (PLAN_ONLY_FIELDS.has(k) || k === '_id' || k === '__v') continue;
    out[k] = v;
  }
  return out;
}

module.exports = {
  RECOVERY_DECISION,
  evaluateStoredRevisionForRecovery,
  extractStoredItineraryData,
};
