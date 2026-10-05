'use strict';

const { verifyWebDestinationRelevance } = require('../webDestinationRelevance');

describe('code-less web destination ownership', () => {
  const requested = { entityId: 'nps:park:yose', displayName: 'Yosemite National Park', latitude: 37.74, longitude: -119.53 };

  test('rejects a different named destination', () => {
    expect(verifyWebDestinationRelevance({ requested, title: 'Arches National Park tickets', text: 'Timed entry for Arches.' }).accepted).toBe(false);
  });

  test('accepts a strong canonical title/body match', () => {
    expect(verifyWebDestinationRelevance({ requested, title: 'Yosemite reservations', text: 'Official access for Yosemite National Park.' })).toMatchObject({ accepted: true, scopeMatch: 'exact' });
  });

  test('rejects an incidental requested-place mention on another destination page', () => {
    expect(verifyWebDestinationRelevance({
      requested,
      url: 'https://www.recreation.gov/articles/arches-reservations',
      title: 'Arches National Park Reservations',
      text: 'Unlike Yosemite National Park, this timed-entry reservation applies to Arches National Park.',
    }).accepted).toBe(false);
  });

  test('accepts an explicitly verified official relationship', () => {
    expect(verifyWebDestinationRelevance({
      requested,
      title: 'Route 1 service',
      officialRelationship: { verified: true, sourceClass: 'official_transit', entityId: 'nps:park:yose' },
    }).accepted).toBe(true);
  });
});
