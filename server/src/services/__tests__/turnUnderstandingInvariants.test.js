'use strict';

/**
 * WP-TU §16 — invariants that must hold for ANY traveler wording, not just the
 * sentences that happened to fail the broad gate. Each one encodes a rule the
 * old architecture could violate silently.
 */

const { buildTurnUnderstanding } = require('../turnUnderstanding');
const { classifyTrailieIntent } = require('../trailieIntentClassifier');
const { planEvidenceRequirements } = require('../evidencePlannerService');
const { buildTripScopeFromMessage } = require('../../utils/roadTripContract');
const { normalizeUserText } = require('../../utils/lexicalNormalization');
const { getProviderTestSummary, resetProviderTestSummary } = require('../../config/providerTestPolicy');

const NOW = new Date('2026-08-17T12:00:00.000Z');

const ACADIA = {
  entityId: 'nps:park:acad',
  entityType: 'national_park',
  displayName: 'Acadia National Park',
  latitude: 44.409,
  longitude: -68.247,
  resolutionConfidence: 1,
};
const SMOKIES = {
  entityId: 'nps:park:grsm',
  entityType: 'national_park',
  displayName: 'Great Smoky Mountains National Park',
  latitude: 35.611,
  longitude: -83.489,
  resolutionConfidence: 1,
};

function requirementsFor(prompt, entities) {
  const intent = classifyTrailieIntent({ userPrompt: prompt });
  // `tripScope` is the planner's real parameter name — it is how the resolved
  // destination relationship reaches evidence planning in production (via
  // constraints.tripScope), so the guard must be exercised through it.
  const tripScope = buildTripScopeFromMessage(prompt, { destinations: entities });
  return {
    intent,
    tripScope,
    requirements: planEvidenceRequirements({
      turnId: `turn-${prompt.slice(0, 16)}`,
      userPrompt: prompt,
      intent,
      resolvedEntities: entities,
      tripScope,
      now: NOW,
    }),
  };
}

beforeEach(() => resetProviderTestSummary());

describe('§16.1 — typography cannot change semantics', () => {
  const variants = [
    ["Don't build the daily itinerary yet.", 'Don’t build the daily itinerary yet.'],
    ["We can't walk more than a mile.", 'We can’t walk more than a mile.'],
    ["I'm going next weekend — what should I reserve?", 'I’m going next weekend — what should I reserve?'],
  ];
  test.each(variants)('%s ≡ %s across job resolution', (ascii, typographic) => {
    const a = classifyTrailieIntent({ userPrompt: ascii });
    const b = classifyTrailieIntent({ userPrompt: typographic });
    expect(b.travelerJob).toBe(a.travelerJob);
    expect(b.primaryIntent).toBe(a.primaryIntent);
    expect(b.structurePolicy).toBe(a.structurePolicy);
  });

  test('normalization is idempotent', () => {
    const once = normalizeUserText('Don’t   build  the itinerary…');
    expect(normalizeUserText(once)).toBe(once);
  });
});

describe('§16.2 — two destinations do not create route legs by themselves', () => {
  test('a choice between two parks produces no route legs and no driving requirement', () => {
    const prompt = 'Would you pick Acadia or Great Smoky Mountains for four days in early October?';
    const scope = buildTripScopeFromMessage(prompt, { destinations: [ACADIA, SMOKIES] });
    expect(scope.destinationRelationship).toBe('alternative_choice');
    expect(scope.routeLegs).toHaveLength(0);

    const { requirements } = requirementsFor(prompt, [ACADIA, SMOKIES]);
    expect(requirements.filter((r) => r.topic === 'driving_time')).toHaveLength(0);
  });

  test('an explicit road trip between the same two parks still gets its legs', () => {
    const prompt = 'Plan a road trip from Acadia to Great Smoky Mountains.';
    const scope = buildTripScopeFromMessage(prompt, { destinations: [ACADIA, SMOKIES] });
    expect(scope.destinationRelationship).toBe('route');
    expect(scope.routeLegs.length).toBeGreaterThan(0);
  });
});

describe('§16.3 — a forbidden artifact overrides weaker positive inference', () => {
  test.each([
    'Plan a week in southern Utah but don’t build the daily itinerary yet.',
    'Help me plan 5 days in Utah. No day-by-day itinerary yet.',
    'Sketch the trip shape for 6 days — not the itinerary yet.',
  ])('%s', (prompt) => {
    const intent = classifyTrailieIntent({ userPrompt: prompt });
    expect(intent.travelerJob).toBe('trip_skeleton');
    expect(intent.forbiddenArtifacts).toContain('itinerary');
    expect(intent.structurePolicy).toBe('optional');
  });
});

describe('§16.4/§16.5 — dates and durations cannot force an itinerary', () => {
  test('a date plus a destination is not an itinerary request', () => {
    const intent = classifyTrailieIntent({
      userPrompt: "If I'm going to Rocky Mountain National Park next weekend, what do I actually need to reserve or check before I leave?",
    });
    expect(intent.travelerJob).toBe('permits_reservations');
    expect(intent.structurePolicy).toBe('optional');
  });

  test('a duration alone, with an operational question, stays operational', () => {
    const intent = classifyTrailieIntent({ userPrompt: 'We have two days at Zion. Do we need timed entry?' });
    expect(intent.travelerJob).toBe('permits_reservations');
  });

  test('an explicit build request with a duration is still an itinerary', () => {
    const intent = classifyTrailieIntent({ userPrompt: 'Build me a 3-day Zion itinerary.' });
    expect(intent.travelerJob).toBe('day_by_day_itinerary');
    expect(intent.structurePolicy).toBe('required');
  });
});

describe('§16.6 — weakly inferred tasks cannot create hard evidence', () => {
  test('hard driving evidence never comes from a destination choice', () => {
    const { requirements, tripScope } = requirementsFor(
      'Acadia or Great Smoky Mountains for a fall trip?',
      [ACADIA, SMOKIES]
    );
    expect(tripScope.destinationRelationship).toBe('alternative_choice');
    const hard = requirements.filter((r) => r.topic === 'driving_time' && r.criticality === 'hard');
    expect(hard).toHaveLength(0);
  });

  test('even an itinerary-shaped turn cannot route between two alternatives', () => {
    // The exact amplification from the broad gate: a full-trip intent over two
    // parks the traveler is choosing between must not demand a drive.
    const prompt = 'Plan four days in early October — would you pick Acadia or Great Smoky Mountains?';
    const { requirements, tripScope } = requirementsFor(prompt, [ACADIA, SMOKIES]);
    expect(tripScope.routeLegs).toHaveLength(0);
    expect(requirements.filter((r) => r.topic === 'driving_time' && r.criticality === 'hard')).toHaveLength(0);
  });

  test('the second defense holds even when job resolution is wrong', () => {
    // Force the exact failure shape: a full_trip intent (as if the job had been
    // misread) over two parks the traveler is CHOOSING between. Evidence
    // planning must still refuse to invent the leg, so one bad classification
    // cannot block the turn.
    const prompt = 'Acadia or Great Smoky Mountains?';
    const intent = {
      ...classifyTrailieIntent({ userPrompt: prompt }),
      primaryIntent: 'full_trip',
      travelerJob: 'day_by_day_itinerary',
      depth: 'deep',
      verticals: ['itinerary', 'transport'],
    };
    const requirements = planEvidenceRequirements({
      turnId: 'turn-misread-job',
      userPrompt: prompt,
      intent,
      resolvedEntities: [ACADIA, SMOKIES],
      tripScope: buildTripScopeFromMessage(prompt, { destinations: [ACADIA, SMOKIES] }),
      now: NOW,
    });
    expect(requirements.filter((r) => r.topic === 'driving_time' && r.criticality === 'hard')).toHaveLength(0);
  });

  test('a genuine combined multi-park trip still gets its inter-park driving_time requirement', () => {
    const prompt = 'Plan a realistic 7-day Acadia and Great Smoky Mountains trip for two adults';
    const { requirements } = requirementsFor(prompt, [ACADIA, SMOKIES]);
    const drives = requirements.filter((r) => r.topic === 'driving_time');
    expect(drives.length).toBeGreaterThan(0);
    expect(drives.every((r) => r.routeScope)).toBe(true);
    expect(drives.every((r) => r.criticality !== 'hard')).toBe(true);
  });
});

describe('§16.7 — stated constraints reach canonical state', () => {
  const { extractMobilityConstraints, extractActivityPreferences } = require('../../utils/travelerStateExtraction');

  test('exposure aversion survives extraction', () => {
    expect(extractActivityPreferences('one of us hates exposed trails').avoidExposure).toBe(true);
    expect(extractActivityPreferences('we aren’t comfortable with drop-offs').avoidExposure).toBe(true);
  });

  test('a non-numeric walking limit survives extraction without inventing a number', () => {
    const mobility = extractMobilityConstraints('Keep the trip, but cut anything that requires much walking.');
    expect(mobility.walkingTolerance).toBe('limited');
    expect(mobility.maxWalkMilesPerSegment).toBeNull();
  });

  test('a non-hiker preference survives extraction', () => {
    expect(extractActivityPreferences("My wife doesn't really hike.").hiking).toBe('none');
  });
});

describe('§16.8 — nothing may be invented', () => {
  test('a bare medical mention produces no capability claim', () => {
    const u = buildTurnUnderstanding({ userPrompt: 'My knee has been bothering me lately.' });
    expect(u.explicitConstraints).toHaveLength(0);
  });

  test('every extracted constraint quotes the traveler', () => {
    const u = buildTurnUnderstanding({
      userPrompt: 'One of us hates exposed trails and we want a relaxed pace.',
    });
    expect(u.explicitConstraints.length).toBeGreaterThan(0);
    for (const constraint of u.explicitConstraints) {
      expect(constraint.span).toBeTruthy();
      expect(u.normalizedText.toLowerCase()).toContain(constraint.span.toLowerCase());
    }
  });
});

describe('provider isolation across the whole understanding path', () => {
  test('no live provider is constructed or dispatched', () => {
    classifyTrailieIntent({ userPrompt: 'Would you pick Acadia or Great Smoky Mountains?' });
    requirementsFor('Plan two full days in Acadia.', [ACADIA]);
    const summary = getProviderTestSummary();
    expect(summary.liveOpenAiConstructors).toBe(0);
    expect(summary.liveAnthropicConstructors).toBe(0);
    expect(summary.liveProviderDispatches).toBe(0);
    expect(summary.externalProviderHttpRequests).toBe(0);
  });
});
