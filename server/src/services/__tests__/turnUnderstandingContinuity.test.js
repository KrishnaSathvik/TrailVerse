'use strict';

/**
 * WP-TU §10/§18 — follow-up turns keep their owner, and a misread artifact
 * request cannot spend repeated structured generations.
 */

const { classifyTrailieIntent } = require('../trailieIntentClassifier');
const { buildTurnUnderstanding } = require('../turnUnderstanding');
const { executeTrailieV2Turn } = require('../trailieV2ExecutionService');
const { buildEvidenceBundle } = require('../../utils/evidenceBundle');

const PLAN = {
  hasItinerary: true,
  existingCanonicalPlan: { days: [{ dayNumber: 1 }, { dayNumber: 2 }] },
};

describe('§10 — active decisions own their follow-ups', () => {
  test('a lodging simplification after a skeleton is a lodging decision', () => {
    const intent = classifyTrailieIntent({
      userPrompt: 'I hate changing hotels every night. Simplify it.',
      priorTripState: { lastTravelerJob: 'trip_skeleton', primaryDestination: { parkCode: 'zion' } },
    });
    expect(intent.travelerJob).toBe('lodging_strategy');
    expect(intent.structurePolicy).toBe('optional');
  });

  test('a new hard constraint on an existing plan refines it rather than rebuilding', () => {
    const understanding = buildTurnUnderstanding({
      userPrompt: 'Actually, my knee has been bothering me lately. Keep the trip, but cut anything that requires much walking.',
      priorTripState: PLAN,
    });
    expect(understanding.taskFamily).toBe('itinerary_refinement');
    expect(understanding.requestedArtifact).toBe('itinerary_patch');
    // The constraint must be canonical, not merely present in the raw text.
    expect(understanding.explicitConstraints.find((c) => c.field === 'walkingTolerance')?.value).toBe('limited');
    // …and no mileage was invented from the knee mention.
    expect(understanding.explicitConstraints.find((c) => c.field === 'maxWalkMilesPerSegment')).toBeUndefined();
  });

  test('a preference follow-up after a comparison stays conversational, not structural', () => {
    const intent = classifyTrailieIntent({
      userPrompt: "We'd rather avoid spending half the trip in the car.",
      priorTripState: { lastTravelerJob: 'destination_compare' },
    });
    expect(intent.structurePolicy).toBe('optional');
    expect(intent.forbiddenArtifacts).toEqual([]);
  });

  test('an origin follow-up still belongs to the airport decision', () => {
    const intent = classifyTrailieIntent({
      userPrompt: "I'm coming from Dallas.",
      priorTripState: { lastTravelerJob: 'airport_strategy' },
    });
    expect(['origin_refinement', 'airport_strategy']).toContain(intent.travelerJob);
  });
});

describe('§18 — attempt accounting', () => {
  function buildDeps(structurePolicy) {
    const dispatches = [];
    return {
      dispatches,
      deps: {
        classifyIntent: () => ({
          version: 'trailie-intent-v2.0.0',
          source: 'deterministic',
          primaryIntent: 'simple_itinerary',
          verticals: ['itinerary'],
          depth: 'planning',
          freshness: 'stable',
          actionability: 'planning',
          scope: 'single_destination',
          entities: [],
          confidence: 0.9,
          reasonCodes: [],
          compound: false,
          requiresLunaShadow: false,
          travelerJob: 'day_by_day_itinerary',
          structurePolicy,
        }),
        planRequirements: () => [],
        resolveDeterministicRender: () => ({ eligible: false }),
        detectContradiction: () => [],
        resolveEvidence: async ({ requestId }) => buildEvidenceBundle({ requestId, resolutions: [], candidates: [] }),
        now: () => new Date('2026-08-17T12:00:00.000Z'),
        newTurnId: () => 'turn-accounting',
        streamGeneration: false,
        responseAdapters: {},
        executeResponses: async (request) => {
          dispatches.push(request);
          return {
            provider: 'openai',
            model: 'gpt-5.6-terra',
            outputText: 'A complete, validated prose answer about the park that is well over the fallback length threshold and contains no unsupported current claims whatsoever.',
            toolCalls: [],
            completionStatus: 'complete',
            stopReason: 'stop',
            refusal: null,
            usage: { inputTokens: 800, outputTokens: 150, cachedInputTokens: 0 },
          };
        },
        enabled: true,
      },
    };
  }

  const input = {
    userMessage: 'What should we know before visiting?',
    conversationContext: { history: [] },
    tripState: null,
    constraints: null,
    resolvedContext: {},
  };

  test('a non-required structure policy never retries for the missing artifact', async () => {
    const { deps, dispatches } = buildDeps('optional');
    const result = await executeTrailieV2Turn(input, deps);
    expect(result.status).toBe('complete');
    expect(dispatches).toHaveLength(1);
    expect(result.attempts).toHaveLength(1);
  });

  test('a required policy repairs a bounded number of times, then degrades safely', async () => {
    const { deps, dispatches } = buildDeps('required');
    const result = await executeTrailieV2Turn(input, deps);
    expect(dispatches.length).toBeGreaterThan(1);
    expect(dispatches.length).toBeLessThanOrEqual(3);
    expect(result.status).toBe('complete');
    expect(result.validation.degradedReasonCodes).toContain('structured_artifact_unavailable');
  });
});
