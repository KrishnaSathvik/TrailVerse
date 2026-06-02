const { buildMatchExplanation } = require('../matchExplanation');
const { createCanonicalPark } = require('../canonicalPark');
const { buildParkTraits } = require('../traitBuilder');
const { summarizePrimaryIntents } = require('../queryTraitIntent');

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

  test('quiet + couples uses distinct copy per park (no repeated template)', () => {
    const query = 'quiet parks for couples';
    const traitIntent = {
      relaxing: 0.95,
      nature: 0.85,
      scenic: 0.8,
      romantic: 0.75,
      water: 0.6,
      lake: 0.55,
      mountains: 0.5,
      forest: 0.45,
    };
    const primaryIntents = summarizePrimaryIntents(query);

    const parks = [
      createCanonicalPark({
        id: 'noca',
        name: 'North Cascades National Park',
        states: 'WA',
        description:
          'Jagged peaks and turquoise Diablo and Ross Lakes along Highway 20 — the American Alps with fewer visitors than Rainier.',
        traits: { mountains: 0.9, scenic: 0.85, water: 0.8, relaxing: 0.7, nature: 0.75 },
      }),
      createCanonicalPark({
        id: 'care',
        name: 'Capitol Reef National Park',
        states: 'UT',
        description:
          'Fruita orchards, Cathedral Valley, and slot canyons — the quiet corner of Utah Mighty Five.',
        traits: { scenic: 0.85, nature: 0.8, relaxing: 0.75, water: 0.5 },
      }),
      createCanonicalPark({
        id: 'voya',
        name: 'Voyageurs National Park',
        states: 'MN',
        description:
          'Houseboats, kayaks, and boreal forest on the Canadian Shield — silence scales with distance from the launch.',
        traits: { lake: 0.9, water: 0.85, relaxing: 0.8, nature: 0.75 },
      }),
      createCanonicalPark({
        id: 'acad',
        name: 'Acadia National Park',
        states: 'ME',
        category: 'national_park',
        description:
          'Cadillac Mountain sunrise, Park Loop Road, and carriage roads along the Maine coast.',
        traits: { ocean: 0.7, scenic: 0.9, romantic: 0.8, relaxing: 0.7 },
      }),
    ];

    const reasons = parks.map(
      (park) =>
        buildMatchExplanation(park, traitIntent, ['quiet', 'couples'], primaryIntents)
          .matchReason
    );

    expect(new Set(reasons).size).toBe(reasons.length);
    expect(reasons[0].toLowerCase()).toMatch(/cascad|alps|diablo/);
    expect(reasons[1].toLowerCase()).toMatch(/fruita|mighty five|reef/);
    expect(reasons[2].toLowerCase()).toMatch(/houseboat|launch|boreal/);
    expect(reasons[3].toLowerCase()).toMatch(/cadillac|carriage|maine/);
  });
});
