const {
  resolveMaxDriveMilesFromQuery,
  filterCatalogByOriginDistance,
} = require('../discoverySearchPolicy');
const { createCanonicalPark } = require('../canonicalPark');

const denver = { lat: 39.7392, lon: -104.9903, name: 'Denver' };

function park(code, name, lat, lng, states) {
  return createCanonicalPark({
    id: code,
    name,
    states,
    location: { lat, lng },
    sourceRecord: { designation: 'National Park', latitude: lat, longitude: lng },
    traits: { hiking: 0.9 },
  });
}

describe('origin distance discovery policy', () => {
  test('weekend query caps drive radius at 400 miles', () => {
    expect(resolveMaxDriveMilesFromQuery('Weekend hiking trip from Denver under $500')).toBe(400);
  });

  test('5 hours each way uses ~275 mile radius', () => {
    expect(resolveMaxDriveMilesFromQuery('happy to drive up to about 5 hours each way')).toBe(275);
  });

  test('filters out Ohio and Virginia parks from Denver weekend search', () => {
    const catalog = [
      park('romo', 'Rocky Mountain National Park', 40.3428, -105.6836, 'CO'),
      park('grsa', 'Great Sand Dunes National Park', 37.7328, -105.5111, 'CO'),
      park('cuva', 'Cuyahoga Valley National Park', 41.2808, -81.5678, 'OH'),
      park('shen', 'Shenandoah National Park', 38.2928, -78.6795, 'VA'),
    ];
    const query = 'Weekend hiking trip from Denver under $500 — which national parks are realistic?';
    const filtered = filterCatalogByOriginDistance(catalog, denver, query);
    const codes = filtered.map((p) => p.id);
    expect(codes).toContain('romo');
    expect(codes).toContain('grsa');
    expect(codes).not.toContain('cuva');
    expect(codes).not.toContain('shen');
  });
});
