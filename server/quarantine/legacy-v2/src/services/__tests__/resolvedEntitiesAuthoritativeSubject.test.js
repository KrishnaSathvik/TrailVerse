'use strict';

/**
 * WP-TU Phase 3 Task 6 — `resolvedEntities` becomes a CONSUMER of the single
 * authoritative classification (Task 3's `intent`), not just Task 5's
 * already-correct PRE-INTENT baseline (tripScope -> allExtractedParks ->
 * entry -> geocode). Two override rules, in `applyResolvedEntitiesOverride`:
 *
 *   Rule 1 — `understanding.subjectDestinations.length > 0`: project ALL of
 *            them, unconditionally (even for a refinement/edit turn).
 *   Rule 2 — subjectDestinations empty AND not a plan-targeting refinement
 *            (REFINEMENT_JOBS / requestedArtifact === 'itinerary_patch'):
 *            fall back to `understanding.priorConversationalSubject`,
 *            hydrated with catalog coordinates.
 *   Neither rule fires for a plan-targeting refinement with no named
 *   destination — the baseline (already correctly on the active plan via
 *   tripScope) is left untouched. Neither rule fires for a genuinely empty
 *   turn either — same untouched-baseline behavior.
 *
 * All 7 acceptance-table rows are driven through the REAL
 * `classifyTrailieIntent` (real regex/relationship/job resolution — no
 * intent-object mocks), with only `priorTripState` hand-built to the exact
 * shape `buildClassifierPriorTripState` produces in production.
 */

const { classifyTrailieIntent } = require('../../../../../src/services/trailieIntentClassifier');
const {
  executeTrailieV2Turn,
  __testables: { applyResolvedEntitiesOverride },
} = require('../../../../../src/services/trailieV2ExecutionService');
const { resolveParkIdentityBinding } = require('../../../../../src/utils/generationContractBinding');
const { buildEvidenceBundle } = require('../../../../../src/utils/evidenceBundle');

function baseline(entityId, displayName, lat, lon) {
  const parkCode = entityId.split(':').pop();
  return {
    resolvedEntities: [{ entityId, displayName, latitude: lat, longitude: lon, resolutionConfidence: 1 }],
    primaryPark: { parkCode, parkName: displayName, entityId, latitude: lat, longitude: lon },
    destinationCount: 1,
  };
}

const REDWOOD_BASELINE = baseline('nps:park:redw', 'Redwood National Park', 41.2, -124.0);
const BADLANDS_BASELINE = baseline('nps:park:badl', 'Badlands National Park', 43.75, -102.50);
const ZION_BASELINE = baseline('nps:park:zion', 'Zion National Park', 37.30, -113.05);

function entityIds(resolvedContext) {
  return resolvedContext.resolvedEntities.map((e) => e.entityId);
}

describe('Task 6 — applyResolvedEntitiesOverride, real classifier, all 7 acceptance rows', () => {
  test('Row 1: Redwood active -> "Is October good in Acadia?" -> resolvedEntities = Acadia (tripScope stays Redwood, untouched by this task)', () => {
    const intent = classifyTrailieIntent({
      userPrompt: 'Is October good in Acadia?',
      priorTripState: { primaryDestination: { parkCode: 'redw', name: 'Redwood' }, hasItinerary: true },
    });
    const rc = applyResolvedEntitiesOverride(REDWOOD_BASELINE, intent);
    expect(entityIds(rc)).toEqual(['nps:park:acad']);
    expect(rc.primaryPark.parkCode).toBe('acad');
    expect(rc.destinationCount).toBe(1);
  });

  test('Row 2: -> "What about November?" -> resolvedEntities STILL = Acadia (via priorConversationalSubject, Rule 2)', () => {
    const intent = classifyTrailieIntent({
      userPrompt: 'What about November?',
      priorTripState: {
        primaryDestination: { parkCode: 'redw', name: 'Redwood' },
        hasItinerary: true,
        lastConversationalSubject: {
          subjectDestinations: [{ name: 'Acadia', parkCode: 'acad' }],
          primaryDestination: { name: 'Acadia', parkCode: 'acad' },
          destinationRelationship: 'single',
        },
      },
    });
    expect(intent.understanding.subjectDestinations).toEqual([]);
    expect(intent.understanding.priorConversationalSubject).not.toBeNull();
    const rc = applyResolvedEntitiesOverride(REDWOOD_BASELINE, intent);
    expect(entityIds(rc)).toEqual(['nps:park:acad']);
  });

  test('Row 3: Yosemite vs Sequoia comparison -> resolvedEntities = BOTH (Rule 1, current turn names both)', () => {
    const intent = classifyTrailieIntent({
      userPrompt: 'Yosemite vs Sequoia — which should I visit?',
      priorTripState: null,
    });
    expect(intent.travelerJob).toBe('destination_compare');
    const rc = applyResolvedEntitiesOverride({ resolvedEntities: [], primaryPark: null, destinationCount: 0 }, intent);
    expect(entityIds(rc)).toEqual(['nps:park:yose', 'nps:park:sequ']);
    expect(rc.destinationCount).toBe(2);
  });

  test('Row 4: -> "Which one has easier hiking?" -> resolvedEntities STILL = BOTH (Rule 2, priorConversationalSubject carries both)', () => {
    const intent = classifyTrailieIntent({
      userPrompt: 'Which one has easier hiking?',
      priorTripState: {
        lastConversationalSubject: {
          subjectDestinations: [{ name: 'Yosemite', parkCode: 'yose' }, { name: 'Sequoia', parkCode: 'sequ' }],
          primaryDestination: { name: 'Yosemite', parkCode: 'yose' },
          destinationRelationship: 'alternative_choice',
        },
      },
    });
    expect(intent.understanding.subjectDestinations).toEqual([]);
    const rc = applyResolvedEntitiesOverride({ resolvedEntities: [], primaryPark: null, destinationCount: 0 }, intent);
    expect(entityIds(rc)).toEqual(['nps:park:yose', 'nps:park:sequ']);
  });

  test('Row 5: Redwood active -> "Actually plan Badlands instead" -> resolvedEntities = Badlands (Rule 1; tripScope also becomes Badlands via Task 4, unchanged by this task)', () => {
    const intent = classifyTrailieIntent({
      userPrompt: 'Actually plan Badlands instead',
      priorTripState: { primaryDestination: { parkCode: 'redw', name: 'Redwood' }, hasItinerary: true },
    });
    expect(intent.tripContext.activeContextAction).toBe('set');
    const rc = applyResolvedEntitiesOverride(REDWOOD_BASELINE, intent);
    expect(entityIds(rc)).toEqual(['nps:park:badl']);
  });

  test('Row 6: Badlands active -> "For my Redwood trip, change Day 2" -> resolvedEntities = Redwood (Rule 1 wins even though this is an edit request targeting a DIFFERENT active trip)', () => {
    const intent = classifyTrailieIntent({
      userPrompt: 'For my Redwood trip, change Day 2',
      priorTripState: { primaryDestination: { parkCode: 'badl', name: 'Badlands' }, hasItinerary: true },
    });
    expect(intent.travelerJob).toBe('itinerary_refinement');
    expect(intent.understanding.requestedArtifact).toBe('itinerary_patch');
    expect(intent.understanding.subjectDestinations.map((d) => d.parkCode)).toEqual(['redw']);
    const rc = applyResolvedEntitiesOverride(BADLANDS_BASELINE, intent);
    expect(entityIds(rc)).toEqual(['nps:park:redw']);
  });

  test('Row 7: Badlands itinerary -> "Make Day 2 easier" -> resolvedEntities STAYS Badlands (deliberate absence of override: plan-targeting refinement, no named destination)', () => {
    const intent = classifyTrailieIntent({
      userPrompt: 'Make Day 2 easier',
      priorTripState: { primaryDestination: { parkCode: 'badl', name: 'Badlands' }, hasItinerary: true },
    });
    expect(intent.travelerJob).toBe('itinerary_refinement');
    expect(intent.understanding.subjectDestinations).toEqual([]);
    const rc = applyResolvedEntitiesOverride(BADLANDS_BASELINE, intent);
    // Untouched baseline — same reference, not just same value.
    expect(rc).toBe(BADLANDS_BASELINE);
    expect(entityIds(rc)).toEqual(['nps:park:badl']);
  });

  test('genuinely empty turn (park_cta Zion, nothing else) requires NO new code path — neither rule fires, baseline untouched', () => {
    const intent = classifyTrailieIntent({ userPrompt: 'What is there to do?', priorTripState: null });
    expect(intent.understanding.subjectDestinations).toEqual([]);
    expect(intent.understanding.priorConversationalSubject).toBeNull();
    const rc = applyResolvedEntitiesOverride(ZION_BASELINE, intent);
    expect(rc).toBe(ZION_BASELINE);
    expect(entityIds(rc)).toEqual(['nps:park:zion']);
  });
});

describe('Task 6 — resolveParkIdentityBinding needed the corrected primaryPark/destinationCount too', () => {
  test('a corrected resolvedContext (resolvedEntities + primaryPark + destinationCount) binds correctly to the NEW destination', () => {
    const intent = classifyTrailieIntent({
      userPrompt: 'Actually plan Badlands instead',
      priorTripState: { primaryDestination: { parkCode: 'redw', name: 'Redwood' }, hasItinerary: true },
    });
    const corrected = applyResolvedEntitiesOverride(REDWOOD_BASELINE, intent);
    const binding = resolveParkIdentityBinding(corrected);
    expect(binding).not.toBeNull();
    expect(binding.parkCode).toBe('badl');
  });

  test('leaving primaryPark stale (only resolvedEntities corrected) would have silently failed the binding closed — this is why withOverriddenResolvedEntities also derives primaryPark/destinationCount', () => {
    const intent = classifyTrailieIntent({
      userPrompt: 'Actually plan Badlands instead',
      priorTripState: { primaryDestination: { parkCode: 'redw', name: 'Redwood' }, hasItinerary: true },
    });
    const corrected = applyResolvedEntitiesOverride(REDWOOD_BASELINE, intent);
    const staleShapeOnlyEntitiesFixed = {
      ...REDWOOD_BASELINE,
      resolvedEntities: corrected.resolvedEntities, // fixed
      // primaryPark/destinationCount deliberately LEFT stale (still Redwood)
    };
    expect(resolveParkIdentityBinding(staleShapeOnlyEntitiesFixed)).toBeNull();
  });
});

describe('Task 6 — real wiring: applyResolvedEntitiesOverride is actually consulted at planRequirements (WP5A entry point)', () => {
  function classification(overrides = {}) {
    return {
      version: 'trailie-intent-v2.0.0',
      source: 'deterministic',
      primaryIntent: 'general_qa',
      verticals: ['parks'],
      depth: 'quick',
      freshness: 'stable',
      actionability: 'informational',
      scope: 'single_destination',
      entities: [],
      confidence: 0.9,
      reasonCodes: ['general_travel_question'],
      compound: false,
      requiresLunaShadow: false,
      travelerJob: null,
      understanding: { primaryDestination: null, subjectDestinations: [] },
      tripContext: { relationship: 'continuation', activeContextAction: 'preserve' },
      ...overrides,
    };
  }

  test('resolvedEntities reaching planRequirements reflects the Rule-1 override, not the stale pre-intent baseline', async () => {
    const capturedResolvedEntities = [];
    const executeResponses = jest.fn(async () => ({
      provider: 'openai',
      model: 'gpt-5.6-terra',
      outputText: 'A complete, validated prose answer well over the fallback length threshold.',
      toolCalls: [],
      completionStatus: 'complete',
      stopReason: 'stop',
      refusal: null,
      usage: { inputTokens: 800, outputTokens: 150, cachedInputTokens: 0 },
    }));
    const resolveEvidence = jest.fn(async ({ requirements = [], requestId }) => buildEvidenceBundle({
      requestId,
      resolutions: requirements.map((r) => ({ requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: [] })),
      candidates: [],
    }));

    const deps = {
      classifyIntent: jest.fn(() => classification({
        understanding: {
          primaryDestination: { name: 'Badlands National Park', parkCode: 'badl', lat: 43.75, lon: -102.50 },
          subjectDestinations: [{ name: 'Badlands National Park', parkCode: 'badl', lat: 43.75, lon: -102.50 }],
        },
        tripContext: { relationship: 'new', activeContextAction: 'set' },
      })),
      planRequirements: jest.fn((args) => {
        capturedResolvedEntities.push(args.resolvedEntities);
        return [];
      }),
      resolveDeterministicRender: jest.fn(() => ({ eligible: false })),
      detectContradiction: jest.fn(() => []),
      now: () => new Date('2026-09-04T12:00:00.000Z'),
      newTurnId: () => 'turn-task6',
      streamGeneration: false,
      responseAdapters: {},
      executeResponses,
      resolveEvidence,
    };

    const result = await executeTrailieV2Turn({
      userMessage: 'Actually plan Badlands instead',
      conversationContext: { history: [] },
      tripState: null,
      constraints: null,
      resolvedContext: {
        resolvedEntities: [{ entityId: 'nps:park:redw', displayName: 'Redwood National Park', latitude: 41.2, longitude: -124.0, resolutionConfidence: 1 }],
        primaryPark: { parkCode: 'redw', parkName: 'Redwood National Park', entityId: 'nps:park:redw', latitude: 41.2, longitude: -124.0 },
        destinationCount: 1,
      },
    }, { ...deps, enabled: true });

    expect(result.status).toBe('complete');
    expect(capturedResolvedEntities).toHaveLength(1);
    expect(capturedResolvedEntities[0].map((e) => e.entityId)).toEqual(['nps:park:badl']);
  });
});
