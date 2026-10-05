/**
 * Phase 6A — product-level classification of a completed Trailie turn.
 *
 * The backend already reports `data.trailieV2.status` / `terminalReason` on
 * EVERY turn (success and non-success alike — see trailieV2ExecutionService.js
 * / routes/ai.js `finalizeV2NonCompleteResponse`), but the frontend has never
 * read either field: every response, including a genuine generation failure
 * (`status: 'failed'`), was rendered exactly like an ordinary successful
 * answer. This module is the ONE place allowed to read those wire values for
 * a display decision — every caller gets one of three bounded product-level
 * classes back, never the raw status/terminalReason string.
 *
 * Pure, synchronous, no I/O, no React.
 *
 * ── THE THREE CLASSES ───────────────────────────────────────────────────
 *
 *   CONVERSATION_OUTCOME — an ordinary Trailie response. Includes a genuine
 *     success AND a semantic, fail-closed refusal the system produced ON
 *     PURPOSE (e.g. "I found more than one saved trip that could match —
 *     tell me which one" for an ambiguous historical-plan reference, or "I
 *     couldn't find a saved trip for that" for one that doesn't exist). These
 *     are correct, deliberate answers, never error UI.
 *
 *   RETRYABLE_FAILURE — the turn did not produce what it was trying to
 *     produce (a real generation/routing failure). Must never be presented
 *     as if it succeeded.
 *
 *   ACTION_REQUIRED — nothing about generation went right or wrong; the
 *     traveler needs to do something else first (e.g. the guest message
 *     allowance is spent). No retry is meaningful here.
 *
 * ── CONSERVATIVE FALLBACK ───────────────────────────────────────────────
 *
 * A status this module does not specifically recognize — including a
 * genuinely new value a future backend change might introduce, and today's
 * `'cancelled'` (a turn the traveler stopped on purpose, not a broken one) —
 * falls back to CONVERSATION_OUTCOME, never to RETRYABLE_FAILURE. Guessing
 * "unknown = broken" would be the more dangerous mistake: it would dress an
 * ordinary answer in error styling. Guessing "unknown = fine" is exactly what
 * already happens for every response today (the frontend has never read this
 * field), so it changes nothing for a case this module cannot yet name.
 *
 * `terminalReason` is read (see the paired test file) to keep the semantic
 * fail-closed set explicit and testable per reason, even though today every
 * `plan_target_unresolved` reason resolves to the same verdict as its parent
 * status. Splitting `status: 'failed'` itself into "explained safely" vs
 * "genuinely broken" sub-reasons (e.g. `evidence_incomplete`,
 * `constraint_infeasible`) is a real, plausible future refinement — but
 * verifying which failed-status reasons actually carry safe, specific prose
 * requires live inspection this phase does not have, and misclassifying a
 * genuinely broken turn as an ordinary answer is the worse of the two
 * mistakes. Deferred, not guessed at.
 */

export const TRAILIE_TURN_OUTCOME = Object.freeze({
  CONVERSATION_OUTCOME: 'conversation_outcome',
  RETRYABLE_FAILURE: 'retryable_failure',
  ACTION_REQUIRED: 'action_required',
  // Phase 6C — the browser never received a resolved server response at
  // all (a genuine connection loss/timeout), so no server-resolved verdict
  // exists to classify from `classifyTrailieTurnOutcome` above. Produced
  // only by `isUncertainConnectionLossError` below, never by that function
  // — this is not a 4th thing a successful response can resolve to.
  UNCERTAIN_OUTCOME: 'uncertain_outcome',
});

/**
 * `trailieV2.status` values that are a DELIBERATE, safe, fail-closed refusal
 * — the system correctly declined to guess rather than failing to generate.
 * Bounded and named explicitly; never inferred from a naming pattern.
 */
const SEMANTIC_FAIL_CLOSED_STATUSES = new Set([
  'plan_target_unresolved', // historical-plan reference: not_found / ambiguous / hydration_failed
]);

/**
 * `trailieV2.status` values that mean the turn genuinely did not complete
 * what it was trying to do.
 */
const GENERATION_FAILURE_STATUSES = new Set([
  'failed',
]);

/**
 * @param {object} data — the response payload as the frontend already
 *   receives it (the unwrapped `data` object from a non-stream response, or
 *   the streaming `onDone` terminal result — both carry the same
 *   `trailieV2` shape per `finalizeV2NonCompleteResponse`).
 * @returns {'conversation_outcome'|'retryable_failure'|'action_required'}
 */
export function classifyTrailieTurnOutcome(data) {
  if (!data || typeof data !== 'object') return TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME;

  // Guest-quota exhaustion (and any future conversion-style turn) already
  // carries its own existing, unrelated flag — recognized here so this stays
  // the single place a caller asks "which of the 3 classes is this turn".
  if (data.isConversionMessage === true) return TRAILIE_TURN_OUTCOME.ACTION_REQUIRED;

  const status = data.trailieV2?.status;
  // No trailieV2 telemetry at all (a legacy shape, a non-Trailie system
  // message, or a test double) — never seen as a signal before this module
  // existed, so it stays exactly what it always was: an ordinary message.
  if (typeof status !== 'string' || status.length === 0) {
    return TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME;
  }

  if (status === 'complete') return TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME;
  if (SEMANTIC_FAIL_CLOSED_STATUSES.has(status)) return TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME;
  if (GENERATION_FAILURE_STATUSES.has(status)) return TRAILIE_TURN_OUTCOME.RETRYABLE_FAILURE;

  // Unmapped/unknown — conservative fallback (see module doc).
  return TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME;
}

/**
 * Phase 6A.1 — the calm, traveler-facing copy shown IN PLACE OF whatever raw
 * content a genuine generation failure produced. Inline, not full-screen; no
 * status/terminalReason/provider/model wording. No "Try again" is attached
 * here — that is explicitly deferred.
 */
export const RETRYABLE_FAILURE_MESSAGE = "I couldn't finish that one.";

/**
 * What should actually be shown for this turn's content — the one place a
 * genuine failure's raw fallback text is replaced with calm, generic copy.
 * `conversation_outcome` and `action_required` turns are passed through
 * completely unchanged (their own content, whatever it is, IS the correct
 * traveler-facing answer — including a semantic fail-closed refusal like
 * "I couldn't find a saved trip for that").
 *
 * @param {{content: *, outcomeClass: string}} params — `outcomeClass` is the
 *   ALREADY-COMPUTED result of `classifyTrailieTurnOutcome`, passed in
 *   rather than re-derived, so a caller that already classified a turn for
 *   other purposes (e.g. suppressing the completion sound) never computes it
 *   twice or risks the two disagreeing.
 * @returns {*} the content to render — `RETRYABLE_FAILURE_MESSAGE`, or the
 *   original `content` unchanged.
 */
export function resolveTrailieTurnDisplayContent({ content, outcomeClass } = {}) {
  if (outcomeClass === TRAILIE_TURN_OUTCOME.RETRYABLE_FAILURE) return RETRYABLE_FAILURE_MESSAGE;
  return content;
}

/**
 * Phase 6A.1 — did the SERVER's guest-turn ledger actually complete/consume
 * this turn? This is a DIFFERENT question from classifyTrailieTurnOutcome
 * above, and deliberately NOT derived from its result.
 *
 * `server/src/routes/ai.js` (`/chat-anonymous` and `/chat-anonymous-stream`,
 * identically) calls `guestTurn.fail(...)` for EVERY `trailieV2.status !==
 * 'complete'` — which never writes `AnonymousSession.messages` and never
 * consumes guest quota (`anonymousTurnLedger.js`'s `failGuestTurn`, as
 * opposed to `completeGuestTurn`) — including `plan_target_unresolved`, the
 * SAME semantic fail-closed status `classifyTrailieTurnOutcome` deliberately
 * displays as an ordinary `conversation_outcome` turn. The two questions
 * ("what does the traveler see" vs. "did the server's guest ledger actually
 * record this turn") have different boundaries on purpose, and a guest-only
 * local mirror must follow the SECOND one, or a refresh could resurrect a
 * turn the server itself never persisted or counted.
 *
 * Absence of `trailieV2` (a shape this module has never seen on a real
 * terminal — every one carries it) resolves to `true` (consumed), matching
 * exactly what every caller did before this function existed: a shape it
 * cannot read never newly excludes anything.
 *
 * @returns {boolean}
 */
export function wasGuestTurnConsumedByServer(data) {
  const status = data?.trailieV2?.status;
  if (typeof status !== 'string' || status.length === 0) return true;
  return status === 'complete';
}

/**
 * Phase 6C — classifies a THROWN/caught request error (the browser never
 * got a resolved server response at all) as a genuine client-only
 * connection loss. `true` only for the narrow "we truly don't know what
 * happened" case: no response was received (covers both a real network
 * failure and a client-side timeout, which never sets a response either).
 *
 * Deliberately excludes two things that already have their own specific,
 * unrelated handling and must not be reclassified:
 *   - `error.name === 'AbortError'` — the traveler's OWN new message
 *     superseded this one on purpose. Not uncertain; simply moot.
 *   - `error.response` present — the server actually answered (some HTTP
 *     status), so this is a real, known response shape, not a connection
 *     loss, even when that answer was itself an error.
 *
 * Per Phase 6B.1's lost-response race, the server may have resolved this
 * turn just fine after the browser stopped listening — this can NEVER be
 * `retryable_failure` (that requires an actual server-resolved verdict).
 * It stays `uncertain_outcome` until something else resolves it.
 */
export function isUncertainConnectionLossError(error) {
  if (!error || typeof error !== 'object') return false;
  if (error.serverResolvedFailure) return false;
  if (error.name === 'AbortError') return false;
  if (error.response) return false;
  return true;
}

/**
 * Phase 6C — calm, honest copy for a connection loss the browser cannot
 * resolve on its own. Never claims success or failure; never asks the
 * traveler to interpret a status code.
 */
export const UNCERTAIN_CONNECTION_LOSS_MESSAGE =
  "The connection was interrupted. I couldn't confirm whether that finished.";

/**
 * Phase 6C — the ONE gate for whether an inline "Try again" action may be
 * shown for a message. Deliberately narrow and explicit rather than a
 * negative/exclusion list, so a future outcome class is safe-by-default
 * (no retry) unless someone deliberately adds it here:
 *
 *   - only a server-resolved RETRYABLE_FAILURE ever qualifies — never
 *     CONVERSATION_OUTCOME (includes semantic fail-closed refusals like
 *     historical not_found/ambiguous), never ACTION_REQUIRED (quota/auth),
 *     and never UNCERTAIN_OUTCOME (a client-only disconnect — the server
 *     may have already resolved it; see the lost-response race).
 *
 * Phase 6C had this guest-only: authenticated RETRYABLE_FAILURE turns were
 * durably persisted into TripPlan.conversation by the existing, unrelated
 * autoSaveConversation path (the Phase 6C precheck finding), so retrying
 * would have compounded an already-saved failed exchange. Phase 6C.1 closed
 * that seam at the source (`runOrderedCrossPlanPersistence`'s
 * `hasUserMessagesToSave` in TripPlannerChat.jsx now excludes a
 * RETRYABLE_FAILURE turn from ever reaching `autoSaveConversation`), so a
 * technical failure is transient for BOTH guest and authenticated travelers
 * — this gate no longer needs (or accepts a meaningful) `isAnonymous`
 * distinction. The parameter is kept, unused, only so existing call sites
 * that still pass it are not forced to churn.
 * `sync-needed` is a completely different concept (`saveState`, a
 * persistence-write result) and was never eligible in the first place —
 * this gate does not need to special-case it.
 */
export function canRetryTrailieTurn({ outcomeClass } = {}) {
  return outcomeClass === TRAILIE_TURN_OUTCOME.RETRYABLE_FAILURE;
}

/**
 * Phase 6C — history sent to the NEXT model attempt must never include a
 * transient RETRYABLE_FAILURE bubble ("I couldn't finish that one."). It is
 * calm placeholder copy shown to the traveler, never something the model
 * actually said — sending it back as "prior context" would just confuse
 * the next attempt with its own failure.
 *
 * Pure and order-preserving; every other message passes through unchanged.
 */
export function excludeTransientFailuresFromHistory(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => m?.outcomeClass !== TRAILIE_TURN_OUTCOME.RETRYABLE_FAILURE);
}

/**
 * Phase 6C — the pure decision behind a "Try again" click: given the full
 * message list and which failed message was clicked, what should actually
 * happen — resend which text, remove which message — with NO React state,
 * no request dispatch, nothing side-effecting. Re-checks
 * `canRetryTrailieTurn` itself (not merely trusting the caller), so this is
 * safe to call directly, including in tests, without duplicating the gate.
 *
 * `isAnonymous` is accepted for call-site compatibility but no longer
 * changes the outcome (see `canRetryTrailieTurn` — Phase 6C.1 made retry
 * available to both guest and authenticated known failures).
 *
 * @returns {{resendText: string, removeMessageId: *}|null} `null` when this
 *   message is not a valid retry target — the caller must do nothing.
 */
export function resolveTrailieRetryPlan({ messages, failedMessageId, isAnonymous } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const idx = list.findIndex((m) => m?.id === failedMessageId);
  if (idx <= 0) return null; // not found, or no preceding message to resend

  const failedMessage = list[idx];
  if (!canRetryTrailieTurn({ outcomeClass: failedMessage?.outcomeClass })) return null;

  const userMessage = list[idx - 1];
  if (!userMessage || userMessage.role !== 'user' || !userMessage.content) return null;

  return {
    resendText: userMessage.content,
    removeMessageId: failedMessageId,
  };
}
