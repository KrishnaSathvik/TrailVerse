import { describe, it, expect, vi } from 'vitest';
import { consumeAiSseStream } from '@/services/aiService';

/**
 * WP10F-3 — the REAL parse/dispatch layer (`consumeAiSseStream`) must route BOTH
 * dialects through the single per-turn normalizer and leave the existing React
 * callbacks in an equivalent state. This tests the dispatch seam, not just the
 * pure normalizer: legacy and v2 fixtures are fed as raw SSE bytes and reduced
 * to the UI state the callbacks would produce.
 */

/** Build a Response-like object whose body streams the given SSE lines. */
function sseResponse(events, { chunkSize } = {}) {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n`).join('');
  const bytes = new TextEncoder().encode(text);
  const step = chunkSize || bytes.length;
  let offset = 0;
  return {
    body: {
      getReader: () => ({
        read: async () => {
          if (offset >= bytes.length) return { done: true, value: undefined };
          const value = bytes.slice(offset, offset + step);
          offset += step;
          return { done: false, value };
        },
      }),
    },
  };
}

/** Spy callbacks that also fold into the UI-state snapshot the handlers derive. */
function harness() {
  const state = {
    text: '',
    sources: [],
    stage: null,
    images: [],
    streamEndCount: 0,
    donePayload: null,
    error: null,
    early: [],
    resetCount: 0,
  };
  const cb = {
    onThinking: vi.fn((d) => {
      if (d.stage !== undefined) state.stage = d.stage;
      if (d.sources !== undefined) state.sources = d.sources;
    }),
    // WP10F-3 — display rides its OWN callback so it never resets sources/message.
    onDisplayContext: vi.fn((d) => {
      if (Array.isArray(d.parkImages) && d.parkImages.length) state.images = d.parkImages;
    }),
    onChunk: vi.fn((c) => { state.text += c; }),
    onContentReset: vi.fn(() => { state.text = ''; state.resetCount += 1; }),
    onStreamEnd: vi.fn(() => { state.streamEndCount += 1; }),
    onDone: vi.fn((p) => { state.donePayload = p; }),
    onError: vi.fn((m) => { state.error = m; }),
    onEarlyEvent: vi.fn((e) => { state.early.push(e.type); }),
    onClose: vi.fn(),
  };
  return { state, cb };
}

const TERMINAL = {
  contentUnchanged: true,
  provider: 'claude',
  model: 'claude-sonnet-5',
  parkName: 'Zion National Park',
  hasItinerary: false,
  remainingAllowance: 4,
  canSendMore: true,
};

const LEGACY_TURN = [
  { type: 'thinking', sources: [], parkName: 'Zion National Park', parkNames: [] },
  { type: 'thinking', sources: ['nps', 'weather'], parkName: 'Zion National Park', parkNames: ['Zion National Park'], parkImages: ['https://img/1.jpg'] },
  { type: 'thinking', stage: 'writing_response' },
  { type: 'chunk', content: 'Day 1: ' },
  { type: 'chunk', content: 'Angels Landing.' },
  { type: 'stream_end' },
  { type: 'done', ...TERMINAL },
];

const V2_TURN = [
  { type: 'response_started', responseId: 'resp-1' },
  { type: 'display_context', parkName: 'Zion National Park', parkNames: [] },
  { type: 'evidence_ready', publicSources: ['nps', 'weather'], coverage: 'partial', freshness: 'fresh' },
  { type: 'display_context', parkName: 'Zion National Park', parkNames: ['Zion National Park'], parkImages: ['https://img/1.jpg'] },
  { type: 'progress', stage: 'writing_response' },
  { type: 'content_delta', content: 'Day 1: ' },
  { type: 'content_delta', content: 'Angels Landing.' },
  { type: 'response_finalized', ...TERMINAL },
];

describe('WP10F-3 — consumeAiSseStream routes both dialects through the normalizer', () => {
  it('legacy and v2 leave the callbacks in an equivalent UI state', async () => {
    const legacy = harness();
    await consumeAiSseStream(sseResponse(LEGACY_TURN), legacy.cb);
    const v2 = harness();
    await consumeAiSseStream(sseResponse(V2_TURN), v2.cb);

    const project = (s) => ({
      text: s.text, sources: s.sources, stage: s.stage, images: s.images, streamEndCount: s.streamEndCount,
    });
    expect(project(v2.state)).toEqual(project(legacy.state));

    expect(v2.state.text).toBe('Day 1: Angels Landing.');
    expect(v2.state.sources).toEqual(['nps', 'weather']);
    expect(v2.state.stage).toBe('writing_response'); // product→internal keeps copy resolvable
    expect(v2.state.images).toEqual(['https://img/1.jpg']);
    expect(v2.state.streamEndCount).toBe(1); // stream_finished exactly once
  });

  it('display images appear from legacy thinking AND from v2 display_context', async () => {
    const legacy = harness();
    await consumeAiSseStream(sseResponse(LEGACY_TURN), legacy.cb);
    expect(legacy.state.images).toEqual(['https://img/1.jpg']);

    const v2 = harness();
    await consumeAiSseStream(sseResponse(V2_TURN), v2.cb);
    expect(v2.state.images).toEqual(['https://img/1.jpg']);
  });

  it('dispatches a rejected-attempt reset before accepted-attempt content', async () => {
    const { state, cb } = harness();
    await consumeAiSseStream(sseResponse([
      { type: 'content_delta', content: 'Bad first prose.' },
      { type: 'content_reset' },
      { type: 'content_delta', content: 'Good second prose.' },
      { type: 'response_finalized', content: 'Good second prose.' },
    ]), cb);

    expect(state.text).toBe('Good second prose.');
    expect(state.resetCount).toBe(1);
    expect(cb.onContentReset).toHaveBeenCalledTimes(1);
    expect(state.donePayload.content).toBe('Good second prose.');
  });

  it('v2 evidence_ready ALONE never sets images (permanent boundary)', async () => {
    const { state, cb } = harness();
    await consumeAiSseStream(sseResponse([
      { type: 'evidence_ready', publicSources: ['nps'], parkName: 'LEAK', parkImages: ['leak.jpg'] },
      { type: 'response_finalized', ...TERMINAL },
    ]), cb);
    expect(state.images).toEqual([]);
    expect(cb.onDisplayContext).not.toHaveBeenCalled();
    expect(state.sources).toEqual(['nps']);
  });

  it('display_context dispatches through onDisplayContext, never onThinking', async () => {
    const { cb } = harness();
    await consumeAiSseStream(sseResponse([
      { type: 'display_context', parkName: 'Zion', parkImages: ['a.jpg'] },
      { type: 'response_finalized', ...TERMINAL },
    ]), cb);
    expect(cb.onDisplayContext).toHaveBeenCalledTimes(1);
    // onThinking is only for progress/evidence — a lone display must not touch it.
    expect(cb.onThinking).not.toHaveBeenCalled();
  });

  it('stream_finished fires onStreamEnd exactly once — legacy (stream_end) and v2 (finalize-synthesized)', async () => {
    const legacy = harness();
    await consumeAiSseStream(sseResponse(LEGACY_TURN), legacy.cb);
    expect(legacy.cb.onStreamEnd).toHaveBeenCalledTimes(1);

    // v2 with NO prose_ready — finalize must synthesize the missing stream_finished.
    const v2 = harness();
    await consumeAiSseStream(sseResponse(V2_TURN), v2.cb);
    expect(v2.cb.onStreamEnd).toHaveBeenCalledTimes(1);
  });

  it('v2 prose_ready drives the single stream_finished ahead of the terminal', async () => {
    const { cb } = harness();
    const order = [];
    cb.onStreamEnd.mockImplementation(() => order.push('stream_end'));
    cb.onDone.mockImplementation(() => order.push('done'));
    cb.onEarlyEvent.mockImplementation((e) => order.push(e.type));
    await consumeAiSseStream(sseResponse([
      { type: 'response_started', responseId: 'r1' },
      { type: 'itinerary_ready', response: { itineraryHash: 'h1' }, canonicalPlan: { days: [] } },
      { type: 'content_delta', content: 'plan' },
      { type: 'prose_ready', response: { itineraryHash: 'h1' }, canonicalPlan: { days: [] }, expectedPreviousRevision: 1 },
      { type: 'response_finalized', itineraryHash: 'h1', content: 'plan' },
    ]), cb);
    expect(order).toEqual(['response_started', 'itinerary_ready', 'stream_end', 'prose_ready', 'done']);
    expect(cb.onStreamEnd).toHaveBeenCalledTimes(1);
  });

  it('itinerary_ready / prose_ready are forwarded to onEarlyEvent for the coordinator', async () => {
    const { cb } = harness();
    await consumeAiSseStream(sseResponse([
      { type: 'itinerary_ready', response: { itineraryHash: 'h1' }, canonicalPlan: { days: [] } },
      { type: 'response_finalized', itineraryHash: 'h1', content: 'x' },
    ]), cb);
    const early = cb.onEarlyEvent.mock.calls.map((c) => c[0]);
    expect(early.some((e) => e.type === 'itinerary_ready' && e.response.itineraryHash === 'h1')).toBe(true);
  });

  it('a duplicate terminal is ignored — onDone fires once', async () => {
    const { cb } = harness();
    await consumeAiSseStream(sseResponse([
      { type: 'response_finalized', content: 'A' },
      { type: 'response_finalized', content: 'B' },
    ]), cb);
    expect(cb.onDone).toHaveBeenCalledTimes(1);
    expect(cb.onDone.mock.calls[0][0].content).toBe('A');
  });

  it('a post-terminal event is ignored', async () => {
    const { cb } = harness();
    await consumeAiSseStream(sseResponse([
      { type: 'response_finalized', content: 'final' },
      { type: 'content_delta', content: 'late' },
      { type: 'progress', stage: 'writing_response' },
    ]), cb);
    expect(cb.onChunk).not.toHaveBeenCalled();
    expect(cb.onThinking).not.toHaveBeenCalled();
  });

  it('malformed / unknown events are ignored safely', async () => {
    const { cb } = harness();
    await consumeAiSseStream(sseResponse([
      { type: 'prose_generation_started', responseId: 'r1' }, // observational — dropped
      { type: 'totally_unknown_event' },
      { type: 'done', ...TERMINAL },
    ]), cb);
    expect(cb.onEarlyEvent).not.toHaveBeenCalled();
    expect(cb.onDone).toHaveBeenCalledTimes(1);
  });

  it('onClose still reports sawStreamEnd/sawDone', async () => {
    const { cb } = harness();
    await consumeAiSseStream(sseResponse(LEGACY_TURN), cb);
    expect(cb.onClose).toHaveBeenCalledWith({ sawStreamEnd: true, sawDone: true });
  });
});
