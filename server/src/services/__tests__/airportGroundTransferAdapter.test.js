'use strict';

const { resolveAirportGroundTransfers } = require('../airportGroundTransferAdapter');

describe('resolveAirportGroundTransfers', () => {
  test('resolves Yellowstone-area airport transfers with a hard three-airport fan-out cap', async () => {
    const requests = [];
    const mapsGetRoute = async (parameters) => {
      requests.push(parameters);
      return {
        durationSeconds: 7200 + (requests.length * 60),
        distanceMeters: 160934 + (requests.length * 1000),
      };
    };

    const result = await resolveAirportGroundTransfers({
      parkLat: 44.6,
      parkLon: -110.5,
      parkLabel: 'Yellowstone National Park',
      parkEntityId: 'nps:park:yell',
      mapsGetRoute,
      maxAirports: 99,
    });

    expect(result).toMatchObject({ ok: true, status: 'available' });
    expect(result.airports).toHaveLength(3);
    expect(requests).toHaveLength(3);
    expect(result.airports.map((airport) => airport.airportCode)).toEqual(
      expect.arrayContaining(['BZN', 'JAC'])
    );
    expect(requests[0]).toMatchObject({
      origin: {
        entityId: expect.stringMatching(/^airport:/),
        latitude: expect.any(Number),
        longitude: expect.any(Number),
      },
      destination: {
        entityId: 'nps:park:yell',
        latitude: 44.6,
        longitude: -110.5,
      },
      travelMode: 'driving',
    });
    expect(result.airports[0].groundTransfer).toMatchObject({
      durationSeconds: expect.any(Number),
      distanceMeters: expect.any(Number),
      destinationLabel: 'Yellowstone National Park',
      evidenceStatus: 'verified',
    });
  });

  test('normalizes an explicit departure airport into labeled context', async () => {
    const result = await resolveAirportGroundTransfers({
      parkLat: 44.6,
      parkLon: -110.5,
      parkLabel: 'Yellowstone National Park',
      parkEntityId: 'nps:park:yell',
      departureCity: 'St. Louis',
      departureAirportCode: 'stl',
      mapsGetRoute: async () => ({
        durationSeconds: 5400,
        distanceMeters: 120000,
      }),
      maxAirports: 1,
    });

    expect(result.departureContext).toEqual({
      city: 'St. Louis',
      airportCode: 'STL',
      label: 'St Louis Lambert (STL)',
    });
  });

  test('returns provider_unavailable without calling maps when mapsGetRoute is missing', async () => {
    const mapsGetRoute = jest.fn();

    const result = await resolveAirportGroundTransfers({
      parkLat: 44.6,
      parkLon: -110.5,
      parkLabel: 'Yellowstone National Park',
      parkEntityId: 'nps:park:yell',
      maxAirports: 2,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'provider_unavailable',
      airports: [],
    });
    expect(mapsGetRoute).not.toHaveBeenCalled();
  });

  test('returns provider_unavailable without calling maps when parkEntityId is falsy', async () => {
    const mapsGetRoute = jest.fn(async () => ({
      durationSeconds: 5400,
      distanceMeters: 120000,
    }));

    const result = await resolveAirportGroundTransfers({
      parkLat: 44.6,
      parkLon: -110.5,
      parkLabel: 'Yellowstone National Park',
      parkEntityId: null,
      mapsGetRoute,
      maxAirports: 2,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 'provider_unavailable',
      airports: [],
    });
    expect(mapsGetRoute).not.toHaveBeenCalled();
  });

  test('distinguishes successful no-route results from provider failure', async () => {
    const noResults = await resolveAirportGroundTransfers({
      parkLat: 44.6,
      parkLon: -110.5,
      parkLabel: 'Yellowstone National Park',
      parkEntityId: 'nps:park:yell',
      mapsGetRoute: async () => null,
      maxAirports: 2,
    });

    expect(noResults).toMatchObject({ ok: true, status: 'no_results', airports: [] });

    const unavailable = await resolveAirportGroundTransfers({
      parkLat: 44.6,
      parkLon: -110.5,
      parkLabel: 'Yellowstone National Park',
      parkEntityId: 'nps:park:yell',
      mapsGetRoute: async () => {
        throw new Error('offline provider failure');
      },
      maxAirports: 2,
    });

    expect(unavailable).toMatchObject({
      ok: false,
      status: 'provider_unavailable',
      airports: [],
    });
  });
});
