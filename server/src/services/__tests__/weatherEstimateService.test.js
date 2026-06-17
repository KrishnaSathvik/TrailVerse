const {
  resolveTripWeatherWindow,
  resolveWeatherMode,
  estimateMonthlyClimate,
  buildEstimatedWeatherFacts,
} = require('../weatherEstimateService');

describe('weatherEstimateService', () => {
  test('October Arches trip uses estimate mode', () => {
    const window = resolveTripWeatherWindow(
      { startDate: '2026-10-10', endDate: '2026-10-12' },
      'Plan a 3-day Arches road trip in October'
    );
    expect(window.month).toBe(10);
    expect(resolveWeatherMode(window)).toBe('estimate');
  });

  test('October Moab climate estimate is mild not summer-hot', () => {
    const { high, low } = estimateMonthlyClimate({
      lat: 38.68,
      lon: -109.57,
      month: 10,
      parkCode: 'arch',
    });
    expect(high).toBeGreaterThanOrEqual(65);
    expect(high).toBeLessThanOrEqual(78);
    expect(low).toBeLessThan(50);
  });

  test('June Moab climate estimate is hot', () => {
    const { high } = estimateMonthlyClimate({
      lat: 38.68,
      lon: -109.57,
      month: 6,
      parkCode: 'arch',
    });
    expect(high).toBeGreaterThanOrEqual(90);
  });

  test('estimate block labels itself clearly', () => {
    const result = buildEstimatedWeatherFacts({
      lat: 38.68,
      lon: -109.57,
      locationName: 'Moab / Arches area',
      parkCode: 'arch',
      tripDates: { startDate: '2026-10-10', endDate: '2026-10-12' },
      userMessage: 'Arches in October',
    });
    expect(result.mode).toBe('estimate');
    expect(result.text).toMatch(/CLIMATE ESTIMATE/i);
    expect(result.text).toMatch(/typically/i);
    expect(result.text).toMatch(/72°F/);
    expect(result.text).toMatch(/not a live forecast/i);
  });

  test('trip starting in 3 days uses live mode', () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    const iso = soon.toISOString().slice(0, 10);
    const window = resolveTripWeatherWindow({ startDate: iso, endDate: iso }, '');
    expect(resolveWeatherMode(window)).toBe('live');
  });

  test('month-only query uses estimate without exact dates', () => {
    const window = resolveTripWeatherWindow(null, 'weekend in October from Denver');
    expect(window.month).toBe(10);
    expect(resolveWeatherMode(window)).toBe('estimate');
  });
});
