/** Anonymous Trailie chat — must match server AnonymousSession.canSendMessage(). */
export const ANONYMOUS_MESSAGE_LIMIT = 5;

export const ANONYMOUS_SESSION_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/**
 * True when the guest cannot send another message.
 *
 * Stage 14.8A.2 §4 — `messageCount` is the server's COMPLETED logical-turn
 * count, not a count of user messages sent. Pending and failed attempts are
 * never included, so the allowance is reached at exactly five completed turns.
 */
export function isAnonymousLimitReached({ canSendMore, messageCount }) {
  if (canSendMore === false) return true;
  return typeof messageCount === 'number' && messageCount >= ANONYMOUS_MESSAGE_LIMIT;
}
