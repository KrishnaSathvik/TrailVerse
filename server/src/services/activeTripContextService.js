'use strict';

const { extractAllParksFromMessage } = require('../utils/parkExtractor');
const { isShortFollowUp } = require('./trailieFetchPlanner');

const PARK_SWITCH_PATTERNS =
  /\b(actually|instead|rather|switch|change to|let'?s do|go with|prefer|rather than|not\s+\w+\s+but|move to|plan for)\b/i;

const ORDINAL_PICK_RULES = [
  { re: /\b(first|1st|top|#1)\b/i, index: 0 },
  { re: /\b(second|2nd|#2|middle one)\b/i, index: 1 },
  { re: /\b(third|3rd|#3)\b/i, index: 2 },
  { re: /\b(fourth|4th|#4)\b/i, index: 3 },
];

const FOLLOW_UP_NEEDS_DESTINATION =
  /\b(restaurant|restaurants|hotel|hotels|permit|permits|stay|lodging|shuttle|campground|weather|restaurants?)\b/i;

function toPrimaryDestination(entry) {
  if (!entry) return null;
  const name = entry.parkName || entry.name || null;
  if (!name && !entry.parkCode) return null;

  return {
    name: name || entry.parkCode,
    parkCode: entry.parkCode || null,
    type: entry.type || (entry.parkCode ? 'nps' : 'unknown'),
    lat: entry.lat ?? null,
    lon: entry.lon ?? null,
    source: entry.source || 'unknown',
    confidence: entry.confidence || 'medium',
  };
}

function destinationToExtractedPark(dest) {
  if (!dest) return null;
  return {
    parkCode: dest.parkCode || null,
    parkName: dest.name,
    lat: dest.lat ?? null,
    lon: dest.lon ?? null,
  };
}

function enrichDestinationWithParkCode(dest) {
  if (!dest || dest.parkCode) return dest;
  const parks = extractAllParksFromMessage(dest.name || '');
  if (parks.length === 0) return dest;
  return {
    ...dest,
    name: parks[0].parkName || dest.name,
    parkCode: parks[0].parkCode,
    lat: parks[0].lat ?? dest.lat ?? null,
    lon: parks[0].lon ?? dest.lon ?? null,
    type: 'nps',
    confidence: 'high',
  };
}

function extractRecommendationListFromMessages(filteredMessages = []) {
  const list = [];
  const seen = new Set();

  for (let i = filteredMessages.length - 1; i >= 0; i -= 1) {
    const msg = filteredMessages[i];
    if (msg?.role !== 'assistant' || !msg.content) continue;

    const numberedMatches = [
      ...msg.content.matchAll(
        /(?:^|\n)\s*(?:\d+[.)]|[-*])\s+([A-Z][^\n:]{3,70}(?:National Park|National Monument|State Park)?)/g
      ),
    ];
    for (const match of numberedMatches) {
      const rawName = match[1]?.trim();
      if (!rawName) continue;
      const key = rawName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.unshift(
        enrichDestinationWithParkCode({
          name: rawName,
          source: 'assistant_numbered',
          confidence: 'medium',
        })
      );
    }

    const parks = extractAllParksFromMessage(msg.content);
    for (const park of parks) {
      const key = (park.parkCode || park.parkName).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.unshift(
        enrichDestinationWithParkCode({
          name: park.parkName,
          parkCode: park.parkCode,
          lat: park.lat,
          lon: park.lon,
          type: 'nps',
          source: 'assistant_park_extractor',
          confidence: park.parkCode ? 'high' : 'medium',
        })
      );
    }

    if (list.length >= 6) break;
  }

  return list.slice(0, 6);
}

function isParkSwitchMessage(userMessage, storedPrimary = null) {
  if (!userMessage) return false;
  const parks = extractAllParksFromMessage(userMessage);
  if (parks.length === 0) return false;
  if (PARK_SWITCH_PATTERNS.test(userMessage)) return true;
  if (storedPrimary?.parkCode && parks[0].parkCode && parks[0].parkCode !== storedPrimary.parkCode) {
    return true;
  }
  if (storedPrimary?.name && parks[0].parkName) {
    const prev = storedPrimary.name.toLowerCase();
    const next = parks[0].parkName.toLowerCase();
    if (prev !== next && !prev.includes(next) && !next.includes(prev)) {
      return /\b(switch|instead|actually|change|let'?s)\b/i.test(userMessage);
    }
  }
  return false;
}

function resolveOrdinalOrNamedPick(userMessage, lastRecommendationList = []) {
  if (!userMessage || lastRecommendationList.length === 0) return null;

  for (const rule of ORDINAL_PICK_RULES) {
    if (rule.re.test(userMessage) && lastRecommendationList[rule.index]) {
      return enrichDestinationWithParkCode({
        ...lastRecommendationList[rule.index],
        source: 'ordinal_pick',
        confidence: 'high',
      });
    }
  }

  const lower = userMessage.toLowerCase();
  if (!/\b(option|one|choice|that|those|yes)\b/i.test(lower)) return null;

  for (const item of lastRecommendationList) {
    const nameLower = (item.name || '').toLowerCase();
    if (!nameLower) continue;
    const shortName = nameLower.replace(/\s+national park$/i, '').trim();
    if (lower.includes(shortName)) {
      return enrichDestinationWithParkCode({
        ...item,
        source: 'named_pick',
        confidence: 'high',
      });
    }
    const headToken = nameLower.split(/\s+/).find((token) => token.length >= 4);
    if (headToken && lower.includes(headToken)) {
      return enrichDestinationWithParkCode({
        ...item,
        source: 'named_pick',
        confidence: 'high',
      });
    }
  }

  return null;
}

/**
 * Resolve canonical active destination for this turn.
 */
function resolveActiveTripContext({
  lastUserMessage = '',
  conversationUserText = '',
  filteredMessages = [],
  storedContext = null,
  openEndedDiscovery = false,
}) {
  const messageParks = lastUserMessage ? extractAllParksFromMessage(lastUserMessage) : [];
  const storedPrimary = storedContext?.primaryDestination || null;

  const freshRecommendations = extractRecommendationListFromMessages(filteredMessages);
  const lastRecommendationList =
    freshRecommendations.length > 0
      ? freshRecommendations
      : storedContext?.lastRecommendationList || [];

  let primaryDestination = null;
  let resolutionSource = null;
  let lowConfidenceClarification = null;

  if (openEndedDiscovery) {
    return {
      activeTripContext: {
        primaryDestination: null,
        mentionedDestinations: messageParks.map((p) => toPrimaryDestination({ ...p, source: 'user_message' })).filter(Boolean),
        lastRecommendationList,
        resolutionSource: 'open_ended_discovery',
        lowConfidenceClarification: null,
        lastUserOverrideAt: storedContext?.lastUserOverrideAt || null,
      },
      allExtractedParks: messageParks,
      inheritedDestination: false,
    };
  }

  if (messageParks.length > 0) {
    const switched = isParkSwitchMessage(lastUserMessage, storedPrimary);
    primaryDestination = toPrimaryDestination({
      ...messageParks[0],
      source: switched ? 'user_switch' : 'user_message',
      confidence: 'high',
    });
    resolutionSource = switched ? 'park_switch' : 'explicit_message';
  } else {
    const picked = resolveOrdinalOrNamedPick(lastUserMessage, lastRecommendationList);
    if (picked) {
      primaryDestination = toPrimaryDestination(picked);
      resolutionSource = picked.source === 'ordinal_pick' ? 'ordinal_pick' : 'named_pick';
    } else if (isShortFollowUp(lastUserMessage) && storedPrimary) {
      primaryDestination = { ...storedPrimary };
      resolutionSource = 'stored_follow_up';
    } else if (isShortFollowUp(lastUserMessage)) {
      const convParks = extractAllParksFromMessage(conversationUserText);
      if (convParks.length > 0) {
        primaryDestination = toPrimaryDestination({
          ...convParks[convParks.length - 1],
          source: 'conversation_history',
          confidence: 'medium',
        });
        resolutionSource = 'conversation_history';
      }
    } else if (storedPrimary) {
      primaryDestination = { ...storedPrimary };
      resolutionSource = 'stored_session';
    }
  }

  if (
    !primaryDestination &&
    isShortFollowUp(lastUserMessage) &&
    FOLLOW_UP_NEEDS_DESTINATION.test(lastUserMessage)
  ) {
    lowConfidenceClarification =
      'Which park or destination should I use for this follow-up? Ask one short clarifying question if needed.';
  }

  const allExtractedParks =
    messageParks.length > 0
      ? messageParks
      : primaryDestination
        ? [destinationToExtractedPark(primaryDestination)].filter((p) => p?.parkName || p?.parkCode)
        : [];

  const activeTripContext = {
    primaryDestination,
    mentionedDestinations: messageParks
      .map((p) => toPrimaryDestination({ ...p, source: 'user_message', confidence: 'high' }))
      .filter(Boolean),
    lastRecommendationList,
    resolutionSource,
    lowConfidenceClarification,
    lastUserOverrideAt:
      messageParks.length > 0 ? new Date().toISOString() : storedContext?.lastUserOverrideAt || null,
  };

  return {
    activeTripContext,
    allExtractedParks,
    inheritedDestination: Boolean(
      primaryDestination &&
        resolutionSource &&
        !['explicit_message', 'park_switch', 'open_ended_discovery'].includes(resolutionSource)
    ),
  };
}

function applyPrimaryDestinationToMetadata(resolvedMetadata, primaryDestination) {
  if (!primaryDestination) return resolvedMetadata;

  return {
    ...resolvedMetadata,
    parkCode: primaryDestination.parkCode || resolvedMetadata.parkCode || null,
    parkName: primaryDestination.name || resolvedMetadata.parkName || null,
    lat: primaryDestination.lat ?? resolvedMetadata.lat ?? null,
    lon: primaryDestination.lon ?? resolvedMetadata.lon ?? null,
  };
}

function extractRecommendationsFromAssistantContent(assistantContent = '') {
  if (!assistantContent) return [];
  return extractRecommendationListFromMessages([{ role: 'assistant', content: assistantContent }]);
}

/**
 * Build client-persisted context after assistant reply.
 */
function finalizeActiveTripContextForClient({
  activeTripContext,
  assistantContent = '',
  resolvedMetadata = {},
  openEndedDiscovery = false,
}) {
  const base = activeTripContext || {
    primaryDestination: null,
    mentionedDestinations: [],
    lastRecommendationList: [],
    resolutionSource: null,
    lowConfidenceClarification: null,
    lastUserOverrideAt: null,
  };

  const assistantRecommendations = extractRecommendationsFromAssistantContent(assistantContent);
  const lastRecommendationList =
    assistantRecommendations.length > 0 ? assistantRecommendations : base.lastRecommendationList;

  let primaryDestination = base.primaryDestination;

  if (!openEndedDiscovery && resolvedMetadata.parkCode) {
    primaryDestination = toPrimaryDestination({
      name: resolvedMetadata.parkName,
      parkCode: resolvedMetadata.parkCode,
      lat: resolvedMetadata.lat,
      lon: resolvedMetadata.lon,
      type: 'nps',
      source: primaryDestination?.source || 'turn_resolution',
      confidence: 'high',
    });
  } else if (openEndedDiscovery && assistantRecommendations.length > 0) {
    primaryDestination = null;
  }

  return {
    primaryDestination,
    mentionedDestinations: base.mentionedDestinations || [],
    lastRecommendationList,
    resolutionSource: base.resolutionSource,
    lowConfidenceClarification: null,
    lastUserOverrideAt: base.lastUserOverrideAt,
  };
}

function formatActiveTripContextPromptBlock(activeTripContext) {
  if (!activeTripContext?.primaryDestination?.name) return '';

  const dest = activeTripContext.primaryDestination;
  let block = `\n\n--- ACTIVE TRIP CONTEXT ---`;
  block += `\nActive destination: ${dest.name}${dest.parkCode ? ` (${dest.parkCode})` : ''}.`;
  block += `\nTreat this as the user's current trip focus unless they explicitly switch destinations.`;
  if (activeTripContext.lastRecommendationList?.length > 1) {
    const names = activeTripContext.lastRecommendationList.map((r) => r.name).join('; ');
    block += `\nRecent options you suggested: ${names}.`;
    block += `\nIf the user says "the first one" or names an option, use that list — do not guess.`;
  }
  block += `\n--- END ACTIVE TRIP CONTEXT ---\n`;
  return block;
}

function summarizeActiveTripContext(activeTripContext) {
  if (!activeTripContext) return null;
  return {
    primaryDestination: activeTripContext.primaryDestination
      ? {
          name: activeTripContext.primaryDestination.name,
          parkCode: activeTripContext.primaryDestination.parkCode,
          confidence: activeTripContext.primaryDestination.confidence,
        }
      : null,
    resolutionSource: activeTripContext.resolutionSource,
    recommendationCount: activeTripContext.lastRecommendationList?.length || 0,
    needsClarification: !!activeTripContext.lowConfidenceClarification,
  };
}

module.exports = {
  resolveActiveTripContext,
  applyPrimaryDestinationToMetadata,
  finalizeActiveTripContextForClient,
  formatActiveTripContextPromptBlock,
  summarizeActiveTripContext,
  extractRecommendationListFromMessages,
  isParkSwitchMessage,
  resolveOrdinalOrNamedPick,
};
