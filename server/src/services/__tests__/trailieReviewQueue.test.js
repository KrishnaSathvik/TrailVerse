'use strict';

const TrailieReviewJob = require('../../models/TrailieReviewJob');
const { JOB_STATUS } = TrailieReviewJob;
const {
  ENQUEUE_RESULT,
  ERROR_CLASS,
  buildIdempotencyKey,
  computeBackoffMs,
  enqueueReviewJob,
  claimNextJob,
  completeJob,
  failJob,
  markInvalid,
  recoverExpiredLeases,
} = require('../trailieReviewQueue');

const REVIEWER_VERSION = 'stage9-test';

function snapshotFor({ responseId = 'resp-1', contentHash = 'chash', itineraryHash = 'ihash', content = 'body' } = {}) {
  return {
    snapshotVersion: 'v1',
    canonicalResponse: { responseId, responseVersion: 1, content, contentHash, itineraryHash },
    canonicalFacts: [],
  };
}

async function enqueue(overrides = {}) {
  return enqueueReviewJob({
    snapshot: snapshotFor(overrides),
    reviewerVersion: REVIEWER_VERSION,
    sampleRate: 1,
    sampleBucket: 0.1,
    maxAttempts: 3,
    timeoutMs: 2000,
  });
}

describe('buildIdempotencyKey', () => {
  it('same tuple → same key; different hash → different key', () => {
    const base = { responseId: 'r', contentHash: 'a', itineraryHash: 'b', reviewerVersion: 'v' };
    expect(buildIdempotencyKey(base)).toBe(buildIdempotencyKey({ ...base }));
    expect(buildIdempotencyKey(base)).not.toBe(buildIdempotencyKey({ ...base, contentHash: 'c' }));
  });
});

describe('computeBackoffMs', () => {
  it('is bounded and non-negative with jitter', () => {
    for (let attempts = 1; attempts <= 10; attempts += 1) {
      const ms = computeBackoffMs(attempts, { baseMs: 2000, maxMs: 300000 });
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(300000);
    }
  });
});

describe('enqueueReviewJob', () => {
  it('inserts a queued job', async () => {
    const r = await enqueue();
    expect(r.status).toBe(ENQUEUE_RESULT.QUEUED);
    const doc = await TrailieReviewJob.findOne({ jobId: r.jobId });
    expect(doc.status).toBe(JOB_STATUS.QUEUED);
    expect(doc.payload.canonicalResponse.responseId).toBe('resp-1');
  });

  it('exact duplicate enqueue is idempotent (no second job)', async () => {
    const a = await enqueue();
    const b = await enqueue();
    expect(b.status).toBe(ENQUEUE_RESULT.DUPLICATE);
    expect(b.jobId).toBe(a.jobId);
    expect(await TrailieReviewJob.countDocuments({})).toBe(1);
  });

  it('same responseId + reviewerVersion with different hashes conflicts', async () => {
    await enqueue({ contentHash: 'hash-A' });
    const conflict = await enqueue({ contentHash: 'hash-B' });
    expect(conflict.status).toBe(ENQUEUE_RESULT.CONFLICT);
    expect(await TrailieReviewJob.countDocuments({})).toBe(1);
  });

  it('resolves to enqueue_failed on timeout without throwing', async () => {
    const r = await enqueueReviewJob({
      snapshot: snapshotFor(),
      reviewerVersion: REVIEWER_VERSION,
      timeoutMs: 0, // impossible budget → timeout path
    });
    expect(r.status).toBe(ENQUEUE_RESULT.ENQUEUE_FAILED);
  });
});

describe('claimNextJob', () => {
  it('atomic claim prevents two workers from leasing one job', async () => {
    await enqueue();
    const now = new Date();
    const [a, b] = await Promise.all([
      claimNextJob({ leaseOwner: 'w1', leaseMs: 60000, now }),
      claimNextJob({ leaseOwner: 'w2', leaseMs: 60000, now }),
    ]);
    const winners = [a, b].filter(Boolean);
    expect(winners).toHaveLength(1);
    expect(winners[0].status).toBe(JOB_STATUS.LEASED);
    expect(winners[0].attempts).toBe(1);
  });

  it('an active lease cannot be stolen', async () => {
    await enqueue();
    const now = new Date();
    await claimNextJob({ leaseOwner: 'w1', leaseMs: 60000, now });
    const second = await claimNextJob({ leaseOwner: 'w2', leaseMs: 60000, now });
    expect(second).toBeNull();
  });

  it('an expired lease can be recovered and re-claimed', async () => {
    await enqueue();
    const t0 = new Date();
    await claimNextJob({ leaseOwner: 'w1', leaseMs: 1000, now: t0 });
    const later = new Date(t0.getTime() + 5000);
    const recovered = await recoverExpiredLeases({ now: later });
    expect(recovered).toBe(1);
    const reclaim = await claimNextJob({ leaseOwner: 'w2', leaseMs: 60000, now: later });
    expect(reclaim).not.toBeNull();
    expect(reclaim.leaseOwner).toBe('w2');
    expect(reclaim.attempts).toBe(2);
  });
});

describe('retry / dead policy', () => {
  it('retryable failure reschedules with bounded backoff', async () => {
    await enqueue();
    const job = await claimNextJob({ leaseOwner: 'w1', leaseMs: 60000, now: new Date() });
    const updated = await failJob({
      jobId: job.jobId,
      leaseOwner: 'w1',
      error: 'provider timeout',
      retryable: true,
      errorClass: ERROR_CLASS.RETRYABLE,
    });
    expect(updated.status).toBe(JOB_STATUS.RETRY);
    expect(updated.nextRunAt.getTime()).toBeGreaterThanOrEqual(Date.now() - 1000);
  });

  it('non-retryable failure goes straight to failed', async () => {
    await enqueue();
    const job = await claimNextJob({ leaseOwner: 'w1', leaseMs: 60000, now: new Date() });
    const updated = await failJob({
      jobId: job.jobId,
      leaseOwner: 'w1',
      error: 'hash mismatch',
      retryable: false,
      errorClass: ERROR_CLASS.NON_RETRYABLE,
    });
    expect(updated.status).toBe(JOB_STATUS.FAILED);
    expect(updated.payloadExpiresAt).toBeTruthy();
  });

  it('reaching maxAttempts produces a dead job', async () => {
    const r = await enqueueReviewJob({
      snapshot: snapshotFor(),
      reviewerVersion: REVIEWER_VERSION,
      maxAttempts: 2,
      timeoutMs: 2000,
    });
    // attempt 1
    let job = await claimNextJob({ leaseOwner: 'w', leaseMs: 60000, now: new Date() });
    await failJob({ jobId: job.jobId, leaseOwner: 'w', error: 'e', retryable: true });
    // force it runnable again
    await TrailieReviewJob.updateOne({ jobId: r.jobId }, { $set: { nextRunAt: new Date(0) } });
    // attempt 2 (== maxAttempts) → dead on failure
    job = await claimNextJob({ leaseOwner: 'w', leaseMs: 60000, now: new Date() });
    const dead = await failJob({ jobId: job.jobId, leaseOwner: 'w', error: 'e', retryable: true });
    expect(dead.status).toBe(JOB_STATUS.DEAD);
    expect(dead.payloadExpiresAt).toBeTruthy();
  });
});

describe('completeJob / markInvalid', () => {
  it('completeJob clears the payload', async () => {
    await enqueue();
    const job = await claimNextJob({ leaseOwner: 'w', leaseMs: 60000, now: new Date() });
    const done = await completeJob({ jobId: job.jobId, leaseOwner: 'w', result: { ok: true } });
    expect(done.status).toBe(JOB_STATUS.COMPLETED);
    expect(done.payload).toBeNull();
  });

  it('markInvalid is terminal and retains payload under TTL', async () => {
    await enqueue();
    const job = await claimNextJob({ leaseOwner: 'w', leaseMs: 60000, now: new Date() });
    const inv = await markInvalid({ jobId: job.jobId, leaseOwner: 'w', reason: 'hash_mismatch' });
    expect(inv.status).toBe(JOB_STATUS.INVALID);
    expect(inv.payloadExpiresAt).toBeTruthy();
  });
});
