'use strict';

const { getTrailieReviewConfig } = require('../trailieReviewConfig');

const KEYS = [
  'TRAILIE_REVIEW_ENQUEUE_ENABLED',
  'TRAILIE_REVIEW_WORKER_ENABLED',
  'TRAILIE_REVIEW_SAMPLE_RATE',
  'TRAILIE_REVIEW_WORKER_CONCURRENCY',
  'TRAILIE_REVIEW_JOB_MAX_ATTEMPTS',
  'TRAILIE_REVIEW_ENQUEUE_TIMEOUT_MS',
  'TRAILIE_REVIEW_LEASE_MS',
  'TRAILIE_REVIEW_PAYLOAD_RETENTION_SECONDS',
];

describe('trailieReviewConfig', () => {
  const saved = {};
  beforeEach(() => KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; }));
  afterEach(() => KEYS.forEach((k) => {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }));

  it('fails safe with no configuration present', () => {
    const c = getTrailieReviewConfig();
    expect(c.enqueueEnabled).toBe(false);
    expect(c.workerEnabled).toBe(false);
    expect(c.sampleRate).toBe(0);
    expect(c.workerConcurrency).toBe(2);
    expect(c.jobMaxAttempts).toBe(3);
  });

  it('only enables flags on the literal string "true"', () => {
    process.env.TRAILIE_REVIEW_ENQUEUE_ENABLED = 'TRUE';
    expect(getTrailieReviewConfig().enqueueEnabled).toBe(false);
    process.env.TRAILIE_REVIEW_ENQUEUE_ENABLED = 'true';
    expect(getTrailieReviewConfig().enqueueEnabled).toBe(true);
  });

  it('clamps sample rate and fails invalid values to 0', () => {
    process.env.TRAILIE_REVIEW_SAMPLE_RATE = '2';
    expect(getTrailieReviewConfig().sampleRate).toBe(0); // out of [0,1] → fallback 0
    process.env.TRAILIE_REVIEW_SAMPLE_RATE = 'abc';
    expect(getTrailieReviewConfig().sampleRate).toBe(0);
    process.env.TRAILIE_REVIEW_SAMPLE_RATE = '0.25';
    expect(getTrailieReviewConfig().sampleRate).toBeCloseTo(0.25);
  });

  it('clamps numeric knobs to safe ranges', () => {
    process.env.TRAILIE_REVIEW_WORKER_CONCURRENCY = '9999';
    process.env.TRAILIE_REVIEW_JOB_MAX_ATTEMPTS = '0';
    const c = getTrailieReviewConfig();
    expect(c.workerConcurrency).toBe(2); // out of range → fallback
    expect(c.jobMaxAttempts).toBe(3); // 0 < min → fallback
  });

  it('exposes a reviewer version for the idempotency key', () => {
    expect(typeof getTrailieReviewConfig().reviewerVersion).toBe('string');
    expect(getTrailieReviewConfig().reviewerVersion.length).toBeGreaterThan(0);
  });
});
