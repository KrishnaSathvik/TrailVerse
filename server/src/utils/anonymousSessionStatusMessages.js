'use strict';

const { hashPayload } = require('./canonicalResponse');
const { RETRYABLE_GUEST_FAILURE_CODES } = require('../services/anonymousTurnLedger');

/** Same traveler-facing copy the client uses for a known retryable failure. */
const RETRYABLE_FAILURE_PUBLIC_MESSAGE = "I couldn't finish that one.";
const RETRYABLE_FAILURE_OUTCOME_CLASS = 'retryable_failure';

/** Project completed guest history for GET /api/ai/session-status/:anonymousId. */
function mapAnonymousSessionMessagesForStatus(messages = []) {
  return messages
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .map((msg) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      provider: msg.provider || null,
      model: msg.model || null,
      ...(msg.travelLogistics ? { travelLogistics: msg.travelLogistics } : {}),
      ...(msg.artifactStatus ? { artifactStatus: msg.artifactStatus } : {}),
      ...(msg.responseArtifacts ? { responseArtifacts: msg.responseArtifacts } : {}),
      ...(msg.intent ? { intent: msg.intent } : {}),
      ...(msg.presentation ? { presentation: msg.presentation } : {}),
      // WP-TU Phase 3 Task 8B — same additive field, same allowlist pattern
      // as intent/presentation immediately above.
      ...(msg.activeTripPresentation ? { activeTripPresentation: msg.activeTripPresentation } : {}),
      // WP-TU Phase 4 Task 10 — same additive field, same allowlist pattern.
      ...(msg.targetTripId ? { targetTripId: msg.targetTripId } : {}),
      ...(msg.canonicalPlan ? {
        canonicalPlan: msg.canonicalPlan,
        itineraryPlan: msg.canonicalPlan,
        hasItinerary: true,
      } : {}),
      ...(msg.itineraryHash ? { itineraryHash: msg.itineraryHash } : {}),
      ...(msg.responseId ? { responseId: msg.responseId } : {}),
      ...(Number.isFinite(msg.responseVersion) ? { responseVersion: msg.responseVersion } : {}),
      ...(Number.isFinite(msg.responseRevision) ? { responseRevision: msg.responseRevision } : {}),
      ...(msg.lifecycleStatus ? { lifecycleStatus: msg.lifecycleStatus } : {}),
      ...(msg.outcomeClass ? { outcomeClass: msg.outcomeClass } : {}),
      ...(msg.presentationKind ? { presentationKind: msg.presentationKind } : {}),
      ...(msg.parkName ? { parkName: msg.parkName } : {}),
      ...(Array.isArray(msg.parkNames) && msg.parkNames.length ? { parkNames: msg.parkNames } : {}),
      ...(msg.hasLiveData ? { hasLiveData: true } : {}),
      ...(msg.hasWebSearch ? { hasWebSearch: true } : {}),
    }));
}

function timeMs(value) {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

function projectRetryableFailedTurns(turns = []) {
  return (Array.isArray(turns) ? turns : [])
    .filter((turn) => (
      turn?.status === 'failed'
      && RETRYABLE_GUEST_FAILURE_CODES.has(turn.failureCode)
      && typeof turn.userMessage?.content === 'string'
      && turn.userMessage.content.trim().length > 0
    ))
    .sort((a, b) => timeMs(a.admittedAt || a.failedAt) - timeMs(b.admittedAt || b.failedAt))
    .flatMap((turn) => {
      const userTime = turn.userMessage.timestamp || turn.admittedAt;
      const assistantTime = turn.failedAt || userTime;
      return [
        {
          role: 'user',
          content: turn.userMessage.content,
          timestamp: userTime,
          provider: null,
          model: null,
          lifecycleStatus: 'failed',
        },
        {
          role: 'assistant',
          content: RETRYABLE_FAILURE_PUBLIC_MESSAGE,
          timestamp: assistantTime,
          provider: null,
          model: null,
          lifecycleStatus: 'failed',
          outcomeClass: RETRYABLE_FAILURE_OUTCOME_CLASS,
          presentationKind: 'plain_answer',
        },
      ];
    });
}

/**
 * Compose session-status conversation from completed `messages` plus retryable
 * failed turns. Failed turns never become accepted canonical state.
 */
function projectGuestConversationForStatus({ messages = [], turns = [] } = {}) {
  const completed = mapAnonymousSessionMessagesForStatus(messages);
  const failed = projectRetryableFailedTurns(turns);
  return [...completed, ...failed].sort((a, b) => {
    const delta = timeMs(a.timestamp) - timeMs(b.timestamp);
    if (delta !== 0) return delta;
    if (a.role === b.role) return 0;
    return a.role === 'user' ? -1 : 1;
  });
}

module.exports = {
  RETRYABLE_FAILURE_PUBLIC_MESSAGE,
  RETRYABLE_FAILURE_OUTCOME_CLASS,
  mapAnonymousSessionMessagesForStatus,
  projectGuestConversationForStatus,
  projectRetryableFailedTurns,
  mapGuestMessageToTripConversation,
};

function mapGuestMessageToTripConversation(msg = {}) {
  const canonicalAssistant = msg.role === 'assistant' && Boolean(msg.responseId);
  return {
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
    provider: msg.provider,
    model: msg.model,
    responseTime: msg.responseTime,
    travelLogistics: msg.travelLogistics,
    canonicalPlan: msg.canonicalPlan,
    itineraryPlan: msg.itineraryPlan || msg.canonicalPlan,
    responseArtifacts: msg.responseArtifacts,
    artifactStatus: msg.artifactStatus,
    intent: msg.intent,
    presentation: msg.presentation,
    itineraryHash: msg.itineraryHash,
    responseId: msg.responseId,
    responseVersion: msg.responseVersion,
    responseRevision: canonicalAssistant ? (Number.isFinite(msg.responseRevision) ? msg.responseRevision : 2) : msg.responseRevision,
    contentHash: canonicalAssistant ? (msg.contentHash || hashPayload(msg.content || '')) : msg.contentHash,
    lifecycleStatus: canonicalAssistant ? (msg.lifecycleStatus || 'prose_ready') : msg.lifecycleStatus,
    parkName: msg.parkName,
    parkNames: msg.parkNames,
    hasLiveData: msg.hasLiveData,
    hasWebSearch: msg.hasWebSearch,
  };
}
