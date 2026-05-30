import { describe, expect, it } from 'vitest';
import {
  formatSeasonWeatherSummary,
  parseParkWeatherInfo,
  parseSeasonTemperatures,
  sanitizeParkWeatherInfo,
  extractSeasonSegments,
} from '../parkWeatherInfoUtils';

const ACADIA_WEATHER =
  'Located on Mount Desert Island in Maine, Acadia experiences all four seasons. ' +
  'Summer temperatures range between 45 and 90 degrees F (7 and 30 C). ' +
  'Fall temperatures range from 30-70 F (-1-21 C). ' +
  'Winter temperatures range from 14-35 F (-10 to 2 degrees C). ' +
  'Spring temperatures range from 30-70 F (-1-21 C). ' +
  'The first snowfall is in November and can continue through April with an average accumulation of 73 inches (185 cm).';

const YELLOWSTONE_STYLE =
  'Summer temperatures often exceed 100 F, making strenuous exercise difficult. ' +
  'Winters are cold, with highs averaging 30 to 50 F, and lows averaging 0 to 20 F. ' +
  'Fall (mid-September-October), when daytime highs average 60 to 80 F and lows average 30 to 50 F.';

const AFAM_STYLE =
  'Washington DC gets to see all four seasons. ' +
  'Spring (March - May) Temp: Average high is 65.5 degrees with a low of 46.5 degrees F. ' +
  'Summer (June - August) Temp: Average high is 86 degrees with a low of 69 degrees F. ' +
  'Fall (September - November) Temp: Average high is 68 degrees with a low of 51 degrees F. ' +
  'Winter (December - February) Temp: Average high is 43 degrees with a low of 28 degrees F.';

const AGFO_STYLE =
  "Summers can be very warm, high 90's to 100 with the frequent afternoon thunderstorms. " +
  'Winter temperatures can dip as low as -20 F.';

describe('sanitizeParkWeatherInfo', () => {
  it('removes Today\'s Weather weather.com links', () => {
    const raw =
      "Today's Weather: http://www.weather.com/weather/today/l/NPBLCA:13:US " +
      'Summer temperatures range from 70-95 F.';
    expect(sanitizeParkWeatherInfo(raw)).toBe('Summer temperatures range from 70-95 F.');
  });
});

describe('parseSeasonTemperatures', () => {
  it('parses between/from F and parenthetical C', () => {
    const summer = parseSeasonTemperatures(
      'Summer temperatures range between 45 and 90 degrees F (7 and 30 C).'
    );
    expect(summer.rangeF).toBe('45°F – 90°F');
    expect(summer.rangeC).toBe('7°C – 30°C');
  });

  it('parses tight 45-90F ranges', () => {
    const summer = parseSeasonTemperatures('Summer temperatures range from 45-90F (7-30C).');
    expect(summer.rangeF).toBe('45°F – 90°F');
    expect(summer.rangeC).toBe('7°C – 30°C');
  });

  it('parses average high/low blocks', () => {
    const spring = parseSeasonTemperatures(
      'Spring (March - May) Temp: Average high is 65.5 degrees with a low of 46.5 degrees F.'
    );
    expect(spring.rangeF).toBe('47°F – 66°F');
  });

  it('parses high 90s to 100', () => {
    const summer = parseSeasonTemperatures(
      "Summers can be very warm, high 90's to 100 with thunderstorms."
    );
    expect(summer.rangeF).toBe('90°F – 100°F');
  });
});

describe('extractSeasonSegments', () => {
  it('finds seasons in a single paragraph (Acadia)', () => {
    const segments = extractSeasonSegments(ACADIA_WEATHER);
    expect(segments.length).toBeGreaterThanOrEqual(4);
    expect(segments.map((s) => s.season.key).sort()).toEqual(['fall', 'spring', 'summer', 'winter']);
  });

  it('finds Summers and Winter segments', () => {
    const segments = extractSeasonSegments(AGFO_STYLE);
    expect(segments).toHaveLength(2);
    expect(segments.map((s) => s.season.key).sort()).toEqual(['summer', 'winter']);
  });
});

describe('parseParkWeatherInfo', () => {
  it('structures Acadia-style four-season copy', () => {
    const result = parseParkWeatherInfo(ACADIA_WEATHER);
    expect(result.useStructured).toBe(true);
    expect(result.seasons).toHaveLength(4);
    expect(result.seasons[1].summary).toContain('45°F');
    expect(result.footer).toMatch(/snowfall/);
  });

  it('parses Yellowstone-style copy with fall row', () => {
    const result = parseParkWeatherInfo(YELLOWSTONE_STYLE);
    expect(result.useStructured).toBe(true);
    expect(result.seasons.map((s) => s.key)).toEqual(['summer', 'fall', 'winter']);
    expect(result.seasons.find((s) => s.key === 'summer')?.summary).toBe('Often above 100°F');
  });

  it('parses parenthetical Temp: high/low blocks (African American Museum pattern)', () => {
    const result = parseParkWeatherInfo(AFAM_STYLE);
    expect(result.useStructured).toBe(true);
    expect(result.seasons).toHaveLength(4);
    expect(result.seasons.find((s) => s.key === 'spring')?.summary).toContain('47°F');
    expect(result.seasons.find((s) => s.key === 'winter')?.summary).toContain('28°F');
  });

  it('parses Summers/Winter informal copy', () => {
    const result = parseParkWeatherInfo(AGFO_STYLE);
    expect(result.useStructured).toBe(true);
    expect(result.seasons.map((s) => s.key)).toEqual(['summer', 'winter']);
    expect(result.seasons.find((s) => s.key === 'summer')?.summary).toBe('90°F – 100°F');
  });

  it('falls back for unstructured single-paragraph weather', () => {
    const result = parseParkWeatherInfo('Expect variable conditions year-round with sudden storms.');
    expect(result.useStructured).toBe(false);
  });

  it('does not treat verb "fall" as Fall season (Glacier pattern)', () => {
    const glacier =
      "Glacier's weather is highly variable and can be extreme. Expect warm, sunny summer days but be ready for any type of conditions. In the winter, temperatures can fall well below freezing and typically the park receives considerable amounts of snow. Glacier's geography, straddling the Continental Divide, sets the stage for clashes of two very different climates.";
    const result = parseParkWeatherInfo(glacier);
    expect(result.seasons.map((s) => s.key)).toEqual(['winter']);
    expect(result.seasons[0].summary).toMatch(/freezing|snow/i);
    expect(result.seasons[0].summary).not.toBe('temperatures can');
    expect(result.intro).toMatch(/summer days/i);
    expect(result.footer).toMatch(/geography/i);
  });
});
