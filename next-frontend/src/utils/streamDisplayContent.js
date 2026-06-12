/**
 * Hide [ITINERARY_JSON] blocks while tokens stream so the UI matches post-processed text.
 */
export function stripItineraryJsonForDisplay(content) {
  if (!content || typeof content !== 'string') return content || '';

  const withoutClosed = content
    .replace(/\[ITINERARY_JSON\][\s\S]*?\[\/ITINERARY_JSON\]/g, '')
    .replace(/\n{3,}/g, '\n\n');

  const openIdx = withoutClosed.lastIndexOf('[ITINERARY_JSON]');
  if (openIdx !== -1) {
    return withoutClosed.slice(0, openIdx).replace(/\n{3,}/g, '\n\n').trimEnd();
  }

  return withoutClosed;
}
