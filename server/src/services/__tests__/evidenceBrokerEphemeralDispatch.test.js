'use strict';

/**
 * Phase 9C.2A2 — generic attempt-scoped ephemeral execution primitive.
 *
 * `broker.dispatchEphemeral(...)` reuses the provider map and the request
 * execution machinery (supports/buildRequest, dedupeKey + semantic
 * fingerprint collision guard, in-flight coalescing, retry/classifyError,
 * AbortSignal, provider-attempt counting, latency, estimateCost, refresh
 * event telemetry, reserveRefreshBudget) and deliberately SKIPS every
 * persistent-evidence stage: Mongo leases, waitForRefresh,
 * materializeCandidate, persistCandidate, evidence keys, store re-query,
 * coverage evaluation and EvidenceBundle construction.
 *
 * Ownership metadata is opaque caller context, returned untouched.
 */

jest.mock('../evidenceStoreService', () => ({
  queryEvidenceForRequirement: jest.fn(async () => { throw new Error('store query must not run'); }),
  upsertEvidenceVersion: jest.fn(async () => { throw new Error('store persist must not run'); }),
}));
jest.mock('../evidenceCoverageEvaluator', () => {
  const actual = jest.requireActual('../evidenceCoverageEvaluator');
  return { ...actual, evaluateRequirementCoverage: jest.fn(actual.evaluateRequirementCoverage) };
});
jest.mock('../../utils/evidenceBundle', () => {
  const actual = jest.requireActual('../../utils/evidenceBundle');
  return { ...actual, buildEvidenceBundle: jest.fn(actual.buildEvidenceBundle) };
});

const evidenceStore = require('../evidenceStoreService');
const { evaluateRequirementCoverage } = require('../evidenceCoverageEvaluator');
const { buildEvidenceBundle } = require('../../utils/evidenceBundle');
const brokerModule = require('../evidenceBrokerService');
const { createEvidenceBroker } = brokerModule;
const { semanticFingerprint } = require('../evidenceRefreshCoordinator');
const { createEvidenceBrokerRuntime, resetEvidenceBrokerRuntimeForTests } = require('../evidenceBrokerRuntime');

const NOW = new Date('2026-09-16T12:00:00.000Z');
const SECRET = 'ephemeral-test-secret';

function requirement(overrides = {}) {
  return {
    requirementId: 'req:turn-1:0:abc',
    topic: 'stop_coordinates',
    query: 'Grand Prismatic Spring, Yellowstone National Park',
    entity: { entityId: null },
    evidenceTypes: ['fact'],
    preferredProviders: ['fake_geo'],
    allowedFallbackProviders: [],
    ...overrides,
  };
}

/** Minimal seven-member provider with controllable fetch. */
function fakeProvider({ id = 'fake_geo', fetchImpl, normalizeImpl, classify, cost } = {}) {
  const calls = { supports: 0, buildRequest: 0, fetch: 0, normalize: 0 };
  return {
    calls,
    provider: {
      id,
      supports(req) { calls.supports += 1; return req?.topic === 'stop_coordinates' && typeof req.query === 'string'; },
      estimateCost() { return cost || { costStatus: 'unknown', costUsd: null, providerAttemptLimit: 1 }; },
      buildRequest(req) {
        calls.buildRequest += 1;
        const query = req.query.trim();
        return {
          provider: id, operation: 'geocode_place', parameters: { query },
          dedupeKey: `${id}|geocode_place|${query.toLowerCase()}`,
          publicCanonicalRequest: { provider: id, operation: 'geocode_place', query },
        };
      },
      async fetch(request, { signal } = {}) {
        calls.fetch += 1;
        if (signal?.aborted) throw Object.assign(new Error('cancelled'), { code: 'ABORT_ERR' });
        if (fetchImpl) return fetchImpl(request, { signal });
        return {
          raw: { lat: 44.525, lon: -110.838, name: 'Grand Prismatic Spring', source: 'google' },
          metadata: { observedAt: NOW.toISOString() },
          completeness: { isComplete: true, topics: ['stop_coordinates'], emptyMeans: 'unresolved' },
          providerAttempts: 1,
        };
      },
      normalize(raw, request, metadata = {}) {
        calls.normalize += 1;
        if (normalizeImpl) return normalizeImpl(raw, request, metadata);
        if (!raw) return [];
        return [{
          entityId: null, topic: 'stop_coordinates', evidenceType: 'fact',
          claim: { identity: `geo:${request.parameters.query.toLowerCase()}`, normalizedValue: { latitude: raw.lat, longitude: raw.lon, providerSource: raw.source } },
          scope: { audience: 'public', locale: 'en-US' },
          source: { provider: id, sourceClass: 'external_geocoder', sourceId: raw.source },
          observedAt: metadata.observedAt,
        }];
      },
      classifyError(error) {
        if (classify) return classify(error);
        if (error?.code === 'ABORT_ERR') return { code: 'provider_cancelled', retryable: false };
        if (error?.code === 'ETIMEDOUT') return { code: 'provider_timeout', retryable: true };
        return { code: 'provider_invalid_response', retryable: false };
      },
    },
  };
}

function harness({ providers, reserveRefreshBudget } = {}) {
  const leaseCalls = { acquire: 0, release: 0, wait: 0 };
  const persistCalls = [];
  const queryCalls = [];
  const refreshEvents = [];
  const broker = createEvidenceBroker({
    providers,
    queryEvidence: async (req) => { queryCalls.push(req); return []; },
    persistCandidate: async (args) => { persistCalls.push(args); return { outcome: 'created' }; },
    acquireLease: async ({ leaseKey, ownerId }) => { leaseCalls.acquire += 1; return { outcome: 'acquired', lease: { leaseKey, ownerId, fencingToken: 1 } }; },
    releaseLease: async () => { leaseCalls.release += 1; return { released: true }; },
    waitForRefresh: async () => { leaseCalls.wait += 1; return { outcome: 'coalesced_store_update' }; },
    recordRefreshEvent: async (event) => { refreshEvents.push(event); },
    refreshHashSecret: SECRET,
    now: () => NOW,
    ...(reserveRefreshBudget ? { reserveRefreshBudget } : {}),
  });
  return { broker, leaseCalls, persistCalls, queryCalls, refreshEvents };
}

const STORAGE_KEYS = ['evidenceId', 'logicalKey', 'canonicalKey', 'supersedesEvidenceId', 'retention', 'isCurrent'];

beforeEach(() => {
  evaluateRequirementCoverage.mockClear();
  buildEvidenceBundle.mockClear();
  evidenceStore.queryEvidenceForRequirement.mockClear();
  evidenceStore.upsertEvidenceVersion.mockClear();
});

// ---------------------------------------------------------------------------

describe('(1)(5)(11)(16) a successful ephemeral dispatch', () => {
  test('returns the provider\'s normalized candidates through the ordinary supports/buildRequest/fetch/normalize flow', async () => {
    const { provider, calls } = fakeProvider();
    const { broker } = harness({ providers: [provider] });
    const result = await broker.dispatchEphemeral({ requirement: requirement(), requestId: 'turn-1' });

    expect(result.status).toBe('fulfilled');
    expect(result.ephemeral).toBe(true);
    expect(result.provider).toBe('fake_geo');
    expect(result.operation).toBe('geocode_place');
    expect(result.dedupeKey).toBe('fake_geo|geocode_place|grand prismatic spring, yellowstone national park');
    expect(result.normalizedCandidates).toHaveLength(1);
    expect(result.normalizedCandidates[0].claim.normalizedValue).toEqual({ latitude: 44.525, longitude: -110.838, providerSource: 'google' });
    expect(calls).toEqual({ supports: 1, buildRequest: 1, fetch: 1, normalize: 1 });
  });

  test('(11) observedAt, provider metadata and completeness survive', async () => {
    const { provider } = fakeProvider();
    const { broker } = harness({ providers: [provider] });
    const result = await broker.dispatchEphemeral({ requirement: requirement(), requestId: 'turn-1' });
    expect(result.observedAt).toBe(NOW.toISOString());
    expect(result.metadata).toEqual({ observedAt: NOW.toISOString() });
    expect(result.completeness).toEqual({ isComplete: true, topics: ['stop_coordinates'], emptyMeans: 'unresolved' });
  });

  test('(11) an empty normalization is reported as no_result, never as failure and never fabricated', async () => {
    const { provider } = fakeProvider({ fetchImpl: async () => ({ raw: null, metadata: { observedAt: NOW.toISOString() }, completeness: { isComplete: true, topics: ['stop_coordinates'], emptyMeans: 'unresolved' }, providerAttempts: 1 }) });
    const { broker } = harness({ providers: [provider] });
    const result = await broker.dispatchEphemeral({ requirement: requirement(), requestId: 'turn-1' });
    expect(result.status).toBe('no_result');
    expect(result.normalizedCandidates).toEqual([]);
    expect(result.reasonCode).toBeNull();
    expect(result.completeness.emptyMeans).toBe('unresolved');
  });

  test('(16) the result and its candidates carry no storage identity or version fields', async () => {
    const { provider } = fakeProvider();
    const { broker } = harness({ providers: [provider] });
    const result = await broker.dispatchEphemeral({ requirement: requirement(), requestId: 'turn-1' });
    for (const key of STORAGE_KEYS) {
      expect(result).not.toHaveProperty(key);
      expect(result.normalizedCandidates[0]).not.toHaveProperty(key);
    }
    expect(result).not.toHaveProperty('evidence');
    expect(result).not.toHaveProperty('resolutions');
    expect(result.semanticFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('(2)(3)(4) persistent stages are never touched', () => {
  test('store query / persist / materialize / leases / waitForRefresh / coverage / bundle are all untouched', async () => {
    const materializeSpy = jest.spyOn(brokerModule, 'materializeCandidate');
    const { provider } = fakeProvider();
    const { broker, leaseCalls, persistCalls, queryCalls } = harness({ providers: [provider] });
    await broker.dispatchEphemeral({ requirement: requirement(), requestId: 'turn-1' });

    expect(queryCalls).toEqual([]);
    expect(persistCalls).toEqual([]);
    expect(evidenceStore.queryEvidenceForRequirement).not.toHaveBeenCalled();
    expect(evidenceStore.upsertEvidenceVersion).not.toHaveBeenCalled();
    expect(materializeSpy).not.toHaveBeenCalled();
    expect(leaseCalls).toEqual({ acquire: 0, release: 0, wait: 0 });
    expect(evaluateRequirementCoverage).not.toHaveBeenCalled();
    expect(buildEvidenceBundle).not.toHaveBeenCalled();
    materializeSpy.mockRestore();
  });

  test('a requirement with no supporting provider is reported unsupported with zero fetches and zero persistence', async () => {
    const { provider, calls } = fakeProvider();
    const { broker, persistCalls } = harness({ providers: [provider] });
    const result = await broker.dispatchEphemeral({ requirement: requirement({ topic: 'driving_time', query: undefined }), requestId: 'turn-1' });
    expect(result.status).toBe('unsupported');
    expect(result.reasonCode).toBe('provider_not_configured');
    expect(result.normalizedCandidates).toEqual([]);
    expect(calls.fetch).toBe(0);
    expect(persistCalls).toEqual([]);
  });
});

describe('(6)(12) retry and error classification match persistent execution', () => {
  test('a retryable classified error is retried exactly once and the second success is returned', async () => {
    let n = 0;
    const { provider, calls } = fakeProvider({
      fetchImpl: async () => {
        n += 1;
        if (n === 1) throw Object.assign(new Error('slow'), { code: 'ETIMEDOUT' });
        return { raw: { lat: 1, lon: 2, name: 'x', source: 'google' }, metadata: { observedAt: NOW.toISOString() }, completeness: { isComplete: true, topics: ['stop_coordinates'], emptyMeans: 'unresolved' }, providerAttempts: 1 };
      },
    });
    const { broker, refreshEvents } = harness({ providers: [provider] });
    const result = await broker.dispatchEphemeral({ requirement: requirement(), requestId: 'turn-1' });
    expect(result.status).toBe('fulfilled');
    expect(calls.fetch).toBe(2);
    expect(result.retryCount).toBe(1);
    expect(result.providerAttemptCount).toBe(2);
    expect(refreshEvents[0].retryCount).toBe(1);
    expect(refreshEvents[0].providerAttemptCount).toBe(2);
  });

  test('(12) a non-retryable classified failure is bounded, returned, and persists nothing', async () => {
    const { provider, calls } = fakeProvider({ fetchImpl: async () => { throw Object.assign(new Error('bad key'), { code: 'maps_not_configured', response: { data: 'SECRET PAYLOAD' } }); }, classify: () => ({ code: 'provider_not_configured', retryable: false }) });
    const { broker, persistCalls, refreshEvents } = harness({ providers: [provider] });
    const result = await broker.dispatchEphemeral({ requirement: requirement(), requestId: 'turn-1' });
    expect(result.status).toBe('failed');
    expect(result.reasonCode).toBe('provider_not_configured');
    expect(result.normalizedCandidates).toEqual([]);
    expect(calls.fetch).toBe(1);
    expect(persistCalls).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('SECRET PAYLOAD');
    expect(refreshEvents[0].outcome).toBe('failed');
    expect(refreshEvents[0].reasonCode).toBe('provider_not_configured');
  });

  test('a provider whose normalize does not return an array is a bounded provider_response_invalid failure', async () => {
    const { provider } = fakeProvider({ normalizeImpl: () => ({ not: 'an array' }) });
    const { broker } = harness({ providers: [provider] });
    const result = await broker.dispatchEphemeral({ requirement: requirement(), requestId: 'turn-1' });
    expect(result.status).toBe('failed');
    expect(result.reasonCode).toBe('provider_response_invalid');
  });
});

describe('(7)(8)(9) dedupe, coalescing and ownership', () => {
  test('(7) the semantic-fingerprint collision guard still fires for one dedupeKey describing two physical requests', async () => {
    const slow = fakeProvider({ id: 'fake_geo', fetchImpl: () => new Promise((resolve) => setTimeout(() => resolve({ raw: null, metadata: {}, completeness: {}, providerAttempts: 1 }), 30)) });
    // Same dedupeKey, different parameters → different semantic fingerprint.
    const original = slow.provider.buildRequest;
    let variant = 0;
    slow.provider.buildRequest = (req) => { const r = original(req); variant += 1; return { ...r, parameters: { query: `${r.parameters.query}#${variant}` } }; };
    const { broker } = harness({ providers: [slow.provider] });
    const first = broker.dispatchEphemeral({ requirement: requirement(), requestId: 'turn-1' });
    const second = broker.dispatchEphemeral({ requirement: requirement(), requestId: 'turn-1' });
    const [a, b] = await Promise.all([first, second]);
    expect(a.status).toBe('no_result');
    expect(b.status).toBe('failed');
    expect(b.reasonCode).toBe('evidence_refresh_dedupe_collision');
  });

  test('(8)(9) identical concurrent requests coalesce to one fetch and each caller keeps its own opaque ownership', async () => {
    const { provider, calls } = fakeProvider({ fetchImpl: () => new Promise((resolve) => setTimeout(() => resolve({ raw: { lat: 1, lon: 2, source: 'google' }, metadata: { observedAt: NOW.toISOString() }, completeness: { isComplete: true, topics: ['stop_coordinates'], emptyMeans: 'unresolved' }, providerAttempts: 1 }), 20)) });
    const { broker, refreshEvents } = harness({ providers: [provider] });
    const ownA = { attempt: 1, dispatchIndex: 3, candidateFingerprint: 'fp-A', extra: { nested: true } };
    const ownB = { attempt: 2, dispatchIndex: 5, candidateFingerprint: 'fp-B' };
    const [a, b] = await Promise.all([
      broker.dispatchEphemeral({ requirement: requirement(), requestId: 'turn-1', ownership: ownA }),
      broker.dispatchEphemeral({ requirement: requirement(), requestId: 'turn-1', ownership: ownB }),
    ]);
    expect(calls.fetch).toBe(1);
    expect(a.status).toBe('fulfilled');
    expect(b.status).toBe('fulfilled');
    expect(a.ownership).toEqual(ownA);
    expect(b.ownership).toEqual(ownB);
    expect(a.ownership).not.toBe(b.ownership);
    expect([a.coalesced, b.coalesced].sort()).toEqual([false, true]);
    // Candidates are per-caller copies — one caller mutating cannot leak into the other.
    a.normalizedCandidates[0].claim.normalizedValue.latitude = 999;
    expect(b.normalizedCandidates[0].claim.normalizedValue.latitude).toBe(1);
    expect(refreshEvents).toHaveLength(1);
    expect(refreshEvents[0].waiterPeak).toBe(2);
  });

  test('ownership is returned untouched even when the dispatch fails or is unsupported', async () => {
    const { provider } = fakeProvider({ fetchImpl: async () => { throw Object.assign(new Error('x'), { code: 'nope' }); } });
    const { broker } = harness({ providers: [provider] });
    const own = { attempt: 4, dispatchIndex: 9, candidateFingerprint: 'fp' };
    const failed = await broker.dispatchEphemeral({ requirement: requirement(), requestId: 'turn-1', ownership: own });
    expect(failed.ownership).toEqual(own);
    const unsupported = await broker.dispatchEphemeral({ requirement: requirement({ topic: 'nothing_supports_this' }), requestId: 'turn-1', ownership: own });
    expect(unsupported.ownership).toEqual(own);
  });
});

describe('(10) cancellation', () => {
  test('a caller abort reaches provider.fetch(signal), the dispatch resolves cancelled, and nothing persists', async () => {
    let providerSawAbort = false;
    const { provider } = fakeProvider({
      fetchImpl: (_request, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => { providerSawAbort = true; reject(Object.assign(new Error('aborted'), { code: 'ABORT_ERR' })); }, { once: true });
      }),
    });
    const { broker, persistCalls, refreshEvents } = harness({ providers: [provider] });
    const controller = new AbortController();
    const pending = broker.dispatchEphemeral({ requirement: requirement(), requestId: 'turn-1', signal: controller.signal, ownership: { attempt: 1 } });
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    const result = await pending;
    expect(result.status).toBe('cancelled');
    expect(result.reasonCode).toMatch(/cancelled/);
    expect(result.normalizedCandidates).toEqual([]);
    expect(result.ownership).toEqual({ attempt: 1 });
    expect(providerSawAbort).toBe(true);
    expect(persistCalls).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(refreshEvents[0].outcome).toBe('cancelled');
  });

  test('an already-aborted signal never reaches the provider', async () => {
    const { provider, calls } = fakeProvider();
    const { broker } = harness({ providers: [provider] });
    const controller = new AbortController();
    controller.abort();
    const result = await broker.dispatchEphemeral({ requirement: requirement(), requestId: 'turn-1', signal: controller.signal });
    expect(result.status).toBe('cancelled');
    expect(calls.fetch).toBe(0);
  });
});

describe('(13)(14)(15) accounting and telemetry hooks', () => {
  test('(13) reserveRefreshBudget is consulted before dispatch and a refusal blocks the fetch', async () => {
    const reserve = jest.fn(async () => ({ allowed: true }));
    const { provider, calls } = fakeProvider();
    const { broker } = harness({ providers: [provider], reserveRefreshBudget: reserve });
    await broker.dispatchEphemeral({ requirement: requirement(), requestId: 'turn-1' });
    expect(reserve).toHaveBeenCalled();
    expect(reserve.mock.calls[0][0]).toMatchObject({ phase: 'before_dispatch', request: expect.objectContaining({ provider: 'fake_geo' }) });
    expect(calls.fetch).toBe(1);

    const deny = jest.fn(async () => ({ allowed: false }));
    const blocked = fakeProvider();
    const { broker: b2, persistCalls } = harness({ providers: [blocked.provider], reserveRefreshBudget: deny });
    const result = await b2.dispatchEphemeral({ requirement: requirement(), requestId: 'turn-1' });
    expect(result.status).toBe('failed');
    expect(result.reasonCode).toBe('provider_budget_exhausted');
    expect(blocked.calls.fetch).toBe(0);
    expect(persistCalls).toEqual([]);
  });

  test('(14)(15) cost, attempt count, latency and a refresh event with persistedCandidateCount 0 are populated', async () => {
    const { provider } = fakeProvider({ cost: { costStatus: 'known', costUsd: 0.005, providerAttemptLimit: 1 } });
    const { broker, refreshEvents } = harness({ providers: [provider] });
    const result = await broker.dispatchEphemeral({ requirement: requirement(), requestId: 'turn-1' });
    expect(result.cost).toEqual({ costStatus: 'known', costUsd: 0.005 });
    expect(result.providerAttemptCount).toBe(1);
    expect(result.retryCount).toBe(0);
    expect(Number.isFinite(result.latencyMs)).toBe(true);

    expect(refreshEvents).toHaveLength(1);
    const event = refreshEvents[0];
    expect(event).toMatchObject({
      provider: 'fake_geo', operation: 'geocode_place', outcome: 'succeeded',
      providerAttemptCount: 1, retryCount: 0, normalizedCandidateCount: 1, persistedCandidateCount: 0,
      costStatus: 'known', costUsd: 0.005, requirementCount: 1,
    });
    expect(event.refreshEventId).toMatch(/^ephemeral:/);
    expect(event.refreshKeyHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('(17)(18) the persistent path and the frozen bundle are untouched', () => {
  test('(18) a frozen pre-generation bundle is byte-identical after ephemeral dispatch', async () => {
    const { buildEvidenceBundle: realBuild } = jest.requireActual('../../utils/evidenceBundle');
    const frozen = realBuild({ requestId: 'turn-1', resolutions: [], candidates: [] });
    const before = JSON.stringify(frozen);
    const { provider } = fakeProvider();
    const { broker } = harness({ providers: [provider] });
    await broker.dispatchEphemeral({ requirement: requirement(), requestId: 'turn-1' });
    expect(JSON.stringify(frozen)).toBe(before);
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  test('(17) resolveEvidence is still exported and still persists through the ordinary path', async () => {
    const { provider } = fakeProvider();
    const { broker } = harness({ providers: [provider] });
    expect(typeof broker.resolveEvidence).toBe('function');
    expect(typeof broker.dispatchEphemeral).toBe('function');
  });

  test('the runtime singleton exposes dispatchEphemeral alongside resolveEvidence', () => {
    resetEvidenceBrokerRuntimeForTests();
    const runtime = createEvidenceBrokerRuntime();
    expect(typeof runtime.resolveEvidence).toBe('function');
    expect(typeof runtime.dispatchEphemeral).toBe('function');
    resetEvidenceBrokerRuntimeForTests();
  });
});

describe('input validation', () => {
  test('requires a requirement with requirementId and a requestId', async () => {
    const { provider } = fakeProvider();
    const { broker } = harness({ providers: [provider] });
    await expect(broker.dispatchEphemeral({ requirement: { topic: 'x' }, requestId: 'turn-1' })).rejects.toThrow(/requirementId/);
    await expect(broker.dispatchEphemeral({ requirement: requirement() })).rejects.toThrow(/requestId/);
  });
});

describe('ephemeral lifecycle boundaries', () => {
  function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
  }

  test('one coalesced caller can cancel while the other receives its own artifact', async () => {
    const started = deferred();
    const finish = deferred();
    let sharedSignal;
    const { provider, calls } = fakeProvider({ fetchImpl: (_request, { signal }) => {
      sharedSignal = signal;
      started.resolve();
      return finish.promise;
    } });
    const { broker } = harness({ providers: [provider] });
    const controller = new AbortController();
    const a = broker.dispatchEphemeral({ requirement: requirement(), requestId: 'a', signal: controller.signal, ownership: { attempt: 1 } });
    const b = broker.dispatchEphemeral({ requirement: requirement(), requestId: 'b', ownership: { attempt: 2 } });
    await started.promise;
    controller.abort();
    expect(await a).toMatchObject({ status: 'cancelled', ownership: { attempt: 1 }, normalizedCandidates: [] });
    expect(sharedSignal.aborted).toBe(false);
    finish.resolve({ raw: { lat: 1, lon: 2 }, metadata: {} });
    expect(await b).toMatchObject({ status: 'fulfilled', ownership: { attempt: 2 } });
    expect(calls.fetch).toBe(1);
  });

  test('late success from a provider ignoring abort is discarded; a fresh caller does not join aborted work', async () => {
    const started = deferred();
    const finish = deferred();
    const eventRecorded = deferred();
    let count = 0;
    const { provider } = fakeProvider({ fetchImpl: () => {
      if (++count === 1) { started.resolve(); return finish.promise; }
      return { raw: null };
    } });
    const events = [];
    const broker = createEvidenceBroker({
      providers: [provider], acquireLease: jest.fn(), releaseLease: jest.fn(),
      recordRefreshEvent: async (event) => {
        events.push(event);
        if (event.outcome === 'cancelled') eventRecorded.resolve();
      },
    });
    const controller = new AbortController();
    const pending = broker.dispatchEphemeral({ requirement: requirement(), requestId: 'a', signal: controller.signal });
    await started.promise;
    controller.abort();
    expect((await pending).status).toBe('cancelled');
    expect((await broker.dispatchEphemeral({ requirement: requirement(), requestId: 'b' })).status).toBe('no_result');
    finish.resolve({ raw: { lat: 1, lon: 2 } });
    await eventRecorded.promise;
    expect(events.find((event) => event.outcome === 'cancelled')).toMatchObject({
      persistedCandidateCount: 0, normalizedCandidateCount: 0, providerAttemptCount: 1,
    });
  });

  test('abort during budget reservation dispatches nothing', async () => {
    const entered = deferred();
    const reserved = deferred();
    const { provider, calls } = fakeProvider();
    const { broker } = harness({ providers: [provider], reserveRefreshBudget: () => {
      entered.resolve();
      return reserved.promise;
    } });
    const controller = new AbortController();
    const pending = broker.dispatchEphemeral({ requirement: requirement(), requestId: 'a', signal: controller.signal });
    await entered.promise;
    controller.abort();
    reserved.resolve({ allowed: true });
    expect((await pending).status).toBe('cancelled');
    expect(calls.fetch).toBe(0);
  });

  test('settled results are not cached and real event schema accepts storage-free telemetry', async () => {
    const Event = require('../../models/TrailieEvidenceRefreshEvent');
    const { provider, calls } = fakeProvider();
    const { broker, refreshEvents } = harness({ providers: [provider] });
    await broker.dispatchEphemeral({ requirement: requirement(), requestId: 'a' });
    await broker.dispatchEphemeral({ requirement: requirement(), requestId: 'b' });
    expect(calls.fetch).toBe(2);
    for (const event of refreshEvents) {
      expect(event.leaseOutcome).toBe('not_applicable');
      await expect(new Event(event).validate()).resolves.toBeUndefined();
    }
  });

  test('storage fields supplied by an adapter are removed without changing source authority', async () => {
    const { provider } = fakeProvider({ normalizeImpl: () => [{
      evidenceId: 'bad', logicalKey: 'bad', canonicalKey: 'bad', retention: {}, isCurrent: true,
      source: { provider: 'fake_geo', sourceClass: 'external_geocoder' },
      claim: { normalizedValue: { latitude: 1, longitude: 2 } },
    }] });
    const { broker } = harness({ providers: [provider] });
    const result = await broker.dispatchEphemeral({ requirement: requirement(), requestId: 'a' });
    expect(result.normalizedCandidates).toEqual([{
      source: { provider: 'fake_geo', sourceClass: 'external_geocoder' },
      claim: { normalizedValue: { latitude: 1, longitude: 2 } },
    }]);
  });

  test('retry reserves again and preserves provider-reported physical attempt counts', async () => {
    let count = 0;
    const reserve = jest.fn(async () => ({ allowed: true }));
    const { provider } = fakeProvider({ fetchImpl: async () => {
      if (++count === 1) throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT', providerAttempts: 3 });
      return { raw: null, providerAttempts: 2 };
    } });
    const { broker } = harness({ providers: [provider], reserveRefreshBudget: reserve });
    const result = await broker.dispatchEphemeral({ requirement: requirement(), requestId: 'a' });
    expect(result).toMatchObject({ status: 'no_result', providerAttemptCount: 5, retryCount: 1 });
    expect(reserve.mock.calls.map(([call]) => call.attempt)).toEqual([0, 1]);
  });
});

test('persistent and ephemeral operations never coalesce into each other', async () => {
  const { createEvidenceRefreshCoordinator } = require('../evidenceRefreshCoordinator');
  let finishPersistent;
  let finishEphemeral;
  const acquireLease = jest.fn(async () => ({ outcome: 'acquired', lease: { ownerId: 'a', fencingToken: 1 } }));
  const releaseLease = jest.fn(async () => {});
  const coordinator = createEvidenceRefreshCoordinator({
    acquireLease, releaseLease, waitForRefresh: jest.fn(),
    executeRefresh: () => new Promise((resolve) => { finishPersistent = resolve; }),
    executeEphemeral: () => new Promise((resolve) => { finishEphemeral = resolve; }),
  });
  const { provider } = fakeProvider();
  const request = provider.buildRequest(requirement());
  const persistent = coordinator.run({ request, ownerId: 'a' });
  const ephemeral = coordinator.run({ request, ownerId: 'b', ephemeral: true });
  await Promise.resolve();
  finishPersistent({ persistedCandidateCount: 1 });
  finishEphemeral({ normalizedCandidates: [] });
  expect(await persistent).toMatchObject({ coalesced: false, persistedCandidateCount: 1 });
  expect(await ephemeral).toMatchObject({ coalesced: false, normalizedCandidates: [] });
  expect(acquireLease).toHaveBeenCalledTimes(1);
  expect(releaseLease).toHaveBeenCalledTimes(1);
});

test('normalization failures use provider classification without returning raw errors', async () => {
  const { provider } = fakeProvider({
    normalizeImpl: () => { throw Object.assign(new Error('private payload'), { code: 'RAW_ERROR' }); },
    classify: () => ({ code: 'provider_response_invalid', retryable: false }),
  });
  const { broker } = harness({ providers: [provider] });
  const result = await broker.dispatchEphemeral({ requirement: requirement(), requestId: 'a' });
  expect(result).toMatchObject({ status: 'failed', reasonCode: 'provider_response_invalid' });
  expect(JSON.stringify(result)).not.toMatch(/private payload|RAW_ERROR/);
});
