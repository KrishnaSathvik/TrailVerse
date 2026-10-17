import { describe, it, expect } from 'vitest';
import {
  LIFECYCLE_STATE,
  EFFECT,
  PENDING_PROSE_LABEL,
  INCOMPLETE_PROSE_LABEL,
  initialLifecycleState,
  reduceLifecycle,
  validateItineraryReadyEvent,
  validateProseReadyEvent,
} from '@/utils/earlyRevisionLifecycle';

const RID = 'resp-aaaa-bbbb';
const ITIN_HASH = 'itinerary-hash-1';
const PROSE_HASH = 'content-hash-prose';
const EMPTY_HASH = 'content-hash-empty';

const DAYS = [
  { day: 1, title: 'Arrive', stops: [{ name: 'Visitor Center' }] },
  { day: 2, title: 'Hike', stops: [{ name: 'Angels Landing' }] },
];

function rev1Payload(over = {}) {
  return {
    type: 'itinerary_ready',
    response: {
      responseId: RID,
      responseVersion: 3,
      responseRevision: 1,
      previousRevision: null,
      lifecycleStatus: 'itinerary_ready',
      itineraryReadyAt: '2026-01-01T00:00:00.000Z',
      content: '',
      contentHash: EMPTY_HASH,
      itineraryData: { days: DAYS },
      itineraryHash: ITIN_HASH,
      planScore: null,
      corrections: [],
      feasibilityIssues: [],
      provider: 'claude',
      model: 'claude-model',
      ...(over.response || {}),
    },
    canonicalPlan: {
      responseId: RID,
      responseVersion: 3,
      responseRevision: 1,
      lifecycleStatus: 'itinerary_ready',
      itineraryHash: ITIN_HASH,
      days: DAYS,
      ...(over.canonicalPlan || {}),
    },
  };
}

function rev2Payload(over = {}) {
  return {
    type: 'prose_ready',
    expectedPreviousRevision: over.expectedPreviousRevision ?? 1,
    response: {
      responseId: RID,
      responseVersion: 3,
      responseRevision: 2,
      previousRevision: 1,
      lifecycleStatus: 'prose_ready',
      itineraryReadyAt: '2026-01-01T00:00:00.000Z',
      proseReadyAt: '2026-01-01T00:01:00.000Z',
      content: 'Here is your trip.',
      contentHash: PROSE_HASH,
      itineraryData: { days: DAYS },
      itineraryHash: ITIN_HASH,
      ...(over.response || {}),
    },
    canonicalPlan: {
      responseId: RID,
      responseVersion: 3,
      responseRevision: 2,
      lifecycleStatus: 'prose_ready',
      itineraryHash: ITIN_HASH,
      days: DAYS,
      ...(over.canonicalPlan || {}),
    },
  };
}

function donePayload(over = {}) {
  return {
    type: 'done',
    responseId: RID,
    responseVersion: 3,
    content: 'Here is your trip.',
    contentHash: PROSE_HASH,
    itineraryHash: ITIN_HASH,
    canonicalPlan: {
      responseId: RID,
      responseVersion: 3,
      itineraryHash: ITIN_HASH,
      days: DAYS,
    },
    ...over,
  };
}

const started = { type: 'response_started', responseId: RID, requiresStructuredItinerary: null };

/** Drive a list of events through the reducer, collecting every effect. */
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

const typesOf = (effects) => effects.map((e) => e.type);
const countOf = (effects, type) => effects.filter((e) => e.type === type).length;
const writesIn = (effects) =>
  effects.filter(
    (e) =>
      e.type === EFFECT.PERSIST_REVISION_1 ||
      e.type === EFFECT.PERSIST_REVISION_2 ||
      e.type === EFFECT.PERSIST_TERMINAL ||
      e.type === EFFECT.LEGACY_TERMINAL
  ).length;

describe('response_started', () => {
  it('creates a hidden pending transaction with no message, plan, or persistence', () => {
    const { state, effects } = drive([started]);

    expect(state.status).toBe(LIFECYCLE_STATE.STARTED);
    expect(state.responseId).toBe(RID);
    expect(effects).toEqual([]);
    expect(state.earlyRevisionActive).toBe(false);
  });

  it('treats requiresStructuredItinerary null as unknown and does not branch on it', () => {
    const unknown = drive([{ ...started, requiresStructuredItinerary: null }]).state;
    const asserted = drive([{ ...started, requiresStructuredItinerary: true }]).state;

    expect(unknown.status).toBe(asserted.status);
    expect(unknown.expectsItinerary).toBe(null);
  });

  it('is idempotent for a duplicate identical event', () => {
    const { state, effects } = drive([started, started]);

    expect(effects).toEqual([]);
    expect(state.metrics.duplicateEventCount).toBe(1);
    expect(state.status).toBe(LIFECYCLE_STATE.STARTED);
  });

  it('reports a client contract error when identity changes mid-transaction', () => {
    const { effects } = drive([started, { ...started, responseId: 'other-response' }]);

    expect(typesOf(effects)).toContain(EFFECT.CONTRACT_ERROR);
    expect(effects[0].code).toBe('response_identity_changed');
  });
});

describe('itinerary_ready — persist before reveal', () => {
  it('persists revision 1 and reveals nothing yet', () => {
    const { state, effects } = drive([started, rev1Payload()]);

    expect(typesOf(effects)).toEqual([EFFECT.PERSIST_REVISION_1]);
    expect(effects[0].response).toBe(state.revision1.response);
    expect(state.status).toBe(LIFECYCLE_STATE.SAVING_REVISION_1);
    expect(state.earlyRevisionActive).toBe(true);
    expect(state.itineraryVisible).toBe(false);
  });

  it('passes the server-built objects through verbatim', () => {
    const payload = rev1Payload();
    const { effects } = drive([started, payload]);

    expect(effects[0].response).toBe(payload.response);
    expect(effects[0].canonicalPlan).toBe(payload.canonicalPlan);
    expect(effects[0].expectedPreviousRevision).toBeUndefined();
  });

  it('reveals the card only after revision-1 persistence succeeds', () => {
    const { state, effects } = drive([
      started,
      rev1Payload(),
      { type: 'revision_1_result', ok: true, tripId: 'trip-1' },
    ]);

    expect(typesOf(effects)).toEqual([
      EFFECT.PERSIST_REVISION_1,
      EFFECT.SET_TRIP_ID,
      EFFECT.REVEAL_ITINERARY,
      EFFECT.SET_PENDING_LABEL,
    ]);
    expect(effects[1].tripId).toBe('trip-1');
    expect(effects[2].itineraryHash).toBe(ITIN_HASH);
    expect(effects[2].content).toBe('');
    expect(effects[3].label).toBe(PENDING_PROSE_LABEL);
    expect(state.status).toBe(LIFECYCLE_STATE.ITINERARY_VISIBLE);
    expect(state.metrics.displayedBeforePersistenceCount).toBe(0);
  });

  it('treats an idempotent-existing persistence outcome as success', () => {
    const { state, effects } = drive([
      started,
      rev1Payload(),
      { type: 'revision_1_result', ok: true, tripId: 'trip-1', outcome: 'IDEMPOTENT' },
    ]);

    expect(typesOf(effects)).toContain(EFFECT.REVEAL_ITINERARY);
    expect(state.status).toBe(LIFECYCLE_STATE.ITINERARY_VISIBLE);
  });

  it('does not reveal, and waits for done, when revision-1 persistence fails', () => {
    const { state, effects } = drive([
      started,
      rev1Payload(),
      { type: 'revision_1_result', ok: false, outcome: 'CONFLICT' },
    ]);

    expect(typesOf(effects)).toEqual([EFFECT.PERSIST_REVISION_1]);
    expect(state.status).toBe(LIFECYCLE_STATE.SAVE_FAILED);
    expect(state.itineraryVisible).toBe(false);
    expect(state.metrics.revision1PersistenceFailure).toBe(1);
  });

  it('is idempotent for a duplicate identical itinerary_ready', () => {
    const { state, effects } = drive([started, rev1Payload(), rev1Payload()]);

    expect(writesIn(effects)).toBe(1);
    expect(state.metrics.duplicateEventCount).toBe(1);
  });

  it('reports a contract error for a conflicting duplicate itinerary_ready', () => {
    const conflicting = rev1Payload({ response: { itineraryHash: 'different-hash' } });
    conflicting.canonicalPlan.itineraryHash = 'different-hash';
    const { effects } = drive([started, rev1Payload(), conflicting]);

    expect(countOf(effects, EFFECT.CONTRACT_ERROR)).toBe(1);
    expect(writesIn(effects)).toBe(1);
  });

  // Stage 14.3A §7 — an itinerary_ready that fails validation FAILS CLOSED. It
  // does not fall back to legacy rendering, because the server believes it sent
  // an early itinerary and the chunks that follow are unpersisted prose.
  it('fails closed when itinerary_ready arrives with no active turn', () => {
    const { state, effects } = drive([rev1Payload()]);

    expect(typesOf(effects)).toEqual([EFFECT.CONTRACT_ERROR]);
    expect(state.earlyRevisionActive).toBe(false);
    expect(state.earlyRevisionFaulted).toBe(true);

    const after = drive([donePayload()], state);
    expect(typesOf(after.effects)).toEqual([EFFECT.PERSIST_TERMINAL]);
    expect(after.effects[0].reason).toBe('invalid_early_event');
  });
});

describe('prose_generation_started', () => {
  it('is presentation-only: no persistence, no message, no card change', () => {
    const { state, effects } = drive([
      started,
      rev1Payload(),
      { type: 'revision_1_result', ok: true, tripId: 'trip-1' },
      { type: 'prose_generation_started', responseId: RID },
    ]);

    expect(writesIn(effects)).toBe(1);
    expect(countOf(effects, EFFECT.REVEAL_ITINERARY)).toBe(1);
    expect(state.status).toBe(LIFECYCLE_STATE.ITINERARY_VISIBLE);
  });

  it('is valid before revision-1 persistence completes and emits nothing', () => {
    const { state, effects } = drive([
      started,
      rev1Payload(),
      { type: 'prose_generation_started', responseId: RID },
    ]);

    expect(typesOf(effects)).toEqual([EFFECT.PERSIST_REVISION_1]);
    expect(state.status).toBe(LIFECYCLE_STATE.SAVING_REVISION_1);
  });
});

describe('prose_ready — ordered successor persistence', () => {
  const upToVisible = [
    started,
    rev1Payload(),
    { type: 'revision_1_result', ok: true, tripId: 'trip-1' },
    { type: 'prose_generation_started', responseId: RID },
  ];

  it('persists revision 2 against the trip revision 1 resolved', () => {
    const payload = rev2Payload();
    const { state, effects } = drive([...upToVisible, payload]);

    const persist = effects.find((e) => e.type === EFFECT.PERSIST_REVISION_2);
    expect(persist.response).toBe(payload.response);
    expect(persist.canonicalPlan).toBe(payload.canonicalPlan);
    expect(persist.expectedPreviousRevision).toBe(1);
    expect(persist.tripId).toBe('trip-1');
    expect(state.status).toBe(LIFECYCLE_STATE.SAVING_REVISION_2);
  });

  it('does not reveal prose until revision-2 persistence succeeds', () => {
    const { effects } = drive([...upToVisible, rev2Payload()]);
    expect(typesOf(effects)).not.toContain(EFFECT.REVEAL_PROSE);
  });

  it('fills content and clears the pending label on revision-2 success', () => {
    const { state, effects } = drive([
      ...upToVisible,
      rev2Payload(),
      { type: 'revision_2_result', ok: true },
    ]);

    const reveal = effects.find((e) => e.type === EFFECT.REVEAL_PROSE);
    expect(reveal.responseId).toBe(RID);
    expect(reveal.content).toBe('Here is your trip.');
    expect(reveal.itineraryHash).toBe(ITIN_HASH);
    expect(reveal.pendingProse).toBe(false);
    expect(reveal.autoScroll).toBe(false);
    expect(state.status).toBe(LIFECYCLE_STATE.TERMINAL_VISIBLE);
    expect(countOf(effects, EFFECT.REVEAL_ITINERARY)).toBe(1);
  });

  it('uses the identical path for deterministic fallback prose', () => {
    const fallback = rev2Payload({ response: { lifecycleStatus: 'fallback_complete' } });
    fallback.canonicalPlan.lifecycleStatus = 'fallback_complete';
    const { effects } = drive([...upToVisible, fallback, { type: 'revision_2_result', ok: true }]);

    const reveal = effects.find((e) => e.type === EFFECT.REVEAL_PROSE);
    expect(reveal.isError).toBeUndefined();
    expect(reveal.content).toBe('Here is your trip.');
    expect(countOf(effects, EFFECT.PERSIST_REVISION_2)).toBe(1);
  });

  it('buffers revision 2 while revision 1 is still saving', () => {
    const { state, effects } = drive([started, rev1Payload(), rev2Payload()]);

    expect(typesOf(effects)).toEqual([EFFECT.PERSIST_REVISION_1]);
    expect(state.status).toBe(LIFECYCLE_STATE.REVISION_2_BUFFERED);
    expect(state.metrics.bufferedRevision2Count).toBe(1);
  });

  it('persists the buffered revision 2 once revision 1 succeeds', () => {
    const { state, effects } = drive([
      started,
      rev1Payload(),
      rev2Payload(),
      { type: 'revision_1_result', ok: true, tripId: 'trip-9' },
    ]);

    expect(typesOf(effects)).toEqual([
      EFFECT.PERSIST_REVISION_1,
      EFFECT.SET_TRIP_ID,
      EFFECT.REVEAL_ITINERARY,
      EFFECT.SET_PENDING_LABEL,
      EFFECT.PERSIST_REVISION_2,
    ]);
    expect(effects[4].tripId).toBe('trip-9');
    expect(state.status).toBe(LIFECYCLE_STATE.SAVING_REVISION_2);
  });

  it('discards the buffered revision 2 when revision 1 fails', () => {
    const { state, effects } = drive([
      started,
      rev1Payload(),
      rev2Payload(),
      { type: 'revision_1_result', ok: false, outcome: 'STALE' },
    ]);

    expect(writesIn(effects)).toBe(1);
    expect(typesOf(effects)).not.toContain(EFFECT.PERSIST_REVISION_2);
    expect(state.revision2).toBe(null);
    expect(state.status).toBe(LIFECYCLE_STATE.SAVE_FAILED);
  });

  it('treats an identical duplicate buffered revision 2 as idempotent', () => {
    const { state } = drive([started, rev1Payload(), rev2Payload(), rev2Payload()]);
    expect(state.metrics.duplicateEventCount).toBe(1);
    expect(state.metrics.bufferedRevision2Count).toBe(1);
  });

  it('reports a contract error for a differing duplicate revision 2', () => {
    const other = rev2Payload({ response: { contentHash: 'other-content-hash' } });
    const { effects } = drive([started, rev1Payload(), rev2Payload(), other]);
    expect(countOf(effects, EFFECT.CONTRACT_ERROR)).toBe(1);
  });

  it('keeps the card and hides unsaved prose when revision-2 persistence fails', () => {
    const { state, effects } = drive([
      ...upToVisible,
      rev2Payload(),
      { type: 'revision_2_result', ok: false, outcome: 'CONFLICT' },
    ]);

    expect(typesOf(effects)).not.toContain(EFFECT.REVEAL_PROSE);
    expect(state.itineraryVisible).toBe(true);
    expect(state.metrics.revision2PersistenceFailure).toBe(1);
  });
});

describe('done reconciliation matrix', () => {
  const upToVisible = [
    started,
    rev1Payload(),
    { type: 'revision_1_result', ok: true, tripId: 'trip-1' },
  ];

  it('uses the legacy terminal flow when no itinerary_ready was received', () => {
    const { effects } = drive([started, donePayload()]);
    expect(typesOf(effects)).toEqual([EFFECT.LEGACY_TERMINAL]);
    expect(effects[0].done.responseId).toBe(RID);
  });

  it('uses the legacy terminal flow when the lifecycle was never started at all', () => {
    const { effects } = drive([donePayload()]);
    expect(typesOf(effects)).toEqual([EFFECT.LEGACY_TERMINAL]);
  });

  it('buffers done while revision 1 is still saving', () => {
    const { state, effects } = drive([started, rev1Payload(), donePayload()]);
    expect(writesIn(effects)).toBe(1);
    expect(state.bufferedDone).not.toBe(null);
  });

  it('persists done once as a direct terminal after revision-1 failure', () => {
    const { state, effects } = drive([
      started,
      rev1Payload(),
      rev2Payload(),
      donePayload(),
      { type: 'revision_1_result', ok: false, outcome: 'CONFLICT' },
    ]);

    expect(writesIn(effects)).toBe(2);
    expect(countOf(effects, EFFECT.PERSIST_TERMINAL)).toBe(1);
    expect(typesOf(effects)).not.toContain(EFFECT.PERSIST_REVISION_2);
    const terminal = effects.find((e) => e.type === EFFECT.PERSIST_TERMINAL);
    expect(terminal.expectedPreviousRevision).toBeUndefined();
    expect(terminal.reason).toBe('revision_1_failed');
    expect(state.status).toBe(LIFECYCLE_STATE.SAVING_TERMINAL);
  });

  it('reveals the terminal response only after its persistence succeeds', () => {
    const events = [
      started,
      rev1Payload(),
      donePayload(),
      { type: 'revision_1_result', ok: false, outcome: 'CONFLICT' },
    ];
    const before = drive(events);
    expect(typesOf(before.effects)).not.toContain(EFFECT.REVEAL_TERMINAL);

    const after = drive([{ type: 'terminal_result', ok: true, tripId: 'trip-t' }], before.state);
    expect(typesOf(after.effects)).toContain(EFFECT.REVEAL_TERMINAL);
    expect(after.state.status).toBe(LIFECYCLE_STATE.TERMINAL_VISIBLE);
  });

  it('persists done as itinerary-only complete when prose_ready never arrived', () => {
    const { effects } = drive([...upToVisible, donePayload()]);

    expect(countOf(effects, EFFECT.PERSIST_TERMINAL)).toBe(1);
    const terminal = effects.find((e) => e.type === EFFECT.PERSIST_TERMINAL);
    expect(terminal.reason).toBe('itinerary_only_complete');
    expect(terminal.tripId).toBe('trip-1');
  });

  it('clears pending notes label after itinerary-only terminal succeeds', () => {
    const mid = drive([...upToVisible, donePayload()]);
    const after = drive([{ type: 'terminal_result', ok: true, tripId: 'trip-1' }], mid.state);
    const clear = after.effects.find((e) => e.type === EFFECT.SET_PENDING_LABEL);
    expect(clear).toEqual(expect.objectContaining({ label: null }));
    expect(clear.responseId).toBeTruthy();
    expect(typesOf(after.effects)).toContain(EFFECT.COMPLETE);
    expect(after.state.status).toBe(LIFECYCLE_STATE.TERMINAL_VISIBLE);
  });

  it('buffers done while revision 2 is saving and reconciles after the result', () => {
    const mid = drive([
      ...upToVisible,
      rev2Payload(),
      donePayload(),
    ]);
    expect(writesIn(mid.effects)).toBe(2);
    expect(mid.state.bufferedDone).not.toBe(null);

    const after = drive([{ type: 'revision_2_result', ok: true }], mid.state);
    expect(writesIn(after.effects)).toBe(0);
    expect(typesOf(after.effects)).toContain(EFFECT.REVEAL_PROSE);
    expect(typesOf(after.effects)).toContain(EFFECT.COMPLETE);
    expect(after.state.metrics.doneReconciliationCount).toBe(1);
  });

  it('makes one idempotent terminal attempt when the revision-2 save result is uncertain', () => {
    const mid = drive([...upToVisible, rev2Payload(), donePayload()]);
    const after = drive([{ type: 'revision_2_result', ok: false, uncertain: true }], mid.state);

    expect(countOf(after.effects, EFFECT.PERSIST_TERMINAL)).toBe(1);
    expect(after.effects.find((e) => e.type === EFFECT.PERSIST_TERMINAL).reason)
      .toBe('revision_2_uncertain');
  });

  it('fails closed and keeps revision 1 when the buffered done hashes differ', () => {
    const mid = drive([...upToVisible, rev2Payload(), donePayload({ itineraryHash: 'changed' })]);
    const after = drive([{ type: 'revision_2_result', ok: true }], mid.state);

    expect(writesIn(after.effects)).toBe(0);
    expect(typesOf(after.effects)).toContain(EFFECT.CONTRACT_ERROR);
    expect(after.state.metrics.displayedPersistedMismatchCount).toBe(0);
  });

  it('treats a matching done after revision 2 as confirmation only', () => {
    const { state, effects } = drive([
      ...upToVisible,
      rev2Payload(),
      { type: 'revision_2_result', ok: true },
      donePayload(),
    ]);

    expect(writesIn(effects)).toBe(2);
    expect(countOf(effects, EFFECT.REVEAL_PROSE)).toBe(1);
    expect(countOf(effects, EFFECT.COMPLETE)).toBe(1);
    expect(state.metrics.duplicateAssistantMessageCount).toBe(0);
    expect(state.metrics.duplicatePlanCount).toBe(0);
  });

  it('rejects a conflicting done after revision 2 without replacing persisted content', () => {
    const { state, effects } = drive([
      ...upToVisible,
      rev2Payload(),
      { type: 'revision_2_result', ok: true },
      donePayload({ contentHash: 'a-different-content-hash' }),
    ]);

    expect(writesIn(effects)).toBe(2);
    expect(typesOf(effects)).toContain(EFFECT.CONTRACT_ERROR);
    expect(state.revealedContent).toBe('Here is your trip.');
  });
});

describe('persistence call counts', () => {
  it('normal early flow performs exactly two writes', () => {
    const { effects } = drive([
      started,
      rev1Payload(),
      { type: 'revision_1_result', ok: true, tripId: 'trip-1' },
      { type: 'prose_generation_started', responseId: RID },
      rev2Payload(),
      { type: 'revision_2_result', ok: true },
      donePayload(),
    ]);

    expect(countOf(effects, EFFECT.PERSIST_REVISION_1)).toBe(1);
    expect(countOf(effects, EFFECT.PERSIST_REVISION_2)).toBe(1);
    expect(countOf(effects, EFFECT.PERSIST_TERMINAL)).toBe(0);
    expect(countOf(effects, EFFECT.LEGACY_TERMINAL)).toBe(0);
    expect(writesIn(effects)).toBe(2);
  });

  it('revision-1 failure performs exactly one terminal write', () => {
    const { effects } = drive([
      started,
      rev1Payload(),
      { type: 'revision_1_result', ok: false },
      rev2Payload(),
      donePayload(),
    ]);

    expect(countOf(effects, EFFECT.PERSIST_REVISION_1)).toBe(1);
    expect(countOf(effects, EFFECT.PERSIST_REVISION_2)).toBe(0);
    expect(countOf(effects, EFFECT.PERSIST_TERMINAL)).toBe(1);
  });

  it('flag-off flow performs exactly one legacy terminal write', () => {
    const { effects } = drive([donePayload()]);
    expect(writesIn(effects)).toBe(1);
    expect(typesOf(effects)).toEqual([EFFECT.LEGACY_TERMINAL]);
  });

  it('duplicate events create no extra writes', () => {
    const { effects } = drive([
      started,
      started,
      rev1Payload(),
      rev1Payload(),
      { type: 'revision_1_result', ok: true, tripId: 'trip-1' },
      rev2Payload(),
      rev2Payload(),
      { type: 'revision_2_result', ok: true },
      donePayload(),
      donePayload(),
    ]);

    expect(writesIn(effects)).toBe(2);
  });
});

describe('assistant message and plan identity', () => {
  it('emits exactly one reveal per surface across the whole turn', () => {
    const { state, effects } = drive([
      started,
      rev1Payload(),
      { type: 'revision_1_result', ok: true, tripId: 'trip-1' },
      rev2Payload(),
      { type: 'revision_2_result', ok: true },
      donePayload(),
    ]);

    expect(countOf(effects, EFFECT.REVEAL_ITINERARY)).toBe(1);
    expect(countOf(effects, EFFECT.REVEAL_PROSE)).toBe(1);
    expect(state.metrics.duplicateAssistantMessageCount).toBe(0);
    expect(state.metrics.duplicatePlanCount).toBe(0);
  });

  it('keys both reveals to the same responseId and itineraryHash', () => {
    const { effects } = drive([
      started,
      rev1Payload(),
      { type: 'revision_1_result', ok: true, tripId: 'trip-1' },
      rev2Payload(),
      { type: 'revision_2_result', ok: true },
    ]);

    const card = effects.find((e) => e.type === EFFECT.REVEAL_ITINERARY);
    const prose = effects.find((e) => e.type === EFFECT.REVEAL_PROSE);
    expect(prose.responseId).toBe(card.responseId);
    expect(prose.itineraryHash).toBe(card.itineraryHash);
  });

  it('marks revision 2 as an update, never an append', () => {
    const { effects } = drive([
      started,
      rev1Payload(),
      { type: 'revision_1_result', ok: true, tripId: 'trip-1' },
      rev2Payload(),
      { type: 'revision_2_result', ok: true },
    ]);

    expect(effects.find((e) => e.type === EFFECT.REVEAL_ITINERARY).mode).toBe('upsert');
    expect(effects.find((e) => e.type === EFFECT.REVEAL_PROSE).mode).toBe('update');
  });
});

describe('new-trip and existing-trip behavior', () => {
  it('revision 2 never carries a temp trip id', () => {
    const { effects } = drive(
      [
        started,
        rev1Payload(),
        rev2Payload(),
        { type: 'revision_1_result', ok: true, tripId: 'trip-real' },
      ],
      { ...initialLifecycleState(), tripId: 'temp-123' }
    );

    const persist = effects.find((e) => e.type === EFFECT.PERSIST_REVISION_2);
    expect(persist.tripId).toBe('trip-real');
    expect(persist.createIfMissing).toBe(false);
  });

  it('revision 1 is allowed to create the trip; revision 2 is not', () => {
    const { effects } = drive([
      started,
      rev1Payload(),
      { type: 'revision_1_result', ok: true, tripId: 'trip-1' },
      rev2Payload(),
    ]);

    expect(effects.find((e) => e.type === EFFECT.PERSIST_REVISION_1).createIfMissing).toBe(true);
    expect(effects.find((e) => e.type === EFFECT.PERSIST_REVISION_2).createIfMissing).toBe(false);
  });

  it('carries the existing trip id into revision 1 for an existing trip', () => {
    const { effects } = drive([started, rev1Payload()], {
      ...initialLifecycleState(),
      tripId: 'trip-existing',
    });

    expect(effects[0].tripId).toBe('trip-existing');
  });
});

describe('stream disconnect', () => {
  it('does nothing when the stream aborts before revision 1', () => {
    const { state, effects } = drive([started, { type: 'stream_aborted' }]);
    expect(effects).toEqual([]);
    expect(state.itineraryVisible).toBe(false);
  });

  it('lets an in-flight revision-1 save settle and reveals on success', () => {
    const mid = drive([started, rev1Payload(), { type: 'stream_aborted' }]);
    expect(typesOf(mid.effects)).toEqual([EFFECT.PERSIST_REVISION_1]);

    const after = drive([{ type: 'revision_1_result', ok: true, tripId: 'trip-1' }], mid.state);
    expect(typesOf(after.effects)).toContain(EFFECT.REVEAL_ITINERARY);
  });

  it('shows a bounded incomplete label after a visible itinerary', () => {
    const { state, effects } = drive([
      started,
      rev1Payload(),
      { type: 'revision_1_result', ok: true, tripId: 'trip-1' },
      { type: 'stream_aborted' },
    ]);

    const label = effects.filter((e) => e.type === EFFECT.SET_PENDING_LABEL).pop();
    expect(label.label).toBe(INCOMPLETE_PROSE_LABEL);
    expect(state.status).toBe(LIFECYCLE_STATE.STREAM_ABORTED);
    expect(state.itineraryVisible).toBe(true);
  });

  it('never displays rejected or partial prose after an abort', () => {
    const { effects } = drive([
      started,
      rev1Payload(),
      { type: 'revision_1_result', ok: true, tripId: 'trip-1' },
      { type: 'stream_aborted' },
    ]);
    expect(typesOf(effects)).not.toContain(EFFECT.REVEAL_PROSE);
  });

  it('leaves a completed response untouched', () => {
    const done = drive([
      started,
      rev1Payload(),
      { type: 'revision_1_result', ok: true, tripId: 'trip-1' },
      rev2Payload(),
      { type: 'revision_2_result', ok: true },
    ]);
    const after = drive([{ type: 'stream_aborted' }], done.state);

    expect(after.effects).toEqual([]);
    expect(after.state.status).toBe(LIFECYCLE_STATE.TERMINAL_VISIBLE);
  });
});

describe('client-side safety validation', () => {
  const ctx = { responseId: RID, responseVersion: 3, itineraryHash: ITIN_HASH };

  it('accepts a well-formed revision-1 event', () => {
    expect(validateItineraryReadyEvent(rev1Payload(), { responseId: RID })).toEqual({ ok: true });
  });

  it.each([
    ['mismatched response identity', { response: { responseId: 'nope' } }, 'response_identity_mismatch'],
    ['wrong revision', { response: { responseRevision: 2 } }, 'revision_1_expected'],
    ['nonempty revision-1 content', { response: { content: 'hello' } }, 'revision_1_content_not_empty'],
    ['unsupported lifecycle status', { response: { lifecycleStatus: 'generating_prose' } }, 'unsupported_lifecycle_status'],
    ['missing itinerary hash', { response: { itineraryHash: null } }, 'missing_itinerary_hash'],
  ])('rejects %s', (_label, over, code) => {
    expect(validateItineraryReadyEvent(rev1Payload(over), { responseId: RID })).toEqual({
      ok: false,
      code,
    });
  });

  it('rejects a revision-1 event whose plan hash disagrees with the envelope', () => {
    const bad = rev1Payload();
    bad.canonicalPlan = { ...bad.canonicalPlan, itineraryHash: 'other' };
    expect(validateItineraryReadyEvent(bad, { responseId: RID })).toEqual({
      ok: false,
      code: 'plan_itinerary_hash_mismatch',
    });
  });

  it('rejects a revision-1 event with no canonical plan', () => {
    const bad = rev1Payload();
    delete bad.canonicalPlan;
    expect(validateItineraryReadyEvent(bad, { responseId: RID })).toEqual({
      ok: false,
      code: 'missing_canonical_plan',
    });
  });

  it('accepts a well-formed revision-2 event', () => {
    expect(validateProseReadyEvent(rev2Payload(), ctx)).toEqual({ ok: true });
  });

  it('accepts fallback_complete as a durable revision-2 status', () => {
    const fb = rev2Payload({ response: { lifecycleStatus: 'fallback_complete' } });
    fb.canonicalPlan.lifecycleStatus = 'fallback_complete';
    expect(validateProseReadyEvent(fb, ctx)).toEqual({ ok: true });
  });

  it.each([
    ['a changed responseVersion', { response: { responseVersion: 4 } }, 'response_version_mismatch'],
    ['a changed itineraryHash', { response: { itineraryHash: 'moved' } }, 'itinerary_hash_changed'],
    ['invalid revision ordering', { response: { previousRevision: null } }, 'invalid_revision_ordering'],
    ['a wrong successor guard', { expectedPreviousRevision: 2 }, 'invalid_revision_ordering'],
    ['a transient lifecycle status', { response: { lifecycleStatus: 'generating_prose' } }, 'unsupported_lifecycle_status'],
  ])('rejects %s', (_label, over, code) => {
    expect(validateProseReadyEvent(rev2Payload(over), ctx)).toEqual({ ok: false, code });
  });

  it.each([
    ['an alignment marker', '<!-- TRAILIE_DAY:1 -->Prose'],
    ['an itinerary JSON block', 'Prose\n\n[ITINERARY_JSON]{"days":[]}[/ITINERARY_JSON]'],
    ['raw tool arguments', 'Prose {"name":"create_itinerary","input_schema":{}}'],
  ])('rejects revision-2 prose containing %s', (_label, content) => {
    const bad = rev2Payload({ response: { content } });
    expect(validateProseReadyEvent(bad, ctx)).toEqual({
      ok: false,
      code: 'forbidden_internal_content',
    });
  });

  it('rejects internal content anywhere in the revision-1 payload', () => {
    const bad = rev1Payload();
    bad.canonicalPlan = { ...bad.canonicalPlan, days: [{ day: 1, notes: '<!-- TRAILIE_STOP:x -->' }] };
    expect(validateItineraryReadyEvent(bad, { responseId: RID })).toEqual({
      ok: false,
      code: 'forbidden_internal_content',
    });
  });

  it('does not repair malformed payloads — a rejected event never persists', () => {
    const { state, effects } = drive([started, rev1Payload({ response: { content: 'oops' } })]);

    expect(writesIn(effects)).toBe(0);
    expect(typesOf(effects)).toEqual([EFFECT.CONTRACT_ERROR]);
    expect(effects[0].code).toBe('revision_1_content_not_empty');
    expect(state.earlyRevisionActive).toBe(false);
    expect(state.earlyRevisionFaulted).toBe(true);
  });

  it('persists done once as a direct terminal after a rejected revision 1', () => {
    const rejected = drive([started, rev1Payload({ response: { content: 'oops' } })]);
    const after = drive([donePayload()], rejected.state);

    // Persist-before-reveal still holds: nothing was shown, and the complete
    // terminal response is written exactly once before it becomes visible.
    expect(typesOf(after.effects)).toEqual([EFFECT.PERSIST_TERMINAL]);
    expect(after.effects[0].expectedPreviousRevision).toBeUndefined();
  });

  it('discards a revision 2 whose validation fails and still saves done once', () => {
    const bad = rev2Payload({ response: { itineraryHash: 'moved' } });
    const { effects } = drive([
      started,
      rev1Payload(),
      { type: 'revision_1_result', ok: true, tripId: 'trip-1' },
      bad,
      donePayload(),
    ]);

    expect(countOf(effects, EFFECT.PERSIST_REVISION_2)).toBe(0);
    expect(countOf(effects, EFFECT.PERSIST_TERMINAL)).toBe(1);
    expect(countOf(effects, EFFECT.CONTRACT_ERROR)).toBe(1);
  });
});

describe('metrics counters that must remain zero', () => {
  it('stay zero across every modeled path', () => {
    const paths = [
      [started, rev1Payload(), { type: 'revision_1_result', ok: true, tripId: 't' }, rev2Payload(), { type: 'revision_2_result', ok: true }, donePayload()],
      [started, rev1Payload(), rev2Payload(), donePayload(), { type: 'revision_1_result', ok: true, tripId: 't' }, { type: 'revision_2_result', ok: true }],
      [started, rev1Payload(), { type: 'revision_1_result', ok: false }, rev2Payload(), donePayload(), { type: 'terminal_result', ok: true, tripId: 't' }],
      [started, donePayload()],
      [donePayload()],
      [started, rev1Payload(), { type: 'revision_1_result', ok: true, tripId: 't' }, { type: 'stream_aborted' }],
    ];

    for (const path of paths) {
      const { state } = drive(path);
      expect(state.metrics.displayedBeforePersistenceCount).toBe(0);
      expect(state.metrics.displayedPersistedMismatchCount).toBe(0);
      expect(state.metrics.duplicateAssistantMessageCount).toBe(0);
      expect(state.metrics.duplicatePlanCount).toBe(0);
    }
  });
});
