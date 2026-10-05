'use strict';

const {
  assertNoLiveCommercialClaims,
} = require('../../utils/travelLogisticsContract');
const {
  buildTravelLogisticsForTurn,
} = require('../travelLogisticsOrchestrator');
const {
  yellowstoneFlyLodgeGolden,
} = require('../../eval/travelLogisticsYellowstoneFlyLodgeGolden');

function assertRecursivePriceSafety(node, path = 'travelLogistics') {
  if (node == null || typeof node !== 'object') return;

  for (const [key, value] of Object.entries(node)) {
    const childPath = `${path}.${key}`;
    expect(['price', 'priceUsd', 'nightlyRate']).not.toContain(key);
    if (key === 'livePrice' || key === 'liveAvailability') {
      expect(value).toBe(false);
    }
    if (value != null && typeof value === 'object') {
      assertRecursivePriceSafety(value, childPath);
    }
  }
}

describe('Yellowstone fly plus lodge offline golden', () => {
  test('builds airport transfers, verified park lodges, and separate gateway hotels', async () => {
    const fixture = yellowstoneFlyLodgeGolden;
    const mapsGetRoute = jest.fn(async ({ origin }) => (
      fixture.mockMapsLegs[origin.entityId]
    ));
    const searchNearbyLodging = jest.fn(async () => fixture.mockPlacesHotels);
    const listOfficialLodgingByParkCode = jest.fn(() => fixture.catalog.entries);
    const hasOfficialLodgingCoverage = jest.fn(() => fixture.catalog.covered);
    const getNpsCampgrounds = jest.fn(() => {
      throw new Error('NPS must not be called by fly+lodge golden');
    });

    const result = await buildTravelLogisticsForTurn(fixture.context, {
      mapsGetRoute,
      searchNearbyLodging,
      listOfficialLodgingByParkCode,
      hasOfficialLodgingCoverage,
      getBaseTown: jest.fn(() => fixture.expected.gatewayAreaLabel),
      getNpsCampgrounds,
    });

    expect(result).toMatchObject({
      schemaVersion: 1,
      transport: {
        mode: 'fly',
        departure: {
          city: fixture.expected.departureCity,
          airportCode: fixture.expected.departureAirportCode,
          status: 'available',
        },
        airportsStatus: 'available',
      },
      stays: {
        accommodationClass: fixture.expected.accommodationClass,
        stayPreference: fixture.expected.stayPreference,
        insidePark: { status: 'verified' },
        gateway: {
          status: 'available',
          areaLabel: fixture.expected.gatewayAreaLabel,
        },
        campgrounds: { status: 'not_requested', properties: [] },
        vacationRentalHint: null,
      },
    });
    expect(result.transport.airports.length).toBeGreaterThanOrEqual(1);
    expect(result.transport.airports.every((airport) => (
      airport.groundTransfer
      && airport.groundTransfer.durationMinutes > 0
      && airport.groundTransfer.distanceMiles > 0
    ))).toBe(true);
    expect(result.stays.insidePark.properties.length).toBeGreaterThanOrEqual(1);
    expect(result.stays.insidePark.properties.every((property) => (
      property.parkCode === 'yell'
      && property.locationClass === 'inside_park'
      && property.evidenceStatus === 'verified'
    ))).toBe(true);
    expect(result.stays.gateway.properties.length).toBeGreaterThanOrEqual(1);
    expect(result.stays.gateway.properties.every((property) => (
      property.locationClass === 'gateway'
      && property.parkCode === null
      && property.propertyId.startsWith('google-place:')
    ))).toBe(true);

    expect(mapsGetRoute).toHaveBeenCalled();
    expect(searchNearbyLodging).toHaveBeenCalledTimes(1);
    expect(getNpsCampgrounds).not.toHaveBeenCalled();
    assertNoLiveCommercialClaims(result);
    assertRecursivePriceSafety(result);
  });
});
