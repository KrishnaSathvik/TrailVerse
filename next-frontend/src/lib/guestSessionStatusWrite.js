/**
 * P0-1 (audit 2026-08-31) — guards the localStorage write that follows an
 * /ai/session-status read. A stale read (cache-served or resolving out of
 * order) with a lower messageCount used to unlink a guest session that had
 * already completed turns, which remounted the chat and corrupted quota
 * display. A status read may only move the stored session forward; a lower
 * count is never written (local staleness self-heals via the stored session's
 * max-age and the next boot-time server validation).
 *
 * Returns the session object to persist, or null when nothing may be written.
 */
export function applySessionStatusToStoredSession(stored, status) {
  if (!stored) return null;
  if (!status || typeof status.messageCount !== 'number') return null;
  if (status.messageCount < (stored.messageCount || 0)) return null;

  return {
    ...stored,
    messageCount: status.messageCount,
    canSendMore: status.canSendMore !== undefined ? status.canSendMore : stored.canSendMore,
  };
}
