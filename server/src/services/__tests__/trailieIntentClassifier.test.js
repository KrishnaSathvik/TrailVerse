'use strict';

const EXPECTED_PRIMARY_INTENTS = [
  'general_qa',
  'destination_discovery',
  'place_discovery',
  'compare',
  'lodging_strategy',
  'hotel_live_search',
  'flight_strategy',
  'flight_live_search',
  'transport',
  'local_business_food',
  'activities_tours_events',
  'permit_camping',
  'simple_itinerary',
  'full_trip',
  'deep_research',
  'live_in_trip_assistance',
  'trip_refinement',
  'meta_help',
  'unsupported_non_travel',
];

const goldenFixtures = require('../../eval/trailieIntentGoldenFixtures');

describe('Trailie v2 intent contract', () => {
  test('exports the frozen canonical primary-intent taxonomy', () => {
    let classifier;
    let loadError = null;
    try {
      classifier = require('../trailieIntentClassifier');
    } catch (error) {
      loadError = error;
    }

    expect(loadError).toBeNull();
    expect(classifier.PRIMARY_INTENTS).toEqual(EXPECTED_PRIMARY_INTENTS);
  });

  test('returns a strict schema-valid classification for every golden fixture', () => {
    const {
      classifyTrailieIntent,
      validateIntentClassification,
    } = require('../trailieIntentClassifier');

    for (const fixture of goldenFixtures) {
      const result = classifyTrailieIntent({
        userPrompt: fixture.userPrompt,
        priorTripState: fixture.priorTripState,
      });
      const validation = validateIntentClassification(result);
      expect({ id: fixture.id, ...validation }).toEqual({ id: fixture.id, valid: true, errors: [] });
      expect(Object.keys(result).sort()).toEqual([
        'actionability',
        'compound',
        'confidence',
        'depth',
        'destinationRelationship',
        'entities',
        'executionContract',
        'forbiddenArtifacts',
        'freshness',
        'intentSource',
        'primaryIntent',
        'reasonCodes',
        'requestedArtifact',
        'requiresLunaShadow',
        'scope',
        'source',
        'structurePolicy',
        'travelerJob',
        'tripContext',
        'understanding',
        'understandingConfidence',
        'version',
        'verticals',
      ]);
    }
  });

  test('meets the frozen primary-intent and vertical golden gates', () => {
    const { classifyTrailieIntent } = require('../trailieIntentClassifier');
    let correctPrimary = 0;
    let truePositive = 0;
    let falsePositive = 0;
    let falseNegative = 0;

    for (const fixture of goldenFixtures) {
      const result = classifyTrailieIntent(fixture);
      if (result.primaryIntent === fixture.expectedIntent) correctPrimary += 1;
      if (fixture.forbiddenIntent) {
        expect({ id: fixture.id, primaryIntent: result.primaryIntent }).not.toEqual({
          id: fixture.id,
          primaryIntent: fixture.forbiddenIntent,
        });
      }

      const expected = new Set(fixture.expectedVerticals || []);
      const actual = new Set(result.verticals);
      for (const value of actual) expected.has(value) ? truePositive++ : falsePositive++;
      for (const value of expected) if (!actual.has(value)) falseNegative++;

      expect({ id: fixture.id, depth: result.depth }).toEqual({ id: fixture.id, depth: fixture.expectedDepth });
      expect({ id: fixture.id, freshness: result.freshness }).toEqual({ id: fixture.id, freshness: fixture.expectedFreshness });
      expect({ id: fixture.id, actionability: result.actionability }).toEqual({ id: fixture.id, actionability: fixture.expectedActionability });
      if (fixture.expectedScope) expect(result.scope).toBe(fixture.expectedScope);
      for (const reason of fixture.requiredReasonCodes || []) {
        expect({ id: fixture.id, hasReason: result.reasonCodes.includes(reason) }).toEqual({ id: fixture.id, hasReason: true });
      }
    }

    const primaryAccuracy = correctPrimary / goldenFixtures.length;
    const verticalF1 = (2 * truePositive) / ((2 * truePositive) + falsePositive + falseNegative);
    expect(primaryAccuracy).toBeGreaterThanOrEqual(0.97);
    expect(verticalF1).toBeGreaterThanOrEqual(0.95);
  });

  test('never downgrades safety-critical freshness signals', () => {
    const { classifyTrailieIntent } = require('../trailieIntentClassifier');
    for (const prompt of [
      'Is there a wildfire near Yosemite?',
      'How bad is the smoke at Sequoia?',
      'There is an emergency closure on our route.',
    ]) {
      expect(classifyTrailieIntent({ userPrompt: prompt }).freshness).toBe('safety_critical');
    }
  });

  test('does not treat a priority-plus-backup-plan question as an itinerary request', () => {
    const { classifyTrailieIntent } = require('../trailieIntentClassifier');
    const advice = classifyTrailieIntent({
      userPrompt:
        "I'm visiting Glacier with only one full day. What should I prioritize, and what's a good backup plan if Logan Pass access or parking doesn't work out?",
    });
    expect(advice.primaryIntent).toBe('general_qa');
    expect(advice.reasonCodes).toContain('priority_contingency_advice');
    expect(advice.actionability).toBe('recommendation');

    const itinerary = classifyTrailieIntent({
      userPrompt: 'Plan me a day in Glacier National Park.',
    });
    expect(itinerary.primaryIntent).toBe('simple_itinerary');
  });

  test('short backup-plan parking question stays advice, not transport or itinerary', () => {
    const { classifyTrailieIntent } = require('../trailieIntentClassifier');
    const result = classifyTrailieIntent({
      userPrompt: "What's a good backup plan if Logan Pass parking is full?",
    });
    expect(result.travelerJob).toBe('access_contingency');
    expect(result.primaryIntent).toBe('general_qa');
    expect(result.primaryIntent).not.toBe('transport');
    expect(result.primaryIntent).not.toBe('simple_itinerary');
  });

  test('explicit not-day-by-day logistics does not tag the itinerary vertical', () => {
    const { classifyTrailieIntent } = require('../trailieIntentClassifier');
    const result = classifyTrailieIntent({
      userPrompt:
        "Plan logistics, prices, places and things to see for 10 days in Alaska, but don't build a day-by-day itinerary yet.",
    });
    expect(result.travelerJob).toBe('trip_skeleton');
    expect(result.primaryIntent).toBe('general_qa');
    expect(result.verticals).not.toContain('itinerary');
  });

  test('uses active-trip mutation as a hard override without changing a no-state request into a refinement', () => {
    const { classifyTrailieIntent } = require('../trailieIntentClassifier');
    expect(classifyTrailieIntent({
      userPrompt: 'Make day 2 easier',
      priorTripState: { hasActiveTrip: true, hasItinerary: true },
    }).primaryIntent).toBe('trip_refinement');
    expect(classifyTrailieIntent({ userPrompt: 'Make day 2 easier' }).primaryIntent).toBe('simple_itinerary');
  });

  test('sends only ambiguous or compound deterministic results to Luna shadow', () => {
    const { classifyTrailieIntent } = require('../trailieIntentClassifier');
    const obvious = classifyTrailieIntent({ userPrompt: 'Compare Zion and Bryce Canyon.' });
    const ambiguous = classifyTrailieIntent({ userPrompt: 'Help me figure out something for our trip.' });
    const compound = classifyTrailieIntent({ userPrompt: 'Where should I stay and eat near Olympic National Park?' });

    expect(obvious.requiresLunaShadow).toBe(false);
    expect(obvious.confidence).toBeGreaterThanOrEqual(0.9);
    expect(ambiguous.requiresLunaShadow).toBe(true);
    expect(ambiguous.confidence).toBeLessThan(0.8);
    expect(compound.compound).toBe(true);
    expect(compound.requiresLunaShadow).toBe(true);
  });

  test('publishes accuracy, vertical F1, safety downgrades, and a full confusion matrix', () => {
    let evaluator;
    let loadError = null;
    try {
      evaluator = require('../../eval/trailieIntentEvaluation');
    } catch (error) {
      loadError = error;
    }
    expect(loadError).toBeNull();

    const report = evaluator.evaluateIntentFixtures(goldenFixtures);
    expect(report.fixtureCount).toBe(goldenFixtures.length);
    expect(report.schemaValidRate).toBe(1);
    expect(report.primaryIntentAccuracy).toBeGreaterThanOrEqual(0.97);
    expect(report.verticalF1).toBeGreaterThanOrEqual(0.95);
    expect(report.safetyFreshnessDowngrades).toBe(0);
    expect(report.confusionMatrix.general_qa).toBeDefined();
    expect(report.confusionMatrix.live_in_trip_assistance.live_in_trip_assistance).toBeGreaterThan(0);
  });
});
