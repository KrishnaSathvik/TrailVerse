const {
  isBroadDiscoveryQuery,
  isOpenEndedDestinationQuery,
  shouldInjectParkDiscovery,
} = require('../discoveryQuery');

describe('discoveryQuery (principle-based routing)', () => {
  test('open-ended when no park is named in the message', () => {
    const julyBeach =
      'so which is best to visit in July for cool not so hot summer vibes with lakes or beach or even hot springs';
    expect(isOpenEndedDestinationQuery(julyBeach, { namedParkCount: 0 })).toBe(true);
    expect(shouldInjectParkDiscovery(julyBeach, { namedParkCount: 0 })).toBe(true);
    expect(isBroadDiscoveryQuery(julyBeach)).toBe(true);

    expect(
      shouldInjectParkDiscovery(
        'need peaceful trip with my girlfriend she just wants to relax and swim',
        { namedParkCount: 0 }
      )
    ).toBe(true);
  });

  test('compare / multi-park questions use discovery when two parks are named', () => {
    expect(
      shouldInjectParkDiscovery('Zion vs Bryce for first timers', { namedParkCount: 2 })
    ).toBe(true);
  });

  test('single named park is a focused question, not destination discovery', () => {
    expect(
      shouldInjectParkDiscovery('what are the best hikes in Yosemite', { namedParkCount: 1 })
    ).toBe(false);
  });

  test('rejects specific itinerary planning', () => {
    const planMsg = 'plan a 3 day trip to yellowstone with kids';
    expect(isBroadDiscoveryQuery(planMsg)).toBe(false);
    expect(shouldInjectParkDiscovery(planMsg, { namedParkCount: 0 })).toBe(false);
  });

  test('rejects very short or non-travel messages', () => {
    expect(isBroadDiscoveryQuery('hi')).toBe(false);
    expect(shouldInjectParkDiscovery('hi')).toBe(false);
  });
});
