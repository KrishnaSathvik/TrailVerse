'use strict';

const ridbFixture = require('./fixtures/ridb-yosemite-facilities.json');
const weatherFixture = require('./fixtures/weather-yosemite.json');
const { buildEvidenceKeys } = require('../../utils/evidenceKey');
const { createEvidenceBroker, materializeCandidate } = require('../evidenceBrokerService');
const { evaluateRequirementCoverage } = require('../evidenceCoverageEvaluator');
const { createRidbEvidenceProvider } = require('../providers/ridbEvidenceProvider');
const { createWeatherEvidenceProvider } = require('../providers/weatherEvidenceProvider');

const NOW = new Date('2026-08-09T12:00:00.000Z');
const ENTITY = {
  entityId: 'nps:park:yose', entityType: 'national_park', displayName: 'Yosemite National Park',
  latitude: 37.7459, longitude: -119.5332,
};

function requirement(topic, ordinal = 0, overrides = {}) {
  const policies = {
    campgrounds: { types: ['fact', 'relationship'], authority: 'official_structured', age: 86400, stale: 604800 },
    permits_reservations: { types: ['fact', 'rule'], authority: 'official_structured', age: 3600, stale: 21600 },
    weather_current: { types: ['live_state'], authority: 'official_structured', age: 600, stale: 0 },
    weather_forecast: { types: ['fact'], authority: 'official_structured', age: 1800, stale: 7200 },
    climate_normals: { types: ['fact'], authority: 'trusted_specialist', age: 2592000, stale: 31536000 },
  };
  const policy = policies[topic];
  const provider = ['campgrounds', 'permits_reservations'].includes(topic) ? 'ridb' : 'weather';
  const temporalScope = topic === 'weather_current'
    ? { mode: 'current', requestedAt: NOW.toISOString(), validFrom: null, validThrough: null, timezone: 'UTC' }
    : topic === 'weather_forecast'
      ? {
        mode: 'date_range', requestedAt: NOW.toISOString(),
        validFrom: NOW.toISOString(), validThrough: new Date(NOW.getTime() + 6 * 3600000).toISOString(), timezone: 'UTC',
      }
      : topic === 'climate_normals'
        ? {
          mode: 'season', requestedAt: NOW.toISOString(),
          validFrom: '2026-10-10T00:00:00.000Z', validThrough: '2026-10-12T23:59:59.999Z', timezone: 'UTC',
        }
        : { mode: 'timeless', requestedAt: NOW.toISOString(), validFrom: null, validThrough: null, timezone: 'UTC' };
  return {
    requirementId: `req:wp5b:${ordinal}:${topic}`,
    entity: ENTITY,
    topic,
    evidenceTypes: policy.types,
    temporalScope,
    freshnessClass: topic === 'weather_current' ? 'live' : topic === 'weather_forecast' ? 'hourly' : 'daily',
    maxAgeSeconds: policy.age,
    maxStaleSeconds: policy.stale,
    criticality: topic === 'weather_current' ? 'hard' : 'required',
    absenceSemantics: 'unknown',
    minimumAuthorityClass: policy.authority,
    acceptedSourceClasses: [policy.authority],
    preferredProviders: [provider],
    allowedFallbackProviders: [],
    privacyScope: 'public',
    ...overrides,
  };
}

function stored(candidate, observedAt = candidate.observedAt || NOW) {
  const materialized = materializeCandidate({ ...candidate, observedAt }, { now: NOW });
  const keys = buildEvidenceKeys(materialized);
  return {
    ...materialized,
    ...keys,
    provenance: { ...materialized.provenance, contentHash: keys.contentHash },
  };
}

function harness({ providers, initial = [] }) {
  const docs = [...initial];
  const refreshEvents = [];
  const broker = createEvidenceBroker({
    providers,
    queryEvidence: async (req) => docs.filter((item) => (
      item.entityId === req.entity.entityId && item.topic === req.topic && item.isCurrent
    )),
    persistCandidate: async ({ candidate, lease }) => {
      expect(lease.fencingToken).toBe(1);
      const keys = buildEvidenceKeys(candidate);
      const evidence = {
        ...candidate,
        ...keys,
        isCurrent: true,
        provenance: { ...candidate.provenance, contentHash: keys.contentHash },
      };
      const existing = docs.find((item) => item.canonicalKey === evidence.canonicalKey);
      if (!existing) docs.push(evidence);
      return { outcome: existing ? 'idempotent' : 'created', evidence: existing || evidence };
    },
    acquireLease: async ({ leaseKey, ownerId }) => ({
      outcome: 'acquired', lease: { leaseKey, ownerId, fencingToken: 1 },
    }),
    releaseLease: async () => ({ released: true }),
    waitForRefresh: async () => ({ outcome: 'coalesced_store_update' }),
    recordRefreshEvent: async (event) => { refreshEvents.push(event); },
    refreshHashSecret: 'wp5b-broker-test-secret',
    now: () => NOW,
  });
  return { broker, docs, refreshEvents };
}

function ridbProvider(clientOverrides = {}) {
  const client = {
    getRecAreaFacilities: jest.fn().mockResolvedValue(ridbFixture),
    ...clientOverrides,
  };
  return { provider: createRidbEvidenceProvider({ ridbClient: client, now: () => NOW }), client };
}

function forecastAtNow() {
  return {
    ...weatherFixture.forecast,
    list: [0, 3].map((hours, index) => ({
      ...weatherFixture.forecast.list[index],
      dt: Math.floor((NOW.getTime() + hours * 3600000) / 1000),
    })),
  };
}

function weatherProvider(overrides = {}) {
  const weatherClient = {
    fetchCurrent: jest.fn().mockResolvedValue({
      ...weatherFixture.current, dt: Math.floor(NOW.getTime() / 1000),
    }),
    fetchForecast: jest.fn().mockResolvedValue(forecastAtNow()),
    ...overrides.weatherClient,
  };
  const climateClient = {
    getClimateNormals: jest.fn().mockResolvedValue(weatherFixture.climate),
    ...overrides.climateClient,
  };
  return {
    provider: createWeatherEvidenceProvider({ weatherClient, climateClient, now: () => NOW }),
    weatherClient,
    climateClient,
  };
}

describe('WP5B RIDB through the frozen broker', () => {
  test('existing fresh RIDB evidence is a zero-call cache hit', async () => {
    const hProvider = ridbProvider();
    const request = hProvider.provider.buildRequest(requirement('campgrounds'));
    const candidate = hProvider.provider.normalize(ridbFixture, request, { observedAt: NOW.toISOString() })
      .find((item) => item.topic === 'campgrounds' && item.evidenceType === 'fact');
    const h = harness({ providers: [hProvider.provider], initial: [stored(candidate)] });
    const bundle = await h.broker.resolveEvidence({ requirements: [requirement('campgrounds')], requestId: 'ridb-cache' });

    expect(bundle.resolutions[0]).toMatchObject({ status: 'satisfied_fresh', cacheStatus: 'fresh_hit' });
    expect(hProvider.client.getRecAreaFacilities).not.toHaveBeenCalled();
  });

  test('duplicate concurrent RIDB requirements coalesce behind one physical dispatch', async () => {
    let release;
    const hProvider = ridbProvider({
      getRecAreaFacilities: jest.fn().mockImplementation(() => new Promise((resolve) => { release = resolve; })),
    });
    const h = harness({ providers: [hProvider.provider] });
    const pending = Array.from({ length: 10 }, (_, index) => h.broker.resolveEvidence({
      requirements: [requirement('campgrounds', index)], requestId: `ridb-concurrent-${index}`,
    }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(hProvider.client.getRecAreaFacilities).toHaveBeenCalledTimes(1);
    release(ridbFixture);
    const bundles = await Promise.all(pending);

    expect(bundles.every((bundle) => bundle.resolutions[0].status === 'satisfied_fresh')).toBe(true);
    expect(bundles.filter((bundle) => bundle.resolutions[0].cacheStatus === 'coalesced')).toHaveLength(9);
    expect(h.refreshEvents[0]).toMatchObject({ provider: 'ridb', requirementCount: 10, coalescedWaiters: 9 });
  });

  test('structured RIDB listing cannot satisfy an owning-agency requirement', async () => {
    const hProvider = ridbProvider();
    const h = harness({ providers: [hProvider.provider] });
    const ownerOnly = requirement('permits_reservations', 0, {
      minimumAuthorityClass: 'official_owner', acceptedSourceClasses: ['official_owner'],
    });
    const bundle = await h.broker.resolveEvidence({ requirements: [ownerOnly], requestId: 'ridb-authority' });

    expect(bundle.resolutions[0]).toMatchObject({ status: 'missing' });
    expect(bundle.resolutions[0].reasonCodes).toContain('candidate_insufficient_authority');
    expect(bundle.evidence).toHaveLength(0);
  });
});

describe('WP5B Weather through the frozen broker', () => {
  test('current observation satisfies a current hard requirement', async () => {
    const hProvider = weatherProvider();
    const h = harness({ providers: [hProvider.provider] });
    const bundle = await h.broker.resolveEvidence({ requirements: [requirement('weather_current')], requestId: 'weather-current' });

    expect(bundle.resolutions[0]).toMatchObject({ status: 'satisfied_fresh', cacheStatus: 'refreshed' });
    expect(bundle.evidence[0]).toMatchObject({ topic: 'weather_current', claim: { status: 'observed' } });
    expect(hProvider.weatherClient.fetchCurrent).toHaveBeenCalledTimes(1);
    expect(hProvider.weatherClient.fetchForecast).not.toHaveBeenCalled();
  });

  test('forecast and climate candidates cannot cross-satisfy another weather contract', () => {
    const hProvider = weatherProvider();
    const forecastRequest = hProvider.provider.buildRequest(requirement('weather_forecast'));
    const forecast = stored(hProvider.provider.normalize(forecastAtNow(), forecastRequest, { fetchedAt: NOW.toISOString() })[0]);
    const climateRequest = hProvider.provider.buildRequest(requirement('climate_normals'));
    const climate = stored(hProvider.provider.normalize(weatherFixture.climate, climateRequest, { fetchedAt: NOW.toISOString() })[0]);

    expect(evaluateRequirementCoverage(requirement('weather_current'), [forecast], { now: NOW }))
      .toMatchObject({ status: 'missing', reasonCodes: expect.arrayContaining(['candidate_wrong_topic']) });
    expect(evaluateRequirementCoverage(requirement('weather_forecast'), [climate], { now: NOW }))
      .toMatchObject({ status: 'missing', reasonCodes: ['candidate_wrong_topic'] });
  });

  test('future seasonal evidence never dispatches live current or forecast weather', async () => {
    const hProvider = weatherProvider();
    const h = harness({ providers: [hProvider.provider] });
    const bundle = await h.broker.resolveEvidence({ requirements: [requirement('climate_normals')], requestId: 'weather-climate' });

    expect(bundle.resolutions[0].status).toBe('satisfied_fresh');
    expect(hProvider.climateClient.getClimateNormals).toHaveBeenCalledTimes(1);
    expect(hProvider.weatherClient.fetchCurrent).not.toHaveBeenCalled();
    expect(hProvider.weatherClient.fetchForecast).not.toHaveBeenCalled();
  });

  test('stale forecast is usable within max-stale while right-now rejects stale observation', async () => {
    const hProvider = weatherProvider();
    const forecastRequest = hProvider.provider.buildRequest(requirement('weather_forecast'));
    const staleForecast = stored(
      hProvider.provider.normalize(forecastAtNow(), forecastRequest, { fetchedAt: NOW.toISOString() })[0],
      new Date(NOW.getTime() - 45 * 60000)
    );
    const currentRequest = hProvider.provider.buildRequest(requirement('weather_current'));
    const staleCurrentRaw = { ...weatherFixture.current, dt: Math.floor((NOW.getTime() - 11 * 60000) / 1000) };
    const staleCurrent = stored(
      hProvider.provider.normalize(staleCurrentRaw, currentRequest, { fetchedAt: NOW.toISOString() })[0]
    );
    const h = harness({ providers: [hProvider.provider], initial: [staleForecast] });
    const bundle = await h.broker.resolveEvidence({ requirements: [requirement('weather_forecast')], requestId: 'weather-stale' });

    expect(bundle.resolutions[0]).toMatchObject({ status: 'satisfied_stale_safe', cacheStatus: 'stale_safe_hit' });
    expect(evaluateRequirementCoverage(requirement('weather_current'), [staleCurrent], { now: NOW }))
      .toMatchObject({ status: 'missing', reasonCodes: ['candidate_expired'] });
  });

  test('concurrent forecast requirements share one physical response where scope is valid', async () => {
    let release;
    const hProvider = weatherProvider({
      weatherClient: {
        fetchForecast: jest.fn().mockImplementation(() => new Promise((resolve) => { release = resolve; })),
      },
    });
    const h = harness({ providers: [hProvider.provider] });
    const pending = Array.from({ length: 8 }, (_, index) => h.broker.resolveEvidence({
      requirements: [requirement('weather_forecast', index)], requestId: `forecast-${index}`,
    }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(hProvider.weatherClient.fetchForecast).toHaveBeenCalledTimes(1);
    release(forecastAtNow());
    const bundles = await Promise.all(pending);

    expect(bundles.every((bundle) => bundle.resolutions[0].status === 'satisfied_fresh')).toBe(true);
    expect(bundles.filter((bundle) => bundle.resolutions[0].cacheStatus === 'coalesced')).toHaveLength(7);
    expect(h.refreshEvents[0]).toMatchObject({ provider: 'weather', operation: 'forecast', requirementCount: 8 });
  });
});
