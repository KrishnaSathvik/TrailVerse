const {
  createVoiceToolSession,
  validateVoiceToolSession,
  revokeVoiceToolSession,
  _resetVoiceSessionStoreForTests,
} = require('../voiceSessionStore');

describe('voiceSessionStore', () => {
  beforeEach(() => {
    _resetVoiceSessionStoreForTests();
  });

  it('creates and validates a tool session token', () => {
    const { token, expiresAt } = createVoiceToolSession({ userId: 'u1', ip: '127.0.0.1' });
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(validateVoiceToolSession(token)).toEqual(
      expect.objectContaining({ ok: true })
    );
  });

  it('rejects missing and invalid tokens', () => {
    expect(validateVoiceToolSession('')).toEqual({ ok: false, reason: 'missing' });
    expect(validateVoiceToolSession('nope')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('revokes tokens', () => {
    const { token } = createVoiceToolSession();
    revokeVoiceToolSession(token);
    expect(validateVoiceToolSession(token)).toEqual({ ok: false, reason: 'invalid' });
  });
});
