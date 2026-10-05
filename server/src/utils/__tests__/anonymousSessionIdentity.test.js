const {
  GUEST_SESSION_ID_MAX_LENGTH,
  getAnonymousRequestMetadata,
  isLegacyGuestSessionId,
  isValidGuestSessionId,
  mintGuestSessionId,
  resolveAnonymousRequestIdentity,
} = require('../anonymousIdGenerator');

function requestWithSharedFingerprint() {
  return {
    ip: '203.0.113.42',
    headers: {
      'user-agent': 'Shared Browser/1.0',
      'accept-language': 'en-US',
      'accept-encoding': 'gzip',
      accept: 'application/json',
    },
    get(name) {
      return this.headers[String(name).toLowerCase()];
    },
  };
}

describe('anonymous session identity', () => {
  test('mints bounded high-entropy V2 guest identities', () => {
    const first = mintGuestSessionId();
    const second = mintGuestSessionId();

    expect(first).not.toBe(second);
    expect(isValidGuestSessionId(first)).toBe(true);
    expect(first.length).toBeLessThanOrEqual(GUEST_SESSION_ID_MAX_LENGTH);
  });

  test('preserves a valid client bearer ID while retaining fingerprint only as metadata', () => {
    const anonymousId = mintGuestSessionId();
    const resolved = resolveAnonymousRequestIdentity(requestWithSharedFingerprint(), anonymousId);

    expect(resolved.anonymousId).toBe(anonymousId);
    expect(resolved.acceptedClientId).toBe(true);
    expect(resolved.ipAddress).toBe('203.0.113.42');
    expect(resolved.browserFingerprint).toBe(getAnonymousRequestMetadata(requestWithSharedFingerprint()).browserFingerprint);
  });

  test('two missing IDs under an identical fingerprint receive independent sessions', () => {
    const first = resolveAnonymousRequestIdentity(requestWithSharedFingerprint());
    const second = resolveAnonymousRequestIdentity(requestWithSharedFingerprint());

    expect(first.anonymousId).not.toBe(second.anonymousId);
    expect(first.browserFingerprint).toBe(second.browserFingerprint);
    expect(first.acceptedClientId).toBe(false);
    expect(second.acceptedClientId).toBe(false);
  });

  test.each([
    'anon_0123456789abcdef_012345',
    'guest_v2_not-a-uuid',
    `guest_v2_${'a'.repeat(500)}`,
    '../guest_v2_bad',
  ])('rotates invalid or legacy client identity %s', (candidate) => {
    const resolved = resolveAnonymousRequestIdentity(requestWithSharedFingerprint(), candidate);

    expect(resolved.anonymousId).not.toBe(candidate);
    expect(isValidGuestSessionId(resolved.anonymousId)).toBe(true);
    expect(resolved.acceptedClientId).toBe(false);
  });

  test('recognizes only the legacy deterministic ID shape as legacy', () => {
    expect(isLegacyGuestSessionId('anon_0123456789abcdef_012345')).toBe(true);
    expect(isLegacyGuestSessionId(mintGuestSessionId())).toBe(false);
    expect(isLegacyGuestSessionId('arbitrary-user-input')).toBe(false);
  });
});
