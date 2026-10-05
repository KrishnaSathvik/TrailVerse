'use strict';

const { createGeocodeCoordinateEvidenceProvider } = require('../geocodeCoordinateEvidenceProvider');
const { COORDINATE_SOURCE } = require('../../../utils/coordinateValidation');

describe('geocodeCoordinateEvidenceProvider', () => {
  test('supports only the stop_coordinates topic with a real query', () => {
    const provider = createGeocodeCoordinateEvidenceProvider();
    expect(provider.supports({ topic: 'stop_coordinates', query: 'Grand Prismatic Spring, Yellowstone' })).toBe(true);
    expect(provider.supports({ topic: 'stop_coordinates', query: '' })).toBe(false);
    expect(provider.supports({ topic: 'weather_forecast', query: 'x' })).toBe(false);
    expect(provider.supports({ topic: 'stop_coordinates' })).toBe(false);
  });

  test('buildRequest produces a dedupeKey keyed by normalized query', () => {
    const provider = createGeocodeCoordinateEvidenceProvider();
    const a = provider.buildRequest({ topic: 'stop_coordinates', query: 'Old Faithful, Yellowstone' });
    const b = provider.buildRequest({ topic: 'stop_coordinates', query: '  OLD FAITHFUL, Yellowstone  ' });
    expect(a.dedupeKey).toBe(b.dedupeKey);
    expect(a.provider).toBe('geocode_coordinate');
  });

  test('fetch calls the injected geocodePlace with the request query', async () => {
    const geocodePlace = jest.fn().mockResolvedValue({ name: 'Old Faithful', lat: 44.46, lon: -110.83, source: 'google' });
    const provider = createGeocodeCoordinateEvidenceProvider({ geocodePlace });
    const request = provider.buildRequest({ topic: 'stop_coordinates', query: 'Old Faithful, Yellowstone' });
    const result = await provider.fetch(request, {});
    expect(geocodePlace).toHaveBeenCalledWith('Old Faithful, Yellowstone', { signal: undefined, reportFailure: true });
    expect(result.raw.lat).toBeCloseTo(44.46);
  });

  test('fetch respects an aborted signal without calling the geocoder', async () => {
    const geocodePlace = jest.fn();
    const provider = createGeocodeCoordinateEvidenceProvider({ geocodePlace });
    const request = provider.buildRequest({ topic: 'stop_coordinates', query: 'x place' });
    await expect(provider.fetch(request, { signal: { aborted: true } })).rejects.toMatchObject({ code: 'ABORT_ERR' });
    expect(geocodePlace).not.toHaveBeenCalled();
  });

  test('normalize maps a Google result to coordinateSource geocoder, preserving providerSource', () => {
    const provider = createGeocodeCoordinateEvidenceProvider();
    const request = provider.buildRequest({ topic: 'stop_coordinates', query: 'Old Faithful, Yellowstone' });
    const [candidate] = provider.normalize({ name: 'Old Faithful', lat: 44.46, lon: -110.83, source: 'google' }, request, {});
    expect(candidate.claim.normalizedValue.latitude).toBeCloseTo(44.46);
    expect(candidate.claim.normalizedValue.providerSource).toBe('google');
    expect(candidate.source.sourceId).toBe('google');
  });

  test('normalize maps the known-place catalog source to trailverse_catalog, not geocoder', () => {
    const provider = createGeocodeCoordinateEvidenceProvider();
    const request = provider.buildRequest({ topic: 'stop_coordinates', query: 'Mono Lake' });
    const [candidate] = provider.normalize(
      { name: 'Mono Lake, California', lat: 37.939, lon: -119.019, source: 'trailverse-known-place' },
      request,
      {}
    );
    expect(candidate.claim.normalizedValue.providerSource).toBe('trailverse-known-place');
    expect(candidate.source.sourceClass).toBe('trusted_specialist');
  });

  test('normalize returns no candidate (not a fabricated one) when the geocoder found nothing', () => {
    const provider = createGeocodeCoordinateEvidenceProvider();
    const request = provider.buildRequest({ topic: 'stop_coordinates', query: 'Nowhere Real Place' });
    expect(provider.normalize(null, request, {})).toEqual([]);
  });

  test('classifyError distinguishes cancellation from a bad response', () => {
    const provider = createGeocodeCoordinateEvidenceProvider();
    expect(provider.classifyError({ code: 'ABORT_ERR' })).toEqual({ code: 'provider_cancelled', retryable: false });
    expect(provider.classifyError(new Error('boom'))).toEqual({ code: 'provider_invalid_response', retryable: false });
  });

  test('exported coordinateSourceFor mirrors the enum mapping used in normalize()', () => {
    // eslint-disable-next-line global-require
    const { coordinateSourceFor } = require('../geocodeCoordinateEvidenceProvider');
    expect(coordinateSourceFor('google')).toBe(COORDINATE_SOURCE.GEOCODER);
    expect(coordinateSourceFor('open-meteo')).toBe(COORDINATE_SOURCE.GEOCODER);
    expect(coordinateSourceFor('trailverse-known-place')).toBe(COORDINATE_SOURCE.CATALOG);
  });
});
