const { isValidToolItinerary } = require('./itineraryToolSchema');
const { extractItineraryJSON } = require('./extractItineraryJSON');

/**
 * Parse Anthropic message content blocks into prose text and optional tool itinerary.
 */
function parseClaudeMessageResponse(claudeResponse) {
  let textContent = '';
  let toolItinerary = null;

  for (const block of claudeResponse.content || []) {
    if (block.type === 'text') {
      textContent += block.text;
    }
    if (block.type === 'tool_use' && block.name === 'create_itinerary' && block.input) {
      if (isValidToolItinerary(block.input)) {
        toolItinerary = block.input;
      }
    }
  }

  return { textContent, toolItinerary };
}

/**
 * Resolve itinerary from tool call (primary) or legacy [ITINERARY_JSON] block (fallback).
 */
function extractItineraryFromResponse({ content, toolItinerary = null }) {
  if (toolItinerary && isValidToolItinerary(toolItinerary)) {
    const { cleanContent } = extractItineraryJSON(content || '');
    return {
      cleanContent,
      itineraryData: toolItinerary,
      extractionSource: 'tool_use',
    };
  }

  const legacy = extractItineraryJSON(content || '');
  return {
    ...legacy,
    extractionSource: legacy.itineraryData ? 'itinerary_json' : null,
  };
}

module.exports = {
  parseClaudeMessageResponse,
  extractItineraryFromResponse,
};
