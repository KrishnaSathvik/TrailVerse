'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildEvidenceKeys } = require('../../utils/evidenceKey');
const { createEvidenceBroker, publicRefreshHash } = require('../../services/evidenceBrokerService');
const {
  EVIDENCE_REFRESH_HASH_SECRET_ENV,
  EVIDENCE_REFRESH_HASH_SECRET_MISSING_CODE,
  assessTrailieEvidenceRefreshReadiness,
  assertTrailieEvidenceRefreshConfigured,
  ensureLocalTrailieEvidenceRefreshSecret,
  resolveEvidenceRefreshHashSecret,
} = require('../trailieEvidenceRefreshSecret');

const NOW = new Date('2026-09-17T18:00:00.000Z');
const PUBLIC_REQUEST = {
  provider: 'nps',
  operation: 'parks',
  publicCanonicalRequest: { provider: 'nps', operation: 'parks', parkCode: 'yose' },
};

function requirement() {
  return {
    requirementId: 'req:broker:0:overview',
    entity: { entityId: 'nps:park:yose', entityType: 'national_park', displayName: 'Yosemite National Park' },
    topic: 'overview',
    evidenceTypes: ['description'],
    temporalScope: { mode: 'current', requestedAt: NOW.toISOString(), validFrom: null, validThrough: null, timezone: 'UTC' },
    freshnessClass: 'daily',
    maxAgeSeconds: 86400,
    maxStaleSeconds: 86400,
    criticality: 'required',
    absenceSemantics: 'unknown',
    minimumAuthorityClass: 'official_owner',
    acceptedSourceClasses: ['official_owner'],
    preferredProviders: ['nps'],
    allowedFallbackProviders: [],
    privacyScope: 'public',
  };
}

function stored(observedAt = NOW) {
  const candidate = {
    schemaVersion: 1,
    privacyScope: 'public',
    entityId: 'nps:park:yose',
    topic: 'overview',
    evidenceType: 'description',
    claim: {
      identity: 'overview',
      text: 'overview',
      normalizedValue: 'overview',
      unit: null,
      status: null,
      subjectId: 'nps:park:yose',
      objectId: null,
      qualifiers: [],
    },
    scope: {
      geographicEntityIds: ['nps:park:yose'],
      validFrom: null,
      validThrough: null,
      audience: 'public',
      locale: 'en-US',
    },
    source: {
      provider: 'nps',
      sourceClass: 'official_owner',
      sourceId: 'nps-overview',
      url: null,
      title: null,
      publishedAt: null,
      sourceUpdatedAt: null,
    },
    observation: {
      observedAt,
      fetchedAt: observedAt,
      expiresAt: new Date(observedAt.getTime() + 86400000),
      staleUntil: new Date(observedAt.getTime() + 172800000),
      retrievalMode: 'live',
    },
    quality: {
      authorityClass: 'official_owner',
      freshnessStatus: 'fresh',
      scopeMatch: 'exact',
      corroboratingEvidenceIds: [],
      conflictingEvidenceIds: [],
      conflictStatus: 'none',
    },
    provenance: { extractionMethod: 'structured_adapter', extractorVersion: 'nps-evidence-v1', rawPayloadHash: null, contentHash: 'pending' },
    retention: { class: 'public_dynamic_90d', licenseClass: 'government_public', storeClaimText: true, deleteAfter: null },
    isCurrent: true,
  };
  const keys = buildEvidenceKeys(candidate);
  return { ...candidate, ...keys, provenance: { ...candidate.provenance, contentHash: keys.contentHash } };
}

function makeBrokerFromProcessEnv({ initial = [] } = {}) {
  const docs = [...initial];
  const refreshEvents = [];
  const provider = {
    id: 'nps',
    supports: () => true,
    buildRequest: (req) => ({
      provider: 'nps',
      operation: req.topic === 'alerts_closures' ? 'alerts' : 'parks',
      dedupeKey: 'nps|parks|yose',
      publicCanonicalRequest: { provider: 'nps', operation: 'parks', parkCode: 'yose' },
    }),
    fetch: jest.fn().mockResolvedValue({
      raw: {},
      metadata: { observedAt: NOW.toISOString() },
      completeness: { isComplete: true, emptyMeans: 'unknown' },
      providerAttempts: 1,
    }),
    normalize: jest.fn(() => ([{
      ...stored(),
      evidenceId: undefined,
      logicalKey: undefined,
      canonicalKey: undefined,
      observation: undefined,
      retention: undefined,
      observedAt: NOW.toISOString(),
    }])),
    classifyError: () => ({ code: 'provider_unavailable', retryable: false }),
  };
  const broker = createEvidenceBroker({
    providers: [provider],
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
    now: () => NOW,
  });
  return { broker, provider, refreshEvents };
}

describe('11A.1 Trailie evidence refresh secret boot path', () => {
  const originalSecret = process.env[EVIDENCE_REFRESH_HASH_SECRET_ENV];

  afterEach(() => {
    if (originalSecret === undefined) delete process.env[EVIDENCE_REFRESH_HASH_SECRET_ENV];
    else process.env[EVIDENCE_REFRESH_HASH_SECRET_ENV] = originalSecret;
  });

  test('normal refresh hashes through the same process.env path the real server uses', async () => {
    process.env[EVIDENCE_REFRESH_HASH_SECRET_ENV] = '11a1-boot-path-secret';
    const expected = publicRefreshHash(PUBLIC_REQUEST, '11a1-boot-path-secret');
    expect(resolveEvidenceRefreshHashSecret()).toBe('11a1-boot-path-secret');

    const { broker, refreshEvents } = makeBrokerFromProcessEnv();
    const bundle = await broker.resolveEvidence({
      requirements: [requirement()],
      requestId: '11a1-hash-path',
    });

    expect(bundle.resolutions[0].refresh.refreshKeyHash).toBe(expected);
    expect(refreshEvents[0].refreshKeyHash).toBe(expected);
    expect(JSON.stringify({ bundle: bundle.resolutions, refreshEvents })).not.toContain('11a1-boot-path-secret');
  });

  test('missing secret fails closed with a configuration code instead of a mid-turn success', async () => {
    delete process.env[EVIDENCE_REFRESH_HASH_SECRET_ENV];
    expect(resolveEvidenceRefreshHashSecret()).toBeUndefined();
    expect(() => publicRefreshHash(PUBLIC_REQUEST, resolveEvidenceRefreshHashSecret()))
      .toThrow(expect.objectContaining({ code: EVIDENCE_REFRESH_HASH_SECRET_MISSING_CODE }));

    const { broker } = makeBrokerFromProcessEnv();
    await expect(broker.resolveEvidence({
      requirements: [requirement()],
      requestId: '11a1-missing-secret',
    })).rejects.toMatchObject({ code: EVIDENCE_REFRESH_HASH_SECRET_MISSING_CODE });
  });

  test('readiness is unhealthy when V2 is enabled and the secret is absent', () => {
    const readiness = assessTrailieEvidenceRefreshReadiness({
      env: { TRAILIE_V2_RUNTIME_ENABLED: 'true' },
    });
    expect(readiness).toEqual({
      required: true,
      ready: false,
      secretPresent: false,
      status: 'unhealthy',
      code: EVIDENCE_REFRESH_HASH_SECRET_MISSING_CODE,
    });
    expect(JSON.stringify(readiness)).not.toMatch(/secret=|HASH_SECRET/);
  });

  test('readiness is healthy when V2 is enabled and the secret is present, without echoing the value', () => {
    const readiness = assessTrailieEvidenceRefreshReadiness({
      env: {
        TRAILIE_V2_RUNTIME_ENABLED: 'true',
        [EVIDENCE_REFRESH_HASH_SECRET_ENV]: 'must-never-appear-in-readiness',
      },
    });
    expect(readiness.ready).toBe(true);
    expect(readiness.secretPresent).toBe(true);
    expect(JSON.stringify(readiness)).not.toContain('must-never-appear-in-readiness');
  });

  test('readiness is not required when the production runtime is disabled', () => {
    const readiness = assessTrailieEvidenceRefreshReadiness({
      env: { NODE_ENV: 'production', TRAILIE_V2_RUNTIME_ENABLED: 'false' },
    });
    expect(readiness).toMatchObject({ required: false, ready: true, status: 'not_required' });
  });

  test('boot assertion throws the bounded configuration code when V2 is on and the secret is missing', () => {
    expect(() => assertTrailieEvidenceRefreshConfigured({
      env: { TRAILIE_V2_RUNTIME_ENABLED: 'true' },
    })).toThrow(expect.objectContaining({
      code: EVIDENCE_REFRESH_HASH_SECRET_MISSING_CODE,
      message: EVIDENCE_REFRESH_HASH_SECRET_MISSING_CODE,
    }));
  });

  test('local ensure writes a generated secret into a gitignored env file and never to production', () => {
    const envFilePath = path.join(os.tmpdir(), `trailie-11a1-${Date.now()}.env`);
    fs.writeFileSync(envFilePath, 'NODE_ENV=development\n', 'utf8');
    const env = { NODE_ENV: 'development' };

    const generated = ensureLocalTrailieEvidenceRefreshSecret({ env, envFilePath });
    expect(generated).toEqual({ action: 'generated', generated: true });
    expect(isSafeSecret(env[EVIDENCE_REFRESH_HASH_SECRET_ENV])).toBe(true);

    const file = fs.readFileSync(envFilePath, 'utf8');
    expect(file).toContain(`${EVIDENCE_REFRESH_HASH_SECRET_ENV}=`);
    expect(file).toContain(env[EVIDENCE_REFRESH_HASH_SECRET_ENV]);

    const present = ensureLocalTrailieEvidenceRefreshSecret({ env, envFilePath });
    expect(present).toEqual({ action: 'present', generated: false });

    const production = ensureLocalTrailieEvidenceRefreshSecret({
      env: { NODE_ENV: 'production' },
      nodeEnv: 'production',
      envFilePath,
    });
    expect(production).toEqual({ action: 'missing', generated: false });

    fs.unlinkSync(envFilePath);
  });

  test('server boot path loads dotenv, ensures a local secret, then asserts readiness', () => {
    const boot = fs.readFileSync(path.join(__dirname, '../../../server.js'), 'utf8');
    expect(boot).toMatch(/ensureLocalTrailieEvidenceRefreshSecret/);
    expect(boot).toMatch(/assertTrailieEvidenceRefreshConfigured/);
    expect(boot).toMatch(/evidence_refresh_hash_secret_missing/);
  });
});

function isSafeSecret(value) {
  return typeof value === 'string' && value.length >= 32;
}
