import { describe, it, expect, vi } from 'vitest';
import {
  RECOVERY_UI_STATE,
  RECOVERY_MESSAGE,
  seedCoordinatorForRecovery,
  resolveRecoveryAvailability,
  resolveRecoveryFailure,
} from '@/utils/proseRecoveryClient';
import { createEarlyRevisionCoordinator } from '@/utils/earlyRevisionCoordinator';
import { LIFECYCLE_STATE } from '@/utils/earlyRevisionLifecycle';

const RID = 'resp-1';
const ITIN_HASH = 'itin-hash';
const DAYS = [{ id: 'd1', day: 1, title: 'Arrive', stops: [] }];

const storedPlan = {
  responseId: RID,
  responseVersion: 4,
  responseRevision: 1,
  lifecycleStatus: 'itinerary_ready',
  itineraryHash: ITIN_HASH,
  days: DAYS,
};

const storedTurn = {
  role: 'assistant',
  content: '',
  responseId: RID,
  responseVersion: 4,
  responseRevision: 1,
  lifecycleStatus: 'itinerary_ready',
  itineraryHash: ITIN_HASH,
  itineraryPlan: storedPlan,
};

const proseReady = () => ({
  type: 'prose_ready',
  expectedPreviousRevision: 1,
  response: {
    responseId: RID,
    responseVersion: 4,
    responseRevision: 2,
    previousRevision: 1,
    lifecycleStatus: 'prose_ready',
    content: 'Recovered trip notes.',
    contentHash: 'prose-hash',
    itineraryHash: ITIN_HASH,
  },
  canonicalPlan: { ...storedPlan, responseRevision: 2, lifecycleStatus: 'prose_ready' },
});

const doneEvent = () => ({
  type: 'done',
  responseId: RID,
  responseVersion: 4,
  content: 'Recovered trip notes.',
  contentHash: 'prose-hash',
  itineraryHash: ITIN_HASH,
  canonicalPlan: proseReady().canonicalPlan,
});

function makeCoordinator(overrides = {}) {
  return createEarlyRevisionCoordinator({
    persistRevision1: vi.fn(async () => ({ ok: true, tripId: 'trip-1' })),
    persistRevision2: vi.fn(async () => ({ ok: true })),
    persistTerminal: vi.fn(async () => ({ ok: true, tripId: 'trip-1' })),
    legacyTerminal: vi.fn(),
    view: {},
    initialTripId: 'trip-1',
    ...overrides,
  });
}

describe('seeding the coordinator for recovery', () => {
  it('starts at itinerary_visible with the persisted revision-1 identity', () => {
    const c = makeCoordinator();
    seedCoordinatorForRecovery(c, { message: storedTurn, plan: storedPlan, tripId: 'trip-1' });

    const s = c.getState();
    expect(s.status).toBe(LIFECYCLE_STATE.ITINERARY_VISIBLE);
    expect(s.responseId).toBe(RID);
    expect(s.responseVersion).toBe(4);
    expect(s.itineraryHash).toBe(ITIN_HASH);
    expect(s.itineraryVisible).toBe(true);
    expect(s.tripId).toBe('trip-1');
  });

  it('marks revision 1 as already persisted so nothing is re-written', async () => {
    const persistRevision1 = vi.fn();
    const c = makeCoordinator({ persistRevision1 });
    seedCoordinatorForRecovery(c, { message: storedTurn, plan: storedPlan, tripId: 'trip-1' });

    c.handleEvent(proseReady());
    await c.drain();

    expect(persistRevision1).not.toHaveBeenCalled();
    expect(c.getState().persistedItineraryHash).toBe(ITIN_HASH);
  });

  it('activates chunk suppression immediately', () => {
    const c = makeCoordinator();
    seedCoordinatorForRecovery(c, { message: storedTurn, plan: storedPlan, tripId: 'trip-1' });

    expect(c.shouldRenderLegacyChunk()).toBe(false);
    expect(c.shouldFinalizeLegacyStream()).toBe(false);
    expect(c.ownsTerminalPersistence()).toBe(true);
  });

  it('persists revision 2 before revealing prose, exactly once', async () => {
    const revealProse = vi.fn();
    const persistRevision2 = vi.fn(async () => ({ ok: true }));
    const c = makeCoordinator({ persistRevision2, view: { revealProse } });
    seedCoordinatorForRecovery(c, { message: storedTurn, plan: storedPlan, tripId: 'trip-1' });

    c.handleEvent(proseReady());
    expect(revealProse).not.toHaveBeenCalled();
    await c.drain();

    expect(persistRevision2).toHaveBeenCalledTimes(1);
    expect(persistRevision2.mock.calls[0][0].expectedPreviousRevision).toBe(1);
    expect(persistRevision2.mock.calls[0][0].tripId).toBe('trip-1');
    expect(persistRevision2.mock.calls[0][0].createIfMissing).toBe(false);
    expect(revealProse).toHaveBeenCalledTimes(1);
  });

  it('reconciles a matching done with no third write', async () => {
    const persistTerminal = vi.fn(async () => ({ ok: true }));
    const c = makeCoordinator({ persistTerminal });
    seedCoordinatorForRecovery(c, { message: storedTurn, plan: storedPlan, tripId: 'trip-1' });

    c.handleEvent(proseReady());
    await c.drain();
    c.handleEvent(doneEvent());
    await c.drain();

    expect(persistTerminal).not.toHaveBeenCalled();
    expect(c.getState().status).toBe(LIFECYCLE_STATE.TERMINAL_VISIBLE);
  });

  it('never creates another trip or plan', async () => {
    const persistRevision1 = vi.fn();
    const c = makeCoordinator({ persistRevision1 });
    seedCoordinatorForRecovery(c, { message: storedTurn, plan: storedPlan, tripId: 'trip-1' });

    c.handleEvent(proseReady());
    await c.drain();
    c.handleEvent(doneEvent());
    await c.drain();

    expect(persistRevision1).not.toHaveBeenCalled();
    expect(c.getMetrics().duplicatePlanCount).toBe(0);
    expect(c.getMetrics().duplicateAssistantMessageCount).toBe(0);
  });

  it('rejects a successor whose itinerary hash moved', async () => {
    const persistRevision2 = vi.fn();
    const onContractError = vi.fn();
    const c = makeCoordinator({ persistRevision2, view: { onContractError } });
    seedCoordinatorForRecovery(c, { message: storedTurn, plan: storedPlan, tripId: 'trip-1' });

    const bad = proseReady();
    bad.response = { ...bad.response, itineraryHash: 'moved' };
    c.handleEvent(bad);
    await c.drain();

    expect(persistRevision2).not.toHaveBeenCalled();
    expect(onContractError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'itinerary_hash_changed' })
    );
  });

  it('rejects a successor for a different response', async () => {
    const persistRevision2 = vi.fn();
    const c = makeCoordinator({ persistRevision2 });
    seedCoordinatorForRecovery(c, { message: storedTurn, plan: storedPlan, tripId: 'trip-1' });

    const bad = proseReady();
    bad.response = { ...bad.response, responseId: 'someone-else' };
    c.handleEvent(bad);
    await c.drain();

    expect(persistRevision2).not.toHaveBeenCalled();
  });
});

describe('resolveRecoveryAvailability', () => {
  it('offers recovery for a stored revision 1 when the capability is enabled', () => {
    expect(resolveRecoveryAvailability({ message: storedTurn, tripId: 'trip-1', capabilityEnabled: true }))
      .toEqual({ available: true, responseId: RID });
  });

  it('hides the action when the server capability is not exposed', () => {
    expect(resolveRecoveryAvailability({ message: storedTurn, tripId: 'trip-1', capabilityEnabled: false }).available)
      .toBe(false);
  });

  it('never reads a server environment variable to decide', () => {
    // The decision is a pure function of its arguments — there is no env access.
    expect(resolveRecoveryAvailability.length).toBeLessThanOrEqual(1);
    expect(String(resolveRecoveryAvailability)).not.toMatch(/process\.env/);
  });

  it.each([
    ['a completed revision 2', { ...storedTurn, responseRevision: 2, lifecycleStatus: 'prose_ready', content: 'done' }],
    ['a legacy response', { role: 'assistant', content: 'Legacy answer.' }],
    ['a revision 1 that somehow has content', { ...storedTurn, content: 'present' }],
    ['a user message', { role: 'user', content: 'hi' }],
  ])('does not offer recovery for %s', (_label, message) => {
    expect(resolveRecoveryAvailability({ message, tripId: 'trip-1', capabilityEnabled: true }).available)
      .toBe(false);
  });

  it('requires a real saved trip', () => {
    expect(resolveRecoveryAvailability({ message: storedTurn, tripId: 'temp-123', capabilityEnabled: true }).available)
      .toBe(false);
    expect(resolveRecoveryAvailability({ message: storedTurn, tripId: null, capabilityEnabled: true }).available)
      .toBe(false);
  });
});

describe('resolveRecoveryFailure — bounded 409 states', () => {
  it('maps an in-progress conflict to a bounded, non-retrying state', () => {
    const r = resolveRecoveryFailure({ status: 409, error: 'prose_generation_in_progress' });
    expect(r).toEqual({
      state: RECOVERY_UI_STATE.IN_PROGRESS_ELSEWHERE,
      message: RECOVERY_MESSAGE.IN_PROGRESS_ELSEWHERE,
      retryable: false,
    });
  });

  it('maps an awaiting-persistence conflict to its own bounded state', () => {
    const r = resolveRecoveryFailure({ status: 409, error: 'prose_result_awaiting_persistence' });
    expect(r.state).toBe(RECOVERY_UI_STATE.AWAITING_PERSISTENCE);
    expect(r.message).toBe(RECOVERY_MESSAGE.AWAITING_PERSISTENCE);
    expect(r.retryable).toBe(false);
  });

  it('makes a recoverable failure retryable', () => {
    expect(resolveRecoveryFailure({ status: 500 }).retryable).toBe(true);
    expect(resolveRecoveryFailure({ streamError: 'prose_failed' }).retryable).toBe(true);
  });

  it('treats a 404 as not retryable', () => {
    expect(resolveRecoveryFailure({ status: 404 }).retryable).toBe(false);
  });

  it('never surfaces a provider or driver string', () => {
    const r = resolveRecoveryFailure({ status: 500, error: 'anthropic: rate_limit_error on model claude-x' });
    expect(JSON.stringify(r)).not.toMatch(/anthropic|claude-x|rate_limit/);
  });
});
