'use strict';

/**
 * Stage 10 (F-DATA-1) invariant:
 *   canonical fact IDs available to generation
 *     ⊆ canonical fact IDs available to asynchronous review
 *
 * The snapshot must carry the EXACT merged generation-time bundle so section
 * selection (not a pre-selection drop) is the only thing that scopes evidence.
 */

const { buildCanonicalTrailieResponse } = require('../canonicalResponse');
const { mergeCanonicalFactBundles } = require('../canonicalFacts');
const { buildAuxiliaryCanonicalFacts } = require('../auxiliaryCanonicalFacts');
const { buildTrailieReviewSnapshot } = require('../trailieReviewSnapshot');

function npsFact(parkCode, id) {
  return { id, category: 'closure', source: 'nps', text: `${parkCode} road closed`, parkCode };
}

describe('generation bundle ⊆ review snapshot facts', () => {
  it('every generation-time fact id survives into the snapshot', () => {
    const generationBundle = mergeCanonicalFactBundles([
      { facts: [npsFact('zion', 'nps:zion:closure:1'), npsFact('brca', 'nps:brca:closure:1')] },
      {
        facts: buildAuxiliaryCanonicalFacts({
          astroFacts: 'Sunset 8:03 PM.',
          feeFreeFacts: { days: [{ date: '2026-08-04', label: 'Free day' }] },
          resolvedMetadata: { parkCode: 'zion' },
        }),
      },
    ]);
    const generationIds = new Set(generationBundle.facts.map((f) => f.id));

    const envelope = buildCanonicalTrailieResponse({
      responseId: 'r1',
      processedContent: 'A two-park plan.',
      itineraryData: null,
    });
    const snapshot = buildTrailieReviewSnapshot({
      envelope,
      canonicalFactBundle: generationBundle,
      canonicalFactStatus: 'available',
    });

    const reviewIds = new Set(snapshot.canonicalFacts.map((f) => f.id));
    for (const id of generationIds) expect(reviewIds.has(id)).toBe(true);
    // Multi-source parity: NPS, fee-free, and astronomy all present.
    expect([...reviewIds].some((id) => id.startsWith('nps:'))).toBe(true);
    expect([...reviewIds].some((id) => id.startsWith('fee_free:'))).toBe(true);
    expect([...reviewIds].some((id) => id.startsWith('astro:'))).toBe(true);
  });
});
