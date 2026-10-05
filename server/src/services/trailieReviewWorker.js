'use strict';

/**
 * Stage 9 — shadow-review worker.
 *
 * Reviews an immutable snapshot OFF the request path. It is evaluation-only:
 *  - forces reviewer mode to SHADOW (and enforcement off) even if the
 *    environment accidentally says 'enforce',
 *  - verifies the snapshot has not drifted before spending any provider call,
 *  - asserts the reviewed content and itinerary are byte-for-byte unchanged,
 *  - persists sanitized telemetry separate from the trip plan,
 *  - clears the job payload on success.
 *
 * It never writes trip.plan, conversation messages, reviewMeta, save status, or
 * canonical hashes.
 */

const { runTrailieReviewPipeline } = require('./trailieReviewPipeline');
const { REVIEWER_MODE } = require('../utils/reviewerFailSafe');
const { recomputeSnapshotHashes } = require('../utils/trailieReviewSnapshot');
const { getTrailieReviewConfig } = require('../config/trailieReviewConfig');
const TrailieReviewTelemetry = require('../models/TrailieReviewTelemetry');
const {
  ERROR_CLASS,
  ReviewJobError,
  claimNextJob,
  completeJob,
  failJob,
  markInvalid,
  recoverExpiredLeases,
} = require('./trailieReviewQueue');

const WORKER_OUTCOME = {
  COMPLETED: 'completed',
  INVALID: 'invalid',
  RETRY: 'retry',
  DEAD: 'dead',
  FAILED: 'failed',
};

function countBy(values) {
  const out = Object.create(null);
  for (const v of values || []) out[v] = (out[v] || 0) + 1;
  return out;
}

/** Reconstruct the reviewer inputs from the snapshot only — never refetched. */
function buildReviewInputsFromSnapshot(snapshot) {
  const cr = snapshot.canonicalResponse;
  const facts = snapshot.canonicalFacts || [];
  const byId = Object.create(null);
  for (const f of facts) byId[f.id] = f;

  return {
    responseContent: cr.content,
    itineraryData: cr.itineraryData || null,
    constraints: snapshot.structuredConstraints || null,
    canonicalFactBundle: { facts, byId },
    canonicalFactStatus: snapshot.canonicalFactStatus || null,
    resolvedMetadata: snapshot.resolvedMetadata || {},
  };
}

/** Sanitized, aggregate-safe telemetry. No full response / facts / rationale. */
function buildTelemetry({ snapshot, reviewMeta, reviewerVersion, jobId, attempts, durationMs }) {
  const cr = snapshot.canonicalResponse;
  return {
    responseId: cr.responseId,
    responseVersion: cr.responseVersion,
    contentHash: cr.contentHash,
    itineraryHash: cr.itineraryHash || null,
    reviewerVersion,
    jobId,

    reviewStatus: reviewMeta.reviewStatus,
    attempts,
    durationMs,

    sectionsTotal: reviewMeta.sectionsTotal || 0,
    sectionsReviewed: reviewMeta.sectionsReviewed || 0,
    sectionsFailed: reviewMeta.sectionsFailed || 0,
    reviewCoverageRatio: reviewMeta.reviewCoverageRatio || 0,

    issuesDetected: reviewMeta.issuesDetected || 0,
    policyApproved: reviewMeta.policyApproved || 0,
    hypotheticalPatchesVerified: reviewMeta.hypotheticalPatchesVerified || 0,
    hypotheticalPatchesFailed: reviewMeta.hypotheticalPatchesFailed || 0,

    wouldApply: reviewMeta.wouldApply || 0,
    wouldWarn: reviewMeta.wouldWarn || 0,
    wouldQuarantine: reviewMeta.wouldQuarantine || 0,

    contentUnverified: Boolean(reviewMeta.contentUnverified),
    evidenceReasonCounts: countBy(Object.values(reviewMeta.sectionEvidenceReasons || {})),
    issueTypeCounts: countBy(reviewMeta.reviewerIssueTypes || []),

    // The pipeline does not surface raw per-issue prose in reviewMeta, so no full
    // excerpts are available to leak. Capped issue records only.
    issues: [],
    completedAt: new Date(),
  };
}

/**
 * Process a single already-claimed job. Pure with respect to canonical data —
 * it can create telemetry and transition the job, nothing else.
 *
 * @returns {Promise<{outcome: string, jobId: string}>}
 */
async function processReviewJob({ job, anthropic, config = getTrailieReviewConfig(), now = new Date() }) {
  const leaseOwner = job.leaseOwner;
  const snapshot = job.payload;

  // 1. Snapshot must be present and well-formed.
  if (!snapshot || !snapshot.canonicalResponse || snapshot.snapshotVersion !== 'v1') {
    await markInvalid({
      jobId: job.jobId,
      leaseOwner,
      reason: 'malformed_or_unsupported_snapshot',
      payloadRetentionSeconds: config.payloadRetentionSeconds,
      now,
    });
    return { outcome: WORKER_OUTCOME.INVALID, jobId: job.jobId };
  }

  // 2/3. Recompute hashes; reject BEFORE any provider call if they drifted.
  const recomputed = recomputeSnapshotHashes(snapshot);
  const drift =
    recomputed.contentHash !== job.contentHash ||
    (recomputed.itineraryHash || null) !== (job.itineraryHash || null) ||
    snapshot.canonicalResponse.contentHash !== job.contentHash;

  if (drift) {
    await markInvalid({
      jobId: job.jobId,
      leaseOwner,
      reason: 'hash_mismatch',
      payloadRetentionSeconds: config.payloadRetentionSeconds,
      now,
    });
    return { outcome: WORKER_OUTCOME.INVALID, jobId: job.jobId };
  }

  const inputs = buildReviewInputsFromSnapshot(snapshot);
  const startedAt = Date.now();

  try {
    // 4. Forced shadow mode — evaluation only, even if env says 'enforce'.
    const review = await runTrailieReviewPipeline({
      anthropic,
      ...inputs,
      responseMode: 'buddy',
      provider: 'claude',
      mode: REVIEWER_MODE.SHADOW,
      enforcementEnabled: false,
      logPrefix: '[Trailie Review Worker]',
    });

    // 5/6. Byte-for-byte content + itinerary immutability. A diff here is a
    // deterministic defect, never fixed by retrying → non-retryable.
    if (review.content !== snapshot.canonicalResponse.content) {
      throw new ReviewJobError('shadow_review_mutated_content', {
        retryable: false,
        code: 'content_mutation',
      });
    }
    const reviewedItineraryHash = recomputeSnapshotHashes(snapshot).itineraryHash;
    if ((reviewedItineraryHash || null) !== (job.itineraryHash || null)) {
      throw new ReviewJobError('shadow_review_mutated_itinerary', {
        retryable: false,
        code: 'itinerary_mutation',
      });
    }

    // 7. Persist sanitized telemetry (separate collection).
    const telemetry = buildTelemetry({
      snapshot,
      reviewMeta: review.reviewMeta,
      reviewerVersion: job.reviewerVersion,
      jobId: job.jobId,
      attempts: job.attempts,
      durationMs: Date.now() - startedAt,
    });
    await TrailieReviewTelemetry.updateOne(
      {
        responseId: telemetry.responseId,
        contentHash: telemetry.contentHash,
        itineraryHash: telemetry.itineraryHash,
        reviewerVersion: telemetry.reviewerVersion,
      },
      { $set: telemetry },
      { upsert: true }
    );

    // 8. Complete + clear payload. result is a counts-only mirror.
    await completeJob({
      jobId: job.jobId,
      leaseOwner,
      result: {
        reviewStatus: telemetry.reviewStatus,
        reviewerPassed: review.reviewMeta.reviewerPassed,
        issuesDetected: telemetry.issuesDetected,
        durationMs: telemetry.durationMs,
      },
      now,
    });
    return { outcome: WORKER_OUTCOME.COMPLETED, jobId: job.jobId };
  } catch (err) {
    const retryable = err instanceof ReviewJobError ? err.retryable : true;
    const updated = await failJob({
      jobId: job.jobId,
      leaseOwner,
      error: err.message,
      retryable,
      errorClass: retryable ? ERROR_CLASS.RETRYABLE : ERROR_CLASS.NON_RETRYABLE,
      payloadRetentionSeconds: config.payloadRetentionSeconds,
      now,
    });
    const outcome =
      updated?.status === 'dead'
        ? WORKER_OUTCOME.DEAD
        : updated?.status === 'retry'
          ? WORKER_OUTCOME.RETRY
          : WORKER_OUTCOME.FAILED;
    return { outcome, jobId: job.jobId };
  }
}

/**
 * Claim and process up to `concurrency` jobs in one pass. Concurrency is bounded
 * — never an unbounded Promise.all over the whole queue.
 *
 * @returns {Promise<{processed: number, outcomes: Object[]}>}
 */
async function runReviewWorkerOnce({ anthropic, config = getTrailieReviewConfig(), now = new Date() } = {}) {
  await recoverExpiredLeases({ now });

  const leaseOwnerBase = `${process.pid}-${Date.now()}`;
  const outcomes = [];

  // Claim jobs one at a time up to the concurrency cap, then process the batch
  // concurrently. Claiming is atomic so parallel workers never collide.
  const claimed = [];
  for (let i = 0; i < config.workerConcurrency; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const job = await claimNextJob({
      leaseOwner: `${leaseOwnerBase}-${i}`,
      leaseMs: config.leaseMs,
      now: new Date(),
    });
    if (!job) break;
    claimed.push(job);
  }

  const results = await Promise.all(
    claimed.map((job) => processReviewJob({ job, anthropic, config }))
  );
  outcomes.push(...results);

  return { processed: claimed.length, outcomes };
}

/**
 * Long-running poll loop with graceful shutdown. Disabled unless
 * TRAILIE_REVIEW_WORKER_ENABLED=true; a caller can also stop() it.
 */
function createReviewWorker({ anthropic, intervalMs = 3000 } = {}) {
  let running = false;
  let stopped = false;
  let timer = null;

  async function tick() {
    if (stopped) return;
    running = true;
    try {
      const config = getTrailieReviewConfig();
      if (config.workerEnabled) await runReviewWorkerOnce({ anthropic, config });
    } catch (err) {
      // Never let a loop error kill the worker; log and continue.
      // eslint-disable-next-line no-console
      console.error('[Trailie Review Worker] tick failed:', err.message);
    } finally {
      running = false;
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }
  }

  return {
    start() {
      if (timer || stopped) return;
      timer = setTimeout(tick, 0);
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      // Wait out any in-flight tick for a graceful drain.
      while (running) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 25));
      }
    },
  };
}

module.exports = {
  WORKER_OUTCOME,
  buildReviewInputsFromSnapshot,
  buildTelemetry,
  processReviewJob,
  runReviewWorkerOnce,
  createReviewWorker,
};
