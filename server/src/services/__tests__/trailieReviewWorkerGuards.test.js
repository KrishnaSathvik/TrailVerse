'use strict';

// Keep the real fact projections; only stub the model-calling pipeline entry so
// we can simulate a reviewer that ILLEGALLY returns mutated content/itinerary.
jest.mock('../trailieReviewPipeline', () => ({
  ...jest.requireActual('../trailieReviewPipeline'),
  runTrailieReviewPipeline: jest.fn(),
}));

const { runTrailieReviewPipeline } = require('../trailieReviewPipeline');
const TrailieReviewJob = require('../../models/TrailieReviewJob');
const TrailieReviewTelemetry = require('../../models/TrailieReviewTelemetry');
const { buildCanonicalTrailieResponse } = require('../../utils/canonicalResponse');
const { buildTrailieReviewSnapshot } = require('../../utils/trailieReviewSnapshot');
const { enqueueReviewJob, claimNextJob } = require('../trailieReviewQueue');
const { WORKER_OUTCOME, processReviewJob } = require('../trailieReviewWorker');
const { REVIEWER_MODE } = require('../../utils/reviewerFailSafe');

function makeSnapshot() {
  const envelope = buildCanonicalTrailieResponse({
    responseId: 'resp-guard',
    responseVersion: 1,
    processedContent: 'Original canonical content that must never change.',
    itineraryData: { days: [{ id: 'd1', label: 'Day 1', stops: [] }] },
  });
  return buildTrailieReviewSnapshot({ envelope, canonicalFactBundle: { facts: [] } });
}

async function claim(snapshot) {
  await enqueueReviewJob({ snapshot, reviewerVersion: 'stage9-test', sampleRate: 1, timeoutMs: 2000 });
  return claimNextJob({ leaseOwner: 'w1', leaseMs: 60000, now: new Date() });
}

describe('worker mutation guards', () => {
  afterEach(() => runTrailieReviewPipeline.mockReset());

  it('forces shadow mode and enforcement off regardless of env', async () => {
    process.env.TRAILIE_REVIEWER_MODE = 'enforce';
    process.env.TRAILIE_REVIEWER_ENFORCEMENT_ENABLED = 'true';
    const snapshot = makeSnapshot();
    runTrailieReviewPipeline.mockResolvedValue({
      content: snapshot.canonicalResponse.content,
      reviewMeta: { reviewStatus: 'ok', reviewerPassed: true },
    });
    const job = await claim(snapshot);
    await processReviewJob({ job, anthropic: {} });

    const args = runTrailieReviewPipeline.mock.calls[0][0];
    expect(args.mode).toBe(REVIEWER_MODE.SHADOW);
    expect(args.enforcementEnabled).toBe(false);
    delete process.env.TRAILIE_REVIEWER_MODE;
    delete process.env.TRAILIE_REVIEWER_ENFORCEMENT_ENABLED;
  });

  it('refuses a content mutation (non-retryable failed, no telemetry passed)', async () => {
    const snapshot = makeSnapshot();
    runTrailieReviewPipeline.mockResolvedValue({
      content: 'MUTATED content the reviewer tried to apply',
      reviewMeta: { reviewStatus: 'ok', reviewerPassed: true },
    });
    const job = await claim(snapshot);
    const res = await processReviewJob({ job, anthropic: {} });

    expect(res.outcome).toBe(WORKER_OUTCOME.FAILED);
    const doc = await TrailieReviewJob.findOne({ jobId: job.jobId });
    expect(doc.status).toBe('failed');
    expect(doc.lastError).toMatch(/mutated_content/);
    // No telemetry row was written for a rejected mutation.
    expect(await TrailieReviewTelemetry.countDocuments({})).toBe(0);
  });

  it('a reviewer error is never recorded as passed', async () => {
    const snapshot = makeSnapshot();
    runTrailieReviewPipeline.mockResolvedValue({
      content: snapshot.canonicalResponse.content,
      reviewMeta: { reviewStatus: 'error', reviewerPassed: false, contentUnverified: true },
    });
    const job = await claim(snapshot);
    const res = await processReviewJob({ job, anthropic: {} });
    expect(res.outcome).toBe(WORKER_OUTCOME.COMPLETED);
    const doc = await TrailieReviewJob.findOne({ jobId: job.jobId });
    expect(doc.result.reviewerPassed).toBe(false);
    expect(doc.result.reviewStatus).toBe('error');
  });

  it('a thrown provider error is retryable', async () => {
    const snapshot = makeSnapshot();
    runTrailieReviewPipeline.mockRejectedValue(new Error('provider network blip'));
    const job = await claim(snapshot);
    const res = await processReviewJob({ job, anthropic: {} });
    expect(res.outcome).toBe(WORKER_OUTCOME.RETRY);
    const doc = await TrailieReviewJob.findOne({ jobId: job.jobId });
    expect(doc.status).toBe('retry');
  });
});
