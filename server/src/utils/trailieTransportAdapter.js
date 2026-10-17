'use strict';
const { projectDraftDay } = require('./trailieDraftPreview');

/**
 * WP10 — Trailie transport/client compatibility adapter.
 *
 * ONE canonical v2 event source is translated, per connection, into the dialect
 * the connected client speaks. A connection is EITHER a v2 client or a legacy
 * client; the server always emits canonical events and this adapter renders them
 * for whichever dialect the client negotiated. This is the whole point of WP10:
 * carry the new architecture without breaking any existing client.
 *
 * This module is pure with respect to I/O — it receives canonical events and
 * calls the injected `emit` sink. It performs NO persistence, holds no database
 * handle, makes no provider call, and knows nothing about model identity.
 *
 * Invariants enforced here (identical for every route and dialect):
 *   1. EXACTLY ONE authoritative terminal. No matter how the generation path
 *      escalates (Luna → Terra → Terra retry → Sol), the first terminal wins and
 *      the adapter seals; later terminals are dropped. No duplicate final answer.
 *   2. PROGRESS is product-stage only. Model/provider identity is telemetry, not
 *      user-facing progress, so only a fixed vocabulary of product stages passes
 *      and every other field is stripped.
 *   3. EVIDENCE_READY exposes a metadata allowlist only:
 *      { coverage, freshness, publicSources }. Item internals, TripState, raw
 *      provider responses, broker diagnostics, and refresh keys never leave here.
 *   4. The itinerary hash published at ITINERARY_READY must survive to the
 *      terminal. A finalize that carries a DIFFERENT itinerary hash is refused
 *      (the model cannot use the prose phase to secretly alter the plan) and a
 *      bounded error is emitted instead — the changed plan never hits the wire.
 *   5. Nothing may be emitted after the terminal (seal).
 */

/** Canonical v2 event vocabulary — the single source of truth. */
const CANONICAL_EVENT = {
  RESPONSE_STARTED: 'response_started',
  PROGRESS: 'progress',
  EVIDENCE_READY: 'evidence_ready',
  ITINERARY_READY: 'itinerary_ready',
  CONTENT_DELTA: 'content_delta',
  CONTENT_RESET: 'content_reset',
  PROSE_READY: 'prose_ready',
  RESPONSE_FINALIZED: 'response_finalized',
  DISPLAY_CONTEXT: 'display_context',
  ERROR: 'error',
};

/** Legacy client vocabulary — preserved verbatim for existing clients. */
const LEGACY_EVENT = {
  THINKING: 'thinking',
  CHUNK: 'chunk',
  CONTENT_RESET: 'content_reset',
  DONE: 'done',
  STREAM_END: 'stream_end',
  ERROR: 'error',
};

/**
 * Product-level progress stages. Stable across model/provider changes — the user
 * sees "checking permits", never "trying Terra". This is the ENTIRE set that may
 * appear in a progress event; anything else is dropped.
 */
const PRODUCT_STAGE = {
  UNDERSTANDING_REQUEST: 'understanding_request',
  CHECKING_PARK_INFORMATION: 'checking_park_information',
  CHECKING_CURRENT_CONDITIONS: 'checking_current_conditions',
  CHECKING_PERMITS: 'checking_permits',
  CHECKING_TRANSPORT: 'checking_transport',
  BUILDING_ROUTE: 'building_route',
  BUILDING_ITINERARY: 'building_itinerary',
  VALIDATING_TRIP: 'validating_trip',
  WRITING_RESPONSE: 'writing_response',
  FINDING_PLACES: 'finding_places',
  CHECKING_WEATHER: 'checking_weather',
  CHECKING_SOURCES: 'checking_sources',
  LOCATING_PLACES: 'locating_places',
  CHECKING_ROUTES: 'checking_routes',
  SAVING_RESPONSE: 'saving_response',
  CHECKING_RESPONSE: 'checking_response',
};
const PRODUCT_STAGES = new Set(Object.values(PRODUCT_STAGE));

/**
 * Map the turn's INTERNAL stage strings (implementation names) to the canonical
 * product vocabulary. Legacy clients keep the verbatim internal string (their UI
 * copy is keyed on it); v2 clients get the product stage. Unknown → null (v2 drops).
 */
const INTERNAL_STAGE_TO_PRODUCT = {
  building_structured_itinerary: PRODUCT_STAGE.BUILDING_ITINERARY,
  validating_trip: PRODUCT_STAGE.VALIDATING_TRIP,
  writing_response: PRODUCT_STAGE.WRITING_RESPONSE,
  checking_response_matches_plan: PRODUCT_STAGE.CHECKING_RESPONSE,
};
function mapInternalStageToProduct(stage) {
  return INTERNAL_STAGE_TO_PRODUCT[stage] || null;
}

/** The only fields a client may ever see about evidence. */
const EVIDENCE_READY_ALLOWLIST = ['coverage', 'freshness', 'publicSources'];

/**
 * REFINEMENT TARGET — the one bounded widening of `progress`.
 *
 * Invariant #2 exists to keep MODEL AND PROVIDER IDENTITY out of progress. This
 * is neither: it is the traveler's own persisted plan content (a day number, a
 * daypart, a stop name they are looking at on screen), resolved deterministically
 * by `resolveRefinementScope` BEFORE any dispatch. It cannot carry a tier, a
 * model, an attempt count, or anything the model authored, because the only
 * producer reads the prior plan.
 *
 * It is allowlisted and range-checked here, in the same one-way projection style
 * as EVIDENCE_READY_ALLOWLIST, so a future caller cannot widen it by accident.
 */
const REFINEMENT_TARGET_ALLOWLIST = ['level', 'dayNumber', 'daypart', 'stopName'];
const REFINEMENT_SCOPE_LEVELS = new Set(['whole_plan', 'day', 'daypart', 'stop', 'route_leg']);
const REFINEMENT_DAYPARTS = new Set(['morning', 'afternoon', 'evening']);
const MAX_REFINEMENT_STOP_NAME = 80;
const MAX_REFINEMENT_DAY_NUMBER = 60;

/**
 * Project a refinement target down to bounded, well-typed presentation fields.
 * Returns null unless a usable `level` survives — a half-formed target must
 * produce generic copy, never a partial claim.
 */
function pickRefinementTarget(target) {
  if (!target || typeof target !== 'object') return null;
  const level = String(target.level || '').trim();
  if (!REFINEMENT_SCOPE_LEVELS.has(level)) return null;
  const dayNumber = Number(target.dayNumber);
  const daypart = String(target.daypart || '').trim();
  const stopName = String(target.stopName || '').replace(/\s+/g, ' ').trim();
  return {
    level,
    dayNumber: Number.isInteger(dayNumber) && dayNumber > 0 && dayNumber <= MAX_REFINEMENT_DAY_NUMBER
      ? dayNumber : null,
    daypart: REFINEMENT_DAYPARTS.has(daypart) ? daypart : null,
    stopName: stopName ? stopName.slice(0, MAX_REFINEMENT_STOP_NAME) : null,
  };
}

/**
 * Presentation compatibility metadata. Today's `thinking` events carry park
 * display fields the live streaming UI renders (photos, destination name). These
 * are NOT EvidenceBundle data: they are presentation context for the current
 * response, never authoritative evidence.
 *
 * Dialect handling:
 *   - LEGACY: folded into the `thinking` event exactly as today (unchanged wire).
 *   - v2 (WP10F-2): the canonical `response_started` / `evidence_ready` events
 *     stay minimal (display STRIPPED from them), and the display rides its own
 *     first-class `display_context` event instead. That keeps evidence_ready
 *     clean while giving v2 clients full presentation parity.
 *
 * This bag is itself allowlisted so nothing else can ride it, and BOTH dialects
 * use this one sanitizer — there is no second, looser path.
 */
const DISPLAY_COMPAT_ALLOWLIST = ['parkName', 'parkNames', 'parkImages'];

/** Project an optional display bag down to the allowlisted presentation keys. */
function pickDisplayCompat(display) {
  const safe = {};
  if (display && typeof display === 'object') {
    for (const k of DISPLAY_COMPAT_ALLOWLIST) {
      if (display[k] !== undefined) safe[k] = display[k];
    }
  }
  return safe;
}

/**
 * Is there anything presentation-worthy to show? A null parkName with empty
 * arrays is not — v2 must not emit an empty `display_context` for it.
 */
function displayIsMeaningful(safe) {
  return (
    safe.parkName != null ||
    (Array.isArray(safe.parkNames) && safe.parkNames.length > 0) ||
    (Array.isArray(safe.parkImages) && safe.parkImages.length > 0)
  );
}

const HASH_MISMATCH_CODE = 'revision_itinerary_hash_mismatch';

/**
 * @param {Object}   params
 * @param {'v2'|'legacy'} params.dialect  the connected client's dialect
 * @param {Function} params.emit          (payload) => void — the wire writer
 * @param {'stream'|'terminal'} [params.mode='stream']  streaming vs single-shot
 */
function createTrailieTransportAdapter({ dialect, emit, mode = 'stream' } = {}) {
  if (dialect !== 'v2' && dialect !== 'legacy') {
    throw new Error(`trailieTransportAdapter: unknown dialect "${dialect}"`);
  }
  if (typeof emit !== 'function') {
    throw new Error('trailieTransportAdapter: emit must be a function');
  }
  const isLegacy = dialect === 'legacy';
  const isTerminalMode = mode === 'terminal';

  let sealed = false;
  let sawContentDelta = false;
  let streamEnded = false;
  let publishedItineraryHash = null;
  let draftResponseId = null, draftSequence = 0, draftWithdrawn = false;

  const write = (payload) => { emit(payload); return true; };

  /** Intermediate (non-terminal) events: dropped once sealed or in terminal mode. */
  const intermediate = (fn) => {
    if (sealed || isTerminalMode) return false;
    return fn();
  };

  /**
   * WP10F-2 — promote the already-sanitized legacy display bag into a first-class
   * v2 `display_context` event. v2 only (legacy folds display into `thinking`),
   * and only when there is something presentation-worthy. Called from inside an
   * `intermediate(...)` body, so the seal / terminal-mode gates already applied.
   */
  const emitV2DisplayContext = (display) => {
    if (isLegacy) return;
    const safe = pickDisplayCompat(display);
    if (displayIsMeaningful(safe)) {
      write({ type: CANONICAL_EVENT.DISPLAY_CONTEXT, ...safe });
    }
  };

  return {
    dialect,
    mode,
    sentTerminal: () => sealed,

    draftStarted({ responseId }) {
      return intermediate(() => {
        if (draftResponseId) return false;
        draftResponseId = responseId;
        return write({ type: 'draft_started', responseId, sequence: ++draftSequence });
      });
    },
    draftDay({ day, index }) {
      return intermediate(() => {
        const safe = projectDraftDay(day, index);
        if (!draftResponseId || draftWithdrawn || !safe) return false;
        return write({ type: 'draft_day', responseId: draftResponseId, sequence: ++draftSequence, day: safe });
      });
    },
    draftWithdrawn() {
      return intermediate(() => {
        if (!draftResponseId || draftWithdrawn) return false;
        draftWithdrawn = true;
        return write({ type: 'draft_withdrawn', responseId: draftResponseId, sequence: ++draftSequence });
      });
    },

    responseStarted(payload = {}) {
      return intermediate(() => {
        if (isLegacy) return write({ type: LEGACY_EVENT.THINKING, sources: [], ...pickDisplayCompat(payload.display) });
        const ok = write({
          type: CANONICAL_EVENT.RESPONSE_STARTED,
          responseId: payload.responseId,
          requiresStructuredItinerary: payload.requiresStructuredItinerary ?? null,
        });
        emitV2DisplayContext(payload.display);
        return ok;
      });
    },

    progress({ stage, legacyStage, refinementTarget } = {}) {
      return intermediate(() => {
        const target = pickRefinementTarget(refinementTarget);
        if (isLegacy) {
          // Legacy keeps the verbatim internal stage its UI copy is keyed on.
          const s = legacyStage != null ? legacyStage : stage;
          if (s == null) return false;
          return write({
            type: LEGACY_EVENT.THINKING,
            stage: s,
            ...(target ? { refinementTarget: target } : {}),
          });
        }
        // v2: only the canonical product vocabulary, never an arbitrary or internal
        // label, and never model/provider identity (invariant #2).
        if (!PRODUCT_STAGES.has(stage)) return false;
        return write({
          type: CANONICAL_EVENT.PROGRESS,
          stage,
          ...(target ? { refinementTarget: target } : {}),
        });
      });
    },

    evidenceReady(meta = {}) {
      return intermediate(() => {
        const safe = {};
        for (const k of EVIDENCE_READY_ALLOWLIST) {
          if (meta[k] !== undefined) safe[k] = meta[k]; // invariant #3 — allowlist only
        }
        if (isLegacy) {
          return write({ type: LEGACY_EVENT.THINKING, sources: safe.publicSources || [], ...pickDisplayCompat(meta.display) });
        }
        const ok = write({ type: CANONICAL_EVENT.EVIDENCE_READY, ...safe });
        emitV2DisplayContext(meta.display);
        return ok;
      });
    },

    itineraryReady(outbound) {
      if (!outbound) return false;
      // Record the published hash for the invariant #4 gate regardless of dialect,
      // even though legacy stays terminal-only for plan payloads.
      const hash = outbound.response?.itineraryHash ?? null;
      if (hash != null) publishedItineraryHash = hash;
      return intermediate(() => {
        if (isLegacy) return false; // legacy is terminal-only for the plan
        return write({
          type: CANONICAL_EVENT.ITINERARY_READY,
          response: outbound.response,
          canonicalPlan: outbound.canonicalPlan,
        });
      });
    },

    contentDelta({ content } = {}) {
      return intermediate(() => {
        sawContentDelta = true;
        if (isLegacy) return write({ type: LEGACY_EVENT.CHUNK, content });
        return write({ type: CANONICAL_EVENT.CONTENT_DELTA, content });
      });
    },

    /** Clear only this turn's provisional prose after an internal rejection. */
    contentReset() {
      return intermediate(() => write({
        type: isLegacy ? LEGACY_EVENT.CONTENT_RESET : CANONICAL_EVENT.CONTENT_RESET,
      }));
    },

    /**
     * Legacy `stream_end` fires the moment content streaming completes — it flips
     * the legacy UI from "streaming" to "finalizing" BEFORE the terminal `done`,
     * so its timing is observable and must be preserved. v2 has no such event.
     * Idempotent, and only meaningful when content actually streamed.
     */
    contentStreamEnded() {
      if (sealed || isTerminalMode) return false;
      if (!isLegacy || !sawContentDelta || streamEnded) return false;
      streamEnded = true;
      return write({ type: LEGACY_EVENT.STREAM_END });
    },

    proseReady(outbound) {
      if (!outbound) return false;
      return intermediate(() => {
        if (isLegacy) return false; // legacy is terminal-only for the plan
        return write({
          type: CANONICAL_EVENT.PROSE_READY,
          response: outbound.response,
          canonicalPlan: outbound.canonicalPlan,
          expectedPreviousRevision: outbound.expectedPreviousRevision,
        });
      });
    },

    /**
     * THE terminal. First call wins and seals (invariant #1/#5). Enforces the
     * itinerary-hash succession (invariant #4) before anything reaches the wire.
     */
    responseFinalized(payload = {}) {
      if (sealed) return false;
      if (
        publishedItineraryHash != null &&
        payload.itineraryHash != null &&
        payload.itineraryHash !== publishedItineraryHash
      ) {
        // The plan changed between the published checkpoint and finalize. Never
        // emit the altered plan; emit a bounded error and seal instead.
        sealed = true;
        write({
          type: LEGACY_EVENT.ERROR,
          message: 'Could not finalize this response safely.',
          code: HASH_MISMATCH_CODE,
        });
        return false;
      }
      sealed = true;
      if (isTerminalMode) {
        // Non-stream JSON body. Legacy keeps today's `{ data: <envelope> }` shape;
        // v2 uses the canonical terminal envelope. No SSE, no stream_end.
        return write(isLegacy ? { data: payload } : { type: CANONICAL_EVENT.RESPONSE_FINALIZED, ...payload });
      }
      if (isLegacy) {
        // Backstop: if content streamed but the explicit stream_end was never
        // sent, emit it now so `done` is always preceded by a stream_end.
        if (sawContentDelta && !streamEnded) {
          streamEnded = true;
          write({ type: LEGACY_EVENT.STREAM_END });
        }
        return write({ type: LEGACY_EVENT.DONE, ...payload });
      }
      return write({ type: CANONICAL_EVENT.RESPONSE_FINALIZED, ...payload });
    },

    /** A terminal error. Bounded payload only; seals the adapter. */
    error(payload = {}) {
      if (sealed) return false;
      sealed = true;
      if (isTerminalMode) {
        // Non-stream JSON body. Legacy keeps the existing `{ error: message }` shape.
        return write(isLegacy ? { error: payload.message } : { type: LEGACY_EVENT.ERROR, ...payload });
      }
      return write({ type: LEGACY_EVENT.ERROR, ...payload });
    },
  };
}

/**
 * Translate a createEarlyEventEmitter typed payload into a transport adapter call.
 * The /chat-stream route uses this as earlyEvents' emit sink so earlyEvents keeps
 * its once-gating + timing while the adapter owns dialect serialization.
 */
function routeEarlyEventToTransport(transport, payload) {
  switch (payload && payload.type) {
    case CANONICAL_EVENT.RESPONSE_STARTED:
      return transport.responseStarted({
        responseId: payload.responseId,
        requiresStructuredItinerary: payload.requiresStructuredItinerary,
      });
    case CANONICAL_EVENT.ITINERARY_READY:
      return transport.itineraryReady({ response: payload.response, canonicalPlan: payload.canonicalPlan });
    case CANONICAL_EVENT.PROSE_READY:
      return transport.proseReady({
        response: payload.response,
        canonicalPlan: payload.canonicalPlan,
        expectedPreviousRevision: payload.expectedPreviousRevision,
      });
    // prose_generation_started has no canonical equivalent — the itinerary_ready
    // checkpoint plus the content stream already convey it. Dropped.
    default:
      return false;
  }
}

module.exports = {
  CANONICAL_EVENT,
  LEGACY_EVENT,
  routeEarlyEventToTransport,
  PRODUCT_STAGE,
  PRODUCT_STAGES,
  EVIDENCE_READY_ALLOWLIST,
  REFINEMENT_TARGET_ALLOWLIST,
  pickRefinementTarget,
  DISPLAY_COMPAT_ALLOWLIST,
  mapInternalStageToProduct,
  createTrailieTransportAdapter,
};
