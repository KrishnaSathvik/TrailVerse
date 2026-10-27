import { describe, expect, it } from 'vitest';
import { formatTrailieRetryAfter, trailieFairUseRefusalCopy, TRAILIE_FAIR_USE_CODES } from '../trailieFairUseCopy';

describe('signed-in Trailie fair-use refusal copy', () => {
  it('formats Retry-After seconds into a friendly wait', () => {
    expect(formatTrailieRetryAfter(1)).toBe('about 1 second');
    expect(formatTrailieRetryAfter(42)).toBe('about 42 seconds');
    expect(formatTrailieRetryAfter(60)).toBe('about 1 minute');
    expect(formatTrailieRetryAfter(61)).toBe('about 2 minutes');
    expect(formatTrailieRetryAfter(900)).toBe('about 15 minutes');
    expect(formatTrailieRetryAfter(null)).toBeNull();
    expect(formatTrailieRetryAfter(0)).toBeNull();
  });

  it('tells the traveler when to retry after a burst 429', () => {
    const copy = trailieFairUseRefusalCopy(429, { code: TRAILIE_FAIR_USE_CODES.BURST, retryAfterSeconds: 240 });
    expect(copy.toast).toBe('You can send your next message in about 4 minutes');
    expect(copy.message).toContain('You can send your next message in about 4 minutes.');
    expect(copy.message).not.toMatch(/daily|limit reached|upgrade/i);
  });

  it('falls back to a generic wait when the server omits retryAfterSeconds', () => {
    const copy = trailieFairUseRefusalCopy(429, { code: TRAILIE_FAIR_USE_CODES.BURST });
    expect(copy.message).toContain('Please wait a few minutes');
  });

  it('explains one-at-a-time and per-account busy refusals', () => {
    expect(trailieFairUseRefusalCopy(409, { code: TRAILIE_FAIR_USE_CODES.CONVERSATION_BUSY }).message).toContain('still working on your last message');
    expect(trailieFairUseRefusalCopy(409, { code: TRAILIE_FAIR_USE_CODES.USER_BUSY }).message).toContain('two of your messages');
  });

  it('leaves the existing request-rate and guest paths untouched', () => {
    expect(trailieFairUseRefusalCopy(429, { error: 'Too many requests' })).toBeNull();
    expect(trailieFairUseRefusalCopy(429, undefined)).toBeNull();
    expect(trailieFairUseRefusalCopy(409, { error: 'guest_turn_in_progress', code: 'guest_turn_in_progress' })).toBeNull();
  });
});
