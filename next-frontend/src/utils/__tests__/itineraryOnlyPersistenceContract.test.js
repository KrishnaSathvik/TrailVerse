import { describe, it, expect, vi } from 'vitest';
import { createEarlyRevisionCoordinator } from '../earlyRevisionCoordinator';
import { resolveItineraryOnlyTerminalPersistence } from '../itineraryOnlyTerminalPersistence';
import { PENDING_PROSE_LABEL, INCOMPLETE_PROSE_LABEL } from '../earlyRevisionLifecycle';

const RID = 'resp-contract';
const ITIN_HASH = 'itin-contract';
const DAYS = [{ day: 1, title: 'D1', stops: [{ name: 'Atlatl Rock' }] }];

const started = { type: 'response_started', responseId: RID };
const rev1 = () => ({
  type: 'itinerary_ready',
  response: {
    responseId: RID,
    responseVersion: 1,
    responseRevision: 1,
    lifecycleStatus: 'itinerary_ready',
    content: '',
    contentHash: 'hash-empty',
    itineraryHash: ITIN_HASH,
  },
  canonicalPlan: {
    responseId: RID,
    responseVersion: 1,
    responseRevision: 1,
    contentHash: 'hash-empty',
    itineraryHash: ITIN_HASH,
    days: DAYS,
  },
});

function harness(overrides = {}) {
  const labels = [];
  const persistRevision1 = vi.fn(async () => ({ ok: true, tripId: 'trip-1' }));
  const persistRevision2 = vi.fn(async () => ({ ok: true }));
  const persistTerminal = vi.fn(async (effect) => {
    const settled = resolveItineraryOnlyTerminalPersistence({
      reason: effect.reason,
      tripId: 'trip-1',
    });
    if (!settled.shouldWrite) return settled.result;
    return { ok: true, tripId: 'trip-1' };
  });
  const coordinator = createEarlyRevisionCoordinator({
    persistRevision1,
    persistRevision2,
    persistTerminal,
    view: {
      setTripId: () => {},
      revealItinerary: () => {},
      revealProse: () => {},
      revealTerminal: () => {},
      setPendingLabel: ({ label }) => labels.push(label),
      onComplete: () => {},
      onContractError: () => {},
    },
    ...overrides,
  });
  return { coordinator, persistRevision1, persistRevision2, persistTerminal, labels };
}

describe('ITINERARY_ONLY persistence contract (Fix Pass #3B)', () => {
  it('CASE A: itinerary_ready then display-only finalize → no conflicting PUT, pending cleared', async () => {
    const { coordinator, persistRevision1, persistTerminal, labels } = harness();
    coordinator.handleEvent(started);
    coordinator.handleEvent(rev1());
    await coordinator.drain();
    expect(persistRevision1).toHaveBeenCalledTimes(1);
    expect(labels).toContain(PENDING_PROSE_LABEL);

    coordinator.handleEvent({
      type: 'done',
      responseId: RID,
      responseVersion: 1,
      content: 'Display-only content_delta text',
      // no contentHash — Probe A shape
      itineraryHash: ITIN_HASH,
      canonicalPlan: { days: DAYS },
    });
    await coordinator.drain();

    expect(persistTerminal).toHaveBeenCalledTimes(1);
    expect(persistTerminal.mock.calls[0][0].reason).toBe('itinerary_only_complete');
    await expect(persistTerminal.mock.results[0].value).resolves.toMatchObject({
      ok: true,
      outcome: 'IDEMPOTENT',
    });
    expect(labels[labels.length - 1]).toBe(null);
  });

  it('CASE C: duplicate response_finalized is idempotent (one terminal persist attempt)', async () => {
    const { coordinator, persistTerminal, labels } = harness();
    coordinator.handleEvent(started);
    coordinator.handleEvent(rev1());
    await coordinator.drain();

    const done = {
      type: 'done',
      responseId: RID,
      responseVersion: 1,
      content: 'same display',
      itineraryHash: ITIN_HASH,
      canonicalPlan: { days: DAYS },
    };
    coordinator.handleEvent(done);
    await coordinator.drain();
    coordinator.handleEvent(done);
    await coordinator.drain();

    expect(persistTerminal).toHaveBeenCalledTimes(1);
    expect(labels.filter((l) => l === null).length).toBeGreaterThanOrEqual(1);
  });

  it('CASE D: display content differing from card text never forces revision 2 persist', async () => {
    const { coordinator, persistRevision2, persistTerminal } = harness();
    coordinator.handleEvent(started);
    coordinator.handleEvent(rev1());
    await coordinator.drain();
    coordinator.handleEvent({
      type: 'done',
      responseId: RID,
      responseVersion: 1,
      content: 'Totally different display prose from the card',
      itineraryHash: ITIN_HASH,
      canonicalPlan: { days: DAYS, parkName: 'Valley of Fire' },
    });
    await coordinator.drain();

    expect(persistRevision2).not.toHaveBeenCalled();
    expect(persistTerminal.mock.calls[0][0].reason).toBe('itinerary_only_complete');
  });

  it('CASE F: itinerary_ready and done share responseId; version stays 1', async () => {
    const { coordinator, persistRevision1, persistTerminal } = harness();
    coordinator.handleEvent(started);
    coordinator.handleEvent(rev1());
    await coordinator.drain();
    coordinator.handleEvent({
      type: 'done',
      responseId: RID,
      responseVersion: 1,
      content: 'notes',
      itineraryHash: ITIN_HASH,
    });
    await coordinator.drain();

    expect(persistRevision1.mock.calls[0][0].responseId).toBe(RID);
    expect(persistTerminal.mock.calls[0][0].done.responseId).toBe(RID);
    expect(persistTerminal.mock.calls[0][0].done.responseVersion).toBe(1);
  });

  it('does not treat stream abort incomplete label as itinerary-only success', async () => {
    const { coordinator, labels } = harness();
    coordinator.handleEvent(started);
    coordinator.handleEvent(rev1());
    await coordinator.drain();
    coordinator.handleEvent({ type: 'stream_aborted' });
    expect(labels).toContain(INCOMPLETE_PROSE_LABEL);
  });
});
