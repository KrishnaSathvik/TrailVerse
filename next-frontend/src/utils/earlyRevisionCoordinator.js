import { resolveTerminalOwnership } from './terminalOwnership';
/**
 * Stage 14.3 — the side-effect half of the early-delivery lifecycle.
 *
 * `earlyRevisionLifecycle` decides WHAT should happen; this module performs it:
 * it drives persistence, feeds the outcome back into the reducer, applies view
 * updates, and records timings. It is the SOLE owner of persistence decisions
 * for any response that entered the typed-event lifecycle — the legacy `done`
 * handler and `autoSaveConversation` must not run independently for those.
 *
 * Everything is dependency-injected so the whole matrix is testable with no
 * network, no timers, and no React.
 */
import {
  EFFECT,
  initialLifecycleState,
  reduceLifecycle,
  decideLegacyChunk,
  decideLegacyStreamEnd,
} from './earlyRevisionLifecycle';

const noop = () => {};

function initialTimings() {
  return {
    timeToItineraryReadyEventMs: null,
    revision1PersistenceDurationMs: null,
    timeToItineraryVisibleMs: null,
    timeToProseReadyEventMs: null,
    revision2PersistenceDurationMs: null,
    timeToProseVisibleMs: null,
  };
}

export function createEarlyRevisionCoordinator({
  persistRevision1,
  persistRevision2,
  persistTerminal,
  legacyTerminal = noop,
  view = {},
  now = () => Date.now(),
  initialTripId = null,
} = {}) {
  let state = initialLifecycleState({ tripId: initialTripId });
  let disposed = false;
  let terminalDecision = null;
  const inFlight = new Set();
  const timings = initialTimings();
  /** One client turn origin, taken at the first event of the turn. */
  let turnStartedAt = null;

  const elapsed = () => (turnStartedAt == null ? null : now() - turnStartedAt);

  /** View updates are skipped after unmount; lifecycle state still advances. */
  const emitView = (fn, payload) => {
    if (disposed) return;
    (fn || noop)(payload);
  };

  const track = (promise) => {
    const wrapped = promise.finally(() => inFlight.delete(wrapped));
    inFlight.add(wrapped);
    return wrapped;
  };

  /**
   * Persistence never throws into the reducer. A thrown error is an UNCERTAIN
   * failure: the write may or may not have reached the server, so the terminal
   * reconciliation path (not a blind retry) resolves it.
   */
  const runPersistence = async (fn, payload) => {
    try {
      const result = await (fn || (async () => ({ ok: false })))(payload);
      return result && typeof result === 'object' ? result : { ok: false };
    } catch {
      return { ok: false, uncertain: true, outcome: 'THREW' };
    }
  };

  function applyEffect(effect) {
    switch (effect.type) {
      case EFFECT.PERSIST_REVISION_1: {
        const startedAt = now();
        track(
          runPersistence(persistRevision1, effect).then((result) => {
            timings.revision1PersistenceDurationMs = now() - startedAt;
            dispatch({
              type: 'revision_1_result',
              ok: result.ok === true,
              uncertain: result.uncertain === true,
              tripId: result.tripId || null,
              outcome: result.outcome || null,
            });
          })
        );
        return;
      }
      case EFFECT.PERSIST_REVISION_2: {
        const startedAt = now();
        track(
          runPersistence(persistRevision2, effect).then((result) => {
            timings.revision2PersistenceDurationMs = now() - startedAt;
            dispatch({
              type: 'revision_2_result',
              ok: result.ok === true,
              uncertain: result.uncertain === true,
              outcome: result.outcome || null,
            });
          })
        );
        return;
      }
      case EFFECT.PERSIST_TERMINAL: {
        terminalDecision = resolveTerminalOwnership(effect.done || {});
        track(
          runPersistence(persistTerminal, { ...effect, terminalDecision }).then((result) => {
            dispatch({
              type: 'terminal_result',
              ok: result.ok === true,
              tripId: result.tripId || null,
              outcome: result.outcome || null,
            });
          })
        );
        return;
      }
      case EFFECT.LEGACY_TERMINAL:
        // Never entered the early lifecycle — the pre-Stage-14 path, unchanged.
        if (!disposed) legacyTerminal(effect.done);
        return;
      case EFFECT.SET_TRIP_ID:
        emitView(view.setTripId, effect.tripId);
        return;
      case EFFECT.REVEAL_ITINERARY:
        timings.timeToItineraryVisibleMs = elapsed();
        emitView(view.revealItinerary, effect);
        return;
      case EFFECT.REVEAL_PROSE:
        timings.timeToProseVisibleMs = elapsed();
        emitView(view.revealProse, effect);
        return;
      case EFFECT.REVEAL_TERMINAL:
        timings.timeToProseVisibleMs = elapsed();
        emitView(view.revealTerminal, { ...effect, terminalDecision });
        return;
      case EFFECT.SET_PENDING_LABEL:
        emitView(view.setPendingLabel, effect);
        return;
      case EFFECT.CONTRACT_ERROR:
        emitView(view.onContractError, effect);
        return;
      case EFFECT.COMPLETE:
        emitView(view.onComplete, effect);
        return;
      default:
        return;
    }
  }

  function dispatch(event) {
    const out = reduceLifecycle(state, event);
    state = out.state;
    for (const effect of out.effects) applyEffect(effect);
  }

  return {
    /** Feed one SSE event (or a `stream_aborted` signal) into the lifecycle. */
    handleEvent(event) {
      if (turnStartedAt == null) turnStartedAt = now();
      if (event?.type === 'itinerary_ready') {
        timings.timeToItineraryReadyEventMs = elapsed();
      } else if (event?.type === 'prose_ready') {
        timings.timeToProseReadyEventMs = elapsed();
      }
      dispatch(event);
    },

    /** Await every in-flight persistence, including work they trigger. */
    async drain() {
      while (inFlight.size > 0) {
        await Promise.all([...inFlight]);
      }
    },

    /** Unmount: stop touching React state; already-started saves still settle. */
    dispose() {
      disposed = true;
    },

    /**
     * Stage 14.3A — may this legacy prose chunk be rendered?
     *
     * Called synchronously from the stream callback, so it returns a boolean
     * rather than an effect. A disposed coordinator always refuses and records
     * the attempt: that is the only way a chunk could leak across turns.
     */
    shouldRenderLegacyChunk(meta) {
      if (disposed) {
        state = {
          ...state,
          metrics: { ...state.metrics, crossTurnChunkLeakCount: state.metrics.crossTurnChunkLeakCount + 1 },
        };
        return false;
      }
      const out = decideLegacyChunk(state, meta || {});
      state = out.state;
      if (out.code) emitView(view.onContractError, { code: out.code });
      return out.render;
    },

    /** Same boundary for `stream_end`. */
    shouldFinalizeLegacyStream() {
      if (disposed) return false;
      const out = decideLegacyStreamEnd(state);
      state = out.state;
      return out.finalize;
    },

    /**
     * Does the coordinator own terminal persistence for this turn? True once a
     * valid `itinerary_ready` activated it, and also when a malformed one
     * faulted it — in both cases the legacy terminal path must NOT also run.
     * Deliberately distinct from `responseStartedSeen`.
     */
    ownsTerminalPersistence: () =>
      state.earlyRevisionActive === true || state.earlyRevisionFaulted === true,

    /**
     * Stage 14.4 — begin a transaction from an ALREADY-DURABLE revision 1.
     * Used only by prose recovery, which resumes a response the client already
     * persisted rather than starting a new turn.
     */
    seed(nextState) {
      state = nextState;
      if (turnStartedAt == null) turnStartedAt = now();
    },

    getState: () => state,
    getMetrics: () => ({ ...state.metrics, ...timings }),
  };
}
