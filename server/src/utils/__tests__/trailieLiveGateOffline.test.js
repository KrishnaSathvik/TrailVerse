'use strict';

/**
 * Offline reproduction of the generic authenticated live-gate semantics.
 * No paid model calls. No demo. No Q1–Q5.
 */

const { parseConstraints } = require('../constraintEngine');
const { resolveDestinationsFromMessage } = require('../genericDestinationResolver');
const { classifyTrailieIntent } = require('../../services/trailieIntentClassifier');
const { planEvidenceRequirements } = require('../../services/evidencePlannerService');
const { extractUserCity } = require('../../services/factsService');
const { applyDepartureContextToPlanningState, buildPlanningStateFromRuntime } = require('../planningState');
const { mergeRefinementPlan, evaluateRefinementOwnership } = require('../itineraryPlanPatch');
const { evaluateItineraryCompleteness } = require('../itineraryCompleteness');
const { renderEvidenceBundleForPrompt } = require('../../prompts/evidenceBundlePromptRenderer');

const NOW = new Date('2026-08-12T12:00:00.000Z');

function threeDayPlan() {
  return {
    intro: 'A 3-day trip.',
    days: [
      { day: 1, dayNumber: 1, stops: [{ name: 'Mammoth area', type: 'scenic_drive', duration: 180 }] },
      { day: 2, dayNumber: 2, stops: [{ name: 'Old Faithful area', type: 'geothermal_area', duration: 180 }] },
      { day: 3, dayNumber: 3, stops: [{ name: 'Canyon area', type: 'viewpoint', duration: 180 }] },
    ],
  };
}

describe('generic live-gate offline regression', () => {
  test('THREAD A: duration, airport continuity, Dallas origin, refinement ownership', () => {
    const a1 = parseConstraints({}, 'Is three days enough for Yellowstone?');
    expect(a1.planningState.dates.durationDays).toBe(3);
    const t1 = classifyTrailieIntent({ userPrompt: 'Is three days enough for Yellowstone?' });
    expect(t1.travelerJob).toBe('trip_duration_advice');

    const t2 = classifyTrailieIntent({
      userPrompt: 'Which airport should I use?',
      priorTripState: { lastTravelerJob: t1.travelerJob, hasActiveTrip: true },
    });
    expect(t2.travelerJob).toBe('airport_strategy');

    const t3 = classifyTrailieIntent({
      userPrompt: "I'm coming from Dallas.",
      priorTripState: {
        lastTravelerJob: t2.travelerJob,
        hasActiveTrip: false,
      },
    });
    expect(t3.travelerJob).toBe('origin_refinement');
    expect(t3.primaryIntent).toBe('flight_strategy');

    const city = extractUserCity("I'm coming from Dallas.");
    const withOrigin = applyDepartureContextToPlanningState(
      buildPlanningStateFromRuntime({ constraints: a1 }),
      city,
      "I'm coming from Dallas."
    );
    expect(withOrigin.transportation.departureCity).toMatch(/Dallas/i);

    const t4 = classifyTrailieIntent({
      userPrompt: 'Okay, build me a realistic day-by-day itinerary.',
      priorTripState: {
        lastTravelerJob: t3.travelerJob,
        hasActiveTrip: true,
        hasItinerary: false,
      },
    });
    expect(t4.travelerJob).toBe('day_by_day_itinerary');

    const prior = threeDayPlan();
    const a5Prompt = 'Make Day 2 slower and reduce driving.';
    const merged = mergeRefinementPlan({
      priorPlan: prior,
      candidatePlan: {
        days: [{ day: 2, dayNumber: 2, stops: [{ name: 'Slower geyser basin', type: 'geothermal_area', duration: 90 }] }],
      },
      userPrompt: a5Prompt,
    });
    expect(merged.plan.days).toHaveLength(3);
    expect(evaluateRefinementOwnership({
      priorPlan: prior,
      nextPlan: merged.plan,
      userPrompt: a5Prompt,
    }).ok).toBe(true);

    const completeness = evaluateItineraryCompleteness({
      itineraryData: merged.plan,
      constraints: { dates: { numDays: 3 } },
      userPrompt: a5Prompt,
      priorItineraryData: prior,
      isRefinement: true,
    });
    expect(completeness.ok).toBe(true);

    const truncatedCompleteness = evaluateItineraryCompleteness({
      itineraryData: { days: [{ day: 2, dayNumber: 2, stops: [{ name: 'Only day 2', duration: 90 }] }] },
      constraints: { dates: { numDays: 3 } },
      userPrompt: a5Prompt,
      priorItineraryData: prior,
      isRefinement: true,
    });
    expect(truncatedCompleteness.ok).toBe(false);
    expect(truncatedCompleteness.reasonCodes).toEqual(
      expect.arrayContaining(['refinement_dropped_unaffected_days'])
    );
  });

  test('THREAD B: Alaska skeleton resolves geography and does not hard-fail identity', () => {
    const prompt = 'Plan logistics for a 10-day Alaska trip, but do not build a day-by-day itinerary yet.';
    const intent = classifyTrailieIntent({ userPrompt: prompt });
    expect(intent.travelerJob).toBe('trip_skeleton');
    const destinations = resolveDestinationsFromMessage(prompt);
    const requirements = planEvidenceRequirements({
      turnId: 'turn-b',
      userPrompt: prompt,
      intent,
      resolvedEntities: destinations,
      now: NOW,
    });
    const identity = requirements.find((r) => r.topic === 'destination_identity');
    expect(identity.entity?.entityId).toBeTruthy();
    expect(identity.criticality).not.toBe('hard');
    expect(intent.primaryIntent).toBe('general_qa');
  });

  test('THREAD C: no-exposure packing keeps non-trail types and does not treat unknown trails as safe', () => {
    const activity = (id, name, types, exposureLevel) => ({
      evidenceId: id,
      topic: 'activities',
      claim: {
        text: `${name} candidate`,
        normalizedValue: { name, activityTypes: types, exposureLevel },
        qualifiers: ['named_activity_candidate'],
      },
      source: { provider: 'nps', sourceClass: 'official_owner', title: name, url: 'https://www.nps.gov/example' },
      observation: { observedAt: '2026-08-12T12:00:00.000Z' },
      quality: { authorityClass: 'official_owner', conflictStatus: 'none' },
      retention: { storeClaimText: true },
    });
    const visitor = {
      evidenceId: 'ev:vc',
      topic: 'visitor_services',
      claim: {
        text: 'Visitor Center exhibits and film.',
        normalizedValue: { name: 'Visitor Center', activityTypes: ['visitor_center'], driveAccessible: true },
        qualifiers: ['named_place_candidate'],
      },
      source: { provider: 'nps', sourceClass: 'official_owner', title: 'Visitor Center', url: 'https://www.nps.gov/example' },
      observation: { observedAt: '2026-08-12T12:00:00.000Z' },
      quality: { authorityClass: 'official_owner', conflictStatus: 'none' },
      retention: { storeClaimText: true },
    };
    const drive = activity('ev:drive', 'Scenic Drive', ['scenic_drive'], null);
    const unknownTrail = activity('ev:trail', 'Unknown Ridge Trail', ['hike', 'trail'], null);
    const lowWalk = activity('ev:walk', 'Paved River Walk', ['walk'], 'low');
    const museum = activity('ev:museum', 'History Museum', ['museum'], null);
    const packed = renderEvidenceBundleForPrompt({
      bundle: {
        resolutions: [
          { requirementId: 'req-act', status: 'satisfied_fresh', evidenceIds: ['ev:trail', 'ev:walk', 'ev:drive', 'ev:museum'] },
          { requirementId: 'req-vs', status: 'satisfied_fresh', evidenceIds: ['ev:vc'] },
        ],
        evidence: [unknownTrail, lowWalk, drive, museum, visitor],
      },
      requirements: [
        { requirementId: 'req-act', topic: 'activities', reasonCodes: ['requested_low_exposure_candidates'] },
        { requirementId: 'req-vs', topic: 'visitor_services', reasonCodes: ['mobility_short_experience'] },
      ],
      maxTokens: 900,
    });
    const typesPresent = [packed.text.includes('Scenic Drive'), packed.text.includes('History Museum'), packed.text.includes('Visitor Center')];
    expect(typesPresent.filter(Boolean).length).toBeGreaterThanOrEqual(2);
    expect(packed.text).toContain('Paved River Walk');
  });

  test('THREAD D: access contingency remains a non-itinerary job', () => {
    const intent = classifyTrailieIntent({
      userPrompt:
        "I'm visiting Glacier with only one full day. What should I prioritize, and what's a good backup plan if Logan Pass access or parking doesn't work out?",
    });
    expect(intent.travelerJob).toBe('access_contingency');
    expect(intent.primaryIntent).toBe('general_qa');
  });

  test('THREAD E: mobility state drives evidence overlays, not overview-only', () => {
    const prompt = "We're taking our parents in their late 60s to Grand Teton for three days. They can't comfortably walk more than about a mile at a time.";
    const constraints = parseConstraints({}, prompt);
    expect(constraints.planningState.mobility.maxWalkMilesPerSegment).toBe(1);
    expect(constraints.planningState.dates.durationDays).toBe(3);
    expect(constraints.planningState.travelers.hasOlderTravelers).toBe(true);

    const destinations = resolveDestinationsFromMessage(prompt);
    const intent = classifyTrailieIntent({ userPrompt: prompt });
    const requirements = planEvidenceRequirements({
      turnId: 'turn-e',
      userPrompt: prompt,
      intent,
      resolvedEntities: destinations,
      constraints: constraints.planningState,
      now: NOW,
    });
    const topics = requirements.map((r) => r.topic);
    expect(topics).toEqual(expect.arrayContaining(['accessibility', 'visitor_services']));
    const reasons = requirements.flatMap((r) => r.reasonCodes || []);
    expect(reasons.some((code) => /access|mobility|short_experience|family_or_access/i.test(code))).toBe(true);
    expect(topics.filter((t) => t === 'overview').length).toBeLessThan(topics.length);
  });
});
