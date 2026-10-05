/**
 * Stage 14.3 — how a revision becomes visible in the conversation.
 *
 * The rule that prevents every duplicate-turn bug here:
 *
 *     one responseId → one assistant turn → one canonical plan
 *
 * Revision 1 creates the assistant shell and the plan; revision 2 UPDATES that
 * same shell. Revision 2 structurally cannot touch the itinerary — the stored
 * plan object and hash are carried over by reference, so the card cannot remount
 * and cannot silently change under a user who is already reading it.
 */

/**
 * Legacy label kept for tests that assert the old recovery chrome.
 * Settled itinerary-only turns no longer show a pending/incomplete notes label.
 */
export const STORED_PROSE_PENDING_LABEL = 'Trip notes pending';

const findByResponseId = (messages, responseId) =>
  messages.findIndex((m) => m.role === 'assistant' && m.responseId === responseId);

/**
 * Stage 14.7F1 — persisted conversation ids are numeric (`TripPlan.conversation`
 * declares `id: Number`), and every ordinary message already uses `Date.now()`.
 * The revision-1 shell previously used `response-${responseId}`, which the
 * schema rejected outright, so a new trip could never be created from
 * `itinerary_ready`.
 *
 * The numeric id is a storage detail only. Canonical assistant identity remains
 * `responseId`, and UI keying must continue to use it — the number here is
 * deliberately NOT derived from `responseId` (no truncation, no hashing), so
 * nothing can come to depend on a relationship between the two.
 */
const allocateNumericMessageId = (messages) => {
  const taken = new Set(
    messages.map((m) => m?.id).filter((id) => typeof id === 'number' && Number.isFinite(id))
  );
  let candidate = Date.now();
  // Same-millisecond turns would otherwise collide within one conversation.
  while (taken.has(candidate)) candidate += 1;
  return candidate;
};

/**
 * Insert (or update) the single assistant turn for this response. Called only
 * after revision 1 is durable, so what appears is always already recoverable.
 */
export function upsertItineraryTurn(messages, effect) {
  const { response, canonicalPlan } = effect;
  const existingIndex = findByResponseId(messages, effect.responseId);

  const shell = {
    role: 'assistant',
    content: '',
    responseId: effect.responseId,
    responseVersion: effect.responseVersion,
    responseRevision: 1,
    lifecycleStatus: response?.lifecycleStatus || 'itinerary_ready',
    contentHash: response?.contentHash ?? null,
    itineraryHash: effect.itineraryHash,
    // The persisted plan, kept by reference so the card key is stable.
    itineraryPlan: canonicalPlan,
    ...(response?.travelLogistics ? { travelLogistics: response.travelLogistics } : {}),
    ...(response?.responseArtifacts ? { responseArtifacts: response.responseArtifacts } : {}),
    ...(response?.intent ? { intent: response.intent } : {}),
    ...(response?.presentation ? { presentation: response.presentation } : {}),
    hasItinerary: true,
    pendingProse: true,
    pendingProseLabel: null,
    provider: response?.provider ?? null,
    model: response?.model ?? null,
    isStreaming: false,
    isFinalizing: false,
  };

  if (existingIndex >= 0) {
    const next = messages.slice();
    next[existingIndex] = { ...next[existingIndex], ...shell };
    return next;
  }

  // A live streaming placeholder for this same turn is replaced, never kept
  // beside the durable turn — that would show the user two assistant messages.
  const placeholderIndex = messages.findIndex(
    (m) => m.role === 'assistant' && !m.responseId && (m.isStreaming || m.isFinalizing)
  );
  const base = placeholderIndex >= 0 ? messages.filter((_, i) => i !== placeholderIndex) : messages;
  const placeholder = placeholderIndex >= 0 ? messages[placeholderIndex] : null;

  // Reuse the placeholder's id only when it is already numeric; a transient
  // string id (`err-…`, `guest-limit-…`) must never become a persisted id.
  const placeholderId = typeof placeholder?.id === 'number' ? placeholder.id : null;

  return [
    ...base,
    {
      id: placeholderId ?? allocateNumericMessageId(base),
      timestamp: placeholder?.timestamp ?? new Date(),
      parkImages: placeholder?.parkImages || [],
      ...shell,
    },
  ];
}

/**
 * Fill the prose of an existing assistant turn. Never appends: if the turn is
 * missing, the revision-2 write had nothing to update and the list is returned
 * unchanged rather than growing a second message.
 */
export function updateProseTurn(messages, effect) {
  const index = findByResponseId(messages, effect.responseId);
  if (index < 0) return messages;

  const existing = messages[index];
  const next = messages.slice();
  const content = effect.content ?? '';
  const lifecycle = effect.response?.lifecycleStatus || null;
  const isProseSuccessor = effect.forceRevision2 === true
    || lifecycle === 'prose_ready'
    || lifecycle === 'fallback_complete'
    || effect.responseRevision === 2;

  // Revision-1 itinerary-only finalize (including terminals that carry display
  // text from content_delta): clear pending chrome and stay on revision 1.
  // Only a real prose_ready/fallback_complete successor may become revision 2.
  if (existing.responseRevision === 1 && !isProseSuccessor) {
    next[index] = {
      ...existing,
      ...(effect.response?.travelLogistics
        ? { travelLogistics: effect.response.travelLogistics }
        : {}),
      ...(effect.response?.responseArtifacts
        ? { responseArtifacts: effect.response.responseArtifacts }
        : {}),
      ...(effect.response?.intent ? { intent: effect.response.intent } : {}),
      ...(effect.response?.presentation ? { presentation: effect.response.presentation } : {}),
      pendingProse: false,
      pendingProseLabel: null,
      isStreaming: false,
      isFinalizing: false,
      lifecycleStatus: existing.lifecycleStatus || 'itinerary_ready',
    };
    return next;
  }

  if (content === '' && existing.responseRevision === 1 && effect.forceRevision2 !== true) {
    next[index] = {
      ...existing,
      pendingProse: false,
      pendingProseLabel: null,
      isStreaming: false,
      isFinalizing: false,
      lifecycleStatus: existing.lifecycleStatus || 'itinerary_ready',
    };
    return next;
  }

  next[index] = {
    ...existing,
    content,
    responseRevision: 2,
    lifecycleStatus: lifecycle || 'prose_ready',
    contentHash: effect.response?.contentHash ?? existing.contentHash,
    // Itinerary identity is taken from the STORED turn, never from the successor.
    itineraryHash: existing.itineraryHash,
    itineraryPlan: existing.itineraryPlan,
    travelLogistics: effect.response?.travelLogistics ?? existing.travelLogistics,
    responseArtifacts: effect.response?.responseArtifacts ?? existing.responseArtifacts,
    intent: effect.response?.intent ?? existing.intent,
    presentation: effect.response?.presentation ?? existing.presentation,
    pendingProse: false,
    pendingProseLabel: null,
    isStreaming: false,
    isFinalizing: false,
  };
  return next;
}

/** Presentation-only label. Never persisted, never canonical content. */
export function applyPendingLabel(messages, { responseId, label }) {
  const index = findByResponseId(messages, responseId);
  if (index < 0) return messages;

  const next = messages.slice();
  next[index] = { ...next[index], pendingProseLabel: label };
  return next;
}

/**
 * How to render an assistant turn — including one restored from the server.
 *
 * A stored revision 1 (`content: ''`, `lifecycleStatus: itinerary_ready`) must
 * show its persisted itinerary and never an empty bubble. Live in-flight
 * `pendingProseLabel` (e.g. "Preparing trip notes…") may still show; settled
 * itinerary-only success has no incomplete-notes chrome.
 */
export function resolveAssistantPresentation(message) {
  const isPendingRevisionOne =
    message?.responseRevision === 1 &&
    message?.lifecycleStatus === 'itinerary_ready' &&
    (message?.content ?? '') === '';

  if (!isPendingRevisionOne) {
    return { showProseBubble: true, pendingLabel: null };
  }

  return {
    showProseBubble: false,
    pendingLabel: message.pendingProseLabel || null,
  };
}
