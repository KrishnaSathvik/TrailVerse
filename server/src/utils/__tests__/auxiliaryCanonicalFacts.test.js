'use strict';

const { mergeCanonicalFactBundles, AUTHORITY } = require('../canonicalFacts');
const {
  buildFeeFreeCanonicalFacts,
  buildAstroCanonicalFacts,
  buildAuxiliaryCanonicalFacts,
} = require('../auxiliaryCanonicalFacts');

describe('buildAuxiliaryCanonicalFacts', () => {
  const feeFreeFacts = {
    hasOverlap: true,
    days: [
      { date: '2026-08-04', label: 'Great American Outdoors Day' },
      { date: '2026-09-27', label: 'National Public Lands Day' },
    ],
  };
  const astroFacts = 'Sunrise 6:12 AM, sunset 8:03 PM. New moon on Aug 4 — great for stargazing.';

  it('builds SECONDARY fee-free facts (never authoritative)', () => {
    const facts = buildFeeFreeCanonicalFacts(feeFreeFacts, { parkCode: 'zion', parkName: 'Zion' });
    expect(facts).toHaveLength(2);
    expect(facts.every((f) => f.authority === AUTHORITY.SECONDARY)).toBe(true);
    expect(facts.every((f) => f.category === 'fee')).toBe(true);
  });

  it('builds a single SECONDARY astro fact from the summary string', () => {
    const facts = buildAstroCanonicalFacts(astroFacts, { parkCode: 'zion', localDate: '2026-08-04' });
    expect(facts).toHaveLength(1);
    expect(facts[0].authority).toBe(AUTHORITY.SECONDARY);
    expect(facts[0].text).toContain('Sunrise');
  });

  it('returns nothing for absent data (no fabrication)', () => {
    expect(buildAuxiliaryCanonicalFacts({})).toEqual([]);
    expect(buildFeeFreeCanonicalFacts({ days: [] })).toEqual([]);
    expect(buildAstroCanonicalFacts('')).toEqual([]);
  });

  it('combined helper includes both sources', () => {
    const facts = buildAuxiliaryCanonicalFacts({
      astroFacts,
      feeFreeFacts,
      resolvedMetadata: { parkCode: 'zion', parkName: 'Zion', localDate: '2026-08-04' },
    });
    expect(facts.some((f) => f.category === 'fee')).toBe(true);
    expect(facts.some((f) => f.category === 'astronomy')).toBe(true);
  });

  it('astronomy and fee-free facts are not dropped when merged with NPS/weather', () => {
    const nps = [{ id: 'nps:zion:closure:1', category: 'closure', text: 'Road closed', parkCode: 'zion' }];
    const aux = buildAuxiliaryCanonicalFacts({ astroFacts, feeFreeFacts, resolvedMetadata: { parkCode: 'zion' } });
    const merged = mergeCanonicalFactBundles([{ facts: nps }, { facts: aux }]);
    const ids = merged.facts.map((f) => f.id);
    for (const f of aux) expect(ids).toContain(f.id);
    expect(ids).toContain('nps:zion:closure:1');
  });

  it('duplicate auxiliary facts deduplicate deterministically', () => {
    const aux = buildAuxiliaryCanonicalFacts({ feeFreeFacts, resolvedMetadata: { parkCode: 'zion' } });
    // Merging the same facts twice must not create duplicates.
    const merged = mergeCanonicalFactBundles([{ facts: aux }, { facts: aux }]);
    expect(merged.facts.length).toBe(aux.length);
  });
});
