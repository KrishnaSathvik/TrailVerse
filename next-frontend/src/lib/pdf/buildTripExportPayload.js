import {
  VIEWER_CONTEXT,
  deriveTrailieStoredPresentation,
} from '@/utils/trailieStoredPresentation';
import { exportPublicPlan, PUBLIC_PLAN_FIELDS } from '@/lib/publicItineraryExport.mjs';

/**
 * Stage 14.5 §7 — what an export is allowed to contain.
 *
 * Export goes through the SAME stored-presentation resolver as restore and
 * share, so a revision-1 trip exports as a complete itinerary with a bounded
 * label rather than a document with a blank "Trip notes" section.
 *
 * The plan body uses the shared public export boundary (`exportPublicPlan`) —
 * Architecture Lock Step 7 — so PDF, share, Demo, and Samples do not diverge.
 */

function sanitizePlanForExport(plan) {
  if (!plan || typeof plan !== 'object') return null;
  return exportPublicPlan(plan, { requireDays: false });
}

/** The latest assistant turn is what determines the notes state. */
function latestAssistant(conversation = []) {
  const assistants = conversation.filter((m) => m?.role === 'assistant');
  return assistants[assistants.length - 1] || null;
}

/**
 * @returns {{plan: Object|null, notesStatus: string, notesLabel: string|null, exportable: boolean}}
 */
export function buildTripExportPayload({ plan, conversation = [] } = {}) {
  const presentation = deriveTrailieStoredPresentation({
    response: latestAssistant(conversation) || { role: 'assistant', content: '' },
    canonicalPlan: plan,
    viewerContext: VIEWER_CONTEXT.EXPORT,
    recoveryCapability: false,
  });

  return {
    plan: sanitizePlanForExport(plan),
    notesStatus: presentation.publicNotesStatus,
    // Rendered as a small bounded line; absent once notes exist.
    notesLabel: presentation.showProse ? null : presentation.notesLabel,
    exportable: presentation.showItinerary,
  };
}

export { PUBLIC_PLAN_FIELDS };
