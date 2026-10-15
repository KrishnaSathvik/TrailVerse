export const draftPreviewEnabled = () => process.env.NODE_ENV === 'development'
  && process.env.NEXT_PUBLIC_TRAILIE_DRAFT_PREVIEW === 'true';

export const draftPreviewHeaders = () => draftPreviewEnabled() ? { 'x-trailie-draft-preview': '1' } : {};

// Ephemeral presentation only. Never passed to trip persistence or message history.
export function reduceDraftPreview(state, event) {
  if (event.type === 'draft_closed') return state ? { ...state, status: 'withdrawn', days: [] } : null;
  if (event.type === 'draft_started') {
    if (state || typeof event.responseId !== 'string' || event.sequence !== 1) return state;
    return { responseId: event.responseId, sequence: 1, status: 'generating', days: [] };
  }
  if (!state || state.status !== 'generating' || event.responseId !== state.responseId
    || !Number.isInteger(event.sequence) || event.sequence <= state.sequence) return state;
  if (event.sequence !== state.sequence + 1) return { ...state, status: 'withdrawn', days: [] };
  if (event.type === 'draft_withdrawn') return { ...state, sequence: event.sequence, status: 'withdrawn', days: [] };
  if (event.type !== 'draft_day') return state;
  const day = event.day;
  if (!day || day.index !== state.days.length || day.dayNumber !== day.index + 1
    || day.index >= 60 || !Array.isArray(day.activities)) return { ...state, status: 'withdrawn', days: [] };
  return { ...state, sequence: event.sequence, days: [...state.days, day] };
}
