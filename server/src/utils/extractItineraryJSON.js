/**
 * Extracts and strips the [ITINERARY_JSON] block from AI response content.
 * Returns clean content (for frontend) and structured itinerary data (for DB).
 */
function extractItineraryJSON(content) {
  if (!content || typeof content !== 'string') {
    return { cleanContent: content, itineraryData: null };
  }

  const match = content.match(/\[ITINERARY_JSON\]([\s\S]*?)\[\/ITINERARY_JSON\]/);
  if (!match) {
    return { cleanContent: content, itineraryData: null };
  }

  // Strip the block from content regardless of parse success
  const cleanContent = content
    .replace(/\[ITINERARY_JSON\][\s\S]*?\[\/ITINERARY_JSON\]/, '')
    .replace(/\n{3,}/g, '\n\n')  // collapse extra blank lines left behind
    .trim();

  try {
    const itineraryData = JSON.parse(match[1].trim());
    return { cleanContent, itineraryData };
  } catch (err) {
    console.warn('[extractItineraryJSON] Failed to parse JSON block:', err.message);
    return { cleanContent, itineraryData: null };
  }
}

module.exports = { extractItineraryJSON };
