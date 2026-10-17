'use strict';

const { resolveDestinationsFromMessage } = require('../genericDestinationResolver');
const { classifyTrailieIntent } = require('../../services/trailieIntentClassifier');
const { planEvidenceRequirements } = require('../../services/evidencePlannerService');

const NOW = new Date('2026-08-12T12:00:00.000Z');

function planFor(prompt, entities) {
  const intent = classifyTrailieIntent({ userPrompt: prompt });
  const requirements = planEvidenceRequirements({
    turnId: 'turn-geo',
    userPrompt: prompt,
    intent,
    resolvedEntities: entities,
    now: NOW,
  });
  return { intent, requirements };
}

describe('planning geography destination identity', () => {
  test('Alaska trip skeleton resolves region/state identity and does not hard-fail destination_identity', () => {
    const prompt = 'Plan logistics for a 10-day Alaska trip, but do not build a day-by-day itinerary yet.';
    const destinations = resolveDestinationsFromMessage(prompt);
    expect(destinations.some((d) => d.entityType === 'state' || d.entityType === 'region')).toBe(true);
    expect(destinations.some((d) => /alaska/i.test(d.displayName))).toBe(true);

    const { intent, requirements } = planFor(prompt, destinations);
    expect(intent.travelerJob).toBe('trip_skeleton');
    const identity = requirements.find((r) => r.topic === 'destination_identity');
    expect(identity).toBeTruthy();
    expect(identity.criticality).not.toBe('hard');
    expect(identity.entity?.entityId).toBeTruthy();
  });

  test('Utah national parks skeleton resolves region identity', () => {
    const prompt = 'Plan a Utah national parks trip skeleton, no day-by-day yet.';
    const destinations = resolveDestinationsFromMessage(prompt);
    expect(destinations.some((d) => /utah/i.test(d.displayName))).toBe(true);
    const { intent, requirements } = planFor(prompt, destinations);
    expect(intent.travelerJob).toBe('trip_skeleton');
    const identity = requirements.find((r) => r.topic === 'destination_identity');
    expect(identity.criticality).not.toBe('hard');
  });

  test('Yellowstone permit question still requires canonical park identity', () => {
    const prompt = 'Do I need a permit to camp in Yellowstone?';
    const destinations = resolveDestinationsFromMessage(prompt);
    expect(destinations.some((d) => d.entityType === 'national_park' && d.parkCode === 'yell')).toBe(true);
    const { intent, requirements } = planFor(prompt, destinations);
    expect(intent.travelerJob).toBe('permits_reservations');
    const identity = requirements.find((r) => r.topic === 'destination_identity');
    expect(identity.criticality).toBe('hard');
    expect(identity.entity.entityId).toMatch(/nps:park:yell/);
  });

  test('Grand Teton + Yellowstone is a multi-park destination', () => {
    const destinations = resolveDestinationsFromMessage(
      'Plan Grand Teton and Yellowstone together.'
    );
    const codes = destinations.map((d) => d.parkCode).filter(Boolean);
    expect(codes).toEqual(expect.arrayContaining(['grte', 'yell']));
  });

  test('vague out west stays ambiguous instead of inventing a park', () => {
    const destinations = resolveDestinationsFromMessage('Plan me a trip out west.');
    expect(destinations.every((d) => d.entityType !== 'national_park')).toBe(true);
    const geo = destinations.find((d) => d.entityType === 'region');
    expect(geo).toBeTruthy();
    expect(geo.resolutionConfidence).toBeLessThan(0.6);
  });
});
