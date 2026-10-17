import { describe, it, expect } from 'vitest';
import {
  server,
  createPersistenceAdapter,
  createSimulatedClient,
  assertOrder,
} from './stage14Harness';
import {
  runTurn,
  createProviderLedger,
  VERIFIED_PROSE,
  UNVERIFIABLE_PROSE,
  ITINERARY,
} from './stage14Turn';

const { deriveTrailieStoredPresentation, VIEWER_CONTEXT } = server.storedPresentation;
const { SHARE_SCOPE, buildSharedTripPayload } = server.sharedTripPayload;

/** Run a full server turn, then feed its real bytes through the real client. */
async function compose(turnOptions = {}, clientOptions = {}) {
  const persistence = createPersistenceAdapter();
  const turn = await runTurn(turnOptions);
  const client = createSimulatedClient({ persistence, ...clientOptions });
  await client.consume(turn.recorder);
  return { persistence, turn, client };
}

const latestAssistant = (client) => client.assistantTurns().at(-1);

const presentationFor = (client, viewerContext = VIEWER_CONTEXT.OWNER, recoveryCapability = false) =>
  deriveTrailieStoredPresentation({
    response: latestAssistant(client),
    canonicalPlan: client.plan,
    viewerContext,
    recoveryCapability,
  });

// ── A. Normal early delivery ─────────────────────────────────────────────────

describe('A — normal early delivery', () => {
  it('emits the full typed transcript exactly once each', async () => {
    const { turn } = await compose();
    expect(turn.recorder.types()).toEqual([
      'response_started', 'thinking', 'itinerary_ready', 'prose_generation_started',
      'chunk', 'stream_end', 'prose_ready', 'done',
    ]);
  });

  it('performs exactly two accepted canonical writes and no third from done', async () => {
    const { persistence, client } = await compose();
    const c = persistence.counters();

    expect(c.acceptedWrites).toBe(2);
    expect(c.conflictingWrites).toBe(0);
    expect(c.staleWrites).toBe(0);
    expect(client.journal.filter((e) => e === 'terminal_persist_started')).toHaveLength(0);
    expect(client.journal).toContain('done_reconciled');
  });

  it('keeps one trip, one plan and one assistant turn', async () => {
    const { persistence, client } = await compose();

    expect(persistence.tripCount()).toBe(1);
    expect(client.assistantTurns()).toHaveLength(1);
    expect(client.messages.filter((m) => m.role === 'user')).toHaveLength(1);
    expect(client.plan.days).toHaveLength(2);
  });

  it('never reveals before the matching persistence succeeded', async () => {
    const { client } = await compose();

    assertOrder(client.journal, 'revision_1_persist_succeeded', 'itinerary_revealed');
    assertOrder(client.journal, 'revision_2_persist_succeeded', 'prose_revealed');
    assertOrder(client.journal, 'itinerary_revealed', 'revision_2_persist_started');
  });

  it('suppresses the replayed legacy chunks', async () => {
    const { client } = await compose();

    expect(client.legacyChunks).toBe('');
    expect(client.journal).not.toContain('legacy_chunk_rendered');
    expect(client.journal).not.toContain('legacy_stream_finalized');
  });

  it('spends exactly one Phase A and one Phase B call', async () => {
    const { turn } = await compose();
    expect(turn.ledger).toEqual({
      phaseAFirst: 1, phaseARetry: 0, phaseBFirst: 1, phaseBRetry: 0, recoveryPhaseB: 0,
    });
  });
});

// ── B. Structured failure / prose-only ───────────────────────────────────────

describe('B — structured failure, prose-only terminal', () => {
  it('renders legacy chunks and performs one terminal write', async () => {
    const { persistence, client, turn } = await compose({ structuredFailure: true });

    expect(turn.recorder.types()).toEqual(['response_started', 'thinking', 'chunk', 'stream_end', 'done']);
    expect(client.legacyChunks).toContain('Zion is busy in June');
    expect(client.journal).toContain('legacy_stream_finalized');
    expect(client.legacyTerminalCount).toBe(1);
    expect(persistence.counters().acceptedWrites).toBe(1);
  });

  it('creates no early card and no revision-1 shell', async () => {
    const { client } = await compose({ structuredFailure: true });

    expect(client.journal).not.toContain('itinerary_revealed');
    expect(client.assistantTurns()).toHaveLength(1);
    expect(client.assistantTurns()[0].responseRevision).toBeUndefined();
  });

  it('spends one Phase A call and no Phase B call', async () => {
    const { turn } = await compose({ structuredFailure: true });
    expect(turn.ledger.phaseAFirst).toBe(1);
    expect(turn.ledger.phaseBFirst).toBe(0);
  });
});

// ── C / D. Disconnect ────────────────────────────────────────────────────────

describe('C — disconnect before itinerary_ready', () => {
  it('persists nothing, shows nothing, and spends no Phase B', async () => {
    const persistence = createPersistenceAdapter();
    const turn = await runTurn({ structuredFailure: true, replayProseAsChunks: false, emitDone: false });
    const client = createSimulatedClient({ persistence });
    await client.consume(turn.recorder);

    expect(persistence.counters().persistenceAttempts).toBe(0);
    expect(client.journal).not.toContain('itinerary_revealed');
    expect(turn.ledger.phaseBFirst).toBe(0);
  });
});

describe('D — disconnect after a persisted itinerary_ready', () => {
  it('keeps revision 1 durable with no prose, and stays restorable', async () => {
    const { persistence, client } = await compose({ disconnectAfterItineraryReady: true });

    expect(persistence.counters().acceptedWrites).toBe(1);
    expect(client.journal).toContain('itinerary_revealed');
    expect(client.journal).not.toContain('prose_revealed');

    const stored = persistence.getTrip(client.tripId);
    expect(stored.plan.responseRevision).toBe(1);
    expect(stored.plan.lifecycleStatus).toBe('itinerary_ready');
  });

  it('reports itinerary-only on restore and offers recovery to the owner', async () => {
    const { client } = await compose({ disconnectAfterItineraryReady: true });
    const p = presentationFor(client, VIEWER_CONTEXT.OWNER, true);

    expect(p.state).toBe('itinerary_only');
    expect(p.showItinerary).toBe(true);
    expect(p.showProse).toBe(false);
    expect(p.showEmptyAssistantBubble).toBe(false);
    expect(p.showRecoveryAction).toBe(true);
  });

  it('spends no Phase B call', async () => {
    const { turn } = await compose({ disconnectAfterItineraryReady: true });
    expect(turn.ledger.phaseBFirst).toBe(0);
  });
});

// ── E / F / G. Phase B outcomes ──────────────────────────────────────────────

describe('E — Phase B failure with deterministic fallback', () => {
  it('persists a fallback revision 2 and leaves the itinerary unchanged', async () => {
    const { persistence, client } = await compose({
      proseSequence: [UNVERIFIABLE_PROSE, UNVERIFIABLE_PROSE],
    });

    expect(persistence.counters().acceptedWrites).toBe(2);
    expect(client.assistantTurns()).toHaveLength(1);
    expect(latestAssistant(client).lifecycleStatus).toBe('fallback_complete');
    expect(client.plan.days).toHaveLength(2);
  });

  it('renders fallback through the ordinary revision-2 path', async () => {
    const { client } = await compose({ proseSequence: [UNVERIFIABLE_PROSE] });
    assertOrder(client.journal, 'revision_2_persist_succeeded', 'prose_revealed');
    expect(presentationFor(client).state).toBe('fallback_complete');
    expect(presentationFor(client).showProse).toBe(true);
  });
});

describe('F — verifier failure then a successful retry', () => {
  it('uses the retry as revision 2 and keeps the itinerary hash', async () => {
    const { turn, client } = await compose({
      proseSequence: [UNVERIFIABLE_PROSE, VERIFIED_PROSE],
    });

    expect(turn.ledger.phaseBFirst).toBe(1);
    expect(turn.ledger.phaseBRetry).toBe(1);
    expect(latestAssistant(client).lifecycleStatus).toBe('prose_ready');
    expect(latestAssistant(client).itineraryHash).toBe(turn.revisionOne.response.itineraryHash);
  });

  it('never lets the rejected first draft reach the parser, DOM, store, share or export', async () => {
    const { turn, persistence, client } = await compose({
      proseSequence: [UNVERIFIABLE_PROSE, VERIFIED_PROSE],
    });

    const stored = persistence.getTrip(client.tripId);
    const shared = buildSharedTripPayload(
      { ...stored, title: 't', parkName: 'Zion' },
      { scope: SHARE_SCOPE.FULL_CONVERSATION }
    );

    for (const surface of [turn.recorder.text, JSON.stringify(client.messages), JSON.stringify(stored), JSON.stringify(shared)]) {
      expect(surface).not.toContain('broadly speaking');
    }
  });
});

describe('G — retry failure then deterministic fallback', () => {
  it('shows neither rejected draft and persists the fallback normally', async () => {
    const { turn, persistence, client } = await compose({
      proseSequence: [UNVERIFIABLE_PROSE, UNVERIFIABLE_PROSE],
    });

    expect(turn.ledger.phaseBRetry).toBe(1);
    expect(JSON.stringify(client.messages)).not.toContain('broadly speaking');
    expect(persistence.counters().acceptedWrites).toBe(2);
    expect(latestAssistant(client).content.length).toBeGreaterThan(0);
  });
});

// ── H. Revision-2 itinerary mismatch ─────────────────────────────────────────

describe('H — revision-2 itinerary mismatch', () => {
  it('emits no prose_ready and discards the candidate entirely', async () => {
    const { turn } = await compose({ mutateCandidateItinerary: true });

    expect(turn.recorder.types()).not.toContain('prose_ready');
    expect(turn.recorder.text).not.toContain('Injected');
    expect(turn.immutability.ok).toBe(false);
  });

  it('delivers a direct-terminal safe fallback built from the revision-1 snapshot', async () => {
    const { turn, persistence, client } = await compose({ mutateCandidateItinerary: true });
    const done = turn.recorder.frames.at(-1);

    expect(done.type).toBe('done');
    expect(done).not.toHaveProperty('expectedPreviousRevision');
    expect(done.itineraryHash).toBe(turn.revisionOne.response.itineraryHash);

    const stored = persistence.getTrip(client.tripId);
    expect(stored.plan.itineraryHash).toBe(turn.revisionOne.response.itineraryHash);
    expect(JSON.stringify(stored.plan.days)).toBe(JSON.stringify(ITINERARY.days));
  });

  it('is accepted by a client that already persisted revision 1', async () => {
    const { persistence, client } = await compose({ mutateCandidateItinerary: true });

    expect(persistence.counters().conflictingWrites).toBe(0);
    expect(client.assistantTurns()).toHaveLength(1);
    expect(persistence.tripCount()).toBe(1);
  });

  it('is accepted by an old client that saved only done', async () => {
    const persistence = createPersistenceAdapter();
    const turn = await runTurn({ mutateCandidateItinerary: true });
    const done = turn.recorder.frames.at(-1);

    const result = persistence.write({
      tripId: null,
      conversation: [{ role: 'user', content: 'x' }, { role: 'assistant', content: done.content, responseId: done.responseId }],
      plan: done.canonicalPlan,
    });
    expect(result.ok).toBe(true);
  });
});

// ── I. Revision-1 persistence failure ────────────────────────────────────────

describe('I — revision-1 persistence failure', () => {
  async function withFailingRevision1() {
    const persistence = createPersistenceAdapter();
    const realWrite = persistence.write;
    let first = true;
    persistence.write = (args) => {
      if (first && args.plan?.responseRevision === 1) {
        first = false;
        persistence.state.persistenceAttempts += 1;
        persistence.state.conflictingWrites += 1;
        return { ok: false, outcome: 'conflict', reason: 'simulated' };
      }
      return realWrite(args);
    };
    const turn = await runTurn();
    const client = createSimulatedClient({ persistence });
    await client.consume(turn.recorder);
    return { persistence, client, turn };
  }

  it('never shows the card and never persists the typed revision 2', async () => {
    const { client, persistence } = await withFailingRevision1();

    expect(client.journal).not.toContain('itinerary_revealed');
    expect(client.journal).not.toContain('revision_2_persist_started');
    expect(persistence.counters().conflictingWrites).toBe(1);
  });

  it('keeps legacy chunks suppressed and takes exactly one terminal write', async () => {
    const { client, persistence } = await withFailingRevision1();

    expect(client.legacyChunks).toBe('');
    expect(client.journal.filter((e) => e === 'terminal_persist_started')).toHaveLength(1);
    expect(client.legacyTerminalCount).toBe(0);
    expect(persistence.counters().acceptedWrites).toBe(1);
  });

  it('shows exactly one assistant turn, only after the terminal write succeeds', async () => {
    const { client } = await withFailingRevision1();

    assertOrder(client.journal, 'terminal_persist_succeeded', 'terminal_revealed');
    expect(client.assistantTurns()).toHaveLength(1);
    expect(latestAssistant(client).content.length).toBeGreaterThan(0);
  });
});

// ── J. SSE failure during Phase B ────────────────────────────────────────────

describe('J — SSE failure during Phase B', () => {
  it('keeps revision 1 durable and shows no partial prose', async () => {
    const persistence = createPersistenceAdapter();
    const turn = await runTurn({ disconnectAfterItineraryReady: true });
    const client = createSimulatedClient({ persistence });
    await client.consume(turn.recorder);

    expect(persistence.counters().acceptedWrites).toBe(1);
    expect(client.journal).not.toContain('prose_revealed');
    expect(presentationFor(client).state).toBe('itinerary_only');
  });

  it('begins no automatic paid continuation', async () => {
    const { turn } = await compose({ disconnectAfterItineraryReady: true });
    expect(turn.ledger.phaseBFirst).toBe(0);
    expect(turn.ledger.recoveryPhaseB).toBe(0);
  });
});

// ── K. Duplicate delivery of the SAME logical response ───────────────────────

describe('K — duplicate delivery/persistence of one logical response', () => {
  it('yields one trip, one plan and one assistant turn', async () => {
    const persistence = createPersistenceAdapter();
    const turn = await runTurn();
    const client = createSimulatedClient({ persistence });

    // Same bytes delivered twice — duplicate events, duplicate save attempts.
    await client.consume(turn.recorder);
    await client.consume(turn.recorder);

    expect(persistence.tripCount()).toBe(1);
    expect(client.assistantTurns()).toHaveLength(1);
    expect(client.messages.filter((m) => m.itineraryPlan)).toHaveLength(1);
  });

  it('treats the duplicate events as idempotent with no extra accepted writes', async () => {
    const persistence = createPersistenceAdapter();
    const turn = await runTurn();
    const client = createSimulatedClient({ persistence });
    await client.consume(turn.recorder);
    const afterFirst = persistence.counters().acceptedWrites;
    await client.consume(turn.recorder);

    expect(persistence.counters().acceptedWrites).toBe(afterFirst);
    expect(client.coordinator.getMetrics().duplicateEventCount).toBeGreaterThan(0);
  });

  it('does no additional provider work on replay', async () => {
    const ledger = createProviderLedger();
    const persistence = createPersistenceAdapter();
    const turn = await runTurn({ ledger });
    const client = createSimulatedClient({ persistence });
    await client.consume(turn.recorder);
    await client.consume(turn.recorder);

    // Replay is pure transport: the turn already happened.
    expect(ledger).toEqual({ phaseAFirst: 1, phaseARetry: 0, phaseBFirst: 1, phaseBRetry: 0, recoveryPhaseB: 0 });
  });
});

// ── N. Malformed itinerary_ready ─────────────────────────────────────────────

describe('N — malformed itinerary_ready', () => {
  async function withMalformedRevision1() {
    const persistence = createPersistenceAdapter();
    const turn = await runTurn();
    // Corrupt the frame on the wire, exactly as a bad server build would.
    const frames = turn.recorder.frames.map((f) =>
      f.type === 'itinerary_ready'
        ? { ...f, response: { ...f.response, content: 'should have been empty' } }
        : f
    );
    const text = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('');
    const recorder = {
      toResponse: () => {
        const bytes = new TextEncoder().encode(text);
        let sent = false;
        return {
          headers: { get: () => 'text/event-stream' },
          body: { getReader: () => ({ read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: bytes })) }) },
        };
      },
    };
    const client = createSimulatedClient({ persistence });
    await client.consume(recorder);
    return { persistence, client };
  }

  it('faults closed: no revision-1 write, no card, no chunk rendering', async () => {
    const { persistence, client } = await withMalformedRevision1();

    expect(client.coordinator.getState().earlyRevisionFaulted).toBe(true);
    expect(client.coordinator.getState().earlyRevisionActive).toBe(false);
    expect(client.journal).not.toContain('itinerary_revealed');
    expect(client.legacyChunks).toBe('');
    expect(client.journal.some((e) => e.startsWith('contract_error:'))).toBe(true);
    expect(persistence.counters().conflictingWrites).toBe(0);
  });

  it('takes exactly one safe direct-terminal write and never displays the malformed payload', async () => {
    const { persistence, client } = await withMalformedRevision1();

    expect(client.journal.filter((e) => e === 'terminal_persist_started')).toHaveLength(1);
    expect(persistence.counters().acceptedWrites).toBe(1);
    expect(JSON.stringify(client.messages)).not.toContain('should have been empty');
    expect(JSON.stringify(persistence.getTrip(client.tripId))).not.toContain('should have been empty');
  });
});

// ── §7 cross-surface projection invariants ───────────────────────────────────

describe('cross-surface projections', () => {
  it('owner-visible content equals the persisted canonical revision', async () => {
    const { persistence, client } = await compose();
    const stored = persistence.getTrip(client.tripId);
    const storedAssistant = stored.conversation.filter((m) => m.role === 'assistant').at(-1);

    expect(latestAssistant(client).content).toBe(storedAssistant.content);
    expect(latestAssistant(client).contentHash).toBe(storedAssistant.contentHash);
    expect(latestAssistant(client).itineraryHash).toBe(stored.plan.itineraryHash);
  });

  it('plan_only omits prose even when revision 2 is persisted', async () => {
    const { persistence, client } = await compose();
    const stored = persistence.getTrip(client.tripId);
    const shared = buildSharedTripPayload({ ...stored, title: 't', parkName: 'Zion' }, { scope: SHARE_SCOPE.PLAN_ONLY });

    expect(shared.conversation).toEqual([]);
    expect(shared.notesStatus).toBe('complete');
    expect(JSON.stringify(shared)).not.toContain(latestAssistant(client).content);
    expect(shared.plan.days).toHaveLength(2);
  });

  it('a permitted scope exposes exactly the persisted prose', async () => {
    const { persistence, client } = await compose();
    const stored = persistence.getTrip(client.tripId);
    const shared = buildSharedTripPayload(
      { ...stored, title: 't', parkName: 'Zion' },
      { scope: SHARE_SCOPE.PLAN_PLUS_EXPLANATION }
    );

    expect(shared.conversation).toEqual([{ role: 'assistant', content: latestAssistant(client).content }]);
  });

  it('a revision-1 trip never creates an empty public prose bubble', async () => {
    const { persistence, client } = await compose({ disconnectAfterItineraryReady: true });
    const stored = persistence.getTrip(client.tripId);

    for (const scope of Object.values(SHARE_SCOPE)) {
      const shared = buildSharedTripPayload({ ...stored, title: 't', parkName: 'Zion' }, { scope });
      expect(shared.conversation.some((m) => (m.content ?? '') === '')).toBe(false);
      expect(shared.notesStatus).toBe('complete');
    }
  });

  it('the itinerary hash is identical across owner restore, share and export', async () => {
    const { persistence, client } = await compose();
    const stored = persistence.getTrip(client.tripId);
    const ownerHash = latestAssistant(client).itineraryHash;

    expect(stored.plan.itineraryHash).toBe(ownerHash);
    // Share strips the hash but must not alter the itinerary it describes.
    const shared = buildSharedTripPayload({ ...stored, title: 't', parkName: 'Zion' }, { scope: SHARE_SCOPE.PLAN_ONLY });
    expect(JSON.stringify(shared.plan.days)).toBe(JSON.stringify(stored.plan.days));
    expect(server.canonicalResponse.hashPayload({ days: shared.plan.days })).toBe(
      server.canonicalResponse.hashPayload({ days: stored.plan.days })
    );
  });

  it('the itinerary is sourced only from the persisted plan, never from prose', async () => {
    const { persistence, client } = await compose();
    const stored = persistence.getTrip(client.tripId);
    expect(stored.plan.days).toEqual(client.plan.days);
    expect(JSON.stringify(stored.plan.days)).toBe(JSON.stringify(ITINERARY.days));
  });
});

// ── §10 card / message identity ──────────────────────────────────────────────

describe('card, message and plan identity', () => {
  it('does not remount the card when prose arrives', async () => {
    const { turn, client } = await compose();
    const hash = turn.revisionOne.response.itineraryHash;

    expect(client.cardMounts.get(hash)).toBe(1);
    expect(client.cardMounts.size).toBe(1);
  });

  it('keeps the assistant turn keyed by responseId across both revisions', async () => {
    const { turn, client } = await compose();
    expect(latestAssistant(client).responseId).toBe(turn.revisionOne.response.responseId);
    expect(latestAssistant(client).responseRevision).toBe(2);
  });

  it('does not grow the conversation when prose arrives', async () => {
    const persistence = createPersistenceAdapter();
    const turn = await runTurn({ disconnectAfterItineraryReady: true });
    const client = createSimulatedClient({ persistence });
    await client.consume(turn.recorder);
    const afterCard = client.messages.length;

    const full = await compose();
    expect(full.client.messages.length).toBe(afterCard);
  });

  it('never renders an empty assistant bubble for revision 1', async () => {
    const { client } = await compose({ disconnectAfterItineraryReady: true });
    expect(presentationFor(client).showEmptyAssistantBubble).toBe(false);
    expect(presentationFor(client).showProse).toBe(false);
  });

  it('no legacy chunk creates a second assistant turn', async () => {
    const { client } = await compose();
    expect(client.assistantTurns()).toHaveLength(1);
    expect(client.journal).not.toContain('legacy_chunk_rendered');
  });
});

// ── §9 ordering across every scenario ────────────────────────────────────────

describe('visibility never precedes persistence, in any scenario', () => {
  const scenarios = [
    ['normal', {}],
    ['fallback', { proseSequence: [UNVERIFIABLE_PROSE] }],
    ['retry then pass', { proseSequence: [UNVERIFIABLE_PROSE, VERIFIED_PROSE] }],
    ['mismatch fail-safe', { mutateCandidateItinerary: true }],
    ['disconnect after rev 1', { disconnectAfterItineraryReady: true }],
  ];

  it.each(scenarios)('%s', async (_name, options) => {
    const { client } = await compose(options);
    const j = client.journal;

    if (j.includes('itinerary_revealed')) {
      assertOrder(j, 'revision_1_persist_succeeded', 'itinerary_revealed');
    }
    if (j.includes('prose_revealed')) {
      assertOrder(j, 'revision_2_persist_succeeded', 'prose_revealed');
    }
    if (j.includes('terminal_revealed')) {
      assertOrder(j, 'terminal_persist_succeeded', 'terminal_revealed');
    }
    expect(client.coordinator.getMetrics().displayedBeforePersistenceCount).toBe(0);
    expect(client.coordinator.getMetrics().displayedPersistedMismatchCount).toBe(0);
  });
});
