'use strict';

/**
 * Stage 14.8A.2 §5–§7, §11 — the guest turn lifecycle seam used by the
 * anonymous chat routes.
 *
 * The anonymous handlers are long, and a long handler has many exits: preflight
 * blockers, aborts, empty generations, thrown provider errors, and the ordinary
 * terminal path. `openGuestTurn` gives every one of those exits a single owner:
 *
 *   openGuestTurn → admit exactly one pending turn (or refuse with a bounded code)
 *   scope.complete → atomic, idempotent completion; the ONLY place quota grows
 *   scope.fail     → release the reservation; quota unchanged
 *   scope.settle   → the safety net: if the handler unwinds with the turn still
 *                    pending, it becomes failed rather than a stuck reservation
 *
 * Quota is therefore coupled to COMPLETION, never to arrival. This module never
 * constructs or dispatches a provider.
 */

const {
  GUEST_TURN_FAILURE_CODES,
  GUEST_ROUTE_CODES,
  admitGuestTurn,
  completeGuestTurn,
  failGuestTurn,
  projectGuestQuota,
} = require('./anonymousTurnLedger');

/**
 * Maps an internal error onto a bounded failure code. Never returns provider
 * text, credentials, stack traces, or internal session identifiers.
 */
function classifyGuestTurnFailure(error) {
  if (!error) return GUEST_TURN_FAILURE_CODES.BACKEND_EXCEPTION;

  if (error.guestFailureStage === 'structured') {
    return GUEST_TURN_FAILURE_CODES.STRUCTURED_GENERATION_FAILURE;
  }
  if (error.guestFailureStage === 'prose') {
    return GUEST_TURN_FAILURE_CODES.PROSE_GENERATION_FAILURE;
  }
  if (error.name === 'AbortError') return GUEST_TURN_FAILURE_CODES.STREAM_ABORTED;
  if (error.code === 'TRAILIE_NETWORK_DENIED' || /network (?:policy|denied|blocked)/i.test(error.message || '')) {
    return GUEST_TURN_FAILURE_CODES.NETWORK_POLICY_REFUSAL;
  }
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED' || /timed? ?out/i.test(error.message || '')) {
    return GUEST_TURN_FAILURE_CODES.PROVIDER_TIMEOUT;
  }
  if (/api key|not configured|missing credential/i.test(error.message || '')) {
    return GUEST_TURN_FAILURE_CODES.PROVIDER_CONFIGURATION;
  }
  if (error.status || error.httpStatus || error.response) {
    return GUEST_TURN_FAILURE_CODES.PROVIDER_FAILURE;
  }
  return GUEST_TURN_FAILURE_CODES.BACKEND_EXCEPTION;
}

/**
 * Public, bounded shape for a refused admission. Carries no provider detail and
 * no internal identifier — only what the browser needs to clear pending state.
 */
function buildRefusal(admission) {
  return {
    code: admission.code || GUEST_ROUTE_CODES.ABANDONED,
    duplicate: Boolean(admission.duplicate),
    completedGuestTurns: admission.completedGuestTurns,
    remainingAllowance: admission.remainingAllowance,
    canSendMore: admission.remainingAllowance > 0,
  };
}

async function openGuestTurn({
  anonymousId,
  clientTurnId,
  userMessage,
  now = new Date(),
  trusted = false,
}) {
  const admission = await admitGuestTurn({ anonymousId, clientTurnId, userMessage, now, trusted });

  if (!admission.ok) {
    return {
      admitted: false,
      anonymousId,
      turnId: null,
      refusal: buildRefusal(admission),
      quota: {
        completedGuestTurns: admission.completedGuestTurns,
        remainingAllowance: admission.remainingAllowance,
      },
      complete: async () => ({
        completed: false, alreadyCompleted: false,
        assistantResponsesWritten: 0, completedTurnIncrement: 0,
      }),
      fail: async () => ({ failed: false }),
      settle: async () => ({ settled: false }),
    };
  }

  const { turnId } = admission;
  // Local resolution latch: `settle` must not re-fail an already-resolved turn,
  // and the ledger's conditional updates make a late signal a no-op regardless.
  let resolved = false;

  return {
    admitted: true,
    anonymousId,
    turnId,
    clientTurnId: admission.clientTurnId,
    refusal: null,
    quota: {
      completedGuestTurns: admission.completedGuestTurns,
      remainingAllowance: admission.remainingAllowance,
    },

    /** The ONLY place guest quota grows. Idempotent under duplicate terminals. */
    async complete(assistantMessage, extras = {}) {
      const result = await completeGuestTurn({
        anonymousId,
        turnId,
        assistantMessage,
        planningState: extras.planningState,
      });
      if (result.completed || result.alreadyCompleted) resolved = true;
      return result;
    },

    async fail(failureCode) {
      const result = await failGuestTurn({ anonymousId, turnId, failureCode });
      resolved = true;
      return result;
    },

    /**
     * Safety net for every remaining exit — early return, thrown exception,
     * abort, or an empty terminal response. A no-op once the turn resolved.
     */
    async settle(failureCode = GUEST_TURN_FAILURE_CODES.BACKEND_EXCEPTION) {
      if (resolved) return { settled: false };
      resolved = true;
      const result = await failGuestTurn({ anonymousId, turnId, failureCode });
      return { settled: result.failed, failureCode };
    },
  };
}

module.exports = {
  GUEST_TURN_FAILURE_CODES,
  GUEST_ROUTE_CODES,
  buildRefusal,
  classifyGuestTurnFailure,
  openGuestTurn,
  projectGuestQuota,
};
