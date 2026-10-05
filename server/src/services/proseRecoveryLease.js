const { randomUUID } = require('crypto');

/**
 * Stage 14.4 — the spend fence for explicit prose recovery.
 *
 * Idempotent revision-2 PERSISTENCE does not prevent duplicate SPEND: by the time
 * two writes collide, both Phase B calls have already been paid for. The fence
 * therefore has to sit in front of the provider call, and it has to survive past
 * generation — between "server streamed revision 2" and "client persisted
 * revision 2" the stored trip still holds revision 1, so a second tab would
 * otherwise cheerfully buy the same prose again.
 *
 * The unique index on (userId, responseId) IS the concurrency boundary. The TTL
 * index is cleanup only: every path below compares `expiresAt` to the current
 * time itself, so correctness never waits on Mongo's background deleter.
 *
 * The Model is injected so the whole matrix — including the duplicate-key race —
 * is testable offline against a fake that enforces the same unique constraint.
 */

const LEASE_STATE = {
  GENERATING: 'generating',
  AWAITING_PERSISTENCE: 'awaiting_persistence',
};

const LEASE_OUTCOME = {
  ACQUIRED: 'acquired',
  CONFLICT_GENERATING: 'conflict_generating',
  CONFLICT_AWAITING_PERSISTENCE: 'conflict_awaiting_persistence',
};

/** Accepted persistence outcomes that may retire a lease. */
const ACCEPTED_OUTCOMES = new Set(['accept', 'idempotent']);

const conflictOutcomeFor = (state) =>
  state === LEASE_STATE.AWAITING_PERSISTENCE
    ? LEASE_OUTCOME.CONFLICT_AWAITING_PERSISTENCE
    : LEASE_OUTCOME.CONFLICT_GENERATING;

/**
 * Acquire, or reclaim an expired lease, in ONE atomic operation.
 *
 * The filter deliberately requires `expiresAt <= now`, so a live lease does not
 * match and the upsert degrades into an insert that the unique index rejects
 * with E11000. That duplicate-key error is the conflict signal, not a fault.
 */
async function acquireRecoveryLease({
  Model,
  userId,
  responseId,
  tripId,
  itineraryHash = null,
  now = new Date(),
  leaseMs,
  retryAfterSeconds = 60,
}) {
  const leaseToken = `${randomUUID()}${randomUUID()}`.replace(/-/g, '');
  const expiresAt = new Date(now.getTime() + leaseMs);

  try {
    const lease = await Model.findOneAndUpdate(
      { userId, responseId, expiresAt: { $lte: now } },
      {
        $set: {
          userId,
          responseId,
          tripId,
          leaseToken,
          state: LEASE_STATE.GENERATING,
          itineraryHash,
          // A reclaimed lease must not inherit the previous attempt's result.
          expectedContentHash: null,
          generationCompletedAt: null,
          acquiredAt: now,
          expiresAt,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return { outcome: LEASE_OUTCOME.ACQUIRED, lease };
  } catch (err) {
    if (err && err.code === 11000) {
      // Lost the race, or a live lease already exists. Report WHICH, so the
      // route can distinguish "being generated" from "already generated,
      // waiting to be saved".
      const existing = await Model.findOne({ userId, responseId });
      return {
        outcome: conflictOutcomeFor(existing?.state),
        retryAfterSeconds,
      };
    }
    throw err;
  }
}

/**
 * Close the window between generation and client persistence.
 *
 * Called BEFORE `prose_ready` is emitted, so there is never a moment where prose
 * has been sent but the fence has already been dropped.
 */
async function transitionToAwaitingPersistence({
  Model,
  userId,
  responseId,
  leaseToken,
  expectedContentHash,
  itineraryHash,
  now = new Date(),
  leaseMs,
}) {
  // The leaseToken in the filter is what makes a stale owner harmless.
  const updated = await Model.findOneAndUpdate(
    { userId, responseId, leaseToken },
    {
      $set: {
        state: LEASE_STATE.AWAITING_PERSISTENCE,
        expectedContentHash,
        itineraryHash,
        generationCompletedAt: now,
        expiresAt: new Date(now.getTime() + leaseMs),
      },
    },
    { new: true }
  );

  if (!updated) return { ok: false, reason: 'stale_lease_token' };
  return { ok: true, lease: updated };
}

/**
 * Release a lease this request still owns. Used when no terminal prose was
 * produced — abort, disconnect before the provider call, or a hard failure.
 */
async function releaseRecoveryLease({ Model, userId, responseId, leaseToken }) {
  const existing = await Model.findOne({ userId, responseId });
  if (!existing) return { released: false, reason: 'no_lease' };
  if (existing.leaseToken !== leaseToken) {
    // A newer owner reclaimed it. Never clear someone else's fence.
    return { released: false, reason: 'stale_lease_token' };
  }

  const result = await Model.deleteOne({ userId, responseId, leaseToken });
  return { released: (result?.deletedCount || 0) > 0 };
}

/**
 * Retire the fence once terminal revision 2 is durable.
 *
 * This is LEASE CLEANUP, not response persistence: it runs after the normal
 * `tripController` write has already been accepted, is conditioned on the
 * response identity and the recorded hashes, and never rolls anything back.
 * A failure here is logged with a bounded code and left to the TTL index.
 */
async function clearLeaseAfterPersistence({
  Model,
  userId,
  responseId,
  outcome,
  responseRevision,
  contentHash,
  itineraryHash,
}) {
  if (!ACCEPTED_OUTCOMES.has(String(outcome || '').toLowerCase())) {
    return { cleared: false, reason: 'persistence_not_accepted' };
  }
  // A revision-1 write means the recovery result is still outstanding.
  if (Number(responseRevision) !== 2) {
    return { cleared: false, reason: 'not_terminal_revision' };
  }

  try {
    const existing = await Model.findOne({ userId, responseId });
    if (!existing) return { cleared: false, reason: 'no_lease' };

    // When the lease recorded expectations, the durable write must match them.
    const contentMismatch =
      existing.expectedContentHash != null && existing.expectedContentHash !== contentHash;
    const itineraryMismatch =
      existing.itineraryHash != null && existing.itineraryHash !== itineraryHash;
    if (contentMismatch || itineraryMismatch) {
      return { cleared: false, reason: 'reconciliation_hash_mismatch' };
    }

    const result = await Model.deleteOne({ userId, responseId, leaseToken: existing.leaseToken });
    return { cleared: (result?.deletedCount || 0) > 0, reason: 'cleared' };
  } catch {
    // Bounded code only — no driver detail reaches the caller, and the canonical
    // trip write that already succeeded is never rolled back.
    return { cleared: false, reason: 'lease_cleanup_failed' };
  }
}

module.exports = {
  LEASE_STATE,
  LEASE_OUTCOME,
  acquireRecoveryLease,
  transitionToAwaitingPersistence,
  releaseRecoveryLease,
  clearLeaseAfterPersistence,
};
