import {
  selectPlanToPersist,
  selectTerminalPlanForDisplay,
  buildTargetPlanMutationSave,
  runOrderedCrossPlanPersistence,
  shouldSaveConversationForTurn,
} from '../persistCanonicalPlan';
import { classifyTrailieTurnOutcome, TRAILIE_TURN_OUTCOME } from '../trailieTurnOutcome';

describe('selectPlanToPersist', () => {
  test('persists the server canonical plan verbatim when present', () => {
    const canonicalPlan = {
      type: 'itinerary',
      responseId: 'resp-A',
      responseVersion: 2,
      contentHash: 'chash',
      itineraryHash: 'ihash',
      days: [{ id: 'day-1' }],
    };
    const result = selectPlanToPersist({
      data: { canonicalPlan, itineraryData: { days: [{ id: 'day-1' }] }, content: 'prose' },
      currentPlan: null,
    });
    // Byte-for-byte the server envelope — the browser must NOT rebuild it.
    expect(result).toBe(canonicalPlan);
  });

  test('persists travelEdges/activityGroups/minutes verbatim for map restoration', () => {
    const canonicalPlan = {
      days: [{
        id: 'zion-day-1',
        activityGroups: [],
        travelEdges: [{
          sourceStopId: 'canyon-overlook',
          targetStopId: 'parus-trail',
          relationship: 'transfer',
          modeIntent: 'drive',
        }],
        stops: [{
          id: 'parus-trail',
          drivingTimeFromPreviousMin: null,
        }],
      }],
    };
    const result = selectPlanToPersist({
      data: { canonicalPlan, itineraryData: { days: [] } },
      currentPlan: null,
    });
    expect(result).toBe(canonicalPlan);
    expect(result.days[0].travelEdges[0].modeIntent).toBe('drive');
  });

  test('never rebuilds a plan from streamed content/itineraryData', () => {
    const result = selectPlanToPersist({
      data: { canonicalPlan: null, itineraryData: { days: [{ id: 'day-1' }] }, content: 'prose' },
      currentPlan: { responseVersion: 1, days: [] },
    });
    // No canonicalPlan → keep the existing plan; do not fabricate a new one.
    expect(result).toEqual({ responseVersion: 1, days: [] });
    expect(result.content).toBeUndefined();
  });

  test('keeps the current plan when the response carries no plan at all', () => {
    const currentPlan = { responseVersion: 3, days: [{ id: 'x' }] };
    const result = selectPlanToPersist({
      data: { canonicalPlan: null, itineraryData: null, content: 'just chat' },
      currentPlan,
    });
    expect(result).toBe(currentPlan);
  });

  test('returns null when there is neither a canonical plan nor a current plan', () => {
    expect(
      selectPlanToPersist({ data: { canonicalPlan: null }, currentPlan: null })
    ).toBeNull();
  });

  // WP-TU Phase 4 Task 10D — a real assertion (not an assumption) that a
  // successful cross-plan (historical) mutation leaves this function's
  // output — and therefore `setCurrentPlan`/`autoSaveConversation`'s
  // `planForSave` argument in TripPlannerChat.jsx — byte-identical to what
  // it would be with no `targetPlanMutation` at all.
  test('a present targetPlanMutation does not change the outcome — the active plan is still just currentPlan', () => {
    const currentPlan = { responseVersion: 5, days: [{ id: 'badl-day-1' }] };
    const result = selectPlanToPersist({
      data: {
        canonicalPlan: null,
        content: 'Kept the walking light on your Redwood trip.',
        targetPlanMutation: {
          tripId: 'trip-redw-1',
          canonicalPlan: { responseVersion: 8, days: [{ id: 'redw-day-2' }] },
        },
      },
      currentPlan,
    });
    expect(result).toBe(currentPlan);
  });
});

describe('selectTerminalPlanForDisplay', () => {
  test('prefers data.canonicalPlan when present — unaffected by targetPlanMutation', () => {
    const canonicalPlan = { days: [{ id: 'active-day' }] };
    const result = selectTerminalPlanForDisplay({
      data: {
        canonicalPlan,
        targetPlanMutation: { tripId: 'trip-redw-1', canonicalPlan: { days: [{ id: 'redw-day' }] } },
      },
    });
    expect(result).toBe(canonicalPlan);
  });

  test('falls back to targetPlanMutation.canonicalPlan only when nothing else is available', () => {
    const targetPlan = { days: [{ id: 'redw-day-2' }] };
    const result = selectTerminalPlanForDisplay({
      data: {
        canonicalPlan: null,
        itineraryData: null,
        itinerary: null,
        targetPlanMutation: { tripId: 'trip-redw-1', canonicalPlan: targetPlan },
      },
    });
    expect(result).toBe(targetPlan);
  });

  test('returns null when nothing at all is available', () => {
    expect(selectTerminalPlanForDisplay({ data: {} })).toBeNull();
  });
});

describe('buildTargetPlanMutationSave', () => {
  const buildPayload = (args) => ({ conversation: undefined, summary: undefined, provider: 'auto', ...args });
  const sourceProvenance = { sourceTripId: 'trip-badl-1', sourceResponseId: 'turn-resp-1' };

  test('builds {tripId, payload} with the target plan, sourceTripId/sourceResponseId, and NO conversation/summary keys', () => {
    const stampedPlan = { responseId: 'turn-resp-1', responseVersion: 8, days: [{ id: 'redw-day-2' }] };
    const result = buildTargetPlanMutationSave(
      { tripId: 'trip-redw-1', canonicalPlan: stampedPlan },
      buildPayload,
      sourceProvenance
    );
    expect(result.tripId).toBe('trip-redw-1');
    expect(result.payload.plan).toBe(stampedPlan);
    // Task 10E — the provenance CLAIM travels with the write; the server
    // verifies it against its own stored data.
    expect(result.payload.sourceTripId).toBe('trip-badl-1');
    expect(result.payload.sourceResponseId).toBe('turn-resp-1');
    // Conversation/summary are explicitly never requested from buildPayload.
    expect(Object.prototype.hasOwnProperty.call(result.payload, 'conversation')).toBe(true);
    expect(result.payload.conversation).toBeUndefined();
  });

  test('never asks buildPayload for a conversation or summary value', () => {
    const buildPayloadSpy = (args) => {
      expect(args).toEqual({ plan: expect.any(Object) });
      expect(Object.keys(args)).toEqual(['plan']);
      return { plan: args.plan };
    };
    const result = buildTargetPlanMutationSave(
      { tripId: 'trip-redw-1', canonicalPlan: { days: [] } },
      buildPayloadSpy,
      sourceProvenance
    );
    expect(result).not.toBeNull();
  });

  test('returns null when tripId is missing', () => {
    expect(buildTargetPlanMutationSave({ canonicalPlan: { days: [] } }, buildPayload, sourceProvenance)).toBeNull();
  });

  test('returns null when canonicalPlan is missing', () => {
    expect(buildTargetPlanMutationSave({ tripId: 'trip-redw-1' }, buildPayload, sourceProvenance)).toBeNull();
  });

  test('returns null when targetPlanMutation itself is null/undefined', () => {
    expect(buildTargetPlanMutationSave(null, buildPayload, sourceProvenance)).toBeNull();
    expect(buildTargetPlanMutationSave(undefined, buildPayload, sourceProvenance)).toBeNull();
  });

  // WP-TU Phase 4 Task 10E — the ordering/provenance contract's frontend
  // half: a write with no source provenance at all must not be sent —
  // it can only ever be rejected server-side, and shaping it would suggest
  // the client thinks an unprovenanced write is meaningful.
  test('returns null when sourceProvenance is missing entirely', () => {
    expect(buildTargetPlanMutationSave({ tripId: 'trip-redw-1', canonicalPlan: { days: [] } }, buildPayload, null)).toBeNull();
    expect(buildTargetPlanMutationSave({ tripId: 'trip-redw-1', canonicalPlan: { days: [] } }, buildPayload, undefined)).toBeNull();
  });

  test('returns null when sourceProvenance is missing sourceResponseId', () => {
    expect(buildTargetPlanMutationSave(
      { tripId: 'trip-redw-1', canonicalPlan: { days: [] } },
      buildPayload,
      { sourceTripId: 'trip-badl-1' }
    )).toBeNull();
  });

  test('returns null when sourceProvenance is missing sourceTripId', () => {
    expect(buildTargetPlanMutationSave(
      { tripId: 'trip-redw-1', canonicalPlan: { days: [] } },
      buildPayload,
      { sourceResponseId: 'turn-resp-1' }
    )).toBeNull();
  });
});

// WP-TU Phase 4 Task 10E — the ORDERING enforcement, pinned directly (test
// #11 of the required list): an explicit call-order assertion, not a
// happy-path integration test that merely happens to pass.
describe('runOrderedCrossPlanPersistence — ordering enforcement', () => {
  test('the target-plan save is invoked only AFTER the active-trip save resolves, and only on genuine success', async () => {
    const callOrder = [];
    const autoSaveConversation = vi.fn(async () => {
      callOrder.push('active-save-start');
      await Promise.resolve(); // force a real microtask hop, not a same-tick resolve
      callOrder.push('active-save-resolved');
      return true;
    });
    const persistTargetPlanMutation = vi.fn(async () => {
      callOrder.push('target-save-invoked');
    });

    await runOrderedCrossPlanPersistence({
      data: { targetPlanMutation: { tripId: 'trip-redw-1', canonicalPlan: { days: [] } }, responseId: 'turn-resp-1' },
      hasUserMessagesToSave: true,
      autoSaveConversation,
      persistTargetPlanMutation,
      currentTripId: 'trip-badl-1',
    });

    expect(callOrder).toEqual(['active-save-start', 'active-save-resolved', 'target-save-invoked']);
    expect(autoSaveConversation).toHaveBeenCalledTimes(1);
    expect(persistTargetPlanMutation).toHaveBeenCalledTimes(1);
    expect(persistTargetPlanMutation).toHaveBeenCalledWith(
      { tripId: 'trip-redw-1', canonicalPlan: { days: [] } },
      { sourceTripId: 'trip-badl-1', sourceResponseId: 'turn-resp-1' }
    );
  });

  test('the target-plan save is NEVER invoked when the active-trip save fails', async () => {
    const autoSaveConversation = vi.fn(async () => false); // rejected/failed save
    const persistTargetPlanMutation = vi.fn(async () => {});

    const succeeded = await runOrderedCrossPlanPersistence({
      data: { targetPlanMutation: { tripId: 'trip-redw-1', canonicalPlan: { days: [] } }, responseId: 'turn-resp-1' },
      hasUserMessagesToSave: true,
      autoSaveConversation,
      persistTargetPlanMutation,
      currentTripId: 'trip-badl-1',
    });

    expect(succeeded).toBe(false);
    expect(persistTargetPlanMutation).not.toHaveBeenCalled();
  });

  test('the target-plan save is never invoked when there is no targetPlanMutation, even on active-trip success', async () => {
    const autoSaveConversation = vi.fn(async () => true);
    const persistTargetPlanMutation = vi.fn(async () => {});

    await runOrderedCrossPlanPersistence({
      data: { targetPlanMutation: null, responseId: 'turn-resp-1' },
      hasUserMessagesToSave: true,
      autoSaveConversation,
      persistTargetPlanMutation,
      currentTripId: 'trip-badl-1',
    });

    expect(persistTargetPlanMutation).not.toHaveBeenCalled();
  });

  test('the active-trip save is skipped (never called) when there are no user messages to save, and the target save then never fires', async () => {
    const autoSaveConversation = vi.fn(async () => true);
    const persistTargetPlanMutation = vi.fn(async () => {});

    const succeeded = await runOrderedCrossPlanPersistence({
      data: { targetPlanMutation: { tripId: 'trip-redw-1', canonicalPlan: { days: [] } }, responseId: 'turn-resp-1' },
      hasUserMessagesToSave: false,
      autoSaveConversation,
      persistTargetPlanMutation,
      currentTripId: 'trip-badl-1',
    });

    expect(autoSaveConversation).not.toHaveBeenCalled();
    expect(persistTargetPlanMutation).not.toHaveBeenCalled();
    expect(succeeded).toBe(false);
  });
});

// Phase 6C.1 — the smallest persistence seam: a server-resolved
// RETRYABLE_FAILURE exchange must never reach `autoSaveConversation`
// (transient, not durable), for both guest AND authenticated travelers.
// Deliberately NOT a blanket `status !== 'complete'` rule — every semantic
// fail-closed / action-required / genuinely-unknown outcome must still save
// exactly as before.
describe('shouldSaveConversationForTurn — Phase 6C.1', () => {
  test('withholds a genuine (server-resolved) generation failure', () => {
    expect(
      shouldSaveConversationForTurn({
        outcomeClass: TRAILIE_TURN_OUTCOME.RETRYABLE_FAILURE,
        hasUserMessages: true,
      })
    ).toBe(false);
  });

  test('saves an ordinary successful turn', () => {
    expect(
      shouldSaveConversationForTurn({
        outcomeClass: TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME,
        hasUserMessages: true,
      })
    ).toBe(true);
  });

  test('saves action_required turns (e.g. guest quota exhaustion) unchanged', () => {
    expect(
      shouldSaveConversationForTurn({
        outcomeClass: TRAILIE_TURN_OUTCOME.ACTION_REQUIRED,
        hasUserMessages: true,
      })
    ).toBe(true);
  });

  test('NOT a blanket status!==complete rule: a semantic fail-closed historical not_found/ambiguous refusal still saves', () => {
    // plan_target_unresolved resolves to CONVERSATION_OUTCOME per
    // classifyTrailieTurnOutcome — this is the exact real-world case the
    // coordinator named explicitly as must-not-regress.
    const outcomeClass = classifyTrailieTurnOutcome({
      trailieV2: { status: 'plan_target_unresolved', terminalReason: 'not_found' },
    });
    expect(outcomeClass).toBe(TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME);
    expect(shouldSaveConversationForTurn({ outcomeClass, hasUserMessages: true })).toBe(true);
  });

  test('still respects "no user messages to save" regardless of outcome class', () => {
    expect(
      shouldSaveConversationForTurn({
        outcomeClass: TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME,
        hasUserMessages: false,
      })
    ).toBe(false);
  });

  test('an unrecognized/future status conservatively still saves (classifyTrailieTurnOutcome falls back to conversation_outcome, never retryable_failure)', () => {
    const outcomeClass = classifyTrailieTurnOutcome({ trailieV2: { status: 'some_future_status' } });
    expect(outcomeClass).toBe(TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME);
    expect(shouldSaveConversationForTurn({ outcomeClass, hasUserMessages: true })).toBe(true);
  });
});

// Phase 6C.1 — the coordinator's required "pin before exposing authenticated
// Retry" proof, expressed with the REAL production functions
// (classifyTrailieTurnOutcome → shouldSaveConversationForTurn →
// runOrderedCrossPlanPersistence), only the two side-effecting writes
// (autoSaveConversation / persistTargetPlanMutation) faked — exactly the
// established pattern for this file. Since `autoSaveConversation` is the
// ONLY code path that ever advances the canonical plan's responseVersion or
// appends to durable `TripPlan.conversation` (see its own doc in
// TripPlannerChat.jsx), proving it is never invoked IS the proof that the
// canonical plan stays byte-identical, its responseVersion is unadvanced,
// and the transient failed exchange is never appended to durable history.
describe('Phase 6C.1 — forced active-plan failure proof (server-resolved retryable_failure)', () => {
  test('a forced trailieV2.status:"failed" turn never calls autoSaveConversation or persistTargetPlanMutation, even carrying a plan mutation and a targetPlanMutation', async () => {
    const forcedFailureData = {
      trailieV2: { status: 'failed', terminalReason: 'generation_error' },
      responseId: 'turn-resp-forced-fail',
      // Even if a malformed/partial response somehow carried these, the
      // active-trip save must still never fire for a genuine failure.
      canonicalPlan: { responseVersion: 9, days: [{ id: 'day-1' }] },
      targetPlanMutation: { tripId: 'trip-redw-1', canonicalPlan: { responseVersion: 3, days: [] } },
    };
    const outcomeClass = classifyTrailieTurnOutcome(forcedFailureData);
    expect(outcomeClass).toBe(TRAILIE_TURN_OUTCOME.RETRYABLE_FAILURE);

    const hasUserMessagesToSave = shouldSaveConversationForTurn({
      outcomeClass,
      hasUserMessages: true, // a real user message + the failure bubble both exist
    });
    expect(hasUserMessagesToSave).toBe(false);

    const autoSaveConversation = vi.fn(async () => true);
    const persistTargetPlanMutation = vi.fn(async () => {});

    const succeeded = await runOrderedCrossPlanPersistence({
      data: forcedFailureData,
      hasUserMessagesToSave,
      autoSaveConversation,
      persistTargetPlanMutation,
      currentTripId: 'trip-badl-1',
    });

    // The canonical plan/version/durable conversation history are only ever
    // touched inside autoSaveConversation — it was never called, so all
    // three are provably untouched by this turn.
    expect(autoSaveConversation).not.toHaveBeenCalled();
    expect(persistTargetPlanMutation).not.toHaveBeenCalled();
    expect(succeeded).toBe(false);
  });

  test('contrast: the immediately following successful retry attempt persists exactly once and advances the plan mutation exactly once', async () => {
    const successData = {
      trailieV2: { status: 'complete' },
      responseId: 'turn-resp-retry-success',
      canonicalPlan: { responseVersion: 10, days: [{ id: 'day-1' }] },
      targetPlanMutation: { tripId: 'trip-redw-1', canonicalPlan: { responseVersion: 4, days: [] } },
    };
    const outcomeClass = classifyTrailieTurnOutcome(successData);
    expect(outcomeClass).toBe(TRAILIE_TURN_OUTCOME.CONVERSATION_OUTCOME);

    const hasUserMessagesToSave = shouldSaveConversationForTurn({ outcomeClass, hasUserMessages: true });
    expect(hasUserMessagesToSave).toBe(true);

    const autoSaveConversation = vi.fn(async () => true);
    const persistTargetPlanMutation = vi.fn(async () => {});

    const succeeded = await runOrderedCrossPlanPersistence({
      data: successData,
      hasUserMessagesToSave,
      autoSaveConversation,
      persistTargetPlanMutation,
      currentTripId: 'trip-badl-1',
    });

    expect(succeeded).toBe(true);
    expect(autoSaveConversation).toHaveBeenCalledTimes(1);
    expect(persistTargetPlanMutation).toHaveBeenCalledTimes(1);
  });
});
