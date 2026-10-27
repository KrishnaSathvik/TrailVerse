'use strict';

/**
 * Sliding-window burst limit on USER-INITIATED signed-in Trailie turns.
 *
 * One call per HTTP turn admission, never per model call, tool call,
 * correction, or provider retry (those all happen inside one admitted turn).
 * A resend carrying the same `clientTurnId` (stream -> non-stream fallback,
 * axios network/5xx retry) is admitted without being counted again, up to
 * `maxTransportAttemptsPerTurn` transport attempts per id.
 *
 * Cross-instance safety: the per-principal window document is updated by
 * optimistic compare-and-swap on `version` (or a unique-_id insert for the
 * first turn), so two instances can never both admit the 31st turn.
 */

const RATE_CODE = 'trailie_turn_burst_limit';
const MAX_CAS_ATTEMPTS = 8;

function createTurnBurstService({
  BurstModel = require('../models/TrailieTurnBurst'),
  now = () => Date.now(),
  log = (...args) => console.warn(...args),
} = {}) {
  async function admit({ principal, clientTurnId = null, maxTurns, windowMs, maxTransportAttempts = 5 }) {
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const doc = await BurstModel.findById(principal).lean();
      const at = now();
      const live = (doc?.turns || []).filter(turn => new Date(turn.at).getTime() > at - windowMs)
        .map(turn => ({ id: turn.id ?? null, at: new Date(turn.at), attempts: turn.attempts || 1 }));
      let existingIndex = -1;
      if (clientTurnId) {
        for (let i = live.length - 1; i >= 0; i -= 1) if (live[i].id === clientTurnId) { existingIndex = i; break; }
      }
      let next;
      let duplicate = false;
      if (existingIndex >= 0 && live[existingIndex].attempts < maxTransportAttempts) {
        duplicate = true;
        next = live.map((turn, i) => (i === existingIndex ? { ...turn, attempts: turn.attempts + 1 } : turn));
      } else {
        if (live.length >= maxTurns) {
          const oldest = Math.min(...live.map(turn => turn.at.getTime()));
          return {
            admitted: false,
            code: RATE_CODE,
            count: live.length,
            retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - at) / 1000)),
          };
        }
        next = [...live, { id: clientTurnId || null, at: new Date(at), attempts: 1 }];
      }
      const expiresAt = new Date(Math.max(...next.map(turn => turn.at.getTime())) + windowMs);
      try {
        if (!doc) {
          await BurstModel.create({ _id: principal, version: 1, turns: next, expiresAt });
        } else {
          const result = await BurstModel.updateOne({ _id: principal, version: doc.version },
            { $set: { turns: next, expiresAt }, $inc: { version: 1 } });
          if (result.matchedCount === 0) continue;
        }
        return { admitted: true, duplicate, count: duplicate ? live.length : next.length };
      } catch (error) {
        if (error?.code === 11000) continue;
        throw error;
      }
    }
    // Sustained contention on one account's window (more parallel admissions
    // than the 2-generation lease allows) — fail open, but say so.
    log('[Trailie fair_use] burst admission contention; admitting', { attempts: MAX_CAS_ATTEMPTS });
    return { admitted: true, duplicate: false, contended: true };
  }

  return { admit };
}

module.exports = { createTurnBurstService, RATE_CODE };
