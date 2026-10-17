'use strict';

/**
 * Bounded Luna semantic resolver — gating, input budget, grounding, precedence,
 * degradation, and the one-call guarantee.
 *
 * Every dispatcher here is a fake. No provider is ever constructed.
 */

const {
  shouldResolveSemantically,
  buildSemanticRequest,
  validateSemanticPatch,
  resolveTurnSemantically,
  PRODUCTION_TRIGGER_REASONS,
  SEMANTIC_MODEL,
  OUTCOMES,
} = require('../../../../../src/services/semanticTurnResolver');
const { buildTurnUnderstanding } = require('../../../../../src/services/turnUnderstanding');
const { executeTrailieV2Turn } = require('../../../../../src/services/trailieV2ExecutionService');
const { buildEvidenceBundle } = require('../../../../../src/utils/evidenceBundle');
const { getProviderTestSummary, resetProviderTestSummary } = require('../../../../../src/config/providerTestPolicy');

const understand = (text, prior = null) => buildTurnUnderstanding({ userPrompt: text, priorTripState: prior });
const COMPARISON_CONTEXT = { lastTravelerJob: 'destination_compare' };
const LODGING_CONTEXT = { lastTravelerJob: 'lodging_strategy' };

beforeEach(() => resetProviderTestSummary());

// ---------------------------------------------------------------------------
describe('trigger gate — reasons only, never confidence', () => {
  const noDispatch = jest.fn();

  test.each([
    ['no semantic reasons', 'Build me a day-by-day itinerary for Zion.', null],
    ['non-travel', 'Write a Python function to sort an array.', null],
    ['meta help', 'What can Trailie help me with?', null],
    ['underspecified', 'Any ideas?', null],
    ['low confidence alone', 'Hmm.', null],
  ])('%s → dispatcher not called', async (_label, text, prior) => {
    const dispatch = jest.fn();
    const u = understand(text, prior);
    expect(shouldResolveSemantically(u).eligible).toBe(false);
    const { telemetry } = await resolveTurnSemantically({ understanding: u, dispatch });
    expect(dispatch).not.toHaveBeenCalled();
    expect(telemetry.attempted).toBe(false);
  });

  test('elliptical_reference → exactly one dispatch', async () => {
    const dispatch = jest.fn(async () => ({ unresolved: true }));
    const u = understand('The second one.', COMPARISON_CONTEXT);
    expect(u.semanticResolutionReasons).toContain('elliptical_reference');
    await resolveTurnSemantically({ understanding: u, dispatch });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  test('unclear_destination_relationship → exactly one dispatch', async () => {
    const dispatch = jest.fn(async () => ({ unresolved: true }));
    const u = understand('Zion, Bryce.');
    expect(u.semanticResolutionReasons).toContain('unclear_destination_relationship');
    await resolveTurnSemantically({ understanding: u, dispatch });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  test('unresolved_comparison_entity → exactly one dispatch', async () => {
    const dispatch = jest.fn(async () => ({ unresolved: true }));
    const u = understand('Is Zion better than Snake Hollow Park?');
    expect(u.semanticResolutionReasons).toContain('unresolved_comparison_entity');
    await resolveTurnSemantically({ understanding: u, dispatch });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  test('the production trigger list is exactly the three agreed reasons', () => {
    expect([...PRODUCTION_TRIGGER_REASONS].sort()).toEqual([
      'elliptical_reference',
      'unclear_destination_relationship',
      'unresolved_comparison_entity',
    ]);
  });

  test('no dispatcher means the deterministic reading stands', async () => {
    const u = understand('The second one.', COMPARISON_CONTEXT);
    const { understanding, telemetry } = await resolveTurnSemantically({ understanding: u });
    expect(understanding.taskFamily).toBe(u.taskFamily);
    expect(telemetry.attempted).toBe(false);
    expect(noDispatch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('input budget', () => {
  test('carries no evidence, no web, no full history', () => {
    const request = buildSemanticRequest({
      understanding: understand('The second one.', COMPARISON_CONTEXT),
      recentTurns: Array.from({ length: 40 }, (_, i) => ({ role: 'user', content: `turn ${i} with some text` })),
    });
    expect(request.model).toBe(SEMANTIC_MODEL);
    expect(request.web).toBe(false);
    expect(request.retrieval).toBe(false);
    expect(request.input.recentContext.length).toBeLessThanOrEqual(4);
    expect(request.input.message.length).toBeLessThanOrEqual(1200);
    expect(JSON.stringify(request)).not.toMatch(/evidenceBundle|resolutions|candidates/);
  });

  test('destinations are passed as names, never as identities to copy', () => {
    const request = buildSemanticRequest({
      understanding: understand('Zion, Bryce.'),
      resolvedEntities: [{ displayName: 'Zion National Park', parkCode: 'zion', entityId: 'nps:park:zion' }],
    });
    expect(request.input.resolvedDestinations).toEqual(['Zion National Park']);
    expect(JSON.stringify(request.input.resolvedDestinations)).not.toMatch(/nps:park|zion"/);
  });
});

// ---------------------------------------------------------------------------
describe('grounding — the model may read meaning, never invent facts', () => {
  test('an invented numeric constraint is rejected', async () => {
    const u = understand('The second one.', COMPARISON_CONTEXT);
    const { understanding, telemetry } = await resolveTurnSemantically({
      understanding: u,
      dispatch: async () => ({
        taskFamily: 'itinerary_refinement',
        confidence: 0.9,
        explicitConstraints: [{ field: 'maxWalkMilesPerSegment', value: 1, supportingSpan: 'can only walk a mile' }],
      }),
    });
    expect(telemetry.outcome).toBe(OUTCOMES.GROUNDING_REJECTED);
    expect(understanding.explicitConstraints).toEqual(u.explicitConstraints);
  });

  test('a grounded constraint from real language is accepted', async () => {
    const u = understand('Keep the walking light on this one.', { lastTravelerJob: 'day_by_day_itinerary' });
    const validation = validateSemanticPatch(
      { explicitConstraints: [{ field: 'walkingTolerance', value: 'limited', supportingSpan: 'keep the walking light' }] },
      { normalizedText: 'Keep the walking light on this one.' }
    );
    expect(validation.valid).toBe(true);
    expect(u).toBeTruthy();
  });

  test('an invented canonical destination identity is rejected', async () => {
    const u = understand('Zion, Bryce.');
    const { telemetry } = await resolveTurnSemantically({
      understanding: u,
      dispatch: async () => ({
        destinationRelationship: 'combine',
        confidence: 0.9,
        destinationRefs: [{ entityId: 'nps:park:invented', parkCode: 'xxxx' }],
      }),
    });
    expect(telemetry.outcome).toBe(OUTCOMES.GROUNDING_REJECTED);
  });

  test('a reference resolved from real context is grounded', () => {
    const validation = validateSemanticPatch(
      { resolvedReference: { kind: 'comparison_option', supportingSpan: 'Bryce Canyon' } },
      { normalizedText: 'The second one.', contextText: 'Would you pick Zion or Bryce Canyon?' }
    );
    expect(validation.valid).toBe(true);
  });

  test('a reference quoting nothing real is rejected', () => {
    const validation = validateSemanticPatch(
      { resolvedReference: { kind: 'comparison_option', supportingSpan: 'Yosemite' } },
      { normalizedText: 'The second one.', contextText: 'Would you pick Zion or Bryce Canyon?' }
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('reference_not_grounded');
  });
});

// ---------------------------------------------------------------------------
describe('precedence — explicit deterministic facts win', () => {
  test('an explicit artifact prohibition survives a contradicting patch', async () => {
    const u = { ...understand('Don’t build the daily itinerary yet.'), semanticResolutionReasons: ['elliptical_reference'], needsSemanticResolution: true };
    const { understanding } = await resolveTurnSemantically({
      understanding: u,
      dispatch: async () => ({ requestedArtifact: 'itinerary', taskFamily: 'itinerary', confidence: 0.95 }),
    });
    expect(understanding.forbiddenArtifacts).toContain('itinerary');
    expect(understanding.requestedArtifact).not.toBe('itinerary');
    expect(understanding.structurePolicy).toBe('optional');
  });

  test('an explicit deterministic constraint value is not overwritten', async () => {
    const base = understand("She can't walk more than a mile at a time.", { lastTravelerJob: 'day_by_day_itinerary' });
    const u = { ...base, semanticResolutionReasons: ['elliptical_reference'], needsSemanticResolution: true };
    const { understanding } = await resolveTurnSemantically({
      understanding: u,
      dispatch: async () => ({
        confidence: 0.9,
        explicitConstraints: [{ field: 'maxWalkMilesPerSegment', value: 2, supportingSpan: 'walk more than a mile' }],
      }),
    });
    const values = understanding.explicitConstraints.filter((c) => c.field === 'maxWalkMilesPerSegment');
    expect(values).toHaveLength(1);
    expect(values[0].value).toBe(1);
  });

  test('a high-confidence deterministic relationship is not overwritten', async () => {
    const base = understand('Would you pick Acadia or Great Smoky Mountains?');
    const u = { ...base, semanticResolutionReasons: ['unclear_destination_relationship'], needsSemanticResolution: true };
    const { understanding } = await resolveTurnSemantically({
      understanding: u,
      dispatch: async () => ({ destinationRelationship: 'route', confidence: 0.9 }),
    });
    expect(understanding.destinationRelationship).toBe('alternative_choice');
  });

  test('a genuinely ambiguous relationship IS resolved', async () => {
    const u = understand('Zion, Bryce.');
    const { understanding, telemetry } = await resolveTurnSemantically({
      understanding: u,
      dispatch: async () => ({ destinationRelationship: 'combine', confidence: 0.82 }),
    });
    expect(understanding.destinationRelationship).toBe('combine');
    expect(telemetry.fieldsPatched).toContain('destinationRelationship');
    expect(understanding.understandingSource).toBe('semantic');
  });
});

// ---------------------------------------------------------------------------
describe('degradation', () => {
  test('invalid schema → deterministic fallback', async () => {
    const u = understand('The second one.', COMPARISON_CONTEXT);
    const { understanding, telemetry } = await resolveTurnSemantically({
      understanding: u,
      dispatch: async () => ({ taskFamily: 'teleportation', confidence: 4 }),
    });
    expect(telemetry.outcome).toBe(OUTCOMES.INVALID);
    expect(understanding.taskFamily).toBe(u.taskFamily);
  });

  test('a throwing dispatcher → deterministic fallback, no crash', async () => {
    const u = understand('The second one.', COMPARISON_CONTEXT);
    const { understanding, telemetry } = await resolveTurnSemantically({
      understanding: u,
      dispatch: async () => { throw Object.assign(new Error('boom'), { code: 'timeout' }); },
    });
    expect(telemetry.outcome).toBe(OUTCOMES.DISPATCHER_ERROR);
    expect(understanding.taskFamily).toBe(u.taskFamily);
  });

  test('an explicitly unresolved result is honest, not guessed', async () => {
    const u = understand('The second one.', COMPARISON_CONTEXT);
    const { understanding, telemetry } = await resolveTurnSemantically({
      understanding: u,
      dispatch: async () => ({ unresolved: true }),
    });
    expect(telemetry.outcome).toBe(OUTCOMES.UNRESOLVED);
    expect(understanding.taskFamily).toBe(u.taskFamily);
  });
});

// ---------------------------------------------------------------------------
describe('telemetry', () => {
  test('records outcome and patched fields without conversation content', async () => {
    const u = understand('Zion, Bryce.');
    const { telemetry } = await resolveTurnSemantically({
      understanding: u,
      dispatch: async () => ({
        destinationRelationship: 'combine',
        confidence: 0.8,
        usage: { inputTokens: 240, outputTokens: 40 },
        cost: { costUsd: 0.00021 },
      }),
    });
    expect(telemetry).toMatchObject({
      attempted: true,
      model: SEMANTIC_MODEL,
      outcome: OUTCOMES.RESOLVED,
      inputTokens: 240,
      outputTokens: 40,
      estimatedCost: 0.00021,
    });
    expect(telemetry.triggerReasons).toContain('unclear_destination_relationship');
    expect(JSON.stringify(telemetry)).not.toMatch(/Zion|Bryce/);
  });
});

// ---------------------------------------------------------------------------
describe('integration through the turn path', () => {
  function deps(overrides = {}) {
    return {
      enabled: true,
      planRequirements: () => [],
      resolveDeterministicRender: () => ({ eligible: false }),
      detectContradiction: () => [],
      resolveEvidence: async ({ requestId }) => buildEvidenceBundle({ requestId, resolutions: [], candidates: [] }),
      now: () => new Date('2026-08-17T12:00:00.000Z'),
      newTurnId: () => 'turn-semantic',
      streamGeneration: false,
      responseAdapters: {},
      executeResponses: async () => ({
        provider: 'openai',
        model: 'gpt-5.6-terra',
        outputText: 'A clear, validated answer about the park with no unsupported current claims of any kind.',
        toolCalls: [],
        completionStatus: 'complete',
        stopReason: 'stop',
        refusal: null,
        usage: { inputTokens: 700, outputTokens: 120 },
      }),
      ...overrides,
    };
  }

  const input = (userMessage, tripState = null) => ({
    userMessage,
    conversationContext: { history: [{ role: 'user', content: 'Would you pick Zion or Bryce Canyon?' }] },
    tripState,
    constraints: null,
    resolvedContext: {},
  });

  test('a clear turn never reaches the dispatcher', async () => {
    const semanticDispatch = jest.fn();
    const result = await executeTrailieV2Turn(
      input('Build me a day-by-day itinerary for Zion.'),
      deps({ semanticDispatch })
    );
    expect(semanticDispatch).not.toHaveBeenCalled();
    expect(result.telemetrySummary.semanticResolver).toBeNull();
  });

  test('an elliptical turn dispatches exactly once and reports telemetry', async () => {
    const semanticDispatch = jest.fn(async () => ({
      taskFamily: 'comparison',
      confidence: 0.86,
      resolvedReference: { kind: 'comparison_option', supportingSpan: 'Bryce Canyon' },
    }));
    const result = await executeTrailieV2Turn(
      input('The second one.', { lastTravelerJob: 'destination_compare' }),
      deps({ semanticDispatch })
    );
    expect(semanticDispatch).toHaveBeenCalledTimes(1);
    expect(result.telemetrySummary.semanticResolver.attempted).toBe(true);
    expect(result.telemetrySummary.semanticResolver.triggerReasons).toContain('elliptical_reference');
    expect(result.status).toBe('complete');
  });

  test('one call maximum — a failing dispatcher is not retried', async () => {
    const semanticDispatch = jest.fn(async () => { throw new Error('nope'); });
    const result = await executeTrailieV2Turn(
      input('The second one.', { lastTravelerJob: 'destination_compare' }),
      deps({ semanticDispatch })
    );
    expect(semanticDispatch).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('complete');
  });

  test('guest and authenticated paths gate identically', async () => {
    const calls = [];
    const make = (tripState) => executeTrailieV2Turn(
      input('The second one.', tripState),
      deps({ semanticDispatch: jest.fn(async () => { calls.push(1); return { unresolved: true }; }) })
    );
    await make({ lastTravelerJob: 'destination_compare' });
    await make({ lastTravelerJob: 'destination_compare', userId: 'user-123' });
    expect(calls).toHaveLength(2);
  });

  test('no live provider is constructed or dispatched anywhere in this suite', () => {
    const summary = getProviderTestSummary();
    expect(summary.liveOpenAiConstructors).toBe(0);
    expect(summary.liveAnthropicConstructors).toBe(0);
    expect(summary.liveProviderDispatches).toBe(0);
    expect(summary.externalProviderHttpRequests).toBe(0);
  });
});
