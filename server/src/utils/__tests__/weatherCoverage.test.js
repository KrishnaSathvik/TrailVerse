'use strict';

const {
  WEATHER_COVERAGE_STATUS,
  computeWeatherCoverage,
} = require('../weatherCoverage');

function wxFact(parkCode) {
  return { id: `weather:${parkCode}:forecast:1`, category: 'weather', parkCode, weatherMode: 'forecast' };
}

describe('computeWeatherCoverage', () => {
  it('reports complete coverage when every requested park has weather', () => {
    const c = computeWeatherCoverage({
      requestedParkCodes: ['zion', 'brca'],
      weatherCanonicalFacts: [wxFact('zion'), wxFact('brca')],
      weatherRequested: true,
    });
    expect(c.status).toBe(WEATHER_COVERAGE_STATUS.COMPLETE);
    expect(c.uncoveredParkCodes).toEqual([]);
  });

  it('reports partial coverage and names the uncovered parks', () => {
    const c = computeWeatherCoverage({
      requestedParkCodes: ['zion', 'brca', 'grca'],
      weatherCanonicalFacts: [wxFact('zion')],
      weatherRequested: true,
    });
    expect(c.status).toBe(WEATHER_COVERAGE_STATUS.PARTIAL);
    expect(c.coveredParkCodes).toEqual(['zion']);
    expect(c.uncoveredParkCodes.sort()).toEqual(['brca', 'grca']);
  });

  it('unavailable weather is not treated as "no hazard" (distinct status)', () => {
    const c = computeWeatherCoverage({
      requestedParkCodes: ['zion'],
      weatherCanonicalFacts: [],
      weatherRequested: true,
    });
    expect(c.status).toBe(WEATHER_COVERAGE_STATUS.UNAVAILABLE);
  });

  it('distinguishes not_requested from unavailable', () => {
    const c = computeWeatherCoverage({
      requestedParkCodes: ['zion'],
      weatherCanonicalFacts: [],
      weatherRequested: false,
    });
    expect(c.status).toBe(WEATHER_COVERAGE_STATUS.NOT_REQUESTED);
  });

  it('secondary-park facts keep their own park scope (no cross-attribution)', () => {
    const c = computeWeatherCoverage({
      requestedParkCodes: ['zion', 'brca'],
      weatherCanonicalFacts: [wxFact('zion')],
      weatherRequested: true,
    });
    // brca weather was never fetched → it must appear uncovered, not covered.
    expect(c.coveredParkCodes).not.toContain('brca');
    expect(c.uncoveredParkCodes).toContain('brca');
  });
});
