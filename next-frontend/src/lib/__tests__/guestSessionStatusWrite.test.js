import { describe, it, expect } from 'vitest';
import { applySessionStatusToStoredSession } from '@/lib/guestSessionStatusWrite';

/**
 * P0-1 secondary defect (audit 2026-08-31): validateSessionWithBackend wrote
 * whatever /ai/session-status returned straight into the stored anonymous
 * session. A stale read (served from cache, or resolving out of order) with
 * messageCount: 0 unlinked a session that had already completed turns — which
 * flipped the chat mount key and corrupted quota display.
 *
 * Contract: a session-status read may only move the stored session FORWARD.
 */

const stored = {
  anonymousId: 'anon_1',
  messageCount: 2,
  canSendMore: true,
  avatarUrl: 'https://example.test/a.svg',
  timestamp: 1_000,
};

describe('applySessionStatusToStoredSession', () => {
  it('applies a fresh status that advances the session', () => {
    const next = applySessionStatusToStoredSession(stored, {
      messageCount: 3,
      canSendMore: true,
    });
    expect(next).toMatchObject({
      anonymousId: 'anon_1',
      messageCount: 3,
      canSendMore: true,
      avatarUrl: 'https://example.test/a.svg',
    });
  });

  it('applies a status with the same messageCount (canSendMore may still change)', () => {
    const next = applySessionStatusToStoredSession(stored, {
      messageCount: 2,
      canSendMore: false,
    });
    expect(next).toMatchObject({ messageCount: 2, canSendMore: false });
  });

  it('refuses to write a status that would lower messageCount', () => {
    const next = applySessionStatusToStoredSession(stored, {
      messageCount: 0,
      canSendMore: true,
    });
    expect(next).toBeNull();
  });

  it('returns null when there is no stored session to update', () => {
    expect(applySessionStatusToStoredSession(null, { messageCount: 1, canSendMore: true })).toBeNull();
  });

  it('returns null for a malformed status', () => {
    expect(applySessionStatusToStoredSession(stored, null)).toBeNull();
    expect(applySessionStatusToStoredSession(stored, {})).toBeNull();
  });
});
