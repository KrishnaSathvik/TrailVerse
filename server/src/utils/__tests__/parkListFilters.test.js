const { filterParksByState } = require('../parkListFilters');

describe('filterParksByState', () => {
  const parks = [
    { parkCode: 'zion', states: 'UT' },
    { parkCode: 'grca', states: 'AZ' },
    { parkCode: 'yell', states: 'ID,MT,WY' },
  ];

  test('returns Utah parks only', () => {
    expect(filterParksByState(parks, 'UT').map((p) => p.parkCode)).toEqual(['zion']);
  });

  test('matches a code inside a multi-state list', () => {
    expect(filterParksByState(parks, 'wy').map((p) => p.parkCode)).toEqual(['yell']);
  });

  test('ignores invalid codes instead of emptying the list', () => {
    expect(filterParksByState(parks, 'utah')).toHaveLength(3);
    expect(filterParksByState(parks, '')).toHaveLength(3);
  });
});
