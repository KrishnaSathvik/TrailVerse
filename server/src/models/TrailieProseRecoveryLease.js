const mongoose = require('mongoose');

/**
 * Stage 14.4 — the spend fence for explicit prose recovery.
 *
 * This is CONCURRENCY CONTROL, not response content. The recovery route may
 * write this collection and nothing else; `tripController` remains the only
 * writer of trip content, and the client remains the sole persistence initiator.
 *
 * Two states, because releasing on generation-complete is not enough:
 *
 *   generating           — a Phase B provider call is in flight
 *   awaiting_persistence — prose was produced and streamed, but the client has
 *                          not yet persisted revision 2. The stored trip still
 *                          holds revision 1, so without this state a second tab
 *                          would happily buy the same result again.
 *
 * The lease is cleared when terminal revision 2 is accepted (or recognized as
 * idempotent) by the normal persistence path — never by a client ACK endpoint.
 */
const trailieProseRecoveryLeaseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'TripPlan', required: true },
    responseId: { type: String, required: true },

    /** Random per acquisition. A stale owner cannot mutate a newer lease. */
    leaseToken: { type: String, required: true },
    state: {
      type: String,
      enum: ['generating', 'awaiting_persistence'],
      required: true,
      default: 'generating',
    },

    // Bounded reconciliation metadata ONLY. Never prose, prompts, provider
    // payloads, rejected drafts, tool arguments, or verifier internals.
    itineraryHash: { type: String, default: null },
    expectedContentHash: { type: String, default: null },

    acquiredAt: { type: Date, required: true },
    generationCompletedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// The concurrency boundary. Exactly one live lease per (user, response).
trailieProseRecoveryLeaseSchema.index({ userId: 1, responseId: 1 }, { unique: true });

// Cleanup only. Correctness must NOT depend on Mongo deleting promptly — every
// read path compares `expiresAt` against the current time itself.
trailieProseRecoveryLeaseSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports =
  mongoose.models.TrailieProseRecoveryLease ||
  mongoose.model('TrailieProseRecoveryLease', trailieProseRecoveryLeaseSchema);
