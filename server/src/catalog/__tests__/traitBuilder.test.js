const { buildParkTraits } = require('../traitBuilder');
const {
  buildTraitIntentFromQuery,
  scoreTraitIntent,
  summarizePrimaryIntents,
} = require('../queryTraitIntent');
const { filterParksBySearchQuery } = require('../../utils/parkSearchQuery');
const { createCanonicalPark } = require('../canonicalPark');

describe('traitBuilder', () => {
  test('scores ocean traits from coastal description', () => {
    const park = createCanonicalPark({
      id: 'caha',
      name: 'Cape Hatteras National Seashore',
      source: 'nps',
      category: 'national_seashore',
      description: 'Ocean beaches and scenic coastal drives.',
      activities: ['Beachcombing', 'Fishing'],
    });
    const traits = buildParkTraits(park);
    expect(traits.ocean).toBeGreaterThanOrEqual(0.6);
    expect(traits.scenic).toBeGreaterThan(0);
  });

  test('photography query ranks scenic parks via traits', () => {
    const scenic = createCanonicalPark({
      id: 'crla',
      name: 'Crater Lake National Park',
      source: 'nps',
      category: 'national_park',
      description: 'Stunning scenic viewpoints and sunrise photography.',
      activities: ['Photography'],
      traits: buildParkTraits({
        description: 'Stunning scenic viewpoints and sunrise photography.',
        activities: ['Photography'],
        category: 'national_park',
      }),
    });
    const historic = createCanonicalPark({
      id: 'ande',
      name: 'Andersonville National Historic Site',
      source: 'nps',
      category: 'national_historic_site',
      description: 'Civil War prison site and museum.',
      activities: ['Museum Tours'],
      traits: buildParkTraits({
        description: 'Civil War prison site and museum.',
        activities: ['Museum Tours'],
        category: 'national_historic_site',
      }),
    });

    const intent = buildTraitIntentFromQuery('best parks for photography');
    expect(intent.photography).toBe(1);
    expect(scoreTraitIntent(scenic, intent)).toBeGreaterThan(
      scoreTraitIntent(historic, intent)
    );

    const ranked = filterParksBySearchQuery([historic, scenic], 'best parks for photography');
    expect(ranked[0].id).toBe('crla');
  });

  test('couples query prefers coastal over dry desert-only parks', () => {
    const desert = createCanonicalPark({
      id: 'orpi',
      name: 'Organ Pipe Cactus National Monument',
      source: 'nps',
      category: 'national_monument',
      description: 'Sonoran desert scenic drives and rugged trails.',
      activities: ['Hiking', 'Camping'],
      traits: buildParkTraits({
        description: 'Sonoran desert scenic drives and rugged trails.',
        activities: ['Hiking', 'Camping'],
        category: 'national_monument',
      }),
    });
    const coastal = createCanonicalPark({
      id: 'caha',
      name: 'Cape Hatteras National Seashore',
      source: 'nps',
      category: 'national_seashore',
      description: 'Ocean beaches, sunsets, and peaceful shoreline walks.',
      activities: ['Beachcombing'],
      traits: buildParkTraits({
        description: 'Ocean beaches, sunsets, and peaceful shoreline walks.',
        activities: ['Beachcombing'],
        category: 'national_seashore',
      }),
    });

    const ranked = filterParksBySearchQuery([desert, coastal], 'best parks for couples');
    expect(ranked[0].id).toBe('caha');
  });

  test('first time visitors does not rank historic sites named with "first"', () => {
    const historic = createCanonicalPark({
      id: 'fila',
      name: 'First Ladies National Historic Site',
      source: 'nps',
      category: 'national_historic_site',
      description: 'Museum about first ladies.',
      activities: ['Museum Tours'],
      traits: buildParkTraits({
        description: 'Museum about first ladies.',
        activities: ['Museum Tours'],
        category: 'national_historic_site',
      }),
    });
    const familyPark = createCanonicalPark({
      id: 'indu',
      name: 'Indiana Dunes National Park',
      source: 'nps',
      category: 'national_park',
      description: 'Family-friendly beaches, accessible trails, and scenic dunes.',
      activities: ['Hiking', 'Junior Ranger'],
      traits: buildParkTraits({
        description: 'Family-friendly beaches, accessible trails, and scenic dunes.',
        activities: ['Hiking', 'Junior Ranger'],
        category: 'national_park',
      }),
    });

    const ranked = filterParksBySearchQuery(
      [historic, familyPark],
      'best parks for first time visitors'
    );
    expect(ranked[0].id).toBe('indu');
    expect(ranked[0].searchMatch.matchedTraits).not.toContain('first');
  });

  test('quiet parks for beginners prefers relaxing scenic parks', () => {
    const memorial = createCanonicalPark({
      id: 'cham',
      name: 'Chamizal National Memorial',
      source: 'nps',
      category: 'national_memorial',
      description: 'Urban memorial plaza.',
      activities: [],
      traits: {},
    });
    const relaxing = createCanonicalPark({
      id: 'sleep',
      name: 'Sleeping Bear Dunes National Lakeshore',
      source: 'nps',
      category: 'national_lakeshore',
      description: 'Peaceful quiet shoreline and scenic overlooks.',
      activities: ['Hiking'],
      traits: buildParkTraits({
        description: 'Peaceful quiet shoreline and scenic overlooks.',
        activities: ['Hiking'],
        category: 'national_lakeshore',
      }),
    });

    const ranked = filterParksBySearchQuery(
      [memorial, relaxing],
      'quiet parks for beginners'
    );
    expect(ranked[0].id).toBe('sleep');
  });

  test('summarizePrimaryIntents ranks quiet above beginners', () => {
    const intents = summarizePrimaryIntents('quiet parks for beginners');
    expect(intents.length).toBeGreaterThanOrEqual(2);
    expect(intents[0].label).toBe('quiet');
    expect(intents[0].weight).toBeGreaterThanOrEqual(intents[1].weight);
    expect(intents.some((i) => i.label === 'beginners')).toBe(true);
  });

  test('mountain lake parks with boating do not score ocean traits', () => {
    const traits = buildParkTraits({
      description:
        'Soaring alpine peaks, pristine lakes, and scenic vistas in the Teton Range.',
      activities: ['Boating', 'Fishing', 'Hiking', 'Scenic Driving'],
      category: 'national_park',
    });
    expect(traits.ocean || 0).toBe(0);
    expect(traits.water).toBeGreaterThan(0);
  });

  test('indiana dunes on Lake Michigan does not score ocean from coast/beach language', () => {
    const traits = buildParkTraits({
      description:
        "Lake Michigan's might has influenced Indiana Dunes. Wind and waves shaped the land along 15 miles of Indiana coast with beaches and dunes.",
      activities: ['Hiking', 'Swimming', 'Beachcombing'],
      category: 'national_park',
    });
    expect(traits.ocean || 0).toBe(0);
    expect(traits.lake).toBeGreaterThan(0);
    expect(traits.water).toBeGreaterThan(0);
  });

  test('great lakes national lakeshore does not score ocean from coastal language', () => {
    const traits = buildParkTraits({
      description:
        'Sandstone cliffs, beaches, and wild shoreline on Lake Superior. Coastal features abound.',
      activities: ['Hiking', 'Camping'],
      category: 'national_lakeshore',
    });
    expect(traits.ocean || 0).toBe(0);
    expect(traits.lake).toBeGreaterThan(0);
    expect(traits.water).toBeGreaterThan(0);
  });

  test('pacific coastline still scores ocean outside lake context', () => {
    const traits = buildParkTraits({
      description: 'Pristine rivers and untamed coastline along the Pacific.',
      activities: ['Hiking'],
      category: 'national_park',
    });
    expect(traits.ocean).toBeGreaterThanOrEqual(0.3);
  });

  test('night skies does not score winter from ski prefix', () => {
    const traits = buildParkTraits({
      description: 'Night skies are dark as coal above ancient limestone canyons.',
      activities: ['Hiking'],
      category: 'national_park',
    });
    expect(traits.winter || 0).toBe(0);
  });

  test('play titles with Iceman do not score winter', () => {
    const traits = buildParkTraits({
      description: 'Home where O\'Neill wrote The Iceman Cometh and other plays.',
      activities: ['Guided Tours'],
      category: 'national_historic_site',
    });
    expect(traits.winter || 0).toBe(0);
  });

  test('reservoir lake recreation areas do not score ocean traits', () => {
    const traits = buildParkTraits({
      description:
        'Lake Roosevelt shorelines and blue water on a vast inland reservoir.',
      activities: ['Boating', 'Snorkeling', 'Fishing'],
      category: 'national_recreation_area',
    });
    expect(traits.ocean || 0).toBe(0);
    expect(traits.water).toBeGreaterThan(0);
  });

  test('sunset photos ranks photography parks over name-only sunset matches', () => {
    const volcano = createCanonicalPark({
      id: 'sucr',
      name: 'Sunset Crater Volcano National Monument',
      source: 'nps',
      category: 'national_monument',
      description: 'Volcanic cinder cone.',
      activities: ['Hiking'],
      traits: buildParkTraits({
        description: 'Volcanic cinder cone.',
        activities: ['Hiking'],
        category: 'national_monument',
      }),
    });
    const scenic = createCanonicalPark({
      id: 'arch',
      name: 'Arches National Park',
      source: 'nps',
      category: 'national_park',
      description: 'Iconic sunset photography and scenic desert vistas.',
      activities: ['Photography', 'Scenic Drive'],
      traits: buildParkTraits({
        description: 'Iconic sunset photography and scenic desert vistas.',
        activities: ['Photography', 'Scenic Drive'],
        category: 'national_park',
      }),
    });

    const ranked = filterParksBySearchQuery(
      [volcano, scenic],
      'best parks for sunset photos'
    );
    expect(ranked[0].id).toBe('arch');
  });
});
