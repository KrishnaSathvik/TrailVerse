const { createCanonicalPark } = require('../../catalog/canonicalPark');
const { filterParksBySearchQuery } = require('../parkSearchQuery');
const { tokenizeParkSearchQuery } = require('../../catalog/searchTokens');

function mockPark(id, name, description = '') {
  return createCanonicalPark({
    id,
    name,
    states: 'UT',
    category: 'national_park',
    source: 'nps',
    description,
    sourceRecord: { parkCode: id, fullName: name, designation: 'National Park' },
  });
}

describe('park name search', () => {
  const catalog = [
    mockPark('grte', 'Grand Teton National Park', 'Mountains and wildlife near Jackson.'),
    mockPark('grca', 'Grand Canyon National Park', 'Iconic canyon views.'),
    mockPark(
      'brca',
      'Bryce Canyon National Park',
      'Hoodoos of natural grandeur and the scenic amphitheater below the rim.'
    ),
    mockPark('cagr', 'Casa Grande Ruins National Monument', 'Ancient ruins in Arizona.'),
    mockPark('cebr', 'Cedar Breaks National Monument', 'High elevation amphitheater.'),
  ];

  test('tokenizes grand te without dropping te when part of name query', () => {
    expect(tokenizeParkSearchQuery('grand te')).toEqual(['grand']);
  });

  test('grand te ranks Grand Teton first', () => {
    const results = filterParksBySearchQuery(catalog, 'grand te');
    expect(results[0]?.id).toBe('grte');
  });

  test('grand teton ranks Grand Teton first', () => {
    const results = filterParksBySearchQuery(catalog, 'grand teton');
    expect(results[0]?.id).toBe('grte');
  });

  test('does not rank Bryce above Grand Teton for partial name', () => {
    const results = filterParksBySearchQuery(catalog, 'grand te');
    const brcaIdx = results.findIndex((p) => p.id === 'brca');
    const grteIdx = results.findIndex((p) => p.id === 'grte');
    expect(grteIdx).toBe(0);
    if (brcaIdx >= 0) expect(brcaIdx).toBeGreaterThan(grteIdx);
  });

  test('excludes parks that only match grand inside description words', () => {
    const results = filterParksBySearchQuery(catalog, 'grand te');
    expect(results.map((p) => p.id)).not.toContain('brca');
    expect(results.map((p) => p.id)).not.toContain('cebr');
  });

  test('grand te match reason cites name match for Grand Teton', () => {
    const results = filterParksBySearchQuery(catalog, 'grand te');
    expect(results[0]?.searchMatch?.matchReason).toMatch(/Name matches/i);
  });
});
