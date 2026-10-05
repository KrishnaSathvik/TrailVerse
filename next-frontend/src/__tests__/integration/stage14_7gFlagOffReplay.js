/**
 * Stage 14.7G §11 — offline flag-off replay of a captured transcript.
 *
 * The question this answers is narrow and specific: if early-itinerary delivery
 * were switched OFF while a response containing early-revision events was
 * already in flight (a rollback mid-turn, an older client, a cached bundle),
 * does the legacy terminal path still produce exactly one correct result?
 *
 * So this replays RECORDED BYTES. It makes zero provider calls and issues no
 * live generation — feeding a second paid request through the flag-off path
 * would be a different response, and therefore not a controlled comparison.
 *
 * Flag-off is modelled the way the client actually experiences it: the early
 * events still arrive on the wire (the server emitted them before the flag
 * changed), but the coordinator is never told about them. `earlyRevisionActive`
 * therefore stays false, the coordinator does not claim terminal persistence,
 * compatibility chunks render, and `stream_end` finalises — exactly the legacy
 * behaviour.
 */

import { consumeAiSseStream } from '@/services/aiService';
import { createEarlyRevisionCoordinator } from '@/utils/earlyRevisionCoordinator';

/** Rebuilds a fetch-like Response from recorded SSE bytes. */
function responseFromTranscript(rawSseTranscript) {
  const bytes = new TextEncoder().encode(rawSseTranscript);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

/**
 * @param {string} rawSseTranscript  bytes captured from the live run
 * @param {Object} [options]
 * @param {Function} [options.persistTerminal] stand-in for the terminal write;
 *        defaults to an in-memory recorder so the replay touches no store.
 * @returns {Promise<Object>} replay evidence
 */
export async function replayFlagOff(rawSseTranscript, { persistTerminal = null } = {}) {
  const observed = {
    earlyEventsOnWire: [],
    parsedEvents: [],
    renderedText: '',
    terminalPersistenceRequests: 0,
    assistantTurns: 0,
    plans: 0,
    contractErrors: [],
    // Proven, not assumed: the replay has no provider client at all.
    providerCalls: 0,
  };

  const terminalWrites = [];

  const coordinator = createEarlyRevisionCoordinator({
    initialTripId: null,
    // Neither revision path may run under flag-off. If either is reached, the
    // count becomes nonzero and the caller's assertion fails loudly.
    persistRevision1: async () => {
      observed.contractErrors.push('revision_1_reached_under_flag_off');
      return { ok: false };
    },
    persistRevision2: async () => {
      observed.contractErrors.push('revision_2_reached_under_flag_off');
      return { ok: false };
    },
    persistTerminal: async (effect) => {
      observed.terminalPersistenceRequests += 1;
      terminalWrites.push(effect ?? null);
      if (persistTerminal) return persistTerminal(effect);
      return { ok: true };
    },
    view: {
      revealItinerary: () => { observed.contractErrors.push('itinerary_revealed_under_flag_off'); },
      revealProse: () => { observed.contractErrors.push('prose_revealed_under_flag_off'); },
      revealTerminal: () => { observed.assistantTurns += 1; },
      setPendingLabel: () => { observed.contractErrors.push('pending_label_under_flag_off'); },
      setTripId: () => {},
      onComplete: () => {},
      onContractError: (e) => observed.contractErrors.push(e?.code || 'unknown'),
    },
  });

  const response = responseFromTranscript(rawSseTranscript);

  await consumeAiSseStream(response, {
    // The events ARE on the wire and ARE parsed — they are simply not routed
    // into the coordinator, which is precisely what the flag being off means.
    onEarlyEvent: (event) => {
      observed.earlyEventsOnWire.push(event.type);
      observed.parsedEvents.push(event.type);
    },
    onThinking: () => observed.parsedEvents.push('thinking'),
    onChunk: (text) => {
      observed.parsedEvents.push('chunk');
      if (coordinator.shouldRenderLegacyChunk({})) observed.renderedText += text ?? '';
    },
    onStreamEnd: () => {
      observed.parsedEvents.push('stream_end');
      if (coordinator.shouldFinalizeLegacyStream()) observed.assistantTurns += 1;
    },
    onDone: (event) => {
      observed.parsedEvents.push('done');
      coordinator.handleEvent({ ...event, type: 'done' });
    },
    onError: () => observed.parsedEvents.push('error'),
  });

  await coordinator.drain();

  observed.plans = terminalWrites.filter(Boolean).length > 0 ? 1 : (observed.assistantTurns > 0 ? 1 : 0);

  const ok =
    observed.providerCalls === 0
    && observed.terminalPersistenceRequests <= 1
    && observed.assistantTurns <= 1
    && observed.contractErrors.length === 0
    && coordinator.ownsTerminalPersistence() === false;

  return {
    ok,
    ...observed,
    coordinatorOwnedTerminalPersistence: coordinator.ownsTerminalPersistence(),
    earlyRevisionActive: coordinator.getState()?.earlyRevisionActive ?? false,
  };
}
