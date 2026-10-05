'use strict';

/**
 * SEMANTIC NORMALIZATION CONTRACT VERSIONING.
 *
 * Gate #5's Theodore Roosevelt rerun reported `freshness = stale_safe` and
 * evaluated a cached candidate carrying
 * `vehicle_restriction | access over gravel roads` — a fact the CURRENT
 * producer cannot generate. Operational facts live inside
 * `TrailieEvidence.normalizedValue`, so they survive producer changes until
 * TTL: current code read pre-fix semantic output and called it valid.
 *
 * Source freshness is not normalization freshness. A chronologically fresh NPS
 * row whose normalizedValue was produced by an obsolete semantic contract must
 * be a cache miss for current semantic consumption.
 *
 * Deterministic offline fixtures. No provider network. No model calls.
 */

const {
  evaluateEvidenceContractCompatibility,
  requiredOperationalNormalizationVersionFor,
  operationalNormalizationVersionOf,
  OPERATIONAL_NORMALIZATION_CONTRACT_VERSION,
  OPERATIONAL_NORMALIZATION_QUALIFIER,
  NPS_NAMED_ACTIVITIES_EXTRACTOR_VERSION,
} = require('../evidenceContractVersions');
const { evaluateRequirementCoverage } = require('../../services/evidenceCoverageEvaluator');
const { createNpsEvidenceProvider } = require('../../services/providers/npsEvidenceProvider');
const { createEvidenceBroker } = require('../../services/evidenceBrokerService');
const { buildEvidenceBundle } = require('../evidenceBundle');
const { __testables: execTestables } = require('../../services/trailieV2ExecutionService');
const { buildEvidenceKeys } = require('../evidenceKey');

const NOW = new Date('2026-08-25T18:00:00.000Z');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** The pre-fix producer stamp. Any non-current version must be rejected. */
const OLD_QUALIFIER = 'operational_normalization:opnorm-v1';

// ---------------------------------------------------------------------------
// Real official wording (Gate #5 blocker recovery, section 1 and 3).
// ---------------------------------------------------------------------------

const THRO_RAW = Object.freeze({
  thingstodo: [{
    id: 'thro-petrified',
    title: 'Hike the Petrified Forest',
    shortDescription: 'A hike through one of the largest petrified forests in the United States.',
    longDescription: 'Access involves gravel roads and a trailhead parking area. '
      + 'The route is unmarked beyond the park boundary sign.',
  }],
  places: [],
});

const GRSA_RAW = Object.freeze({
  thingstodo: [{
    id: 'grsa-medano',
    title: 'Medano Pass Primitive Road',
    shortDescription: 'A long scenic drive over the pass on the Primitive Road.',
    longDescription: 'A high-clearance four-wheel-drive vehicle is required beyond the parking area. '
      + 'The route crosses the creek nine times.',
  }],
  places: [],
});

function activitiesRequirement(parkCode = 'thro', overrides = {}) {
  return {
    requirementId: `req:activities:${parkCode}`,
    entity: { entityId: `nps:park:${parkCode}`, entityType: 'national_park', displayName: parkCode },
    topic: 'activities',
    evidenceTypes: ['fact'],
    temporalScope: { mode: 'current', requestedAt: NOW.toISOString(), validFrom: null, validThrough: null, timezone: 'UTC' },
    freshnessClass: 'stable',
    maxAgeSeconds: 30 * 24 * 3600,
    maxStaleSeconds: 90 * 24 * 3600,
    criticality: 'required',
    absenceSemantics: 'unknown',
    minimumAuthorityClass: 'official_owner',
    acceptedSourceClasses: ['official_owner'],
    preferredProviders: ['nps'],
    allowedFallbackProviders: [],
    privacyScope: 'public',
    ...overrides,
  };
}

/**
 * A stored NPS named-activity row. Everything except the operational
 * normalization stamp is deliberately CURRENT — extractor version, ingestion
 * completeness, authority, scope — so the only thing under test is the
 * semantic normalization contract.
 */
function activityRow({
  parkCode = 'thro',
  evidenceId = 'ev:thro-petrified',
  name = 'Hike the Petrified Forest',
  operationalFacts = [],
  normalizationQualifiers = [],
  ageMs = ONE_DAY_MS,
} = {}) {
  const entityId = `nps:park:${parkCode}`;
  const observedAt = new Date(NOW.getTime() - ageMs).toISOString();
  return {
    evidenceId,
    entityId,
    topic: 'activities',
    evidenceType: 'fact',
    schemaVersion: 1,
    claim: {
      // Same logical claim the provider re-normalizes: identity and sourceId are
      // what buildEvidenceKeys hashes into logicalKey, so the refreshed row
      // supersedes this one instead of sitting beside it.
      identity: 'thingstodo:thro-petrified',
      text: name,
      normalizedValue: {
        entityId: `${entityId}:thingstodo:0`,
        destinationId: entityId,
        name,
        category: 'thingstodo',
        activityTypes: ['hike'],
        difficulty: null,
        exposureLevel: 'moderate',
        operationalFacts,
        currentStatus: 'unknown',
        authority: 'official_owner',
      },
      qualifiers: [
        'named_activity_candidate',
        'static_suitability_only',
        'source_ingestion_complete',
        ...normalizationQualifiers,
      ],
    },
    scope: { geographicEntityIds: [entityId], validFrom: null, validThrough: null, audience: 'public', locale: 'en-US' },
    source: { provider: 'nps', sourceClass: 'official_owner', sourceId: 'thro-petrified', url: null, title: name, publishedAt: null, sourceUpdatedAt: null },
    observation: {
      observedAt,
      fetchedAt: observedAt,
      expiresAt: new Date(NOW.getTime() + 29 * ONE_DAY_MS).toISOString(),
      staleUntil: new Date(NOW.getTime() + 89 * ONE_DAY_MS).toISOString(),
      retrievalMode: 'live',
    },
    quality: { authorityClass: 'official_owner', scopeMatch: 'exact', conflictStatus: 'none' },
    provenance: {
      extractionMethod: 'structured_adapter',
      extractorVersion: NPS_NAMED_ACTIVITIES_EXTRACTOR_VERSION,
      contentHash: evidenceId,
    },
    retention: { class: 'public_dynamic_90d', licenseClass: 'government_public', storeClaimText: true, deleteAfter: null },
    isCurrent: true,
  };
}

function keyed(row) {
  const keys = buildEvidenceKeys(row);
  return { ...row, ...keys, provenance: { ...row.provenance, contentHash: keys.contentHash } };
}

/** The exact fact the pre-fix producer wrote and the current one cannot. */
const PRE_FIX_GRAVEL_FACT = Object.freeze({
  type: 'vehicle_restriction',
  requirement: 'access over gravel roads',
  confidence: 'official_text',
  sourceField: 'longDescription',
});

function normalizeWith(raw, parkCode) {
  // `npsClient: {}` has no fetch methods at all: any attempt to reach a
  // provider would throw rather than silently hit the network.
  const provider = createNpsEvidenceProvider({ npsClient: {}, now: () => NOW });
  const request = provider.buildRequest(activitiesRequirement(parkCode));
  return provider.normalize(raw, request, {
    observedAt: NOW.toISOString(),
    sourceIngestionComplete: true,
  });
}

function vehicleFactsOf(candidate) {
  return (candidate.claim.normalizedValue.operationalFacts || [])
    .filter((fact) => fact.type === 'vehicle_restriction');
}

describe('operational normalization contract version', () => {
  test('the contract is scoped to the families that actually produce operational facts', () => {
    expect(requiredOperationalNormalizationVersionFor({ provider: 'nps', topic: 'activities' }))
      .toBe(OPERATIONAL_NORMALIZATION_CONTRACT_VERSION);
    expect(requiredOperationalNormalizationVersionFor({ provider: 'nps', topic: 'fees' })).toBeNull();
    expect(requiredOperationalNormalizationVersionFor({ provider: 'nps', topic: 'hours' })).toBeNull();
    expect(requiredOperationalNormalizationVersionFor({ provider: 'weather', topic: 'weather' })).toBeNull();
    expect(requiredOperationalNormalizationVersionFor({ provider: 'known_place', topic: 'activities' })).toBeNull();
  });

  test('current normalization stamps every named activity candidate with the contract version', () => {
    const candidates = normalizeWith(THRO_RAW, 'thro');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].claim.qualifiers).toContain(OPERATIONAL_NORMALIZATION_QUALIFIER);
    expect(operationalNormalizationVersionOf(candidates[0]))
      .toBe(OPERATIONAL_NORMALIZATION_CONTRACT_VERSION);
  });

  test('an unstamped pre-fix row is a semantic cache miss even though it is chronologically fresh', () => {
    const stale = activityRow({ operationalFacts: [PRE_FIX_GRAVEL_FACT] });
    const coverage = evaluateRequirementCoverage(activitiesRequirement(), [stale], { now: NOW });

    expect(coverage.status).toBe('missing');
    expect(coverage.cacheStatus).toBe('miss');
    expect(coverage.reasonCodes).toContain('candidate_operational_normalization_version_mismatch');
    expect(coverage.candidateSummary.schemaMismatch).toBe(1);
    expect(coverage.candidateSummary.usable).toBe(0);
    expect(coverage.refresh.needed).toBe(true);
  });

  test('an explicitly OLD-versioned row is rejected the same way', () => {
    const stale = activityRow({
      operationalFacts: [PRE_FIX_GRAVEL_FACT],
      normalizationQualifiers: [OLD_QUALIFIER],
    });
    expect(evaluateEvidenceContractCompatibility(stale)).toEqual({
      ok: false,
      reasonCode: 'candidate_operational_normalization_version_mismatch',
    });
  });

  test('an OLD row inside the stale window is not served stale_safe either', () => {
    // Source freshness vs normalization freshness: 45 days is inside
    // maxStale, so before the fix this row was served as stale_safe and the
    // refresh only ran in the background.
    const stale = activityRow({
      operationalFacts: [PRE_FIX_GRAVEL_FACT],
      normalizationQualifiers: [OLD_QUALIFIER],
      ageMs: 45 * ONE_DAY_MS,
    });
    const coverage = evaluateRequirementCoverage(activitiesRequirement(), [stale], { now: NOW });
    expect(coverage.status).toBe('missing');
    expect(coverage.cacheStatus).not.toBe('stale_safe_hit');
  });

  test('a current-version row is a normal reusable cache hit', () => {
    const fresh = activityRow({ normalizationQualifiers: [OPERATIONAL_NORMALIZATION_QUALIFIER] });
    const coverage = evaluateRequirementCoverage(activitiesRequirement(), [fresh], { now: NOW });
    expect(coverage).toMatchObject({
      status: 'satisfied_fresh',
      cacheStatus: 'fresh_hit',
      evidenceIds: ['ev:thro-petrified'],
      reasonCodes: [],
    });
    expect(coverage.normalizationContract).toMatchObject({
      expectedVersion: OPERATIONAL_NORMALIZATION_CONTRACT_VERSION,
      observedVersions: [OPERATIONAL_NORMALIZATION_CONTRACT_VERSION],
      mismatchedCandidates: 0,
      accepted: true,
      renormalized: false,
    });
  });

  test('coverage telemetry names the cached and the expected contract version', () => {
    const stale = activityRow({
      operationalFacts: [PRE_FIX_GRAVEL_FACT],
      normalizationQualifiers: [OLD_QUALIFIER],
    });
    const coverage = evaluateRequirementCoverage(activitiesRequirement(), [stale], { now: NOW });
    expect(coverage.normalizationContract).toEqual({
      expectedVersion: OPERATIONAL_NORMALIZATION_CONTRACT_VERSION,
      observedVersions: ['opnorm-v1'],
      supersededVersions: [],
      mismatchedCandidates: 1,
      accepted: false,
      renormalized: false,
    });
  });

  test('topics with no operational contract carry no normalization telemetry', () => {
    const feesRow = {
      ...activityRow({ normalizationQualifiers: [OPERATIONAL_NORMALIZATION_QUALIFIER] }),
      topic: 'fees',
      evidenceId: 'ev:thro-fees',
    };
    const coverage = evaluateRequirementCoverage(
      activitiesRequirement('thro', { requirementId: 'req:fees:thro', topic: 'fees' }),
      [feesRow],
      { now: NOW }
    );
    expect(coverage.status).toBe('satisfied_fresh');
    expect(coverage.normalizationContract).toBeNull();
  });
});

describe('current producer semantics are unchanged by versioning', () => {
  test('bare gravel wording produces zero vehicle restriction facts', () => {
    const [candidate] = normalizeWith(THRO_RAW, 'thro');
    expect(candidate.claim.normalizedValue.operationalFacts).toEqual([]);
    expect(vehicleFactsOf(candidate)).toHaveLength(0);
  });

  test('Medano Pass capability wording still produces its vehicle restriction', () => {
    const [candidate] = normalizeWith(GRSA_RAW, 'grsa');
    const facts = vehicleFactsOf(candidate);
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.map((fact) => fact.requirement).join(' | '))
      .toMatch(/high-clearance four-wheel-drive vehicle access/i);
    expect(candidate.claim.qualifiers).toContain(OPERATIONAL_NORMALIZATION_QUALIFIER);
  });
});

describe('unrelated evidence contracts are not gratuitously invalidated', () => {
  const families = [
    ['nps', 'fees'],
    ['nps', 'hours'],
    ['nps', 'overview'],
    ['nps', 'alerts_closures'],
    ['weather', 'weather'],
    ['known_place', 'activities'],
  ];

  test.each(families)('%s:%s stays compatible without an operational stamp', (provider, topic) => {
    const row = {
      ...activityRow(),
      topic,
      source: { provider, sourceClass: 'official_owner', sourceId: 'x' },
      claim: { ...activityRow().claim, qualifiers: [] },
      provenance: { extractionMethod: 'structured_adapter', extractorVersion: 'nps-evidence-v2' },
    };
    expect(evaluateEvidenceContractCompatibility(row)).toEqual({ ok: true });
  });
});

describe('end to end: old cache rejected, renormalized, then reusable', () => {
  function makeBroker({ initial = [] } = {}) {
    const docs = [...initial];
    const npsClient = {
      getParkNamedActivitiesEvidence: jest.fn().mockResolvedValue({
        data: THRO_RAW,
        isComplete: true,
        observedAt: NOW.toISOString(),
        source: 'snapshot',
        selection: { activitiesReason: 'snapshot_hit_complete', placesReason: 'snapshot_hit_complete' },
      }),
    };
    const provider = createNpsEvidenceProvider({ npsClient, now: () => NOW });
    const broker = createEvidenceBroker({
      providers: [provider],
      queryEvidence: async (req) => docs.filter(
        (item) => item.entityId === req.entity.entityId && item.topic === req.topic && item.isCurrent
      ),
      persistCandidate: async ({ candidate }) => {
        const keys = buildEvidenceKeys(candidate);
        const evidence = {
          ...candidate, ...keys, isCurrent: true,
          provenance: { ...candidate.provenance, contentHash: keys.contentHash },
        };
        const existing = docs.find((item) => item.canonicalKey === evidence.canonicalKey);
        if (existing) return { outcome: 'idempotent', evidence: existing };
        // Mirrors upsertEvidenceVersion: one current row per logicalKey.
        for (const doc of docs) {
          if (doc.logicalKey === evidence.logicalKey && doc.isCurrent) doc.isCurrent = false;
        }
        docs.push(evidence);
        return { outcome: 'created', evidence };
      },
      acquireLease: async ({ leaseKey, ownerId }) => ({ outcome: 'acquired', lease: { leaseKey, ownerId, fencingToken: 1 } }),
      releaseLease: async () => ({ released: true }),
      waitForRefresh: async () => ({ outcome: 'coalesced_store_update' }),
      recordRefreshEvent: async () => {},
      refreshHashSecret: 'opnorm-test-secret',
      now: () => NOW,
    });
    return { broker, docs, npsClient };
  }

  test('a stale-window pre-fix row forces a blocking renormalization to current semantics', async () => {
    const h = makeBroker({
      initial: [keyed(activityRow({
        operationalFacts: [PRE_FIX_GRAVEL_FACT],
        normalizationQualifiers: [OLD_QUALIFIER],
        ageMs: 45 * ONE_DAY_MS,
      }))],
    });

    const bundle = await h.broker.resolveEvidence({
      requirements: [activitiesRequirement('thro')],
      requestId: 'request-opnorm',
    });

    const resolution = bundle.resolutions[0];
    expect(h.npsClient.getParkNamedActivitiesEvidence).toHaveBeenCalledTimes(1);
    expect(resolution.cacheStatus).toBe('refreshed');
    expect(resolution.status).toBe('satisfied_fresh');
    expect(resolution.normalizationContract).toMatchObject({
      expectedVersion: OPERATIONAL_NORMALIZATION_CONTRACT_VERSION,
      observedVersions: [OPERATIONAL_NORMALIZATION_CONTRACT_VERSION],
      // The version that was in cache is still named after the refresh —
      // otherwise the live run can only see the version it just wrote.
      supersededVersions: ['opnorm-v1'],
      mismatchedCandidates: 0,
      accepted: true,
      renormalized: true,
    });

    const current = h.docs.filter((doc) => doc.isCurrent);
    expect(current).toHaveLength(1);
    expect(current[0].claim.qualifiers).toContain(OPERATIONAL_NORMALIZATION_QUALIFIER);
    expect(current[0].claim.normalizedValue.operationalFacts).toEqual([]);
  });

  test('the freshly written row is then a plain cache hit with no provider call', async () => {
    const h = makeBroker();
    await h.broker.resolveEvidence({
      requirements: [activitiesRequirement('thro')],
      requestId: 'request-opnorm-warm',
    });
    h.npsClient.getParkNamedActivitiesEvidence.mockClear();

    const second = await h.broker.resolveEvidence({
      requirements: [activitiesRequirement('thro')],
      requestId: 'request-opnorm-warm-2',
    });
    expect(h.npsClient.getParkNamedActivitiesEvidence).not.toHaveBeenCalled();
    expect(second.resolutions[0]).toMatchObject({ status: 'satisfied_fresh', cacheStatus: 'fresh_hit' });
    expect(second.resolutions[0].normalizationContract).toMatchObject({
      accepted: true,
      mismatchedCandidates: 0,
      renormalized: false,
    });
  });
});

describe('turn-level cache observability', () => {
  const { evidenceSummary } = execTestables;

  function bundleWith(normalizationContract) {
    return buildEvidenceBundle({
      requestId: 'turn-opnorm',
      createdAt: NOW,
      resolutions: [{
        requirementId: 'req:activities:thro',
        status: 'satisfied_fresh',
        evidenceIds: [],
        reasonCodes: [],
        candidateSummary: {
          examined: 1, usable: 1, expired: 0, wrongScope: 0, wrongTopic: 0, wrongType: 0,
          insufficientAuthority: 0, conflicted: 0, privacyRejected: 0, schemaMismatch: 0,
        },
        refresh: { needed: true, refreshKeyHash: null, outcome: 'succeeded', reasonCode: null },
        cacheStatus: 'refreshed',
        normalizationContract,
        maxEvidenceAgeMs: 0,
        authorityClasses: [],
        providersUsed: ['nps'],
        conflictStatus: 'none',
        latencyMs: null,
        selectedEvidence: [],
      }],
      candidates: [],
    });
  }

  test('a renormalized turn reports both the cached and the current contract version', () => {
    const summary = evidenceSummary(bundleWith({
      expectedVersion: OPERATIONAL_NORMALIZATION_CONTRACT_VERSION,
      observedVersions: [OPERATIONAL_NORMALIZATION_CONTRACT_VERSION],
      supersededVersions: ['opnorm-v1'],
      mismatchedCandidates: 0,
      accepted: true,
      renormalized: true,
    }), { status: 'complete' });

    expect(summary.normalizationContract).toEqual({
      expectedVersion: OPERATIONAL_NORMALIZATION_CONTRACT_VERSION,
      cachedVersions: ['opnorm-v1'],
      staleContractCandidates: 0,
      cacheAccepted: true,
      renormalized: true,
    });
  });

  test('an ordinary cache hit reports the current version and no renormalization', () => {
    const summary = evidenceSummary(bundleWith({
      expectedVersion: OPERATIONAL_NORMALIZATION_CONTRACT_VERSION,
      observedVersions: [OPERATIONAL_NORMALIZATION_CONTRACT_VERSION],
      supersededVersions: [],
      mismatchedCandidates: 0,
      accepted: true,
      renormalized: false,
    }), { status: 'complete' });

    expect(summary.normalizationContract).toEqual({
      expectedVersion: OPERATIONAL_NORMALIZATION_CONTRACT_VERSION,
      cachedVersions: [OPERATIONAL_NORMALIZATION_CONTRACT_VERSION],
      staleContractCandidates: 0,
      cacheAccepted: true,
      renormalized: false,
    });
  });

  test('turns with no operational contract carry no normalization telemetry', () => {
    expect(evidenceSummary(bundleWith(null), { status: 'complete' }).normalizationContract).toBeNull();
  });
});
