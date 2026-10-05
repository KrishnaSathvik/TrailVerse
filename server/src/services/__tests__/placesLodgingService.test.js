'use strict';

jest.mock('node-fetch', () => jest.fn());

const fetch = require('node-fetch');
const { searchNearbyLodging } = require('../placesLodgingService');

describe('searchNearbyLodging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GMAPS_SERVER_KEY = 'test-google-key';
  });

  afterAll(() => {
    delete process.env.GMAPS_SERVER_KEY;
  });

  test('returns sorted nearby lodging with detailed place data', async () => {
    fetch
      .mockResolvedValueOnce({
        json: async () => ({
          status: 'OK',
          results: [
            {
              place_id: 'place-low',
              name: 'Lower Rated Lodge',
              rating: 4.2,
              user_ratings_total: 900,
              geometry: { location: { lat: 44.1, lng: -110.1 } },
              vicinity: 'Gateway, WY',
            },
            {
              place_id: 'place-high',
              name: 'Higher Rated Lodge',
              rating: 4.8,
              user_ratings_total: 100,
              geometry: { location: { lat: 44.2, lng: -110.2 } },
              vicinity: 'Gateway, MT',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          status: 'OK',
          result: {
            place_id: 'place-low',
            name: 'Lower Rated Lodge',
            rating: 4.2,
            user_ratings_total: 900,
            geometry: { location: { lat: 44.1, lng: -110.1 } },
            formatted_address: '1 Lodge Way, Gateway, WY',
            vicinity: 'Gateway, WY',
            website: 'https://lower.example',
            types: ['lodging'],
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          status: 'OK',
          result: {
            place_id: 'place-high',
            name: 'Higher Rated Lodge',
            rating: 4.8,
            user_ratings_total: 100,
            geometry: { location: { lat: 44.2, lng: -110.2 } },
            formatted_address: '2 Lodge Way, Gateway, MT',
            vicinity: 'Gateway, MT',
            website: 'https://higher.example',
            types: ['lodging'],
          },
        }),
      });

    const result = await searchNearbyLodging({
      lat: 44,
      lng: -110,
      radiusMeters: 12000,
      limit: 5,
    });

    expect(result).toMatchObject({
      ok: true,
      status: 'available',
    });
    expect(result.places.map((place) => place.place_id)).toEqual([
      'place-high',
      'place-low',
    ]);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[0][0]).toContain('type=lodging');
  });

  test('maps ZERO_RESULTS to no_results', async () => {
    fetch.mockResolvedValueOnce({
      json: async () => ({ status: 'ZERO_RESULTS', results: [] }),
    });

    await expect(searchNearbyLodging({
      lat: 44,
      lng: -110,
      radiusMeters: 5000,
    })).resolves.toEqual({
      ok: true,
      status: 'no_results',
      places: [],
    });
  });

  test('maps OK with missing results to provider_unavailable', async () => {
    fetch.mockResolvedValueOnce({
      json: async () => ({ status: 'OK' }),
    });

    await expect(searchNearbyLodging({
      lat: 44,
      lng: -110,
      radiusMeters: 5000,
    })).resolves.toEqual({
      ok: false,
      status: 'provider_unavailable',
      places: [],
    });
  });

  test('maps OK with non-array results to provider_unavailable', async () => {
    fetch.mockResolvedValueOnce({
      json: async () => ({ status: 'OK', results: null }),
    });

    await expect(searchNearbyLodging({
      lat: 44,
      lng: -110,
      radiusMeters: 5000,
    })).resolves.toEqual({
      ok: false,
      status: 'provider_unavailable',
      places: [],
    });
  });

  test('maps a Places API error to provider_unavailable', async () => {
    fetch.mockResolvedValueOnce({
      json: async () => ({
        status: 'REQUEST_DENIED',
        error_message: 'API project is not authorized',
      }),
    });

    await expect(searchNearbyLodging({
      lat: 44,
      lng: -110,
      radiusMeters: 5000,
    })).resolves.toEqual({
      ok: false,
      status: 'provider_unavailable',
      places: [],
    });
  });
});
