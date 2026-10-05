'use strict';

/**
 * WP-TU §12/§13 — structured output is required only when the traveler asked
 * for the artifact, and a purely structural failure must never discard an
 * answer that already passed truth/safety validation.
 *
 * Fully offline: every provider boundary is an injected fake.
 */

const { executeTrailieV2Turn } = require('../trailieV2ExecutionService');
const { buildEvidenceBundle } = require('../../utils/evidenceBundle');
const { getProviderTestSummary, resetProviderTestSummary } = require('../../config/providerTestPolicy');

const LONG_PROSE = [
  'Rocky Mountain National Park needs a timed-entry reservation for the Bear Lake Road corridor,',
  'and the rest of the park uses a separate permit window. Book the entry slot before you drive up,',
  'confirm the campground reservation if you are staying overnight, and check the road status the',
  'morning you leave because the alpine section closes on short notice. Nothing else needs to be',
  'reserved in advance for a weekend visit.',
].join(' ');

function classification(overrides = {}) {
  return {
    version: 'trailie-intent-v2.0.0',
    source: 'deterministic',
    primaryIntent: 'simple_itinerary',
    verticals: ['itinerary'],
    depth: 'planning',
    freshness: 'stable',
    actionability: 'planning',
    scope: 'single_destination',
    entities: [{ type: 'destination', role: 'target', canonicalId: 'park:nps:romo', confidence: 1 }],
    confidence: 0.9,
    reasonCodes: ['explicit_itinerary_request'],
    compound: false,
    requiresLunaShadow: false,
    travelerJob: 'day_by_day_itinerary',
    structurePolicy: 'required',
    ...overrides,
  };
}

/** A model that answers the question in prose and never calls the tool. */
function proseOnlyResult(text = LONG_PROSE) {
  return {
    provider: 'openai',
    model: 'gpt-5.6-terra',
    outputText: text,
    toolCalls: [],
    structuredOutput: null,
    structuredOutputStatus: null,
    completionStatus: 'complete',
    stopReason: 'stop',
    refusal: null,
    usage: { inputTokens: 900, outputTokens: 220, cachedInputTokens: 0 },
  };
}

function buildDeps(overrides = {}) {
  const dispatches = [];
  const executeResponses = jest.fn(async (request, ctx) => {
    dispatches.push(request);
    return (overrides.executeResponses || (async () => proseOnlyResult()))(request, ctx);
  });
  const deps = {
    classifyIntent: jest.fn(() => classification(overrides.classificationOverrides)),
    planRequirements: jest.fn(() => []),
    resolveDeterministicRender: jest.fn(() => ({ eligible: false })),
    detectContradiction: jest.fn(() => []),
    resolveEvidence: jest.fn(async ({ requirements = [], requestId }) => buildEvidenceBundle({
      requestId,
      resolutions: requirements.map((r) => ({ requirementId: r.requirementId, status: 'satisfied_fresh', evidenceIds: [] })),
      candidates: [],
    })),
    now: () => new Date('2026-08-17T12:00:00.000Z'),
    newTurnId: () => 'turn-structure-policy',
    streamGeneration: false,
    ...overrides,
    responseAdapters: {},
    executeResponses,
  };
  return { deps, dispatches };
}

const input = (userMessage) => ({
  userMessage,
  conversationContext: { history: [] },
  tripState: null,
  constraints: null,
  resolvedContext: {},
});

beforeEach(() => resetProviderTestSummary());

describe('structurePolicy governs whether missing structure is fatal', () => {
  test('policy "optional": a validated prose answer is accepted on the first attempt', async () => {
    const { deps, dispatches } = buildDeps({
      classificationOverrides: { structurePolicy: 'optional', travelerJob: 'permits_reservations' },
    });
    const result = await executeTrailieV2Turn(
      input('What do I need to reserve before I go next weekend?'),
      { ...deps, enabled: true }
    );

    expect(result.status).toBe('complete');
    expect(result.response.text).toContain('timed-entry reservation');
    expect(result.itineraryData || null).toBeNull();
    // The whole point: no retries chasing a plan nobody asked for.
    expect(dispatches).toHaveLength(1);
    expect(result.attempts).toHaveLength(1);
  });

  test('policy "preferred": prose is accepted rather than retried into failure', async () => {
    const { deps, dispatches } = buildDeps({
      classificationOverrides: { structurePolicy: 'preferred' },
    });
    const result = await executeTrailieV2Turn(input('Two days at Rocky Mountain?'), { ...deps, enabled: true });

    expect(result.status).toBe('complete');
    expect(dispatches).toHaveLength(1);
  });

  test('policy "required": the structured artifact is still enforced with bounded repair', async () => {
    const { deps, dispatches } = buildDeps({
      classificationOverrides: { structurePolicy: 'required' },
    });
    const result = await executeTrailieV2Turn(
      input('Build me a day-by-day itinerary for Rocky Mountain.'),
      { ...deps, enabled: true }
    );

    // Repair was attempted (more than one dispatch) rather than silently
    // accepting prose for an explicit artifact request.
    expect(dispatches.length).toBeGreaterThan(1);
    expect(result.status).toBe('complete');
  });
});

describe('safe prose fallback (§13)', () => {
  test('a required-structure turn that only ever fails structurally still answers the traveler', async () => {
    const { deps } = buildDeps({ classificationOverrides: { structurePolicy: 'required' } });
    const result = await executeTrailieV2Turn(
      input('Build me a day-by-day itinerary for Rocky Mountain.'),
      { ...deps, enabled: true }
    );

    expect(result.status).toBe('complete');
    expect(result.response.text).toContain('timed-entry reservation');
    // Degradation is declared, and no plan is attached or claimed.
    expect(result.validation.degraded).toBe(true);
    expect(result.validation.degradedReasonCodes).toContain('structured_artifact_unavailable');
    expect(result.itineraryData || null).toBeNull();
    expect(result.itineraryHash || null).toBeNull();
  });

  test('a truth/safety failure is never degraded into a delivered answer', async () => {
    const { deps } = buildDeps({
      classificationOverrides: { structurePolicy: 'required' },
      // Contradiction = a truth failure, not a structural one.
      detectContradiction: jest.fn(() => ['contradicts_official_evidence']),
    });
    const result = await executeTrailieV2Turn(
      input('Build me a day-by-day itinerary for Rocky Mountain.'),
      { ...deps, enabled: true }
    );

    expect(result.status).toBe('failed');
    expect(result.response || null).toBeNull();
  });

  test('empty prose cannot become a fallback answer', async () => {
    const { deps } = buildDeps({
      classificationOverrides: { structurePolicy: 'required' },
      executeResponses: async () => proseOnlyResult(''),
    });
    const result = await executeTrailieV2Turn(
      input('Build me a day-by-day itinerary for Rocky Mountain.'),
      { ...deps, enabled: true }
    );
    expect(result.status).toBe('failed');
  });

  test('the fallback path constructs and dispatches no live provider', async () => {
    const { deps } = buildDeps({ classificationOverrides: { structurePolicy: 'required' } });
    await executeTrailieV2Turn(input('Build me a day-by-day itinerary for Rocky Mountain.'), { ...deps, enabled: true });

    const summary = getProviderTestSummary();
    expect(summary.liveOpenAiConstructors).toBe(0);
    expect(summary.liveAnthropicConstructors).toBe(0);
    expect(summary.liveProviderDispatches).toBe(0);
    expect(summary.externalProviderHttpRequests).toBe(0);
  });
});
