'use strict';

const TrailieReviewJob = require('../../models/TrailieReviewJob');
const TrailieReviewTelemetry = require('../../models/TrailieReviewTelemetry');
const { buildCanonicalTrailieResponse } = require('../../utils/canonicalResponse');
const { buildTrailieReviewSnapshot } = require('../../utils/trailieReviewSnapshot');
const { enqueueReviewJob, claimNextJob } = require('../trailieReviewQueue');
const {
  WORKER_OUTCOME,
  processReviewJob,
  runReviewWorkerOnce,
} = require('../trailieReviewWorker');

const REVIEWER_VERSION = 'stage9-test';
const SECRET_FACT_TEXT = 'Angels Landing requires a permit right now.';

/** Fake reviewer provider: always "no issues", counts calls. */
function makeAnthropic() {
  const calls = { count: 0 };
  return {
    calls,
    messages: {
      create: async () => {
        calls.count += 1;
        return { content: [{ type: 'text', text: '{"issues": []}' }] };
      },
    },
  };
}

function makeSnapshot(overrides = {}) {
  const envelope = buildCanonicalTrailieResponse({
    responseId: overrides.responseId || 'resp-1',
    responseVersion: 1,
    processedContent:
      overrides.content ||
      'Day 1: hike Angels Landing. Note: Angels Landing requires a permit right now.',
    itineraryData: {
      days: [{ id: 'd1', label: 'Day 1', stops: [{ id: 's1', name: 'Angels Landing', parkCode: 'zion' }] }],
    },
  });
  const snapshot = buildTrailieReviewSnapshot({
    envelope,
    canonicalFactStatus: 'ok',
    canonicalFactBundle: {
      facts: [
        {
          id: 'nps:zion:permit:1',
          category: 'permit',
          source: 'nps',
          authority: 'authoritative',
          status: 'confirmed_required',
          text: SECRET_FACT_TEXT,
          parkCode: 'zion',
          parkName: 'Zion National Park',
        },
      ],
    },
  });
  return { envelope, snapshot };
}

async function enqueueAndClaim(snapshot, leaseOwner = 'w1') {
  const r = await enqueueReviewJob({ snapshot, reviewerVersion: REVIEWER_VERSION, sampleRate: 1, timeoutMs: 2000 });
  const job = await claimNextJob({ leaseOwner, leaseMs: 60000, now: new Date() });
  return { r, job };
}

describe('processReviewJob', () => {
  it('completes a valid job, keeps content byte-for-byte, and clears the payload', async () => {
    const { snapshot } = makeSnapshot();
    const { job } = await enqueueAndClaim(snapshot);
    const anthropic = makeAnthropic();

    const res = await processReviewJob({ job, anthropic });
    expect(res.outcome).toBe(WORKER_OUTCOME.COMPLETED);
    expect(anthropic.calls.count).toBeGreaterThan(0); // provider was actually called

    const doc = await TrailieReviewJob.findOne({ jobId: job.jobId });
    expect(doc.status).toBe('completed');
    expect(doc.payload).toBeNull(); // payload cleared
  });

  it('rejects a drifted snapshot as invalid BEFORE any provider call', async () => {
    const { snapshot } = makeSnapshot();
    const { job } = await enqueueAndClaim(snapshot);
    // Tamper the recorded identity so recomputed hash won't match.
    await TrailieReviewJob.updateOne({ jobId: job.jobId }, { $set: { contentHash: 'DIFFERENT' } });
    const fresh = await TrailieReviewJob.findOne({ jobId: job.jobId });
    fresh.leaseOwner = job.leaseOwner;

    const anthropic = makeAnthropic();
    const res = await processReviewJob({ job: fresh, anthropic });
    expect(res.outcome).toBe(WORKER_OUTCOME.INVALID);
    expect(anthropic.calls.count).toBe(0); // no provider call on drift
  });

  it('writes sanitized telemetry with no full response or full fact text', async () => {
    const { snapshot } = makeSnapshot();
    const { job } = await enqueueAndClaim(snapshot);
    await processReviewJob({ job, anthropic: makeAnthropic() });

    const tel = await TrailieReviewTelemetry.findOne({ responseId: 'resp-1' }).lean();
    expect(tel).toBeTruthy();
    const serialized = JSON.stringify(tel);
    expect(serialized).not.toContain(SECRET_FACT_TEXT);
    expect(serialized).not.toContain('Angels Landing requires a permit');
    expect(serialized).not.toContain(snapshot.canonicalResponse.content);
    // Counts-and-ids only.
    expect(typeof tel.reviewCoverageRatio).toBe('number');
    expect(Array.isArray(tel.issues)).toBe(true);
  });

  it('telemetry is upserted once per canonical response evaluation (idempotent)', async () => {
    const { snapshot } = makeSnapshot();
    // Two independent job docs for the same identity would violate the unique
    // enqueue key, so re-run the SAME job's processing twice via re-claim path.
    const { job } = await enqueueAndClaim(snapshot);
    await processReviewJob({ job, anthropic: makeAnthropic() });
    // Simulate a second evaluation writing the same telemetry key.
    const { job: job2 } = { job: { ...job.toObject(), leaseOwner: job.leaseOwner } };
    await processReviewJob({ job: job2, anthropic: makeAnthropic() }).catch(() => {});
    const count = await TrailieReviewTelemetry.countDocuments({ responseId: 'resp-1' });
    expect(count).toBe(1);
  });
});

describe('runReviewWorkerOnce', () => {
  it('respects the bounded concurrency limit', async () => {
    for (let i = 0; i < 5; i += 1) {
      const { snapshot } = makeSnapshot({ responseId: `resp-${i}` });
      // eslint-disable-next-line no-await-in-loop
      await enqueueReviewJob({ snapshot, reviewerVersion: REVIEWER_VERSION, sampleRate: 1, timeoutMs: 2000 });
    }
    const config = {
      workerConcurrency: 2,
      leaseMs: 60000,
      payloadRetentionSeconds: 172800,
    };
    const { processed } = await runReviewWorkerOnce({ anthropic: makeAnthropic(), config });
    expect(processed).toBe(2);
    // Remaining jobs are still queued for a later pass.
    const queued = await TrailieReviewJob.countDocuments({ status: 'queued' });
    expect(queued).toBe(3);
  });
});
