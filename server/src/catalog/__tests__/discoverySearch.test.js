const {
  queryWantsNationalParksOnly,
  isNationalParkDesignation,
  queryWantsCoolSummerWeather,
  applyDiscoveryQueryFilters,
} = require('../discoverySearchPolicy');
const { createCanonicalPark } = require('../canonicalPark');
const { filterParksBySearchQuery } = require('../../utils/parkSearchQuery');

function mockPark(id, name, designation, traits = {}, lat = null, states = '') {
  return createCanonicalPark({
    id,
    name,
    states,
    category: designation.toLowerCase().replace(/\s+/g, '_'),
    source: 'nps',
    location: { lat, lng: null },
    traits,
    sourceRecord: { parkCode: id, fullName: name, designation, states },
  });
}

describe('discoverySearchPolicy', () => {
  test('detects national parks only intent', () => {
    expect(
      queryWantsNationalParksOnly(
        'best national parks to visit in July with cool weather lakes or beaches'
      )
    ).toBe(true);
    expect(queryWantsNationalParksOnly('best NPS sites for hiking')).toBe(false);
    expect(queryWantsNationalParksOnly('quiet lakeshores in Michigan')).toBe(false);
  });

  test('isNationalParkDesignation', () => {
    expect(
      isNationalParkDesignation(
        mockPark('glac', 'Glacier National Park', 'National Park')
      )
    ).toBe(true);
    expect(
      isNationalParkDesignation(
        mockPark('piro', 'Pictured Rocks National Lakeshore', 'National Lakeshore')
      )
    ).toBe(false);
  });

  test('detects cool summer weather intent', () => {
    expect(
      queryWantsCoolSummerWeather(
        'best national parks in July with cool weather'
      )
    ).toBe(true);
    expect(queryWantsCoolSummerWeather('best parks for hiking')).toBe(false);
  });

  test('applyDiscoveryQueryFilters keeps only national parks', () => {
    const parks = [
      mockPark('glac', 'Glacier National Park', 'National Park'),
      mockPark('piro', 'Pictured Rocks National Lakeshore', 'National Lakeshore'),
    ];
    const filtered = applyDiscoveryQueryFilters(
      parks,
      'best national parks with lakes'
    );
    expect(filtered.map((p) => p.id)).toEqual(['glac']);
  });
});

describe('filterParksBySearchQuery — July cool national parks', () => {
  const catalog = [
    mockPark('piro', 'Pictured Rocks National Lakeshore', 'National Lakeshore', {
      lake: 1,
      water: 0.9,
      scenic: 0.8,
    }, 46.5),
    mockPark('glac', 'Glacier National Park', 'National Park', {
      lake: 0.85,
      mountains: 0.95,
      water: 0.8,
      scenic: 0.9,
    }, 48.7),
    mockPark('olym', 'Olympic National Park', 'National Park', {
      lake: 0.7,
      ocean: 0.75,
      mountains: 0.7,
      water: 0.85,
    }, 47.8),
    mockPark('crla', 'Crater Lake National Park', 'National Park', {
      lake: 1,
      mountains: 0.8,
      water: 0.95,
      scenic: 0.95,
    }, 42.9),
    mockPark('jotr', 'Joshua Tree National Park', 'National Park', {
      scenic: 0.8,
      camping: 0.7,
    }, 34.0),
    mockPark('assr', 'Assateague Island National Seashore', 'National Seashore', {
      ocean: 1,
      beach: 1,
      water: 0.9,
    }, 38.3),
  ];

  test('ranks cool July national parks with water above lakeshores and hot desert', () => {
    const q =
      'best national parks to visit in July with cool weather lakes or beaches';
    const results = filterParksBySearchQuery(catalog, q);
    const codes = results.map((p) => p.id);

    expect(codes).not.toContain('piro');
    expect(codes).not.toContain('assr');
    expect(codes[0]).toMatch(/^(glac|olym|crla)$/);
    expect(codes.slice(0, 2)).not.toContain('jotr');
  });
});

describe('filterParksBySearchQuery — couples with ocean', () => {
  const catalog = [
    mockPark('indu', 'Indiana Dunes National Park', 'National Park', {
      scenic: 0.8,
      water: 0.5,
      lake: 0.3,
      familyFriendly: 0.6,
    }, 41.6, 'IN'),
    mockPark('acad', 'Acadia National Park', 'National Park', {
      ocean: 0.65,
      scenic: 0.9,
      romantic: 0.5,
      relaxing: 0.6,
    }, 44.3, 'ME'),
    mockPark('olym', 'Olympic National Park', 'National Park', {
      ocean: 0.7,
      scenic: 0.85,
      romantic: 0.45,
      lake: 0.4,
    }, 47.8, 'WA'),
    mockPark('shen', 'Shenandoah National Park', 'National Park', {
      scenic: 0.85,
      relaxing: 0.7,
      mountains: 0.6,
    }, 38.5, 'VA'),
  ];

  test('prefers saltwater coast parks over Great Lakes dunes', () => {
    const q = 'best national parks for couples with ocean views';
    const results = filterParksBySearchQuery(catalog, q);
    const codes = results.map((p) => p.id);

    expect(codes.slice(0, 2)).toEqual(
      expect.arrayContaining(['acad', 'olym'])
    );
    expect(codes.indexOf('indu')).toBeGreaterThan(codes.indexOf('acad'));
  });
});

describe('filterParksBySearchQuery — cool July lakes beaches', () => {
  test('boosts water-first parks over scenic-drive-only fits', () => {
    const catalog = [
      mockPark('glac', 'Glacier National Park', 'National Park', {
        lake: 0.85,
        mountains: 0.95,
        water: 0.8,
        scenic: 0.9,
      }, 48.7, 'MT'),
      mockPark('olym', 'Olympic National Park', 'National Park', {
        lake: 0.7,
        ocean: 0.7,
        mountains: 0.7,
        water: 0.85,
        scenic: 0.85,
      }, 47.8, 'WA'),
      mockPark('crla', 'Crater Lake National Park', 'National Park', {
        lake: 1,
        mountains: 0.8,
        water: 0.95,
        scenic: 0.95,
      }, 42.9, 'OR'),
    ];
    const q =
      'best national parks to visit in July with cool weather lakes or beaches';
    const results = filterParksBySearchQuery(catalog, q);
    expect(results[0].id).toMatch(/^(olym|crla)$/);
  });
});
