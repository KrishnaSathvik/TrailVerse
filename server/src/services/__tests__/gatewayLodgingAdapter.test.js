'use strict';

const { adaptGatewayLodging } = require('../gatewayLodgingAdapter');

describe('adaptGatewayLodging', () => {
  test('normalizes Places data for the logistics builder and caps results at five', () => {
    const places = Array.from({ length: 7 }, (_, index) => ({
      place_id: `place-${index}`,
      name: `Gateway Lodge ${index}`,
      rating: 4.9 - (index * 0.1),
      vicinity: `Address ${index}`,
      website: `https://lodge-${index}.example`,
      geometry: { location: { lat: 44 + index, lng: -110 - index } },
      livePrice: '$199',
      availability: 'available',
      locationClass: 'inside_park',
    }));

    const result = adaptGatewayLodging({
      ok: true,
      status: 'available',
      places,
    });

    expect(result).toMatchObject({ ok: true, status: 'available' });
    expect(result.places).toHaveLength(5);
    expect(result.places[0]).toEqual({
      placeId: 'place-0',
      name: 'Gateway Lodge 0',
      propertyType: 'hotel',
      rating: 4.9,
      address: 'Address 0',
      officialUrl: 'https://lodge-0.example',
      mapsUrl: 'https://www.google.com/maps/place/?q=place_id%3Aplace-0',
    });
    expect(result.places[0]).not.toHaveProperty('livePrice');
    expect(result.places[0]).not.toHaveProperty('availability');
    expect(result.places[0]).not.toHaveProperty('locationClass');
  });

  test('preserves no_results without inventing properties', () => {
    expect(adaptGatewayLodging({
      ok: true,
      status: 'no_results',
      places: [],
    })).toEqual({
      ok: true,
      status: 'no_results',
      places: [],
    });
  });

  test('maps available with missing places to provider_unavailable', () => {
    expect(adaptGatewayLodging({
      ok: true,
      status: 'available',
    })).toEqual({
      ok: false,
      status: 'provider_unavailable',
      places: [],
    });
  });

  test('maps available with non-array places to provider_unavailable', () => {
    expect(adaptGatewayLodging({
      ok: true,
      status: 'available',
      places: null,
    })).toEqual({
      ok: false,
      status: 'provider_unavailable',
      places: [],
    });
  });

  test('maps available with all malformed rows to provider_unavailable', () => {
    expect(adaptGatewayLodging({
      ok: true,
      status: 'available',
      places: [{ rating: 4.5 }, { name: 'No Id Lodge' }],
    })).toEqual({
      ok: false,
      status: 'provider_unavailable',
      places: [],
    });
  });

  test('maps failed provider outcomes to provider_unavailable', () => {
    expect(adaptGatewayLodging({
      ok: false,
      status: 'provider_unavailable',
      places: [{ place_id: 'stale', name: 'Stale Hotel' }],
    })).toEqual({
      ok: false,
      status: 'provider_unavailable',
      places: [],
    });
  });
});
