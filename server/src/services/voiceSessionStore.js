const crypto = require('crypto');
const { getVoiceConfig } = require('../config/voiceConfig');

/**
 * In-memory binding for voice tool authorization.
 * Maps toolSessionToken → { createdAt, expiresAt, userId, ip }.
 * Process-local (same limitation as existing voice rate-limit Map).
 */
const sessions = new Map();

function pruneExpired(now = Date.now()) {
  for (const [token, entry] of sessions) {
    if (now > entry.expiresAt) sessions.delete(token);
  }
}

function createVoiceToolSession({ userId = null, ip = null } = {}) {
  pruneExpired();
  const { sessionTtlMs } = getVoiceConfig();
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  sessions.set(token, {
    createdAt: now,
    expiresAt: now + sessionTtlMs,
    userId: userId || null,
    ip: ip || null,
  });
  return { token, expiresAt: now + sessionTtlMs };
}

function validateVoiceToolSession(token) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'missing' };
  pruneExpired();
  const entry = sessions.get(token);
  if (!entry) return { ok: false, reason: 'invalid' };
  if (Date.now() > entry.expiresAt) {
    sessions.delete(token);
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, entry };
}

function revokeVoiceToolSession(token) {
  if (token) sessions.delete(token);
}

/** Test helper */
function _resetVoiceSessionStoreForTests() {
  sessions.clear();
}

module.exports = {
  createVoiceToolSession,
  validateVoiceToolSession,
  revokeVoiceToolSession,
  _resetVoiceSessionStoreForTests,
};
