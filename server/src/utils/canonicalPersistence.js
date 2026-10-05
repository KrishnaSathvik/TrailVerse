'use strict';

/**
 * Stage 8.1 — atomic canonical response persistence.
 *
 * The canonical assistant message and the plan are ONE response unit. Guarding
 * only trip.plan (Stage 8) could still let a delayed conversation write land a
 * v3 assistant message beside a stored v4 plan. This resolver decides a single
 * outcome for BOTH, so they are accepted or rejected together and the invariant
 * holds:
 *
 *   displayed content = saved assistant content = saved plan = restored content
 *
 * Pure and deterministic — the controller applies the decision.
 */

const {
  PERSISTENCE_OUTCOME,
  RESPONSE_REVISION,
  extractPlanIdentity,
  decidePersistenceOutcome,
  normalizeRevision,
} = require('./planPersistence');

// Legacy-compatibility outcomes (beyond the version-comparison PERSISTENCE_OUTCOME set).
const RESPONSE_OUTCOME = {
  LEGACY_MIGRATION: 'legacy_migration',
  CANONICAL_IDENTITY_REQUIRED: 'canonical_identity_required',
};

/** The latest assistant message that carries a canonical responseId, or null. */
function latestCanonicalAssistantIdentity(conversation) {
  if (!Array.isArray(conversation)) return null;
  for (let i = conversation.length - 1; i >= 0; i -= 1) {
    const m = conversation[i];
    if (m && m.role === 'assistant' && m.responseId != null && m.responseVersion != null) {
      return {
        responseId: m.responseId,
        responseVersion: m.responseVersion,
        // Stage 14.1 — absent revision means the message is already terminal.
        responseRevision: normalizeRevision(m.responseRevision),
        revisionExplicit: m.responseRevision != null,
        // Stage 14.2 — durable lifecycle participates in semantic identity.
        lifecycleStatus: m.lifecycleStatus ?? null,
        contentHash: m.contentHash ?? null,
        itineraryHash: m.itineraryHash ?? null,
      };
    }
  }
  return null;
}

/** Identity of the response a client is trying to write (plan first, then message). */
function extractIncomingResponseIdentity({
  plan, conversation, expectedPreviousVersion, expectedPreviousRevision,
} = {}) {
  const base = extractPlanIdentity(plan) || latestCanonicalAssistantIdentity(conversation);
  if (!base) return null;
  const out = { ...base };
  if (expectedPreviousVersion != null) out.expectedPreviousVersion = expectedPreviousVersion;
  // Stage 14.1 — the intra-turn compare-and-swap the writer is asserting.
  if (expectedPreviousRevision != null) out.expectedPreviousRevision = expectedPreviousRevision;
  return out;
}

/** Identity currently stored for the trip (plan first, then message). */
function extractStoredResponseIdentity({ plan, conversation } = {}) {
  return extractPlanIdentity(plan) || latestCanonicalAssistantIdentity(conversation);
}

/**
 * @returns {{
 *   outcome: string|null, reason: string,
 *   writePlan: boolean, writeConversation: boolean,
 *   success: boolean, storedIdentity: Object|null, incomingIdentity: Object|null
 * }}
 */
function resolveCanonicalResponsePersistence({
  incomingPlan,
  incomingConversation,
  expectedPreviousVersion,
  expectedPreviousRevision,
  existingPlan,
  existingConversation,
}) {
  const hasIncomingPlan = incomingPlan != null;
  const hasIncomingConversation = incomingConversation !== undefined;

  const incomingIdentity = extractIncomingResponseIdentity({
    plan: incomingPlan,
    conversation: incomingConversation,
    expectedPreviousVersion,
    expectedPreviousRevision,
  });

  const storedIdentity = extractStoredResponseIdentity({
    plan: existingPlan,
    conversation: existingConversation,
  });

  // Legacy / non-canonical request (pre-Stage-8 client). It may write response
  // fields ONLY as a one-time migration of a trip that has no canonical identity
  // yet. Once a trip is canonical, an unversioned request can never overwrite it
  // — otherwise the legacy branch would bypass every version/hash protection.
  if (!incomingIdentity) {
    if (!storedIdentity) {
      return {
        outcome: RESPONSE_OUTCOME.LEGACY_MIGRATION,
        reason: 'legacy_migration',
        writePlan: hasIncomingPlan,
        writeConversation: hasIncomingConversation,
        writeResponseCoupled: true,
        needsMigrationStamp: true,
        success: true,
        storedIdentity: null,
        incomingIdentity: null,
      };
    }
    return {
      outcome: RESPONSE_OUTCOME.CANONICAL_IDENTITY_REQUIRED,
      reason: 'legacy_cannot_overwrite_canonical',
      writePlan: false,
      writeConversation: false,
      writeResponseCoupled: false,
      success: false,
      storedIdentity,
      incomingIdentity: null,
    };
  }

  const { outcome, reason } = decidePersistenceOutcome({
    incoming: incomingIdentity,
    existing: storedIdentity,
  });

  if (outcome === PERSISTENCE_OUTCOME.ACCEPT) {
    // Stage 14.1 — an intra-turn succession (rev 1 → rev 2 of the SAME turn) must
    // update the existing assistant turn in place. Appending would duplicate the
    // assistant message and a second plan for one logical response.
    const revisionSuccession = reason === 'newer_revision';
    return {
      outcome, reason,
      writePlan: hasIncomingPlan,
      writeConversation: hasIncomingConversation,
      // Stage 8.2 — everything derived from or describing the response (formData,
      // destination, summary, provider, identity) moves together with it.
      writeResponseCoupled: true,
      revisionSuccession,
      incomingRevision: incomingIdentity ? normalizeRevision(incomingIdentity.responseRevision) : null,
      storedRevision: storedIdentity ? normalizeRevision(storedIdentity.responseRevision) : null,
      success: true,
      storedIdentity,
      incomingIdentity,
    };
  }

  if (outcome === PERSISTENCE_OUTCOME.IDEMPOTENT) {
    return {
      outcome, reason,
      writePlan: false,
      writeConversation: false,
      writeResponseCoupled: false,
      success: true,
      storedIdentity,
      incomingIdentity,
    };
  }

  // STALE or CONFLICT — reject the whole unit; keep stored content, plan, AND
  // all response-coupled metadata.
  return {
    outcome, reason,
    writePlan: false,
    writeConversation: false,
    writeResponseCoupled: false,
    success: false,
    storedIdentity,
    incomingIdentity,
  };
}

/**
 * Stage 14.1 §7 — merge a TERMINAL revision into the stored conversation.
 *
 * One logical turn owns exactly ONE assistant message. When revision 2 arrives it
 * must replace the revision-1 shell in place — same slot, same message id, same
 * original timestamp — so the client never renders (or persists) a second
 * assistant message for the same response.
 *
 * Defensive by construction:
 *   - duplicate assistant messages carrying the target responseId collapse to one
 *   - the surviving message keeps the STORED id/timestamp when a shell existed
 *   - message order is otherwise preserved exactly
 *
 * Pure — no I/O, no mutation of either input.
 *
 * @param {Object} params
 * @param {Array}  params.storedConversation
 * @param {Array}  params.incomingConversation
 * @param {string} params.responseId
 * @returns {Array} the conversation to persist
 */
function mergeTerminalRevisionIntoConversation({ storedConversation, incomingConversation, responseId }) {
  if (!Array.isArray(incomingConversation)) return incomingConversation;
  if (responseId == null) return incomingConversation;

  const isTarget = (m) => m && m.role === 'assistant' && m.responseId === responseId;

  // The terminal message the client is writing (last wins if it sent duplicates).
  const incomingMatches = incomingConversation.filter(isTarget);
  if (incomingMatches.length === 0) return incomingConversation;
  const terminal = incomingMatches[incomingMatches.length - 1];

  // Preserve the identity of the shell we already stored, so the UI treats this as
  // the same message gaining content rather than a new arrival.
  const storedShell = Array.isArray(storedConversation)
    ? storedConversation.find(isTarget)
    : null;
  const merged = storedShell
    ? { ...terminal, id: storedShell.id, timestamp: storedShell.timestamp }
    : terminal;

  const out = [];
  let placed = false;
  for (const m of incomingConversation) {
    if (!isTarget(m)) { out.push(m); continue; }
    if (placed) continue; // collapse any duplicate assistant turn for this response
    out.push(merged);
    placed = true;
  }
  return out;
}

/** Preserve every previous assistant turn byte-for-byte while appending a new
 * logical response. The write contract has already proved those projections are
 * semantically unchanged; this prevents a sparse client projection from erasing
 * lifecycle ownership fields on reload. */
function preserveHistoricalAssistantTurns({ storedConversation, incomingConversation, targetResponseId }) {
  if (!Array.isArray(storedConversation) || !Array.isArray(incomingConversation)) return incomingConversation;
  const storedByResponseId = new Map(
    storedConversation
      .filter((message) => message?.role === 'assistant' && message.responseId)
      .map((message) => [message.responseId, message])
  );
  return incomingConversation.map((message) => {
    if (message?.role !== 'assistant' || message.responseId === targetResponseId) return message;
    return storedByResponseId.get(message.responseId) || message;
  });
}

const CREATE_ACTION = {
  CREATE: 'create',
  RETURN_EXISTING: 'return_existing',
  // Stage 14.1 — the trip already exists from this turn's revision 1; the terminal
  // revision must UPDATE it, never create a second trip.
  UPDATE_EXISTING: 'update_existing',
  CONFLICT: 'conflict',
};

/**
 * Stage 8.1 §5 / Stage 14.1 §8 — new-trip idempotency. A duplicate `done`/retry for
 * a new chat must not create a second trip, and a revision-2 write must land on the
 * trip that revision 1 created. Keyed by owner + plan.responseId (the caller does
 * the owner-scoped lookup and passes the matched trip's plan as existingPlan).
 *
 * @returns {{action: string, reason: string}}
 */
function resolveCreateIdempotency({ incomingPlan, existingPlan, expectedPreviousRevision }) {
  const base = extractPlanIdentity(incomingPlan);
  if (!base) return { action: CREATE_ACTION.CREATE, reason: 'legacy_no_identity' };
  const incoming = expectedPreviousRevision != null
    ? { ...base, expectedPreviousRevision }
    : base;

  if (!existingPlan) {
    // A write that names a base revision cannot create the trip — the checkpoint it
    // claims to succeed does not exist, and creating here would yield a partial trip
    // with terminal prose and no itinerary_ready history.
    if (incoming.expectedPreviousRevision != null) {
      return { action: CREATE_ACTION.CONFLICT, reason: 'expected_revision_but_none_stored' };
    }
    return { action: CREATE_ACTION.CREATE, reason: 'no_match' };
  }

  const { outcome, reason } = decidePersistenceOutcome({
    incoming,
    existing: extractPlanIdentity(existingPlan),
  });

  if (outcome === PERSISTENCE_OUTCOME.IDEMPOTENT) {
    return { action: CREATE_ACTION.RETURN_EXISTING, reason: 'duplicate_terminal_event' };
  }
  // Same turn, newer revision → the terminal write belongs on the existing trip.
  if (outcome === PERSISTENCE_OUTCOME.ACCEPT && reason === 'newer_revision') {
    return { action: CREATE_ACTION.UPDATE_EXISTING, reason: 'revision_succession' };
  }
  return { action: CREATE_ACTION.CONFLICT, reason: outcome };
}

module.exports = {
  RESPONSE_OUTCOME,
  RESPONSE_REVISION,
  mergeTerminalRevisionIntoConversation,
  preserveHistoricalAssistantTurns,
  latestCanonicalAssistantIdentity,
  extractIncomingResponseIdentity,
  extractStoredResponseIdentity,
  resolveCanonicalResponsePersistence,
  resolveCreateIdempotency,
  CREATE_ACTION,
};
