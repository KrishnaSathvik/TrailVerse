'use strict';

/**
 * Stage 9/10 — request-path scheduling behavior + canonical-envelope immutability.
 *
 * Drives the REAL production helper `buildCanonicalOutbound` (which calls
 * `scheduleShadowReview`) with the durable queue mocked. Asserts:
 *  - the canonical response/plan/hashes are IDENTICAL whether enqueue is
 *    disabled, succeeds, or fails (Stage 10: no shared-reference mutation),
 *  - the dynamic queue status lives ONLY in the separate `reviewScheduling`
 *    outbound metadata, never inside the canonical envelope or plan,
 *  - an enqueue failure never fails the user response.
 */

require('dotenv').config();

jest.mock('../../services/trailieReviewQueue', () => {
  const actual = jest.requireActual('../../services/trailieReviewQueue');
  return { ...actual, enqueueReviewJob: jest.fn() };
});

const { enqueueReviewJob, ENQUEUE_RESULT } = require('../../services/trailieReviewQueue');
const { buildCanonicalOutbound } = require('../ai');

const ENV_KEYS = ['TRAILIE_REVIEW_ENQUEUE_ENABLED', 'TRAILIE_REVIEW_SAMPLE_RATE'];
const savedEnv = {};

function makeProcessed() {
  return {
    cleanContent: 'Day 1: hike the rim. Day 2: drive to the valley.',
    itineraryData: { days: [{ id: 'd1', label: 'Day 1', stops: [{ id: 's1', name: 'Rim', parkCode: 'grca' }] }] },
    planScore: null,
    correctionsApplied: [],
    feasibilityIssues: [],
    reviewMeta: {
      reviewerMode: 'shadow',
      reviewExecution: 'async',
      repaired: false,
      patchesApplied: 0,
    },
  };
}

const response = { provider: 'claude', model: 'claude-sonnet-5', content: 'raw' };
const req = { body: { metadata: { priorResponseVersion: 2 } } };
const resolvedMetadata = { parkCode: 'grca', parkName: 'Grand Canyon' };
const preparedContext = { canonicalFactBundle: { facts: [] }, canonicalFactStatus: 'available' };

async function build() {
  return buildCanonicalOutbound({
    processed: makeProcessed(),
    response,
    rawStreamContent: 'raw',
    req,
    resolvedMetadata,
    auditTrail: null,
    preparedContext,
    constraints: null,
  });
}

beforeEach(() => {
  ENV_KEYS.forEach((k) => { savedEnv[k] = process.env[k]; delete process.env[k]; });
  enqueueReviewJob.mockReset();
});
afterEach(() => ENV_KEYS.forEach((k) => {
  if (savedEnv[k] === undefined) delete process.env[k];
  else process.env[k] = savedEnv[k];
}));

describe('scheduleShadowReview via buildCanonicalOutbound', () => {
  test('canonical envelope reviewMeta is a stable marker with NO queue status', async () => {
    const { envelope } = await build();
    expect(envelope.reviewMeta).toEqual({
      reviewerMode: 'shadow',
      reviewExecution: 'async',
      repaired: false,
      patchesApplied: 0,
    });
    expect(envelope.reviewMeta).not.toHaveProperty('reviewQueueStatus');
  });

  test('disabled by default — no enqueue; scheduling reports disabled', async () => {
    const { envelope, reviewScheduling } = await build();
    expect(enqueueReviewJob).not.toHaveBeenCalled();
    expect(reviewScheduling.reviewQueueStatus).toBe('disabled');
    expect(reviewScheduling.patchesApplied).toBe(0);
    expect(reviewScheduling.repaired).toBe(false);
    expect(envelope.contentHash).toBeTruthy();
    expect(envelope.itineraryHash).toBeTruthy();
  });

  test('enabled + fully sampled → queued; snapshot carries the canonical identity', async () => {
    process.env.TRAILIE_REVIEW_ENQUEUE_ENABLED = 'true';
    process.env.TRAILIE_REVIEW_SAMPLE_RATE = '1';
    enqueueReviewJob.mockResolvedValue({ status: ENQUEUE_RESULT.QUEUED, jobId: 'job-1' });

    const { envelope, reviewScheduling } = await build();
    expect(enqueueReviewJob).toHaveBeenCalledTimes(1);
    const snap = enqueueReviewJob.mock.calls[0][0].snapshot;
    expect(snap.canonicalResponse.contentHash).toBe(envelope.contentHash);
    expect(snap.canonicalResponse.itineraryHash).toBe(envelope.itineraryHash);
    expect(reviewScheduling.reviewQueueStatus).toBe('queued');
    // Canonical envelope reviewMeta remains the stable marker — never 'queued'.
    expect(envelope.reviewMeta).not.toHaveProperty('reviewQueueStatus');
  });

  test('reviewScheduling never leaks the internal job id', async () => {
    process.env.TRAILIE_REVIEW_ENQUEUE_ENABLED = 'true';
    process.env.TRAILIE_REVIEW_SAMPLE_RATE = '1';
    enqueueReviewJob.mockResolvedValue({ status: ENQUEUE_RESULT.QUEUED, jobId: 'secret-job-id' });
    const { reviewScheduling } = await build();
    expect(JSON.stringify(reviewScheduling)).not.toContain('secret-job-id');
    expect(reviewScheduling).not.toHaveProperty('reviewJobId');
  });

  test('sampleRate 0 → not_sampled, no enqueue', async () => {
    process.env.TRAILIE_REVIEW_ENQUEUE_ENABLED = 'true';
    process.env.TRAILIE_REVIEW_SAMPLE_RATE = '0';
    const { reviewScheduling } = await build();
    expect(enqueueReviewJob).not.toHaveBeenCalled();
    expect(reviewScheduling.reviewQueueStatus).toBe('not_sampled');
  });

  test('canonical content/plan/hashes IDENTICAL across enqueue outcomes', async () => {
    // Baseline: enqueue disabled.
    const baseline = await build();

    // Success.
    process.env.TRAILIE_REVIEW_ENQUEUE_ENABLED = 'true';
    process.env.TRAILIE_REVIEW_SAMPLE_RATE = '1';
    enqueueReviewJob.mockResolvedValue({ status: ENQUEUE_RESULT.QUEUED, jobId: 'job-1' });
    const success = await build();

    // Failure.
    enqueueReviewJob.mockResolvedValue({ status: ENQUEUE_RESULT.ENQUEUE_FAILED, jobId: null });
    const failed = await build();

    for (const other of [success, failed]) {
      expect(other.envelope.content).toBe(baseline.envelope.content);
      expect(other.envelope.contentHash).toBe(baseline.envelope.contentHash);
      expect(other.envelope.itineraryHash).toBe(baseline.envelope.itineraryHash);
      expect(other.envelope.reviewMeta).toEqual(baseline.envelope.reviewMeta);
      // Canonical plan values are identical (reviewMeta marker only, no status).
      expect(other.canonicalPlan.reviewMeta).toEqual(baseline.canonicalPlan.reviewMeta);
      expect(other.canonicalPlan.contentHash).toBe(baseline.canonicalPlan.contentHash);
      expect(other.canonicalPlan.itineraryHash).toBe(baseline.canonicalPlan.itineraryHash);
    }
    expect(success.reviewScheduling.reviewQueueStatus).toBe('queued');
    expect(failed.reviewScheduling.reviewQueueStatus).toBe('enqueue_failed');
  });

  test('conflict is treated as enqueue_failed (never a second billable job)', async () => {
    process.env.TRAILIE_REVIEW_ENQUEUE_ENABLED = 'true';
    process.env.TRAILIE_REVIEW_SAMPLE_RATE = '1';
    enqueueReviewJob.mockResolvedValue({ status: ENQUEUE_RESULT.CONFLICT, jobId: 'other' });
    const { reviewScheduling } = await build();
    expect(reviewScheduling.reviewQueueStatus).toBe('enqueue_failed');
  });

  test('ineligible response (system provider) is never sampled', async () => {
    process.env.TRAILIE_REVIEW_ENQUEUE_ENABLED = 'true';
    process.env.TRAILIE_REVIEW_SAMPLE_RATE = '1';
    const { reviewScheduling } = await buildCanonicalOutbound({
      processed: makeProcessed(),
      response: { provider: 'system', model: 'conversion', content: 'x' },
      rawStreamContent: 'raw',
      req,
      resolvedMetadata,
      auditTrail: null,
      preparedContext,
      constraints: null,
    });
    expect(enqueueReviewJob).not.toHaveBeenCalled();
    expect(reviewScheduling.reviewQueueStatus).toBe('not_sampled');
  });
});
