jest.mock('axios');

// factsService captures the key at module load, so it must be set before require.
// This keeps the suite deterministic instead of silently skipping without a key.
process.env.OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || 'test-key';

const axios = require('axios');
const { fetchWeatherFacts, fetchWeatherFactBundle } = require('../factsService');

/** Three days of 3-hourly entries, matching the OpenWeather 5-day shape. */
function forecastResponse() {
  const dayMs = 24 * 60 * 60 * 1000;
  const base = Date.now();
  const list = [];

  for (let day = 0; day < 3; day += 1) {
    for (let slot = 0; slot < 2; slot += 1) {
      list.push({
        dt: Math.floor((base + day * dayMs + slot * 3 * 60 * 60 * 1000) / 1000),
        main: { temp: 60 + day * 5 + slot, humidity: 70 },
        weather: [{ description: 'light rain' }],
        wind: { speed: 3 },
      });
    }
  }

  // timezone: seconds from UTC (Pacific Daylight Time = -25200), as OpenWeather returns.
  return { data: { city: { name: 'Port Angeles', timezone: -25200 }, list } };
}

beforeEach(() => {
  jest.clearAllMocks();
  axios.get.mockResolvedValue(forecastResponse());
});

describe('fetchWeatherFacts string contract', () => {
  test('still resolves to a plain string', async () => {
    const facts = await fetchWeatherFacts({ lat: 47.8, lon: -123.6 });

    expect(typeof facts).toBe('string');
    expect(facts).toContain('Weather Forecast at Port Angeles');
    expect(facts).toContain('LIVE — next 3 days from today');
    expect(facts).toContain('(Source: OpenWeather 5-day forecast.');
  });

  test('interpolating into a prompt never yields [object Object]', async () => {
    const facts = await fetchWeatherFacts({ lat: 47.8, lon: -123.6 });
    const prompt = `LIVE TRAILVERSE DATA:\n${facts}\n--- END ---`;

    expect(prompt).not.toContain('[object Object]');
  });

  test('the bundle text is identical to the string API output', async () => {
    const bundle = await fetchWeatherFactBundle({ lat: 47.8, lon: -123.6, parkCode: 'olym' });
    const text = await fetchWeatherFacts({ lat: 47.8, lon: -123.6 });

    expect(bundle.text).toBe(text);
  });

  test('one canonical fact per forecast day, each with its own validity window', async () => {
    const { canonicalFacts } = await fetchWeatherFactBundle({
      lat: 47.8,
      lon: -123.6,
      parkCode: 'olym',
    });

    expect(canonicalFacts).toHaveLength(3);
    expect(new Set(canonicalFacts.map((f) => f.id)).size).toBe(3);

    for (const fact of canonicalFacts) {
      expect(fact.category).toBe('weather');
      expect(fact.parkCode).toBe('olym');
      expect(fact.validFrom).toBeTruthy();
      expect(fact.validTo).toBeTruthy();
      expect(fact.sourceUpdatedAt).toBeNull();
    }

    // /data/2.5/forecast is a forecast feed — today's bucket included.
    expect(canonicalFacts.map((f) => f.weatherMode)).toEqual(['forecast', 'forecast', 'forecast']);
    expect(canonicalFacts.map((f) => f.status)).toEqual(['forecast', 'forecast', 'forecast']);
    expect(canonicalFacts.some((f) => f.status === 'observed')).toBe(false);
    expect(canonicalFacts.some((f) => f.weatherMode === 'current')).toBe(false);
  });

  test('retrievalMode live is recorded separately from claim semantics', () => {
    return fetchWeatherFactBundle({ lat: 47.8, lon: -123.6 }).then(({ canonicalFacts }) => {
      for (const fact of canonicalFacts) {
        expect(fact.retrievalMode).toBe('live'); // freshly fetched...
        expect(fact.weatherMode).toBe('forecast'); // ...but still a prediction
      }
    });
  });

  test('forecast days carry destination-local dates and non-overlapping windows', async () => {
    const { canonicalFacts } = await fetchWeatherFactBundle({ lat: 47.8, lon: -123.6 });

    const localDates = canonicalFacts.map((f) => f.localDate);
    expect(new Set(localDates).size).toBe(localDates.length);
    expect(localDates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))).toBe(true);

    for (const fact of canonicalFacts) {
      expect(fact.timezoneOffsetSeconds).toBe(-25200); // provider offset, not server tz
      expect(fact.timezoneSource).toBe('provider_offset');
    }

    const sorted = [...canonicalFacts].sort((a, b) => Date.parse(a.validFrom) - Date.parse(b.validFrom));
    for (let i = 0; i < sorted.length - 1; i += 1) {
      expect(Date.parse(sorted[i].validTo)).toBeLessThan(Date.parse(sorted[i + 1].validFrom));
    }
  });

  test('an interval near UTC midnight lands on the destination-local date', async () => {
    // 2026-07-23T05:00Z is still 2026-07-22 at UTC-7.
    axios.get.mockResolvedValue({
      data: {
        city: { name: 'Port Angeles', timezone: -25200 },
        list: [
          {
            dt: Math.floor(Date.parse('2026-07-23T05:00:00Z') / 1000),
            main: { temp: 60, humidity: 70 },
            weather: [{ description: 'light rain' }],
            wind: { speed: 3 },
          },
        ],
      },
    });

    const { canonicalFacts } = await fetchWeatherFactBundle({ lat: 47.8, lon: -123.6 });
    expect(canonicalFacts[0].localDate).toBe('2026-07-22');
  });

  test('a response without a timezone records the UTC fallback explicitly', async () => {
    axios.get.mockResolvedValue({
      data: {
        city: { name: 'Port Angeles' }, // no timezone field
        list: [
          {
            dt: Math.floor(Date.parse('2026-07-23T05:00:00Z') / 1000),
            main: { temp: 60, humidity: 70 },
            weather: [{ description: 'light rain' }],
            wind: { speed: 3 },
          },
        ],
      },
    });

    const { canonicalFacts } = await fetchWeatherFactBundle({ lat: 47.8, lon: -123.6 });
    expect(canonicalFacts[0].timezoneSource).toBe('utc_fallback');
    expect(canonicalFacts[0].timezoneOffsetSeconds).toBe(0);
    expect(canonicalFacts[0].localDate).toBe('2026-07-23');
  });

  test('a provider failure produces no facts rather than a clear-conditions claim', async () => {
    axios.get.mockRejectedValue(new Error('network down'));

    expect(await fetchWeatherFactBundle({ lat: 47.8, lon: -123.6 })).toBeNull();
    expect(await fetchWeatherFacts({ lat: 47.8, lon: -123.6 })).toBeNull();
  });
});

describe('weather facts without coordinates', () => {
  test('missing coordinates yields null on both APIs', async () => {
    expect(await fetchWeatherFactBundle({ lat: null, lon: null })).toBeNull();
    expect(await fetchWeatherFacts({ lat: null, lon: null })).toBeNull();
  });
});
