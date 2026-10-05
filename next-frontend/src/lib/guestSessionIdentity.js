export const GUEST_SESSION_STORAGE_KEY = 'anonymousSession';
export const TEMP_GUEST_CHAT_STATE_KEY = 'planai-chat-state';
export const GUEST_PENDING_TURN_KEY = 'trailverse_guest_pending_turn';

export const GUEST_SESSION_ID_PREFIX = 'guest_v2_';
export const GUEST_SESSION_ID_MAX_LENGTH = GUEST_SESSION_ID_PREFIX.length + 36;

const GUEST_SESSION_ID_PATTERN = /^guest_v2_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_GUEST_SESSION_ID_PATTERN = /^anon_[0-9a-f]{16}_[0-9a-f]{6}$/i;

export function isValidGuestSessionId(value) {
  return (
    typeof value === 'string' &&
    value.length <= GUEST_SESSION_ID_MAX_LENGTH &&
    GUEST_SESSION_ID_PATTERN.test(value)
  );
}

export function isLegacyGuestSessionId(value) {
  return typeof value === 'string' && LEGACY_GUEST_SESSION_ID_PATTERN.test(value);
}

function bytesToUuid(bytes) {
  const next = new Uint8Array(bytes);
  next[6] = (next[6] & 0x0f) | 0x40;
  next[8] = (next[8] & 0x3f) | 0x80;
  const hex = Array.from(next, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function mintGuestSessionId(cryptoImpl = globalThis.crypto) {
  if (typeof cryptoImpl?.randomUUID === 'function') {
    return `${GUEST_SESSION_ID_PREFIX}${cryptoImpl.randomUUID()}`;
  }
  if (typeof cryptoImpl?.getRandomValues === 'function') {
    return `${GUEST_SESSION_ID_PREFIX}${bytesToUuid(cryptoImpl.getRandomValues(new Uint8Array(16)))}`;
  }
  throw new Error('Secure browser randomness is unavailable for guest session creation');
}

function readStoredSession(storage) {
  try {
    const raw = storage.getItem(GUEST_SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Establish the guest bearer secret synchronously on /plan-ai boot, before an
 * AI request can be dispatched. Legacy/invalid state is deliberately not
 * migrated because it may already contain another browser's conversation.
 */
export function ensureGuestSessionIdentity({
  storage = globalThis.localStorage,
  cryptoImpl = globalThis.crypto,
  now = Date.now,
} = {}) {
  const existing = readStoredSession(storage);
  if (isValidGuestSessionId(existing?.anonymousId)) {
    return {
      anonymousId: existing.anonymousId,
      created: false,
      rotatedLegacy: false,
    };
  }

  const anonymousId = mintGuestSessionId(cryptoImpl);
  const cleanSession = {
    anonymousId,
    messageCount: 0,
    canSendMore: true,
    timestamp: now(),
  };

  // A legacy identity can be shared by multiple browsers. No conversation,
  // trip, quota hint, or pending-turn cache is safe to carry across rotation.
  storage.removeItem(TEMP_GUEST_CHAT_STATE_KEY);
  storage.removeItem(GUEST_PENDING_TURN_KEY);
  storage.setItem(GUEST_SESSION_STORAGE_KEY, JSON.stringify(cleanSession));

  return {
    anonymousId,
    created: true,
    rotatedLegacy: isLegacyGuestSessionId(existing?.anonymousId),
  };
}
