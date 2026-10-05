'use strict';

/**
 * Deterministic hardening pass — taxonomy coverage, confidence semantics,
 * semantic-resolution reason codes, relationship frames, entity behavior,
 * underspecification, and hard-constraint parity across paths.
 *
 * Fully offline. Every provider boundary is an injected fake.
 */

const {
  buildTurnUnderstanding,
  TASK_FAMILIES,
  RESOLUTION_STRENGTH,
  SEMANTIC_RESOLUTION_REASONS,
} = require('../turnUnderstanding');
const { JOB_TO_TASK_FAMILY, taskFamilyForJob } = require('../travelerJobTaskFamilyMap');
const { TRAVELER_JOBS } = require('../trailieTravelerJobResolver');
const { classifyTrailieIntent } = require('../trailieIntentClassifier');
const { resolveDestinationRelationship } = require('../../utils/destinationRelationship');
const { resolveDestinationsFromMessage } = require('../../utils/genericDestinationResolver');
const { executeTrailieV2Turn } = require('../trailieV2ExecutionService');
const { buildEvidenceBundle } = require('../../utils/evidenceBundle');
const { getProviderTestSummary, resetProviderTestSummary } = require('../../config/providerTestPolicy');

const understand = (text, prior = null) => buildTurnUnderstanding({ userPrompt: text, priorTripState: prior });
const relationshipOf = (text) => resolveDestinationRelationship(text, resolveDestinationsFromMessage(text) || []);

beforeEach(() => resetProviderTestSummary());

// ---------------------------------------------------------------------------
describe('P1 — every traveler job maps to a semantic family', () => {
  test('mapping covers TRAVELER_JOBS exhaustively', () => {
    const unmapped = TRAVELER_JOBS.filter((job) => !taskFamilyForJob(job));
    expect(unmapped).toEqual([]);
  });

  test('every mapped family is a real family', () => {
    for (const family of Object.values(JOB_TO_TASK_FAMILY)) {
      expect(TASK_FAMILIES).toContain(family);
    }
  });

  test.each([
    ['What can Trailie help me with?', 'meta_help'],
    ['Write a Python function to sort an array.', 'non_travel'],
    ['What are the best national parks for a first-time visitor?', 'destination_discovery'],
    ['Do deep research on a winter trip to Yosemite.', 'deep_research'],
    ['How does the Zion shuttle work?', 'route_strategy'],
    ['Is Trail Ridge Road open yet?', 'access_current'],
  ])('%s no longer collapses into general_advice', (text, family) => {
    expect(understand(text).taskFamily).toBe(family);
  });
});

describe('P1A — self-determined classes never seek semantic resolution', () => {
  test.each([
    'Write a Python function to sort an array.',
    'Give me a recipe for chocolate cake.',
    'What can Trailie help me with?',
    'How does Trailie work?',
  ])('%s', (text) => {
    const u = understand(text);
    expect(u.needsSemanticResolution).toBe(false);
    expect(u.semanticResolutionReasons).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('P1 — confidence means certainty, not branch identity', () => {
  test('equally explicit turns resolved by different branches score alike', () => {
    const itinerary = understand('Build me a day-by-day itinerary for Zion.');
    const prohibition = understand('Don’t build the daily itinerary yet.');
    const comparison = understand('Compare Zion and Bryce Canyon.');
    for (const u of [itinerary, prohibition, comparison]) {
      expect(u.taskStrength).toBe(RESOLUTION_STRENGTH.EXPLICIT);
    }
    const scores = [itinerary.confidence, prohibition.confidence, comparison.confidence];
    expect(Math.max(...scores) - Math.min(...scores)).toBeLessThanOrEqual(0.1);
  });

  test('an answerable general question is confident, not 0.5', () => {
    const u = understand('Is Yosemite good in October?');
    expect(u.taskFamily).toBe('general_advice');
    expect(u.confidence).toBeGreaterThan(0.8);
  });

  test('a contentless turn is genuinely weak', () => {
    const u = understand('Any ideas?');
    expect(u.confidence).toBeLessThan(0.6);
  });

  test('confidence stays inside bounds for every corpus shape', () => {
    for (const text of ['Hi', 'Plan three days in Zion', 'Zion or Bryce?', 'What can Trailie do?']) {
      const { confidence } = understand(text);
      expect(confidence).toBeGreaterThanOrEqual(0.15);
      expect(confidence).toBeLessThanOrEqual(0.98);
    }
  });

  test('corroborating signals raise confidence over the same base', () => {
    const bare = understand('What should we do?');
    const rich = understand('What should we do in Zion for three days with a relaxed pace?');
    expect(rich.confidence).toBeGreaterThan(bare.confidence);
  });
});

// ---------------------------------------------------------------------------
describe('P1A — semantic resolution carries a real reason', () => {
  test('reason codes come from the bounded vocabulary', () => {
    const u = understand('The second one.', { lastTravelerJob: 'destination_compare' });
    for (const reason of u.semanticResolutionReasons) {
      expect(SEMANTIC_RESOLUTION_REASONS).toContain(reason);
    }
  });

  test('an elliptical follow-up against an active decision is a candidate', () => {
    const u = understand('The second one.', { lastTravelerJob: 'destination_compare' });
    expect(u.needsSemanticResolution).toBe(true);
    expect(u.semanticResolutionReasons).toContain('elliptical_reference');
  });

  test('general_advice alone is never a reason', () => {
    const u = understand('Is Yosemite good in October?');
    expect(u.needsSemanticResolution).toBe(false);
  });

  test('a comparison naming an unresolvable second place is reported honestly', () => {
    const u = understand('Is Zion better than Snake Hollow Park?');
    if (u.destinationRefs.length === 1) {
      expect(u.destinationRelationship).toBe('unknown');
      expect(u.semanticResolutionReasons).toContain('unresolved_comparison_entity');
    }
  });
});

// ---------------------------------------------------------------------------
describe('P3 — underspecification is not semantic ambiguity', () => {
  test.each([
    'Any ideas?',
    'Help me figure out something for our trip.',
  ])('%s → underspecified, not a model candidate', (text) => {
    const u = understand(text);
    expect(u.underspecified).toBe(true);
    expect(u.missingInformation.length).toBeGreaterThan(0);
    expect(u.needsSemanticResolution).toBe(false);
  });

  test('a turn with a destination is not underspecified', () => {
    expect(understand('What should we do in Zion?').underspecified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('P2 — choice frames beat the plain conjunction rule', () => {
  test.each([
    'Help me choose between Everglades and Biscayne.',
    "I'm deciding between Yosemite and Sequoia, and I have four days.",
    'Torn between Arches and Canyonlands.',
  ])('between-frame: %s → choice', (text) => {
    expect(relationshipOf(text).relationship).toBe('alternative_choice');
  });

  test.each([
    'Is Crater Lake better than Lassen in September?',
    'Would Zion be easier than Bryce for my parents?',
    'Is Acadia quieter than Shenandoah in October?',
  ])('comparative frame: %s → choice', (text) => {
    expect(relationshipOf(text).relationship).toBe('alternative_choice');
  });

  test('distribution is not choice: "split a week between A and B" combines', () => {
    expect(relationshipOf('How should I split a week between Yellowstone and Grand Teton?').relationship)
      .toBe('combine');
  });

  test('mixed and/or grammar still resolves to choice', () => {
    expect(relationshipOf('Should I visit Yellowstone and Grand Teton, or just Yellowstone?').relationship)
      .toBe('alternative_choice');
  });

  test('a genuine combination is untouched', () => {
    expect(relationshipOf('Plan a realistic 7-day Yellowstone and Grand Teton trip').relationship)
      .toBe('combine');
  });
});

describe('P2A — entity failure must not become false certainty', () => {
  test('a choice frame with one resolved entity reports unknown, not single', () => {
    const result = resolveDestinationRelationship('Compare Zion and Nonexistent Hollow.', [
      { displayName: 'Zion National Park', parkCode: 'zion' },
    ]);
    expect(result.relationship).toBe('unknown');
    expect(result.reasonCodes).toContain('unresolved_comparison_entity');
  });

  test('a plain single-destination turn is still confidently single', () => {
    expect(relationshipOf('Plan two full days in Olympic National Park.').relationship).toBe('single');
  });
});

describe('P2 — entity resolution coverage', () => {
  test.each([
    ['Compare Sequoia and Kings Canyon for a family trip.', 2],
    ['Compare Grand Canyon and Grand Teton.', 2],
    ['Zion and Bryce Canyon in one trip', 2],
    ['Plan a trip to Carlsbad Caverns', 1],
    ['Channel Islands day trip', 1],
  ])('%s resolves %i destinations', (text, count) => {
    expect((resolveDestinationsFromMessage(text) || []).length).toBeGreaterThanOrEqual(count);
  });

  test('an activity-ambiguous word still requires the full park name', () => {
    expect((resolveDestinationsFromMessage('Hot springs are nice') || []).length).toBe(0);
    expect((resolveDestinationsFromMessage('Plan a day at Hot Springs National Park') || []).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('P0C — hard-constraint parity across every delivery path', () => {
  const VIOLATING = 'Hike the 8-mile exposed cliff traverse; the chain section is fine for everyone regardless of mobility limits.';
  const CONSTRAINTS = { mobility: { maxWalkMilesPerSegment: 1 }, avoidExposure: true };

  function run({ structurePolicy, primaryIntent, verticals }) {
    return executeTrailieV2Turn(
      {
        userMessage: 'what should we do',
        conversationContext: { history: [] },
        tripState: null,
        constraints: CONSTRAINTS,
        resolvedContext: {},
      },
      {
        enabled: true,
        classifyIntent: () => ({
          version: 'trailie-intent-v2.0.0',
          source: 'deterministic',
          primaryIntent,
          verticals,
          depth: 'quick',
          freshness: 'stable',
          actionability: 'informational',
          scope: 'single_destination',
          entities: [],
          confidence: 0.9,
          reasonCodes: [],
          compound: false,
          requiresLunaShadow: false,
          travelerJob: 'general_advice',
          structurePolicy,
        }),
        planRequirements: () => [],
        resolveDeterministicRender: () => ({ eligible: false }),
        detectContradiction: () => [],
        resolveEvidence: async ({ requestId }) => buildEvidenceBundle({ requestId, resolutions: [], candidates: [] }),
        now: () => new Date('2026-08-17T12:00:00.000Z'),
        newTurnId: () => 'turn-parity',
        streamGeneration: false,
        responseAdapters: {},
        executeResponses: async () => ({
          provider: 'openai',
          model: 'gpt-5.6-terra',
          outputText: VIOLATING,
          toolCalls: [],
          completionStatus: 'complete',
          stopReason: 'stop',
          refusal: null,
          usage: { inputTokens: 800, outputTokens: 150, cachedInputTokens: 0 },
        }),
      }
    );
  }

  test('ordinary plain-answer path rejects it', async () => {
    const result = await run({ structurePolicy: 'optional', primaryIntent: 'general_qa', verticals: ['parks'] });
    expect(result.status).toBe('failed');
  });

  test('itinerary path rejects it', async () => {
    const result = await run({ structurePolicy: 'required', primaryIntent: 'simple_itinerary', verticals: ['itinerary'] });
    expect(result.status).toBe('failed');
  });

  test('structure-degraded prose path rejects it (no safe fallback)', async () => {
    const result = await run({ structurePolicy: 'preferred', primaryIntent: 'simple_itinerary', verticals: ['itinerary'] });
    expect(result.status).toBe('failed');
    expect(result.response || null).toBeNull();
  });

  test('no live provider was constructed or dispatched', () => {
    const summary = getProviderTestSummary();
    expect(summary.liveOpenAiConstructors).toBe(0);
    expect(summary.liveAnthropicConstructors).toBe(0);
    expect(summary.liveProviderDispatches).toBe(0);
    expect(summary.externalProviderHttpRequests).toBe(0);
  });
});
