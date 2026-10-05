'use strict';

/**
 * Shared candidate ingestion: what survives the boundary between
 * provider.normalize() and the evidence store.
 *
 * A missing topic freshness policy made materializeCandidate() throw, the broker
 * collapsed it into the generic `provider_response_invalid`, and every candidate
 * for ten topics was dropped — from first-party NPS as much as from web search.
 * These pin the ingestion contract itself rather than any one provider.
 *
 * Offline: injected provider, in-memory store, no network, no model.
 */

const { buildEvidenceKeys } = require('../../utils/evidenceKey');
const { createEvidenceBroker } = require('../evidenceBrokerService');

const NOW = new Date('2026-08-17T12:00:00.000Z');
const ENTITY = { entityId: 'nps:park:yose', entityType: 'national_park', displayName: 'Yosemite National Park' };

function requirementFor(topic) {
  return {
    requirementId: `req:${topic}`,
    entity: ENTITY,
    topic,
    evidenceTypes: ['fact'],
    temporalScope: { mode: 'current', requestedAt: NOW.toISOString(), validFrom: null, validThrough: null, timezone: 'UTC' },
    freshnessClass: 'daily',
    maxAgeSeconds: 86400,
    maxStaleSeconds: 86400,
    criticality: 'required',
    absenceSemantics: 'unknown',
    minimumAuthorityClass: 'official_owner',
    acceptedSourceClasses: ['official_owner'],
    preferredProviders: ['testprov'],
    allowedFallbackProviders: [],
    privacyScope: 'public',
  };
}

function candidateFor(topic, identity = `claim-${topic}`) {
  return {
    entityId: ENTITY.entityId,
    topic,
    evidenceType: 'fact',
    claim: { identity, text: identity, normalizedValue: identity, unit: null, status: null, subjectId: ENTITY.entityId, objectId: null, qualifiers: [] },
    scope: { geographicEntityIds: [ENTITY.entityId], validFrom: null, validThrough: null, audience: 'public', locale: 'en-US' },
    source: { provider: 'testprov', sourceClass: 'official_owner', sourceId: `src-${identity}`, url: null, title: null, publishedAt: null, sourceUpdatedAt: null },
    observedAt: NOW.toISOString(),
    quality: { authorityClass: 'official_owner', scopeMatch: 'exact', conflictStatus: 'none' },
    provenance: { extractionMethod: 'structured_adapter', extractorVersion: 'test-v1' },
  };
}

/** Broker over an injected provider that emits exactly the candidates given. */
function makeBroker(candidates) {
  const persisted = [];
  const refreshEvents = [];
  const provider = {
    id: 'testprov',
    supports: () => true,
    estimateCost: () => ({ costStatus: 'known', costUsd: 0 }),
    buildRequest: () => ({
      provider: 'testprov', operation: 'read', parameters: { parkCode: 'yose' },
      dedupeKey: 'testprov|read|yose',
      publicCanonicalRequest: { provider: 'testprov', operation: 'read', parkCode: 'yose' },
    }),
    fetch: async () => ({ raw: {}, metadata: { observedAt: NOW.toISOString() }, completeness: { isComplete: false, topics: [], emptyMeans: 'unknown' }, providerAttempts: 1 }),
    normalize: () => candidates,
    classifyError: () => ({ code: 'provider_unavailable', retryable: false }),
  };
  const broker = createEvidenceBroker({
    providers: [provider],
    queryEvidence: async () => [],
    persistCandidate: async ({ candidate }) => {
      const keys = buildEvidenceKeys(candidate);
      persisted.push({ ...candidate, ...keys });
      return { outcome: 'created' };
    },
    acquireLease: async ({ leaseKey, ownerId }) => ({ outcome: 'acquired', lease: { leaseKey, ownerId, fencingToken: 1 } }),
    releaseLease: async () => ({ released: true }),
    waitForRefresh: async () => ({ outcome: 'coalesced_store_update' }),
    recordRefreshEvent: async (event) => { refreshEvents.push(event?.event || event); },
    refreshHashSecret: 'ingestion-test-secret',
    now: () => NOW,
  });
  return { broker, persisted, refreshEvents };
}

describe('topics that previously discarded every candidate', () => {
  test.each(['parking', 'transit', 'trail_conditions', 'accessibility'])(
    'a %s candidate now reaches the store',
    async (topic) => {
      const { broker, persisted } = makeBroker([candidateFor(topic)]);
      await broker.resolveEvidence({ requirements: [requirementFor(topic)], requestId: `rq-${topic}` });
      expect(persisted.map((p) => p.topic)).toEqual([topic]);
    }
  );

  test('the refresh event reports a real persisted count, not a silent zero', async () => {
    const { broker, refreshEvents } = makeBroker([candidateFor('parking'), candidateFor('parking', 'claim-parking-2')]);
    await broker.resolveEvidence({ requirements: [requirementFor('parking')], requestId: 'rq-count' });
    const refresh = refreshEvents.find((e) => e?.normalizedCandidateCount > 0);
    expect(refresh.normalizedCandidateCount).toBe(2);
    expect(refresh.persistedCandidateCount).toBe(2);
  });
});

describe('rejection is per-candidate, not per-batch', () => {
  test('valid siblings survive when one candidate is malformed', async () => {
    const malformed = { ...candidateFor('parking', 'bad'), topic: 'not_a_real_topic' };
    const { broker, persisted } = makeBroker([
      candidateFor('parking', 'good-1'), malformed, candidateFor('parking', 'good-2'),
    ]);
    await broker.resolveEvidence({ requirements: [requirementFor('parking')], requestId: 'rq-mixed' });

    const identities = persisted.map((p) => p.claim.identity).sort();
    expect(identities).toEqual(['good-1', 'good-2']);
    expect(persisted.map((p) => p.topic)).not.toContain('not_a_real_topic');
  });

  test('the malformed candidate is counted and attributed to its topic', async () => {
    const malformed = { ...candidateFor('parking', 'bad'), topic: 'not_a_real_topic' };
    const { broker, refreshEvents } = makeBroker([candidateFor('parking', 'good-1'), malformed]);
    await broker.resolveEvidence({ requirements: [requirementFor('parking')], requestId: 'rq-attrib' });

    const refresh = refreshEvents.find((e) => e?.normalizedCandidateCount > 0);
    expect(refresh.normalizedCandidateCount).toBe(2);
    expect(refresh.persistedCandidateCount).toBe(1);
    expect(refresh.rejectedCandidateCounts).toEqual({ invalid: 1, privacy: 0 });
  });
});

describe('rejection diagnostics are actionable', () => {
  test('the underlying cause is preserved, not collapsed into one generic code', async () => {
    const malformed = { ...candidateFor('parking', 'bad'), topic: 'not_a_real_topic' };
    const { broker, refreshEvents } = makeBroker([malformed]);
    await broker.resolveEvidence({ requirements: [requirementFor('parking')], requestId: 'rq-diag' });

    const refresh = refreshEvents.find((e) => e?.normalizedCandidateCount > 0);
    expect(refresh.reasonCode).toBe('provider_response_invalid');
    // The detail that would have made the live failure diagnosable immediately.
    expect(refresh.invalidReasonCodes).toEqual(
      expect.arrayContaining(['unknown_evidence_freshness_topic'])
    );
  });

  test('a clean refresh reports no rejection codes at all', async () => {
    const { broker, refreshEvents } = makeBroker([candidateFor('parking')]);
    await broker.resolveEvidence({ requirements: [requirementFor('parking')], requestId: 'rq-clean' });
    const refresh = refreshEvents.find((e) => e?.normalizedCandidateCount > 0);
    expect(refresh.invalidReasonCodes).toBeUndefined();
    expect(refresh.persistedCandidateCount).toBe(1);
  });
});

describe('coverage consumes freshly persisted evidence', () => {
  test('a parking requirement stops being unsatisfied once its candidate persists', async () => {
    const store = [];
    const provider = {
      id: 'testprov',
      supports: () => true,
      estimateCost: () => ({ costStatus: 'known', costUsd: 0 }),
      buildRequest: () => ({
        provider: 'testprov', operation: 'read', parameters: { parkCode: 'yose' },
        dedupeKey: 'testprov|read|yose',
        publicCanonicalRequest: { provider: 'testprov', operation: 'read', parkCode: 'yose' },
      }),
      fetch: async () => ({ raw: {}, metadata: { observedAt: NOW.toISOString() }, completeness: { isComplete: false, topics: [], emptyMeans: 'unknown' }, providerAttempts: 1 }),
      normalize: () => [candidateFor('parking')],
      classifyError: () => ({ code: 'provider_unavailable', retryable: false }),
    };
    const broker = createEvidenceBroker({
      providers: [provider],
      // Reads reflect what has been written, so coverage sees the refresh.
      queryEvidence: async (req) => store.filter((d) => d.entityId === req.entity.entityId && d.topic === req.topic),
      persistCandidate: async ({ candidate }) => {
        const keys = buildEvidenceKeys(candidate);
        store.push({ ...candidate, ...keys, isCurrent: true, provenance: { ...candidate.provenance, contentHash: keys.contentHash } });
        return { outcome: 'created' };
      },
      acquireLease: async ({ leaseKey, ownerId }) => ({ outcome: 'acquired', lease: { leaseKey, ownerId, fencingToken: 1 } }),
      releaseLease: async () => ({ released: true }),
      waitForRefresh: async () => ({ outcome: 'coalesced_store_update' }),
      recordRefreshEvent: async () => {},
      refreshHashSecret: 'ingestion-test-secret',
      now: () => NOW,
    });

    expect(store).toHaveLength(0);
    await broker.resolveEvidence({ requirements: [requirementFor('parking')], requestId: 'rq-cov-1' });
    expect(store).toHaveLength(1);

    const second = await broker.resolveEvidence({ requirements: [requirementFor('parking')], requestId: 'rq-cov-2' });
    const resolution = second.resolutions.find((r) => r.requirementId === 'req:parking');
    expect(resolution.status).not.toBe('missing');
    expect(resolution.evidenceIds.length).toBeGreaterThan(0);
  });
});

describe('schema rejections are named, not silent', () => {
  test('a strict-mode unknown field is identified by path and field', async () => {
    const TrailieEvidence = require('../../models/TrailieEvidence');
    const { buildEvidenceKeys } = require('../../utils/evidenceKey');

    const persisted = [];
    const refreshEvents = [];
    const provider = {
      id: 'testprov',
      supports: () => true,
      estimateCost: () => ({ costStatus: 'known', costUsd: 0 }),
      buildRequest: () => ({
        provider: 'testprov', operation: 'read', parameters: { parkCode: 'yose' },
        dedupeKey: 'testprov|read|yose',
        publicCanonicalRequest: { provider: 'testprov', operation: 'read', parkCode: 'yose' },
      }),
      fetch: async () => ({ raw: {}, metadata: { observedAt: NOW.toISOString() }, completeness: { isComplete: false, topics: [], emptyMeans: 'unknown' }, providerAttempts: 1 }),
      // A field the strict quality subdocument does not declare — the exact shape
      // that silently discarded every Brave/Serper/Tavily candidate.
      normalize: () => [{
        ...candidateFor('parking'),
        quality: { ...candidateFor('parking').quality, notADeclaredField: 0.5 },
      }],
      classifyError: () => ({ code: 'provider_unavailable', retryable: false }),
    };
    const broker = createEvidenceBroker({
      providers: [provider],
      queryEvidence: async () => [],
      // Real schema validation, no DB write.
      persistCandidate: async ({ candidate }) => {
        const keys = buildEvidenceKeys(candidate);
        const doc = {
          ...candidate,
          evidenceId: keys.evidenceId, logicalKey: keys.logicalKey, canonicalKey: keys.canonicalKey,
          provenance: { ...(candidate.provenance || {}), contentHash: keys.contentHash }, isCurrent: true,
        };
        const error = new TrailieEvidence(doc).validateSync();
        if (error) throw error;
        persisted.push(doc);
        return { outcome: 'created' };
      },
      acquireLease: async ({ leaseKey, ownerId }) => ({ outcome: 'acquired', lease: { leaseKey, ownerId, fencingToken: 1 } }),
      releaseLease: async () => ({ released: true }),
      waitForRefresh: async () => ({ outcome: 'coalesced_store_update' }),
      recordRefreshEvent: async (event) => { refreshEvents.push(event?.event || event); },
      refreshHashSecret: 'ingestion-test-secret',
      now: () => NOW,
    });

    await broker.resolveEvidence({ requirements: [requirementFor('parking')], requestId: 'rq-strict' });

    expect(persisted).toHaveLength(0);
    const refresh = refreshEvents.find((e) => e?.normalizedCandidateCount > 0);
    expect(refresh.persistedCandidateCount).toBe(0);
    // Previously this list was EMPTY because ValidationError has no `.code`.
    expect(refresh.invalidReasonCodes).toEqual(expect.arrayContaining([
      'ValidationError', 'path:quality', 'strict_unknown_field:notADeclaredField',
    ]));
  });

  test('a well-formed web-shaped candidate now persists', async () => {
    const { broker, persisted } = makeBroker([{
      ...candidateFor('transit'),
      source: { provider: 'brave', sourceClass: 'reputable_web', sourceId: 's', url: 'https://www.nps.gov/yose/planyourvisit/publictransportation.htm', title: 't', publishedAt: null, sourceUpdatedAt: null },
      quality: { authorityClass: 'reputable_web', scopeMatch: 'exact', relationshipConfidence: 1, conflictStatus: 'none' },
    }]);
    await broker.resolveEvidence({ requirements: [requirementFor('transit')], requestId: 'rq-web' });
    expect(persisted).toHaveLength(1);
    expect(persisted[0].quality.relationshipConfidence).toBe(1);
  });
});
