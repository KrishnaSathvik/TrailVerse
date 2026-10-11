'use strict';

const {
  buildCanonicalTrailieResponse,
  stableStringify,
  hashPayload,
} = require('../canonicalResponse');

describe('stableStringify', () => {
  test('is insensitive to object key insertion order', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  test('preserves array order (order is semantic for days/stops)', () => {
    expect(stableStringify([1, 2, 3])).not.toBe(stableStringify([3, 2, 1]));
  });

  test('sorts nested keys recursively', () => {
    const a = { days: [{ id: 'd1', stops: [{ name: 'X', order: 0 }] }] };
    const b = { days: [{ stops: [{ order: 0, name: 'X' }], id: 'd1' }] };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });
});

describe('buildCanonicalTrailieResponse', () => {
  test('provider Date timestamps retain a verifiable hash across JSON transport', () => {
    const itineraryData = { days: [{ stops: [{ sourceReferences: [
      { observedAt: new Date('2026-10-10T22:39:43.209Z'), evidenceId: 'official-place' },
    ] }] }] };
    const response = buildCanonicalTrailieResponse({ processedContent: 'Saved trip.', itineraryData });
    const wire = JSON.parse(JSON.stringify(response));
    expect(hashPayload(wire.itineraryData)).toBe(response.itineraryHash);
    const changed = structuredClone(itineraryData);
    changed.days[0].stops[0].sourceReferences[0].observedAt = new Date('2026-10-11T22:39:43.209Z');
    expect(hashPayload(changed)).not.toBe(response.itineraryHash);
  });
  const base = {
    responseId: 'resp-123',
    rawStreamContent: 'Zion plan.\n\n[ITINERARY_JSON]{"days":[]}[/ITINERARY_JSON]',
    processedContent: 'Zion plan.\n\n[ITINERARY_JSON]{"days":[]}[/ITINERARY_JSON]',
    itineraryData: { days: [{ id: 'day-1', stops: [{ name: 'Narrows', order: 0 }] }] },
    planScore: { total: 82 },
    corrections: ['Removed a strenuous hike'],
    feasibilityIssues: ['Day 2 is long'],
    provider: 'claude',
    model: 'claude-opus-4-8',
    reviewMeta: { reviewerRan: true, reviewStatus: 'ok' },
  };

  test('content is the artifact-stripped processedContent, never the raw stream', () => {
    const env = buildCanonicalTrailieResponse(base);
    expect(env.content).toBe('Zion plan.');
    expect(env.content).not.toContain('ITINERARY_JSON');
  });

  test('contentHash is deterministic for identical canonical content', () => {
    const a = buildCanonicalTrailieResponse(base);
    const b = buildCanonicalTrailieResponse(base);
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.contentHash).toMatch(/^[0-9a-f]{16,}$/);
  });

  test('contentHash ignores createdAt (same content at different times hashes equal)', () => {
    const a = buildCanonicalTrailieResponse(base);
    const b = buildCanonicalTrailieResponse({ ...base });
    expect(a.createdAt).toEqual(expect.any(String));
    expect(a.contentHash).toBe(b.contentHash);
  });

  test('contentHash changes when the canonical content changes', () => {
    const a = buildCanonicalTrailieResponse(base);
    const b = buildCanonicalTrailieResponse({ ...base, processedContent: 'Different plan.' });
    expect(a.contentHash).not.toBe(b.contentHash);
  });

  test('itineraryHash is insensitive to itinerary key order', () => {
    const a = buildCanonicalTrailieResponse(base);
    const b = buildCanonicalTrailieResponse({
      ...base,
      itineraryData: { days: [{ stops: [{ order: 0, name: 'Narrows' }], id: 'day-1' }] },
    });
    expect(a.itineraryHash).toBe(b.itineraryHash);
  });

  test('itineraryHash is null when there is no itinerary', () => {
    const env = buildCanonicalTrailieResponse({ ...base, itineraryData: null });
    expect(env.itineraryHash).toBeNull();
    expect(env.itineraryData).toBeNull();
  });

  test('responseVersion defaults to 1 and preserves an explicit value', () => {
    expect(buildCanonicalTrailieResponse(base).responseVersion).toBe(1);
    expect(buildCanonicalTrailieResponse({ ...base, responseVersion: 3 }).responseVersion).toBe(3);
  });

  test('carries provider, model, planScore, corrections, feasibilityIssues, reviewMeta through', () => {
    const env = buildCanonicalTrailieResponse(base);
    expect(env.provider).toBe('claude');
    expect(env.model).toBe('claude-opus-4-8');
    expect(env.planScore).toEqual({ total: 82 });
    expect(env.corrections).toEqual(['Removed a strenuous hike']);
    expect(env.feasibilityIssues).toEqual(['Day 2 is long']);
    expect(env.reviewMeta).toEqual({ reviewerRan: true, reviewStatus: 'ok' });
    expect(env.responseId).toBe('resp-123');
  });

  test('generates a responseId when one is not supplied', () => {
    const env = buildCanonicalTrailieResponse({ ...base, responseId: undefined });
    expect(typeof env.responseId).toBe('string');
    expect(env.responseId.length).toBeGreaterThan(0);
  });

  test('hashPayload is stable and order-insensitive for objects', () => {
    expect(hashPayload({ a: 1, b: 2 })).toBe(hashPayload({ b: 2, a: 1 }));
    expect(hashPayload('abc')).toMatch(/^[0-9a-f]{16,}$/);
  });
});
