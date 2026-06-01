/**
 * Detect broad park-discovery questions (no specific park named).
 * Used by Trailie chat to inject ranked /api/parks/search results.
 */

const DISCOVERY_PATTERNS = [
  /\b(best|top|good|great|favorite|favourite)\s+parks?\b/i,
  /\bparks?\s+for\b/i,
  /\b(recommend|suggest|find|show|list)\b.{0,40}\bparks?\b/i,
  /\bwhich\s+parks?\b/i,
  /\bwhere\s+should\s+(i|we)\s+go\b/i,
  /\bplaces?\s+to\s+visit\b/i,
  /\bromantic\b/i,
  /\bcouples?\b/i,
  /\bhoneymoon\b/i,
  /\b(ocean|beach|coast|coastal)\b/i,
  /\b(waterfall|waterfalls)\b/i,
  /\b(sunset|sunrise)\b/i,
  /\b(wildlife|birding)\b/i,
  /\b(winter|snow)\b/i,
  /\b(photography|photo|photos)\b/i,
  /\b(camping|campground)\b/i,
  /\b(hiking|hikes|trails?)\b/i,
  /\b(quiet|peaceful|relaxing|calm)\b/i,
  /\b(first\s*time|beginners?)\b/i,
  /\b(family.friendly|kid.friendly|with\s+kids)\b/i,
  /\bnature\b.{0,30}\b(vibes|relax)/i,
  /\b(scenic\s+drive|scenic\s+drives)\b/i,
  /\b(less\s+crowded|uncrowded|not\s+crowded)\b/i,
];

/** Skip discovery ranking when user wants a full plan for one place. */
const SPECIFIC_PLAN_PATTERNS = [
  /\bplan\s+(a|my|our|the)\s+\d/i,
  /\bitinerary\b/i,
  /\bday\s+\d\b/i,
  /\b\d[\s-]*day\s+(trip|itinerary|visit)\b/i,
];

/**
 * @param {string} message
 * @returns {boolean}
 */
function isBroadDiscoveryQuery(message) {
  if (!message || typeof message !== 'string') return false;
  const trimmed = message.trim();
  if (trimmed.length < 10) return false;

  if (SPECIFIC_PLAN_PATTERNS.some((re) => re.test(trimmed))) {
    return false;
  }

  return DISCOVERY_PATTERNS.some((re) => re.test(trimmed));
}

module.exports = {
  isBroadDiscoveryQuery,
};
