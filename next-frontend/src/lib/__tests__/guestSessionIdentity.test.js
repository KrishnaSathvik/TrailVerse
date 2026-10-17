import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GUEST_PENDING_TURN_KEY,
  GUEST_SESSION_STORAGE_KEY,
  TEMP_GUEST_CHAT_STATE_KEY,
  ensureGuestSessionIdentity,
  isValidGuestSessionId,
} from '../guestSessionIdentity';

const FIRST_UUID = '123e4567-e89b-42d3-a456-426614174000';
const SECOND_UUID = '223e4567-e89b-42d3-a456-426614174000';

function cryptoSequence(...values) {
  const randomUUID = vi.fn();
  values.forEach((value) => randomUUID.mockReturnValueOnce(value));
  return { randomUUID };
}

describe('guest session identity', () => {
  beforeEach(() => localStorage.clear());

  it('mints and persists a V2 ID before the first request', () => {
    const result = ensureGuestSessionIdentity({
      storage: localStorage,
      cryptoImpl: cryptoSequence(FIRST_UUID),
      now: () => 1000,
    });

    expect(result.anonymousId).toBe(`guest_v2_${FIRST_UUID}`);
    expect(result.rotatedLegacy).toBe(false);
    expect(isValidGuestSessionId(result.anonymousId)).toBe(true);
    expect(JSON.parse(localStorage.getItem(GUEST_SESSION_STORAGE_KEY))).toEqual({
      anonymousId: result.anonymousId,
      messageCount: 0,
      canSendMore: true,
      timestamp: 1000,
    });
  });

  it('keeps one V2 ID across reloads and same-storage pages', () => {
    const cryptoImpl = cryptoSequence(FIRST_UUID, SECOND_UUID);
    const first = ensureGuestSessionIdentity({ storage: localStorage, cryptoImpl, now: () => 1000 });
    const reloaded = ensureGuestSessionIdentity({ storage: localStorage, cryptoImpl, now: () => 2000 });

    expect(reloaded.anonymousId).toBe(first.anonymousId);
    expect(reloaded.created).toBe(false);
    expect(cryptoImpl.randomUUID).toHaveBeenCalledTimes(1);
  });

  it('rotates a legacy ID exactly once without importing guest conversation state', () => {
    localStorage.setItem(GUEST_SESSION_STORAGE_KEY, JSON.stringify({
      anonymousId: 'anon_0123456789abcdef_012345',
      messageCount: 4,
      messages: [{ role: 'user', content: 'Olympic' }],
      activeTripContext: { parkName: 'Olympic National Park' },
      formData: { parkName: 'Olympic National Park' },
      timestamp: 500,
    }));
    localStorage.setItem(TEMP_GUEST_CHAT_STATE_KEY, JSON.stringify({
      messages: [{ role: 'user', content: 'Olympic' }],
      plan: { days: [1, 2, 3] },
    }));
    localStorage.setItem(GUEST_PENDING_TURN_KEY, JSON.stringify({
      anonymousId: 'anon_0123456789abcdef_012345',
      status: 'pending',
    }));
    const cryptoImpl = cryptoSequence(FIRST_UUID, SECOND_UUID);

    const rotated = ensureGuestSessionIdentity({ storage: localStorage, cryptoImpl, now: () => 1000 });
    const reloaded = ensureGuestSessionIdentity({ storage: localStorage, cryptoImpl, now: () => 2000 });
    const stored = JSON.parse(localStorage.getItem(GUEST_SESSION_STORAGE_KEY));

    expect(rotated.rotatedLegacy).toBe(true);
    expect(reloaded.anonymousId).toBe(rotated.anonymousId);
    expect(cryptoImpl.randomUUID).toHaveBeenCalledTimes(1);
    expect(stored).toEqual({
      anonymousId: rotated.anonymousId,
      messageCount: 0,
      canSendMore: true,
      timestamp: 1000,
    });
    expect(localStorage.getItem(TEMP_GUEST_CHAT_STATE_KEY)).toBeNull();
    expect(localStorage.getItem(GUEST_PENDING_TURN_KEY)).toBeNull();
  });

  it('does not share identity between clean storage contexts', () => {
    const storageA = window.localStorage;
    const storageB = {
      values: new Map(),
      getItem(key) { return this.values.get(key) ?? null; },
      setItem(key, value) { this.values.set(key, String(value)); },
      removeItem(key) { this.values.delete(key); },
    };

    const a = ensureGuestSessionIdentity({ storage: storageA, cryptoImpl: cryptoSequence(FIRST_UUID) });
    const b = ensureGuestSessionIdentity({ storage: storageB, cryptoImpl: cryptoSequence(SECOND_UUID) });

    expect(a.anonymousId).not.toBe(b.anonymousId);
  });
});
