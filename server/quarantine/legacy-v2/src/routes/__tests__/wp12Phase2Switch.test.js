'use strict';

/**
 * WP12 Phase 4 — product-chat is WP11A-only (fail closed when flag off).
 */

const fs = require('fs');
const path = require('path');

const AI_ROUTE = path.join(require('path').resolve(__dirname, '../../../../../src/routes/__tests__'), '..', 'ai.js');
const source = fs.readFileSync(AI_ROUTE, 'utf8');

describe('WP12 Phase 4 — Trailie v2-only product chat', () => {
  test('all four product chat routes fail-closed when runtime disabled', () => {
    expect(source).toContain("router.post('/chat'");
    expect(source).toContain("router.post('/chat-stream'");
    expect(source).toContain("router.post('/chat-anonymous'");
    expect(source).toContain("router.post('/chat-anonymous-stream'");
    expect(source.match(/trailie_runtime_disabled/g).length).toBeGreaterThanOrEqual(4);
    expect(source).toContain('if (!isTrailieV2RuntimeEnabled())');
  });

  test('product chat routes never call deleted legacy generation engines', () => {
    expect(source).not.toContain('runTrailieItineraryTurn');
    expect(source).not.toContain('streamRawLLMToSse');
    expect(source).not.toContain('generateBufferedLLM');
    expect(source).not.toContain('aiProviderStream');
    expect(source).not.toContain('planTrailieFetches(');
    expect(source).not.toContain('fetchRelevantFacts(');
    expect(source).not.toContain('buildBaseSystemPrompt');
  });

  test('stream routes bind WP11A lifecycle to WP10 contentDelta', () => {
    expect(source).toContain('createV2StreamEventBinder');
    expect(source).toContain('emitCanonicalEvent: v2Binder.emitCanonicalEvent');
    expect(source).toContain('ensureDisplayContent');
    expect(source).toContain('runTrailieV2FromPreparedContext');
  });

  test('prep is permanently shared v2 path', () => {
    expect(source).toContain('WP12 Phase 4 — product-chat prep is permanently the shared v2 path');
    expect(source).toContain('skipped legacy facts/fetch + prompt assembly');
  });

  test('flag is kill-switch / availability gate (fail-closed)', () => {
    const runtime = require('../../../../../src/config/trailieV2Runtime');
    expect(runtime.isTrailieV2RuntimeEnabled({})).toBe(false);
    expect(runtime.isTrailieV2RuntimeEnabled({ TRAILIE_V2_RUNTIME_ENABLED: 'true' })).toBe(true);
    expect(runtime.isTrailieV2RuntimeEnabled({ TRAILIE_V2_RUNTIME_ENABLED: '1' })).toBe(false);
  });
});

describe('WP12 Phase 4 — prepareChatContext shared prep (offline)', () => {
  test('always returns shared prep without legacy facts or prompt assembly', async () => {
    jest.resetModules();
    // eslint-disable-next-line global-require
    const { prepareChatContext } = require('../../../../../src/routes/ai');
    const ctx = await prepareChatContext(
      {
        messages: [{ role: 'user', content: 'Tell me about Zion National Park for a first visit.' }],
        provider: 'openai',
        metadata: { skipUserContext: true },
      },
      '[WP12 Test]',
      { isAnonymous: true }
    );
    expect(ctx.fetchPlan).toBeNull();
    expect(ctx.npsFacts).toBeNull();
    expect(ctx.weatherFacts).toBeNull();
    expect(ctx.webSearchFacts).toBeNull();
    expect(ctx.enhancedSystemPrompt).toBe('');
    expect(ctx.trailieContext).toBeNull();
    expect(ctx.preflightResult).toEqual(expect.objectContaining({ blockers: expect.any(Array) }));
    expect(Array.isArray(ctx.allExtractedParks)).toBe(true);
    expect(ctx.allExtractedParks.some((p) => String(p.parkCode || '').toLowerCase() === 'zion')).toBe(true);
  });
});
