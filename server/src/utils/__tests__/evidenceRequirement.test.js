'use strict';

const {
  PLANNER_VERSION,
  buildEvidenceRequirement,
  validateEvidenceRequirement,
} = require('../evidenceRequirement');

const input = {
  turnId: 'turn-yose-roads',
  ordinal: 0,
  entity: {
    entityId: 'nps:park:yose',
    entityType: 'national_park',
    displayName: 'Yosemite National Park',
    parentEntityId: null,
    latitude: 37.8651,
    longitude: -119.5383,
    resolutionConfidence: 1,
  },
  topic: 'roads',
  evidenceTypes: ['rule', 'live_state', 'rule'],
  temporalScope: {
    mode: 'current',
    requestedAt: '2026-08-09T12:00:00.000Z',
    validFrom: null,
    validThrough: null,
    timezone: 'America/Los_Angeles',
  },
  freshnessClass: 'live',
  maxAgeSeconds: 900,
  maxStaleSeconds: 0,
  criticality: 'hard',
  absenceSemantics: 'unknown',
  minimumAuthorityClass: 'official_owner',
  acceptedSourceClasses: ['official_structured', 'official_owner'],
  preferredProviders: ['nps', 'nps'],
  allowedFallbackProviders: ['brave', 'direct_official_page'],
  privacyScope: 'public',
  renderBudgetTokens: 250,
  reasonCodes: ['explicit_open_now_question'],
};

describe('WP4 EvidenceRequirement contract', () => {
  test('builds a strict schema-valid public requirement', () => {
    const requirement = buildEvidenceRequirement(input);
    expect(validateEvidenceRequirement(requirement)).toEqual({ valid: true, errors: [] });
    expect(Object.keys(requirement).sort()).toEqual([
      'absenceSemantics', 'acceptedSourceClasses', 'allowedFallbackProviders', 'criticality',
      'entity', 'evidenceTypes', 'freshnessClass', 'maxAgeSeconds', 'maxStaleSeconds',
      'minimumAuthorityClass', 'plannerVersion', 'preferredProviders', 'privacyScope',
      'reasonCodes', 'renderBudgetTokens', 'requirementId', 'schemaVersion', 'temporalScope',
      'topic', 'turnId',
    ]);
    expect(requirement.plannerVersion).toBe(PLANNER_VERSION);
    expect(requirement.evidenceTypes).toEqual(['live_state', 'rule']);
    expect(requirement.preferredProviders).toEqual(['nps']);
  });

  test('generates deterministic IDs and isolates ordinal/content changes', () => {
    const first = buildEvidenceRequirement(input);
    expect(buildEvidenceRequirement({ ...input })).toEqual(first);
    expect(buildEvidenceRequirement({ ...input, ordinal: 1 }).requirementId).not.toBe(first.requirementId);
    expect(buildEvidenceRequirement({ ...input, topic: 'alerts_closures' }).requirementId)
      .not.toBe(first.requirementId);
  });

  test('normalizes temporal dates and unique reason/provider lists', () => {
    const requirement = buildEvidenceRequirement({
      ...input,
      acceptedSourceClasses: ['official_owner', 'official_owner'],
      reasonCodes: ['safety_critical_signal', 'safety_critical_signal'],
      temporalScope: { ...input.temporalScope, requestedAt: new Date(input.temporalScope.requestedAt) },
    });
    expect(requirement.temporalScope.requestedAt).toBe(input.temporalScope.requestedAt);
    expect(requirement.acceptedSourceClasses).toEqual(['official_owner']);
    expect(requirement.reasonCodes).toEqual(['safety_critical_signal']);
  });

  test('rejects private requirements and safety freshness downgrades', () => {
    const privateRequirement = { ...buildEvidenceRequirement(input), privacyScope: 'user' };
    expect(validateEvidenceRequirement(privateRequirement)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining(['privacy_scope_invalid']),
    });

    const downgraded = {
      ...buildEvidenceRequirement(input),
      freshnessClass: 'daily',
      maxStaleSeconds: 3600,
    };
    expect(validateEvidenceRequirement(downgraded)).toMatchObject({
      valid: false,
      errors: expect.arrayContaining(['safety_freshness_downgrade']),
    });
  });

  test('route scope participates in identity without changing non-route requirements', () => {
    const routeScope = {
      origin: {
        entityId: 'nps:park:yose', displayName: 'Yosemite National Park',
        latitude: 37.7459, longitude: -119.5332,
      },
      destination: {
        entityId: 'nps:park:sequ', displayName: 'Sequoia National Park',
        latitude: 36.4864, longitude: -118.5658,
      },
      travelMode: 'driving',
      departureTimeBucket: '2026-08-09T12:00:00.000Z',
    };
    const yosemiteToSequoia = buildEvidenceRequirement({ ...input, topic: 'driving_time', routeScope });
    const yosemiteToDeathValley = buildEvidenceRequirement({
      ...input,
      topic: 'driving_time',
      routeScope: {
        ...routeScope,
        destination: {
          entityId: 'nps:park:deva', displayName: 'Death Valley National Park',
          latitude: 36.5054, longitude: -117.0794,
        },
      },
    });
    const walking = buildEvidenceRequirement({
      ...input, topic: 'driving_time', routeScope: { ...routeScope, travelMode: 'walking' },
    });
    const later = buildEvidenceRequirement({
      ...input, topic: 'driving_time',
      routeScope: { ...routeScope, departureTimeBucket: '2026-08-09T18:00:00.000Z' },
    });

    expect(validateEvidenceRequirement(yosemiteToSequoia)).toEqual({ valid: true, errors: [] });
    expect(yosemiteToSequoia.routeScope).toEqual(routeScope);
    expect(new Set([
      yosemiteToSequoia.requirementId,
      yosemiteToDeathValley.requirementId,
      walking.requirementId,
      later.requirementId,
    ])).toHaveProperty('size', 4);
    expect(buildEvidenceRequirement(input)).not.toHaveProperty('routeScope');
  });
});
