/**
 * Hide [ITINERARY_JSON] blocks while tokens stream so the UI matches post-processed text.
 */
export function stripItineraryJsonForDisplay(content) {
  if (!content || typeof content !== 'string') return content || '';

  let output = content
    .replace(/\[ITINERARY_JSON\][\s\S]*?\[\/ITINERARY_JSON\]/gi, '')
    .replace(/\n{3,}/g, '\n\n');

  const openIdx = output.toUpperCase().lastIndexOf('[ITINERARY_JSON]');
  if (openIdx !== -1) {
    output = output.slice(0, openIdx);
  }

  return output.replace(/\n{3,}/g, '\n\n').trimEnd();
}
