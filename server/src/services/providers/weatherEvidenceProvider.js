'use strict';

const OPENWEATHER_BASE = 'https://api.openweathermap.org/data/2.5';
const SUPPORTED_TOPICS = Object.freeze(new Set([
  'weather_current', 'weather_forecast', 'climate_normals',
]));
const FORECAST_INTERVAL_SECONDS = 3 * 60 * 60;

function coordinatesFor(requirement) {
  if (requirement?.entity?.latitude == null || requirement?.entity?.longitude == null) return null;
  const latitude = Number(requirement?.entity?.latitude);
  const longitude = Number(requirement?.entity?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function compactCoordinate(value) {
  return String(Number(Number(value).toFixed(4)));
}

function monthFor(requirement) {
  const value = requirement?.temporalScope?.validFrom || requirement?.temporalScope?.requestedAt;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getUTCMonth() + 1;
}

function defaultWeatherClient() {
  const request = async (operation, parameters, signal) => {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
      throw Object.assign(new Error('OpenWeather API key is not configured'), { code: 'weather_not_configured' });
    }
    const axios = require('axios');
    const response = await axios.get(`${OPENWEATHER_BASE}/${operation}`, {
      params: {
        lat: parameters.latitude,
        lon: parameters.longitude,
        units: parameters.units,
        appid: apiKey,
      },
      timeout: 5000,
      signal,
    });
    return response.data;
  };
  return {
    fetchCurrent(parameters, { signal } = {}) {
      return request('weather', parameters, signal);
    },
    fetchForecast(parameters, { signal } = {}) {
      return request('forecast', parameters, signal);
    },
  };
}

function defaultClimateClient() {
  return {
    async getClimateNormals(parameters) {
      const { estimateMonthlyClimate } = require('../weatherEstimateService');
      const result = estimateMonthlyClimate({
        lat: parameters.latitude,
        lon: parameters.longitude,
        month: parameters.month,
        parkCode: parameters.parkCode,
      });
      return {
        month: parameters.month,
        highF: result.high,
        lowF: result.low,
        conditions: result.conditions,
        source: 'TrailVerse climate estimate',
      };
    },
  };
}

function commonCandidate({ request, topic, evidenceType, claim, scope, source, observedAt }) {
  const entityId = request.parameters.entityId;
  return {
    entityId,
    topic,
    evidenceType,
    claim: {
      ...claim,
      unit: null,
      subjectId: entityId,
      objectId: null,
      qualifiers: claim.qualifiers || [],
    },
    scope: {
      geographicEntityIds: [entityId],
      validFrom: scope?.validFrom || null,
      validThrough: scope?.validThrough || null,
      audience: 'public',
      locale: 'en-US',
    },
    source: {
      provider: source.provider,
      sourceClass: source.sourceClass,
      sourceId: source.sourceId,
      url: source.url || null,
      title: source.title || null,
      publishedAt: null,
      sourceUpdatedAt: source.sourceUpdatedAt || null,
    },
    observedAt,
    quality: { authorityClass: source.sourceClass, scopeMatch: 'exact', conflictStatus: 'none' },
    provenance: { extractionMethod: 'structured_adapter', extractorVersion: 'weather-evidence-v1' },
  };
}

function normalizeCurrent(raw, request, metadata) {
  if (!raw?.main || !Array.isArray(raw.weather) || raw.weather.length === 0) return [];
  const observedAt = Number.isFinite(Number(raw.dt))
    ? new Date(Number(raw.dt) * 1000).toISOString()
    : metadata.fetchedAt;
  return [commonCandidate({
    request,
    topic: 'weather_current',
    evidenceType: 'live_state',
    claim: {
      identity: `weather-current:${request.parameters.locationKey}:${observedAt}`,
      text: raw.weather[0]?.description || null,
      normalizedValue: {
        temperatureF: Number(raw.main.temp),
        condition: raw.weather[0]?.description || null,
        feelsLikeF: Number.isFinite(Number(raw.main.feels_like)) ? Number(raw.main.feels_like) : null,
        humidityPercent: Number.isFinite(Number(raw.main.humidity)) ? Number(raw.main.humidity) : null,
        windMph: Number.isFinite(Number(raw.wind?.speed)) ? Number(raw.wind.speed) : null,
      },
      status: 'observed',
      qualifiers: ['current_observation'],
    },
    scope: { validFrom: observedAt, validThrough: null },
    source: {
      provider: 'openweather', sourceClass: 'official_structured',
      sourceId: `openweather:current:${request.parameters.locationKey}`,
      url: 'https://openweathermap.org/current',
    },
    observedAt,
  })];
}

function normalizeForecast(raw, request, metadata) {
  const entries = Array.isArray(raw?.list) ? raw.list.filter((item) => Number.isFinite(Number(item.dt))) : [];
  if (entries.length === 0) return [];
  const first = Math.min(...entries.map((item) => Number(item.dt)));
  const last = Math.max(...entries.map((item) => Number(item.dt))) + FORECAST_INTERVAL_SECONDS;
  const validFrom = new Date(first * 1000).toISOString();
  const validThrough = new Date(last * 1000).toISOString();
  const periods = entries.map((item) => ({
    validAt: new Date(Number(item.dt) * 1000).toISOString(),
    temperatureF: Number(item.main?.temp),
    minimumF: Number.isFinite(Number(item.main?.temp_min)) ? Number(item.main.temp_min) : null,
    maximumF: Number.isFinite(Number(item.main?.temp_max)) ? Number(item.main.temp_max) : null,
    condition: item.weather?.[0]?.description || null,
    humidityPercent: Number.isFinite(Number(item.main?.humidity)) ? Number(item.main.humidity) : null,
    windMph: Number.isFinite(Number(item.wind?.speed)) ? Number(item.wind.speed) : null,
  }));
  return [commonCandidate({
    request,
    topic: 'weather_forecast',
    evidenceType: 'fact',
    claim: {
      identity: `weather-forecast:${request.parameters.locationKey}:${validFrom}:${validThrough}`,
      text: `${raw.city?.name || request.parameters.displayName || 'Destination'} forecast`,
      normalizedValue: {
        forecastHorizon: { validFrom, validThrough },
        timezoneOffsetSeconds: Number.isFinite(Number(raw.city?.timezone)) ? Number(raw.city.timezone) : 0,
        periods,
      },
      status: 'forecast',
      qualifiers: ['forecast_not_observation'],
    },
    scope: { validFrom, validThrough },
    source: {
      provider: 'openweather', sourceClass: 'official_structured',
      sourceId: `openweather:forecast:${request.parameters.locationKey}:${validFrom}`,
      url: 'https://openweathermap.org/forecast5',
    },
    observedAt: metadata.fetchedAt,
  })];
}

function normalizeClimate(raw, request, metadata) {
  if (!raw || !Number.isFinite(Number(raw.month))) return [];
  return [commonCandidate({
    request,
    topic: 'climate_normals',
    evidenceType: 'fact',
    claim: {
      identity: `climate-normal:${request.parameters.locationKey}:${raw.month}`,
      text: raw.conditions || null,
      normalizedValue: {
        month: Number(raw.month),
        typicalHighF: Number(raw.highF),
        typicalLowF: Number(raw.lowF),
        conditions: raw.conditions || null,
      },
      status: 'climate_estimate',
      qualifiers: ['seasonal_typical_not_forecast', 'not_current_conditions'],
    },
    scope: {
      validFrom: request.parameters.validFrom,
      validThrough: request.parameters.validThrough,
    },
    source: {
      provider: 'trailverse_climate_estimate', sourceClass: 'trusted_specialist',
      sourceId: `trailverse-climate:${request.parameters.parkCode || request.parameters.locationKey}:${raw.month}`,
      title: raw.source || 'TrailVerse climate estimate',
    },
    observedAt: raw.observedAt || metadata.fetchedAt,
  })];
}

function createWeatherEvidenceProvider({
  weatherClient = null,
  climateClient = null,
  now = () => new Date(),
} = {}) {
  const liveClient = () => weatherClient || defaultWeatherClient();
  const normalsClient = () => climateClient || defaultClimateClient();
  return {
    id: 'weather',
    supports(requirement) {
      return SUPPORTED_TOPICS.has(requirement?.topic) && Boolean(coordinatesFor(requirement));
    },
    estimateCost(request) {
      return {
        costStatus: 'known',
        costUsd: 0,
        providerAttemptLimit: request?.operation === 'climate_normals' ? 1 : 2,
      };
    },
    buildRequest(requirement) {
      const coordinates = coordinatesFor(requirement);
      if (!coordinates || !SUPPORTED_TOPICS.has(requirement?.topic)) {
        throw new TypeError('Unsupported Weather evidence requirement');
      }
      const latitude = Number(compactCoordinate(coordinates.latitude));
      const longitude = Number(compactCoordinate(coordinates.longitude));
      const locationKey = `${compactCoordinate(latitude)}|${compactCoordinate(longitude)}`;
      const common = {
        entityId: requirement.entity.entityId,
        displayName: requirement.entity.displayName || null,
        parkCode: /^nps:park:/i.test(requirement.entity.entityId || '')
          ? requirement.entity.entityId.split(':').pop().toLowerCase() : null,
        latitude,
        longitude,
        locationKey,
        units: 'imperial',
      };
      let operation;
      let keySuffix;
      let parameters = common;
      if (requirement.topic === 'weather_current') {
        operation = 'current_observation'; keySuffix = `current|${locationKey}|imperial`;
      } else if (requirement.topic === 'weather_forecast') {
        operation = 'forecast'; keySuffix = `forecast|${locationKey}|imperial`;
      } else {
        const month = monthFor(requirement);
        if (!month) throw new TypeError('Climate evidence requires a valid target month');
        operation = 'climate_normals'; keySuffix = `climate|${locationKey}|${month}`;
        parameters = {
          ...common,
          month,
          validFrom: requirement.temporalScope?.validFrom || null,
          validThrough: requirement.temporalScope?.validThrough || null,
        };
      }
      const publicCanonicalRequest = {
        provider: 'weather', operation, latitude, longitude, units: 'imperial',
        ...(operation === 'climate_normals' ? { month: parameters.month } : {}),
      };
      return {
        provider: 'weather', operation, parameters,
        dedupeKey: `weather|${keySuffix}`,
        publicCanonicalRequest,
      };
    },
    async fetch(request, { signal } = {}) {
      if (signal?.aborted) throw Object.assign(new Error('Weather evidence fetch cancelled'), { code: 'ABORT_ERR' });
      let raw;
      if (request.operation === 'current_observation') {
        raw = await liveClient().fetchCurrent(request.parameters, { signal });
      } else if (request.operation === 'forecast') {
        raw = await liveClient().fetchForecast(request.parameters, { signal });
      } else if (request.operation === 'climate_normals') {
        raw = await normalsClient().getClimateNormals(request.parameters, { signal });
      } else throw new TypeError(`Unsupported Weather operation: ${request.operation}`);
      return {
        raw,
        metadata: { fetchedAt: now().toISOString() },
        completeness: { isComplete: false, topics: [], emptyMeans: 'unknown' },
        providerAttempts: 1,
      };
    },
    normalize(raw, request, metadata = {}) {
      const withTime = { fetchedAt: metadata.fetchedAt || now().toISOString() };
      if (request.operation === 'current_observation') return normalizeCurrent(raw, request, withTime);
      if (request.operation === 'forecast') return normalizeForecast(raw, request, withTime);
      if (request.operation === 'climate_normals') return normalizeClimate(raw, request, withTime);
      return [];
    },
    classifyError(error) {
      const status = error?.response?.status;
      if (error?.code === 'weather_not_configured' || status === 401 || status === 403) {
        return { code: 'provider_not_configured', retryable: false };
      }
      if (status === 429) return { code: 'provider_rate_limited', retryable: false };
      if (error?.code === 'ABORT_ERR' || error?.code === 'ERR_CANCELED') return { code: 'provider_cancelled', retryable: false };
      if (['ETIMEDOUT', 'ECONNABORTED'].includes(error?.code)) return { code: 'provider_timeout', retryable: true };
      return { code: 'provider_unavailable', retryable: status >= 500 || !status };
    },
  };
}

module.exports = {
  SUPPORTED_TOPICS,
  createWeatherEvidenceProvider,
};
