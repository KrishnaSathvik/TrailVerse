'use strict';

/**
 * Stage 9 — durable shadow-review queue driver.
 *
 * A thin, Mongo-backed job queue with:
 *  - bounded, idempotent enqueue (single insert, strict timeout),
 *  - atomic lease claiming (no two workers on one active lease),
 *  - expired-lease recovery,
 *  - bounded exponential backoff with jitter, and a hard dead-letter cap.
 *
 * The request path only ever calls enqueueReviewJob(); everything else is the
 * worker's concern.
 */

const crypto = require('crypto');
const TrailieReviewJob = require('../models/TrailieReviewJob');
const { JOB_STATUS } = TrailieReviewJob;

const ENQUEUE_RESULT = {
  QUEUED: 'queued',
  DUPLICATE: 'duplicate',
  CONFLICT: 'conflict',
  ENQUEUE_FAILED: 'enqueue_failed',
  DISABLED: 'disabled',
  NOT_SAMPLED: 'not_sampled',
};

const ERROR_CLASS = {
  RETRYABLE: 'retryable',
  NON_RETRYABLE: 'non_retryable',
};

/** Typed error the worker throws so the driver can classify retry behavior. */
class ReviewJobError extends Error {
  constructor(message, { retryable = false, code = 'unknown' } = {}) {
    super(message);
    this.name = 'ReviewJobError';
    this.retryable = retryable;
    this.code = code;
  }
}

/**
 * Idempotency key over the exact tuple that identifies one billable evaluation.
 * Different hashes for the same responseId/reviewerVersion produce a DIFFERENT
 * key — which the enqueue path treats as a conflict, not a duplicate.
 */
function buildIdempotencyKey({ responseId, contentHash, itineraryHash, reviewerVersion }) {
  return crypto
    .createHash('sha256')
    .update(
      [responseId, contentHash, itineraryHash || 'none', reviewerVersion].join('\x00'),
      'utf8'
    )
    .digest('hex');
}

/** Bounded exponential backoff with full jitter, hard-capped. */
function computeBackoffMs(attempts, { baseMs = 2000, maxMs = 300000 } = {}) {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempts - 1));
  // Full jitter: uniform in [0, exp]. Never unbounded.
  return Math.floor(Math.random() * exp);
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('enqueue_timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Idempotent, bounded enqueue. Never throws to the request path; on any failure
 * or timeout it resolves to ENQUEUE_FAILED and the caller ships the canonical
 * response unchanged.
 *
 * @returns {Promise<{status: string, jobId: string|null}>}
 */
async function enqueueReviewJob({
  snapshot,
  reviewerVersion,
  sampleRate = 0,
  sampleBucket = null,
  maxAttempts = 3,
  timeoutMs = 400,
} = {}) {
  const cr = snapshot?.canonicalResponse;
  if (!cr?.responseId) {
    return { status: ENQUEUE_RESULT.ENQUEUE_FAILED, jobId: null };
  }

  const identity = {
    responseId: cr.responseId,
    contentHash: cr.contentHash,
    itineraryHash: cr.itineraryHash || null,
    reviewerVersion,
  };
  const idempotencyKey = buildIdempotencyKey(identity);

  const doInsert = async () => {
    // Exact duplicate → idempotent success.
    const exact = await TrailieReviewJob.findOne({ idempotencyKey }).lean();
    if (exact) return { status: ENQUEUE_RESULT.DUPLICATE, jobId: exact.jobId };

    // Same response identity, different hashes → conflict (never a 2nd job).
    const conflict = await TrailieReviewJob.findOne({
      responseId: identity.responseId,
      reviewerVersion,
      idempotencyKey: { $ne: idempotencyKey },
    }).lean();
    if (conflict) return { status: ENQUEUE_RESULT.CONFLICT, jobId: conflict.jobId };

    try {
      const job = await TrailieReviewJob.create({
        jobId: crypto.randomUUID(),
        responseId: identity.responseId,
        responseVersion: cr.responseVersion,
        contentHash: identity.contentHash,
        itineraryHash: identity.itineraryHash,
        reviewerVersion,
        idempotencyKey,
        status: JOB_STATUS.QUEUED,
        sampleRate,
        sampleBucket,
        attempts: 0,
        maxAttempts,
        nextRunAt: new Date(),
        payload: snapshot,
      });
      return { status: ENQUEUE_RESULT.QUEUED, jobId: job.jobId };
    } catch (err) {
      // Unique-index race: another request inserted the same key first.
      if (err && err.code === 11000) {
        const existing = await TrailieReviewJob.findOne({ idempotencyKey }).lean();
        if (existing) return { status: ENQUEUE_RESULT.DUPLICATE, jobId: existing.jobId };
      }
      throw err;
    }
  };

  try {
    return await withTimeout(doInsert(), timeoutMs);
  } catch (err) {
    return { status: ENQUEUE_RESULT.ENQUEUE_FAILED, jobId: null, error: err.message };
  }
}

/**
 * Atomically claim the next runnable job. Only one worker can win a given job
 * because findOneAndUpdate applies the status transition atomically and the
 * filter excludes anything already carrying a live lease.
 *
 * @returns {Promise<Object|null>} the leased job document, or null if none.
 */
async function claimNextJob({ leaseOwner, leaseMs, now = new Date() } = {}) {
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  return TrailieReviewJob.findOneAndUpdate(
    {
      status: { $in: [JOB_STATUS.QUEUED, JOB_STATUS.RETRY] },
      nextRunAt: { $lte: now },
      $or: [{ leaseExpiresAt: null }, { leaseExpiresAt: { $lte: now } }],
    },
    {
      $set: {
        status: JOB_STATUS.LEASED,
        leaseOwner,
        leaseExpiresAt,
        startedAt: now,
      },
      $inc: { attempts: 1 },
    },
    { sort: { nextRunAt: 1 }, new: true }
  );
}

/** Extend a live lease for a long-running review (never steals another owner's). */
async function renewLease({ jobId, leaseOwner, leaseMs, now = new Date() }) {
  return TrailieReviewJob.findOneAndUpdate(
    { jobId, status: JOB_STATUS.LEASED, leaseOwner },
    { $set: { leaseExpiresAt: new Date(now.getTime() + leaseMs) } },
    { new: true }
  );
}

/** Mark a leased job completed and CLEAR its payload (privacy retention). */
async function completeJob({ jobId, leaseOwner, result = null, now = new Date() }) {
  return TrailieReviewJob.findOneAndUpdate(
    { jobId, leaseOwner },
    {
      $set: {
        status: JOB_STATUS.COMPLETED,
        completedAt: now,
        result,
        payload: null,
        payloadExpiresAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    },
    { new: true }
  );
}

/**
 * A failed attempt: reschedule with backoff, or dead-letter once attempts reach
 * the cap. Non-retryable failures short-circuit straight to a terminal state.
 */
async function failJob({
  jobId,
  leaseOwner,
  error,
  retryable = false,
  errorClass = ERROR_CLASS.RETRYABLE,
  payloadRetentionSeconds = 172800,
  now = new Date(),
}) {
  const job = await TrailieReviewJob.findOne({ jobId, leaseOwner });
  if (!job) return null;

  const payloadExpiresAt = new Date(now.getTime() + payloadRetentionSeconds * 1000);
  const terminal = (status) => ({
    status,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastError: error || null,
    lastErrorClass: errorClass,
    completedAt: now,
    // Terminal jobs still hold a payload → TTL it.
    payloadExpiresAt,
  });

  if (!retryable) {
    Object.assign(job, terminal(JOB_STATUS.FAILED));
  } else if (job.attempts >= job.maxAttempts) {
    Object.assign(job, terminal(JOB_STATUS.DEAD));
  } else {
    Object.assign(job, {
      status: JOB_STATUS.RETRY,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: error || null,
      lastErrorClass: errorClass,
      nextRunAt: new Date(now.getTime() + computeBackoffMs(job.attempts)),
    });
  }
  await job.save();
  return job;
}

/** Snapshot drift / malformed snapshot → never billable, terminal 'invalid'. */
async function markInvalid({ jobId, leaseOwner, reason, payloadRetentionSeconds = 172800, now = new Date() }) {
  return TrailieReviewJob.findOneAndUpdate(
    { jobId, leaseOwner },
    {
      $set: {
        status: JOB_STATUS.INVALID,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: reason || 'invalid_snapshot',
        lastErrorClass: ERROR_CLASS.NON_RETRYABLE,
        completedAt: now,
        payloadExpiresAt: new Date(now.getTime() + payloadRetentionSeconds * 1000),
      },
    },
    { new: true }
  );
}

/**
 * Recover jobs whose worker died mid-lease: any LEASED job with an expired lease
 * returns to RETRY so it can be claimed again (bounded by maxAttempts).
 *
 * @returns {Promise<number>} count recovered
 */
async function recoverExpiredLeases({ now = new Date() } = {}) {
  const res = await TrailieReviewJob.updateMany(
    { status: JOB_STATUS.LEASED, leaseExpiresAt: { $lte: now } },
    {
      $set: {
        status: JOB_STATUS.RETRY,
        leaseOwner: null,
        leaseExpiresAt: null,
        nextRunAt: now,
        lastErrorClass: ERROR_CLASS.RETRYABLE,
        lastError: 'lease_expired',
      },
    }
  );
  return res.modifiedCount || 0;
}

module.exports = {
  ENQUEUE_RESULT,
  ERROR_CLASS,
  ReviewJobError,
  buildIdempotencyKey,
  computeBackoffMs,
  enqueueReviewJob,
  claimNextJob,
  renewLease,
  completeJob,
  failJob,
  markInvalid,
  recoverExpiredLeases,
};
