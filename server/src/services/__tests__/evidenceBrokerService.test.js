'use strict';

const { buildEvidenceKeys } = require('../../utils/evidenceKey');
const { OPERATIONAL_NORMALIZATION_QUALIFIER, NPS_NAMED_ACTIVITIES_EXTRACTOR_VERSION } = require('../../utils/evidenceContractVersions');
const { createEvidenceBroker } = require('../evidenceBrokerService');
const { publicRefreshHash } = require('../evidenceBrokerService');

const NOW = new Date('2026-08-09T12:00:00.000Z');

function requirement(topic, ordinal = 0, overrides = {}) {
  const types = {
    destination_identity: ['fact'], overview: ['description'], activities: ['fact'],
    fees: ['fact'], hours: ['rule'], alerts_closures: ['live_state'],
  };
  return {
    requirementId: `req:broker:${ordinal}:${topic}`,
    entity: { entityId: 'nps:park:yose', entityType: 'national_park', displayName: 'Yosemite National Park' },
    topic,
    evidenceTypes: types[topic] || ['fact'],
    temporalScope: { mode: 'current', requestedAt: NOW.toISOString(), validFrom: null, validThrough: null, timezone: 'UTC' },
    freshnessClass: topic === 'alerts_closures' ? 'live' : 'daily',
    maxAgeSeconds: topic === 'alerts_closures' ? 900 : 86400,
    maxStaleSeconds: topic === 'alerts_closures' ? 0 : 86400,
    criticality: topic === 'alerts_closures' ? 'hard' : 'required',
    absenceSemantics: 'unknown',
    minimumAuthorityClass: 'official_owner',
    acceptedSourceClasses: ['official_owner'],
    preferredProviders: ['nps'],
    allowedFallbackProviders: [],
    privacyScope: 'public',
    ...overrides,
  };
}

function stored(topic, identity = topic, observedAt = NOW) {
  const extractorVersion = topic === 'activities' ? NPS_NAMED_ACTIVITIES_EXTRACTOR_VERSION : 'nps-evidence-v1';
  // Fix Pass #3E: nps-activities-v8 is only coverage-eligible when stamped
  // source_ingestion_complete (production npsEvidenceProvider does this).
  // ...and, since the operational fact producer runs on this family, the
  // semantic normalization contract version it was produced under.
  const qualifiers = topic === 'activities'
    ? ['source_ingestion_complete', OPERATIONAL_NORMALIZATION_QUALIFIER]
    : [];
  const candidate = {
    entityId: 'nps:park:yose', topic,
    evidenceType: topic === 'overview' ? 'description' : topic === 'hours' ? 'rule' : topic === 'alerts_closures' ? 'live_state' : 'fact',
    claim: { identity, text: identity, normalizedValue: identity, unit: null, status: null, subjectId: 'nps:park:yose', objectId: null, qualifiers },
    scope: { geographicEntityIds: ['nps:park:yose'], validFrom: null, validThrough: null, audience: 'public', locale: 'en-US' },
    source: { provider: 'nps', sourceClass: 'official_owner', sourceId: `nps-${identity}`, url: null, title: null, publishedAt: null, sourceUpdatedAt: null },
    observation: { observedAt, fetchedAt: observedAt, expiresAt: new Date(observedAt.getTime() + 86400000), staleUntil: new Date(observedAt.getTime() + 172800000), retrievalMode: 'live' },
    quality: { authorityClass: 'official_owner', freshnessStatus: 'fresh', scopeMatch: 'exact', corroboratingEvidenceIds: [], conflictingEvidenceIds: [], conflictStatus: 'none' },
    provenance: { extractionMethod: 'structured_adapter', extractorVersion, rawPayloadHash: null, contentHash: 'pending' },
    retention: { class: 'public_dynamic_90d', licenseClass: 'government_public', storeClaimText: true, deleteAfter: null },
    isCurrent: true,
  };
  const keys = buildEvidenceKeys(candidate);
  return { ...candidate, ...keys, provenance: { ...candidate.provenance, contentHash: keys.contentHash } };
}

function makeBroker({ initial = [], adapter, reserveRefreshBudget, extraProviders = [] } = {}) {
  const docs = [...initial];
  const refreshEvents = [];
  const provider = adapter || {
    id: 'nps',
    supports: () => true,
    estimateCost: () => ({ costStatus: 'known', costUsd: 0 }),
    buildRequest: (req) => ({
      provider: 'nps', operation: req.topic === 'alerts_closures' ? 'alerts' : 'parks',
      parameters: { parkCode: 'yose' },
      dedupeKey: req.topic === 'alerts_closures' ? 'nps|alerts|yose' : 'nps|parks|yose',
      publicCanonicalRequest: { provider: 'nps', operation: req.topic === 'alerts_closures' ? 'alerts' : 'parks', parkCode: 'yose' },
    }),
    fetch: jest.fn().mockResolvedValue({ raw: {}, metadata: { observedAt: NOW.toISOString() }, completeness: { isComplete: true, emptyMeans: 'unknown' }, providerAttempts: 1 }),
    normalize: jest.fn((_raw, request) => request.operation === 'alerts'
      ? [{ ...stored('alerts_closures', 'alert-a'), evidenceId: undefined, logicalKey: undefined, canonicalKey: undefined, observation: undefined, retention: undefined }]
      : ['destination_identity', 'overview', 'activities', 'fees', 'hours'].map((topic) => ({
        ...stored(topic), evidenceId: undefined, logicalKey: undefined, canonicalKey: undefined,
        observation: undefined, retention: undefined, observedAt: NOW.toISOString(),
      }))),
    classifyError: () => ({ code: 'provider_unavailable', retryable: false }),
  };
  const broker = createEvidenceBroker({
    providers: [provider, ...extraProviders],
    queryEvidence: async (req) => docs.filter((item) => item.entityId === req.entity.entityId && item.topic === req.topic && item.isCurrent),
    persistCandidate: async ({ candidate }) => {
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
    refreshHashSecret: 'wp5a-test-refresh-secret',
    now: () => NOW,
    ...(reserveRefreshBudget ? { reserveRefreshBudget } : {}),
  });
  return { broker, docs, provider, refreshEvents };
}

describe('WP5A provider-neutral evidence broker', () => {
  test('refresh correlation refuses public request representations containing private fields', () => {
    expect(() => publicRefreshHash({
      provider: 'nps', operation: 'parks',
      publicCanonicalRequest: { provider: 'nps', operation: 'parks', userId: 'private-user' },
    }, 'test-secret')).toThrow(expect.objectContaining({ code: 'shared_evidence_private_data' }));
  });

  test('fresh shared evidence returns an immutable bundle with zero provider calls', async () => {
    const h = makeBroker({ initial: [stored('overview')] });
    const bundle = await h.broker.resolveEvidence({ requirements: [requirement('overview')], requestId: 'request-cache' });
    expect(bundle.resolutions[0]).toMatchObject({ status: 'satisfied_fresh', cacheStatus: 'fresh_hit' });
    expect(bundle.evidence).toHaveLength(1);
    expect(h.provider.fetch).not.toHaveBeenCalled();
    expect(Object.isFrozen(bundle)).toBe(true);
  });

  test('five logical profile requirements produce one physical fetch and reusable stored topics', async () => {
    const h = makeBroker();
    const topics = ['destination_identity', 'overview', 'activities', 'fees', 'hours'];
    const bundle = await h.broker.resolveEvidence({
      requirements: topics.map((topic, index) => requirement(topic, index)), requestId: 'request-profile',
    });
    expect(h.provider.fetch).toHaveBeenCalledTimes(1);
    expect(bundle.resolutions.every((item) => item.status === 'satisfied_fresh')).toBe(true);
    expect(h.docs.map((item) => item.topic).sort()).toEqual([...topics].sort());
    expect(h.refreshEvents).toHaveLength(1);
    expect(h.refreshEvents[0]).toMatchObject({ requirementCount: 5, providerAttemptCount: 1, outcome: 'succeeded' });
  });

  test('same requirement ID with a different contract rejects before store/provider work', async () => {
    const h = makeBroker();
    await expect(h.broker.resolveEvidence({
      requestId: 'request-invalid',
      requirements: [requirement('fees', 0), { ...requirement('hours', 1), requirementId: 'req:broker:0:fees' }],
    })).rejects.toMatchObject({ code: 'evidence_requirement_identity_conflict' });
    expect(h.provider.fetch).not.toHaveBeenCalled();
  });

  test('unsupported topics remain explicit and never dispatch NPS', async () => {
    const h = makeBroker({ adapter: { id: 'nps', supports: () => false, fetch: jest.fn() } });
    const bundle = await h.broker.resolveEvidence({ requirements: [requirement('weather_forecast')], requestId: 'request-unsupported' });
    expect(bundle.resolutions[0]).toMatchObject({ status: 'unsupported', cacheStatus: 'not_applicable' });
    expect(h.provider.fetch).not.toHaveBeenCalled();
  });

  test('stale-safe evidence is frozen for this turn while refresh benefits future turns', async () => {
    const old = new Date(NOW.getTime() - (36 * 60 * 60 * 1000));
    const h = makeBroker({ initial: [stored('overview', 'overview', old)] });
    const bundle = await h.broker.resolveEvidence({ requirements: [requirement('overview')], requestId: 'request-stale' });
    expect(bundle.resolutions[0]).toMatchObject({
      status: 'satisfied_stale_safe', cacheStatus: 'stale_safe_hit',
      refresh: { outcome: 'started' },
    });
    expect(bundle.evidence[0].observation.observedAt).toBe(old.toISOString());
    await new Promise((resolve) => setImmediate(resolve));
    expect(h.provider.fetch).toHaveBeenCalledTimes(1);
  });

  test('hard zero-stale evidence awaits refresh before freezing coverage', async () => {
    const old = new Date(NOW.getTime() - (20 * 60 * 1000));
    const h = makeBroker({ initial: [stored('alerts_closures', 'old-alert', old)] });
    const bundle = await h.broker.resolveEvidence({
      requirements: [requirement('alerts_closures')], requestId: 'request-hard-refresh',
    });
    expect(h.provider.fetch).toHaveBeenCalledTimes(1);
    expect(bundle.resolutions[0]).toMatchObject({ status: 'satisfied_fresh', cacheStatus: 'refreshed' });
    expect(bundle.evidence.some((item) => item.claim.identity === 'alert-a')).toBe(true);
  });

  test('complete authoritative empty results create explicit negative evidence only when permitted', async () => {
    const h = makeBroker();
    h.provider.fetch.mockResolvedValue({
      raw: [], metadata: { observedAt: NOW.toISOString() }, providerAttempts: 1,
      completeness: {
        isComplete: true, topics: ['alerts_closures'], emptyMeans: 'proves_absent',
        scope: { entityId: 'nps:park:yose', observedAt: NOW.toISOString() },
      },
    });
    h.provider.normalize.mockReturnValue([]);
    const permitted = requirement('alerts_closures', 0, { absenceSemantics: 'proves_absent' });
    const bundle = await h.broker.resolveEvidence({ requirements: [permitted], requestId: 'request-absence' });
    expect(bundle.resolutions[0].status).toBe('satisfied_fresh');
    expect(bundle.evidence[0]).toMatchObject({
      claim: { polarity: 'negative', normalizedValue: false },
      absenceProof: { providerDeclaredComplete: true, ruleCode: 'authoritative_complete_empty_result' },
    });
  });

  test('broker owns one bounded transient retry and physical attempt accounting', async () => {
    const h = makeBroker();
    const timeout = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    h.provider.fetch.mockRejectedValueOnce(timeout).mockResolvedValueOnce({
      raw: {}, metadata: { observedAt: NOW.toISOString() }, providerAttempts: 1,
      completeness: { isComplete: true, emptyMeans: 'unknown' },
    });
    h.provider.classifyError = (error) => ({ code: 'provider_timeout', retryable: error.code === 'ETIMEDOUT' });
    const bundle = await h.broker.resolveEvidence({ requirements: [requirement('overview')], requestId: 'request-retry' });
    expect(bundle.resolutions[0].status).toBe('satisfied_fresh');
    expect(h.provider.fetch).toHaveBeenCalledTimes(2);
    expect(h.refreshEvents[0]).toMatchObject({ providerAttemptCount: 2, retryCount: 1, costStatus: 'known', costUsd: 0 });
  });

  test('a privacy-invalid candidate is dropped without contaminating a valid sibling', async () => {
    const h = makeBroker();
    const valid = { ...stored('overview'), evidenceId: undefined, logicalKey: undefined, canonicalKey: undefined, observation: undefined, retention: undefined, observedAt: NOW.toISOString() };
    const invalid = {
      ...stored('fees'), evidenceId: undefined, logicalKey: undefined, canonicalKey: undefined,
      observation: undefined, retention: undefined, observedAt: NOW.toISOString(),
      claim: { ...stored('fees').claim, userId: 'private-user' },
    };
    h.provider.normalize.mockReturnValue([valid, invalid]);
    const bundle = await h.broker.resolveEvidence({ requirements: [requirement('overview')], requestId: 'request-sibling' });
    expect(bundle.resolutions[0].status).toBe('satisfied_fresh');
    expect(h.docs.some((item) => item.topic === 'fees')).toBe(false);
    expect(h.refreshEvents[0].rejectedCandidateCounts).toEqual({ invalid: 0, privacy: 1 });
  });

  test('Yosemite A/B/C reuses profile evidence and refreshes alerts as a separate operation', async () => {
    const h = makeBroker();
    const a = await h.broker.resolveEvidence({
      requirements: [requirement('overview', 0)], requestId: 'user-a-overview',
    });
    expect(a.resolutions[0]).toMatchObject({ status: 'satisfied_fresh', cacheStatus: 'refreshed' });
    expect(h.provider.fetch).toHaveBeenCalledTimes(1);

    const b = await h.broker.resolveEvidence({
      requirements: [requirement('activities', 1)], requestId: 'user-b-activities',
    });
    expect(b.resolutions[0]).toMatchObject({ status: 'satisfied_fresh', cacheStatus: 'fresh_hit' });
    expect(h.provider.fetch).toHaveBeenCalledTimes(1);

    const c = await h.broker.resolveEvidence({
      requirements: [requirement('alerts_closures', 2)], requestId: 'user-c-alerts',
    });
    expect(c.resolutions[0]).toMatchObject({ status: 'satisfied_fresh', cacheStatus: 'refreshed' });
    expect(h.provider.fetch).toHaveBeenCalledTimes(2);
    expect(h.provider.fetch.mock.calls.map(([request]) => request.operation)).toEqual(['parks', 'alerts']);
  });

  test('CASE F: concurrent schema-mismatch activities misses coalesce to one refresh', async () => {
    const staleTaxonomy = {
      ...stored('activities', 'taxonomy-hiking'),
      provenance: {
        ...stored('activities', 'taxonomy-hiking').provenance,
        extractorVersion: 'nps-evidence-v1',
      },
    };
    // Rebuild keys after version change so logical/canonical stay consistent with content.
    const { buildEvidenceKeys: keysFn } = require('../../utils/evidenceKey');
    const rebuilt = (() => {
      const base = { ...staleTaxonomy, evidenceId: undefined, logicalKey: undefined, canonicalKey: undefined };
      const k = keysFn(base);
      return { ...base, ...k, provenance: { ...base.provenance, contentHash: k.contentHash }, isCurrent: true };
    })();
    const h = makeBroker({ initial: [rebuilt] });
    let releaseFetch;
    h.provider.fetch.mockImplementation(() => new Promise((resolve) => { releaseFetch = resolve; }));
    h.provider.normalize.mockImplementation(() => ([{
      ...stored('activities', 'named-parus'),
      evidenceId: undefined, logicalKey: undefined, canonicalKey: undefined,
      observation: undefined, retention: undefined, observedAt: NOW.toISOString(),
    }]));

    const turns = Promise.all([
      h.broker.resolveEvidence({ requirements: [requirement('activities', 0)], requestId: 'schema-miss-a' }),
      h.broker.resolveEvidence({ requirements: [requirement('activities', 1)], requestId: 'schema-miss-b' }),
    ]);
    await new Promise((r) => setImmediate(r));
    expect(h.provider.fetch).toHaveBeenCalledTimes(1);
    releaseFetch({
      raw: {}, metadata: { observedAt: NOW.toISOString() },
      completeness: { isComplete: true, emptyMeans: 'unknown' }, providerAttempts: 1,
    });
    const [a, b] = await turns;
    expect(a.resolutions[0].status).toBe('satisfied_fresh');
    expect(b.resolutions[0].status).toBe('satisfied_fresh');
    expect(h.provider.fetch).toHaveBeenCalledTimes(1);
  });

  test('twenty concurrent missing-alert turns dispatch exactly one physical NPS request', async () => {
    const h = makeBroker();
    let releaseFetch;
    h.provider.fetch.mockImplementation(() => new Promise((resolve) => { releaseFetch = resolve; }));
    const turns = Array.from({ length: 20 }, (_, index) => h.broker.resolveEvidence({
      requirements: [requirement('alerts_closures', index)], requestId: `alert-turn-${index}`,
    }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(h.provider.fetch).toHaveBeenCalledTimes(1);
    releaseFetch({
      raw: {}, metadata: { observedAt: NOW.toISOString() }, providerAttempts: 1,
      completeness: { isComplete: true, emptyMeans: 'unknown' },
    });
    const bundles = await Promise.all(turns);
    expect(bundles.every((bundle) => bundle.resolutions[0].status === 'satisfied_fresh')).toBe(true);
    expect(bundles.filter((bundle) => bundle.resolutions[0].cacheStatus === 'coalesced')).toHaveLength(19);
    expect(h.refreshEvents).toHaveLength(1);
    expect(h.refreshEvents[0]).toMatchObject({
      requirementCount: 20, coalescedWaiters: 19, waiterPeak: 20,
      providerAttemptCount: 1, outcome: 'succeeded',
    });
  });

  test('an incomplete empty result remains missing with absence_not_proven', async () => {
    const h = makeBroker();
    h.provider.fetch.mockResolvedValue({
      raw: [], metadata: { observedAt: NOW.toISOString() }, providerAttempts: 1,
      completeness: { isComplete: false, topics: ['alerts_closures'], emptyMeans: 'unknown' },
    });
    h.provider.normalize.mockReturnValue([]);
    const bundle = await h.broker.resolveEvidence({
      requirements: [requirement('alerts_closures')], requestId: 'unknown-empty',
    });
    expect(bundle.resolutions[0]).toMatchObject({ status: 'missing' });
    expect(bundle.resolutions[0].reasonCodes).toContain('absence_not_proven');
    expect(bundle.evidence).toHaveLength(0);
  });

  test('physical budget refusal occurs before lease/dispatch and remains per-requirement', async () => {
    const reserveRefreshBudget = jest.fn().mockResolvedValue({ allowed: false });
    const h = makeBroker({ reserveRefreshBudget });
    const bundle = await h.broker.resolveEvidence({
      requirements: [requirement('overview')], requestId: 'budget-denied',
    });
    expect(bundle.resolutions[0]).toMatchObject({
      status: 'missing', refresh: { outcome: 'failed', reasonCode: 'provider_budget_exhausted' },
    });
    expect(h.provider.fetch).not.toHaveBeenCalled();
    expect(reserveRefreshBudget).toHaveBeenCalledTimes(1);
  });

  test('caller cancellation freezes an explicit cancelled resolution', async () => {
    const h = makeBroker();
    h.provider.fetch.mockImplementation((_request, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { code: 'ABORT_ERR' })));
    }));
    h.provider.classifyError = (error) => ({ code: error.code === 'ABORT_ERR' ? 'provider_cancelled' : 'provider_unavailable', retryable: false });
    const controller = new AbortController();
    const pending = h.broker.resolveEvidence({
      requirements: [requirement('alerts_closures')], requestId: 'cancelled-turn', signal: controller.signal,
    });
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    const bundle = await pending;
    expect(bundle.resolutions[0]).toMatchObject({
      status: 'cancelled', cacheStatus: 'not_applicable', refresh: { outcome: 'cancelled' },
    });
  });
});

// Persistence is scoped by provider/topic, not total store size during a turn.
test('ordinary pre-generation refresh writes remain allowed alongside ephemeral coordinates', async () => {
  const { createGeocodeCoordinateEvidenceProvider } = require('../providers/geocodeCoordinateEvidenceProvider');
  const coordinateProvider = createGeocodeCoordinateEvidenceProvider({ geocodePlace: async () => ({
    lat: 37.7, lon: -119.6, name: 'Mist Trail', source: 'google',
  }) });
  const h = makeBroker({ extraProviders: [coordinateProvider] });
  const bundle = await h.broker.resolveEvidence({
    requirements: [requirement('activities')], requestId: 'mixed-turn',
  });
  const frozen = JSON.stringify(bundle);
  await h.broker.dispatchEphemeral({ requestId: 'mixed-turn', requirement: {
    requirementId: 'coordinate', topic: 'stop_coordinates', query: 'Mist Trail',
    preferredProviders: ['geocode_coordinate'],
  } });
  expect(h.docs.filter((doc) => doc.source.provider === 'nps')).toHaveLength(5);
  expect(h.docs.filter((doc) => doc.source.provider === 'geocode_coordinate'
    || doc.topic === 'stop_coordinates')).toHaveLength(0);
  expect(h.refreshEvents.find((event) => event.provider === 'nps').persistedCandidateCount).toBe(5);
  expect(h.refreshEvents.find((event) => event.provider === 'geocode_coordinate').persistedCandidateCount).toBe(0);
  expect(JSON.stringify(bundle)).toBe(frozen);
});
