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

  // Head-to-head compare (2+ parks named) uses live NPS per park — not catalog discovery
  if (namedParkCount >= 2) return false;

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

/**
 * User named 2+ parks and wants a pick between them (not open-ended "where should I go?").
 * @param {string} message
 * @param {number} [namedParkCount]
 * @returns {boolean}
 */
function isHeadToHeadCompareQuery(message, namedParkCount = 0) {
  const text = normalizeMessage(message);
  if (namedParkCount < 2 || text.length < 8) return false;
  return /\b(versus|vs\.?|compare|comparison|between|which\s+(one|is\s+better|park)|better\s+for|or\s+\w+.*\bor\b)\b/i.test(
    text
  );
}

/** @deprecated Use isOpenEndedDestinationQuery — kept for older tests/callers */
function isBroadDiscoveryQuery(message) {
  return isOpenEndedDestinationQuery(message, { namedParkCount: 0 });
}

/** @deprecated Alias */
function isOpenEndedTravelQuestion(message, options = {}) {
  return isOpenEndedDestinationQuery(message, options);
}

function getConversationTurns(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.filter((m) => m.role === 'user' || m.role === 'assistant');
}

function findPriorDiscoveryUserQuery(messages) {
  const turns = getConversationTurns(messages);
  for (let i = turns.length - 2; i >= 0; i -= 1) {
    if (turns[i].role !== 'user') continue;
    const text = turns[i].content || '';
    if (isOpenEndedDestinationQuery(text, { namedParkCount: 0 })) {
      return text;
    }
  }
  return null;
}

function getPriorAssistantMessage(messages) {
  const turns = getConversationTurns(messages);
  const lastUserIdx = turns.findLastIndex((m) => m.role === 'user');
  if (lastUserIdx <= 0) return '';
  for (let i = lastUserIdx - 1; i >= 0; i -= 1) {
    if (turns[i].role === 'assistant') return turns[i].content || '';
    if (turns[i].role === 'user') break;
  }
  return '';
}

function looksLikeNewDiscoveryQuestion(message) {
  const text = normalizeMessage(message);
  if (!text) return false;
  return (
    /\b(best|which|top|recommend|suggest|ideas? for)\b/i.test(text) &&
    /\b(national\s+)?parks?\b/i.test(text)
  );
}

function userMessageHasRefinementConstraints(message) {
  const text = normalizeMessage(message);
  if (text.length < 4) return false;
  const lower = text.toLowerCase();
  if (/\b\d+\s*(-)?\s*days?\b/.test(lower)) return true;
  if (/\b(weekend|long weekend|a week|one week|10 days|two weeks)\b/.test(lower)) return true;
  if (
    /\b(fly|flying|flight|flights|road\s*trip|drive\s+only|driving\s+only|okay\s+with\s+flying|open\s+to\s+flying|prefer\s+not\s+to\s+fly|no\s+flights?)\b/.test(
      lower
    )
  ) {
    return true;
  }
  if (/\b(solo|just me|couple|two of us|family|with kids|group of)\b/.test(lower)) return true;
  if (/\b(from|near|based in|starting (from|in)|live in|i'?m in|we'?re in)\s+[a-z]/i.test(text)) {
    return true;
  }
  return false;
}

/**
 * User answered logistics after an open-ended discovery answer (location, days, fly/drive).
 * @param {Array<{ role: string, content?: string }>} messages
 * @returns {boolean}
 */
function isDiscoveryRefinementReply(messages) {
  if (!Array.isArray(messages) || messages.length < 3) return false;

  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  if (!userMessageHasRefinementConstraints(lastUser)) return false;
  if (looksLikeNewDiscoveryQuestion(lastUser)) return false;
  if (isSpecificItineraryRequest(lastUser)) return false;

  const priorDiscoveryQuery = findPriorDiscoveryUserQuery(messages);
  if (!priorDiscoveryQuery) return false;

  const priorAssistant = getPriorAssistantMessage(messages);
  if (!priorAssistant || priorAssistant.length < 100) return false;

  return true;
}

/**
 * @param {Array<{ role: string, content?: string }>} messages
 * @returns {string|null}
 */
function buildDiscoverySearchQuery(messages) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  if (isDiscoveryRefinementReply(messages)) {
    const prior = findPriorDiscoveryUserQuery(messages);
    if (prior) {
      return `${prior} ${lastUser}`.trim().slice(0, 200);
    }
  }
  return lastUser.trim().slice(0, 200);
}

module.exports = {
  isTravelRelated,
  isOffTopic,
  isSpecificItineraryRequest,
  isOpenEndedDestinationQuery,
  shouldInjectParkDiscovery,
  isHeadToHeadCompareQuery,
  isBroadDiscoveryQuery,
  isOpenEndedTravelQuestion,
  isDiscoveryRefinementReply,
  findPriorDiscoveryUserQuery,
  buildDiscoverySearchQuery,
  userMessageHasRefinementConstraints,
};
