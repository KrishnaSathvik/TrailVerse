'use strict';

const mongoose = require('mongoose');

const load = (path) => {
  try { return require(path); } catch { return null; }
};

const models = () => ({
  Entity: load('../TrailieEntity'),
  Evidence: load('../TrailieEvidence'),
  Raw: load('../TrailieEvidenceRaw'),
  Conflict: load('../TrailieEvidenceConflict'),
  Lease: load('../TrailieEvidenceRefreshLease'),
  RefreshEvent: load('../TrailieEvidenceRefreshEvent'),
});

const indexByKeys = (Model, keys) => Model.schema.indexes().find(([fields]) =>
  JSON.stringify(fields) === JSON.stringify(keys)
);

describe('WP3 evidence model registration and indexes', () => {
  test('registers the isolated evidence and refresh-telemetry collections', () => {
    const { Entity, Evidence, Raw, Conflict, Lease, RefreshEvent } = models();
    expect([Entity, Evidence, Raw, Conflict, Lease, RefreshEvent].every(Boolean)).toBe(true);
    expect(Entity.collection.collectionName).toBe('trailie_entities');
    expect(Evidence.collection.collectionName).toBe('trailie_evidence');
    expect(Raw.collection.collectionName).toBe('trailie_evidence_raw');
    expect(Conflict.collection.collectionName).toBe('trailie_evidence_conflicts');
    expect(Lease.collection.collectionName).toBe('trailie_evidence_refresh_leases');
    expect(RefreshEvent.collection.collectionName).toBe('trailie_evidence_refresh_events');
  });

  test('separates freshness indexes from legal-retention TTL deletion', () => {
    const { Evidence, Raw, Lease } = models();
    expect(indexByKeys(Evidence, { 'observation.expiresAt': 1 })?.[1]?.expireAfterSeconds).toBeUndefined();
    expect(indexByKeys(Evidence, { 'retention.deleteAfter': 1 })?.[1]?.expireAfterSeconds).toBe(0);
    expect(indexByKeys(Raw, { deleteAfter: 1 })?.[1]?.expireAfterSeconds).toBe(0);
    expect(indexByKeys(Lease, { expiresAt: 1 })?.[1]?.expireAfterSeconds).toBe(0);
  });

  test('enforces entity, evidence-version, provider, geospatial, and lease uniqueness indexes', () => {
    const { Entity, Evidence, Lease } = models();
    expect(indexByKeys(Entity, { entityId: 1 })?.[1]?.unique).toBe(true);
    expect(indexByKeys(Entity, { location: '2dsphere' })).toBeTruthy();
    expect(indexByKeys(Entity, { aliases: 1, entityType: 1 })).toBeTruthy();
    expect(indexByKeys(Evidence, { canonicalKey: 1 })?.[1]?.unique).toBe(true);
    expect(indexByKeys(Evidence, { logicalKey: 1, isCurrent: 1 })?.[1]?.unique).toBe(true);
    expect(indexByKeys(Lease, { leaseKey: 1 })?.[1]?.unique).toBe(true);
  });

  test('refresh events contain bounded physical telemetry and reject extra/raw fields', async () => {
    const { RefreshEvent } = models();
    const event = new RefreshEvent({
      refreshEventId: 'refresh:1', refreshKeyHash: 'a'.repeat(64), provider: 'nps',
      operation: 'alerts', startedAt: new Date('2026-08-09T12:00:00.000Z'),
      completedAt: new Date('2026-08-09T12:00:00.100Z'), requirementCount: 20,
      coalescedRequirements: 1, coalescedWaiters: 19, waiterPeak: 20,
      leaseOutcome: 'acquired', providerAttemptCount: 1, retryCount: 0,
      normalizedCandidateCount: 2, persistedCandidateCount: 2,
      rejectedCandidateCounts: { invalid: 0, privacy: 0 }, outcome: 'succeeded',
      reasonCode: null, latencyMs: 100, costStatus: 'known', costUsd: 0,
    });
    await expect(event.validate()).resolves.toBeUndefined();
    expect(() => new RefreshEvent({ ...event.toObject(), rawResponse: 'private' })).toThrow();
  });
});

describe('WP3 schema privacy and bounded retention', () => {
  test('accepts Maps driving_time scope.route required by WP5C coverage matching', async () => {
    const { Evidence } = models();
    const observedAt = new Date('2026-08-10T19:00:00.000Z');
    const evidence = new Evidence({
      evidenceId: 'ev:maps-route-scope',
      logicalKey: 'lek:maps-route-scope',
      canonicalKey: 'evk:maps-route-scope',
      entityId: 'nps:park:grte',
      topic: 'driving_time',
      evidenceType: 'fact',
      claim: {
        identity: 'google-maps-route:nps:park:yell:nps:park:grte:driving:2026-08-10T20:00:00.000Z',
        text: null,
        normalizedValue: {
          distanceMeters: 1000,
          durationSeconds: 4537,
          durationInTrafficSeconds: 4600,
          travelMode: 'driving',
          departureTimeBucket: '2026-08-10T20:00:00.000Z',
        },
        unit: null,
        status: 'estimated_route',
        subjectId: 'nps:park:yell',
        objectId: 'nps:park:grte',
        qualifiers: ['route_specific'],
      },
      scope: {
        geographicEntityIds: ['nps:park:yell', 'nps:park:grte'],
        validFrom: '2026-08-10T20:00:00.000Z',
        validThrough: null,
        audience: 'public',
        locale: 'en-US',
        route: {
          originEntityId: 'nps:park:yell',
          destinationEntityId: 'nps:park:grte',
          travelMode: 'driving',
          departureTimeBucket: '2026-08-10T20:00:00.000Z',
        },
      },
      source: {
        provider: 'google_maps',
        sourceClass: 'commercial_structured',
        sourceId: 'google-maps-route:nps:park:yell:nps:park:grte:driving',
        url: null,
        title: 'Google Maps route estimate',
      },
      observation: {
        observedAt,
        fetchedAt: observedAt,
        expiresAt: new Date(observedAt.getTime() + 3600_000),
        staleUntil: new Date(observedAt.getTime() + 7200_000),
        retrievalMode: 'live',
      },
      quality: {
        authorityClass: 'commercial_structured',
        freshnessStatus: 'fresh',
        scopeMatch: 'exact',
        conflictStatus: 'none',
      },
      provenance: {
        extractionMethod: 'structured_adapter',
        extractorVersion: 'maps-evidence-v1',
        contentHash: 'a'.repeat(64),
      },
      retention: {
        class: 'public_dynamic_90d',
        licenseClass: 'government_public',
        storeClaimText: true,
      },
    });
    await expect(evidence.validate()).resolves.toBeUndefined();
    expect(evidence.scope.route).toMatchObject({
      originEntityId: 'nps:park:yell',
      destinationEntityId: 'nps:park:grte',
      travelMode: 'driving',
      departureTimeBucket: '2026-08-10T20:00:00.000Z',
    });
  });

  test('rejects private fields even through direct canonical model construction', () => {
    const { Evidence } = models();
    expect(() => new Evidence({ userId: new mongoose.Types.ObjectId() })).toThrow();
  });

  test('raw staging defaults to seven days and rejects retention beyond thirty days', async () => {
    const { Raw } = models();
    const fetchedAt = new Date('2026-08-09T12:00:00.000Z');
    const raw = new Raw({
      rawId: 'raw:1',
      privacyScope: 'public',
      provider: 'nps',
      sourceUrl: 'https://www.nps.gov/yose/alerts.htm',
      rawPayloadHash: 'a'.repeat(64),
      fetchedAt,
    });
    await raw.validate();
    expect(raw.deleteAfter.getTime() - fetchedAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000);

    raw.deleteAfter = new Date(fetchedAt.getTime() + 31 * 24 * 60 * 60 * 1000);
    await expect(raw.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({ deleteAfter: expect.anything() }),
    });
  });

  test('raw staging rejects private metadata and oversized page excerpts', async () => {
    const { Raw } = models();
    const privateRaw = new Raw({
      rawId: 'raw:private', privacyScope: 'public', provider: 'web',
      sourceUrl: 'https://example.com', rawPayloadHash: 'b'.repeat(64),
      metadata: { sessionId: 'private-session' },
    });
    await expect(privateRaw.validate()).rejects.toMatchObject({ code: 'shared_evidence_private_data' });

    const oversized = new Raw({
      rawId: 'raw:oversized', privacyScope: 'public', provider: 'web',
      sourceUrl: 'https://example.com', rawPayloadHash: 'c'.repeat(64),
      excerpt: 'x'.repeat(4001),
    });
    await expect(oversized.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({ excerpt: expect.anything() }),
    });
  });

  test('conflicts require two distinct evidence records and a valid winning link', async () => {
    const { Conflict } = models();
    const invalid = new Conflict({
      conflictId: 'conflict:1', entityId: 'nps:park:yose', topic: 'roads',
      scopeHash: 'scope', evidenceIds: ['ev:a', 'ev:a'], status: 'open',
    });
    await expect(invalid.validate()).rejects.toThrow(/distinct evidence/i);

    const resolved = new Conflict({
      conflictId: 'conflict:2', entityId: 'nps:park:yose', topic: 'roads',
      scopeHash: 'scope', evidenceIds: ['ev:a', 'ev:b'], status: 'deterministically_resolved',
      resolution: { winningEvidenceId: 'ev:c', ruleCode: 'authority', resolvedAt: new Date() },
    });
    await expect(resolved.validate()).rejects.toThrow(/winning evidence/i);
  });
});
