'use strict';

const { runTrailieReviewPipeline } = require('../trailieReviewPipeline');
const {
  makeFact,
  mergeCanonicalFactBundles,
  AUTHORITY,
  STATUS,
  CANONICAL_FACT_STATUS,
  FACT_EVIDENCE_REASON,
} = require('../../utils/canonicalFacts');

const RETRIEVED_AT = '2026-07-22T16:41:00.000Z';

function factFor(parkCode, text, sourceId) {
  return makeFact({
    source: 'nps',
    category: 'closure',
    sourceId,
    text,
    parkCode,
    parkName: parkCode.toUpperCase(),
    authority: AUTHORITY.AUTHORITATIVE,
    status: STATUS.ACTIVE_CLOSURE,
    retrievedAt: RETRIEVED_AT,
  });
}

const olym = factFor('olym', 'Hoh Road closed above the ranger station', 'o1');
const glac = factFor('glac', 'Going-to-the-Sun Road closed', 'g1');
const MERGED = mergeCanonicalFactBundles([{ facts: [olym] }, { facts: [glac] }]);

const DOC = [
  'Your two-park plan.',
  '',
  '## Day 1 — Hoh Rain Forest',
  'The Hoh Road is open right now.',
  '',
  '## Day 2 — Logan Pass',
  'Scenic overlooks.',
  '',
].join('\n');

function stubAnthropic() {
  return {
    messages: {
      create: jest.fn(async () => ({ content: [{ type: 'text', text: JSON.stringify({ issues: [] }) }] })),
    },
  };
}

describe('review pipeline canonical-fact observability', () => {
  test('a merged multi-park bundle reaches the reviewer and is counted by source and park', async () => {
    const { reviewMeta } = await runTrailieReviewPipeline({
      anthropic: stubAnthropic(),
      responseContent: DOC,
      canonicalFactBundle: MERGED,
      canonicalFactStatus: CANONICAL_FACT_STATUS.AVAILABLE,
      resolvedMetadata: { parkCode: 'olym' },
      allExtractedParks: [{ parkCode: 'olym' }, { parkCode: 'glac' }],
      mode: 'shadow',
    });

    expect(reviewMeta.canonicalFactStatus).toBe(CANONICAL_FACT_STATUS.AVAILABLE);
    expect(reviewMeta.canonicalFactsTotal).toBe(2);
    expect(reviewMeta.canonicalFactsBySource).toEqual({ nps: 2 });
    expect(reviewMeta.canonicalFactsByPark).toEqual({ olym: 1, glac: 1 });
    expect(reviewMeta.factMergeErrors).toEqual([]);
  });

  test('collisions surface as factMergeErrors in metadata', async () => {
    const collided = mergeCanonicalFactBundles([
      { facts: [olym] },
      { facts: [{ ...olym, text: 'Hoh Road OPEN' }] },
    ]);

    const { reviewMeta } = await runTrailieReviewPipeline({
      anthropic: stubAnthropic(),
      responseContent: DOC,
      canonicalFactBundle: collided,
      canonicalFactStatus: CANONICAL_FACT_STATUS.AVAILABLE,
      mode: 'shadow',
    });

    expect(reviewMeta.factMergeErrors).toHaveLength(1);
    expect(reviewMeta.factMergeErrors[0].code).toBe(FACT_EVIDENCE_REASON.FACT_ID_COLLISION);
  });

  test('sections that matched no facts are listed distinctly from unreviewed sections', async () => {
    const { reviewMeta } = await runTrailieReviewPipeline({
      anthropic: stubAnthropic(),
      responseContent: DOC,
      canonicalFactBundle: mergeCanonicalFactBundles([{ facts: [glac] }]),
      canonicalFactStatus: CANONICAL_FACT_STATUS.AVAILABLE,
      resolvedMetadata: { parkCode: 'olym' },
      allExtractedParks: [{ parkCode: 'olym' }],
      mode: 'shadow',
    });

    // Only glac fact exists but scope is olym → no fact matches any section.
    expect(Array.isArray(reviewMeta.sectionsWithNoFacts)).toBe(true);
    expect(reviewMeta.sectionsWithNoFacts.length).toBeGreaterThan(0);
  });

  test('empty-evidence sections are classified rather than collapsed to one reason', async () => {
    // Facts exist (glac) but section scope is olym → no_relevant_fact, NOT unavailable.
    const relevant = await runTrailieReviewPipeline({
      anthropic: stubAnthropic(),
      responseContent: DOC,
      canonicalFactBundle: mergeCanonicalFactBundles([{ facts: [glac] }]),
      canonicalFactStatus: CANONICAL_FACT_STATUS.AVAILABLE,
      resolvedMetadata: { parkCode: 'olym' },
      allExtractedParks: [{ parkCode: 'olym' }],
      mode: 'shadow',
    });
    const relevantReasons = Object.values(relevant.reviewMeta.sectionEvidenceReasons);
    expect(relevantReasons.every((r) => r === FACT_EVIDENCE_REASON.NO_RELEVANT_FACT)).toBe(true);

    // Facts were never requested → facts_not_requested.
    const notRequested = await runTrailieReviewPipeline({
      anthropic: stubAnthropic(),
      responseContent: DOC,
      canonicalFactBundle: mergeCanonicalFactBundles([]),
      canonicalFactStatus: CANONICAL_FACT_STATUS.NOT_REQUESTED,
      mode: 'shadow',
    });
    const notRequestedReasons = Object.values(notRequested.reviewMeta.sectionEvidenceReasons);
    expect(notRequestedReasons.length).toBeGreaterThan(0);
    expect(notRequestedReasons.every((r) => r === FACT_EVIDENCE_REASON.FACTS_NOT_REQUESTED)).toBe(true);

    // Facts requested but the fetch failed → facts_unavailable.
    const unavailable = await runTrailieReviewPipeline({
      anthropic: stubAnthropic(),
      responseContent: DOC,
      canonicalFactBundle: mergeCanonicalFactBundles([]),
      canonicalFactStatus: CANONICAL_FACT_STATUS.FETCH_FAILED,
      mode: 'shadow',
    });
    const unavailableReasons = Object.values(unavailable.reviewMeta.sectionEvidenceReasons);
    expect(unavailableReasons.every((r) => r === FACT_EVIDENCE_REASON.FACTS_UNAVAILABLE)).toBe(true);
  });

  test('metadata never embeds full canonical fact text', async () => {
    const { reviewMeta } = await runTrailieReviewPipeline({
      anthropic: stubAnthropic(),
      responseContent: DOC,
      canonicalFactBundle: MERGED,
      canonicalFactStatus: CANONICAL_FACT_STATUS.AVAILABLE,
      mode: 'shadow',
    });

    const serialized = JSON.stringify(reviewMeta);
    expect(serialized).not.toContain('Hoh Road closed above the ranger station');
    expect(serialized).not.toContain('Going-to-the-Sun Road closed');
  });
});
