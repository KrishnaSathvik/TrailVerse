import { describe, it, expect, vi } from 'vitest';
import {
  EFFECT,
  initialLifecycleState,
  reduceLifecycle,
  decideLegacyChunk,
  decideLegacyStreamEnd,
} from '@/utils/earlyRevisionLifecycle';
import { createEarlyRevisionCoordinator } from '@/utils/earlyRevisionCoordinator';

const RID = 'resp-boundary';
const ITIN_HASH = 'itin-hash';
const DAYS = [{ day: 1, title: 'Arrive', stops: [] }];

const started = { type: 'response_started', responseId: RID, requiresStructuredItinerary: null };

const rev1 = (over = {}) => ({
  type: 'itinerary_ready',
  response: {
    responseId: RID,
    responseVersion: 1,
    responseRevision: 1,
    previousRevision: null,
    lifecycleStatus: 'itinerary_ready',
    content: '',
    contentHash: 'empty',
    itineraryData: { days: DAYS },
    itineraryHash: ITIN_HASH,
    ...(over.response || {}),
  },
  canonicalPlan: {
    responseId: RID,
    responseVersion: 1,
    responseRevision: 1,
    itineraryHash: ITIN_HASH,
    days: DAYS,
    ...(over.canonicalPlan || {}),
  },
});

const rev2 = () => ({
  type: 'prose_ready',
  expectedPreviousRevision: 1,
  response: {
    responseId: RID,
    responseVersion: 1,
    responseRevision: 2,
    previousRevision: 1,
    lifecycleStatus: 'prose_ready',
    content: 'Final notes.',
    contentHash: 'prose',
    itineraryData: { days: DAYS },
    itineraryHash: ITIN_HASH,
  },
  canonicalPlan: {
    responseId: RID,
    responseVersion: 1,
    responseRevision: 2,
    itineraryHash: ITIN_HASH,
    days: DAYS,
  },
});

const doneEvent = (over = {}) => ({
  type: 'done',
  responseId: RID,
  responseVersion: 1,
  content: 'Final notes.',
  contentHash: 'prose',
  itineraryHash: ITIN_HASH,
  canonicalPlan: rev2().canonicalPlan,
  ...over,
});

function drive(events, state = initialLifecycleState()) {
  const effects = [];
  let s = state;
  for (const ev of events) {
    const out = reduceLifecycle(s, ev);
    s = out.state;
    effects.push(...out.effects);
  }
  return { state: s, effects };
}

const typesOf = (e) => e.map((x) => x.type);
const countOf = (e, t) => e.filter((x) => x.type === t).length;
const writesIn = (e) =>
  e.filter((x) =>
    [EFFECT.PERSIST_REVISION_1, EFFECT.PERSIST_REVISION_2, EFFECT.PERSIST_TERMINAL, EFFECT.LEGACY_TERMINAL].includes(
      x.type
    )
  ).length;

// ── §1 activation boundary ───────────────────────────────────────────────────

describe('activation boundary: observation is not activation', () => {
  it('response_started records identity without activating early-revision mode', () => {
    const { state } = drive([started]);

    expect(state.responseStartedSeen).toBe(true);
    expect(state.earlyRevisionActive).toBe(false);
    expect(state.earlyRevisionFaulted).toBe(false);
  });

  it('response_started alone does NOT suppress legacy chunks', () => {
    const { state } = drive([started]);
    const chunk = decideLegacyChunk(state, {});

    expect(chunk.render).toBe(true);
    expect(chunk.state.metrics.suppressedLegacyChunkCount).toBe(0);
    expect(chunk.state.metrics.legacyChunksRenderedWithoutItineraryReady).toBe(1);
  });

  it('response_started alone does NOT suppress stream_end', () => {
    const { state } = drive([started]);
    expect(decideLegacyStreamEnd(state).finalize).toBe(true);
  });

  it('response_started alone does NOT redirect terminal persistence', () => {
    const { effects } = drive([started, doneEvent()]);
    expect(typesOf(effects)).toEqual([EFFECT.LEGACY_TERMINAL]);
  });

  it('response_started alone creates no assistant shell and no card', () => {
    const { effects, state } = drive([started]);
    expect(effects).toEqual([]);
    expect(state.itineraryVisible).toBe(false);
    expect(state.revision1).toBe(null);
  });

  it('a VALID itinerary_ready activates suppression immediately, before its save finishes', () => {
    const { state } = drive([started, rev1()]);

    expect(state.earlyRevisionActive).toBe(true);
    expect(state.status).toBe('saving_revision_1'); // still saving
    expect(decideLegacyChunk(state, {}).render).toBe(false);
    expect(decideLegacyStreamEnd(state).finalize).toBe(false);
  });
});

// ── §2 structured failure / prose-only ───────────────────────────────────────

describe('structured failure preserves legacy behavior', () => {
  it('renders every chunk and performs exactly one terminal write', () => {
    let { state, effects } = drive([started]);

    for (let i = 0; i < 3; i += 1) {
      const out = decideLegacyChunk(state, {});
      expect(out.render).toBe(true);
      state = out.state;
    }
    expect(decideLegacyStreamEnd(state).finalize).toBe(true);

    const terminal = drive([doneEvent()], state);
    effects = [...effects, ...terminal.effects];

    expect(writesIn(effects)).toBe(1);
    expect(typesOf(effects)).toEqual([EFFECT.LEGACY_TERMINAL]);
    expect(state.metrics.legacyChunksRenderedWithoutItineraryReady).toBe(3);
    expect(state.metrics.suppressedLegacyChunkCount).toBe(0);
  });

  it('never classifies the turn as early-revision merely because response_started arrived', () => {
    const { state } = drive([started, doneEvent()]);
    expect(state.earlyRevisionActive).toBe(false);
    expect(state.earlyRevisionFaulted).toBe(false);
  });
});

// ── §3 flag off / legacy ─────────────────────────────────────────────────────

describe('flag-off and legacy streams', () => {
  it('renders chunks and performs one terminal write with no typed events at all', () => {
    let state = initialLifecycleState();
    const out = decideLegacyChunk(state, {});
    state = out.state;

    expect(out.render).toBe(true);
    expect(decideLegacyStreamEnd(state).finalize).toBe(true);

    const { effects } = drive([doneEvent()], state);
    expect(typesOf(effects)).toEqual([EFFECT.LEGACY_TERMINAL]);
    expect(writesIn(effects)).toBe(1);
  });
});

// ── §4 early itinerary path ──────────────────────────────────────────────────

describe('early itinerary path suppresses legacy prose', () => {
  it('suppresses every chunk after itinerary_ready and counts them', () => {
    let { state } = drive([started, rev1()]);

    for (let i = 0; i < 4; i += 1) {
      const out = decideLegacyChunk(state, {});
      expect(out.render).toBe(false);
      state = out.state;
    }
    const se = decideLegacyStreamEnd(state);
    state = se.state;

    expect(se.finalize).toBe(false);
    expect(state.metrics.suppressedLegacyChunkCount).toBe(4);
    expect(state.metrics.suppressedLegacyStreamEndCount).toBe(1);
    expect(state.metrics.legacyChunksRenderedWithoutItineraryReady).toBe(0);
  });

  it('revision 2 is the first prose-bearing revision displayed, and only after it persists', () => {
    let { state } = drive([started, rev1()]);
    state = decideLegacyChunk(state, {}).state;
    state = decideLegacyStreamEnd(state).state;

    const beforeSave = drive([{ type: 'revision_1_result', ok: true, tripId: 't1' }], state);
    expect(typesOf(beforeSave.effects)).not.toContain(EFFECT.REVEAL_PROSE);

    const withProse = drive([rev2()], beforeSave.state);
    expect(typesOf(withProse.effects)).not.toContain(EFFECT.REVEAL_PROSE);

    const saved = drive([{ type: 'revision_2_result', ok: true }], withProse.state);
    expect(typesOf(saved.effects)).toContain(EFFECT.REVEAL_PROSE);
    expect(saved.effects.find((e) => e.type === EFFECT.REVEAL_PROSE).content).toBe('Final notes.');
  });

  it('matching done after early success performs no third write', () => {
    const { effects } = drive([
      started,
      rev1(),
      { type: 'revision_1_result', ok: true, tripId: 't1' },
      rev2(),
      { type: 'revision_2_result', ok: true },
      doneEvent(),
    ]);

    expect(writesIn(effects)).toBe(2);
    expect(countOf(effects, EFFECT.COMPLETE)).toBe(1);
  });
});

// ── §5 slow revision-1 persistence, real production order ────────────────────

describe('production event order with a slow revision-1 save', () => {
  it('suppresses all chunks, buffers, then writes exactly twice in revision order', () => {
    let { state } = drive([started, rev1()]);

    state = decideLegacyChunk(state, {}).state;
    state = decideLegacyChunk(state, {}).state;
    state = decideLegacyStreamEnd(state).state;

    const buffered = drive([rev2(), doneEvent()], state);
    expect(writesIn(buffered.effects)).toBe(0);
    expect(buffered.state.status).toBe('revision_2_buffered');

    const settled = drive([{ type: 'revision_1_result', ok: true, tripId: 't1' }], buffered.state);
    expect(typesOf(settled.effects)).toContain(EFFECT.REVEAL_ITINERARY);
    expect(countOf(settled.effects, EFFECT.PERSIST_REVISION_2)).toBe(1);

    const done = drive([{ type: 'revision_2_result', ok: true }], settled.state);
    expect(typesOf(done.effects)).toContain(EFFECT.REVEAL_PROSE);
    expect(writesIn(done.effects)).toBe(0);

    const all = [...buffered.effects, ...settled.effects, ...done.effects];
    expect(writesIn(all) + 1).toBe(2); // rev 1 counted at itinerary_ready, rev 2 here
    expect(done.state.metrics.suppressedLegacyChunkCount).toBe(2);
  });

  it('shows no temporary prose bubble at any point', () => {
    let { state, effects } = drive([started, rev1()]);
    state = decideLegacyChunk(state, {}).state;
    state = decideLegacyStreamEnd(state).state;

    const rest = drive(
      [rev2(), doneEvent(), { type: 'revision_1_result', ok: true, tripId: 't1' }],
      state
    );
    effects = [...effects, ...rest.effects];

    expect(typesOf(effects)).not.toContain(EFFECT.REVEAL_PROSE);
  });
});

// ── §6 revision-1 failure must not re-enable chunks ──────────────────────────

describe('revision-1 persistence failure', () => {
  it('keeps chunks suppressed after the save fails', () => {
    const failed = drive([
      started,
      rev1(),
      { type: 'revision_1_result', ok: false, outcome: 'CONFLICT' },
    ]);

    expect(failed.state.earlyRevisionActive).toBe(true);
    expect(decideLegacyChunk(failed.state, {}).render).toBe(false);
    expect(decideLegacyStreamEnd(failed.state).finalize).toBe(false);
  });

  it('never shows the card, discards revision 2, and persists done exactly once', () => {
    const { state, effects } = drive([
      started,
      rev1(),
      { type: 'revision_1_result', ok: false },
      rev2(),
      doneEvent(),
    ]);

    expect(state.itineraryVisible).toBe(false);
    expect(countOf(effects, EFFECT.PERSIST_REVISION_2)).toBe(0);
    expect(countOf(effects, EFFECT.PERSIST_TERMINAL)).toBe(1);
    expect(typesOf(effects)).not.toContain(EFFECT.LEGACY_TERMINAL);
  });

  it('reveals full terminal content only after that save succeeds', () => {
    const before = drive([
      started,
      rev1(),
      { type: 'revision_1_result', ok: false },
      doneEvent(),
    ]);
    expect(typesOf(before.effects)).not.toContain(EFFECT.REVEAL_TERMINAL);

    const after = drive([{ type: 'terminal_result', ok: true, tripId: 't1' }], before.state);
    expect(typesOf(after.effects)).toContain(EFFECT.REVEAL_TERMINAL);
    expect(after.state.metrics.duplicateAssistantMessageCount).toBe(0);
    expect(after.state.metrics.duplicatePlanCount).toBe(0);
  });
});

// ── §7 invalid early event fails closed ──────────────────────────────────────

describe('invalid itinerary_ready fails closed', () => {
  const invalid = () => rev1({ response: { content: 'not empty' } });

  it('marks the transaction faulted without activating normal early mode', () => {
    const { state } = drive([started, invalid()]);

    expect(state.earlyRevisionFaulted).toBe(true);
    expect(state.earlyRevisionActive).toBe(false);
    expect(state.metrics.invalidEarlyEventCount).toBe(1);
  });

  it('records a bounded contract-error code and persists nothing', () => {
    const { effects } = drive([started, invalid()]);

    expect(typesOf(effects)).toEqual([EFFECT.CONTRACT_ERROR]);
    expect(effects[0].code).toBe('revision_1_content_not_empty');
    expect(writesIn(effects)).toBe(0);
  });

  it('suppresses subsequent chunks rather than falling back to legacy display', () => {
    const { state } = drive([started, invalid()]);

    expect(decideLegacyChunk(state, {}).render).toBe(false);
    expect(decideLegacyStreamEnd(state).finalize).toBe(false);
  });

  it('reveals no card and waits for done', () => {
    const { state, effects } = drive([started, invalid(), rev2()]);
    expect(state.itineraryVisible).toBe(false);
    expect(countOf(effects, EFFECT.PERSIST_REVISION_2)).toBe(0);
  });

  it('allows exactly one safe direct-terminal persistence attempt', () => {
    const { state, effects } = drive([started, invalid(), doneEvent(), doneEvent()]);

    expect(countOf(effects, EFFECT.PERSIST_TERMINAL)).toBe(1);
    expect(typesOf(effects)).not.toContain(EFFECT.LEGACY_TERMINAL);
    expect(effects.find((e) => e.type === EFFECT.PERSIST_TERMINAL).expectedPreviousRevision).toBeUndefined();
    expect(state.terminalAttempted).toBe(true);
  });

  it('shows nothing before that terminal persistence succeeds', () => {
    const before = drive([started, invalid(), doneEvent()]);
    expect(typesOf(before.effects)).not.toContain(EFFECT.REVEAL_TERMINAL);
    expect(typesOf(before.effects)).not.toContain(EFFECT.REVEAL_ITINERARY);

    const after = drive([{ type: 'terminal_result', ok: true, tripId: 't1' }], before.state);
    expect(typesOf(after.effects)).toContain(EFFECT.REVEAL_TERMINAL);
  });

  it('is distinct from structured failure, which keeps legacy display', () => {
    const faulted = drive([started, invalid()]).state;
    const structuredFailure = drive([started]).state;

    expect(decideLegacyChunk(faulted, {}).render).toBe(false);
    expect(decideLegacyChunk(structuredFailure, {}).render).toBe(true);
  });
});

// ── §9 chunk identity ────────────────────────────────────────────────────────

describe('chunk identity validation', () => {
  it('suppresses a chunk belonging to the active early response', () => {
    const { state } = drive([started, rev1()]);
    const out = decideLegacyChunk(state, { responseId: RID });

    expect(out.render).toBe(false);
    expect(out.code).toBeUndefined();
    expect(out.state.metrics.crossTurnChunkLeakCount).toBe(0);
  });

  it('refuses a chunk carrying a mismatched response identity', () => {
    const { state } = drive([started, rev1()]);
    const out = decideLegacyChunk(state, { responseId: 'a-different-response' });

    expect(out.render).toBe(false);
    expect(out.code).toBe('legacy_chunk_response_mismatch');
    expect(out.state.metrics.crossTurnChunkLeakCount).toBe(1);
  });

  it('does not attribute an unkeyed chunk to a foreign transaction', () => {
    // The wire protocol carries no responseId on `chunk`. An unkeyed chunk is
    // attributed to THIS transaction only, never reassigned.
    const { state } = drive([started, rev1()]);
    const out = decideLegacyChunk(state, {});
    expect(out.state.metrics.crossTurnChunkLeakCount).toBe(0);
  });

  it('never lets suppressed chunk text enter persisted revision content', () => {
    let { state } = drive([started, rev1()]);
    state = decideLegacyChunk(state, { text: 'leaked prose draft' }).state;

    const { effects } = drive(
      [
        { type: 'revision_1_result', ok: true, tripId: 't1' },
        rev2(),
        { type: 'revision_2_result', ok: true },
      ],
      state
    );

    const serialized = JSON.stringify(effects);
    expect(serialized).not.toContain('leaked prose draft');
    const persisted = effects.filter((e) =>
      [EFFECT.PERSIST_REVISION_1, EFFECT.PERSIST_REVISION_2].includes(e.type)
    );
    for (const write of persisted) {
      expect(JSON.stringify(write)).not.toContain('leaked prose draft');
    }
  });

  it('duplicate chunks create no assistant messages at all in early mode', () => {
    let { state } = drive([started, rev1()]);
    for (let i = 0; i < 5; i += 1) state = decideLegacyChunk(state, {}).state;

    expect(state.metrics.duplicateAssistantMessageCount).toBe(0);
    expect(state.metrics.suppressedLegacyChunkCount).toBe(5);
  });
});

// ── §8 cross-turn isolation, at the coordinator level ────────────────────────

describe('cross-turn isolation', () => {
  const makeCoordinator = (overrides = {}) =>
    createEarlyRevisionCoordinator({
      persistRevision1: vi.fn(async () => ({ ok: true, tripId: 't1' })),
      persistRevision2: vi.fn(async () => ({ ok: true })),
      persistTerminal: vi.fn(async () => ({ ok: true, tripId: 't1' })),
      legacyTerminal: vi.fn(),
      view: {},
      ...overrides,
    });

  it("turn A's activation cannot suppress turn B's chunks", async () => {
    const turnA = makeCoordinator();
    turnA.handleEvent(started);
    turnA.handleEvent(rev1());
    await turnA.drain();
    expect(turnA.shouldRenderLegacyChunk()).toBe(false);

    // A new turn gets a fresh coordinator, exactly as handleSendMessage does.
    turnA.dispose();
    const turnB = makeCoordinator();
    turnB.handleEvent({ type: 'response_started', responseId: 'resp-turn-b' });

    expect(turnB.shouldRenderLegacyChunk()).toBe(true);
    expect(turnB.getMetrics().suppressedLegacyChunkCount).toBe(0);
    expect(turnB.getMetrics().crossTurnChunkLeakCount).toBe(0);
  });

  it('a disposed coordinator refuses to render and records the leak', () => {
    const turnA = makeCoordinator();
    turnA.handleEvent(started);
    turnA.dispose();

    expect(turnA.shouldRenderLegacyChunk()).toBe(false);
    expect(turnA.getMetrics().crossTurnChunkLeakCount).toBe(1);
  });

  it('keeps no module-level state: two live coordinators are independent', () => {
    const a = makeCoordinator();
    const b = makeCoordinator();
    a.handleEvent(started);
    a.handleEvent(rev1());

    expect(a.shouldRenderLegacyChunk()).toBe(false);
    expect(b.shouldRenderLegacyChunk()).toBe(true);
    expect(a.getMetrics().crossTurnChunkLeakCount).toBe(0);
    expect(b.getMetrics().crossTurnChunkLeakCount).toBe(0);
  });

  it('exposes the ownership predicates separately from observation', async () => {
    const c = makeCoordinator();
    c.handleEvent(started);
    expect(c.ownsTerminalPersistence()).toBe(false);

    c.handleEvent(rev1());
    await c.drain();
    expect(c.ownsTerminalPersistence()).toBe(true);
  });

  it('a faulted transaction also owns terminal persistence', () => {
    const c = makeCoordinator();
    c.handleEvent(started);
    c.handleEvent(rev1({ response: { content: 'bad' } }));

    expect(c.getState().earlyRevisionFaulted).toBe(true);
    expect(c.ownsTerminalPersistence()).toBe(true);
    expect(c.shouldRenderLegacyChunk()).toBe(false);
  });
});

// ── §10 metrics ──────────────────────────────────────────────────────────────

describe('boundary metrics', () => {
  it('early path may report positive suppression and zero legacy renders', () => {
    let { state } = drive([started, rev1()]);
    state = decideLegacyChunk(state, {}).state;
    state = decideLegacyStreamEnd(state).state;

    expect(state.metrics.suppressedLegacyChunkCount).toBeGreaterThan(0);
    expect(state.metrics.suppressedLegacyStreamEndCount).toBe(1);
    expect(state.metrics.legacyChunksRenderedWithoutItineraryReady).toBe(0);
    expect(state.metrics.invalidEarlyEventCount).toBe(0);
  });

  it('structured-failure path reports positive legacy renders and zero suppression', () => {
    let { state } = drive([started]);
    state = decideLegacyChunk(state, {}).state;

    expect(state.metrics.legacyChunksRenderedWithoutItineraryReady).toBeGreaterThan(0);
    expect(state.metrics.suppressedLegacyChunkCount).toBe(0);
  });

  it('crossTurnChunkLeakCount stays zero on every well-formed path', () => {
    const paths = [
      [started, rev1(), { type: 'revision_1_result', ok: true, tripId: 't' }, rev2(), { type: 'revision_2_result', ok: true }, doneEvent()],
      [started, doneEvent()],
      [started, rev1({ response: { content: 'bad' } }), doneEvent()],
      [started, rev1(), { type: 'revision_1_result', ok: false }, doneEvent()],
    ];

    for (const path of paths) {
      let { state } = drive(path);
      state = decideLegacyChunk(state, {}).state;
      state = decideLegacyChunk(state, { responseId: RID }).state;
      expect(state.metrics.crossTurnChunkLeakCount).toBe(0);
    }
  });
});
