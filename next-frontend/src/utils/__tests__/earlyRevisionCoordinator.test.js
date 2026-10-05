import { describe, it, expect, vi } from 'vitest';
import { createEarlyRevisionCoordinator } from '@/utils/earlyRevisionCoordinator';
import { LIFECYCLE_STATE, PENDING_PROSE_LABEL, INCOMPLETE_PROSE_LABEL } from '@/utils/earlyRevisionLifecycle';

const RID = 'resp-1';
const ITIN_HASH = 'itin-hash';
const DAYS = [{ day: 1, title: 'Arrive', stops: [] }];

const started = { type: 'response_started', responseId: RID, requiresStructuredItinerary: null };

const rev1 = () => ({
  type: 'itinerary_ready',
  response: {
    responseId: RID,
    responseVersion: 2,
    responseRevision: 1,
    previousRevision: null,
    lifecycleStatus: 'itinerary_ready',
    content: '',
    contentHash: 'empty-hash',
    itineraryData: { days: DAYS },
    itineraryHash: ITIN_HASH,
  },
  canonicalPlan: { responseId: RID, responseVersion: 2, responseRevision: 1, itineraryHash: ITIN_HASH, days: DAYS },
});

const rev2 = () => ({
  type: 'prose_ready',
  expectedPreviousRevision: 1,
  response: {
    responseId: RID,
    responseVersion: 2,
    responseRevision: 2,
    previousRevision: 1,
    lifecycleStatus: 'prose_ready',
    content: 'Your trip notes.',
    contentHash: 'prose-hash',
    itineraryData: { days: DAYS },
    itineraryHash: ITIN_HASH,
  },
  canonicalPlan: { responseId: RID, responseVersion: 2, responseRevision: 2, itineraryHash: ITIN_HASH, days: DAYS },
});

const doneEvent = (over = {}) => ({
  type: 'done',
  responseId: RID,
  responseVersion: 2,
  content: 'Your trip notes.',
  contentHash: 'prose-hash',
  itineraryHash: ITIN_HASH,
  canonicalPlan: { responseId: RID, responseVersion: 2, itineraryHash: ITIN_HASH, days: DAYS },
  ...over,
});

/** Deferred promise so tests can order persistence completion precisely. */
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function makeHarness(overrides = {}) {
  const calls = [];
  const view = {
    revealItinerary: vi.fn(),
    revealProse: vi.fn(),
    revealTerminal: vi.fn(),
    setPendingLabel: vi.fn(),
    setTripId: vi.fn(),
    onContractError: vi.fn(),
    onComplete: vi.fn(),
  };
  let clock = 0;
  const coordinator = createEarlyRevisionCoordinator({
    persistRevision1: overrides.persistRevision1
      || vi.fn(async (p) => {
        calls.push(['rev1', p]);
        return { ok: true, tripId: 'trip-real' };
      }),
    persistRevision2: overrides.persistRevision2
      || vi.fn(async (p) => {
        calls.push(['rev2', p]);
        return { ok: true };
      }),
    persistTerminal: overrides.persistTerminal
      || vi.fn(async (p) => {
        calls.push(['terminal', p]);
        return { ok: true, tripId: 'trip-real' };
      }),
    legacyTerminal: overrides.legacyTerminal || vi.fn((done) => calls.push(['legacy', done])),
    view,
    now: () => (clock += 10),
    initialTripId: overrides.initialTripId ?? null,
  });
  return { coordinator, view, calls, tick: () => (clock += 10) };
}

describe('normal early flow', () => {
  it('persists then reveals, in order, with exactly two writes', async () => {
    const { coordinator, view, calls } = makeHarness();

    coordinator.handleEvent(started);
    expect(view.revealItinerary).not.toHaveBeenCalled();

    coordinator.handleEvent(rev1());
    expect(view.revealItinerary).not.toHaveBeenCalled(); // not until the save lands
    await coordinator.drain();

    expect(view.setTripId).toHaveBeenCalledWith('trip-real');
    expect(view.revealItinerary).toHaveBeenCalledTimes(1);
    expect(view.setPendingLabel).toHaveBeenLastCalledWith(
      expect.objectContaining({ label: PENDING_PROSE_LABEL })
    );

    coordinator.handleEvent({ type: 'prose_generation_started', responseId: RID });
    coordinator.handleEvent(rev2());
    expect(view.revealProse).not.toHaveBeenCalled();
    await coordinator.drain();

    expect(view.revealProse).toHaveBeenCalledTimes(1);
    expect(view.revealProse.mock.calls[0][0].content).toBe('Your trip notes.');

    coordinator.handleEvent(doneEvent());
    await coordinator.drain();

    expect(calls.map((c) => c[0])).toEqual(['rev1', 'rev2']);
    expect(view.onComplete).toHaveBeenCalledTimes(1);
    expect(coordinator.getState().status).toBe(LIFECYCLE_STATE.TERMINAL_VISIBLE);
  });

  it('sends the server objects verbatim to the writer', async () => {
    const { coordinator, calls } = makeHarness();
    const r1 = rev1();
    const r2 = rev2();

    coordinator.handleEvent(started);
    coordinator.handleEvent(r1);
    await coordinator.drain();
    coordinator.handleEvent(r2);
    await coordinator.drain();

    expect(calls[0][1].response).toBe(r1.response);
    expect(calls[0][1].canonicalPlan).toBe(r1.canonicalPlan);
    expect(calls[1][1].response).toBe(r2.response);
    expect(calls[1][1].canonicalPlan).toBe(r2.canonicalPlan);
    expect(calls[1][1].expectedPreviousRevision).toBe(1);
  });
});

describe('fast server / slow persistence', () => {
  it('buffers prose_ready and done, then writes in revision order', async () => {
    const gate = deferred();
    const { coordinator, view, calls } = makeHarness({
      persistRevision1: vi.fn(async (p) => {
        calls.push?.(null);
        await gate.promise;
        return { ok: true, tripId: 'trip-real' };
      }),
    });

    coordinator.handleEvent(started);
    coordinator.handleEvent(rev1());
    coordinator.handleEvent({ type: 'prose_generation_started', responseId: RID });
    coordinator.handleEvent(rev2());
    coordinator.handleEvent(doneEvent());

    expect(view.revealItinerary).not.toHaveBeenCalled();
    expect(view.revealProse).not.toHaveBeenCalled();
    expect(coordinator.getState().status).toBe(LIFECYCLE_STATE.REVISION_2_BUFFERED);

    gate.resolve();
    await coordinator.drain();

    expect(view.revealItinerary).toHaveBeenCalledTimes(1);
    expect(view.revealProse).toHaveBeenCalledTimes(1);
    expect(coordinator.getMetrics().bufferedRevision2Count).toBe(1);
    expect(coordinator.getMetrics().persistenceWrites).toBe(2);
  });

  it('revision 2 targets the real trip id returned by revision 1', async () => {
    const gate = deferred();
    const seen = [];
    const { coordinator } = makeHarness({
      initialTripId: 'temp-123',
      persistRevision1: vi.fn(async () => {
        await gate.promise;
        return { ok: true, tripId: 'trip-real' };
      }),
      persistRevision2: vi.fn(async (p) => {
        seen.push(p.tripId);
        return { ok: true };
      }),
    });

    coordinator.handleEvent(started);
    coordinator.handleEvent(rev1());
    coordinator.handleEvent(rev2());
    gate.resolve();
    await coordinator.drain();

    expect(seen).toEqual(['trip-real']);
  });
});

describe('revision-1 failure', () => {
  it('never reveals the card, discards prose, and persists done exactly once', async () => {
    const { coordinator, view, calls } = makeHarness({
      persistRevision1: vi.fn(async () => ({ ok: false, outcome: 'CONFLICT' })),
    });

    coordinator.handleEvent(started);
    coordinator.handleEvent(rev1());
    coordinator.handleEvent(rev2());
    coordinator.handleEvent(doneEvent());
    await coordinator.drain();

    expect(view.revealItinerary).not.toHaveBeenCalled();
    expect(view.revealProse).not.toHaveBeenCalled();
    expect(calls.filter((c) => c[0] === 'terminal')).toHaveLength(1);
    expect(view.revealTerminal).toHaveBeenCalledTimes(1);
    expect(coordinator.getMetrics().revision1PersistenceFailure).toBe(1);
  });

  it('does not create two trips', async () => {
    const { coordinator, calls } = makeHarness({
      persistRevision1: vi.fn(async () => ({ ok: false })),
    });

    coordinator.handleEvent(started);
    coordinator.handleEvent(rev1());
    coordinator.handleEvent(doneEvent());
    coordinator.handleEvent(doneEvent());
    await coordinator.drain();

    expect(calls.filter((c) => c[0] === 'terminal')).toHaveLength(1);
  });
});

describe('revision-2 uncertainty', () => {
  it('reconciles idempotently with a single terminal attempt', async () => {
    const { coordinator, view, calls } = makeHarness({
      persistRevision2: vi.fn(async () => ({ ok: false, uncertain: true })),
    });

    coordinator.handleEvent(started);
    coordinator.handleEvent(rev1());
    await coordinator.drain();
    coordinator.handleEvent(rev2());
    coordinator.handleEvent(doneEvent());
    await coordinator.drain();

    expect(calls.filter((c) => c[0] === 'terminal')).toHaveLength(1);
    expect(view.revealItinerary).toHaveBeenCalledTimes(1);
    expect(view.revealTerminal).toHaveBeenCalledTimes(1);
    expect(view.revealProse).not.toHaveBeenCalled();
  });
});

describe('structured failure and flag-off', () => {
  it('routes a done with no early events straight to the legacy terminal path', async () => {
    const { coordinator, view, calls } = makeHarness();

    coordinator.handleEvent(started);
    coordinator.handleEvent({ type: 'thinking', stage: 'planning' });
    coordinator.handleEvent(doneEvent());
    await coordinator.drain();

    expect(calls).toEqual([['legacy', expect.objectContaining({ responseId: RID })]]);
    expect(view.revealItinerary).not.toHaveBeenCalled();
    expect(view.revealProse).not.toHaveBeenCalled();
  });

  it('routes a done with no events at all to the legacy terminal path', async () => {
    const { coordinator, calls } = makeHarness();
    coordinator.handleEvent(doneEvent());
    await coordinator.drain();
    expect(calls.map((c) => c[0])).toEqual(['legacy']);
  });
});

describe('disconnect and component lifecycle', () => {
  it('performs no persistence when the stream aborts before revision 1', async () => {
    const { coordinator, view, calls } = makeHarness();
    coordinator.handleEvent(started);
    coordinator.handleEvent({ type: 'stream_aborted' });
    await coordinator.drain();

    expect(calls).toEqual([]);
    expect(view.revealItinerary).not.toHaveBeenCalled();
  });

  it('lets an in-flight revision-1 save settle and reveals when still mounted', async () => {
    const gate = deferred();
    const { coordinator, view } = makeHarness({
      persistRevision1: vi.fn(async () => {
        await gate.promise;
        return { ok: true, tripId: 'trip-real' };
      }),
    });

    coordinator.handleEvent(started);
    coordinator.handleEvent(rev1());
    coordinator.handleEvent({ type: 'stream_aborted' });
    gate.resolve();
    await coordinator.drain();

    expect(view.revealItinerary).toHaveBeenCalledTimes(1);
  });

  it('performs no view updates after dispose, but still settles the save', async () => {
    const gate = deferred();
    const persistRevision1 = vi.fn(async () => {
      await gate.promise;
      return { ok: true, tripId: 'trip-real' };
    });
    const { coordinator, view } = makeHarness({ persistRevision1 });

    coordinator.handleEvent(started);
    coordinator.handleEvent(rev1());
    coordinator.dispose();
    gate.resolve();
    await coordinator.drain();

    expect(persistRevision1).toHaveBeenCalledTimes(1);
    expect(view.revealItinerary).not.toHaveBeenCalled();
    expect(view.setTripId).not.toHaveBeenCalled();
    expect(coordinator.getState().status).toBe(LIFECYCLE_STATE.ITINERARY_VISIBLE);
  });

  it('shows a bounded incomplete label when the stream dies after a visible card', async () => {
    const { coordinator, view } = makeHarness();
    coordinator.handleEvent(started);
    coordinator.handleEvent(rev1());
    await coordinator.drain();
    coordinator.handleEvent({ type: 'stream_aborted' });
    await coordinator.drain();

    expect(view.setPendingLabel).toHaveBeenLastCalledWith(
      expect.objectContaining({ label: INCOMPLETE_PROSE_LABEL })
    );
    expect(view.revealProse).not.toHaveBeenCalled();
  });

  it('leaves a terminal response untouched when the stream closes', async () => {
    const { coordinator, view } = makeHarness();
    coordinator.handleEvent(started);
    coordinator.handleEvent(rev1());
    await coordinator.drain();
    coordinator.handleEvent(rev2());
    await coordinator.drain();
    const proseCalls = view.revealProse.mock.calls.length;

    coordinator.handleEvent({ type: 'stream_aborted' });
    await coordinator.drain();

    expect(view.revealProse.mock.calls.length).toBe(proseCalls);
    expect(coordinator.getState().status).toBe(LIFECYCLE_STATE.TERMINAL_VISIBLE);
  });
});

describe('duplicate and conflicting events', () => {
  it('suppresses duplicates of every typed event without extra writes', async () => {
    const { coordinator, calls, view } = makeHarness();

    coordinator.handleEvent(started);
    coordinator.handleEvent(started);
    coordinator.handleEvent(rev1());
    coordinator.handleEvent(rev1());
    await coordinator.drain();
    coordinator.handleEvent({ type: 'prose_generation_started', responseId: RID });
    coordinator.handleEvent({ type: 'prose_generation_started', responseId: RID });
    coordinator.handleEvent(rev2());
    coordinator.handleEvent(rev2());
    await coordinator.drain();
    coordinator.handleEvent(doneEvent());
    coordinator.handleEvent(doneEvent());
    await coordinator.drain();

    expect(calls.map((c) => c[0])).toEqual(['rev1', 'rev2']);
    expect(view.revealItinerary).toHaveBeenCalledTimes(1);
    expect(view.revealProse).toHaveBeenCalledTimes(1);
    expect(coordinator.getMetrics().duplicateEventCount).toBe(4);
  });

  it.each([
    ['responseId', { responseId: 'other' }],
    ['responseVersion', { responseVersion: 9 }],
    ['responseRevision', { responseRevision: 3 }],
    ['itineraryHash', { itineraryHash: 'changed' }],
    ['contentHash', { contentHash: 'changed' }],
    ['lifecycleStatus', { lifecycleStatus: 'prose_failed' }],
  ])('reports a contract error for a conflicting %s on prose_ready', async (_field, over) => {
    const { coordinator, view, calls } = makeHarness();
    coordinator.handleEvent(started);
    coordinator.handleEvent(rev1());
    await coordinator.drain();
    coordinator.handleEvent(rev2());
    const conflicting = rev2();
    conflicting.response = { ...conflicting.response, ...over };
    coordinator.handleEvent(conflicting);
    await coordinator.drain();

    expect(view.onContractError).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c[0] === 'rev2')).toHaveLength(1);
  });

  it('rejects a conflicting done after revision 2 without another write', async () => {
    const { coordinator, view, calls } = makeHarness();
    coordinator.handleEvent(started);
    coordinator.handleEvent(rev1());
    await coordinator.drain();
    coordinator.handleEvent(rev2());
    await coordinator.drain();
    coordinator.handleEvent(doneEvent({ contentHash: 'different' }));
    await coordinator.drain();

    expect(calls.map((c) => c[0])).toEqual(['rev1', 'rev2']);
    expect(view.onContractError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'done_conflicts_with_persisted_revision_2' })
    );
    expect(view.revealProse).toHaveBeenCalledTimes(1);
  });
});

describe('metrics', () => {
  it('records one turn origin and every lifecycle timing', async () => {
    const { coordinator } = makeHarness();
    coordinator.handleEvent(started);
    coordinator.handleEvent(rev1());
    await coordinator.drain();
    coordinator.handleEvent(rev2());
    await coordinator.drain();

    const m = coordinator.getMetrics();
    expect(m.timeToItineraryReadyEventMs).toBeGreaterThan(0);
    expect(m.revision1PersistenceDurationMs).toBeGreaterThanOrEqual(0);
    expect(m.timeToItineraryVisibleMs).toBeGreaterThanOrEqual(m.timeToItineraryReadyEventMs);
    expect(m.timeToProseReadyEventMs).toBeGreaterThanOrEqual(m.timeToItineraryVisibleMs);
    expect(m.revision2PersistenceDurationMs).toBeGreaterThanOrEqual(0);
    expect(m.timeToProseVisibleMs).toBeGreaterThanOrEqual(m.timeToProseReadyEventMs);
  });

  it('leaves prose timings null when prose never arrives', async () => {
    const { coordinator } = makeHarness();
    coordinator.handleEvent(started);
    coordinator.handleEvent(rev1());
    await coordinator.drain();
    coordinator.handleEvent({ type: 'stream_aborted' });

    const m = coordinator.getMetrics();
    expect(m.timeToProseReadyEventMs).toBe(null);
    expect(m.timeToProseVisibleMs).toBe(null);
  });

  it('keeps the four safety counters at zero on every path', async () => {
    const scenarios = [
      async (c) => {
        c.handleEvent(started); c.handleEvent(rev1()); await c.drain();
        c.handleEvent(rev2()); await c.drain(); c.handleEvent(doneEvent()); await c.drain();
      },
      async (c) => {
        c.handleEvent(started); c.handleEvent(rev1()); c.handleEvent(rev2());
        c.handleEvent(doneEvent()); await c.drain();
      },
      async (c) => { c.handleEvent(started); c.handleEvent(doneEvent()); await c.drain(); },
    ];
    for (const run of scenarios) {
      const { coordinator } = makeHarness();
      await run(coordinator);
      const m = coordinator.getMetrics();
      expect(m.displayedBeforePersistenceCount).toBe(0);
      expect(m.displayedPersistedMismatchCount).toBe(0);
      expect(m.duplicateAssistantMessageCount).toBe(0);
      expect(m.duplicatePlanCount).toBe(0);
    }
  });
});

describe('persistence failure isolation', () => {
  it('treats a thrown persistence error as an uncertain failure, not a crash', async () => {
    const { coordinator, view } = makeHarness({
      persistRevision1: vi.fn(async () => {
        throw new Error('network down');
      }),
    });

    coordinator.handleEvent(started);
    coordinator.handleEvent(rev1());
    await coordinator.drain();

    expect(view.revealItinerary).not.toHaveBeenCalled();
    expect(coordinator.getState().status).toBe(LIFECYCLE_STATE.SAVE_FAILED);
    expect(coordinator.getMetrics().revision1PersistenceFailure).toBe(1);
  });
});
