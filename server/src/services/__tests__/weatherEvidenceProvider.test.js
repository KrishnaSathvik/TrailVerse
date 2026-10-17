'use strict';

const fs = require('fs');
const path = require('path');
const { createWeatherEvidenceProvider } = require('../providers/weatherEvidenceProvider');

const NOW = new Date('2026-08-09T12:00:00.000Z');
const FIXTURE = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures/weather-yosemite.json'),
  'utf8'
));

function requirement(topic, overrides = {}) {
  return {
    requirementId: `req:wp5b:weather:${topic}`,
    entity: {
      entityId: 'nps:park:yose', entityType: 'national_park', displayName: 'Yosemite National Park',
      latitude: 37.7459, longitude: -119.5332,
    },
    topic,
    temporalScope: {
      mode: topic === 'weather_current' ? 'current' : topic === 'climate_normals' ? 'season' : 'date_range',
      requestedAt: NOW.toISOString(),
      validFrom: topic === 'climate_normals' ? '2026-10-10T00:00:00.000Z' : '2026-08-09T12:00:00.000Z',
      validThrough: topic === 'climate_normals' ? '2026-10-12T23:59:59.999Z' : '2026-08-10T23:59:59.999Z',
      timezone: 'America/Los_Angeles',
    },
    preferredProviders: ['weather'],
    ...overrides,
  };
}

describe('WP5B Weather evidence provider', () => {
  test('supports exactly current, forecast, and climate contracts with coordinates', () => {
    const provider = createWeatherEvidenceProvider({ weatherClient: {}, climateClient: {} });
    for (const topic of ['weather_current', 'weather_forecast', 'climate_normals']) {
      expect(provider.supports(requirement(topic))).toBe(true);
    }
    expect(provider.supports(requirement('alerts_closures'))).toBe(false);
    expect(provider.supports({
      ...requirement('weather_current'), entity: { entityId: 'nps:park:yose', latitude: null, longitude: null },
    })).toBe(false);
  });

  test('keeps physical current, forecast, and climate requests separate', () => {
    const provider = createWeatherEvidenceProvider({ weatherClient: {}, climateClient: {} });
    const current = provider.buildRequest(requirement('weather_current'));
    const forecast = provider.buildRequest(requirement('weather_forecast'));
    const climate = provider.buildRequest(requirement('climate_normals'));

    expect(current.dedupeKey).toBe('weather|current|37.7459|-119.5332|imperial');
    expect(forecast.dedupeKey).toBe('weather|forecast|37.7459|-119.5332|imperial');
    expect(climate.dedupeKey).toBe('weather|climate|37.7459|-119.5332|10');
    expect(new Set([current.operation, forecast.operation, climate.operation]).size).toBe(3);
  });

  test('current response creates only a current observation candidate', () => {
    const provider = createWeatherEvidenceProvider({ weatherClient: {}, climateClient: {} });
    const request = provider.buildRequest(requirement('weather_current'));
    const candidates = provider.normalize(FIXTURE.current, request, { fetchedAt: NOW.toISOString() });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      topic: 'weather_current', evidenceType: 'live_state',
      claim: { status: 'observed', normalizedValue: { temperatureF: 72.4, condition: 'clear sky' } },
      source: { provider: 'openweather', sourceClass: 'official_structured' },
    });
    expect(candidates[0].observedAt).toBe(new Date(FIXTURE.current.dt * 1000).toISOString());
  });

  test('forecast response creates only forecast evidence covering its physical horizon', () => {
    const provider = createWeatherEvidenceProvider({ weatherClient: {}, climateClient: {} });
    const request = provider.buildRequest(requirement('weather_forecast'));
    const candidates = provider.normalize(FIXTURE.forecast, request, { fetchedAt: NOW.toISOString() });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      topic: 'weather_forecast', evidenceType: 'fact',
      claim: { status: 'forecast' },
      source: { provider: 'openweather' },
    });
    expect(candidates[0].scope.validFrom).toBe(new Date(FIXTURE.forecast.list[0].dt * 1000).toISOString());
    expect(candidates[0].scope.validThrough).toBe(new Date((FIXTURE.forecast.list[1].dt + 10800) * 1000).toISOString());
    expect(candidates[0].topic).not.toBe('weather_current');
  });

  test('climate response creates only seasonal evidence and never calls live weather', async () => {
    const weatherClient = { fetchCurrent: jest.fn(), fetchForecast: jest.fn() };
    const climateClient = { getClimateNormals: jest.fn().mockResolvedValue(FIXTURE.climate) };
    const provider = createWeatherEvidenceProvider({ weatherClient, climateClient, now: () => NOW });
    const request = provider.buildRequest(requirement('climate_normals'));
    const fetched = await provider.fetch(request, { signal: new AbortController().signal });
    const candidates = provider.normalize(fetched.raw, request, fetched.metadata);

    expect(climateClient.getClimateNormals).toHaveBeenCalledTimes(1);
    expect(weatherClient.fetchCurrent).not.toHaveBeenCalled();
    expect(weatherClient.fetchForecast).not.toHaveBeenCalled();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      topic: 'climate_normals', evidenceType: 'fact',
      claim: { status: 'climate_estimate', normalizedValue: { month: 10, typicalHighF: 65, typicalLowF: 35 } },
      source: { provider: 'trailverse_climate_estimate', sourceClass: 'trusted_specialist' },
    });
  });

  test('forecast requirements sharing coordinates reuse one physical response key', () => {
    const provider = createWeatherEvidenceProvider({ weatherClient: {}, climateClient: {} });
    const first = provider.buildRequest(requirement('weather_forecast'));
    const second = provider.buildRequest(requirement('weather_forecast', {
      requirementId: 'req:wp5b:weather:forecast:second',
      temporalScope: {
        ...requirement('weather_forecast').temporalScope,
        validFrom: '2026-08-10T00:00:00.000Z',
        validThrough: '2026-08-10T23:59:59.999Z',
      },
    }));
    expect(second.dedupeKey).toBe(first.dedupeKey);
    expect(second.publicCanonicalRequest).toEqual(first.publicCanonicalRequest);
  });

  test('adapter imports no broker, store, model, or prompt code', () => {
    const source = fs.readFileSync(path.join(__dirname, '../providers/weatherEvidenceProvider.js'), 'utf8');
    expect(source).not.toMatch(/mongoose|models\/|evidenceStore|evidenceCoverage|factsService|prompt/i);
  });
});
