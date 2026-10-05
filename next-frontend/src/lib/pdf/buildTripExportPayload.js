import {
  VIEWER_CONTEXT,
  deriveTrailieStoredPresentation,
} from '@/utils/trailieStoredPresentation';

/**
 * Stage 14.5 §7 — what an export is allowed to contain.
 *
 * Export goes through the SAME stored-presentation resolver as restore and
 * share, so a revision-1 trip exports as a complete itinerary with a bounded
 * label rather than a document with a blank "Trip notes" section.
 *
 * The export path has always been plan-only, and stays that way: this builder
 * carries the canonical plan and a label, never conversation prose, never
 * revision/lease/provider internals, and it never triggers prose recovery.
 */

/**
 * Stage 14.7F5 §11 — ALLOWLIST, mirrored from the server's
 * `utils/planProjection.js` (parity is asserted by the export tests).
 *
 * This was a denylist of known-internal keys, which meant any field added to the
 * canonical plan later would be exported automatically. Now a key survives only
 * by being named here.
 */
const PUBLIC_PLAN_FIELDS = [
  'type',
  'version',
  'generatedAt',
  'createdFrom',
  'parkName',
  'parkCode',
  'days',
  'totalDays',
  'highlights',
  'packingList',
  'permits',
  'estimatedCost',
  'feasibilityIssues',
];

function sanitizePlanForExport(plan) {
  if (!plan || typeof plan !== 'object') return null;
  const out = {};
  for (const field of PUBLIC_PLAN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(plan, field)) out[field] = plan[field];
  }
  return out;
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
