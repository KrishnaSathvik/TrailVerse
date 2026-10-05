'use strict';

/**
 * Phase 12H2-D held-out evaluation. Destinations and wording were not used
 * in development tests.
 */

const { resolveAccessContingency } = require('../constraintFamilies');
const { buildTurnUnderstanding } = require('../../services/turnUnderstanding');
const { resolveTravelerJob } = require('../../services/trailieTravelerJobResolver');
const { classifyTrailieIntent } = require('../../services/trailieIntentClassifier');
const { planEvidenceRequirements } = require('../../services/evidencePlannerService');
const {
  evaluateActionableContingencyAnswer,
  REASON_CODE,
} = require('../actionableContingencyAnswer');

function classify(prompt) {
  const understanding = buildTurnUnderstanding({ userPrompt: prompt });
  const resolved = resolveTravelerJob({ userPrompt: prompt, understanding });
  const family = resolveAccessContingency(prompt);
  return { understanding, resolved, family };
}

const PINN = {
  entityId: 'nps:park:pinn',
  entityType: 'national_park',
  displayName: 'Pinnacles National Park',
  parkCode: 'pinn',
  latitude: 36.49,
  longitude: -121.16,
  resolutionConfidence: 1,
};

describe('12H2-D independent evaluation', () => {
  test('alternative ask recognized without backup-plan collocation', () => {
    const prompt = 'If the Pinnacles high peaks trail is closed, what is a good alternative?';
    const got = classify(prompt);
    expect(got.family.asksForAlternative).toBe(true);
    expect(got.family.isAccessContingency).toBe(true);
    expect(got.resolved.job).toBe('access_contingency');
    expect(got.understanding.actionableContingencyRequired).toBe(true);
    expect(got.understanding.requestedArtifact).not.toBe('itinerary');
  });

  test('correct contingency job fetches fallback activities', () => {
    const prompt = 'If the Pinnacles high peaks trail is closed, what is a good alternative?';
    const intent = classifyTrailieIntent({ userPrompt: prompt });
    const requirements = planEvidenceRequirements({
      turnId: 'turn-12h2d-ind',
      userPrompt: prompt,
      intent,
      resolvedEntities: [PINN],
      now: new Date('2026-09-20T12:00:00.000Z'),
    });
    expect(intent.travelerJob).toBe('access_contingency');
    expect(requirements.map((row) => row.topic)).toEqual(
      expect.arrayContaining(['activities', 'roads', 'alerts_closures']),
    );
  });

  test('grounded fallback with why, actions, and condition passes', () => {
    const result = evaluateActionableContingencyAnswer({
      text: 'If the high peaks trail stays closed, use Bear Gulch instead. It stays an easy, photogenic walk under the overhangs. Walk the caves to the reservoir and stop at the Bear Gulch Nature Center.',
      userPrompt: 'If the Pinnacles high peaks trail is closed, what is a good alternative?',
      candidates: [
        { name: 'Bear Gulch', evidenceId: 'ev-1' },
        { name: 'Bear Gulch Nature Center', evidenceId: 'ev-2' },
      ],
      constraints: { hiking: 'easy' },
    });
    expect(result.ok).toBe(true);
    expect(result.fallbackName).toMatch(/bear gulch/i);
    expect(result.fitPresent).toBe(true);
    expect(result.conditionPresent).toBe(true);
    expect(result.concreteActions.length).toBeGreaterThanOrEqual(1);
  });

  test('status-only ferry question is not a fallback contract', () => {
    const prompt = 'Is the Isle Royale ferry running this week?';
    const got = classify(prompt);
    expect(got.family.isAccessContingency).toBe(false);
    expect(got.resolved.job).not.toBe('access_contingency');
    const result = evaluateActionableContingencyAnswer({
      required: false,
      text: 'The ferry schedule is posted on the park site for this week.',
      userPrompt: prompt,
      candidates: [{ name: 'Rock Harbor' }],
    });
    expect(result.ok).toBe(true);
  });

  test('invented stops still fail independently', () => {
    const result = evaluateActionableContingencyAnswer({
      text: 'If the road is closed, go to Crystal Spire Amphitheater. Hike Moonladder Gorge.',
      userPrompt: 'If the North Cascades highway is closed, another option?',
      candidates: [{ name: 'Diablo Lake Overlook', evidenceId: 'ev-1' }],
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain(REASON_CODE.INVENTED);
  });

  test('no supported fallback plus honest limitation is accepted', () => {
    const result = evaluateActionableContingencyAnswer({
      text: 'Official sources do not establish a named alternate activity if that access fails, so I cannot give a grounded fallback place.',
      userPrompt: 'If the Congaree boardwalk is closed, something else to do?',
      bundle: { evidence: [] },
      candidates: [],
    });
    expect(result.ok).toBe(true);
    expect(result.exception).toBe(REASON_CODE.NO_SUPPORTED_FALLBACK);
  });

  test('easy hiking and photography survive a held-out backup ask', () => {
    const prompt = 'Easy walking and photography at Voyageurs. If the boat is cancelled, what should we do instead?';
    const got = classify(prompt);
    expect(got.resolved.job).toBe('access_contingency');
    expect(got.understanding.explicitConstraints.some((item) => item.field === 'hiking')
      || /easy walk/i.test(got.understanding.normalizedText)).toBe(true);
    expect(got.understanding.softPreferences.some((item) => item.field === 'photography')).toBe(true);
  });
});
