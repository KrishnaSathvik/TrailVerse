/**
 * Travel query routing — principle-based, not phrase lists from individual chats.
 *
 * Grounded in common production patterns for travel copilots:
 * - Hybrid retrieval: owned/static data (NPS API, park catalog) for known entities;
 *   live web for open-ended, comparative, or time-sensitive questions.
 * - Open-ended destination questions need retrieval enrichment, not slot-filling menus.
 * - When the user names exactly one park, answer about that place; otherwise enrich.
 *
 * @see https://aws.amazon.com/blogs/machine-learning/build-real-time-travel-recommendations-using-ai-agents-on-amazon-bedrock/
 * @see https://knowledgesdk.com/blog/web-rag-vs-vector-rag
 */

const OFF_TOPIC_PATTERNS =
  /(write me|code|program|script|debug|compile|math|equation|calculate|homework|essay|summarize this article|translate|recipe|cook|stock|invest|crypto|bitcoin|medical|diagnos|symptom|legal advice|lawsuit|politics|election|celebrity|gossip|joke|riddle|poem|story|fiction|game|minecraft|fortnite|anime|movie review|song lyric)/i;

const TRAVEL_PATTERNS =
  /(park|trail|hike|camp|visit|trip|travel|itinerary|road trip|getaway|vacation|weekend|drive|fly|airport|hotel|lodge|cabin|tent|backpack|scenic|viewpoint|overlook|canyon|mountain|lake|river|waterfall|beach|forest|desert|glacier|wildlife|bear|elk|sunrise|sunset|star|astrophotography|photograph|permit|reservation|entry|fee|ranger|visitor center|campground|trailhead|shuttle|gear|boot|pack|map|route|weather|season|crowd|busy|quiet|relax|chill|somewhere|national|state park|wilderness|outdoor|adventure|explore|nature|forag|mushroom|morel|workshop|class|course|lesson|tour|excursion|activit|experience|fish|kayak|canoe|raft|climb|rappel|zipline|horseback|bike|cycling|bird|birding|snorkel|dive|surf|ski|snowshoe|swim|paddle|guided|instruction|versus|vs\.?|compare|between|first.?timer|beginner)/i;

const SPECIFIC_ITINERARY_PLAN_PATTERNS = [
  /\bplan\s+(a|my|our|the)\s+\d/i,
  /\bitinerary\b/i,
  /\bday\s+\d\b/i,
  /\b\d[\s-]*day\s+(trip|itinerary|visit|schedule)\b/i,
  /\b(hour.by.hour|morning.*afternoon.*evening)\b/i,
];

function normalizeMessage(message) {
  return typeof message === 'string' ? message.trim() : '';
}

function isOffTopic(message) {
  const text = normalizeMessage(message);
  return text.length > 0 && OFF_TOPIC_PATTERNS.test(text);
}

/**
 * @param {string} message
 * @returns {boolean}
 */
function isTravelRelated(message) {
  const text = normalizeMessage(message);
  if (!text) return false;
  if (isOffTopic(text)) return false;
  return TRAVEL_PATTERNS.test(text);
}

/**
 * User wants a structured multi-day plan (not "where should I go?").
 * @param {string} message
 * @returns {boolean}
 */
function isSpecificItineraryRequest(message) {
  const text = normalizeMessage(message);
  if (!text) return false;
  return SPECIFIC_ITINERARY_PLAN_PATTERNS.some((re) => re.test(text));
}

/**
 * Open-ended destination selection or comparison — inject ranked catalog + (logged-in) web.
 *
 * Principles:
 * - 0 parks named → user has not picked a place yet
 * - 2+ parks → compare / choose between options
 * - 1 park named → focused question about that site (use NPS/live data for that code)
 *
 * @param {string} message
 * @param {{ namedParkCount?: number }} [options]
 * @returns {boolean}
 */
function isOpenEndedDestinationQuery(message, options = {}) {
  const text = normalizeMessage(message);
  const namedParkCount = options.namedParkCount ?? 0;

  if (text.length < 8) return false;
  if (isSpecificItineraryRequest(text)) return false;

  // Compare / shortlist — catalog ranking helps even without generic travel keywords
  if (namedParkCount >= 2) return true;

  if (!isTravelRelated(text)) return false;
  if (namedParkCount === 0) return true;

  // Exactly one park: not open-ended destination picking
  return false;
}

/**
 * Inject ranked /api/parks/search results into the Trailie system prompt.
 * @param {string} message
 * @param {{ namedParkCount?: number }} [options]
 * @returns {boolean}
 */
function shouldInjectParkDiscovery(message, options = {}) {
  return isOpenEndedDestinationQuery(message, options);
}

/** @deprecated Use isOpenEndedDestinationQuery — kept for older tests/callers */
function isBroadDiscoveryQuery(message) {
  return isOpenEndedDestinationQuery(message, { namedParkCount: 0 });
}

/** @deprecated Alias */
function isOpenEndedTravelQuestion(message, options = {}) {
  return isOpenEndedDestinationQuery(message, options);
}

module.exports = {
  isTravelRelated,
  isOffTopic,
  isSpecificItineraryRequest,
  isOpenEndedDestinationQuery,
  shouldInjectParkDiscovery,
  isBroadDiscoveryQuery,
  isOpenEndedTravelQuestion,
};
