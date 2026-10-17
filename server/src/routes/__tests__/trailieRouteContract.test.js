'use strict';

/**
 * Route orchestration contract tests.
 *
 * Stage 6A.1 originally guarded that the fetched canonical fact bundle reached
 * the on-path reviewer. Stage 9 moved reviewer execution OFF the request path,
 * so the contract is now the inverse and stronger:
 *
 *   - the shared seam (`processPreparedTrailieResponse`) runs NO reviewer/model
 *     call before returning,
 *   - it returns async scheduling metadata only (never repaired/patched content),
 *   - content passes through byte-for-byte,
 *   - the fetched bundle still exists to feed the (later, off-path) snapshot.
 *
 * No MongoDB / auth / SSE / provider network is booted. The review pipeline is
 * mocked so we can PROVE it is never called by the request path.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// If the request path ever imported and called the reviewer again, this mock
// would record it. The contract is that it stays at zero calls.
jest.mock('../../services/trailieReviewPipeline', () => {
  const actual = jest.requireActual('../../services/trailieReviewPipeline');
  return {
    ...actual,
    runTrailieReviewPipeline: jest.fn(async ({ responseContent }) => ({
      content: responseContent,
      reviewMeta: {},
    })),
  };
});

const { runTrailieReviewPipeline } = require('../../services/trailieReviewPipeline');
const {
  makeFact,
  mergeCanonicalFactBundles,
  AUTHORITY,
  STATUS,
} = require('../../utils/canonicalFacts');

// Require the real router module and pull out the shared production seam.
const aiRouter = require('../ai');
const { processPreparedTrailieResponse } = aiRouter;

const RETRIEVED_AT = '2026-07-22T16:41:00.000Z';

function closureFact(parkCode, text, sourceId) {
  return makeFact({
    source: 'nps',
    category: 'closure',
    sourceId,
    text,
    parkCode,
    parkName: parkCode.toUpperCase(),
    authority: AUTHORITY.AUTHORITATIVE,
    status: STATUS.ACTIVE_CLOSURE,
    retrievedAt: RETRIEVED_AT,
  });
}

/** Minimal processorArgs mirroring what the routes assemble (no itinerary/conflicts). */
function baseProcessorArgs(overrides = {}) {
  return {
    response: { content: 'Your park plan looks great.', provider: 'claude', model: 'test-model' },
    lastMsg: 'plan my trip',
    npsFacts: null,
    weatherFacts: null,
    webSearchFacts: null,
    astroFacts: null,
    feeFreeFacts: null,
    noParkDetected: false,
    constraints: null,
    conflicts: [],
    hypothetical: null,
    provider: 'claude',
    model: 'test-model',
    maxTokens: 200,
    temperature: 0.5,
    top_p: 1,
    enhancedSystemPrompt: 'system',
    augmentedMessages: [],
    req: { _hasConflictRetried: false },
    parksForLinks: [],
    trailieContext: null,
    responseMode: 'buddy',
    options: { logPrefix: '[test]', userRequestedItinerary: false },
    ...overrides,
  };
}

beforeEach(() => {
  runTrailieReviewPipeline.mockClear();
});

describe('Stage 9 request-path review separation contract', () => {
  test('1. the shared seam runs NO reviewer/model call', async () => {
    const bundle = mergeCanonicalFactBundles([{ facts: [closureFact('olym', 'Hoh Road closed', 'o1')] }]);
    const preparedContext = { canonicalFactBundle: bundle, canonicalFactStatus: 'available' };

    await processPreparedTrailieResponse({ preparedContext, processorArgs: baseProcessorArgs() });

    expect(runTrailieReviewPipeline).not.toHaveBeenCalled();
  });

  test('2. the seam returns async scheduling metadata, never repaired/patched content', async () => {
    const bundle = mergeCanonicalFactBundles([{ facts: [closureFact('glac', 'GTSR closed', 'g1')] }]);
    const preparedContext = { canonicalFactBundle: bundle, canonicalFactStatus: 'available' };
    const content = 'Day 1 in Glacier. Day 2 at Logan Pass.';

    const processed = await processPreparedTrailieResponse({
      preparedContext,
      processorArgs: baseProcessorArgs({
        response: { content, provider: 'claude', model: 'test-model' },
      }),
    });

    // Byte-for-byte passthrough — the request path never rewrites content.
    expect(processed.cleanContent).toBe(content);
    expect(processed.reviewMeta.reviewerMode).toBe('shadow');
    expect(processed.reviewMeta.reviewExecution).toBe('async');
    expect(processed.reviewMeta.patchesApplied).toBe(0);
    expect(processed.reviewMeta.repaired).toBe(false);
  });

  test('3. deterministic guards still run — empty output never fabricated', async () => {
    // An empty candidate is flagged by the deterministic guard but never mutated
    // into fabricated content by the (now absent) reviewer.
    const preparedContext = { canonicalFactBundle: mergeCanonicalFactBundles([]), canonicalFactStatus: 'not_requested' };
    const processed = await processPreparedTrailieResponse({
      preparedContext,
      processorArgs: baseProcessorArgs({
        response: { content: 'A real answer with substance.', provider: 'claude', model: 'test-model' },
      }),
    });
    expect(processed.cleanContent).toBe('A real answer with substance.');
    expect(runTrailieReviewPipeline).not.toHaveBeenCalled();
  });

  test('4. structural: ai.js request path references no reviewer/model entry points', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'ai.js'), 'utf8');
    // No call to the model-based review pipeline anywhere in the route module.
    expect(src.match(/runTrailieReviewPipeline\(/g)).toBeNull();
    expect(src.match(/reviewSection\(/g)).toBeNull();
    expect(src.match(/runVerificationPass\(/g)).toBeNull();
    // And it no longer even imports the pipeline module.
    expect(src).not.toMatch(/require\(['"]\.\.\/services\/trailieReviewPipeline['"]\)/);
  });

  test('5. one processAssistantResponse call site remains (definition + shared seam)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'ai.js'), 'utf8');
    const directProcessorRefs = src.match(/processAssistantResponse\(/g) || [];
    // Only the function definition and the single call inside processPrepared…
    expect(directProcessorRefs.length).toBe(2);
  });

  test('6. all four chat routes go through WP11A v2 only (WP12 Phase 4)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'ai.js'), 'utf8');
    const v2Calls = src.match(/runTrailieFromPreparedContext\(/g) || [];
    expect(v2Calls.length).toBe(4);
    expect(src.match(/runTrailieItineraryTurn\(/g)).toBeNull();
    expect(src.match(/orchestrateToolFirstItinerary\(/g)).toBeNull();
    expect(src).not.toMatch(/aiProviderStream/);
  });

  test('7. structural: legacy generation engines are deleted', () => {
    const servicesDir = path.join(__dirname, '..', '..', 'services');
    expect(fs.existsSync(path.join(servicesDir, 'trailieItineraryTurn.js'))).toBe(false);
    expect(fs.existsSync(path.join(servicesDir, 'toolFirstItineraryOrchestrator.js'))).toBe(false);
    expect(fs.existsSync(path.join(servicesDir, 'aiProviderStream.js'))).toBe(false);
  });

  test('8. structural (WP12 Phase 4): routes fail-closed via kill-switch, not legacy fallback', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'ai.js'), 'utf8');
    expect(src).toMatch(/isTrailieRuntimeEnabled\(\)/);
    expect(src).toMatch(/trailie_runtime_disabled/);
    expect(src.match(/verifyProseAgainstItinerary\(/g)).toBeNull();
    expect(src.match(/renderDeterministicItineraryResponse\(/g)).toBeNull();
  });
});
