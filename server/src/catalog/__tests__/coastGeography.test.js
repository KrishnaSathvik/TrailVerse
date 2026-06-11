const {
  parkHasOceanCoastAccess,
  parkHaystackMatchesWaterToken,
} = require('../coastGeography');
const { haystackMatchesToken } = require('../searchTokens');
const { createCanonicalPark } = require('../canonicalPark');

describe('coastGeography', () => {
  test('Indiana Dunes is not ocean-coast access', () => {
    const park = createCanonicalPark({
      id: 'indu',
      states: 'IN',
      category: 'national_park',
      description: 'Lake Michigan coast and beaches along Indiana shore.',
    });
    expect(parkHasOceanCoastAccess(park)).toBe(false);
  });

  test('ocean token does not match Great Lakes coast alias on inland park', () => {
    const park = createCanonicalPark({
      id: 'indu',
      states: 'IN',
      category: 'national_park',
      description: '15 miles of Indiana coast on Lake Michigan with beaches.',
    });
    const haystack = park.description.toLowerCase();
    expect(
      parkHaystackMatchesWaterToken(park, haystack, 'ocean', haystackMatchesToken)
    ).toBe(false);
    expect(haystackMatchesToken(haystack, 'ocean')).toBe(true);
  });

  test('Acadia matches ocean token via coastal aliases', () => {
    const park = createCanonicalPark({
      id: 'acad',
      states: 'ME',
      category: 'national_park',
      description: 'Rocky Atlantic coast and scenic beaches.',
    });
    const haystack = park.description.toLowerCase();
    expect(parkHasOceanCoastAccess(park)).toBe(true);
    expect(
      parkHaystackMatchesWaterToken(park, haystack, 'ocean', haystackMatchesToken)
    ).toBe(true);
  });
});
