const {
  npsRecordToCanonical,
  canonicalToApiPark,
} = require('../npsParkAdapter');
const { buildSearchHaystack } = require('../../catalog/canonicalPark');
const { filterParksBySearchQuery } = require('../../utils/parkSearchQuery');

describe('npsParkAdapter', () => {
  const sampleNps = {
    parkCode: 'acad',
    fullName: 'Acadia National Park',
    designation: 'National Park',
    states: 'ME',
    description: 'Rocky coastlines and forest trails.',
    latitude: '44.35',
    longitude: '-68.21',
    activities: [{ name: 'Hiking' }, { name: 'Camping' }],
  };

  test('maps NPS record to canonical park', () => {
    const park = npsRecordToCanonical(sampleNps);
    expect(park.id).toBe('acad');
    expect(park.source).toBe('nps');
    expect(park.category).toBe('national_park');
    expect(park.activities).toEqual(['Hiking', 'Camping']);
    expect(park.traits.hiking).toBeGreaterThan(0);
    expect(park.traits.camping).toBeGreaterThan(0);
    expect(park.sourceRecord).toBe(sampleNps);
  });

  test('round-trips to API shape via sourceRecord', () => {
    const park = npsRecordToCanonical(sampleNps);
    expect(canonicalToApiPark(park)).toEqual(sampleNps);
  });

  test('canonical haystack supports token search', () => {
    const park = npsRecordToCanonical(sampleNps);
    const coastal = npsRecordToCanonical({
      ...sampleNps,
      parkCode: 'caha',
      fullName: 'Cape Hatteras National Seashore',
      designation: 'National Seashore',
      description: 'Ocean beaches and scenic drives.',
    });
    const ranked = filterParksBySearchQuery([park, coastal], 'ocean beach');
    expect(ranked.length).toBe(2);
    expect(ranked.some((p) => p.id === 'caha')).toBe(true);
    expect(buildSearchHaystack(park)).toContain('forest');
  });
});
