'use strict';

const mongoose = require('mongoose');

/**
 * Stage 9 — durable shadow-review job.
 *
 * One job == one canonical response evaluated once by the async reviewer. The
 * job carries a short-lived payload (the immutable snapshot) that the worker
 * needs, then clears it on success. Terminal jobs that still hold a payload
 * (failed / dead) expire via a TTL index so canonical response text and public
 * fact text never linger indefinitely.
 */

const JOB_STATUS = {
  QUEUED: 'queued',
  LEASED: 'leased',
  COMPLETED: 'completed',
  RETRY: 'retry',
  FAILED: 'failed',
  DEAD: 'dead',
  INVALID: 'invalid',
};

const trailieReviewJobSchema = new mongoose.Schema(
  {
    jobId: { type: String, required: true, unique: true },

    // Canonical response identity.
    responseId: { type: String, required: true, index: true },
    responseVersion: { type: Number, required: true },
    contentHash: { type: String, required: true },
    itineraryHash: { type: String, default: null },
    reviewerVersion: { type: String, required: true },

    // responseId + contentHash + itineraryHash + reviewerVersion. Unique →
    // exact duplicate enqueue is idempotent; never two billable jobs for the
    // same canonical response/version.
    idempotencyKey: { type: String, required: true, unique: true },

    status: {
      type: String,
      enum: Object.values(JOB_STATUS),
      default: JOB_STATUS.QUEUED,
      index: true,
    },

    // Sampling provenance (aggregate-safe; no user data).
    sampleRate: { type: Number, default: 0 },
    sampleBucket: { type: Number, default: null },

    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    nextRunAt: { type: Date, default: () => new Date(), index: true },

    // Lease — set atomically on claim, cleared on release.
    leaseOwner: { type: String, default: null },
    leaseExpiresAt: { type: Date, default: null },

    // Short-lived operational payload (the immutable snapshot). Cleared after a
    // successful completion; retained only on failed/dead until TTL fires.
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    // Sanitized result summary mirror (full telemetry lives in its own model).
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    lastError: { type: String, default: null },
    lastErrorClass: { type: String, default: null },

    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    // TTL anchor — set ONLY when a terminal state still carries a payload.
    payloadExpiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Claim query: status in {queued, retry} + nextRunAt <= now + no live lease.
trailieReviewJobSchema.index({ status: 1, nextRunAt: 1 });
// TTL — drops failed/dead jobs (and their payloads) after the retention window.
trailieReviewJobSchema.index({ payloadExpiresAt: 1 }, { expireAfterSeconds: 0 });

trailieReviewJobSchema.statics.JOB_STATUS = JOB_STATUS;

module.exports = mongoose.model('TrailieReviewJob', trailieReviewJobSchema);
module.exports.JOB_STATUS = JOB_STATUS;
