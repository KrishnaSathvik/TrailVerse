'use strict';

/**
 * Stage 9 — durable sampled shadow-review configuration.
 *
 * Every knob here is fail-safe: absent or invalid configuration resolves to the
 * cheapest, safest value (disabled / zero-rate) so a missing env file never
 * produces surprise production cost or an accidentally-running worker.
 *
 * The reviewer VERSION participates in the job idempotency key. Bump it whenever
 * the reviewer prompt, strategy, or model policy changes so the same canonical
 * response can be re-evaluated under the new reviewer without colliding with an
 * old job.
 */

const { REVIEW_STRATEGY } = require('../utils/reviewerFailSafe');
const { CLAUDE_REVIEWER_MODEL } = require('./aiModels');

/** Semantic reviewer identity, independent of the underlying model string. */
const TRAILIE_REVIEWER_VERSION =
  process.env.TRAILIE_REVIEWER_VERSION || `stage9-${REVIEW_STRATEGY}`;

/** Strict boolean: only the literal string 'true' enables a flag. */
function readBool(name) {
  return process.env[name] === 'true';
}

/**
 * Read a numeric env var, clamped to [min, max]. Absent, non-numeric, NaN, or
 * out-of-range values fall back to `fallback` (which is assumed valid).
 */
function readNumber(name, { fallback, min = -Infinity, max = Infinity, integer = false }) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  if (integer && !Number.isInteger(value)) {
    const rounded = Math.round(value);
    return rounded < min || rounded > max ? fallback : rounded;
  }
  if (value < min || value > max) return fallback;
  return value;
}

/**
 * Sample rate is the most cost-sensitive knob: invalid or absent config MUST
 * resolve to 0 (sample nothing), never a non-zero default.
 */
function resolveSampleRate() {
  return readNumber('TRAILIE_REVIEW_SAMPLE_RATE', { fallback: 0, min: 0, max: 1 });
}

/**
 * A frozen snapshot of the current configuration. Read fresh via
 * getTrailieReviewConfig() so tests can mutate process.env between cases.
 */
function getTrailieReviewConfig() {
  return {
    enqueueEnabled: readBool('TRAILIE_REVIEW_ENQUEUE_ENABLED'),
    workerEnabled: readBool('TRAILIE_REVIEW_WORKER_ENABLED'),
    sampleRate: resolveSampleRate(),
    workerConcurrency: readNumber('TRAILIE_REVIEW_WORKER_CONCURRENCY', {
      fallback: 2,
      min: 1,
      max: 32,
      integer: true,
    }),
    jobMaxAttempts: readNumber('TRAILIE_REVIEW_JOB_MAX_ATTEMPTS', {
      fallback: 3,
      min: 1,
      max: 20,
      integer: true,
    }),
    // Small, bounded budget for the single durable enqueue insert. The request
    // path never waits longer than this for the queue.
    enqueueTimeoutMs: readNumber('TRAILIE_REVIEW_ENQUEUE_TIMEOUT_MS', {
      fallback: 400,
      min: 50,
      max: 5000,
      integer: true,
    }),
    // How long a claimed job may run before its lease is eligible for recovery.
    // Must be safely longer than the maximum expected review duration.
    leaseMs: readNumber('TRAILIE_REVIEW_LEASE_MS', {
      fallback: 120000,
      min: 10000,
      max: 600000,
      integer: true,
    }),
    // Retention for terminal jobs that still carry a payload (failed/dead). The
    // TTL index drops them after this window so canonical response text and
    // public fact text never linger indefinitely.
    payloadRetentionSeconds: readNumber('TRAILIE_REVIEW_PAYLOAD_RETENTION_SECONDS', {
      fallback: 172800, // 48h
      min: 3600,
      max: 2592000,
      integer: true,
    }),
    reviewerVersion: TRAILIE_REVIEWER_VERSION,
    reviewerModel: CLAUDE_REVIEWER_MODEL,
  };
}

module.exports = {
  TRAILIE_REVIEWER_VERSION,
  getTrailieReviewConfig,
  // exported for focused unit tests
  readBool,
  readNumber,
  resolveSampleRate,
};
