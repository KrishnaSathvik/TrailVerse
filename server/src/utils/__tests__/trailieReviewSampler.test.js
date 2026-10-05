'use strict';

const {
  INELIGIBLE_REASON,
  classifyReviewEligibility,
  normalizeSampleRate,
  shouldSampleTrailieReview,
} = require('../trailieReviewSampler');

describe('classifyReviewEligibility', () => {
  const base = { provider: 'claude', model: 'claude-sonnet-5', content: 'Real trip plan text.' };

  it('accepts a normal assistant response', () => {
    expect(classifyReviewEligibility(base)).toEqual({ eligible: true, reason: null });
  });

  it('rejects empty / whitespace content', () => {
    expect(classifyReviewEligibility({ ...base, content: '   ' }).reason).toBe(INELIGIBLE_REASON.EMPTY);
    expect(classifyReviewEligibility({ ...base, content: null }).reason).toBe(INELIGIBLE_REASON.EMPTY);
  });

  it('rejects conversion messages (flag or model)', () => {
    expect(classifyReviewEligibility({ ...base, isConversionMessage: true }).reason).toBe(
      INELIGIBLE_REASON.CONVERSION
    );
    expect(classifyReviewEligibility({ ...base, model: 'conversion' }).reason).toBe(
      INELIGIBLE_REASON.CONVERSION
    );
  });

  it('rejects welcome messages and provider errors', () => {
    expect(classifyReviewEligibility({ ...base, isWelcomeMessage: true }).reason).toBe(
      INELIGIBLE_REASON.WELCOME
    );
    expect(classifyReviewEligibility({ ...base, providerError: true }).reason).toBe(
      INELIGIBLE_REASON.PROVIDER_ERROR
    );
  });

  it('rejects system-provider responses', () => {
    expect(classifyReviewEligibility({ ...base, provider: 'system' }).reason).toBe(
      INELIGIBLE_REASON.SYSTEM
    );
  });
});

describe('normalizeSampleRate', () => {
  it('clamps and fails invalid values to 0', () => {
    expect(normalizeSampleRate(-1)).toBe(0);
    expect(normalizeSampleRate(0)).toBe(0);
    expect(normalizeSampleRate(2)).toBe(1);
    expect(normalizeSampleRate('nope')).toBe(0);
    expect(normalizeSampleRate(undefined)).toBe(0);
    expect(normalizeSampleRate(NaN)).toBe(0);
    expect(normalizeSampleRate(0.25)).toBeCloseTo(0.25);
  });
});

describe('shouldSampleTrailieReview', () => {
  it('is deterministic — same responseId always yields the same decision', () => {
    const a = shouldSampleTrailieReview({ responseId: 'resp-abc', sampleRate: 0.5 });
    const b = shouldSampleTrailieReview({ responseId: 'resp-abc', sampleRate: 0.5 });
    expect(a).toEqual(b);
  });

  it('sampleRate = 0 samples nothing', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      expect(shouldSampleTrailieReview({ responseId: id, sampleRate: 0 }).sampled).toBe(false);
    }
  });

  it('sampleRate = 1 samples every eligible response', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      expect(shouldSampleTrailieReview({ responseId: id, sampleRate: 1 }).sampled).toBe(true);
    }
  });

  it('invalid / missing rate becomes zero', () => {
    expect(shouldSampleTrailieReview({ responseId: 'x', sampleRate: undefined }).sampled).toBe(false);
    expect(shouldSampleTrailieReview({ responseId: 'x', sampleRate: 'bad' }).sampled).toBe(false);
    expect(shouldSampleTrailieReview({ responseId: 'x' }).sampleRate).toBe(0);
  });

  it('never samples ineligible responses regardless of rate', () => {
    const r = shouldSampleTrailieReview({ responseId: 'x', sampleRate: 1, eligible: false, reason: 'empty' });
    expect(r.sampled).toBe(false);
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe('empty');
  });

  it('does not sample when responseId is missing (no stable identity)', () => {
    const r = shouldSampleTrailieReview({ responseId: null, sampleRate: 1 });
    expect(r.sampled).toBe(false);
    expect(r.reason).toBe('missing_response_id');
  });

  it('retries cannot create a new sampling decision', () => {
    // "Retry" == same responseId re-evaluated. Decision must be identical.
    const rate = 0.3;
    const first = shouldSampleTrailieReview({ responseId: 'stable-id', sampleRate: rate });
    for (let i = 0; i < 20; i += 1) {
      expect(shouldSampleTrailieReview({ responseId: 'stable-id', sampleRate: rate }).sampled).toBe(
        first.sampled
      );
    }
  });

  it('produces an approximately uniform distribution across ids', () => {
    let sampled = 0;
    const N = 4000;
    for (let i = 0; i < N; i += 1) {
      if (shouldSampleTrailieReview({ responseId: `id-${i}`, sampleRate: 0.5 }).sampled) sampled += 1;
    }
    const ratio = sampled / N;
    expect(ratio).toBeGreaterThan(0.45);
    expect(ratio).toBeLessThan(0.55);
  });
});
