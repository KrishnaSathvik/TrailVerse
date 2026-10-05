'use strict';

/**
 * WP12 Phase 3.5 — true Responses → content_delta streaming (offline).
 * Proves: WP8 streamResponses, WP11A product content_delta (no OpenAI-native
 * names), WP10 binder dialects (chunk vs content_delta), finalize-once.
 */

const {
  createResponsesRequest,
  streamResponses,
} = require('../responsesAdapter');
const { executeTrailieV2Turn, CANONICAL_EVENTS } = require('../trailieV2ExecutionService');
const { createV2StreamEventBinder } = require('../trailieV2RouteBridge');
const { createTrailieTransportAdapter } = require('../../utils/trailieTransportAdapter');
const { buildEvidenceBundle } = require('../../utils/evidenceBundle');

function request(overrides = {}) {
  return createResponsesRequest({
    provider: 'openai',
    model: 'gpt-5.6-luna',
    instructions: 'Policy',
    input: [{ role: 'user', content: 'Q' }],
    maxOutputTokens: 200,
    ...overrides,
  });
}

describe('WP12 Phase 3.5 — streamResponses (WP8)', () => {
  test('forwards provider-neutral events and returns normalized result', async () => {
    const seen = [];
    const adapters = {
      openai: {
        stream: jest.fn(async (_req, { onEvent }) => {
          onEvent({ type: 'start', responseId: 'resp_1' });
          onEvent({ type: 'text_delta', delta: 'Hello ' });
          onEvent({ type: 'text_delta', delta: 'Zion' });
          onEvent({ type: 'complete', responseId: 'resp_1' });
          return {
            provider: 'openai',
            model: 'gpt-5.6-luna',
            responseId: 'resp_1',
            outputText: 'Hello Zion',
            toolCalls: [],
            usage: { inputTokens: 10, outputTokens: 4 },
          };
        }),
      },
    };
    const result = await streamResponses(request(), {
      adapters,
      onEvent: (e) => seen.push(e),
    });
    expect(seen.map((e) => e.type)).toEqual(['start', 'text_delta', 'text_delta', 'complete']);
    expect(seen.some((e) => String(e.type || '').startsWith('response.'))).toBe(false);
    expect(result.outputText).toBe('Hello Zion');
    expect(adapters.openai.stream).toHaveBeenCalledTimes(1);
  });

  test('falls back to execute when stream is unavailable (no deltas)', async () => {
    const onEvent = jest.fn();
    const execute = jest.fn(async () => ({
      provider: 'openai',
      model: 'gpt-5.6-luna',
      outputText: 'fallback',
      toolCalls: [],
      usage: {},
    }));
    const result = await streamResponses(request(), {
      adapters: { openai: { execute } },
      onEvent,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(onEvent).not.toHaveBeenCalled();
    expect(result.outputText).toBe('fallback');
  });
});

describe('WP12 Phase 3.5 — WP11A content_delta from text_delta only', () => {
  test('CANONICAL_EVENTS includes content_delta and excludes OpenAI-native names', () => {
    expect(CANONICAL_EVENTS).toContain('content_delta');
    expect(CANONICAL_EVENTS).not.toContain('response.output_text.delta');
    expect(CANONICAL_EVENTS).not.toContain('text_delta');
  });

  test('maps stream text_delta → content_delta and ignores tool_argument_delta', async () => {
    const events = [];
    const streamResponses = jest.fn(async (_req, { onEvent }) => {
      onEvent({ type: 'text_delta', delta: 'Day 1: ' });
      onEvent({ type: 'tool_argument_delta', callId: 'c1', delta: '{"days"' });
      onEvent({ type: 'text_delta', delta: 'Angels Landing.' });
      return {
        provider: 'openai',
        model: 'gpt-5.6-luna',
        outputText: 'Day 1: Angels Landing.',
        toolCalls: [],
        completionStatus: 'completed',
        stopReason: 'completed',
        refusal: null,
        usage: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 0 },
      };
    });

    const result = await executeTrailieV2Turn(
      {
        userMessage: 'What should I know about Zion for a first visit?',
        conversationContext: { history: [] },
        emitCanonicalEvent: (e) => events.push(e),
      },
      {
        enabled: true,
        streamGeneration: true,
        streamResponses,
        executeResponses: jest.fn(),
        classifyIntent: () => ({
          primaryIntent: 'general_qa',
          verticals: ['parks'],
          depth: 'quick',
          freshness: 'stable',
          confidence: 0.9,
          entities: [],
        }),
        planRequirements: () => [],
        resolveEvidence: async ({ requestId }) => buildEvidenceBundle({
          requestId,
          resolutions: [],
          candidates: [],
        }),
        resolveDeterministicRender: () => ({ eligible: false }),
        detectContradiction: () => [],
        now: () => new Date('2026-08-10T12:00:00.000Z'),
        newTurnId: () => 'turn-stream',
      },
    );

    expect(result.status).toBe('complete');
    expect(streamResponses).toHaveBeenCalledTimes(1);
    const deltas = events.filter((e) => e.type === 'content_delta');
    expect(deltas.map((e) => e.payload.content)).toEqual(['Day 1: ', 'Angels Landing.']);
    expect(JSON.stringify(events)).not.toContain('tool_argument');
    expect(JSON.stringify(events)).not.toContain('response.output_text');
  });
});

describe('WP12 Phase 3.5 — WP10 binder dialects', () => {
  test('legacy dialect emits chunk*; v2 emits content_delta*; both finalize once', () => {
    for (const dialect of ['legacy', 'v2']) {
      const wire = [];
      const transport = createTrailieTransportAdapter({
        dialect,
        mode: 'stream',
        emit: (p) => wire.push(p),
      });
      transport.responseStarted({ responseId: 'r1', display: { parkName: 'Zion' } });
      const binder = createV2StreamEventBinder({
        transport,
        getDisplay: () => ({ parkName: 'Zion National Park', parkNames: ['Zion'] }),
      });
      binder.emitCanonicalEvent({
        type: 'evidence_ready',
        payload: { coverage: 'complete', freshness: 'fresh', publicSources: ['nps'] },
      });
      binder.emitCanonicalEvent({ type: 'attempt_started', payload: { attempt: 1 } });
      binder.emitCanonicalEvent({ type: 'content_delta', payload: { content: 'Hello ' } });
      binder.emitCanonicalEvent({ type: 'content_delta', payload: { content: 'Zion' } });
      binder.emitCanonicalEvent({ type: 'prose_ready' });
      // Ignored — route owns terminal:
      binder.emitCanonicalEvent({ type: 'response_finalized' });
      const streamed = binder.getStreamedContent();
      expect(streamed).toBe('Hello Zion');
      transport.contentStreamEnded();
      transport.responseFinalized({
        contentUnchanged: true,
        content: streamed,
      });
      // Second finalize must no-op (seal).
      transport.responseFinalized({ content: 'DUPLICATE' });

      const types = wire.map((e) => e.type);
      if (dialect === 'legacy') {
        expect(types.filter((t) => t === 'chunk')).toEqual(['chunk', 'chunk']);
        expect(types).toContain('stream_end');
        expect(types.filter((t) => t === 'done')).toHaveLength(1);
        expect(types).not.toContain('content_delta');
        expect(types).not.toContain('response_finalized');
      } else {
        expect(types.filter((t) => t === 'content_delta')).toEqual(['content_delta', 'content_delta']);
        expect(types).toContain('response_started');
        expect(types).toContain('evidence_ready');
        expect(types.filter((t) => t === 'response_finalized')).toHaveLength(1);
        expect(types).not.toContain('chunk');
        expect(types).not.toContain('done');
      }
      expect(wire.some((e) => e.content === 'DUPLICATE')).toBe(false);
      expect(wire.some((e) => e.type === 'content_reset')).toBe(false);
    }
  });

  test('rejected attempt loses stream ownership before the accepted attempt begins', () => {
    const wire = [];
    const transport = createTrailieTransportAdapter({
      dialect: 'v2',
      mode: 'stream',
      emit: (p) => wire.push(p),
    });
    transport.responseStarted({ responseId: 'r-retry' });
    const binder = createV2StreamEventBinder({ transport, getDisplay: () => ({}) });
    binder.emitCanonicalEvent({ type: 'attempt_started', payload: { attempt: 1 } });
    binder.emitCanonicalEvent({ type: 'content_delta', payload: { content: 'Bad first prose.' } });
    binder.emitCanonicalEvent({ type: 'attempt_rejected', payload: { attempt: 1 } });
    binder.emitCanonicalEvent({ type: 'attempt_started', payload: { attempt: 2 } });
    binder.emitCanonicalEvent({ type: 'content_delta', payload: { content: 'Good second prose.' } });
    const streamed = binder.getStreamedContent();
    expect(streamed).toBe('Good second prose.');
    const accepted = 'Good second prose.';
    transport.responseFinalized({
      contentUnchanged: true,
      content: accepted,
      responseId: 'r-retry',
    });
    transport.responseFinalized({ content: 'SHOULD_NOT_APPEND' });

    const finals = wire.filter((e) => e.type === 'response_finalized');
    expect(finals).toHaveLength(1);
    expect(finals[0].content).toBe(accepted);
    expect(finals[0].content).not.toContain('Bad first prose.');
    expect(wire.some((e) => e.content === 'SHOULD_NOT_APPEND')).toBe(false);
    expect(wire.filter((e) => e.type === 'content_reset')).toHaveLength(1);
    expect(wire.filter((e) => e.type === 'content_delta').map((e) => e.content))
      .toEqual(['Bad first prose.', 'Good second prose.']);
  });

  test('two rejected attempts leave only attempt 3 and an empty rejection emits no reset', () => {
    const wire = [];
    const transport = createTrailieTransportAdapter({ dialect: 'v2', mode: 'stream', emit: (p) => wire.push(p) });
    const binder = createV2StreamEventBinder({ transport, getDisplay: () => ({}) });

    binder.emitCanonicalEvent({ type: 'attempt_started', payload: { attempt: 1 } });
    binder.emitCanonicalEvent({ type: 'content_delta', payload: { content: 'A' } });
    binder.emitCanonicalEvent({ type: 'attempt_rejected', payload: { attempt: 1 } });
    binder.emitCanonicalEvent({ type: 'attempt_started', payload: { attempt: 2 } });
    binder.emitCanonicalEvent({ type: 'attempt_rejected', payload: { attempt: 2 } });
    binder.emitCanonicalEvent({ type: 'attempt_started', payload: { attempt: 3 } });
    binder.emitCanonicalEvent({ type: 'content_delta', payload: { content: 'C' } });

    expect(binder.getStreamedContent()).toBe('C');
    expect(wire.filter((e) => e.type === 'content_reset')).toHaveLength(1);
  });

  test('all rejected prose is cleared before the terminal failure copy takes ownership', () => {
    const wire = [];
    const transport = createTrailieTransportAdapter({ dialect: 'v2', mode: 'stream', emit: (p) => wire.push(p) });
    const binder = createV2StreamEventBinder({ transport, getDisplay: () => ({}) });

    for (const [attempt, prose] of [[1, 'A'], [2, 'B'], [3, 'C']]) {
      binder.emitCanonicalEvent({ type: 'attempt_started', payload: { attempt } });
      binder.emitCanonicalEvent({ type: 'content_delta', payload: { content: prose } });
      binder.emitCanonicalEvent({ type: 'attempt_rejected', payload: { attempt } });
    }

    expect(binder.getStreamedContent()).toBe('');
    binder.ensureDisplayContent("I couldn't complete this request. Please try again.");
    expect(binder.getStreamedContent()).toBe("I couldn't complete this request. Please try again.");
    expect(binder.getStreamedContent()).not.toMatch(/A|B|C/);
  });
});
