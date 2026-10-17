import { applyTerminalOwnership } from '@/utils/terminalOwnership';
import { createRequire } from 'module';
import { resolve } from 'path';
import { consumeAiSseStream } from '@/services/aiService';
import { createEarlyRevisionCoordinator } from '@/utils/earlyRevisionCoordinator';
import { upsertItineraryTurn, updateProseTurn, applyPendingLabel } from '@/utils/earlyRevisionMessages';
import { resolveItineraryOnlyTerminalPersistence } from '@/utils/itineraryOnlyTerminalPersistence';
import { selectPlanToPersist } from '@/utils/persistCanonicalPlan';
import { buildResponseSavePayload } from '@/utils/responseSavePayload';

/**
 * Stage 14.6 — deterministic composed-lifecycle harness.
 *
 * The point is that the halves are REAL. Server event construction, freezing,
 * Phase B, the mismatch guard and every persistence DECISION come from the
 * production modules; the client half is the production SSE parser, reducer,
 * coordinator and message reducers. The harness only supplies transport,
 * synthetic providers, and an in-memory store.
 *
 * STATED LIMITATION: this does not drive `routes/ai.js` itself. Express wiring,
 * auth and `prepareChatContext` are covered by the server-side route contracts
 * (`earlyEventRouteScope`, `trailieRouteContract`, `routeReplayCanonicalEquality`).
 * What the harness proves is that the seams below those compose correctly.
 */

// Resolve against the server's own tree so Node's normal resolution finds
// `server/node_modules` — the server modules are CommonJS and stay that way.
// vitest runs with cwd = next-frontend/, so the sibling package is one level up.
const serverRequire = createRequire(
  resolve(process.cwd(), '../server/src/utils/_harness.js')
);

export const server = {
  earlyRevisionEvents: serverRequire('./earlyRevisionEvents'),
  mismatchSafeTerminal: serverRequire('./earlyRevisionEvents'),
  canonicalPersistence: serverRequire('./canonicalPersistence'),
  frozenSuccessionPlan: serverRequire('./frozenSuccessionPlan'),
  planPersistence: serverRequire('./planPersistence'),
  canonicalResponse: serverRequire('./canonicalResponse'),
  finalizeItinerary: serverRequire('./finalizeItinerary'),
  sseStream: serverRequire('./sseStream'),
  storedPresentation: serverRequire('./trailieStoredPresentation'),
  sharedTripPayload: serverRequire('./sharedTripPayload'),
  storedRevisionValidation: serverRequire('./storedRevisionValidation'),
  turn: serverRequire('../services/proseConsistencyService'),
  proseRecoveryService: serverRequire('../services/proseRecoveryService'),
  proseRecoveryLease: serverRequire('../services/proseRecoveryLease'),
};

/** Deterministic identity + clock, so flag-off transcripts are byte-comparable. */
export function createDeterministicEnvironment({ seed = 'stage146' } = {}) {
  let uuidCounter = 0;
  let clock = 0;
  return {
    nextResponseId: () => `${seed}-response-${++uuidCounter}`,
    now: () => (clock += 10),
    isoNow: () => new Date(1767225600000 + (clock += 1000)).toISOString(),
  };
}

// ── Persistence adapter ──────────────────────────────────────────────────────

/**
 * In-memory trips, but every accept/reject decision comes from the REAL
 * `resolveCanonicalResponsePersistence`, including revision comparison,
 * assistant-turn merge, plan preservation and create idempotency. Nothing here
 * is an unconditional success.
 */
export function createPersistenceAdapter() {
  const { resolveCanonicalResponsePersistence, resolveCreateIdempotency, mergeTerminalRevisionIntoConversation } =
    server.canonicalPersistence;

  const state = {
    trips: new Map(),
    persistenceAttempts: 0,
    acceptedWrites: 0,
    idempotentWrites: 0,
    staleWrites: 0,
    conflictingWrites: 0,
  };
  let nextId = 1;

  const counts = (outcome) => {
    if (outcome === 'accept') state.acceptedWrites += 1;
    else if (outcome === 'idempotent') state.idempotentWrites += 1;
    else if (outcome === 'stale') state.staleWrites += 1;
    else if (outcome === 'conflict') state.conflictingWrites += 1;
  };

  function write({ tripId, conversation, plan, expectedPreviousRevision, userId = 'user-1' }) {
    state.persistenceAttempts += 1;
    const payload = buildResponseSavePayload({
      conversation,
      summary: { hasPlan: Boolean(plan?.days?.length) },
      plan,
      expectedPreviousRevision,
    });

    // ── create ──
    if (!tripId || String(tripId).startsWith('temp-')) {
      const existing = [...state.trips.values()].find(
        (t) => t.userId === userId && t.plan?.responseId === plan?.responseId
      );
      const decision = resolveCreateIdempotency({
        incomingPlan: plan,
        existingPlan: existing?.plan || null,
        expectedPreviousRevision: payload.expectedPreviousRevision,
      });
      if (decision.action === 'RETURN_EXISTING') {
        state.idempotentWrites += 1;
        return { ok: true, tripId: existing._id, outcome: 'idempotent' };
      }
      if (decision.action === 'UPDATE_EXISTING') {
        return write({ tripId: existing._id, conversation, plan, expectedPreviousRevision, userId });
      }
      if (decision.action === 'REJECT') {
        state.conflictingWrites += 1;
        return { ok: false, outcome: 'conflict', reason: decision.reason };
      }
      const _id = `trip-${nextId++}`;
      state.trips.set(_id, { _id, userId, plan, conversation, createdAt: new Date(0) });
      state.acceptedWrites += 1;
      return { ok: true, tripId: _id, outcome: 'accept' };
    }

    // ── update ──
    const trip = state.trips.get(tripId);
    if (!trip) return { ok: false, outcome: 'conflict', reason: 'not_found' };

    const resolution = resolveCanonicalResponsePersistence({
      incomingPlan: payload.plan,
      incomingConversation: payload.conversation,
      expectedPreviousVersion: payload.expectedPreviousVersion,
      expectedPreviousRevision: payload.expectedPreviousRevision,
      existingPlan: trip.plan,
      existingConversation: trip.conversation,
    });
    counts(resolution.outcome);

    if (!resolution.writeResponseCoupled) {
      return {
        ok: resolution.success === true,
        outcome: resolution.outcome,
        reason: resolution.reason,
        storedIdentity: resolution.storedIdentity || null,
        tripId,
      };
    }

    let conversationToStore = payload.conversation;
    let planToStore = payload.plan;
    if (resolution.revisionSuccession) {
      conversationToStore = mergeTerminalRevisionIntoConversation({
        storedConversation: trip.conversation,
        incomingConversation: payload.conversation,
        responseId: resolution.incomingIdentity.responseId,
      });
      // Stage 14.7F4B §2 — the SAME complete-freeze helper the controller uses,
      // so this harness cannot drift from production succession behaviour.
      planToStore = server.frozenSuccessionPlan.buildFrozenSuccessionPlan({
        storedPlan: trip.plan,
        incomingPlan: payload.plan,
        resolvedIdentity: resolution.incomingIdentity,
      });
    }
    trip.conversation = conversationToStore;
    trip.plan = planToStore;
    return { ok: true, outcome: resolution.outcome, tripId };
  }

  return {
    state,
    write,
    getTrip: (id) => state.trips.get(id),
    tripCount: () => state.trips.size,
    counters: () => ({
      trips: state.trips.size,
      plans: [...state.trips.values()].filter((t) => t.plan).length,
      conversationTurns: [...state.trips.values()].reduce((n, t) => n + (t.conversation?.length || 0), 0),
      persistenceAttempts: state.persistenceAttempts,
      acceptedWrites: state.acceptedWrites,
      idempotentWrites: state.idempotentWrites,
      staleWrites: state.staleWrites,
      conflictingWrites: state.conflictingWrites,
    }),
  };
}

// ── SSE transport ────────────────────────────────────────────────────────────

/** Captures the exact wire bytes the real `writeSseEvent` produces. */
export function createSseRecorder() {
  const frames = [];
  let text = '';
  const res = {
    writableEnded: false,
    write(chunk) {
      text += chunk;
      const parsed = JSON.parse(String(chunk).slice(6).trim());
      frames.push(parsed);
      return true;
    },
    end() {
      this.writableEnded = true;
    },
  };
  return {
    res,
    frames,
    get text() {
      return text;
    },
    types: () => frames.map((f) => f.type),
    /** A Response-like object so the REAL frontend parser consumes real bytes. */
    toResponse() {
      const bytes = new TextEncoder().encode(text);
      let sent = false;
      return {
        headers: { get: () => 'text/event-stream' },
        body: {
          getReader: () => ({
            read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: bytes })),
          }),
        },
      };
    },
  };
}

// ── Simulated client ─────────────────────────────────────────────────────────

/**
 * The production coordinator + message reducers, plus an ordered journal so
 * "persisted before revealed" is an assertion about real ordering rather than a
 * claim about intent.
 */
export function createSimulatedClient({ persistence, tripId = null, userId = 'user-1', seedRecovery = null }) {
  const journal = [];
  let messages = [{ id: 1, role: 'user', content: 'Plan a trip' }];
  let currentTripId = tripId;
  let currentPlan = null;
  let legacyChunks = '';
  let legacyTerminalCount = 0;
  const cardMounts = new Map();

  const record = (event) => journal.push(event);

  /**
   * Persist effects carry identity on `effect.response`; only the REVEAL effects
   * carry it at the top level. The message reducers key on the top-level fields,
   * so normalize before building the conversation to persist.
   */
  const asTurnEffect = (effect, extra = {}) => ({
    responseId: effect.response?.responseId,
    responseVersion: effect.response?.responseVersion,
    itineraryHash: effect.response?.itineraryHash,
    content: effect.response?.content ?? '',
    response: effect.response,
    canonicalPlan: effect.canonicalPlan,
    ...extra,
  });

  const persistThrough = (effect, { expectedPreviousRevision, conversation }) => {
    const result = persistence.write({
      tripId: currentTripId,
      conversation,
      plan: effect.canonicalPlan,
      expectedPreviousRevision,
      userId,
    });
    if (result.ok && result.tripId) currentTripId = result.tripId;
    return result;
  };

  const coordinator = createEarlyRevisionCoordinator({
    initialTripId: tripId,

    persistRevision1: async (effect) => {
      record('revision_1_persist_started');
      const conversation = upsertItineraryTurn(messages, asTurnEffect(effect));
      const result = persistThrough(effect, { conversation });
      record(result.ok ? 'revision_1_persist_succeeded' : 'revision_1_persist_failed');
      return result;
    },

    persistRevision2: async (effect) => {
      record('revision_2_persist_started');
      const turnEffect = asTurnEffect(effect);
      const conversation = updateProseTurn(upsertItineraryTurn(messages, turnEffect), turnEffect);
      const result = persistThrough(effect, {
        conversation,
        expectedPreviousRevision: effect.expectedPreviousRevision,
      });
      record(result.ok ? 'revision_2_persist_succeeded' : 'revision_2_persist_failed');
      return result;
    },

    persistTerminal: async (effect) => {
      record('terminal_persist_started');
      const settled = resolveItineraryOnlyTerminalPersistence({ reason: effect.reason, tripId: currentTripId });
      if (!settled.shouldWrite && effect.terminalDecision.ownership === 'itinerary_only') {
        record('terminal_persist_succeeded');
        return settled.result;
      }
      const done = effect.done || {};
      const plan = selectPlanToPersist({ data: done, currentPlan });
      const conversation = applyTerminalOwnership(messages, effect.terminalDecision);
      const result = persistence.write({ tripId: currentTripId, conversation, plan, userId });
      if (result.ok && result.tripId) currentTripId = result.tripId;
      record(result.ok ? 'terminal_persist_succeeded' : 'terminal_persist_failed');
      return result;
    },

    legacyTerminal: (done) => {
      legacyTerminalCount += 1;
      record('legacy_terminal');
      const plan = selectPlanToPersist({ data: done, currentPlan });
      messages = [
        ...messages,
        { id: 2, role: 'assistant', content: done.content ?? legacyChunks, responseId: done.responseId },
      ];
      currentPlan = plan;
      persistence.write({ tripId: currentTripId, conversation: messages, plan, userId });
    },

    view: {
      setTripId: (id) => {
        currentTripId = id;
      },
      revealItinerary: (effect) => {
        record('itinerary_revealed');
        currentPlan = effect.canonicalPlan;
        messages = upsertItineraryTurn(messages, effect);
        const key = effect.itineraryHash;
        cardMounts.set(key, (cardMounts.get(key) || 0) + 1);
      },
      revealProse: (effect) => {
        record('prose_revealed');
        currentPlan = effect.canonicalPlan;
        messages = updateProseTurn(messages, effect);
      },
      revealTerminal: (effect) => {
        record('terminal_revealed');
        const done = effect.done || {};
        messages = applyTerminalOwnership(messages, effect.terminalDecision);
        if (done.canonicalPlan) currentPlan = done.canonicalPlan;
      },
      setPendingLabel: (effect) => {
        messages = applyPendingLabel(messages, effect);
      },
      onContractError: (e) => record(`contract_error:${e.code}`),
      onComplete: () => record('done_reconciled'),
    },
  });

  if (seedRecovery) {
    const s = coordinator.getState();
    coordinator.seed({
      ...s,
      status: 'itinerary_visible',
      responseStartedSeen: true,
      earlyRevisionActive: true,
      responseId: seedRecovery.message.responseId,
      responseVersion: seedRecovery.message.responseVersion,
      itineraryHash: seedRecovery.message.itineraryHash,
      tripId: tripId,
      revision1: { response: seedRecovery.message, canonicalPlan: seedRecovery.plan },
      persistedItineraryHash: seedRecovery.message.itineraryHash,
      itineraryVisible: true,
    });
    messages = [...messages, seedRecovery.message];
  }

  /** Feed the REAL wire bytes through the REAL parser. */
  async function consume(recorder) {
    await consumeAiSseStream(recorder.toResponse(), {
      onEarlyEvent: (event) => {
        if (event.type === 'itinerary_ready') record('revision_1_received');
        if (event.type === 'prose_ready') record('revision_2_received');
        coordinator.handleEvent(event);
      },
      onChunk: (chunk) => {
        if (coordinator.shouldRenderLegacyChunk()) {
          legacyChunks += chunk;
          record('legacy_chunk_rendered');
        }
      },
      onStreamEnd: () => {
        if (coordinator.shouldFinalizeLegacyStream()) record('legacy_stream_finalized');
      },
      onDone: (event) => coordinator.handleEvent({
        ...event,
        type: 'done',
        canonicalPlan: event.canonicalPlan || event.itineraryData || event.itinerary || null,
      }),
      onError: () => record('stream_error'),
      onClose: ({ sawDone }) => {
        if (!sawDone) coordinator.handleEvent({ type: 'stream_aborted' });
      },
    });
    await coordinator.drain();
  }

  return {
    coordinator,
    consume,
    journal,
    cardMounts,
    get messages() {
      return messages;
    },
    get plan() {
      return currentPlan;
    },
    get tripId() {
      return currentTripId;
    },
    get legacyChunks() {
      return legacyChunks;
    },
    get legacyTerminalCount() {
      return legacyTerminalCount;
    },
    assistantTurns: () => messages.filter((m) => m.role === 'assistant'),
  };
}

/** Assert `a` strictly precedes `b` in the journal. */
export function assertOrder(journal, a, b) {
  const ia = journal.indexOf(a);
  const ib = journal.indexOf(b);
  if (ia === -1 || ib === -1) {
    throw new Error(`journal missing ${ia === -1 ? a : b}; got: ${journal.join(' → ')}`);
  }
  if (!(ia < ib)) throw new Error(`expected ${a} before ${b}; got: ${journal.join(' → ')}`);
  return true;
}
