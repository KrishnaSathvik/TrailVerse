/** Anonymous Trailie chat — must match server AnonymousSession.canSendMessage(). */
export const ANONYMOUS_MESSAGE_LIMIT = 5;

export const ANONYMOUS_SESSION_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/**
 * True when the guest cannot send another message.
 * Backend allows while userMessageCount <= 5; blocks the 6th attempt (canSendMore false).
 */
export function isAnonymousLimitReached({ canSendMore, messageCount }) {
  if (canSendMore === false) return true;
  return typeof messageCount === 'number' && messageCount > ANONYMOUS_MESSAGE_LIMIT;
}
