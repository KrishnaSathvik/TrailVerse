const { createCanonicalPark } = require('../../catalog/canonicalPark');
const { buildParkTraits } = require('../../catalog/traitBuilder');
const {
  filterParksBySearchQuery,
  applyPinnedParksToResults,
} = require('../parkSearchQuery');

describe('park search pinning', () => {
  test('applyPinnedParksToResults prepends missing editorial pins with match reasons', () => {
    const coastal = createCanonicalPark({
      id: 'acad',
      name: 'Acadia National Park',
      source: 'nps',
      category: 'national_park',
      states: 'ME',
      description: 'Scenic rocky coast and romantic sunrise overlooks.',
      activities: ['Scenic Driving', 'Hiking'],
      traits: buildParkTraits({
        description: 'Scenic rocky coast and romantic sunrise overlooks.',
        activities: ['Scenic Driving', 'Hiking'],
        category: 'national_park',
      }),
    });

    const ranked = createCanonicalPark({
      id: 'shen',
      name: 'Shenandoah National Park',
      source: 'nps',
      category: 'national_park',
      states: 'VA',
      description: 'Peaceful Skyline Drive and scenic valley views.',
      activities: ['Scenic Driving', 'Hiking'],
      traits: buildParkTraits({
        description: 'Peaceful Skyline Drive and scenic valley views.',
        activities: ['Scenic Driving', 'Hiking'],
        category: 'national_park',
      }),
    });

    const catalog = [coastal, ranked];
    const searchResults = filterParksBySearchQuery([ranked], 'best parks for couples');
    const merged = applyPinnedParksToResults(
      searchResults,
      catalog,
      ['acad', 'shen'],
      'best parks for couples'
    );

    expect(merged.map((p) => p.id)).toEqual(['acad', 'shen']);
    expect(merged[0].searchMatch?.matchReason).toMatch(/Strong match for/i);
  });
});
