'use strict';

const { buildCanonicalTrailieResponse } = require('../canonicalResponse');
const {
  buildTrailieReviewSnapshot,
  recomputeSnapshotHashes,
} = require('../trailieReviewSnapshot');

function makeEnvelope(overrides = {}) {
  return buildCanonicalTrailieResponse({
    responseId: 'resp-1',
    responseVersion: 3,
    processedContent: 'Visit Zion. Angels Landing needs a permit.',
    itineraryData: overrides.itineraryData ?? {
      days: [{ id: 'd1', label: 'Day 1', stops: [{ id: 's1', name: 'Zion', parkCode: 'zion' }] }],
    },
    ...overrides,
  });
}

const bundle = {
  facts: [
    {
      id: 'nps:zion:permit:1',
      category: 'permit',
      source: 'nps',
      authority: 'authoritative',
      status: 'confirmed_required',
      text: 'Angels Landing requires a permit.',
      parkCode: 'zion',
      parkName: 'Zion National Park',
      validFrom: null,
      validTo: null,
      localDate: '2026-07-01',
      url: 'https://nps.gov/zion',
      // internal bookkeeping that must NOT leak into the snapshot:
      terms: ['angels', 'landing', 'permit'],
      rawFeed: { secret: true },
    },
  ],
};

describe('buildTrailieReviewSnapshot', () => {
  it('captures the exact canonical response identity', () => {
    const envelope = makeEnvelope();
    const snap = buildTrailieReviewSnapshot({ envelope, canonicalFactBundle: bundle });
    expect(snap.canonicalResponse.responseId).toBe('resp-1');
    expect(snap.canonicalResponse.responseVersion).toBe(3);
    expect(snap.canonicalResponse.content).toBe(envelope.content);
    expect(snap.canonicalResponse.contentHash).toBe(envelope.contentHash);
    expect(snap.canonicalResponse.itineraryHash).toBe(envelope.itineraryHash);
  });

  it('projects only whitelisted fact fields — no internal bookkeeping', () => {
    const snap = buildTrailieReviewSnapshot({ envelope: makeEnvelope(), canonicalFactBundle: bundle });
    const fact = snap.canonicalFacts[0];
    expect(fact).toEqual({
      id: 'nps:zion:permit:1',
      category: 'permit',
      source: 'nps',
      authority: 'authoritative',
      status: 'confirmed_required',
      text: 'Angels Landing requires a permit.',
      parkCode: 'zion',
      parkName: 'Zion National Park',
      validFrom: null,
      validTo: null,
      localDate: '2026-07-01',
      url: 'https://nps.gov/zion',
    });
    expect(fact).not.toHaveProperty('terms');
    expect(fact).not.toHaveProperty('rawFeed');
  });

  it('never stores conversation history or personal profile', () => {
    const snap = buildTrailieReviewSnapshot({
      envelope: makeEnvelope(),
      canonicalFactBundle: bundle,
      // Even if someone passes junk, only whitelisted metadata survives.
      resolvedMetadata: { parkCode: 'zion', parkName: 'Zion', userEmail: 'x@y.z', authToken: 'secret' },
    });
    const serialized = JSON.stringify(snap);
    expect(serialized).not.toContain('x@y.z');
    expect(serialized).not.toContain('authToken');
    expect(serialized).not.toContain('secret');
    expect(snap).not.toHaveProperty('conversation');
    expect(snap.resolvedMetadata).toEqual({
      parkCode: 'zion',
      parkName: 'Zion',
      parkNames: [],
      localDate: null,
      state: null,
    });
  });

  it('recomputes hashes matching the envelope', () => {
    const envelope = makeEnvelope();
    const snap = buildTrailieReviewSnapshot({ envelope, canonicalFactBundle: bundle });
    const rec = recomputeSnapshotHashes(snap);
    expect(rec.contentHash).toBe(envelope.contentHash);
    expect(rec.itineraryHash).toBe(envelope.itineraryHash);
  });

  it('detects drift when snapshot content is tampered', () => {
    const snap = buildTrailieReviewSnapshot({ envelope: makeEnvelope(), canonicalFactBundle: bundle });
    snap.canonicalResponse.content = 'tampered';
    const rec = recomputeSnapshotHashes(snap);
    expect(rec.contentHash).not.toBe(snap.canonicalResponse.contentHash);
  });

  it('requires a canonical envelope with responseId', () => {
    expect(() => buildTrailieReviewSnapshot({ envelope: {} })).toThrow(/responseId/);
  });
});
