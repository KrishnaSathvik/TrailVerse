const { isBroadDiscoveryQuery } = require('../discoveryQuery');

describe('discoveryQuery', () => {
  test('detects broad discovery phrases', () => {
    expect(isBroadDiscoveryQuery('best parks for couples')).toBe(true);
    expect(isBroadDiscoveryQuery('nature relax ocean vibes')).toBe(true);
    expect(isBroadDiscoveryQuery('quiet parks for beginners')).toBe(true);
    expect(isBroadDiscoveryQuery('romantic beach parks')).toBe(true);
  });

  test('rejects specific itinerary planning', () => {
    expect(
      isBroadDiscoveryQuery('plan a 3 day trip to yellowstone with kids')
    ).toBe(false);
  });

  test('rejects very short messages', () => {
    expect(isBroadDiscoveryQuery('hi')).toBe(false);
  });
});
