'use strict';

const { evaluateRequirementCoverage } = require('../evidenceCoverageEvaluator');

const NOW = new Date('2026-08-09T12:00:00.000Z');

function requirement(overrides = {}) {
  return {
    requirementId: 'req:coverage:1',
    entity: { entityId: 'nps:park:yose' },
    topic: 'fees',
    evidenceTypes: ['fact', 'rule'],
    temporalScope: { mode: 'current', requestedAt: NOW.toISOString(), validFrom: null, validThrough: null, timezone: 'UTC' },
    freshnessClass: 'daily',
    maxAgeSeconds: 3600,
    maxStaleSeconds: 7200,
    criticality: 'required',
    absenceSemantics: 'unknown',
    minimumAuthorityClass: 'official_structured',
    acceptedSourceClasses: ['official_structured'],
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    evidenceId: 'ev:fee-current',
    entityId: 'nps:park:yose',
    topic: 'fees',
    evidenceType: 'fact',
    claim: { identity: 'entrance-fee', normalizedValue: 35 },
    scope: { geographicEntityIds: ['nps:park:yose'], validFrom: null, validThrough: null, audience: 'public' },
    source: { provider: 'nps', sourceClass: 'official_owner' },
    observation: {
      observedAt: new Date(NOW.getTime() - 30 * 60000).toISOString(),
      fetchedAt: new Date(NOW.getTime() - 30 * 60000).toISOString(),
      expiresAt: new Date(NOW.getTime() + 30 * 60000).toISOString(),
      staleUntil: new Date(NOW.getTime() + 150 * 60000).toISOString(),
    },
    quality: { authorityClass: 'official_owner', scopeMatch: 'exact', conflictStatus: 'none' },
    ...overrides,
  };
}

describe('WP5A requirement coverage evaluator', () => {
  test('selects fresh exact evidence and reports selected-only metadata', () => {
    expect(evaluateRequirementCoverage(requirement(), [evidence()], { now: NOW })).toMatchObject({
      status: 'satisfied_fresh',
      evidenceIds: ['ev:fee-current'],
      reasonCodes: [],
      cacheStatus: 'fresh_hit',
      maxEvidenceAgeMs: 30 * 60000,
      authorityClasses: ['official_owner'],
      providersUsed: ['nps'],
      candidateSummary: { examined: 1, usable: 1 },
    });
  });

  test('keeps rejection reasons beneath a final missing status', () => {
    const candidates = [
      evidence({ evidenceId: 'ev:expired', observation: {
        observedAt: new Date(NOW.getTime() - 4 * 3600000).toISOString(),
        fetchedAt: new Date(NOW.getTime() - 4 * 3600000).toISOString(),
        expiresAt: new Date(NOW.getTime() - 3 * 3600000).toISOString(),
        staleUntil: new Date(NOW.getTime() - 2 * 3600000).toISOString(),
      } }),
      evidence({ evidenceId: 'ev:scope', scope: { geographicEntityIds: ['nps:park:sequ'], audience: 'public' } }),
      evidence({ evidenceId: 'ev:type', evidenceType: 'description' }),
      evidence({ evidenceId: 'ev:authority', quality: { authorityClass: 'reputable_web', scopeMatch: 'exact', conflictStatus: 'none' } }),
      evidence({ evidenceId: 'ev:conflict', quality: { authorityClass: 'official_owner', scopeMatch: 'exact', conflictStatus: 'open' } }),
    ];
    expect(evaluateRequirementCoverage(requirement(), candidates, { now: NOW })).toMatchObject({
      status: 'conflicted',
      evidenceIds: [],
      reasonCodes: expect.arrayContaining([
        'candidate_expired', 'candidate_wrong_scope', 'candidate_wrong_evidence_type',
        'candidate_insufficient_authority', 'candidate_conflicted',
      ]),
      candidateSummary: {
        examined: 5, usable: 0, expired: 1, wrongScope: 1,
        wrongType: 1, insufficientAuthority: 1, conflicted: 1,
      },
    });
  });

  test('stale-safe is usable for required evidence but never for hard evidence', () => {
    const stale = evidence({
      observation: {
        observedAt: new Date(NOW.getTime() - 2 * 3600000).toISOString(),
        fetchedAt: new Date(NOW.getTime() - 2 * 3600000).toISOString(),
        expiresAt: new Date(NOW.getTime() - 3600000).toISOString(),
        staleUntil: new Date(NOW.getTime() + 3600000).toISOString(),
      },
    });
    expect(evaluateRequirementCoverage(requirement(), [stale], { now: NOW }).status)
      .toBe('satisfied_stale_safe');
    expect(evaluateRequirementCoverage(requirement({ criticality: 'hard' }), [stale], { now: NOW }))
      .toMatchObject({ status: 'missing', reasonCodes: ['candidate_expired'] });
  });

  test('distinguishes partial and conflicted final coverage from rejection diagnostics', () => {
    const partial = evidence({ quality: { ...evidence().quality, scopeMatch: 'partial' } });
    expect(evaluateRequirementCoverage(requirement(), [partial], { now: NOW }).status).toBe('satisfied_partial');
    const conflicted = evidence({ quality: { ...evidence().quality, conflictStatus: 'open' } });
    const result = evaluateRequirementCoverage(requirement(), [conflicted], { now: NOW });
    expect(result).toMatchObject({ status: 'conflicted', conflictStatus: 'open' });
    expect(result.reasonCodes).toContain('candidate_conflicted');
  });

  test('rejects a same-type candidate from a different evidence topic', () => {
    const climate = evidence({ topic: 'climate_normals' });
    expect(evaluateRequirementCoverage(requirement({ topic: 'weather_forecast' }), [climate], { now: NOW }))
      .toMatchObject({
        status: 'missing',
        reasonCodes: ['candidate_wrong_topic'],
        candidateSummary: { examined: 1, usable: 0, wrongTopic: 1 },
      });
  });

  test('requires an exact origin, destination, mode, and departure bucket for route evidence', () => {
    const routeScope = {
      origin: { entityId: 'nps:park:yose' },
      destination: { entityId: 'nps:park:sequ' },
      travelMode: 'driving', departureTimeBucket: NOW.toISOString(),
    };
    const routeRequirement = requirement({
      entity: { entityId: 'nps:park:sequ' }, topic: 'driving_time', evidenceTypes: ['fact'],
      minimumAuthorityClass: 'commercial_structured', acceptedSourceClasses: ['commercial_structured'],
      routeScope,
    });
    const exact = evidence({
      evidenceId: 'ev:exact-route', entityId: 'nps:park:sequ', topic: 'driving_time',
      scope: {
        geographicEntityIds: ['nps:park:yose', 'nps:park:sequ'], validFrom: null, validThrough: null,
        audience: 'public',
        route: {
          originEntityId: 'nps:park:yose', destinationEntityId: 'nps:park:sequ',
          travelMode: 'driving', departureTimeBucket: NOW.toISOString(),
        },
      },
      source: { provider: 'google_maps', sourceClass: 'commercial_structured' },
      quality: { authorityClass: 'commercial_structured', scopeMatch: 'exact', conflictStatus: 'none' },
    });
    const wrongOrigin = {
      ...exact, evidenceId: 'ev:wrong-origin',
      scope: { ...exact.scope, route: { ...exact.scope.route, originEntityId: 'nps:park:deva' } },
    };

    expect(evaluateRequirementCoverage(routeRequirement, [wrongOrigin], { now: NOW })).toMatchObject({
      status: 'missing', reasonCodes: ['candidate_wrong_scope'],
      candidateSummary: { wrongScope: 1, usable: 0 },
    });
    expect(evaluateRequirementCoverage(routeRequirement, [exact], { now: NOW })).toMatchObject({
      status: 'satisfied_fresh', evidenceIds: ['ev:exact-route'],
    });
  });

  test('rejects chronologically fresh NPS activities taxonomy when named-activities contract is required', () => {
    const observedAt = new Date(NOW.getTime() - 30 * 60000).toISOString();
    const taxonomy = evidence({
      evidenceId: 'ev:tax',
      topic: 'activities',
      claim: { identity: 'activity-taxonomy:hiking', text: 'Hiking', normalizedValue: { category: 'taxonomy' } },
      provenance: { extractionMethod: 'structured_adapter', extractorVersion: 'nps-evidence-v1' },
      observation: {
        observedAt,
        fetchedAt: observedAt,
        expiresAt: new Date(NOW.getTime() + 29 * 24 * 3600000).toISOString(),
        staleUntil: new Date(NOW.getTime() + 89 * 24 * 3600000).toISOString(),
      },
    });
    const result = evaluateRequirementCoverage(requirement({
      topic: 'activities',
      maxAgeSeconds: 30 * 24 * 3600,
      maxStaleSeconds: 90 * 24 * 3600,
      freshnessClass: 'stable',
      minimumAuthorityClass: 'official_owner',
      acceptedSourceClasses: ['official_owner'],
    }), [taxonomy], { now: NOW });
    expect(result).toMatchObject({
      status: 'missing',
      reasonCodes: ['candidate_schema_version_mismatch'],
      candidateSummary: { schemaMismatch: 1, usable: 0 },
      cacheStatus: 'miss',
    });
  });
});
