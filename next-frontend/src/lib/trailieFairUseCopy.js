/**
 * Copy for signed-in Trailie fair-use refusals (server:
 * server/src/routes/modelFirstTrailie.js admitSignedInTurn). These are
 * a short burst window and a one-active-generation guard — never a daily cap.
 * Copy only: rendered through the existing failed-turn message path.
 */

export const TRAILIE_FAIR_USE_CODES = Object.freeze({
  BURST: 'trailie_turn_burst_limit',
  CONVERSATION_BUSY: 'trailie_generation_in_progress',
  USER_BUSY: 'trailie_concurrent_generation_limit',
});

export function formatTrailieRetryAfter(seconds) {
  const value = Math.ceil(Number(seconds));
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value < 60) return `about ${value} second${value === 1 ? '' : 's'}`;
  const minutes = Math.ceil(value / 60);
  return `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/** Returns `{ toast, message }` for a fair-use refusal, or null. */
export function trailieFairUseRefusalCopy(status, details) {
  const code = details?.code;
  if (status === 429 && code === TRAILIE_FAIR_USE_CODES.BURST) {
    const wait = formatTrailieRetryAfter(details?.retryAfterSeconds);
    return {
      toast: wait ? `You can send your next message in ${wait}` : 'Please wait a moment and try again',
      message: `⏳ **Taking a short breather**\n\nYou've sent a lot of messages in a short time. ${wait
        ? `You can send your next message in ${wait}.`
        : 'Please wait a few minutes, then send your next message.'} Your trip is saved.`,
    };
  }
  if (status === 409 && code === TRAILIE_FAIR_USE_CODES.CONVERSATION_BUSY) {
    return {
      toast: 'Still working on your last message',
      message: '**One at a time**\n\nTrailie is still working on your last message for this trip (maybe in another tab). Once it finishes, send your next message.',
    };
  }
  if (status === 409 && code === TRAILIE_FAIR_USE_CODES.USER_BUSY) {
    return {
      toast: 'Trailie is busy with your other trips',
      message: '**One moment**\n\nTrailie is already working on two of your messages in other tabs. When one finishes, send this one again.',
    };
  }
  return null;
}
