/**
 * Stage 14.8H.1 §13 — the authenticated-turn acceptance adjudicator.
 *
 * Stage 14.8H was reported as PASS because every check that existed passed. The
 * checks that existed were the wrong set: they asked whether the RESPONSE slot
 * was unique and never asked what else had been written alongside it, so a trip
 * holding one user turn and TWO assistant documents satisfied them. They also
 * compared the frozen plan to itself while the containing trip said
 * `General Planning / null`.
 *
 * This module is the aggregate verdict, so those two questions are asked by
 * construction rather than remembered by whoever writes the next driver.
 */

import { describeConversationOwnership } from './messageOwnership';
import { assertTripDestinationCoherence } from './tripDestination';

/**
 * @param {object} evidence
 * @param {Array}  evidence.storedConversation   conversation as stored
 * @param {object} evidence.storedTrip           the stored TripPlan
 * @param {number} evidence.expectedUserTurns
 * @param {number} evidence.expectedAssistantTurns
 * @param {number} evidence.acceptedRevisionWrites
 * @param {number} evidence.doneWrites
 * @param {number} evidence.tripPlanCount
 */
export function adjudicateAuthenticatedTurn({
  storedConversation = [],
  storedTrip = {},
  expectedUserTurns = 1,
  expectedAssistantTurns = 1,
  acceptedRevisionWrites = null,
  doneWrites = 0,
  tripPlanCount = 1,
} = {}) {
  const ownership = describeConversationOwnership(storedConversation);
  const destination = assertTripDestinationCoherence({
    trip: storedTrip,
    plan: storedTrip?.plan,
  });

  // Everything actually stored, not just what the canonical filter would keep.
  const storedUserTurns = storedConversation.filter((m) => m.role === 'user').length;
  const storedAssistantTurns = storedConversation.filter((m) => m.role === 'assistant').length;
  const responseSlots = storedConversation.filter((m) => m.role === 'assistant' && m.responseId);

  const checks = {
    canonicalUserTurnCountCorrect: ownership.canonicalUserTurnCount === expectedUserTurns,
    canonicalAssistantTurnCountCorrect:
      ownership.canonicalAssistantTurnCount === expectedAssistantTurns,

    // The check Stage 14.8H lacked: nothing but real turns may be stored.
    uiChromeExcludedFromPersistence:
      storedUserTurns === expectedUserTurns && storedAssistantTurns === expectedAssistantTurns,

    tripDestinationMatchesFrozenPlan: destination.tripDestinationMatchesFrozenPlan,

    singleResponseSlot: responseSlots.length === expectedAssistantTurns,
    tripPlanCountCorrect: tripPlanCount === 1,
    doneWroteNothing: doneWrites === 0,
    ...(acceptedRevisionWrites == null
      ? {}
      : { exactlyTwoAcceptedRevisionWrites: acceptedRevisionWrites === 2 }),
  };

  const failures = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);

  return {
    passed: failures.length === 0,
    failures,
    checks,
    observed: {
      storedUserTurns,
      storedAssistantTurns,
      canonicalUserTurnCount: ownership.canonicalUserTurnCount,
      canonicalAssistantTurnCount: ownership.canonicalAssistantTurnCount,
      declaredUiOnlyCount: ownership.declaredUiOnlyCount,
      legacyRecognisedUiOnlyCount: ownership.legacyRecognisedUiOnlyCount,
      responseSlots: responseSlots.length,
      tripParkName: destination.tripParkName,
      tripParkCode: destination.tripParkCode,
      frozenPlanDestinationName: destination.frozenPlanDestinationName ?? null,
      frozenPlanDestinationParkCode: destination.frozenPlanDestinationParkCode ?? null,
    },
    destination,
  };
}
