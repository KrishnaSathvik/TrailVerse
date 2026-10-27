'use strict';

/**
 * Chiricahua National Monument became Chiricahua National Park (the 64th
 * national park) on Oct 20, 2026. The NPS code `chir` is unchanged.
 *
 * Before the static catalog entry, `chir` resolved ONLY when the dynamic NPS
 * map had loaded: with it absent every Chiricahua mention returned [], and with
 * a pre-redesignation cache the canonical identity was "Chiricahua National
 * Monument". Both the new and the former name must resolve to `chir`, and the
 * canonical identity must carry the new name whatever the dynamic map says.
 */

const {
  extractAllParksFromMessage,
  getParkIdentityByCode,
  setDynamicMapForTests,
  clearDynamicMapForTests,
} = require('../parkExtractor');
const { resolveDestinationsFromMessage } = require('../genericDestinationResolver');

const MESSAGES = [
  'Plan 2 days in Chiricahua',
  'Plan 2 days at Chiricahua National Park',
  'Plan 2 days at Chiricahua National Monument',
];

const DYNAMIC_STATES = [
  ['no dynamic map', null],
  ['live NPS catalog', [
    { key: 'chiricahua national park', code: 'chir', lat: 32.012, lon: -109.342 },
    { key: 'chiricahua', code: 'chir', lat: 32.012, lon: -109.342 },
  ]],
  ['pre-redesignation cache', [
    { key: 'chiricahua national monument', code: 'chir', lat: 32.012, lon: -109.342 },
    { key: 'chiricahua', code: 'chir', lat: 32.012, lon: -109.342 },
  ]],
];

describe('Chiricahua National Park (chir) resolution', () => {
  afterEach(() => clearDynamicMapForTests());

  describe.each(DYNAMIC_STATES)('with %s', (_label, entries) => {
    beforeEach(() => {
      clearDynamicMapForTests();
      if (entries) setDynamicMapForTests(entries);
    });

    test.each(MESSAGES)('%s → chir', (message) => {
      const parks = extractAllParksFromMessage(message);
      expect(parks.map((p) => p.parkCode)).toEqual(['chir']);

      const destinations = resolveDestinationsFromMessage(message);
      expect(destinations).toHaveLength(1);
      expect(destinations[0]).toMatchObject({
        parkCode: 'chir',
        entityId: 'nps:park:chir',
        entityType: 'national_park',
        status: 'resolved',
      });
    });

    test('canonical identity uses the national park name', () => {
      expect(getParkIdentityByCode('chir')).toMatchObject({
        code: 'chir',
        parkName: 'Chiricahua National Park',
        kind: 'national_park',
      });
    });
  });
});

describe('Chiricahua park size', () => {
  test('uses the NPS acreage instead of the unknown-park fallback', () => {
    const parkSizeService = require('../../services/parkSizeService');
    expect(parkSizeService.getParkSize('Chiricahua National Park', 'chir')).toBe('12,000 acres');
  });
});
