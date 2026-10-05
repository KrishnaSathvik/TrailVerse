'use strict';

/**
 * Phase 12H2-D — actionable contingency answers.
 * Synthetic destinations only. No Rocky / Bear Lake / Trail Ridge goldens.
 */

const { resolveAccessContingency } = require('../constraintFamilies');
const { buildTurnUnderstanding } = require('../../services/turnUnderstanding');
const { resolveTravelerJob } = require('../../services/trailieTravelerJobResolver');
const { classifyTrailieIntent } = require('../../services/trailieIntentClassifier');
const { planEvidenceRequirements } = require('../../services/evidencePlannerService');
const {
  evaluateActionableContingencyAnswer,
  buildActionableContingencyRepairInstructions,
  REASON_CODE,
} = require('../actionableContingencyAnswer');

const CARE = {
  entityId: 'nps:park:care',
  entityType: 'national_park',
  displayName: 'Capitol Reef National Park',
  parkCode: 'care',
  latitude: 38.2,
  longitude: -111.17,
  resolutionConfidence: 1,
};

function turn(prompt) {
  const understanding = buildTurnUnderstanding({ userPrompt: prompt });
  const resolved = resolveTravelerJob({ userPrompt: prompt, understanding });
  const family = resolveAccessContingency(prompt);
  return { understanding, resolved, family };
}

function planTopics(prompt, entity = CARE) {
  const intent = classifyTrailieIntent({ userPrompt: prompt });
  const requirements = planEvidenceRequirements({
    turnId: 'turn-12h2d',
    userPrompt: prompt,
    intent,
    resolvedEntities: [entity],
    now: new Date('2026-09-20T12:00:00.000Z'),
  });
  return { intent, topics: requirements.map((row) => row.topic), requirements };
}

function bundle(names) {
  return {
    evidence: names.map((name, index) => ({
      evidenceId: `ev-${index}`,
      topic: 'activities',
      claim: {
        text: `${name}: an official place.`,
        normalizedValue: { name, activityTypes: ['walk', 'hike'] },
        qualifiers: ['named_activity_candidate'],
      },
      source: { provider: 'nps', sourceClass: 'official_owner', title: name },
    })),
  };
}

describe('alternative-ask recognition (not backup-plan collocation)', () => {
  test.each([
    ["If Capitol Reef parking doesn't work, what's a good backup?"],
    ['If the Scenic Drive is closed at Capitol Reef, give me another option.'],
    ['Haleakala sunrise reservation sold out — what else should we do?'],
    ['If the Channel Islands ferry is cancelled, something else to do on land?'],
    ['If the Crater Lake shuttle is unavailable, what should we do instead?'],
    ['If the viewpoint at White Sands is obscured, a fallback option?'],
  ])('%s → access_contingency', (prompt) => {
    const got = turn(prompt);
    expect(got.family.asksForAlternative).toBe(true);
    expect(got.family.isAccessContingency).toBe(true);
    expect(got.resolved.job).toBe('access_contingency');
    expect(got.understanding.requestedArtifact).not.toBe('itinerary');
  });

  test.each([
    ["What's parking like at Capitol Reef?"],
    ['Is the Scenic Drive open at Capitol Reef?'],
    ["How's the ferry running to Channel Islands this week?"],
  ])('%s stays status-only', (prompt) => {
    const got = turn(prompt);
    expect(got.family.isAccessContingency).toBe(false);
    expect(got.resolved.job).not.toBe('access_contingency');
  });

  test('produce + fallback remains itinerary-dominant', () => {
    const got = turn('Build me a day at Capitol Reef. If parking fills, give me a fallback.');
    expect(got.resolved.job).toBe('day_by_day_itinerary');
    expect(got.understanding.requestedArtifact).toBe('itinerary');
  });
});

describe('contingency evidence includes fallback activities', () => {
  test('a good-backup parking ask fetches activities, not only roads/parking', () => {
    const { intent, topics, requirements } = planTopics(
      "If Capitol Reef parking doesn't work, what's a good backup?",
    );
    expect(intent.travelerJob).toBe('access_contingency');
    expect(topics).toEqual(expect.arrayContaining(['parking', 'roads', 'activities']));
    const activities = requirements.find((row) => row.topic === 'activities');
    expect(activities.reasonCodes).toEqual(
      expect.arrayContaining(['contingency_fallback_activities']),
    );
  });
});

describe('actionable contingency answer contract', () => {
  const candidates = [
    { name: 'Grand Wash', evidenceId: 'ev-1' },
    { name: 'Goosenecks Overlook', evidenceId: 'ev-2' },
    { name: 'Petroglyph Panel', evidenceId: 'ev-3' },
  ];
  const evidence = bundle(candidates.map((row) => row.name));
  const prompt = "If Capitol Reef parking doesn't work, what's a good backup?";

  test('named fallback + why + concrete grounded stops + condition passes', () => {
    const result = evaluateActionableContingencyAnswer({
      text: 'If the visitor-center lot is full, use Grand Wash instead. It stays an easy, short walk with photography along the walls. From there walk the wash to the narrows and stop at the Petroglyph Panel.',
      userPrompt: prompt,
      bundle: evidence,
      candidates,
    });
    expect(result.ok).toBe(true);
    expect(result.fallbackName).toMatch(/grand wash/i);
    expect(result.concreteActions.length).toBeGreaterThanOrEqual(1);
    expect(result.conditionPresent).toBe(true);
    expect(result.fitPresent).toBe(true);
  });

  test('a short mention grounds against a longer official activity title', () => {
    const result = evaluateActionableContingencyAnswer({
      text: 'If parking fills, use Cathedral Valley Road instead. It stays an easy, photogenic drive with short walks. Stop at Goosenecks Overlook.',
      userPrompt: prompt,
      candidates: [
        { name: 'Enjoy a Scenic Drive on Cathedral Valley Road', evidenceId: 'ev-a' },
        { name: 'Goosenecks Overlook', evidenceId: 'ev-b' },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.fallbackName).toMatch(/cathedral valley/i);
  });

  test('a bare alternate road/place fails when evidence has supported activities', () => {
    const result = evaluateActionableContingencyAnswer({
      text: 'Try the Scenic Drive instead.',
      userPrompt: prompt,
      bundle: evidence,
      candidates,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes.length).toBeGreaterThan(0);
  });

  test('invented stops fail', () => {
    const result = evaluateActionableContingencyAnswer({
      text: 'If parking fills, go to Crystal Spire Amphitheater. It is easy and photogenic. Hike Moonladder Gorge and the Glass Arch Loop.',
      userPrompt: prompt,
      bundle: evidence,
      candidates,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain(REASON_CODE.INVENTED);
  });

  test('honest limitation is accepted when no fallback evidence exists', () => {
    const result = evaluateActionableContingencyAnswer({
      text: 'Official sources do not establish a named alternate activity if that parking area fails, so I cannot give a grounded fallback place.',
      userPrompt: prompt,
      bundle: { evidence: [] },
      candidates: [],
    });
    expect(result.ok).toBe(true);
    expect(result.exception).toBe(REASON_CODE.NO_SUPPORTED_FALLBACK);
  });

  test('unsupported invented alternative fails even with empty evidence', () => {
    const result = evaluateActionableContingencyAnswer({
      text: 'If parking fills, go to Crystal Spire Amphitheater instead.',
      userPrompt: prompt,
      bundle: { evidence: [] },
      candidates: [],
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain(REASON_CODE.INVENTED);
  });

  test('status-only answers are not judged as contingency', () => {
    const result = evaluateActionableContingencyAnswer({
      required: false,
      text: 'Parking at the visitor center often fills by late morning.',
      userPrompt: "What's parking like at Capitol Reef?",
      bundle: evidence,
      candidates,
    });
    expect(result.ok).toBe(true);
  });
});

describe('constraints survive fallback selection', () => {
  test('easy-hike + photography remain on a backup ask', () => {
    const prompt = "Easy hikes and photography at Capitol Reef. If parking doesn't work, what's a good backup?";
    const got = turn(prompt);
    expect(got.resolved.job).toBe('access_contingency');
    expect(got.understanding.actionableContingencyRequired).toBe(true);
    expect(got.understanding.explicitConstraints.some((item) => item.field === 'hiking')).toBe(true);
    expect(got.understanding.softPreferences.some((item) => item.field === 'photography')).toBe(true);
  });

  test('an exposed strenuous trail is not a valid easy-hike fallback', () => {
    const result = evaluateActionableContingencyAnswer({
      text: 'If parking fills, use Grand Wash instead. It is a strenuous exposed scramble. Hike Grand Wash.',
      userPrompt: "Easy hikes at Capitol Reef. If parking doesn't work, what's a good backup?",
      bundle: bundle(['Grand Wash']),
      candidates: [{ name: 'Grand Wash', evidenceId: 'ev-1' }],
      constraints: { hiking: 'easy', avoidExposure: true },
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain(REASON_CODE.CONSTRAINT);
  });
});

describe('repair instructions', () => {
  test('thin fallback asks to add grounded actions without refetching', () => {
    const text = buildActionableContingencyRepairInstructions({
      reasonCodes: [REASON_CODE.MISSING_ACTIONS, REASON_CODE.MISSING_FIT],
      candidates: [{ name: 'Grand Wash' }, { name: 'Goosenecks Overlook' }],
    });
    expect(text).toMatch(/grounded fallback|keep the grounded/i);
    expect(text).toMatch(/why it fits/i);
    expect(text).toMatch(/concrete/i);
    expect(text).toMatch(/failure condition|condition/i);
    expect(text).not.toMatch(/fetch|re-run evidence|refetch/i);
  });
});
