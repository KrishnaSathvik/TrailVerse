'use strict';

const { classifyTrailieIntent } = require('../trailieIntentClassifier');
const { planEvidenceRequirements } = require('../evidencePlannerService');

const yell = {
  entityId: 'nps:park:yell',
  entityType: 'national_park',
  displayName: 'Yellowstone National Park',
  latitude: 44.6,
  longitude: -110.5,
  resolutionConfidence: 1,
};

function classifyAndPlan(prompt, priorTripState = null) {
  const intent = classifyTrailieIntent({ userPrompt: prompt, priorTripState });
  const requirements = planEvidenceRequirements({
    turnId: 'turn-follow-up',
    userPrompt: prompt,
    intent,
    resolvedEntities: [yell],
    priorTripState,
    now: new Date('2026-08-12T12:00:00.000Z'),
  });
  return { intent, requirements, topics: requirements.map((item) => item.topic) };
}

describe('Yellowstone conversation job continuity', () => {
  test('duration → airport → origin → build itinerary → slower day keeps job state', () => {
    const t1 = classifyAndPlan('Is three days enough for Yellowstone?');
    expect(t1.intent.travelerJob).toBe('trip_duration_advice');
    expect(t1.intent.primaryIntent).toBe('general_qa');

    const t2 = classifyAndPlan('Which airport?', {
      hasActiveTrip: true,
      lastTravelerJob: t1.intent.travelerJob,
    });
    expect(t2.intent.travelerJob).toBe('airport_strategy');
    expect(t2.intent.primaryIntent).toBe('flight_strategy');
    // 2026-08-26 contract repair: "which airport?" plans no evidence, because
    // nothing implements airport discovery and no origin has been supplied yet.
    // It used to plan `flight_strategy` and an unscoped `driving_time`, neither
    // of which any provider could serve — the answer was always model-authored.
    expect(t2.topics).toEqual(['destination_identity']);

    const t3 = classifyAndPlan("I'm coming from Dallas.", {
      hasActiveTrip: true,
      lastTravelerJob: t2.intent.travelerJob,
    });
    expect(t3.intent.travelerJob).toBe('origin_refinement');
    expect(t3.intent.primaryIntent).toBe('flight_strategy');
    // …and NOW the drive is real, because the traveler named the origin. This is
    // the behaviour the unscoped requirement was standing in for.
    const drive = t3.requirements.find((item) => item.topic === 'driving_time');
    expect(drive).toBeDefined();
    expect(drive.routeScope.origin.displayName).toMatch(/dallas/i);
    expect(drive.routeScope.destination.entityId).toBe('nps:park:yell');

    const t4 = classifyAndPlan('Build the itinerary.', {
      hasActiveTrip: true,
      lastTravelerJob: t3.intent.travelerJob,
      hasItinerary: false,
    });
    expect(t4.intent.travelerJob).toBe('day_by_day_itinerary');
    expect(['simple_itinerary', 'full_trip']).toContain(t4.intent.primaryIntent);

    const t5 = classifyAndPlan('Make Day 2 slower.', {
      hasActiveTrip: true,
      hasItinerary: true,
      lastTravelerJob: t4.intent.travelerJob,
    });
    expect(t5.intent.travelerJob).toBe('itinerary_refinement');
    expect(t5.intent.primaryIntent).toBe('trip_refinement');
  });
});
