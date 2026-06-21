const { getRelatedParks, sortRelatedParks, projectRelatedPark } = require('../relatedParks');

describe('relatedParks', () => {
  const grandCanyon = {
    parkCode: 'grca',
    fullName: 'Grand Canyon National Park',
    states: 'AZ',
    designation: 'National Park',
    images: [{ url: 'https://example.com/grca.jpg', altText: 'Grand Canyon' }],
    description: 'Big canyon',
  };

  const petrifiedForest = {
    parkCode: 'pefo',
    fullName: 'Petrified Forest National Park',
    states: 'AZ',
    designation: 'National Park',
    images: [{ url: 'https://example.com/pefo.jpg' }],
  };

  const saguaro = {
    parkCode: 'sagu',
    fullName: 'Saguaro National Park',
    states: 'AZ',
    designation: 'National Park',
    images: [{ url: 'https://example.com/sagu.jpg' }],
  };

  const canyonDeChelly = {
    parkCode: 'cach',
    fullName: 'Canyon de Chelly National Monument',
    states: 'AZ',
    designation: 'National Monument',
    images: [{ url: 'https://example.com/cach.jpg' }],
  };

  const butterfield = {
    parkCode: 'buov',
    fullName: 'Butterfield Overland National Historic Trail',
    states: 'MO,AR,OK,TX,NM,AZ,CA',
    designation: 'National Historic Trail',
    images: [{ url: 'https://example.com/buov.jpg' }],
  };

  const allParks = [grandCanyon, petrifiedForest, saguaro, canyonDeChelly, butterfield];

  test('excludes current park and returns same-state matches only', () => {
    const related = getRelatedParks(grandCanyon, allParks, 4);
    const codes = related.map((p) => p.parkCode);

    expect(codes).not.toContain('grca');
    expect(codes).toContain('pefo');
    expect(codes).toContain('sagu');
    expect(codes).toContain('cach');
    expect(codes).toContain('buov');
  });

  test('prefers same designation (National Park) before monuments and trails', () => {
    const ranked = sortRelatedParks(
      [canyonDeChelly, butterfield, petrifiedForest, saguaro],
      grandCanyon
    );

    expect(ranked[0].parkCode).toBe('pefo');
    expect(ranked[1].parkCode).toBe('sagu');
  });

  test('projectRelatedPark returns only fields needed by park detail UI', () => {
    const projected = projectRelatedPark({
      ...grandCanyon,
      operatingHours: [{ description: 'Always open' }],
      entranceFees: [{ cost: '35.00' }],
      images: [
        { url: 'https://example.com/1.jpg', altText: 'Grand Canyon' },
        { url: 'https://example.com/2.jpg' },
      ],
    });

    expect(projected).toEqual({
      parkCode: 'grca',
      fullName: 'Grand Canyon National Park',
      states: 'AZ',
      designation: 'National Park',
      images: [{ url: 'https://example.com/1.jpg', altText: 'Grand Canyon' }],
    });
    expect(projected).not.toHaveProperty('description');
    expect(projected).not.toHaveProperty('operatingHours');
    expect(projected.images).toHaveLength(1);
  });

  test('respects limit', () => {
    const related = getRelatedParks(grandCanyon, allParks, 2);
    expect(related).toHaveLength(2);
  });

  test('returns empty array when park has no states', () => {
    expect(getRelatedParks({ parkCode: 'test', states: '' }, allParks, 4)).toEqual([]);
  });
});
