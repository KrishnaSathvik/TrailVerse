'use strict';

/**
 * Phase 9B.2C — the resolver that would be wired into `resolveStopCoordinates`
 * if/when this capability is activated. Combines the free-text geocoder with
 * the provider-source + corroboration authority policy so an unresolved
 * grounded stop only ever receives coordinates that pass BOTH checks.
 *
 * NOT wired into production in this phase — see the Phase 9B.2C report for
 * why (the shared evidence broker's persistence contract hard-requires a
 * catalog `entityId`, which an attempt-scoped stop lookup does not have).
 * This module exists, fully tested, ready to be the real dependency once
 * that seam is resolved.
 */

const { buildProductionGeoCoordinateResolver } = require('../productionGeoCoordinateResolver');
const { COORDINATE_SOURCE } = require('../coordinateValidation');

function entryFor(overrides = {}) {
  return {
    query: 'Grand Prismatic Spring, Yellowstone National Park',
    canonicalPlaceName: 'Grand Prismatic Spring',
    parkName: 'Yellowstone National Park',
    ...overrides,
  };
}

describe('buildProductionGeoCoordinateResolver', () => {
  test('a corroborated Google result becomes authoritative GEOCODER coordinates', async () => {
    const geocodePlace = jest.fn().mockResolvedValue({
      name: 'Grand Prismatic Spring, Yellowstone National Park, WY, USA', lat: 44.525, lon: -110.838, source: 'google',
    });
    const resolve = buildProductionGeoCoordinateResolver({ geocodePlace });
    const result = await resolve({ query: entryFor().query, key: entryFor() });
    expect(result).toEqual({
      latitude: 44.525, longitude: -110.838, coordinateSource: COORDINATE_SOURCE.GEOCODER, providerSource: 'google',
    });
    expect(geocodePlace).toHaveBeenCalledWith('Grand Prismatic Spring, Yellowstone National Park');
  });

  test('an uncorroborated Google result returns coordinates as candidate data only, not authoritative', async () => {
    const geocodePlace = jest.fn().mockResolvedValue({
      name: 'Springfield, Missouri, USA', lat: 37.2, lon: -93.3, source: 'google',
    });
    const resolve = buildProductionGeoCoordinateResolver({ geocodePlace });
    const result = await resolve({ query: entryFor().query, key: entryFor() });
    expect(result.coordinateSource).toBe(COORDINATE_SOURCE.UNKNOWN);
    // geoResolutionArtifact.js's authority re-check will reject this — the
    // resolver hands back its honest verdict, it does not silently drop data.
  });

  test('an Open-Meteo result never becomes authoritative, even with a matching name', async () => {
    const geocodePlace = jest.fn().mockResolvedValue({
      name: 'Grand Prismatic Spring area, Wyoming, USA', lat: 44.5, lon: -110.8, source: 'open-meteo',
    });
    const resolve = buildProductionGeoCoordinateResolver({ geocodePlace });
    const result = await resolve({ query: entryFor().query, key: entryFor() });
    expect(result.coordinateSource).toBe(COORDINATE_SOURCE.UNKNOWN);
  });

  test('a trailverse-known-place result is authoritative CATALOG', async () => {
    const geocodePlace = jest.fn().mockResolvedValue({
      name: 'Mono Lake, California', lat: 37.939, lon: -119.019, source: 'trailverse-known-place',
    });
    const resolve = buildProductionGeoCoordinateResolver({ geocodePlace });
    const result = await resolve({ query: 'Mono Lake', key: { canonicalPlaceName: 'Mono Lake', parkName: null } });
    expect(result.coordinateSource).toBe(COORDINATE_SOURCE.CATALOG);
  });

  test('a geocoder no-result returns null (unresolved), never a fabricated coordinate', async () => {
    const geocodePlace = jest.fn().mockResolvedValue(null);
    const resolve = buildProductionGeoCoordinateResolver({ geocodePlace });
    const result = await resolve({ query: entryFor().query, key: entryFor() });
    expect(result).toBeNull();
  });

  test('propagates a geocoder error rather than swallowing it into a false result', async () => {
    const geocodePlace = jest.fn().mockRejectedValue(Object.assign(new Error('timeout'), { code: 'provider_timeout' }));
    const resolve = buildProductionGeoCoordinateResolver({ geocodePlace });
    await expect(resolve({ query: entryFor().query, key: entryFor() })).rejects.toMatchObject({ code: 'provider_timeout' });
  });
});
