'use strict';

const { extractAllParksFromMessage } = require('../utils/parkExtractor');
const { isShortFollowUp, isItineraryRefinementFollowUp } = require('./trailieFetchPlanner');
const { isItineraryCommitRequest } = require('../utils/discoveryQuery');

const PARK_SWITCH_PATTERNS =
  /\b(actually|instead|rather|switch|change to|let'?s do|go with|prefer|rather than|not\s+\w+\s+but|move to|plan for)\b/i;

const ORDINAL_PICK_RULES = [
  { re: /\b(first|1st|top|#1)\b/i, index: 0 },
  { re: /\b(second|2nd|#2|middle one)\b/i, index: 1 },
  { re: /\b(third|3rd|#3)\b/i, index: 2 },
  { re: /\b(fourth|4th|#4)\b/i, index: 3 },
];

const WINNER_PICK_PATTERNS =
  /\b(your pick|the winner|the one you (?:recommended|chose|picked)|go with that|that one you said|the one you'?d pick)\b/i;

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
    ordinal: entry.ordinal ?? null,
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

function isCompareListMessage(userMessage = '') {
  const parks = extractAllParksFromMessage(userMessage);
  if (parks.length < 2) return false;
  return /\b(choose|pick|compare|versus|vs\.?|between|which|should we|should i|or)\b/i.test(userMessage);
}

/**
 * Extract user-provided compare options in original list order (not assistant recommendation order).
 */
function extractUserOrderedCompareOptions(userMessage = '') {
  if (!userMessage || typeof userMessage !== 'string') return [];

  const chooseMatch = userMessage.match(
    /(?:should we choose|should i choose|choose between|choose|pick between|pick|compare|decide between|should i pick|should we pick)\s+(.+?)\??\s*$/i
  );
  let rawParts = [];

  if (chooseMatch) {
    rawParts = chooseMatch[1]
      .split(/\s*,\s*|\s+or\s+/i)
      .map((part) => part.trim())
      .filter(Boolean);
  } else if (
    /\b(choose|pick|compare|versus|vs\.?|between|which|should we|should i)\b/i.test(userMessage)
  ) {
    const orListMatch = userMessage.match(/(.+?),\s*(.+?),\s*(?:or|and)\s+(.+?)(?:\?|$)/i);
    if (orListMatch) {
      rawParts = [orListMatch[1], orListMatch[2], orListMatch[3]]
        .map((part) => part.trim())
        .filter(Boolean);
    }
  }

  if (rawParts.length < 2) return [];

  const options = [];
  const seen = new Set();

  rawParts.forEach((rawName, index) => {
    const parks = extractAllParksFromMessage(rawName);
    const entry = parks[0]
      ? {
          name: parks[0].parkName,
          parkCode: parks[0].parkCode,
          lat: parks[0].lat,
          lon: parks[0].lon,
          type: 'nps',
          source: 'user_order',
          confidence: 'high',
          ordinal: index + 1,
        }
      : enrichDestinationWithParkCode({
          name: rawName.replace(/\?.*$/, '').trim(),
          source: 'user_order',
          confidence: 'medium',
          ordinal: index + 1,
        });

    const key = (entry.parkCode || entry.name || '').toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    options.push(entry);
  });

  return options;
}

function extractLastUserCompareOptions(filteredMessages = []) {
  for (let i = filteredMessages.length - 1; i >= 0; i -= 1) {
    const msg = filteredMessages[i];
    if (msg?.role !== 'user' || !msg.content) continue;
    const options = extractUserOrderedCompareOptions(msg.content);
    if (options.length >= 2) return options;
  }
  return [];
}

function matchComparedOptionByName(fragment, lastComparedOptions = []) {
  if (!fragment || lastComparedOptions.length === 0) return null;
  const lower = fragment.toLowerCase().trim();

  for (const option of lastComparedOptions) {
    const nameLower = (option.name || '').toLowerCase();
    if (!nameLower) continue;
    const shortName = nameLower.replace(/\s+national park$/i, '').trim();
    if (lower.includes(shortName) || shortName.includes(lower)) {
      return option;
    }
    const headToken = nameLower.split(/\s+/).find((token) => token.length >= 4);
    if (headToken && lower.includes(headToken)) {
      return option;
    }
  }
  return null;
}

function extractRecommendedOptionFromContent(assistantContent = '', lastComparedOptions = []) {
  if (!assistantContent || lastComparedOptions.length === 0) return null;

  const patterns = [
    /\b(?:go with|i'?d (?:pick|choose|go with)|my pick is|pick|choose|recommend)\s+([A-Z][^.\n—–,:]{2,55})/i,
    /\b(?:winner|best (?:pick|choice))\s*(?:is|:)\s*([A-Z][^.\n]{2,55})/i,
  ];

  for (const re of patterns) {
    const match = assistantContent.match(re);
    if (!match) continue;
    const candidate = matchComparedOptionByName(match[1], lastComparedOptions);
    if (candidate) {
      return enrichDestinationWithParkCode({
        ...candidate,
        source: 'recommended_pick',
        confidence: 'high',
      });
    }
  }

  return null;
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
      if (/^(don't forget|estimated costs|sun |water |hat |layer)/i.test(rawName)) continue;
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

function resolveOrdinalOrNamedPick(userMessage, options = {}) {
  const {
    lastComparedOptions = [],
    lastRecommendationList = [],
    recommendedOption = null,
  } = options;

  if (!userMessage) return null;

  if (WINNER_PICK_PATTERNS.test(userMessage) && recommendedOption) {
    return enrichDestinationWithParkCode({
      ...recommendedOption,
      source: 'recommended_pick',
      confidence: 'high',
    });
  }

  const ordinalList =
    lastComparedOptions.length >= 2 ? lastComparedOptions : lastRecommendationList;
  if (ordinalList.length === 0) return null;

  for (const rule of ORDINAL_PICK_RULES) {
    if (rule.re.test(userMessage) && ordinalList[rule.index]) {
      return enrichDestinationWithParkCode({
        ...ordinalList[rule.index],
        source: 'ordinal_pick',
        confidence: 'high',
      });
    }
  }

  const lower = userMessage.toLowerCase();
  if (!/\b(option|one|choice|that|those|yes)\b/i.test(lower)) return null;

  for (const item of ordinalList) {
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
  const lockedPlan = storedContext?.lockedPlanDestination || null;
  const recommendedOption = storedContext?.recommendedOption || null;

  const userCompareOptions = extractLastUserCompareOptions(filteredMessages);
  const lastComparedOptions =
    userCompareOptions.length >= 2
      ? userCompareOptions
      : storedContext?.lastComparedOptions || [];

  const freshRecommendations = extractRecommendationListFromMessages(filteredMessages);
  const lastRecommendationList =
    freshRecommendations.length > 0
      ? freshRecommendations
      : storedContext?.lastRecommendationList || [];

  let primaryDestination = null;
  let resolutionSource = null;
  let lowConfidenceClarification = null;

  const refinementFollowUp = isItineraryRefinementFollowUp(lastUserMessage);
  const shortFollowUp = isShortFollowUp(lastUserMessage);
  const compareListTurn = isCompareListMessage(lastUserMessage);
  const commitTurn = isItineraryCommitRequest(lastUserMessage);

  if (openEndedDiscovery && !lockedPlan && !refinementFollowUp && !commitTurn) {
    return {
      activeTripContext: {
        primaryDestination: null,
        lockedPlanDestination: lockedPlan,
        mentionedDestinations: messageParks.map((p) => toPrimaryDestination({ ...p, source: 'user_message' })).filter(Boolean),
        lastRecommendationList,
        lastComparedOptions,
        recommendedOption,
        resolutionSource: 'open_ended_discovery',
        lowConfidenceClarification: null,
        lastUserOverrideAt: storedContext?.lastUserOverrideAt || null,
      },
      allExtractedParks: messageParks,
      inheritedDestination: false,
    };
  }

  if (messageParks.length > 0 && !compareListTurn) {
    const switched = isParkSwitchMessage(lastUserMessage, storedPrimary || lockedPlan);
    primaryDestination = toPrimaryDestination({
      ...messageParks[0],
      source: switched ? 'user_switch' : 'user_message',
      confidence: 'high',
    });
    resolutionSource = switched ? 'park_switch' : 'explicit_message';
  } else {
    const picked = resolveOrdinalOrNamedPick(lastUserMessage, {
      lastComparedOptions,
      lastRecommendationList,
      recommendedOption,
    });
    if (picked) {
      primaryDestination = toPrimaryDestination(picked);
      resolutionSource = picked.source === 'ordinal_pick' ? 'ordinal_pick' : picked.source;
    } else if (commitTurn && (recommendedOption || lockedPlan || storedPrimary)) {
      primaryDestination = toPrimaryDestination(recommendedOption || lockedPlan || storedPrimary);
      resolutionSource = 'itinerary_commit';
    } else if (refinementFollowUp && lockedPlan) {
      primaryDestination = { ...lockedPlan };
      resolutionSource = 'locked_plan_refinement';
    } else if ((shortFollowUp || refinementFollowUp) && storedPrimary) {
      primaryDestination = { ...storedPrimary };
      resolutionSource = refinementFollowUp ? 'itinerary_refinement' : 'stored_follow_up';
    } else if (lockedPlan && (refinementFollowUp || shortFollowUp)) {
      primaryDestination = { ...lockedPlan };
      resolutionSource = 'locked_plan_refinement';
    } else if (refinementFollowUp && !storedPrimary && !lockedPlan) {
      const convParks = extractAllParksFromMessage(conversationUserText);
      if (convParks.length > 0) {
        primaryDestination = toPrimaryDestination({
          ...convParks[convParks.length - 1],
          source: 'conversation_history',
          confidence: 'high',
        });
        resolutionSource = 'itinerary_refinement';
      }
    } else if (storedPrimary) {
      primaryDestination = { ...storedPrimary };
      resolutionSource = 'stored_session';
    }
  }

  if (
    !primaryDestination &&
    shortFollowUp &&
    FOLLOW_UP_NEEDS_DESTINATION.test(lastUserMessage)
  ) {
    lowConfidenceClarification =
      'Which park or destination should I use for this follow-up? Ask one short clarifying question if needed.';
  }

  const allExtractedParks =
    compareListTurn
      ? messageParks
      : messageParks.length > 0
        ? messageParks
        : primaryDestination
          ? [destinationToExtractedPark(primaryDestination)].filter((p) => p?.parkName || p?.parkCode)
          : [];

  const activeTripContext = {
    primaryDestination,
    lockedPlanDestination: lockedPlan,
    mentionedDestinations: messageParks
      .map((p) => toPrimaryDestination({ ...p, source: 'user_message', confidence: 'high' }))
      .filter(Boolean),
    lastRecommendationList,
    lastComparedOptions,
    recommendedOption,
    resolutionSource,
    lowConfidenceClarification,
    lastUserOverrideAt:
      messageParks.length > 0 && !compareListTurn
        ? new Date().toISOString()
        : storedContext?.lastUserOverrideAt || null,
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
  hasItinerary = false,
}) {
  const base = activeTripContext || {
    primaryDestination: null,
    lockedPlanDestination: null,
    mentionedDestinations: [],
    lastRecommendationList: [],
    lastComparedOptions: [],
    recommendedOption: null,
    resolutionSource: null,
    lowConfidenceClarification: null,
    lastUserOverrideAt: null,
  };

  const lastComparedOptions =
    base.lastComparedOptions?.length >= 2 ? base.lastComparedOptions : [];

  const recommendedFromReply = extractRecommendedOptionFromContent(
    assistantContent,
    lastComparedOptions
  );
  const recommendedOption = recommendedFromReply || base.recommendedOption || null;

  const assistantRecommendations = extractRecommendationsFromAssistantContent(assistantContent);
  const lastRecommendationList =
    lastComparedOptions.length >= 2
      ? lastComparedOptions
      : assistantRecommendations.length > 0
        ? assistantRecommendations
        : base.lastRecommendationList;

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
  } else if (openEndedDiscovery && recommendedOption) {
    primaryDestination = toPrimaryDestination(recommendedOption);
  } else if (openEndedDiscovery && assistantRecommendations.length > 0) {
    primaryDestination = null;
  }

  let lockedPlanDestination = base.lockedPlanDestination || null;
  if (hasItinerary && primaryDestination) {
    lockedPlanDestination = { ...primaryDestination };
  } else if (lockedPlanDestination) {
    lockedPlanDestination = { ...lockedPlanDestination };
  }

  if (lockedPlanDestination && !primaryDestination) {
    primaryDestination = { ...lockedPlanDestination };
  }

  return {
    primaryDestination,
    lockedPlanDestination,
    mentionedDestinations: base.mentionedDestinations || [],
    lastRecommendationList,
    lastComparedOptions,
    recommendedOption,
    resolutionSource: base.resolutionSource,
    lowConfidenceClarification: null,
    lastUserOverrideAt: base.lastUserOverrideAt,
  };
}

function formatActiveTripContextPromptBlock(activeTripContext) {
  const dest =
    activeTripContext?.lockedPlanDestination ||
    activeTripContext?.primaryDestination;
  if (!dest?.name) return '';

  let block = `\n\n--- ACTIVE TRIP CONTEXT ---`;
  block += `\nActive destination: ${dest.name}${dest.parkCode ? ` (${dest.parkCode})` : ''}.`;
  block += `\nTreat this as the user's current trip focus unless they explicitly switch destinations.`;
  if (activeTripContext.lastComparedOptions?.length > 1) {
    const names = activeTripContext.lastComparedOptions
      .map((r, i) => `${i + 1}. ${r.name}`)
      .join('; ');
    block += `\nUser's original compare list (ordinal order): ${names}.`;
    block += `\nIf the user says "the second one", use that numbered list — not your recommendation order.`;
  }
  if (activeTripContext.recommendedOption?.name) {
    block += `\nYour recommended pick: ${activeTripContext.recommendedOption.name}.`;
    block += `\nUse this only when the user asks for "your pick" or "the winner" — not for ordinals like "second one".`;
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
    lockedPlanDestination: activeTripContext.lockedPlanDestination
      ? {
          name: activeTripContext.lockedPlanDestination.name,
          parkCode: activeTripContext.lockedPlanDestination.parkCode,
        }
      : null,
    recommendedOption: activeTripContext.recommendedOption?.name || null,
    resolutionSource: activeTripContext.resolutionSource,
    compareOptionCount: activeTripContext.lastComparedOptions?.length || 0,
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
  extractUserOrderedCompareOptions,
  extractLastUserCompareOptions,
  extractRecommendedOptionFromContent,
  isParkSwitchMessage,
  resolveOrdinalOrNamedPick,
};
