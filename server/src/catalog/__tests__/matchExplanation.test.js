const { buildMatchExplanation } = require('../matchExplanation');
const { createCanonicalPark } = require('../canonicalPark');
const { buildParkTraits } = require('../traitBuilder');

describe('matchExplanation', () => {
  test('builds trait-based match reason', () => {
    const park = createCanonicalPark({
      id: 'caha',
      name: 'Cape Hatteras National Seashore',
      source: 'nps',
      category: 'national_seashore',
      description: 'Ocean beaches and scenic coastal drives with wildlife.',
      activities: ['Beachcombing'],
      traits: buildParkTraits({
        description: 'Ocean beaches and scenic coastal drives with wildlife.',
        activities: ['Beachcombing'],
        category: 'national_seashore',
      }),
    });

    const { matchReason, matchedTraits } = buildMatchExplanation(
      park,
      { ocean: 1, relaxing: 0.8, scenic: 0.5 },
      ['ocean', 'relax']
    );

    expect(matchedTraits.length).toBeGreaterThan(0);
    expect(matchReason.toLowerCase()).toContain('ocean');
  });

  test('suppresses ocean trait for inland parks without coast access', () => {
    const park = createCanonicalPark({
      id: 'grte',
      name: 'Grand Teton National Park',
      source: 'nps',
      category: 'national_park',
      states: 'WY',
      description: 'Alpine peaks and pristine lakes.',
      activities: ['Boating', 'Hiking'],
      traits: {
        ocean: 0.4,
        scenic: 0.7,
        water: 0.7,
        relaxing: 0.4,
        nature: 0.5,
      },
    });

    const { matchReason, matchedTraits } = buildMatchExplanation(
      park,
      { ocean: 0.55, scenic: 0.75, water: 0.65, relaxing: 0.95, nature: 0.4 },
      ['couples']
    );

    expect(matchedTraits).not.toContain('ocean');
    expect(matchReason.toLowerCase()).not.toContain('ocean');
  });
});
