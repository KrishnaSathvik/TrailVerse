'use strict';

const { buildTrailiePromptV2 } = require('../trailiePromptV2');
const { composeOperationalGenerationDirectives } = require('../../utils/operationalGenerationDirectives');

function activityEvidence({ id, entityId, name, exposureLevel, activityTypes = ['hiking'] }) {
  return {
    evidenceId: id,
    entityId,
    topic: 'activities',
    claim: {
      identity: `place:${name}`,
      text: `${name} official activity record.`,
      normalizedValue: {
        name,
        activityTypes,
        exposureLevel,
        operationalFacts: [],
      },
      qualifiers: ['named_activity_candidate'],
    },
    source: { provider: 'nps', sourceClass: 'official_owner' },
    observation: { observedAt: '2026-09-01T00:00:00.000Z' },
    quality: { authorityClass: 'official_owner' },
    retention: { storeClaimText: true },
  };
}

function buildExposurePrompt({ entityId, safeTrail, unknownTrail, unsafeTrail, safeFacility }) {
  const evidence = [
    activityEvidence({ id: 'ev-low', entityId, name: safeTrail, exposureLevel: 'low' }),
    activityEvidence({ id: 'ev-unknown', entityId, name: unknownTrail, exposureLevel: null }),
    activityEvidence({ id: 'ev-high', entityId, name: unsafeTrail, exposureLevel: 'high' }),
    activityEvidence({
      id: 'ev-facility', entityId, name: safeFacility, exposureLevel: null,
      activityTypes: ['orientation'],
    }),
  ];
  const bundle = {
    requestId: `request:${entityId}`,
    resolutions: [{
      requirementId: 'req-activities',
      status: 'satisfied_fresh',
      evidenceIds: evidence.map((item) => item.evidenceId),
    }],
    evidence,
  };
  const constraints = { avoidExposure: true, preferences: { avoidExposure: true } };
  const operationalDirectives = composeOperationalGenerationDirectives({
    evidenceBundle: bundle,
    constraints,
    userPrompt: 'Build a relaxed itinerary without exposed terrain or drop-offs.',
  });
  return buildTrailiePromptV2({
    mode: 'architect',
    evidenceBundle: bundle,
    requirements: [{ requirementId: 'req-activities', topic: 'activities' }],
    constraints,
    tripState: { destinationRefs: [{ entityId }] },
    history: [],
    userRequest: 'Build a relaxed itinerary without exposed terrain or drop-offs.',
    operationalDirectives,
  });
}

describe.each([
  {
    label: 'Olympic', entityId: 'nps:park:olym', safeTrail: 'Madison Falls Trail',
    unknownTrail: 'Hurricane Ridge Viewpoint', unsafeTrail: 'Klahhane Ridge Trail',
    safeFacility: 'Olympic National Park Visitor Center',
  },
  {
    label: 'Zion', entityId: 'nps:park:zion', safeTrail: 'Pa’rus Trail',
    unknownTrail: 'Canyon Overlook Trail', unsafeTrail: 'Angels Landing',
    safeFacility: 'Zion Human History Museum',
  },
  {
    label: 'synthetic non-destination', entityId: 'synthetic:reserve:snake-hollow',
    safeTrail: 'Marsh Boardwalk', unknownTrail: 'Cliff Viewpoint',
    unsafeTrail: 'Knife Edge Path', safeFacility: 'Snake Hollow Nature Center',
  },
])('attempt-1 hard exposure construction — $label', (fixture) => {
  test('offers only confirmed-low exposure candidates plus non-exposure experiences', () => {
    const prompt = buildExposurePrompt(fixture);
    expect(prompt.publicPrefix).toContain(fixture.safeTrail);
    expect(prompt.publicPrefix).toContain(fixture.safeFacility);
    expect(prompt.publicPrefix).not.toContain(fixture.unknownTrail);
    expect(prompt.publicPrefix).not.toContain(fixture.unsafeTrail);
    expect(prompt.privateSuffix).toContain(fixture.safeTrail);
    expect(prompt.privateSuffix).toMatch(/never (?:author|guess|invent)/i);
  });
});
