const { shouldInjectParkDiscovery } = require('./discoveryQuery');

/**
 * Only attach park photos when the user message calls for visuals or a focused
 * single-park plan — not for discovery lists, permits, closures, or casual chat.
 * @param {string} userMessage
 * @param {{ namedParkCount?: number }} [options]
 * @returns {boolean}
 */
function shouldAttachParkImages(userMessage, options = {}) {
  const text = (userMessage || '').trim();
  if (!text) return false;

  const namedParkCount = options.namedParkCount ?? 0;

  if (
    /\b(photos?|pictures?|images?|wallpapers?|what does .+ look like|show me (what|the)|scenic views?)\b/i.test(
      text
    )
  ) {
    return true;
  }

  if (shouldInjectParkDiscovery(text, { namedParkCount })) {
    return false;
  }

  if (
    /\b(permit|reservation|lottery|road\s+status|is .+ (open|closed)|closure|alert|hours?|entrance\s+fee|timed\s+entry|parking\s+lot|shuttle\s+schedule)\b/i.test(
      text
    )
  ) {
    return false;
  }

  if (
    namedParkCount === 1 &&
    /\b(itinerary|plan (?:a |my )?|day[\s-]?trip|weekend in|\d+[\s-]days? in|things to do in|what to see in|tell me about|first time in|worth visiting|overview of)\b/i.test(
      text
    )
  ) {
    return true;
  }

  return false;
}

module.exports = { shouldAttachParkImages };
