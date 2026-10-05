'use strict';

/**
 * Stage 14.5 — ONE interpretation of a persisted Trailie response.
 *
 * Restore, share and export previously each decided for themselves what a stored
 * assistant turn meant. With revisions that becomes three chances to disagree —
 * and the disagreement a user notices is a blank prose bubble where an itinerary
 * should be, or prose exported for a response whose itinerary hash moved.
 *
 * This resolver is pure and deliberately conservative: it never repairs
 * persisted corruption, it never rebuilds an itinerary from prose, and an
 * explicit revision it cannot fully validate becomes `invalid` rather than a
 * best guess.
 *
 * The browser has a byte-equivalent twin. `shared/trailieStoredPresentation.fixtures.json`
 * pins both — a divergence fails both suites.
 */

const PRESENTATION_STATE = {
  LEGACY_TERMINAL: 'legacy_terminal',
  ITINERARY_ONLY: 'itinerary_only',
  PROSE_COMPLETE: 'prose_complete',
  FALLBACK_COMPLETE: 'fallback_complete',
  INVALID: 'invalid',
};

/** Coarse, public-safe. NEVER the internal lifecycleStatus enum. */
const PUBLIC_NOTES_STATUS = {
  COMPLETE: 'complete',
  NOT_AVAILABLE: 'not_available',
};

const VIEWER_CONTEXT = {
  OWNER: 'owner',
  SHARED: 'shared',
  EXPORT: 'export',
};

/** Wording differs by surface: stored state is not proof anything is running. */
const NOTES_LABEL = {
  OWNER: 'Trip notes were not completed.',
  SHARED: 'Trip notes are not available yet.',
  EXPORT: 'Trip notes were not generated.',
};

function labelFor(viewerContext) {
  if (viewerContext === VIEWER_CONTEXT.SHARED) return NOTES_LABEL.SHARED;
  if (viewerContext === VIEWER_CONTEXT.EXPORT) return NOTES_LABEL.EXPORT;
  return NOTES_LABEL.OWNER;
}

const hasItinerary = (plan) => Boolean(plan && Array.isArray(plan.days) && plan.days.length > 0);

function invalid({ code, plan, viewerContext }) {
  return {
    state: PRESENTATION_STATE.INVALID,
    showItinerary: hasItinerary(plan),
    showProse: false,
    showEmptyAssistantBubble: false,
    showRecoveryAction: false,
    publicNotesStatus: PUBLIC_NOTES_STATUS.NOT_AVAILABLE,
    notesLabel: labelFor(viewerContext),
    content: null,
    lifecycleDiagnosticCode: code,
  };
}

/**
 * @param {Object} params
 * @param {Object} params.response            persisted assistant turn
 * @param {Object} params.canonicalPlan       persisted plan
 * @param {string} params.viewerContext       owner | shared | export
 * @param {boolean} params.recoveryCapability whether the server exposes recovery
 */
function deriveTrailieStoredPresentation({
  response,
  canonicalPlan = null,
  viewerContext = VIEWER_CONTEXT.OWNER,
  recoveryCapability = false,
} = {}) {
  const plan = canonicalPlan;
  const content = response?.content ?? '';
  const revision = response?.responseRevision;

  // ── Legacy: no explicit revision ────────────────────────────────────────
  // An old response with empty content is NOT revision 1. Persistence
  // normalizes a missing revision to terminal, and presentation must agree —
  // guessing here would offer "Generate trip notes" on responses that never had
  // a checkpoint.
  if (revision == null) {
    return {
      state: PRESENTATION_STATE.LEGACY_TERMINAL,
      showItinerary: hasItinerary(plan),
      showProse: content !== '',
      showEmptyAssistantBubble: false,
      showRecoveryAction: false,
      publicNotesStatus: PUBLIC_NOTES_STATUS.COMPLETE,
      notesLabel: null,
      content: content !== '' ? content : null,
      lifecycleDiagnosticCode: null,
    };
  }

  // ── Explicit revision 1 ─────────────────────────────────────────────────
  if (revision === 1) {
    if (response.lifecycleStatus !== 'itinerary_ready') {
      return invalid({ code: 'unsupported_lifecycle_status', plan, viewerContext });
    }
    if (content !== '') {
      return invalid({ code: 'revision_1_content_not_empty', plan, viewerContext });
    }
    if (!hasItinerary(plan)) {
      return invalid({ code: 'missing_canonical_plan', plan, viewerContext });
    }
    if (!response.itineraryHash || response.itineraryHash !== plan.itineraryHash) {
      return invalid({ code: 'itinerary_hash_mismatch', plan, viewerContext });
    }

    return {
      state: PRESENTATION_STATE.ITINERARY_ONLY,
      showItinerary: true,
      showProse: false,
      // Tool-first itinerary turns are a legitimate success without a prose phase.
      // Do not surface an incomplete-notes error label for settled revision 1.
      showEmptyAssistantBubble: false,
      // Owner-only optional recovery to generate notes later — not a failure state.
      showRecoveryAction: viewerContext === VIEWER_CONTEXT.OWNER && recoveryCapability === true,
      publicNotesStatus: PUBLIC_NOTES_STATUS.COMPLETE,
      notesLabel: null,
      content: null,
      lifecycleDiagnosticCode: null,
    };
  }

  // ── Explicit revision 2 ─────────────────────────────────────────────────
  if (revision === 2) {
    const status = response.lifecycleStatus;
    if (status !== 'prose_ready' && status !== 'fallback_complete') {
      return invalid({ code: 'unsupported_lifecycle_status', plan, viewerContext });
    }
    if (content === '') {
      return invalid({ code: 'revision_2_content_empty', plan, viewerContext });
    }
    // Prose may only be shown when it provably describes the stored itinerary.
    if (hasItinerary(plan) && response.itineraryHash !== plan.itineraryHash) {
      return invalid({ code: 'itinerary_hash_mismatch', plan, viewerContext });
    }

    return {
      // Fallback is a normal complete response — same layout, no error styling.
      state:
        status === 'fallback_complete'
          ? PRESENTATION_STATE.FALLBACK_COMPLETE
          : PRESENTATION_STATE.PROSE_COMPLETE,
      showItinerary: hasItinerary(plan),
      showProse: true,
      showEmptyAssistantBubble: false,
      showRecoveryAction: false,
      publicNotesStatus: PUBLIC_NOTES_STATUS.COMPLETE,
      notesLabel: null,
      content,
      lifecycleDiagnosticCode: null,
    };
  }

  return invalid({ code: 'unsupported_revision', plan, viewerContext });
}

module.exports = {
  PRESENTATION_STATE,
  PUBLIC_NOTES_STATUS,
  VIEWER_CONTEXT,
  NOTES_LABEL,
  deriveTrailieStoredPresentation,
};
