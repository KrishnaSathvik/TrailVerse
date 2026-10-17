'use strict';

/**
 * Stage 11 — tool-first integration through the REAL shared seam
 * (processPreparedTrailieResponse → processAssistantResponse).
 *
 * Proves the preFinalized fast path uses the FROZEN itinerary verbatim (no
 * re-extraction, no mutation), and that a prose-only fallback never recovers an
 * itinerary by inline-parsing prose that contains an [ITINERARY_JSON] block.
 */

require('dotenv').config();

const aiRouter = require('../ai');
const { processPreparedTrailieResponse } = aiRouter;
const { deepFreeze } = require('../../utils/finalizeItinerary');

const preparedContext = {
  canonicalFactBundle: { facts: [] },
  canonicalFactStatus: 'available',
};

function baseArgs(overrides = {}) {
  return {
    response: { content: 'Here is your plan.', provider: 'claude', model: 'test-model' },
    lastMsg: 'plan a 2 day trip',
    npsFacts: null, weatherFacts: null, webSearchFacts: null, astroFacts: null, feeFreeFacts: null,
    noParkDetected: false, constraints: null, conflicts: [], hypothetical: null,
    provider: 'claude', model: 'test-model', maxTokens: 200, temperature: 0.5, top_p: 1,
    enhancedSystemPrompt: 'system', augmentedMessages: [], req: {},
    parksForLinks: [], trailieContext: null, responseMode: 'architect',
    options: { logPrefix: '[test]', userRequestedItinerary: true },
    ...overrides,
  };
}

const frozenItinerary = deepFreeze({
  days: [{ id: 'd1', dayNumber: 1, label: 'Day 1', stops: [
    { id: 's1', order: 0, type: 'trail', name: 'Rim Trail', note: 'scenic', startTime: '08:00', duration: 120, latitude: null, longitude: null },
  ] }],
});

describe('tool-first preFinalized fast path', () => {
  test('uses the frozen itinerary verbatim and does not mutate it', async () => {
    const before = JSON.stringify(frozenItinerary);
    const processed = await processPreparedTrailieResponse({
      preparedContext,
      processorArgs: baseArgs({
        response: { content: 'Day 1 you hike the Rim Trail — a scenic 2-hour walk.', provider: 'claude', model: 'test-model' },
        options: {
          logPrefix: '[test]',
          userRequestedItinerary: true,
          preFinalized: {
            itineraryData: frozenItinerary,
            correctionsApplied: ['Removed a strenuous hike'],
            feasibilityIssues: [{ id: 'x', type: 'excessive_driving', severity: 'warning', message: 'long drive' }],
            planScore: { score: 0.9 },
            confidence: { level: 'high', score: 1 },
            contentChangedByValidation: true,
          },
        },
      }),
    });

    // Same frozen object, unchanged.
    expect(processed.itineraryData).toBe(frozenItinerary);
    expect(JSON.stringify(frozenItinerary)).toBe(before);
    expect(processed.feasibilityIssues).toHaveLength(1);
    expect(processed.correctionsApplied).toEqual(['Removed a strenuous hike']);
    // Correction notice appended to prose; async review marker present.
    expect(processed.cleanContent).toMatch(/Rim Trail/);
    expect(processed.reviewMeta.reviewExecution).toBe('async');
  });

  test('prose-only fallback never inline-extracts an itinerary from prose', async () => {
    const proseWithJson =
      'Here is a rough idea.\n[ITINERARY_JSON]{"days":[{"id":"d1","dayNumber":1,"label":"Day 1","stops":[{"id":"s1","order":0,"type":"trail","name":"X","note":"n","startTime":"08:00","duration":60}]}]}[/ITINERARY_JSON]';
    const processed = await processPreparedTrailieResponse({
      preparedContext,
      processorArgs: baseArgs({
        response: { content: proseWithJson, provider: 'claude', model: 'test-model' },
        options: {
          logPrefix: '[test]',
          userRequestedItinerary: true,
          disableInlineItineraryExtraction: true,
        },
      }),
    });
    // No itinerary recovered from the prose; the JSON marker is stripped out.
    expect(processed.itineraryData).toBeNull();
    expect(processed.cleanContent).not.toMatch(/ITINERARY_JSON/);
  });
});
