'use strict';

const {
  COORDINATE_SOURCE,
  COORDINATE_REASON,
  normalizeCoordinates,
  hasUsableCoordinates,
} = require('../coordinateValidation');

describe('normalizeCoordinates', () => {
  it('accepts a valid pair from a trusted source', () => {
    const r = normalizeCoordinates({ latitude: 37.29, longitude: -113.05, source: 'geocoder' });
    expect(r.valid).toBe(true);
    expect(r.latitude).toBeCloseTo(37.29);
    expect(r.longitude).toBeCloseTo(-113.05);
    expect(r.coordinateSource).toBe(COORDINATE_SOURCE.GEOCODER);
  });

  it('rejects model estimates as untrusted', () => {
    const r = normalizeCoordinates({ latitude: 37.29, longitude: -113.05, source: 'model_estimate' });
    expect(r.valid).toBe(false);
    expect(r.latitude).toBeNull();
    expect(r.longitude).toBeNull();
    expect(r.reason).toBe(COORDINATE_REASON.UNTRUSTED_SOURCE);
  });

  it('non-numeric values normalize to null', () => {
    for (const bad of ['abc', null, undefined, true, {}, '']) {
      const r = normalizeCoordinates({ latitude: bad, longitude: -113, source: 'tool' });
      expect(r.latitude).toBeNull();
      expect(r.longitude).toBeNull();
      expect(r.valid).toBe(false);
    }
  });

  it('out-of-range latitude normalizes to null', () => {
    expect(normalizeCoordinates({ latitude: 91, longitude: 0, source: 'tool' }).reason).toBe(
      COORDINATE_REASON.LAT_OUT_OF_RANGE
    );
    expect(normalizeCoordinates({ latitude: -91, longitude: 0, source: 'tool' }).valid).toBe(false);
  });

  it('longitude just out of range is rejected', () => {
    const r = normalizeCoordinates({ latitude: 45, longitude: 181, source: 'tool' });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe(COORDINATE_REASON.LON_OUT_OF_RANGE);
  });

  it('one coordinate without the other → both null', () => {
    const r = normalizeCoordinates({ latitude: 37.29, longitude: null, source: 'tool' });
    expect(r.latitude).toBeNull();
    expect(r.longitude).toBeNull();
    expect(r.valid).toBe(false);
  });

  it('0,0 is never automatically valid (fabricated default)', () => {
    const r = normalizeCoordinates({ latitude: 0, longitude: 0, source: 'tool' });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe(COORDINATE_REASON.NULL_ISLAND);
  });

  it('unknown/absent source keeps valid coords but marks provenance unknown', () => {
    const r = normalizeCoordinates({ latitude: 37.29, longitude: -113.05 });
    expect(r.valid).toBe(true);
    expect(r.coordinateSource).toBe(COORDINATE_SOURCE.UNKNOWN);
  });

  it('accepts stringified numeric coordinates', () => {
    const r = normalizeCoordinates({ latitude: '37.29', longitude: '-113.05', source: 'stored' });
    expect(r.valid).toBe(true);
    expect(r.latitude).toBeCloseTo(37.29);
  });
});

describe('hasUsableCoordinates', () => {
  it('is false for a stop with no/invented coordinates', () => {
    expect(hasUsableCoordinates({ latitude: null, longitude: null })).toBe(false);
    expect(hasUsableCoordinates({ latitude: 0, longitude: 0 })).toBe(false);
    expect(hasUsableCoordinates({ latitude: 37, longitude: -113, coordinateSource: 'model_estimate' })).toBe(false);
  });
  it('is true for a stop with trusted coordinates', () => {
    expect(hasUsableCoordinates({ latitude: 37, longitude: -113, coordinateSource: 'geocoder' })).toBe(true);
  });
});
