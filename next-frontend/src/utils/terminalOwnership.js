import { upsertItineraryTurn, updateProseTurn, applyPendingLabel } from './earlyRevisionMessages';

/** Text accompanying a canonical plan is presentation, unless the envelope
 * explicitly identifies a prose successor. Display text alone is not a revision.
 * The coordinator resolves this once before persistence and retains the decision
 * for reveal. Text-only responses continue through the legacy terminal path.
 */
export function resolveTerminalOwnership(done = {}) {
  const lifecycle = done.lifecycleStatus || done.response?.lifecycleStatus;
  const revision = done.responseRevision ?? done.response?.responseRevision;
  const successor = revision !== 1 && (lifecycle === 'prose_ready' || lifecycle === 'fallback_complete'
    || (revision === 2 && lifecycle !== 'itinerary_ready'));
  return Object.freeze({
    ownership: successor || !done.canonicalPlan ? 'prose_successor' : 'itinerary_only',
    done,
  });
}

/** The same projection is used for the saved conversation and the live view. */
export function applyTerminalOwnership(messages, decision) {
  const { done, ownership } = decision;
  const existing = messages.find(m => m.role === 'assistant' && m.responseId === done.responseId);
  const response = {
    ...done,
    ...(ownership === 'itinerary_only'
      ? { lifecycleStatus: 'itinerary_ready' }
      : { lifecycleStatus: done.lifecycleStatus || done.response?.lifecycleStatus || 'prose_ready' }),
  };
  const turn = {
    responseId: done.responseId,
    responseVersion: done.responseVersion,
    itineraryHash: done.itineraryHash,
    response,
    canonicalPlan: done.canonicalPlan,
  };
  if (!done.canonicalPlan) {
    // A direct text answer has no itinerary revision to promote. Usually the
    // coordinator routes it to legacyTerminal before this helper is needed.
    return upsertItineraryTurn(messages, turn).map(message => message.responseId === done.responseId ? {
      ...message,
      content: done.content ?? '',
      responseRevision: done.responseRevision,
      lifecycleStatus: done.lifecycleStatus,
      itineraryPlan: null,
      hasItinerary: false,
      pendingProse: false,
    } : message);
  }
  if (ownership === 'itinerary_only' && existing?.responseRevision === 1 && existing.itineraryPlan) {
    // Preserve the durable identity/plan; only additive presentation metadata
    // and transient pending chrome can change on a no-op terminal settlement.
    const settled = messages.map(m => m === existing ? {
      ...m,
      ...Object.fromEntries(['travelLogistics', 'responseArtifacts', 'intent', 'presentation']
        .filter(key => done[key] != null).map(key => [key, done[key]])),
    } : m);
    return applyPendingLabel(settled, { responseId: done.responseId, label: null });
  }
  return updateProseTurn(upsertItineraryTurn(messages, turn), {
    ...turn,
    content: ownership === 'prose_successor' ? done.content ?? '' : '',
    responseRevision: ownership === 'prose_successor' ? 2 : 1,
  });
}
