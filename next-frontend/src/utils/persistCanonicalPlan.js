import { TRAILIE_TURN_OUTCOME } from './trailieTurnOutcome';

/**
 * Phase 6C.1 — the smallest persistence seam: whether THIS turn's
 * conversation (and, bundled with it in the same atomic write, its
 * canonical plan — see `runOrderedCrossPlanPersistence` below) may be
 * durably saved at all.
 *
 * A server-resolved `retryable_failure` is transient by definition — it
 * must never reach `autoSaveConversation`, for guest OR authenticated
 * travelers, so it can never advance the canonical plan's responseVersion
 * and never gets written into `TripPlan.conversation`. Every other outcome
 * (a genuine success, a semantic fail-closed refusal such as historical
 * not_found/ambiguous, action_required, or any status this module doesn't
 * yet recognize) is saved exactly as before — this is deliberately NOT a
 * blanket `status !== 'complete'` rule; only the one named class is
 * withheld.
 *
 * @param {{outcomeClass: string, hasUserMessages: boolean}} params
 * @returns {boolean}
 */
export function shouldSaveConversationForTurn({ outcomeClass, hasUserMessages }) {
  return outcomeClass !== TRAILIE_TURN_OUTCOME.RETRYABLE_FAILURE && Boolean(hasUserMessages);
}

/**
 * Stage 8 — the browser is the single persistence INITIATOR, not the author.
 *
 * The server owns canonical response creation. When a response carries a
 * server-built `canonicalPlan`, we persist it VERBATIM. The browser must never
 * rebuild plan content from rawStreamedContentRef, re-strip artifacts, or
 * re-derive itineraryData — doing so is exactly how the saved trip drifted from
 * what the user saw (F-PERSIST-1).
 *
 * @param {{data: Object, currentPlan: Object|null}} params
 * @returns {Object|null} the plan object to persist
 */
export function selectPlanToPersist({ data, currentPlan }) {
  if (data && data.canonicalPlan) {
    return data.canonicalPlan;
  }
  // No server plan in this response — keep whatever plan the trip already had.
  // Deliberately does NOT consult `data.targetPlanMutation`: a successful
  // cross-plan (historical) edit leaves `data.canonicalPlan` null on purpose
  // (the active trip was never touched), so this correctly falls through to
  // "keep the current plan" exactly as it already did before Task 10D existed.
  return currentPlan ?? null;
}

/**
 * WP-TU Phase 4 Task 10D — display-only terminal plan selection for the
 * in-chat bubble. Falls back to a hydrated CROSS-PLAN mutation's patched
 * content only when nothing else is available, so a successful historical
 * edit still shows something in the chat that requested it. Never used for
 * persistence — see `selectPlanToPersist` above, which intentionally does
 * NOT include this fallback.
 *
 * @param {{data: Object}} params
 * @returns {Object|null}
 */
export function selectTerminalPlanForDisplay({ data }) {
  return (
    data?.canonicalPlan
    || data?.itineraryData
    || data?.itinerary
    || data?.targetPlanMutation?.canonicalPlan
    || null
  );
}

/**
 * WP-TU Phase 4 Task 10D/10E — the exact `{tripId, payload}` a cross-plan
 * target mutation should be persisted with. `conversation`/`summary` are
 * deliberately never included: the target trip's own conversation history
 * must never be read or overwritten by this call (the server preserves the
 * stored `conversation` when the field is absent from the request body —
 * `tripController.js`).
 *
 * Task 10E — also carries `sourceTripId`/`sourceResponseId` (from
 * `sourceProvenance`): the server-side ownership extension
 * (`resolveCanonicalWriteTarget`) verifies these against its OWN stored
 * data — this call only carries the CLAIM, never anything the server is
 * asked to trust about content. Returns `null` when `targetPlanMutation` OR
 * `sourceProvenance` is missing a required field, so the caller no-ops
 * rather than firing a write that can only ever be rejected.
 *
 * @param {{tripId?: string, canonicalPlan?: Object}|null} targetPlanMutation
 * @param {(payload: Object) => Object} buildPayload - injected so this stays
 *   a pure function; production callers pass `buildResponseSavePayload`.
 * @param {{sourceTripId?: string, sourceResponseId?: string}|null} sourceProvenance
 * @returns {{tripId: string, payload: Object}|null}
 */
/**
 * WP-TU Phase 4 Task 10E — the ORDERING enforcement, extracted so it is
 * directly unit-testable rather than only exercised as an inline block
 * inside the (untestable-in-isolation) TripPlannerChat component. The
 * target-plan (Redwood) save's ownership proof is a real, durably-persisted
 * assistant message the active-trip save just wrote — so that save MUST be
 * awaited to a genuine success (not merely "settled") before the target save
 * is even attempted. `autoSaveConversation`/`persistTargetPlanMutation` are
 * injected as functions so this stays pure or, at worst, callable in
 * isolation from the DOM/React component.
 *
 * @returns {Promise<boolean>} whether the active-trip save succeeded.
 */
export async function runOrderedCrossPlanPersistence({
  data,
  hasUserMessagesToSave,
  autoSaveConversation,
  persistTargetPlanMutation,
  currentTripId,
}) {
  // Model-first responses are already committed atomically by the server.
  // Replaying either write from the client would create a second writer.
  if (data?.persisted === true) return true;
  const activeTripSaveSucceeded = hasUserMessagesToSave ? await autoSaveConversation() : false;
  if (data?.targetPlanMutation && activeTripSaveSucceeded) {
    await persistTargetPlanMutation(data.targetPlanMutation, {
      sourceTripId: currentTripId,
      sourceResponseId: data.responseId || null,
    });
  }
  return activeTripSaveSucceeded;
}

export function buildTargetPlanMutationSave(targetPlanMutation, buildPayload, sourceProvenance) {
  if (!targetPlanMutation?.tripId || !targetPlanMutation?.canonicalPlan) return null;
  if (!sourceProvenance?.sourceTripId || !sourceProvenance?.sourceResponseId) return null;
  return {
    tripId: targetPlanMutation.tripId,
    payload: {
      ...buildPayload({ plan: targetPlanMutation.canonicalPlan }),
      sourceTripId: sourceProvenance.sourceTripId,
      sourceResponseId: sourceProvenance.sourceResponseId,
    },
  };
}
