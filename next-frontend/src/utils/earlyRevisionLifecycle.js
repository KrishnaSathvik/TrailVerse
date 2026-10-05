/**
 * Stage 14.3 — the frontend early-delivery lifecycle, as a PURE reducer.
 *
 * The single invariant this module exists to enforce:
 *
 *     nothing becomes visible until that exact revision has been persisted
 *     successfully
 *
 * For revision 1 that means the itinerary card; for revision 2 it means the
 * prose. Race handling therefore lives here — one state machine keyed by
 * (responseId, responseVersion) — and NOT scattered through TripPlannerChat.
 *
 * The reducer never performs I/O. It returns declarative effects that
 * `earlyRevisionCoordinator` executes. That split is what makes buffering,
 * ordering, duplicate suppression and the `done` reconciliation matrix testable
 * deterministically, with no network, no timers and no React.
 */

export const LIFECYCLE_STATE = {
  IDLE: 'idle',
  STARTED: 'started',
  SAVING_REVISION_1: 'saving_revision_1',
  ITINERARY_VISIBLE: 'itinerary_visible',
  REVISION_2_BUFFERED: 'revision_2_buffered',
  SAVING_REVISION_2: 'saving_revision_2',
  SAVING_TERMINAL: 'saving_terminal',
  TERMINAL_VISIBLE: 'terminal_visible',
  SAVE_FAILED: 'save_failed',
  STREAM_ABORTED: 'stream_aborted',
  LEGACY: 'legacy',
};

export const EFFECT = {
  PERSIST_REVISION_1: 'persist_revision_1',
  PERSIST_REVISION_2: 'persist_revision_2',
  PERSIST_TERMINAL: 'persist_terminal',
  LEGACY_TERMINAL: 'legacy_terminal',
  SET_TRIP_ID: 'set_trip_id',
  REVEAL_ITINERARY: 'reveal_itinerary',
  REVEAL_PROSE: 'reveal_prose',
  REVEAL_TERMINAL: 'reveal_terminal',
  SET_PENDING_LABEL: 'set_pending_label',
  CONTRACT_ERROR: 'contract_error',
  COMPLETE: 'complete',
};

/** Presentation state only. Never canonical assistant content, never persisted. */
export const PENDING_PROSE_LABEL = 'Preparing trip notes…';
export const INCOMPLETE_PROSE_LABEL = 'Trip notes were not completed.';

const DURABLE_REVISION_2_STATUSES = new Set(['prose_ready', 'fallback_complete']);

/**
 * Internal strings that must never reach persistence or the DOM. The server
 * already strips these; this is defence in depth, and it fails closed rather
 * than repairing the payload.
 */
const FORBIDDEN_PATTERNS = [
  /<!--\s*TRAILIE_/i,
  /\[ITINERARY_JSON\]/i,
  /\[\/ITINERARY_JSON\]/i,
  /create_itinerary/i,
  /"?tool_use"?\s*[:"]/i,
  /input_schema/i,
];

function containsForbiddenContent(value, depth = 0) {
  if (depth > 8 || value == null) return false;
  if (typeof value === 'string') {
    return FORBIDDEN_PATTERNS.some((re) => re.test(value));
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsForbiddenContent(item, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.values(value).some((item) => containsForbiddenContent(item, depth + 1));
  }
  return false;
}

const fail = (code) => ({ ok: false, code });
const pass = () => ({ ok: true });

/**
 * Validate `itinerary_ready` before it is allowed to touch persistence or the
 * UI. A rejection means this turn never enters the early lifecycle at all, so
 * the unchanged terminal `done` path handles it.
 */
export function validateItineraryReadyEvent(payload, ctx = {}) {
  const response = payload?.response;
  if (!response || typeof response !== 'object') return fail('missing_response');
  if (!payload.canonicalPlan || typeof payload.canonicalPlan !== 'object') {
    return fail('missing_canonical_plan');
  }
  if (!ctx.responseId || response.responseId !== ctx.responseId) {
    return fail('response_identity_mismatch');
  }
  if (response.responseRevision !== 1) return fail('revision_1_expected');
  if (response.previousRevision != null) return fail('invalid_revision_ordering');
  if (response.lifecycleStatus !== 'itinerary_ready') return fail('unsupported_lifecycle_status');
  if (response.content !== '') return fail('revision_1_content_not_empty');
  if (!Number.isFinite(response.responseVersion)) return fail('missing_response_version');
  if (!response.itineraryHash) return fail('missing_itinerary_hash');
  if (payload.canonicalPlan.responseId !== response.responseId) {
    return fail('plan_identity_mismatch');
  }
  if (payload.canonicalPlan.itineraryHash !== response.itineraryHash) {
    return fail('plan_itinerary_hash_mismatch');
  }
  if (containsForbiddenContent(payload)) return fail('forbidden_internal_content');
  return pass();
}


/**
 * Stage 14.7F2 §1 — the single source of the shared canonical identity.
 *
 * PERSIST_* and REVEAL_* both carry these fields because their consumers need
 * them at the top level (the message reducers read `effect.responseId` /
 * `effect.itineraryHash`). Duplicating the values invites drift, so every effect
 * derives them here from the SAME canonical response object rather than from
 * whatever happens to be in scope.
 *
 * A persistence effect that revealed one identity while persisting another is
 * exactly the Stage 14.7F1 Defect B failure mode, one level subtler.
 */
export function canonicalIdentityOf(response, revision) {
  return {
    responseId: response?.responseId ?? null,
    responseVersion: response?.responseVersion ?? null,
    responseRevision: revision,
    itineraryHash: response?.itineraryHash ?? null,
  };
}

/**
 * Fails closed: an effect must never be emitted with incomplete identity, since
 * downstream persistence would silently write a shell with no canonical keys.
 */
export function assertCanonicalIdentity(identity) {
  const complete =
    typeof identity.responseId === 'string' && identity.responseId.length > 0 &&
    Number.isFinite(identity.responseVersion) &&
    (identity.responseRevision === 1 || identity.responseRevision === 2) &&
    typeof identity.itineraryHash === 'string' && identity.itineraryHash.length > 0;
  if (!complete) {
    const error = new Error('canonical_identity_incomplete');
    error.code = 'canonical_identity_incomplete';
    throw error;
  }
  return identity;
}

/**
 * Validate `prose_ready` against the revision-1 context the client actually
 * persisted — not against the event's own claims.
 */
export function validateProseReadyEvent(payload, ctx = {}) {
  const response = payload?.response;
  if (!response || typeof response !== 'object') return fail('missing_response');
  if (!payload.canonicalPlan || typeof payload.canonicalPlan !== 'object') {
    return fail('missing_canonical_plan');
  }
  if (!ctx.responseId || response.responseId !== ctx.responseId) {
    return fail('response_identity_mismatch');
  }
  if (response.responseVersion !== ctx.responseVersion) return fail('response_version_mismatch');
  if (response.responseRevision !== 2) return fail('revision_2_expected');
  if (response.previousRevision !== 1) return fail('invalid_revision_ordering');
  if (payload.expectedPreviousRevision !== 1) return fail('invalid_revision_ordering');
  if (!DURABLE_REVISION_2_STATUSES.has(response.lifecycleStatus)) {
    return fail('unsupported_lifecycle_status');
  }
  if (!response.itineraryHash) return fail('missing_itinerary_hash');
  if (response.itineraryHash !== ctx.itineraryHash) return fail('itinerary_hash_changed');
  if (payload.canonicalPlan.responseId !== response.responseId) return fail('plan_identity_mismatch');
  if (payload.canonicalPlan.itineraryHash !== ctx.itineraryHash) {
    return fail('plan_itinerary_hash_mismatch');
  }
  if (typeof response.content !== 'string' || response.content === '') {
    return fail('revision_2_content_empty');
  }
  if (containsForbiddenContent(payload)) return fail('forbidden_internal_content');
  return pass();
}

/** Compact identity signature used to tell an idempotent duplicate from a conflict. */
function signatureOf(type, payload) {
  if (type === 'response_started') return String(payload?.responseId);
  if (type === 'done') {
    return [payload?.responseId, payload?.responseVersion, payload?.contentHash, payload?.itineraryHash].join('|');
  }
  const r = payload?.response || {};
  return [
    r.responseId,
    r.responseVersion,
    r.responseRevision,
    r.contentHash,
    r.itineraryHash,
    r.lifecycleStatus,
    payload?.expectedPreviousRevision,
  ].join('|');
}

export function initialLifecycleState(overrides = {}) {
  return {
    status: LIFECYCLE_STATE.IDLE,
    responseId: null,
    responseVersion: null,
    itineraryHash: null,
    expectsItinerary: null,

    // ── Stage 14.3A — three DISTINCT concepts, never collapsed into one flag ──
    /** A turn was admitted. Identity only. Changes no rendering or persistence. */
    responseStartedSeen: false,
    /** A VALID itinerary_ready was accepted. THIS is what suppresses legacy prose. */
    earlyRevisionActive: false,
    /** An itinerary_ready arrived but failed validation. Fail closed, not fall back. */
    earlyRevisionFaulted: false,
    tripId: null,
    revision1: null,
    revision2: null,
    bufferedDone: null,
    terminalAttempted: false,
    itineraryVisible: false,
    proseVisible: false,
    revealedContent: null,
    persistedItineraryHash: null,
    persistedContentHash: null,
    streamAborted: false,
    signatures: {},
    lastError: null,
    metrics: {
      revision1PersistenceFailure: 0,
      revision2PersistenceFailure: 0,
      bufferedRevision2Count: 0,
      doneReconciliationCount: 0,
      duplicateEventCount: 0,
      displayedBeforePersistenceCount: 0,
      displayedPersistedMismatchCount: 0,
      duplicateAssistantMessageCount: 0,
      duplicatePlanCount: 0,
      persistenceWrites: 0,
      // Stage 14.3A — legacy-chunk ownership boundary.
      suppressedLegacyChunkCount: 0,
      suppressedLegacyStreamEndCount: 0,
      legacyChunksRenderedWithoutItineraryReady: 0,
      invalidEarlyEventCount: 0,
      crossTurnChunkLeakCount: 0,
    },
    ...overrides,
  };
}

const bump = (state, key, by = 1) => ({
  ...state,
  metrics: { ...state.metrics, [key]: state.metrics[key] + by },
});

const contractError = (state, code) => ({
  state: { ...state, lastError: code },
  effects: [{ type: EFFECT.CONTRACT_ERROR, code }],
});

/**
 * Record a duplicate. Returns null when the payload is genuinely new.
 * Identical duplicates are idempotent; differing ones are a contract error.
 */
function handleDuplicate(state, type, payload) {
  const prior = state.signatures[type];
  if (prior === undefined) return null;
  const next = bump(state, 'duplicateEventCount');
  if (prior === signatureOf(type, payload)) {
    return { state: next, effects: [] };
  }
  return contractError(next, `conflicting_duplicate_${type}`);
}

const remember = (state, type, payload) => ({
  ...state,
  signatures: { ...state.signatures, [type]: signatureOf(type, payload) },
});

/** Build the reveal for a revision-1 itinerary that is now durable. */
function revealItinerary(state) {
  const effects = [];
  let next = state;

  if (state.itineraryVisible) {
    return { state: bump(state, 'duplicateAssistantMessageCount'), effects };
  }
  if (state.persistedItineraryHash !== state.itineraryHash) {
    next = bump(next, 'displayedBeforePersistenceCount');
  }

  effects.push({ type: EFFECT.SET_TRIP_ID, tripId: next.tripId });
  effects.push({
    type: EFFECT.REVEAL_ITINERARY,
    mode: 'upsert',
    // Same source as PERSIST_REVISION_1, so the two cannot disagree.
    ...assertCanonicalIdentity(canonicalIdentityOf(next.revision1.response, 1)),
    content: '',
    pendingProse: true,
    response: next.revision1.response,
    canonicalPlan: next.revision1.canonicalPlan,
    tripId: next.tripId,
  });
  effects.push({ type: EFFECT.SET_PENDING_LABEL, label: PENDING_PROSE_LABEL, responseId: next.responseId });

  return { state: { ...next, itineraryVisible: true }, effects };
}

/** Emit the revision-2 write. Revision 2 may never create a trip. */
function persistRevision2Effect(state) {
  return {
    type: EFFECT.PERSIST_REVISION_2,
    // Stage 14.7F1 — canonical identity must travel with the PERSIST effect,
    // not only with REVEAL_PROSE. The persistence callback builds its payload
    // with `updateProseTurn`, which locates the turn by `effect.responseId`;
    // without these fields it found nothing and returned the conversation
    // unchanged, so revision-2 prose never reached the stored conversation.
    ...assertCanonicalIdentity(canonicalIdentityOf(state.revision2.response, 2)),
    content: state.revision2.response.content,
    response: state.revision2.response,
    canonicalPlan: state.revision2.canonicalPlan,
    expectedPreviousRevision: 1,
    tripId: state.tripId,
    createIfMissing: false,
  };
}

function persistTerminalEffect(state, reason) {
  return {
    type: EFFECT.PERSIST_TERMINAL,
    done: state.bufferedDone,
    reason,
    tripId: state.tripId,
    createIfMissing: true,
  };
}

/** Does a buffered `done` describe exactly what revision 2 already persisted? */
function doneMatchesRevision2(state) {
  const d = state.bufferedDone;
  const r = state.revision2?.response;
  if (!d || !r) return false;
  return (
    d.responseId === r.responseId &&
    d.contentHash === r.contentHash &&
    d.itineraryHash === r.itineraryHash
  );
}

function onResponseStarted(state, event) {
  if (state.responseId && state.responseId !== event.responseId) {
    return contractError(bump(state, 'duplicateEventCount', 0), 'response_identity_changed');
  }
  const dup = handleDuplicate(state, 'response_started', event);
  if (dup) return dup;

  // Observation ONLY. `itinerary_ready` is the authoritative signal that an
  // itinerary is coming; a turn that never produces one must keep the legacy
  // prose-only streaming behavior intact.
  return {
    state: remember(
      {
        ...state,
        status: LIFECYCLE_STATE.STARTED,
        responseStartedSeen: true,
        responseId: event.responseId,
        expectsItinerary:
          event.requiresStructuredItinerary === undefined ? null : event.requiresStructuredItinerary,
      },
      'response_started',
      event
    ),
    effects: [],
  };
}

function onItineraryReady(state, event) {
  const dup = handleDuplicate(state, 'itinerary_ready', event);
  if (dup) return dup;

  const verdict = validateItineraryReadyEvent(event, { responseId: state.responseId });
  if (!verdict.ok) {
    // Stage 14.3A §7 — FAIL CLOSED. The server believes it produced an early
    // itinerary, so the prose chunks that follow are the replay of a response
    // whose revision structure we cannot trust. Rendering them would show
    // unpersisted content. Suppress, persist nothing, and wait for `done`.
    // This is deliberately DIFFERENT from "no itinerary_ready arrived", which
    // keeps legacy rendering.
    const faulted = bump(
      { ...remember(state, 'itinerary_ready', event), earlyRevisionFaulted: true },
      'invalidEarlyEventCount'
    );
    return contractError(faulted, verdict.code);
  }

  const next = remember(
    {
      ...state,
      status: LIFECYCLE_STATE.SAVING_REVISION_1,
      // Activation happens on RECEIPT of the valid event, not after its save:
      // chunks arrive while revision 1 is still persisting.
      earlyRevisionActive: true,
      responseVersion: event.response.responseVersion,
      itineraryHash: event.response.itineraryHash,
      revision1: { response: event.response, canonicalPlan: event.canonicalPlan },
    },
    'itinerary_ready',
    event
  );

  return {
    state: bump(next, 'persistenceWrites'),
    effects: [
      {
        type: EFFECT.PERSIST_REVISION_1,
        // Stage 14.7F1 — the persistence callback builds its payload with
        // `upsertItineraryTurn`, which reads these top-level fields. Without
        // them the persisted assistant shell carried `responseId: undefined`
        // and no `itineraryHash`, so it had no canonical identity.
        ...assertCanonicalIdentity(canonicalIdentityOf(event.response, 1)),
        response: event.response,
        canonicalPlan: event.canonicalPlan,
        tripId: next.tripId,
        createIfMissing: true,
      },
    ],
  };
}

function onProseReady(state, event) {
  if (!state.earlyRevisionActive) return { state, effects: [] };

  const dup = handleDuplicate(state, 'prose_ready', event);
  if (dup) return dup;

  const verdict = validateProseReadyEvent(event, {
    responseId: state.responseId,
    responseVersion: state.responseVersion,
    itineraryHash: state.itineraryHash,
  });
  if (!verdict.ok) {
    return contractError(remember(state, 'prose_ready', event), verdict.code);
  }

  const withRev2 = remember(
    { ...state, revision2: { response: event.response, canonicalPlan: event.canonicalPlan } },
    'prose_ready',
    event
  );

  // Revision 1 is still in flight: buffer, do not persist, do not display.
  if (
    state.status === LIFECYCLE_STATE.SAVING_REVISION_1 ||
    state.status === LIFECYCLE_STATE.REVISION_2_BUFFERED
  ) {
    return {
      state: bump({ ...withRev2, status: LIFECYCLE_STATE.REVISION_2_BUFFERED }, 'bufferedRevision2Count'),
      effects: [],
    };
  }

  if (state.status === LIFECYCLE_STATE.SAVE_FAILED) {
    // Revision 1 never landed; a successor has nothing to succeed.
    return { state: { ...withRev2, revision2: null }, effects: [] };
  }

  const ready = { ...withRev2, status: LIFECYCLE_STATE.SAVING_REVISION_2 };
  return {
    state: bump(ready, 'persistenceWrites'),
    effects: [persistRevision2Effect(ready)],
  };
}

function onRevision1Result(state, event) {
  if (state.status !== LIFECYCLE_STATE.SAVING_REVISION_1 &&
      state.status !== LIFECYCLE_STATE.REVISION_2_BUFFERED) {
    return { state, effects: [] };
  }

  if (!event.ok) {
    const failed = bump(
      { ...state, status: LIFECYCLE_STATE.SAVE_FAILED, revision2: null },
      'revision1PersistenceFailure'
    );
    if (failed.bufferedDone && !failed.terminalAttempted) {
      const attempting = bump({ ...failed, status: LIFECYCLE_STATE.SAVING_TERMINAL, terminalAttempted: true }, 'persistenceWrites');
      return { state: attempting, effects: [persistTerminalEffect(attempting, 'revision_1_failed')] };
    }
    return { state: failed, effects: [] };
  }

  const saved = {
    ...state,
    tripId: event.tripId || state.tripId,
    persistedItineraryHash: state.itineraryHash,
  };
  const revealed = revealItinerary(saved);
  let next = { ...revealed.state, status: LIFECYCLE_STATE.ITINERARY_VISIBLE };
  const effects = [...revealed.effects];

  if (next.revision2) {
    next = bump({ ...next, status: LIFECYCLE_STATE.SAVING_REVISION_2 }, 'persistenceWrites');
    effects.push(persistRevision2Effect(next));
    return { state: next, effects };
  }

  if (next.bufferedDone && !next.terminalAttempted) {
    // No prose phase arrived — itinerary-only success. Persist terminal and
    // clear the transient "preparing notes" label (do not mark incomplete).
    next = bump({ ...next, status: LIFECYCLE_STATE.SAVING_TERMINAL, terminalAttempted: true }, 'persistenceWrites');
    effects.push(persistTerminalEffect(next, 'itinerary_only_complete'));
    return { state: next, effects };
  }

  if (next.streamAborted) {
    effects.push({ type: EFFECT.SET_PENDING_LABEL, label: INCOMPLETE_PROSE_LABEL, responseId: next.responseId });
    next = { ...next, status: LIFECYCLE_STATE.STREAM_ABORTED };
  }

  return { state: next, effects };
}

function onRevision2Result(state, event) {
  if (state.status !== LIFECYCLE_STATE.SAVING_REVISION_2) return { state, effects: [] };

  if (!event.ok) {
    let next = bump({ ...state, status: LIFECYCLE_STATE.ITINERARY_VISIBLE }, 'revision2PersistenceFailure');
    // The save may have reached the server; one bounded idempotent `done`
    // attempt reconciles it. A hard failure keeps revision 1 and shows nothing new.
    if (next.bufferedDone && !next.terminalAttempted) {
      const reason = event.uncertain ? 'revision_2_uncertain' : 'revision_2_failed';
      next = bump({ ...next, status: LIFECYCLE_STATE.SAVING_TERMINAL, terminalAttempted: true }, 'persistenceWrites');
      return { state: next, effects: [persistTerminalEffect(next, reason)] };
    }
    return { state: next, effects: [] };
  }

  const saved = {
    ...state,
    persistedContentHash: state.revision2.response.contentHash,
    status: LIFECYCLE_STATE.TERMINAL_VISIBLE,
  };
  const effects = [];
  let next = saved;

  if (saved.proseVisible) {
    next = bump(next, 'duplicateAssistantMessageCount');
  } else {
    if (saved.persistedContentHash !== saved.revision2.response.contentHash) {
      next = bump(next, 'displayedPersistedMismatchCount');
    }
    effects.push({
      type: EFFECT.REVEAL_PROSE,
      mode: 'update',
      // Same source as PERSIST_REVISION_2, so the two cannot disagree.
      ...assertCanonicalIdentity(canonicalIdentityOf(next.revision2.response, 2)),
      content: next.revision2.response.content,
      pendingProse: false,
      autoScroll: false,
      response: next.revision2.response,
      canonicalPlan: next.revision2.canonicalPlan,
    });
    next = { ...next, proseVisible: true, revealedContent: next.revision2.response.content };
  }

  if (next.bufferedDone) {
    return reconcileBufferedDone(next, effects);
  }
  return { state: next, effects };
}

/** `done` arrived while revision 2 was in flight; settle it without another write. */
function reconcileBufferedDone(state, effects) {
  const next = bump(state, 'doneReconciliationCount');
  if (doneMatchesRevision2(next)) {
    return {
      state: { ...next, bufferedDone: null },
      effects: [...effects, { type: EFFECT.COMPLETE, responseId: next.responseId }],
    };
  }
  // Fail closed: keep the highest successfully persisted revision.
  return {
    state: { ...next, bufferedDone: null, lastError: 'done_conflicts_with_persisted_revision_2' },
    effects: [
      ...effects,
      { type: EFFECT.CONTRACT_ERROR, code: 'done_conflicts_with_persisted_revision_2' },
    ],
  };
}

function onTerminalResult(state, event) {
  if (state.status !== LIFECYCLE_STATE.SAVING_TERMINAL) return { state, effects: [] };
  if (!event.ok) {
    return { state: { ...state, status: LIFECYCLE_STATE.SAVE_FAILED }, effects: [] };
  }
  const effects = [
    { type: EFFECT.REVEAL_TERMINAL, mode: 'upsert', responseId: state.responseId, done: state.bufferedDone },
    { type: EFFECT.COMPLETE, responseId: state.responseId },
  ];
  // Itinerary-only success: clear transient pending-notes chrome. Genuine
  // prose failures keep INCOMPLETE_PROSE_LABEL via stream_aborted handling.
  if (!state.revision2 && !state.streamAborted) {
    effects.unshift({
      type: EFFECT.SET_PENDING_LABEL,
      label: null,
      responseId: state.responseId,
    });
  }
  return {
    state: {
      ...state,
      status: LIFECYCLE_STATE.TERMINAL_VISIBLE,
      tripId: event.tripId || state.tripId,
      proseVisible: Boolean(state.revision2) || Boolean(state.bufferedDone?.content),
      revealedContent: state.bufferedDone?.content ?? state.revealedContent,
      bufferedDone: null,
    },
    effects,
  };
}

function onDone(state, event) {
  // Never entered the typed lifecycle AND not faulted ⇒ the existing terminal
  // path, unchanged. This is the structured-failure / prose-only / flag-off case.
  if (!state.earlyRevisionActive && !state.earlyRevisionFaulted) {
    return {
      state: { ...state, status: LIFECYCLE_STATE.LEGACY },
      effects: [{ type: EFFECT.LEGACY_TERMINAL, done: event }],
    };
  }

  const dup = handleDuplicate(state, 'done', event);
  if (dup) return dup;

  const withDone = remember({ ...state, bufferedDone: event }, 'done', event);

  // A faulted transaction rendered nothing, so `done` is a plain direct-terminal
  // write — persisted first, revealed after.
  if (state.earlyRevisionFaulted) {
    if (withDone.terminalAttempted) return { state: withDone, effects: [] };
    const attempting = bump(
      { ...withDone, status: LIFECYCLE_STATE.SAVING_TERMINAL, terminalAttempted: true },
      'persistenceWrites'
    );
    return { state: attempting, effects: [persistTerminalEffect(attempting, 'invalid_early_event')] };
  }

  switch (state.status) {
    case LIFECYCLE_STATE.SAVING_REVISION_1:
    case LIFECYCLE_STATE.REVISION_2_BUFFERED:
    case LIFECYCLE_STATE.SAVING_REVISION_2:
    case LIFECYCLE_STATE.SAVING_TERMINAL:
      // Buffer; the pending revision's outcome decides what happens next.
      return { state: withDone, effects: [] };

    case LIFECYCLE_STATE.SAVE_FAILED: {
      if (withDone.terminalAttempted) return { state: withDone, effects: [] };
      const attempting = bump(
        { ...withDone, status: LIFECYCLE_STATE.SAVING_TERMINAL, terminalAttempted: true },
        'persistenceWrites'
      );
      return { state: attempting, effects: [persistTerminalEffect(attempting, 'revision_1_failed')] };
    }

    case LIFECYCLE_STATE.ITINERARY_VISIBLE:
    case LIFECYCLE_STATE.STREAM_ABORTED: {
      if (withDone.terminalAttempted) return { state: withDone, effects: [] };
      // STREAM_ABORTED + done: prose was expected but the stream died — keep
      // revision_2_failed / incomplete semantics. ITINERARY_VISIBLE without
      // revision2 is a successful itinerary-only finalize.
      let reason = 'itinerary_only_complete';
      if (state.revision2) reason = 'revision_2_failed';
      else if (state.status === LIFECYCLE_STATE.STREAM_ABORTED || state.streamAborted) {
        reason = 'missing_prose_ready';
      }
      const attempting = bump(
        { ...withDone, status: LIFECYCLE_STATE.SAVING_TERMINAL, terminalAttempted: true },
        'persistenceWrites'
      );
      return { state: attempting, effects: [persistTerminalEffect(attempting, reason)] };
    }

    case LIFECYCLE_STATE.TERMINAL_VISIBLE:
      // Revision 2 is already durable. `done` is confirmation, never a second
      // assistant turn, trip creation, or auto-save.
      return reconcileBufferedDone(withDone, []);

    default:
      return { state: withDone, effects: [] };
  }
}

function onStreamAborted(state) {
  if (state.streamAborted) return { state, effects: [] };
  const next = { ...state, streamAborted: true };

  if (next.status === LIFECYCLE_STATE.ITINERARY_VISIBLE) {
    return {
      state: { ...next, status: LIFECYCLE_STATE.STREAM_ABORTED },
      effects: [
        { type: EFFECT.SET_PENDING_LABEL, label: INCOMPLETE_PROSE_LABEL, responseId: next.responseId },
      ],
    };
  }
  // Before revision 1, mid-save, or already terminal: nothing to show or undo.
  // An in-flight save is deliberately allowed to settle.
  return { state: next, effects: [] };
}

/**
 * Stage 14.3A — should a legacy prose `chunk` be rendered?
 *
 * The server still REPLAYS the selected prose as `chunk` events, and that replay
 * happens BEFORE `prose_ready` (`trailieItineraryTurn.js` calls `replayProse`
 * inside the turn; `ai.js` emits `prose_ready` after the turn returns). So in
 * early mode these chunks are the same prose that revision 2 will carry — but
 * unpersisted. Rendering them would break persist-before-reveal and would put a
 * second assistant message beside the durable revision-1 turn.
 *
 * Suppression is gated on ACTIVATION (a valid `itinerary_ready`) or FAULT (a
 * malformed one) — never on `response_started`, which says nothing about whether
 * an itinerary is coming.
 *
 * TRANSPORT ASSUMPTION: the `chunk` frame carries no `responseId`. One
 * authenticated stream serves one active turn, and `handleSendMessage` builds a
 * fresh coordinator per turn and disposes the previous one, so chunk state
 * cannot outlive its stream. When a caller CAN supply an identity, a mismatch is
 * refused rather than attributed to this transaction.
 *
 * @returns {{state: Object, render: boolean, code?: string}}
 */
export function decideLegacyChunk(state, { responseId } = {}) {
  if (responseId && state.responseId && responseId !== state.responseId) {
    return {
      state: bump(state, 'crossTurnChunkLeakCount'),
      render: false,
      code: 'legacy_chunk_response_mismatch',
    };
  }

  if (state.earlyRevisionActive || state.earlyRevisionFaulted) {
    return { state: bump(state, 'suppressedLegacyChunkCount'), render: false };
  }

  // No itinerary_ready for this turn: structured failure, prose-only, flag off,
  // or legacy mode. Unchanged behavior.
  return { state: bump(state, 'legacyChunksRenderedWithoutItineraryReady'), render: true };
}

/** Same boundary for `stream_end`: it must not finalize suppressed legacy prose. */
export function decideLegacyStreamEnd(state) {
  if (state.earlyRevisionActive || state.earlyRevisionFaulted) {
    return { state: bump(state, 'suppressedLegacyStreamEndCount'), finalize: false };
  }
  return { state, finalize: true };
}

export function reduceLifecycle(state, event) {
  switch (event?.type) {
    case 'response_started':
      return onResponseStarted(state, event);
    case 'itinerary_ready':
      return onItineraryReady(state, event);
    case 'prose_generation_started':
      return { state, effects: [] }; // presentation only; never persisted
    case 'prose_ready':
      return onProseReady(state, event);
    case 'done':
      return onDone(state, event);
    case 'revision_1_result':
      return onRevision1Result(state, event);
    case 'revision_2_result':
      return onRevision2Result(state, event);
    case 'terminal_result':
      return onTerminalResult(state, event);
    case 'stream_aborted':
      return onStreamAborted(state, event);
    default:
      return { state, effects: [] };
  }
}
