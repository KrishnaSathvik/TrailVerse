import { LIFECYCLE_STATE } from './earlyRevisionLifecycle';

/**
 * Stage 14.4 §15 — the client half of explicit prose recovery.
 *
 * Recovery reuses the Stage 14.3 coordinator wholesale rather than adding a
 * second state machine. The only new thing is the STARTING POINT: instead of
 * `idle`, the transaction begins where a normal turn would be after revision 1
 * became durable — `itinerary_visible`, with the persisted identity already
 * recorded as saved.
 *
 * Everything downstream then falls out unchanged: `prose_ready` is validated
 * against the stored revision-1 context, persisted with
 * `expectedPreviousRevision: 1` before it is shown, recovery `chunk` frames are
 * suppressed, and a matching `done` reconciles without a third write.
 */

export const RECOVERY_UI_STATE = {
  IDLE: 'idle',
  REQUESTING: 'requesting',
  IN_PROGRESS_ELSEWHERE: 'in_progress_elsewhere',
  AWAITING_PERSISTENCE: 'awaiting_persistence',
  FAILED: 'failed',
};

/** Bounded copy. Never a provider, driver, or lease-internal string. */
export const RECOVERY_MESSAGE = {
  IN_PROGRESS_ELSEWHERE: 'Trip notes are already being generated in another session.',
  AWAITING_PERSISTENCE: 'Trip notes were recently generated and are still being saved.',
  FAILED: 'Trip notes could not be generated. You can try again.',
  UNAVAILABLE: 'Trip notes are not available for this response.',
};

/**
 * Seed a fresh coordinator with a revision 1 that is ALREADY durable.
 *
 * `persistedItineraryHash` is what tells the reducer the checkpoint is real, so
 * the reveal path never counts a `displayedBeforePersistence`, and nothing
 * re-writes revision 1.
 */
export function seedCoordinatorForRecovery(coordinator, { message, plan, tripId }) {
  const state = coordinator.getState();
  const seeded = {
    ...state,
    status: LIFECYCLE_STATE.ITINERARY_VISIBLE,
    responseStartedSeen: true,
    earlyRevisionActive: true,
    responseId: message.responseId,
    responseVersion: message.responseVersion,
    itineraryHash: message.itineraryHash,
    tripId: tripId || state.tripId,
    revision1: { response: message, canonicalPlan: plan },
    persistedItineraryHash: message.itineraryHash,
    itineraryVisible: true,
  };
  coordinator.seed(seeded);
  return coordinator;
}

/**
 * May this stored turn offer "Generate trip notes"?
 *
 * Pure, and takes the server capability as an ARGUMENT: the browser never reads
 * a server environment variable, it is told what the server exposes.
 */
export function resolveRecoveryAvailability({ message, tripId, capabilityEnabled } = {}) {
  const unavailable = { available: false };

  if (!capabilityEnabled) return unavailable;
  if (!tripId || String(tripId).startsWith('temp-')) return unavailable;
  if (!message || message.role !== 'assistant') return unavailable;
  if (message.responseRevision !== 1) return unavailable;
  if (message.lifecycleStatus !== 'itinerary_ready') return unavailable;
  if ((message.content ?? '') !== '') return unavailable;
  if (!message.responseId || !message.itineraryHash) return unavailable;

  return { available: true, responseId: message.responseId };
}

/**
 * Map a recovery failure onto bounded UI state.
 *
 * A 409 is NOT retryable in this stage: the whole point of the lease is that a
 * user cannot buy the same Phase B twice, and auto-polling would work around it.
 */
export function resolveRecoveryFailure({ status, error, streamError } = {}) {
  if (status === 409 && error === 'prose_result_awaiting_persistence') {
    return {
      state: RECOVERY_UI_STATE.AWAITING_PERSISTENCE,
      message: RECOVERY_MESSAGE.AWAITING_PERSISTENCE,
      retryable: false,
    };
  }
  if (status === 409) {
    return {
      state: RECOVERY_UI_STATE.IN_PROGRESS_ELSEWHERE,
      message: RECOVERY_MESSAGE.IN_PROGRESS_ELSEWHERE,
      retryable: false,
    };
  }
  if (status === 404) {
    return { state: RECOVERY_UI_STATE.FAILED, message: RECOVERY_MESSAGE.UNAVAILABLE, retryable: false };
  }
  // Anything else is a recoverable failure. The server's error text is
  // deliberately discarded — only bounded copy reaches the user.
  return {
    state: RECOVERY_UI_STATE.FAILED,
    message: RECOVERY_MESSAGE.FAILED,
    retryable: true,
    ...(streamError ? {} : {}),
  };
}
