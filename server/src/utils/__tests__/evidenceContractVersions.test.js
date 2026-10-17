'use strict';

/**
 * Fix Pass #3D — evidence contract versioning for NPS activities.
 * Deterministic offline fixtures. No provider network. No model calls.
 */

const {
  evaluateEvidenceContractCompatibility,
  requiredExtractorVersionsFor,
  NPS_NAMED_ACTIVITIES_EXTRACTOR_VERSION,
  NPS_ACTIVITY_TAXONOMY_EXTRACTOR_VERSION,
  OPERATIONAL_NORMALIZATION_QUALIFIER,
} = require('../evidenceContractVersions');
const { evaluateRequirementCoverage } = require('../../services/evidenceCoverageEvaluator');
const { createNpsEvidenceProvider } = require('../../services/providers/npsEvidenceProvider');
const { renderEvidenceBundleForPrompt } = require('../../prompts/evidenceBundlePromptRenderer');

const NOW = new Date('2026-08-11T18:00:00.000Z');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function activitiesRequirement(overrides = {}) {
  return {
    requirementId: 'req:activities:zion',
    entity: { entityId: 'nps:park:zion', displayName: 'Zion National Park' },
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
    reasonCodes: [
      'itinerary_activity_support',
      'requested_named_hike_or_walk',
      'requested_viewpoint_or_scenic',
      'requested_low_exposure_candidates',
    ],
    ...overrides,
  };
}

function taxonomyRow({
  text = 'Arts and Culture',
  extractorVersion = 'nps-evidence-v1',
  ageMs = ONE_DAY_MS,
  evidenceId = 'ev:zion-tax-arts',
} = {}) {
  const observedAt = new Date(NOW.getTime() - ageMs).toISOString();
  return {
    evidenceId,
    entityId: 'nps:park:zion',
    topic: 'activities',
    evidenceType: 'fact',
    schemaVersion: 1,
    claim: {
      identity: `activity-taxonomy:${text}`.toLowerCase(),
      text,
      normalizedValue: { name: text, category: 'taxonomy' },
      qualifiers: ['activity_taxonomy'],
    },
    scope: { geographicEntityIds: ['nps:park:zion'], validFrom: null, validThrough: null, audience: 'public' },
    source: { provider: 'nps', sourceClass: 'official_owner', sourceId: 'zion' },
    observation: {
      observedAt,
      fetchedAt: observedAt,
      expiresAt: new Date(NOW.getTime() + 29 * ONE_DAY_MS).toISOString(),
      staleUntil: new Date(NOW.getTime() + 89 * ONE_DAY_MS).toISOString(),
    },
    quality: { authorityClass: 'official_owner', scopeMatch: 'exact', conflictStatus: 'none' },
    provenance: { extractionMethod: 'structured_adapter', extractorVersion, contentHash: evidenceId },
    isCurrent: true,
  };
}

function namedRow({
  name = "Pa'rus Trail",
  exposureLevel = 'low',
  difficulty = 'easy',
  ageMs = ONE_DAY_MS,
  evidenceId = 'ev:zion-parus',
} = {}) {
  const observedAt = new Date(NOW.getTime() - ageMs).toISOString();
  return {
    evidenceId,
    entityId: 'nps:park:zion',
    topic: 'activities',
    evidenceType: 'fact',
    schemaVersion: 1,
    claim: {
      identity: `thingstodo:${name}`.toLowerCase(),
      text: `${name}: Paved accessible walk.`,
      normalizedValue: {
        name,
        category: 'thingstodo',
        activityTypes: ['walk', 'hike'],
        difficulty,
        exposureLevel,
        currentStatus: 'unknown',
      },
      qualifiers: [
        'named_activity_candidate', 'static_suitability_only', 'source_ingestion_complete',
        // A current row also carries the operational normalization contract it
        // was produced under; see operationalNormalizationContract.test.js.
        OPERATIONAL_NORMALIZATION_QUALIFIER,
      ],
    },
    scope: { geographicEntityIds: ['nps:park:zion'], validFrom: null, validThrough: null, audience: 'public' },
    source: { provider: 'nps', sourceClass: 'official_owner', sourceId: 'parus' },
    observation: {
      observedAt,
      fetchedAt: observedAt,
      expiresAt: new Date(NOW.getTime() + 29 * ONE_DAY_MS).toISOString(),
      staleUntil: new Date(NOW.getTime() + 89 * ONE_DAY_MS).toISOString(),
    },
    quality: { authorityClass: 'official_owner', scopeMatch: 'exact', conflictStatus: 'none' },
    provenance: {
      extractionMethod: 'structured_adapter',
      extractorVersion: NPS_NAMED_ACTIVITIES_EXTRACTOR_VERSION,
      contentHash: evidenceId,
    },
    retention: { storeClaimText: true },
    isCurrent: true,
  };
}

describe('Fix Pass #3D evidence contract versions', () => {
  test('required contract is narrow to nps activities only', () => {
    expect(requiredExtractorVersionsFor({ provider: 'nps', topic: 'activities' }))
      .toEqual([NPS_NAMED_ACTIVITIES_EXTRACTOR_VERSION]);
    expect(requiredExtractorVersionsFor({ provider: 'nps', topic: 'fees' })).toBeNull();
    expect(requiredExtractorVersionsFor({ provider: 'known_place', topic: 'activities' })).toBeNull();
  });

  test('rows projected before places text fields were read are schema misses', () => {
    // nps-activities-v2 predates reading places listingDescription/bodyText;
    // its cached exposure/mobility metadata was projected from names alone and
    // must be refreshed on demand, not served as current.
    expect(NPS_NAMED_ACTIVITIES_EXTRACTOR_VERSION).not.toBe('nps-activities-v2');
    const stale = namedRow({ ageMs: ONE_DAY_MS });
    stale.provenance.extractorVersion = 'nps-activities-v2';
    const coverage = evaluateRequirementCoverage(
      activitiesRequirement(),
      [stale],
      { now: NOW }
    );
    expect(coverage.status).toBe('missing');
    expect(coverage.reasonCodes).toContain('candidate_schema_version_mismatch');
  });

  test('CASE A: old but chronologically fresh taxonomy is a schema miss', () => {
    const coverage = evaluateRequirementCoverage(
      activitiesRequirement(),
      [taxonomyRow({ ageMs: ONE_DAY_MS })],
      { now: NOW }
    );
    expect(coverage.status).toBe('missing');
    expect(coverage.reasonCodes).toContain('candidate_schema_version_mismatch');
    expect(coverage.candidateSummary.schemaMismatch).toBe(1);
    expect(coverage.candidateSummary.usable).toBe(0);
    expect(coverage.cacheStatus).toBe('miss');
    expect(coverage.refresh.needed).toBe(true);
  });

  test('CASE B: current named activities within TTL is a hit', () => {
    const coverage = evaluateRequirementCoverage(
      activitiesRequirement(),
      [namedRow({ ageMs: ONE_DAY_MS })],
      { now: NOW }
    );
    expect(coverage).toMatchObject({
      status: 'satisfied_fresh',
      cacheStatus: 'fresh_hit',
      evidenceIds: ['ev:zion-parus'],
      reasonCodes: [],
    });
  });

  test('CASE C: current named activities past maxAge+maxStale expire via freshness', () => {
    const coverage = evaluateRequirementCoverage(
      activitiesRequirement(),
      [namedRow({ ageMs: 130 * ONE_DAY_MS })],
      { now: NOW }
    );
    expect(coverage.status).toBe('missing');
    expect(coverage.reasonCodes).toContain('candidate_expired');
    expect(coverage.candidateSummary.schemaMismatch || 0).toBe(0);
    expect(coverage.refresh.needed).toBe(true);
  });

  test('CASE D: unrelated topic is unaffected by activities contract', () => {
    const observedAt = new Date(NOW.getTime() - ONE_DAY_MS).toISOString();
    const fee = {
      evidenceId: 'ev:zion-fee',
      entityId: 'nps:park:zion',
      topic: 'fees',
      evidenceType: 'fact',
      claim: { identity: 'entrance-fee', text: '$35', normalizedValue: 35 },
      scope: { geographicEntityIds: ['nps:park:zion'], audience: 'public' },
      source: { provider: 'nps', sourceClass: 'official_owner' },
      observation: {
        observedAt, fetchedAt: observedAt,
        expiresAt: new Date(NOW.getTime() + ONE_DAY_MS).toISOString(),
        staleUntil: new Date(NOW.getTime() + 2 * ONE_DAY_MS).toISOString(),
      },
      quality: { authorityClass: 'official_owner', scopeMatch: 'exact', conflictStatus: 'none' },
      provenance: { extractionMethod: 'structured_adapter', extractorVersion: 'nps-evidence-v1' },
    };
    const coverage = evaluateRequirementCoverage({
      ...activitiesRequirement({
        requirementId: 'req:fees',
        topic: 'fees',
        maxAgeSeconds: 12 * 3600,
        maxStaleSeconds: 48 * 3600,
        freshnessClass: 'daily',
      }),
    }, [fee], { now: NOW });
    // 1 day > 12h fresh but within stale for required? criticality required + stale may still work
    // With maxAge 12h and age 1d → expired unless stale_safe. criticality required allows stale_safe.
    expect(coverage.reasonCodes).not.toContain('candidate_schema_version_mismatch');
  });

  test('CASE E: known_place activities are not gated by NPS activities contract', () => {
    const observedAt = new Date(NOW.getTime() - ONE_DAY_MS).toISOString();
    const known = {
      evidenceId: 'ev:vof-atlatl',
      entityId: 'place:known:valley-of-fire-state-park',
      topic: 'activities',
      evidenceType: 'fact',
      claim: {
        identity: 'atlatl',
        text: 'Atlatl Rock',
        normalizedValue: { name: 'Atlatl Rock', exposureLevel: 'low' },
        qualifiers: ['named_activity_candidate'],
      },
      scope: {
        geographicEntityIds: ['place:known:valley-of-fire-state-park'],
        audience: 'public',
      },
      source: { provider: 'known_place', sourceClass: 'trusted_specialist' },
      observation: {
        observedAt, fetchedAt: observedAt,
        expiresAt: new Date(NOW.getTime() + 29 * ONE_DAY_MS).toISOString(),
        staleUntil: new Date(NOW.getTime() + 89 * ONE_DAY_MS).toISOString(),
      },
      quality: { authorityClass: 'trusted_specialist', scopeMatch: 'exact', conflictStatus: 'none' },
      provenance: { extractionMethod: 'known_place_catalog', extractorVersion: 'known-place-activities-v1' },
    };
    const coverage = evaluateRequirementCoverage({
      ...activitiesRequirement({
        requirementId: 'req:vof-act',
        entity: { entityId: 'place:known:valley-of-fire-state-park' },
        preferredProviders: ['known_place'],
        minimumAuthorityClass: 'trusted_specialist',
        acceptedSourceClasses: ['trusted_specialist', 'official_owner'],
      }),
    }, [known], { now: NOW });
    expect(coverage.status).toBe('satisfied_fresh');
    expect(coverage.reasonCodes).not.toContain('candidate_schema_version_mismatch');
  });

  test('CASE G: incompatible v1 present + no usable v2 → missing, not taxonomy masquerade', () => {
    const coverage = evaluateRequirementCoverage(
      activitiesRequirement(),
      [
        taxonomyRow({ text: 'Hiking', evidenceId: 'ev:tax-hike' }),
        taxonomyRow({ text: 'Biking', evidenceId: 'ev:tax-bike' }),
      ],
      { now: NOW }
    );
    expect(coverage.status).toBe('missing');
    expect(coverage.selectedEvidence).toEqual([]);
    expect(coverage.reasonCodes).toEqual(['candidate_schema_version_mismatch']);
  });

  test('Probe B reproduction: old fresh taxonomy rejected; mocked named refresh supplies Pa\'rus', async () => {
    const oldCache = [
      taxonomyRow({ text: 'Arts and Culture', evidenceId: 'ev:tax-1' }),
      taxonomyRow({ text: 'Biking', evidenceId: 'ev:tax-2' }),
      taxonomyRow({ text: 'Camping', evidenceId: 'ev:tax-3' }),
    ];
    const before = evaluateRequirementCoverage(activitiesRequirement(), oldCache, { now: NOW });
    expect(before.status).toBe('missing');
    expect(before.reasonCodes).toContain('candidate_schema_version_mismatch');
    expect(before.selectedEvidence).toHaveLength(0);

    const provider = createNpsEvidenceProvider({
      npsClient: {
        getParkNamedActivitiesEvidence: jest.fn().mockResolvedValue({
          data: {
            thingstodo: [
              {
                id: 'parus',
                title: "Pa'rus Trail",
                shortDescription: 'The paved trail connects the Zion Canyon Visitor Center.',
              },
              {
                id: 'riverside',
                title: 'Riverside Walk',
                shortDescription: 'Relatively flat and paved easy trail along the river.',
              },
              {
                id: 'lower-emerald',
                title: 'Lower Emerald Pool Trail',
                shortDescription: 'Rough paved trail to the Lower Emerald Pool.',
              },
            ],
            places: [],
          },
          isComplete: true,
          observedAt: NOW.toISOString(),
          source: 'direct_fallback',
          selection: {
            activitiesReason: 'snapshot_incomplete',
            placesReason: 'snapshot_incomplete',
            thingstodoSource: 'direct_fallback',
            placesSource: 'direct_fallback',
          },
        }),
      },
      now: () => NOW,
    });
    const requirement = activitiesRequirement();
    const request = provider.buildRequest(requirement);
    expect(request.dedupeKey).toBe('nps|named-activities|zion');
    const fetched = await provider.fetch(request, { signal: new AbortController().signal });
    expect(fetched.completeness.isComplete).toBe(true);
    expect(fetched.metadata.sourceIngestionComplete).toBe(true);
    const normalized = provider.normalize(fetched.raw, request, fetched.metadata);
    expect(normalized.every((c) => c.provenance.extractorVersion === NPS_NAMED_ACTIVITIES_EXTRACTOR_VERSION)).toBe(true);
    expect(normalized.every((c) => c.claim.qualifiers.includes('source_ingestion_complete'))).toBe(true);
    expect(normalized.map((c) => c.claim.normalizedValue.name)).toEqual(
      expect.arrayContaining(["Pa'rus Trail", 'Riverside Walk', 'Lower Emerald Pool Trail'])
    );

    const refreshed = normalized.map((c, i) => ({
      ...c,
      evidenceId: `ev:named:${i}`,
      observation: {
        observedAt: fetched.metadata.observedAt,
        fetchedAt: fetched.metadata.observedAt,
        expiresAt: new Date(NOW.getTime() + 29 * ONE_DAY_MS).toISOString(),
        staleUntil: new Date(NOW.getTime() + 89 * ONE_DAY_MS).toISOString(),
      },
      retention: { storeClaimText: true },
      isCurrent: true,
    }));

    // Old taxonomy remains present alongside new named rows — only v2 is usable.
    const after = evaluateRequirementCoverage(
      activitiesRequirement(),
      [...oldCache, ...refreshed],
      { now: NOW }
    );
    expect(after.status).toBe('satisfied_fresh');
    expect(after.selectedEvidence.every((e) =>
      e.provenance.extractorVersion === NPS_NAMED_ACTIVITIES_EXTRACTOR_VERSION
    )).toBe(true);
    expect(after.selectedEvidence.some((e) => /Pa'rus/.test(e.claim?.normalizedValue?.name || e.claim?.text || ''))).toBe(true);

    const bundle = {
      evidence: after.selectedEvidence,
      resolutions: [{
        requirementId: requirement.requirementId,
        status: after.status,
        evidenceIds: after.evidenceIds,
      }],
    };
    const rendered = renderEvidenceBundleForPrompt({
      bundle,
      requirements: [requirement],
      maxTokens: 1200,
    });
    expect(rendered.text).toMatch(/Pa'rus Trail/);
    expect(rendered.text).toMatch(/Riverside Walk|Lower Emerald/);
    expect(rendered.text).toMatch(/Suitability:.*exposureLevel=low/);
  });

  test('profile taxonomy emission uses taxonomy extractor version, not named-v2', () => {
    const provider = createNpsEvidenceProvider({ npsClient: {}, now: () => NOW });
    const request = {
      provider: 'nps',
      operation: 'parks',
      parameters: { parkCode: 'zion' },
    };
    const candidates = provider.normalize({
      id: 'zion',
      parkCode: 'zion',
      fullName: 'Zion National Park',
      activities: [{ id: 'hike', name: 'Hiking' }],
    }, request, { observedAt: NOW.toISOString() });
    const taxonomy = candidates.filter((c) => c.topic === 'activities');
    expect(taxonomy).toHaveLength(1);
    expect(taxonomy[0].provenance.extractorVersion).toBe(NPS_ACTIVITY_TAXONOMY_EXTRACTOR_VERSION);
    expect(evaluateEvidenceContractCompatibility(taxonomy[0]).ok).toBe(false);
  });
});


test('cached activity rows before cliff-edge classification are refreshed', () => {
  const stale = namedRow({ ageMs: ONE_DAY_MS });
  stale.provenance.extractorVersion = 'nps-activities-v7';
  const coverage = evaluateRequirementCoverage(activitiesRequirement(), [stale], { now: NOW });
  expect(coverage.status).toBe('missing');
  expect(coverage.reasonCodes).toContain('candidate_schema_version_mismatch');
});
