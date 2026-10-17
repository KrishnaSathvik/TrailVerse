'use strict';

const {
  makeFact,
  buildFactBundle,
  mergeCanonicalFactBundles,
  FACT_EVIDENCE_REASON,
} = require('../canonicalFacts');

const RETRIEVED_AT = '2026-07-22T16:41:00.000Z';

function parkBundle(parkCode, parkName, texts) {
  const facts = texts.map((text) =>
    makeFact({
      source: 'nps',
      category: 'closure',
      text,
      parkCode,
      parkName,
      sourceId: text, // stable native id so ids are deterministic per text
      retrievedAt: RETRIEVED_AT,
    })
  );
  return buildFactBundle([facts], { retrievedAt: RETRIEVED_AT });
}

describe('mergeCanonicalFactBundles', () => {
  test('merges multiple single-park bundles preserving park identity', () => {
    const glacier = parkBundle('glac', 'Glacier', ['Going-to-the-Sun Road closed']);
    const olympic = parkBundle('olym', 'Olympic', ['Hurricane Ridge Road closed']);

    const merged = mergeCanonicalFactBundles([glacier, olympic]);

    expect(merged.all).toHaveLength(2);
    // `facts` mirrors `all` so the merged bundle is a drop-in for the reviewer.
    expect(merged.facts).toBe(merged.all);
    expect(merged.parkCodes.sort()).toEqual(['glac', 'olym']);
    expect(merged.mergeErrors).toEqual([]);
    for (const fact of merged.all) {
      expect(merged.byId[fact.id]).toBe(fact);
    }
    // Park identity is not cross-contaminated.
    const byPark = merged.all.reduce((acc, f) => {
      (acc[f.parkCode] ||= []).push(f.text);
      return acc;
    }, {});
    expect(byPark.glac).toEqual(['Going-to-the-Sun Road closed']);
    expect(byPark.olym).toEqual(['Hurricane Ridge Road closed']);
  });

  test('separates global (park-less) facts into their own list', () => {
    const parked = parkBundle('glac', 'Glacier', ['Road closed']);
    const globalFact = makeFact({
      source: 'trailverse',
      category: 'fee',
      text: 'National fee-free day on 2026-08-04',
      retrievedAt: RETRIEVED_AT,
    });
    const globalBundle = buildFactBundle([[globalFact]], { retrievedAt: RETRIEVED_AT });

    const merged = mergeCanonicalFactBundles([parked, globalBundle]);

    expect(merged.global).toHaveLength(1);
    expect(merged.global[0].parkCode).toBeNull();
    expect(merged.parkCodes).toEqual(['glac']);
    expect(merged.all).toHaveLength(2);
  });

  test('identical duplicate facts deduplicate without a merge error', () => {
    const a = parkBundle('glac', 'Glacier', ['Road closed']);
    const b = parkBundle('glac', 'Glacier', ['Road closed']);

    const merged = mergeCanonicalFactBundles([a, b]);

    expect(merged.all).toHaveLength(1);
    expect(merged.mergeErrors).toEqual([]);
  });

  test('same id with different content is recorded as fact_id_collision and never silently overwritten', () => {
    const original = parkBundle('glac', 'Glacier', ['Road closed until June']);
    // Forge a colliding id with different text.
    const collidingFact = { ...original.facts[0], text: 'Road OPEN — no closures' };
    const collidingBundle = buildFactBundle([[collidingFact]], { retrievedAt: RETRIEVED_AT });

    const merged = mergeCanonicalFactBundles([original, collidingBundle]);

    expect(merged.all).toHaveLength(1);
    // The first-seen fact wins; the conflicting one does not overwrite it.
    expect(merged.byId[original.facts[0].id].text).toBe('Road closed until June');
    expect(merged.mergeErrors).toHaveLength(1);
    expect(merged.mergeErrors[0]).toMatchObject({
      code: FACT_EVIDENCE_REASON.FACT_ID_COLLISION,
      id: original.facts[0].id,
    });
  });

  test('ignores null/empty bundles and returns a well-formed empty result', () => {
    const merged = mergeCanonicalFactBundles([null, undefined, { facts: [] }]);
    expect(merged.all).toEqual([]);
    expect(merged.byId).toEqual({});
    expect(merged.global).toEqual([]);
    expect(merged.parkCodes).toEqual([]);
    expect(merged.mergeErrors).toEqual([]);
    expect(typeof merged.retrievedAt).toBe('string');
  });
});
