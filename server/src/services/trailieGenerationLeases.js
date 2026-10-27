'use strict';

/**
 * Cross-instance Trailie generation leases for signed-in users.
 *
 * - At most ONE active generation per (user, conversation/trip).
 * - At most N (default 2) active generations per user, as N slot documents.
 *
 * Every lease is a Mongo document keyed by `_id`. Acquire is a single atomic
 * upsert whose filter only matches an EXPIRED document; a live holder makes
 * the upsert collide on the unique `_id` (E11000), which means "busy". This is
 * linearizable per key on any number of app instances sharing the database.
 * A live generation renews its leases; a crashed instance stops renewing and
 * its leases become free once `expiresAt` passes (the TTL index only garbage
 * collects; acquire never waits for the ~60s TTL monitor).
 */

const { randomUUID } = require('crypto');

const BUSY_CODES = Object.freeze({
  CONVERSATION: 'trailie_generation_in_progress',
  USER: 'trailie_concurrent_generation_limit',
});

function conversationLeaseKey(principal, conversationKey) {
  return `c:${principal}:${String(conversationKey).slice(0, 128)}`;
}

function userSlotKey(principal, slot) {
  return `u:${principal}:${slot}`;
}

const sleep = ms => new Promise(resolve => { const t = setTimeout(resolve, ms); t.unref?.(); });

function createGenerationLeaseService({
  LeaseModel = require('../models/TrailieGenerationLease'),
  now = () => Date.now(),
  log = (...args) => console.warn(...args),
} = {}) {
  async function tryAcquire(key, fields, ttlMs) {
    const at = now();
    try {
      await LeaseModel.findOneAndUpdate(
        { _id: key, expiresAt: { $lte: new Date(at) } },
        { $set: { ...fields, acquiredAt: new Date(at), expiresAt: new Date(at + ttlMs) } },
        { upsert: true, new: true, lean: true },
      );
      return { acquired: true };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const holder = await LeaseModel.findById(key).lean();
      // The holder may have released between the collision and this read.
      if (!holder || holder.expiresAt.getTime() <= now()) return { acquired: false, retryNow: true, holder: null };
      return { acquired: false, holder };
    }
  }

  async function releaseKeys(keys, ownerToken) {
    if (!keys.length) return;
    await LeaseModel.deleteMany({ _id: { $in: keys }, ownerToken });
  }

  async function acquireOnce({ principal, conversationKey, clientTurnId, route, maxActivePerUser, ttlMs, ownerToken }) {
    const held = [];
    const base = { principalHash: principal, ownerToken, clientTurnId: clientTurnId || null, route: route || null };
    const blockers = [];
    try {
      if (conversationKey) {
        const key = conversationLeaseKey(principal, conversationKey);
        let attempt = await tryAcquire(key, { ...base, scope: 'conversation' }, ttlMs);
        if (!attempt.acquired && attempt.retryNow) attempt = await tryAcquire(key, { ...base, scope: 'conversation' }, ttlMs);
        if (!attempt.acquired) {
          return { admitted: false, code: BUSY_CODES.CONVERSATION, holders: [attempt.holder].filter(Boolean) };
        }
        held.push(key);
      }
      for (let slot = 0; slot < maxActivePerUser; slot += 1) {
        const key = userSlotKey(principal, slot);
        let attempt = await tryAcquire(key, { ...base, scope: 'user' }, ttlMs);
        if (!attempt.acquired && attempt.retryNow) attempt = await tryAcquire(key, { ...base, scope: 'user' }, ttlMs);
        if (attempt.acquired) { held.push(key); return { admitted: true, keys: held }; }
        if (attempt.holder) blockers.push(attempt.holder);
      }
      await releaseKeys(held, ownerToken);
      return { admitted: false, code: BUSY_CODES.USER, holders: blockers };
    } catch (error) {
      await releaseKeys(held, ownerToken).catch(() => {});
      throw error;
    }
  }

  /**
   * Returns `{ admitted: true, lease }` or `{ admitted: false, code }`.
   * `lease.release()` is idempotent and owner-fenced, so a late release from a
   * superseded owner can never free someone else's lease.
   */
  async function acquire({ principal, conversationKey = null, clientTurnId = null, route = null,
    maxActivePerUser = 2, ttlMs, maxHoldMs, sameTurnWaitMs = 0 }) {
    const ownerToken = randomUUID();
    const deadline = now() + Math.max(0, sameTurnWaitMs);
    let outcome;
    for (;;) {
      outcome = await acquireOnce({ principal, conversationKey, clientTurnId, route, maxActivePerUser, ttlMs, ownerToken });
      if (outcome.admitted) break;
      // Only a resend of the SAME client turn (stream -> non-stream fallback,
      // transport retry) waits briefly for its predecessor's lease to clear.
      const sameTurn = clientTurnId && outcome.holders.some(h => h.clientTurnId === clientTurnId);
      if (!sameTurn || now() >= deadline) return { admitted: false, code: outcome.code };
      await sleep(Math.min(200, Math.max(1, deadline - now())));
    }
    const keys = outcome.keys;
    const acquiredAt = now();
    let released = false;
    let renewTimer = null;
    const renew = async () => {
      if (released) return false;
      if (now() - acquiredAt >= maxHoldMs) return false;
      const at = now();
      const expiresAt = new Date(Math.min(at + ttlMs, acquiredAt + maxHoldMs));
      const result = await LeaseModel.updateMany({ _id: { $in: keys }, ownerToken }, { $set: { expiresAt } });
      return result.modifiedCount > 0 || result.matchedCount > 0;
    };
    const intervalMs = Math.max(1000, Math.floor(ttlMs / 3));
    renewTimer = setInterval(() => {
      renew().then((alive) => {
        if (!alive && renewTimer) { clearInterval(renewTimer); renewTimer = null; }
      }).catch(error => log('[Trailie fair_use] lease renew failed', { code: error?.code || 'lease_renew_failed' }));
    }, intervalMs);
    renewTimer.unref?.();
    const release = async () => {
      if (released) return;
      released = true;
      if (renewTimer) { clearInterval(renewTimer); renewTimer = null; }
      await releaseKeys(keys, ownerToken);
    };
    return { admitted: true, lease: { keys, ownerToken, renew, release } };
  }

  return { acquire };
}

module.exports = { createGenerationLeaseService, BUSY_CODES, conversationLeaseKey, userSlotKey };
