'use strict';

const mapsFixture = require('./fixtures/maps-yosemite-sequoia.json');
const { buildEvidenceKeys } = require('../../utils/evidenceKey');
const { createEvidenceBroker, materializeCandidate } = require('../evidenceBrokerService');
const { createMapsEvidenceProvider } = require('../providers/mapsEvidenceProvider');
const { createAstronomyEvidenceProvider } = require('../providers/astronomyEvidenceProvider');
const { createFeeFreeDatesEvidenceProvider } = require('../providers/feeFreeDatesEvidenceProvider');

const NOW = new Date('2026-08-09T12:00:00.000Z');
const YOSEMITE = { entityId: 'nps:park:yose', displayName: 'Yosemite National Park', latitude: 37.7459, longitude: -119.5332 };
const SEQUOIA = { entityId: 'nps:park:sequ', displayName: 'Sequoia National Park', latitude: 36.4864, longitude: -118.5658 };
const DEATH_VALLEY = { entityId: 'nps:park:deva', displayName: 'Death Valley National Park', latitude: 36.5054, longitude: -117.0794 };

function common(topic, entity, ordinal, policy, temporalScope) {
  return {
    requirementId: `req:wp5c:${ordinal}:${topic}`, entity, topic,
    evidenceTypes: policy.types, temporalScope,
    freshnessClass: policy.freshness, maxAgeSeconds: policy.age, maxStaleSeconds: policy.stale,
    criticality: 'required', absenceSemantics: 'unknown',
    minimumAuthorityClass: policy.authority, acceptedSourceClasses: [policy.authority],
    preferredProviders: [policy.provider], allowedFallbackProviders: [], privacyScope: 'public',
  };
}

function routeRequirement(ordinal = 0, { origin = YOSEMITE, destination = SEQUOIA, bucket = NOW.toISOString() } = {}) {
  return {
    ...common('driving_time', destination, ordinal, {
      types: ['fact'], freshness: 'hourly', age: 1800, stale: 21600,
      authority: 'commercial_structured', provider: 'google_maps',
    }, { mode: 'timeless', requestedAt: NOW.toISOString(), validFrom: null, validThrough: null, timezone: 'UTC' }),
    routeScope: { origin, destination, travelMode: 'driving', departureTimeBucket: bucket },
  };
}

function astronomyRequirement(ordinal = 0) {
  return common('astronomy', YOSEMITE, ordinal, {
    types: ['fact'], freshness: 'daily', age: 86400, stale: 604800,
    authority: 'trusted_specialist', provider: 'astronomy_compute',
  }, {
    mode: 'date_range', requestedAt: NOW.toISOString(),
    validFrom: '2026-08-10T00:00:00.000Z', validThrough: '2026-08-11T23:59:59.999Z', timezone: 'UTC',
  });
}

function feeRequirement(year, ordinal = 0, overrides = {}) {
  return {
    ...common('fee_free_dates', YOSEMITE, ordinal, {
      types: ['rule'], freshness: 'stable', age: 2592000, stale: 31536000,
      authority: 'official_owner', provider: 'fee_free_calendar',
    }, {
      mode: 'date_range', requestedAt: NOW.toISOString(),
      validFrom: `${year}-01-01T00:00:00.000Z`, validThrough: `${year}-12-31T23:59:59.999Z`, timezone: 'UTC',
    }),
    ...overrides,
  };
}

function stored(candidate, observedAt = candidate.observedAt || NOW) {
  const materialized = materializeCandidate({ ...candidate, observedAt }, { now: NOW });
  const keys = buildEvidenceKeys(materialized);
  return { ...materialized, ...keys, provenance: { ...materialized.provenance, contentHash: keys.contentHash } };
}

function harness({ providers, initial = [] }) {
  const docs = [...initial];
  const refreshEvents = [];
  const broker = createEvidenceBroker({
    providers,
    queryEvidence: async (req) => docs.filter((item) => item.entityId === req.entity.entityId && item.topic === req.topic && item.isCurrent),
    persistCandidate: async ({ candidate, lease }) => {
      expect(lease.fencingToken).toBe(1);
      const keys = buildEvidenceKeys(candidate);
      const evidence = { ...candidate, ...keys, isCurrent: true, provenance: { ...candidate.provenance, contentHash: keys.contentHash } };
      const existing = docs.find((item) => item.canonicalKey === evidence.canonicalKey);
      if (!existing) docs.push(evidence);
      return { outcome: existing ? 'idempotent' : 'created', evidence: existing || evidence };
    },
    acquireLease: async ({ leaseKey, ownerId }) => ({ outcome: 'acquired', lease: { leaseKey, ownerId, fencingToken: 1 } }),
    releaseLease: async () => ({ released: true }),
    waitForRefresh: async () => ({ outcome: 'coalesced_store_update' }),
    recordRefreshEvent: async (event) => { refreshEvents.push(event); },
    refreshHashSecret: 'wp5c-broker-test-secret', now: () => NOW,
  });
  return { broker, docs, refreshEvents };
}

function mapsProvider(getRoute = jest.fn().mockResolvedValue(mapsFixture)) {
  const mapsClient = { getRoute };
  return { provider: createMapsEvidenceProvider({ mapsClient, now: () => NOW }), mapsClient };
}

function astronomyProvider() {
  const engine = {
    calculateMoonPhase: jest.fn(() => ({
      phase: 'New Moon', illumination: 2, age: 1,
      nextNewMoon: new Date('2026-09-10T00:00:00.000Z'), nextFullMoon: new Date('2026-08-26T00:00:00.000Z'),
    })),
    calculateMilkyWayVisibility: jest.fn(() => 'Excellent'),
  };
  return { provider: createAstronomyEvidenceProvider({ astronomyEngine: engine, now: () => NOW }), engine };
}

describe('WP5C Maps through the frozen broker', () => {
  test('exact fresh route evidence is a zero-call cache hit', async () => {
    const maps = mapsProvider();
    const request = maps.provider.buildRequest(routeRequirement());
    const candidate = maps.provider.normalize(mapsFixture, request, { observedAt: NOW.toISOString() })[0];
    const h = harness({ providers: [maps.provider], initial: [stored(candidate)] });
    const bundle = await h.broker.resolveEvidence({ requirements: [routeRequirement()], requestId: 'maps-cache' });
    expect(bundle.resolutions[0]).toMatchObject({ status: 'satisfied_fresh', cacheStatus: 'fresh_hit' });
    expect(maps.mapsClient.getRoute).not.toHaveBeenCalled();
  });

  test('a cached route with the wrong origin cannot satisfy the request', async () => {
    const maps = mapsProvider();
    const wrongRequest = maps.provider.buildRequest(routeRequirement(0, { origin: DEATH_VALLEY }));
    const wrong = maps.provider.normalize(mapsFixture, wrongRequest, { observedAt: NOW.toISOString() })[0];
    const h = harness({ providers: [maps.provider], initial: [stored(wrong)] });
    const bundle = await h.broker.resolveEvidence({ requirements: [routeRequirement()], requestId: 'maps-scope' });
    expect(maps.mapsClient.getRoute).toHaveBeenCalledTimes(1);
    expect(bundle.resolutions[0]).toMatchObject({ status: 'satisfied_fresh', cacheStatus: 'refreshed' });
    expect(bundle.evidence[0].claim.subjectId).toBe(YOSEMITE.entityId);
  });

  test('concurrent identical routes coalesce into one physical Maps request', async () => {
    let release;
    const maps = mapsProvider(jest.fn().mockImplementation(() => new Promise((resolve) => { release = resolve; })));
    const h = harness({ providers: [maps.provider] });
    const pending = Array.from({ length: 10 }, (_, index) => h.broker.resolveEvidence({
      requirements: [routeRequirement(index)], requestId: `maps-concurrent-${index}`,
    }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(maps.mapsClient.getRoute).toHaveBeenCalledTimes(1);
    release(mapsFixture);
    const bundles = await Promise.all(pending);
    expect(bundles.every((bundle) => bundle.resolutions[0].status === 'satisfied_fresh')).toBe(true);
    expect(bundles.filter((bundle) => bundle.resolutions[0].cacheStatus === 'coalesced')).toHaveLength(9);
    expect(h.refreshEvents[0]).toMatchObject({ provider: 'google_maps', operation: 'route', requirementCount: 10, coalescedWaiters: 9 });
  });
});

describe('WP5C deterministic public evidence through the frozen broker', () => {
  test('fresh Astronomy evidence causes zero recomputation', async () => {
    const astronomy = astronomyProvider();
    const request = astronomy.provider.buildRequest(astronomyRequirement());
    const fetched = await astronomy.provider.fetch(request);
    const candidate = astronomy.provider.normalize(fetched.raw, request, fetched.metadata)[0];
    astronomy.engine.calculateMoonPhase.mockClear();
    const h = harness({ providers: [astronomy.provider], initial: [stored(candidate)] });
    const bundle = await h.broker.resolveEvidence({ requirements: [astronomyRequirement()], requestId: 'astronomy-cache' });
    expect(bundle.resolutions[0]).toMatchObject({ status: 'satisfied_fresh', cacheStatus: 'fresh_hit' });
    expect(astronomy.engine.calculateMoonPhase).not.toHaveBeenCalled();
  });

  test('one deterministic Astronomy response serves duplicate requirements', async () => {
    const astronomy = astronomyProvider();
    const h = harness({ providers: [astronomy.provider] });
    const requirements = Array.from({ length: 6 }, (_, index) => astronomyRequirement(index));
    const bundle = await h.broker.resolveEvidence({ requirements, requestId: 'astronomy-dedupe' });
    expect(astronomy.engine.calculateMoonPhase).toHaveBeenCalledTimes(2);
    expect(bundle.resolutions.every((resolution) => resolution.status === 'satisfied_fresh')).toBe(true);
    expect(h.refreshEvents[0]).toMatchObject({ provider: 'astronomy_compute', requirementCount: 6 });
  });

  test('verified fee-free evidence is reusable while projected dates cannot meet owner authority', async () => {
    const calendarSource = { getCalendar: jest.fn((year) => ({
      year, version: year === 2026 ? 'nps-2026-v1' : 'trailverse-projected-2027-v1',
      status: year === 2026 ? 'verified' : 'projected',
      authorityClass: year === 2026 ? 'official_owner' : 'trusted_specialist',
      days: [{ date: `${year}-11-11`, label: 'Veterans Day' }],
    })) };
    const provider = createFeeFreeDatesEvidenceProvider({ calendarSource, now: () => NOW });
    const request = provider.buildRequest(feeRequirement(2026));
    const fetched = await provider.fetch(request);
    const verified = provider.normalize(fetched.raw, request, fetched.metadata)[0];
    calendarSource.getCalendar.mockClear();
    const cached = harness({ providers: [provider], initial: [stored(verified)] });
    const hit = await cached.broker.resolveEvidence({ requirements: [feeRequirement(2026)], requestId: 'fee-cache' });
    expect(hit.resolutions[0]).toMatchObject({ status: 'satisfied_fresh', cacheStatus: 'fresh_hit' });
    expect(calendarSource.getCalendar).not.toHaveBeenCalled();

    const projected = harness({ providers: [provider] });
    const miss = await projected.broker.resolveEvidence({ requirements: [feeRequirement(2027)], requestId: 'fee-projected' });
    expect(miss.resolutions[0]).toMatchObject({ status: 'missing' });
    expect(miss.resolutions[0].reasonCodes).toContain('candidate_insufficient_authority');
  });
});
