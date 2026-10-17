'use strict';

/**
 * Phase 9B.2C — end-to-end proof that the built (but not production-wired)
 * capability actually works together: eligibility gate → real resolver
 * (geocoder + authority policy, geocodePlace mocked) → applied coordinates,
 * and the specific failure modes the phase was scoped to fix.
 */

const { resolveGeoArtifactForAttempt } = require('../geoResolutionArtifact');
const { buildProductionGeoCoordinateResolver } = require('../productionGeoCoordinateResolver');
const { isAuthoritativeCoordinateSource, COORDINATE_SOURCE } = require('../coordinateValidation');

function plan(stops) {
  return { parkName: 'Yellowstone National Park', days: [{ dayNumber: 1, stops }] };
}

function groundedStop(overrides = {}) {
  return {
    id: 's1', order: 0, type: 'geothermal', name: 'Grand Prismatic Spring',
    note: 'n', duration: 60,
    evidenceRef: 'ev:gps', canonicalPlaceName: 'Grand Prismatic Spring',
    ...overrides,
  };
}

describe('end-to-end: eligibility gate + real (mocked-network) resolver', () => {
  test('a corroborated Google result reaches the stop as authoritative GEOCODER coordinates', async () => {
    const geocodePlace = jest.fn().mockResolvedValue({
      name: 'Grand Prismatic Spring, Yellowstone National Park, WY 82190, USA',
      lat: 44.525, lon: -110.838, source: 'google',
    });
    const resolveStopCoordinates = buildProductionGeoCoordinateResolver({ geocodePlace });

    const data = plan([groundedStop()]);
    const artifact = await resolveGeoArtifactForAttempt({ itineraryData: data, resolveStopCoordinates });

    const stop = artifact.itineraryData.days[0].stops[0];
    expect(artifact.resolvedCount).toBe(1);
    expect(stop.latitude).toBeCloseTo(44.525);
    expect(stop.coordinateSource).toBe(COORDINATE_SOURCE.GEOCODER);
    expect(isAuthoritativeCoordinateSource(stop.coordinateSource)).toBe(true);
  });

  test('an Open-Meteo result reaches the artifact but is rejected end-to-end — never authoritative', async () => {
    const geocodePlace = jest.fn().mockResolvedValue({
      name: 'Grand Prismatic Spring, Wyoming, USA', lat: 44.5, lon: -110.8, source: 'open-meteo',
    });
    const resolveStopCoordinates = buildProductionGeoCoordinateResolver({ geocodePlace });

    const data = plan([groundedStop()]);
    const artifact = await resolveGeoArtifactForAttempt({ itineraryData: data, resolveStopCoordinates });

    expect(artifact.resolvedCount).toBe(0);
    expect(artifact.entries[0].status).toBe('unresolved_untrusted_source');
    expect(artifact.itineraryData.days[0].stops[0].latitude).toBeUndefined();
  });

  test('9B.2C.1 — the wrong POI inside the right park is rejected end-to-end, not just uncorroborated garbage', async () => {
    // The specific failure this correction closes: a Google result that
    // agrees on the PARK but names a different attraction must never become
    // authoritative coordinates for the grounded stop.
    const geocodePlace = jest.fn().mockResolvedValue({
      name: 'Old Faithful, Yellowstone National Park, WY 82190, USA', lat: 44.46, lon: -110.83, source: 'google',
    });
    const resolveStopCoordinates = buildProductionGeoCoordinateResolver({ geocodePlace });

    const data = plan([groundedStop()]); // grounded as "Grand Prismatic Spring"
    const artifact = await resolveGeoArtifactForAttempt({ itineraryData: data, resolveStopCoordinates });

    expect(artifact.resolvedCount).toBe(0);
    expect(artifact.entries[0].status).toBe('unresolved_untrusted_source');
    expect(artifact.itineraryData.days[0].stops[0].latitude).toBeUndefined();
    expect(artifact.itineraryData.days[0].stops[0].evidenceRef).toBe('ev:gps'); // identity untouched
  });

  test('an uncorroborated Google result (wrong place entirely) is rejected end-to-end', async () => {
    const geocodePlace = jest.fn().mockResolvedValue({
      name: 'Springfield, Missouri, USA', lat: 37.2, lon: -93.3, source: 'google',
    });
    const resolveStopCoordinates = buildProductionGeoCoordinateResolver({ geocodePlace });

    const data = plan([groundedStop()]);
    const artifact = await resolveGeoArtifactForAttempt({ itineraryData: data, resolveStopCoordinates });

    expect(artifact.resolvedCount).toBe(0);
    expect(artifact.entries[0].status).toBe('unresolved_untrusted_source');
  });

  test('non-experiential and already-authoritative stops never reach the network resolver', async () => {
    const geocodePlace = jest.fn();
    const resolveStopCoordinates = buildProductionGeoCoordinateResolver({ geocodePlace });
    const data = plan([
      { id: 's0', order: 0, type: 'meal', name: 'Lunch', duration: 30 },
      groundedStop({ id: 's1', order: 1, latitude: 44.5, longitude: -110.8, coordinateSource: 'resolved_metadata' }),
    ]);
    await resolveGeoArtifactForAttempt({ itineraryData: data, resolveStopCoordinates });
    expect(geocodePlace).not.toHaveBeenCalled();
  });
});
