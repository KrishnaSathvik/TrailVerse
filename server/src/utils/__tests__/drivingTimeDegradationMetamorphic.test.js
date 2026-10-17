'use strict';

/**
 * Phase 12D — driving-time evidence hardness and degradation.
 *
 * Destinations are not 12A/12B/12C parks and not the frozen Bryce/Capitol Reef
 * held-out prompts. Asserts requirement criticality and gate outcomes, never
 * exact prose.
 */

const { planEvidenceRequirements } = require('../../services/evidencePlannerService');
const { evaluateEvidenceGate } = require('../../services/trailieV2ExecutionService');
const { classifyTrailieIntent } = require('../../services/trailieIntentClassifier');
const { parseConstraints } = require('../constraintEngine');

const SAGUARO = {
  entityId: 'nps:park:sagu',
  entityType: 'national_park',
  displayName: 'Saguaro National Park',
  latitude: 32.147,
  longitude: -110.788,
  resolutionConfidence: 1,
  parkCode: 'sagu',
};
const EVERGLADES = {
  entityId: 'nps:park:ever',
  entityType: 'national_park',
  displayName: 'Everglades National Park',
  latitude: 25.309,
  longitude: -80.899,
  resolutionConfidence: 1,
  parkCode: 'ever',
};

const NOW = new Date('2026-09-19T12:00:00.000Z');

function plan(prompt, entities, extra = {}) {
  const parsed = parseConstraints({ formData: {} }, prompt);
  return planEvidenceRequirements({
    turnId: 'turn:12d-drive',
    userPrompt: prompt,
    intent: classifyTrailieIntent({ userPrompt: prompt }),
    resolvedEntities: entities,
    constraints: parsed,
    tripScope: parsed.planningState?.tripScope || parsed.tripScope || null,
    now: NOW,
    ...extra,
  });
}

function drivingTimes(requirements) {
  return requirements.filter((r) => r.topic === 'driving_time');
}

function bundleSatisfying(requirements, { unsatisfied = [] } = {}) {
  return {
    resolutions: requirements.map((r) => ({
      requirementId: r.requirementId,
      status: unsatisfied.includes(r.topic) ? 'unsupported' : 'satisfied_fresh',
    })),
  };
}

describe('ordinary multi-destination planning without a numeric cap', () => {
  test('inter-destination driving_time is planned but not hard', () => {
    const prompt = 'Build four days through Saguaro and Everglades with little backtracking.';
    const requirements = plan(prompt, [SAGUARO, EVERGLADES]);
    const drives = drivingTimes(requirements);
    expect(drives.length).toBeGreaterThan(0);
    expect(drives.every((d) => d.criticality !== 'hard')).toBe(true);
    expect(drives.some((d) => d.routeScope?.origin && d.routeScope?.destination)).toBe(true);
  });

  test('missing Distance Matrix does not fail the evidence gate', () => {
    const prompt = 'Build four days through Saguaro and Everglades with little backtracking.';
    const requirements = plan(prompt, [SAGUARO, EVERGLADES]);
    const gate = evaluateEvidenceGate(
      requirements,
      bundleSatisfying(requirements, { unsatisfied: ['driving_time'] }),
    );
    expect(gate.hardComplete).toBe(true);
    expect(gate.unmetHardReasons).not.toContain('unmet_hard_driving_time');
  });
});

describe('explicit numeric drive cap remains fail-closed', () => {
  test('maxDailyDriveMinutes makes inter-destination driving_time hard', () => {
    const prompt = 'Build four days through Saguaro and Everglades. Keep driving under 3 hours per day.';
    const requirements = plan(prompt, [SAGUARO, EVERGLADES]);
    const drives = drivingTimes(requirements);
    expect(drives.length).toBeGreaterThan(0);
    expect(drives.some((d) => d.criticality === 'hard')).toBe(true);
  });

  test('missing provider minutes with a numeric cap is an unmet hard requirement', () => {
    const prompt = 'Build four days through Saguaro and Everglades. Keep driving under 3 hours per day.';
    const requirements = plan(prompt, [SAGUARO, EVERGLADES]);
    const gate = evaluateEvidenceGate(
      requirements,
      bundleSatisfying(requirements, { unsatisfied: ['driving_time'] }),
    );
    expect(gate.hardComplete).toBe(false);
    expect(gate.unmetHardReasons).toContain('unmet_hard_driving_time');
  });
});

describe('direct drive-time question cannot fabricate minutes', () => {
  test('how-long route question plans hard driving_time', () => {
    const prompt = 'How long is the drive from Saguaro to Everglades?';
    const requirements = plan(prompt, [SAGUARO, EVERGLADES]);
    const drives = drivingTimes(requirements);
    expect(drives.length).toBeGreaterThan(0);
    expect(drives.some((d) => d.criticality === 'hard')).toBe(true);
    const intent = classifyTrailieIntent({ userPrompt: prompt });
    expect(intent.travelerJob).toBe('route_planning');
    expect(intent.primaryIntent).not.toMatch(/itinerary/);
  });

  test('missing verified minutes fail-closes the duration question', () => {
    const prompt = 'How long is the drive from Saguaro to Everglades?';
    const requirements = plan(prompt, [SAGUARO, EVERGLADES]);
    const gate = evaluateEvidenceGate(
      requirements,
      bundleSatisfying(requirements, { unsatisfied: ['driving_time'] }),
    );
    expect(gate.hardComplete).toBe(false);
    expect(gate.unmetHardReasons).toContain('unmet_hard_driving_time');
  });
});
