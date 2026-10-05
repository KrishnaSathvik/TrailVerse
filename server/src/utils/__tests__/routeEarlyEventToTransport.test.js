'use strict';

/**
 * WP10B-2 — translate the createEarlyEventEmitter typed payloads into transport
 * adapter method calls. This is the emit sink the /chat-stream route gives to
 * earlyEvents, so earlyEvents keeps its once-gating + timing while the transport
 * adapter owns dialect serialization.
 */

const { routeEarlyEventToTransport, CANONICAL_EVENT } = require('../trailieTransportAdapter');

function recordingTransport() {
  const calls = [];
  return {
    calls,
    responseStarted: (p) => calls.push(['responseStarted', p]),
    itineraryReady: (p) => calls.push(['itineraryReady', p]),
    proseReady: (p) => calls.push(['proseReady', p]),
    progress: (p) => calls.push(['progress', p]),
  };
}

describe('routeEarlyEventToTransport', () => {
  it('routes itinerary_ready to transport.itineraryReady with response + canonicalPlan', () => {
    const t = recordingTransport();
    routeEarlyEventToTransport(t, {
      type: CANONICAL_EVENT.ITINERARY_READY,
      response: { itineraryHash: 'h' },
      canonicalPlan: { days: [] },
    });
    expect(t.calls).toEqual([['itineraryReady', { response: { itineraryHash: 'h' }, canonicalPlan: { days: [] } }]]);
  });

  it('routes prose_ready to transport.proseReady with the succession fields', () => {
    const t = recordingTransport();
    routeEarlyEventToTransport(t, {
      type: 'prose_ready',
      response: { itineraryHash: 'h' },
      canonicalPlan: { days: [] },
      expectedPreviousRevision: 1,
    });
    expect(t.calls).toEqual([['proseReady', {
      response: { itineraryHash: 'h' }, canonicalPlan: { days: [] }, expectedPreviousRevision: 1,
    }]]);
  });

  it('routes response_started to transport.responseStarted', () => {
    const t = recordingTransport();
    routeEarlyEventToTransport(t, { type: 'response_started', responseId: 'r', requiresStructuredItinerary: null });
    expect(t.calls).toEqual([['responseStarted', { responseId: 'r', requiresStructuredItinerary: null }]]);
  });

  it('drops prose_generation_started (no canonical equivalent — covered by itinerary_ready + content stream)', () => {
    const t = recordingTransport();
    expect(routeEarlyEventToTransport(t, { type: 'prose_generation_started', responseId: 'r' })).toBe(false);
    expect(t.calls).toEqual([]);
  });

  it('ignores an unknown/empty payload without throwing', () => {
    const t = recordingTransport();
    expect(routeEarlyEventToTransport(t, undefined)).toBe(false);
    expect(routeEarlyEventToTransport(t, { type: 'nope' })).toBe(false);
    expect(t.calls).toEqual([]);
  });
});
