import { describe, it, expect, vi } from 'vitest';
import { consumeAiSseStream } from '@/services/aiService';

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

function callbacks() {
  return {
    onThinking: vi.fn(),
    onChunk: vi.fn(),
    onStreamEnd: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
    onClose: vi.fn(),
    onEarlyEvent: vi.fn(),
  };
}

const rev1 = {
  type: 'itinerary_ready',
  response: { responseId: 'r1', responseRevision: 1, itineraryHash: 'h1' },
  canonicalPlan: { responseId: 'r1', itineraryHash: 'h1' },
};

describe('typed early-delivery SSE events', () => {
  it('forwards the canonical early events, in order, with their payload intact (WP10F-3)', async () => {
    const cb = callbacks();
    await consumeAiSseStream(
      sseResponse([
        { type: 'response_started', responseId: 'r1', requiresStructuredItinerary: null },
        { type: 'thinking', stage: 'planning' },
        rev1,
        // prose_generation_started is observational and is NOT emitted by the
        // server adapter post-WP10 (routeEarlyEventToTransport drops it), so the
        // client normalizer drops it too — never on either wire.
        { type: 'prose_generation_started', responseId: 'r1' },
        {
          type: 'prose_ready',
          expectedPreviousRevision: 1,
          response: { responseId: 'r1', responseRevision: 2 },
          canonicalPlan: { responseId: 'r1' },
        },
        { type: 'done', responseId: 'r1', content: 'final' },
      ]),
      cb
    );

    expect(cb.onEarlyEvent.mock.calls.map((c) => c[0].type)).toEqual([
      'response_started',
      'itinerary_ready',
      'prose_ready',
    ]);
    expect(cb.onEarlyEvent.mock.calls[1][0].response).toEqual(rev1.response);
    expect(cb.onEarlyEvent.mock.calls[1][0].canonicalPlan).toEqual(rev1.canonicalPlan);
    expect(cb.onEarlyEvent.mock.calls[2][0].expectedPreviousRevision).toBe(1);
  });

  it('still delivers thinking, done and close exactly as before', async () => {
    const cb = callbacks();
    await consumeAiSseStream(
      sseResponse([
        { type: 'thinking', stage: 'planning' },
        rev1,
        { type: 'stream_end' },
        { type: 'done', responseId: 'r1', content: 'final' },
      ]),
      cb
    );

    expect(cb.onThinking).toHaveBeenCalledTimes(1);
    expect(cb.onStreamEnd).toHaveBeenCalledTimes(1);
    expect(cb.onDone).toHaveBeenCalledTimes(1);
    expect(cb.onDone.mock.calls[0][0].content).toBe('final');
    expect(cb.onClose).toHaveBeenCalledWith({ sawStreamEnd: true, sawDone: true });
  });

  it('does not route early events through onChunk or onDone', async () => {
    const cb = callbacks();
    await consumeAiSseStream(sseResponse([rev1, { type: 'done', responseId: 'r1' }]), cb);

    expect(cb.onChunk).not.toHaveBeenCalled();
    expect(cb.onDone).toHaveBeenCalledTimes(1);
    expect(cb.onDone.mock.calls[0][0].type).toBe('done');
  });

  it('behaves identically when no early events are present (flag off)', async () => {
    const cb = callbacks();
    await consumeAiSseStream(
      sseResponse([
        { type: 'thinking', stage: 'planning' },
        { type: 'chunk', content: 'hello ' },
        { type: 'chunk', content: 'world' },
        { type: 'stream_end' },
        { type: 'done', responseId: 'r1', content: 'hello world' },
      ]),
      cb
    );

    expect(cb.onEarlyEvent).not.toHaveBeenCalled();
    expect(cb.onChunk.mock.calls.map((c) => c[0])).toEqual(['hello ', 'world']);
    expect(cb.onDone).toHaveBeenCalledTimes(1);
    expect(cb.onClose).toHaveBeenCalledWith({ sawStreamEnd: true, sawDone: true });
  });

  it('works without an onEarlyEvent handler at all', async () => {
    const cb = callbacks();
    delete cb.onEarlyEvent;
    await expect(
      consumeAiSseStream(sseResponse([rev1, { type: 'done', responseId: 'r1' }]), cb)
    ).resolves.toBeUndefined();
    expect(cb.onDone).toHaveBeenCalledTimes(1);
  });

  it('reassembles events split across transport chunks', async () => {
    const cb = callbacks();
    await consumeAiSseStream(sseResponse([rev1, { type: 'done', responseId: 'r1' }], { chunkSize: 7 }), cb);

    expect(cb.onEarlyEvent).toHaveBeenCalledTimes(1);
    expect(cb.onEarlyEvent.mock.calls[0][0].response.itineraryHash).toBe('h1');
    expect(cb.onDone).toHaveBeenCalledTimes(1);
  });

  it('ignores unparseable and unknown lines without disturbing the stream', async () => {
    const cb = callbacks();
    const text = 'data: {not json\ndata: {"type":"unknown_future_event"}\n'
      + `data: ${JSON.stringify({ type: 'done', responseId: 'r1' })}\n`;
    const bytes = new TextEncoder().encode(text);
    let sent = false;
    await consumeAiSseStream(
      {
        body: {
          getReader: () => ({
            read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: bytes })),
          }),
        },
      },
      cb
    );

    expect(cb.onEarlyEvent).not.toHaveBeenCalled();
    expect(cb.onDone).toHaveBeenCalledTimes(1);
  });
});
