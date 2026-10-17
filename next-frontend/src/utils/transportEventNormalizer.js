/**
 * WP10F-1 — web client transport normalizer.
 *
 * The server can now speak two SSE dialects (WP10B–E): the legacy vocabulary
 * every shipped client already understands, and the canonical v2 vocabulary.
 * This module is the client-side mirror of the server's transport adapter: it
 * takes ONE raw parsed SSE event from EITHER dialect and translates it into a
 * single normalized client-event vocabulary, so the existing React state
 * machinery (streaming text, thinking/progress copy, pendingParkImagesRef,
 * sources, itinerary revision handling, finalizing state, final response,
 * errors) never has to care which dialect produced the turn.
 *
 * Same principle we used server-side: REPLACE PROTOCOL PARSING FIRST — do not
 * rewrite UI/business behavior. This layer only feeds the existing behaviors.
 *
 * Deliberate non-goals for WP10F-1 (do NOT add here):
 *   - v2 park display imagery. `evidence_ready` is evidence, NOT presentation;
 *     this normalizer NEVER infers parkName/parkImages/parkNames from it. The
 *     first-class v2 presentation event (`display_context`) is WP10F-2. Until
 *     then, v2 mid-stream carries no display, and that is intentional.
 *   - the itinerary succession/hash guard. That stays in the early-revision
 *     coordinator; the normalizer only forwards itinerary_ready/prose_ready so
 *     the coordinator can enforce it exactly as it does for legacy.
 */

/** Normalized client-event vocabulary — the single layer the UI consumes. */
export const CLIENT_EVENT = Object.freeze({
  RESPONSE_STARTED: 'response_started',
  DISPLAY_CONTEXT: 'display_context',
  PROGRESS: 'progress',
  EVIDENCE: 'evidence',
  CONTENT_DELTA: 'content_delta',
  CONTENT_RESET: 'content_reset',
  ITINERARY_READY: 'itinerary_ready',
  PROSE_READY: 'prose_ready',
  STREAM_FINISHED: 'stream_finished',
  FINALIZED: 'finalized',
  ERROR: 'error',
});

/** Legacy wire vocabulary. */
const LEGACY = Object.freeze({
  THINKING: 'thinking',
  CHUNK: 'chunk',
  STREAM_END: 'stream_end',
  DONE: 'done',
  ERROR: 'error',
});

/** Canonical v2 wire vocabulary. */
const V2 = Object.freeze({
  RESPONSE_STARTED: 'response_started',
  DISPLAY_CONTEXT: 'display_context',
  PROGRESS: 'progress',
  EVIDENCE_READY: 'evidence_ready',
  ITINERARY_READY: 'itinerary_ready',
  CONTENT_DELTA: 'content_delta',
  CONTENT_RESET: 'content_reset',
  PROSE_READY: 'prose_ready',
  RESPONSE_FINALIZED: 'response_finalized',
  ERROR: 'error',
});

/**
 * v2 `progress` carries the stable PRODUCT stage vocabulary; the client's copy
 * table (`resolveThinkingStageCopy`) is keyed on the turn's INTERNAL stage
 * strings that legacy still carries verbatim. Map product → internal so the same
 * copy resolves for both dialects. This is the exact inverse of the server's
 * INTERNAL_STAGE_TO_PRODUCT. Product stages with no legacy copy pass through and
 * resolve to null — the same fallback legacy takes for an unknown stage.
 */
const PRODUCT_STAGE_TO_INTERNAL = Object.freeze({
  building_itinerary: 'building_structured_itinerary',
  validating_trip: 'validating_trip',
  writing_response: 'writing_response',
  checking_response: 'checking_response_matches_plan',
});

/**
 * Refinement target on a `progress` event — already allowlisted and
 * range-checked by the server adapter's `pickRefinementTarget`. Read defensively
 * here (shape only, no re-validation of values) so a malformed field degrades to
 * generic progress copy rather than throwing mid-stream.
 */
function refinementTargetOf(e) {
  const target = e && e.refinementTarget;
  if (!target || typeof target !== 'object' || typeof target.level !== 'string') return null;
  return {
    level: target.level,
    dayNumber: Number.isInteger(target.dayNumber) ? target.dayNumber : null,
    daypart: typeof target.daypart === 'string' ? target.daypart : null,
    stopName: typeof target.stopName === 'string' && target.stopName ? target.stopName : null,
  };
}

function hasDisplay(e) {
  return (
    (Array.isArray(e.parkImages) && e.parkImages.length > 0) ||
    e.parkName != null ||
    (Array.isArray(e.parkNames) && e.parkNames.length > 0)
  );
}

function displayEvent(e) {
  return {
    kind: CLIENT_EVENT.DISPLAY_CONTEXT,
    parkName: e.parkName ?? null,
    parkNames: Array.isArray(e.parkNames) ? e.parkNames : [],
    parkImages: Array.isArray(e.parkImages) ? e.parkImages : [],
  };
}

/**
 * A per-turn normalizer. Stateful only for the two invariants the client mirror
 * of the server seal requires:
 *   - `stream_finished` is emitted EXACTLY ONCE per turn, before the terminal,
 *     regardless of whether the dialect delivered a wire-level `stream_end`;
 *   - EXACTLY ONE terminal wins. A duplicate terminal, or any event after a
 *     terminal, is dropped — the same guarantee the server enforces on its side.
 *
 * @returns {{ normalize(raw: object): Array<object>, sealed(): boolean }}
 */
export function createTransportEventNormalizer() {
  let sealed = false;
  let streamFinished = false;

  /** Emit the one-shot stream-finished signal (CLIENT_STREAM_FINISHED). */
  const finishStream = (out) => {
    if (!streamFinished) {
      streamFinished = true;
      out.push({ kind: CLIENT_EVENT.STREAM_FINISHED });
    }
  };

  const seal = () => { sealed = true; };

  return {
    sealed: () => sealed,

    normalize(raw) {
      // Nothing may be normalized after a terminal (client-side seal), and a
      // non-object / typeless line is ignored exactly like the raw parser does.
      if (sealed || !raw || typeof raw !== 'object' || typeof raw.type !== 'string') {
        return [];
      }
      const out = [];

      switch (raw.type) {
        // ── Legacy ──────────────────────────────────────────────────────────
        case LEGACY.THINKING: {
          if (raw.stage != null) {
            out.push({
              kind: CLIENT_EVENT.PROGRESS,
              stage: raw.stage,
              refinementTarget: refinementTargetOf(raw),
            });
            break;
          }
          // A non-stage `thinking` carries sources and/or legacy display compat.
          if (hasDisplay(raw)) out.push(displayEvent(raw));
          out.push({
            kind: CLIENT_EVENT.EVIDENCE,
            sources: Array.isArray(raw.sources) ? raw.sources : [],
          });
          break;
        }
        case LEGACY.CHUNK:
          out.push({ kind: CLIENT_EVENT.CONTENT_DELTA, content: raw.content });
          break;
        case LEGACY.STREAM_END:
          finishStream(out);
          break;
        case LEGACY.DONE:
          finishStream(out); // backstop — legacy normally sends stream_end first
          out.push({ kind: CLIENT_EVENT.FINALIZED, payload: raw });
          seal();
          break;

        // ── Canonical v2 ────────────────────────────────────────────────────
        case V2.RESPONSE_STARTED:
          out.push({ kind: CLIENT_EVENT.RESPONSE_STARTED, responseId: raw.responseId ?? null });
          break;
        case V2.DISPLAY_CONTEXT:
          // First-class v2 presentation event (WP10F-2). Normalized to the SAME
          // shape legacy thinking-display folds to, so one UI display path serves
          // both dialects. `displayEvent` defaults missing/malformed keys cleanly.
          out.push(displayEvent(raw));
          break;
        case V2.PROGRESS:
          out.push({
            kind: CLIENT_EVENT.PROGRESS,
            stage: PRODUCT_STAGE_TO_INTERNAL[raw.stage] || raw.stage,
            refinementTarget: refinementTargetOf(raw),
          });
          break;
        case V2.EVIDENCE_READY:
          // Evidence ONLY. Never infer park display here — that is WP10F-2.
          out.push({
            kind: CLIENT_EVENT.EVIDENCE,
            sources: Array.isArray(raw.publicSources) ? raw.publicSources : [],
          });
          break;
        case V2.CONTENT_DELTA:
          out.push({ kind: CLIENT_EVENT.CONTENT_DELTA, content: raw.content });
          break;
        // Shared additive wire event: legacy and v2 use the same spelling.
        // It clears only provisional prose for this still-open turn.
        case V2.CONTENT_RESET:
          out.push({ kind: CLIENT_EVENT.CONTENT_RESET });
          break;
        case V2.ITINERARY_READY:
          out.push({
            kind: CLIENT_EVENT.ITINERARY_READY,
            response: raw.response,
            canonicalPlan: raw.canonicalPlan,
          });
          break;
        case V2.PROSE_READY:
          // Content streaming is done by the time prose_ready arrives.
          finishStream(out);
          out.push({
            kind: CLIENT_EVENT.PROSE_READY,
            response: raw.response,
            canonicalPlan: raw.canonicalPlan,
            expectedPreviousRevision: raw.expectedPreviousRevision,
          });
          break;
        case V2.RESPONSE_FINALIZED:
          finishStream(out); // v2 has no wire stream_end — synthesize the transition
          out.push({ kind: CLIENT_EVENT.FINALIZED, payload: raw });
          seal();
          break;

        // ── Shared ──────────────────────────────────────────────────────────
        case LEGACY.ERROR: // identical wire name for both dialects
          out.push({
            kind: CLIENT_EVENT.ERROR,
            message: raw.message ?? null,
            code: raw.code ?? null,
          });
          seal();
          break;

        default:
          // Unknown/observational-only events (e.g. prose_generation_started)
          // are ignored, exactly as an unrecognized legacy line would be.
          break;
      }

      return out;
    },
  };
}
