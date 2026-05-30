const { slugify, parkMatchesTypeSlug, isParkIndexHealthy } = require('../discoverUtils');
const { normalizeDiscoverEvents } = require('../discoverEventUtils');

describe('discoverUtils', () => {
  test('slugify normalizes activity names', () => {
    expect(slugify('Wildlife Watching')).toBe('wildlife-watching');
    expect(slugify('Auto and ATV')).toBe('auto-and-atv');
  });

  test('isParkIndexHealthy rejects mostly-empty indexes', () => {
    const unhealthy = { a1: [], a2: [], a3: ['yell'], a4: [] };
    expect(isParkIndexHealthy(unhealthy, 4)).toBe(false);
    const healthy = { a1: ['yell'], a2: ['grte'], a3: ['zion'], a4: ['brca'] };
    expect(isParkIndexHealthy(healthy, 4)).toBe(true);
  });

  test('normalizeDiscoverEvents maps park names', () => {
    const events = normalizeDiscoverEvents(
      [
        {
          id: 'evt-1',
          title: 'Star Party',
          sitecode: 'brca',
          parkfullname: 'Bryce Canyon National Park',
          date: '2026-06-01',
          description: '<p>Stars</p>'
        }
      ],
      [{ parkCode: 'brca', fullName: 'Bryce Canyon National Park' }]
    );
    expect(events[0].parkName).toContain('Bryce Canyon');
    expect(events[0].parkCode).toBe('brca');
    expect(events[0].description).not.toContain('<p>');
  });

  test('parkMatchesTypeSlug matches monuments', () => {
    expect(
      parkMatchesTypeSlug({ designation: 'National Monument' }, 'monuments')
    ).toBe(true);
    expect(
      parkMatchesTypeSlug({ designation: 'National Park' }, 'monuments')
    ).toBe(false);
  });
});
