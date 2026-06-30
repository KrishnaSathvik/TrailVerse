'use strict';

const { isTravelRelated: isTravelRelatedQuery } = require('../utils/discoveryQuery');
const { classifyQueryRegex } = require('./webSearchClassifier');

const NPS_SKIP_CATEGORIES = new Set(['nps-covered', 'history-facts']);

const ASTRO_PATTERNS =
  /\b(astrophotography|astro\s*photo|stargaz|milky\s*way|dark\s*sky|night\s*sky|moon\s*phase|new\s*moon|full\s*moon|meteor\s*shower|star\s*trail|aurora|celestial)\b/i;

/** Time-sensitive / local queries that need live web or honest guest boundaries. */
const LIVE_DATA_PATTERNS =
  /\b(restaurant|restaurants|food|\beat\b|dine|dining|dinner|lunch|breakfast|cafe|coffee|bar|hotel|motel|lodging|lodge|cabin|airbnb|\bstay\b|accommodation|price|prices|\$\d|under\s+\$|budget|tonight|this weekend|this week|open now|right now|currently|today|tomorrow|available|availability|book(ing)?|reservation|smoke|air quality|wildfire|haze|road (?:open|closed|condition)|trail (?:open|closed)|open\?|closed\?|events?|ranger program|shuttle|transit|bus schedule)\b/i;

const LOCAL_LOGISTICS_PATTERNS =
  /\b(restaurant|restaurants|food|\beat\b|dine|dining|dinner|lunch|breakfast|cafe|coffee|bar|hotel|motel|lodging|lodge|cabin|airbnb|\bstay\b|accommodation|gateway|town|where should we stay|where to stay|nearby|spots?|price|prices|\$\d|under\s+\$|budget|this weekend|tonight)\b/i;

const ITINERARY_PATTERNS =
  /\b(plan|itinerary|schedule|day[- ]?by[- ]?day|things to do)\b|\b\d{1,2}\s*[- ]?day\b/i;

const FOLLOW_UP_PATTERNS =
  /\b(any|what about|where|how about|tell me more|more on|first one|second one|that option|yes,? the|those|that place|same trip|same dates|make it|refine it|update it|change it|adjust it|more relaxed|easier|less rushed)\b/i;

const PERMIT_BOOKING_PATTERNS =
  /\b(permit|reservation|lottery|timed[- ]?entry|pass required|when do .* open|booking window|release date)\b/i;

const EVENTS_PATTERNS =
  /\b(ranger program|guided walk|events?|happening|this weekend|next saturday|next sunday)\b/i;

const TRANSIT_PATTERNS =
  /\b(shuttle|transit|bus|valley shuttle|parking and shuttle)\b/i;

function hasExplicitNonNpsDestinationSignal(userMessage) {
  if (!userMessage) return false;
  const msg = userMessage.toLowerCase();

  return (
    /\bstate park\b/.test(msg) ||
    /\bnational forest\b/.test(msg) ||
    /\bstate forest\b/.test(msg) ||
    /\bcounty park\b/.test(msg) ||
    /\bcity park\b/.test(msg) ||
    /\bpreserve\b/.test(msg) ||
    /\brecreation area\b/.test(msg) ||
    /\bconservation area\b/.test(msg) ||
    /\bvalley of fire\b/.test(msg) ||
    /\bhocking hills\b/.test(msg) ||
    /\bred river gorge\b/.test(msg) ||
    /\bcuster\b/.test(msg) ||
    /\bstarved rock\b/.test(msg) ||
    /\bsmith rock\b/.test(msg)
  );
}

function hasNonNpsTravelSignals(userMessage) {
  if (!userMessage) return false;
  const msg = userMessage.toLowerCase();

  if (/state\s+park/i.test(msg)) return true;
  if (/\b(vs\.?|versus|compare|between)\b/.test(msg)) return true;
  if (
    /(?:restaurant|food|\beat\b|dine|dining|cafe|coffee|\bbar\b|hotel|motel|lodge|lodging|cabin|airbnb|\bstay\b|accommodation|gas station|grocery|town|gateway|nearby|outfitter|gear shop|rental|shuttle service|tour company|guide service|booking|availability|price|cost|review|rating)/i.test(
      msg
    )
  ) {
    return true;
  }
  if (
    /(road condition|road closure|road open|road status|construction|detour|trail condition|trail report|muddy|washout|wildfire|smoke|air quality|haze|flood)/i.test(
      msg
    )
  ) {
    return true;
  }
  if (/(\bevents?\b|\bfestivals?\b|ranger program|wildflower|bloom|fall color|aurora|northern lights)/i.test(msg)) {
    return true;
  }
  if (/(operational|trail condition|wildfire|\bsmoke\b|air quality)/i.test(msg)) {
    return true;
  }
  if (
    /(best|which|where|suggest|recommend|options?|ideas?|looking for|trying to find|not sure|help me (pick|choose|decide)|or even|somewhere)/i.test(
      msg
    )
  ) {
    return true;
  }
  if (/\b(current|currently|right now|today|tonight|this week|latest|open now|still closed)\b/i.test(msg)) {
    return true;
  }

  return false;
}

function isTravelRelated(userMessage) {
  if (!userMessage) return false;
  if (isTravelRelatedQuery(userMessage)) return true;
  return LIVE_DATA_PATTERNS.test(userMessage) || LOCAL_LOGISTICS_PATTERNS.test(userMessage);
}

function needsLiveData(userMessage) {
  if (!userMessage) return false;
  return LIVE_DATA_PATTERNS.test(userMessage);
}

function hasLocalLogisticsIntent(userMessage) {
  if (!userMessage) return false;
  return LOCAL_LOGISTICS_PATTERNS.test(userMessage);
}

function hasItineraryIntent(userMessage) {
  if (!userMessage) return false;
  return ITINERARY_PATTERNS.test(userMessage);
}

/** Backward-compatible alias used in ai.js footers and tests. */
function isItineraryPlanningQuery(userMessage) {
  return hasItineraryIntent(userMessage);
}

const ITINERARY_REFINEMENT_PATTERNS =
  /\b(make it|refine it|update it|change it|adjust it|more relaxed|easier|less rushed|avoid|add (?:a|one)|actually|can you also|one good)\b/i;

function isItineraryRefinementFollowUp(userMessage) {
  if (!userMessage) return false;
  const trimmed = userMessage.trim();
  if (trimmed.length > 200) return false;
  return ITINERARY_REFINEMENT_PATTERNS.test(trimmed) || /\b(it|this plan|the plan)\b/i.test(trimmed);
}

function isShortFollowUp(userMessage) {
  if (!userMessage) return false;
  const trimmed = userMessage.trim();
  if (trimmed.length > 140) return false;
  const words = trimmed.split(/\s+/).length;
  return words <= 10 || FOLLOW_UP_PATTERNS.test(trimmed) || isItineraryRefinementFollowUp(trimmed);
}

function isOpenEndedParkDiscoveryQuery(userMessage) {
  if (!userMessage) return false;
  if (hasLocalLogisticsIntent(userMessage)) return false;
  if (/\b(vs\.?|versus)\b/i.test(userMessage)) return false;
  return (
    /\b(best|which|top|recommend|suggest|ideas? for)\b/i.test(userMessage) &&
    (/\b(national\s+)?parks?\b/i.test(userMessage) ||
      /\b(visit|getaway|vibes?)\b/i.test(userMessage) ||
      /\b(couples?|families|first[- ]?timers|photography)\b/i.test(userMessage))
  );
}

function isHeadToHeadCompareQuery(userMessage) {
  if (!userMessage) return false;
  return /\b(vs\.?|versus)\b/i.test(userMessage);
}

function isNpsAuthoritativeOnly(userMessage) {
  if (!userMessage || userMessage.trim().length < 8) return false;
  if (!isTravelRelated(userMessage)) return false;
  const category = classifyQueryRegex(userMessage);
  if (!NPS_SKIP_CATEGORIES.has(category)) return false;
  return !hasNonNpsTravelSignals(userMessage);
}

function resolveWebFetch({
  fetchMessage,
  parkCode,
  skipWebSearchForGuest,
}) {
  const blockedFetches = [];
  let shouldFetchWeb = false;

  if (skipWebSearchForGuest) {
    blockedFetches.push({ type: 'web', reason: 'guest_mode' });
  } else if (!isTravelRelated(fetchMessage) || fetchMessage.trim().length < 8) {
    blockedFetches.push({ type: 'web', reason: 'not_travel_related' });
  } else {
    const explicitNonNps = !parkCode && hasExplicitNonNpsDestinationSignal(fetchMessage);

    if (explicitNonNps) {
      shouldFetchWeb = true;
    } else if (hasItineraryIntent(fetchMessage) && !hasLocalLogisticsIntent(fetchMessage)) {
      blockedFetches.push({ type: 'web', reason: 'itinerary_only_nps_first' });
    } else if (isNpsAuthoritativeOnly(fetchMessage) && !hasLocalLogisticsIntent(fetchMessage)) {
      blockedFetches.push({ type: 'web', reason: 'nps_authoritative_only' });
    } else if (isOpenEndedParkDiscoveryQuery(fetchMessage)) {
      blockedFetches.push({ type: 'web', reason: 'open_ended_discovery_v1' });
    } else if (isHeadToHeadCompareQuery(fetchMessage) && !hasLocalLogisticsIntent(fetchMessage)) {
      blockedFetches.push({ type: 'web', reason: 'head_to_head_compare' });
    } else if (
      PERMIT_BOOKING_PATTERNS.test(fetchMessage) &&
      !hasLocalLogisticsIntent(fetchMessage)
    ) {
      blockedFetches.push({ type: 'web', reason: 'permit_nps_first' });
    } else {
      const category = classifyQueryRegex(fetchMessage);
      if (category === 'operational-status' && !/\broad\b/i.test(fetchMessage)) {
        blockedFetches.push({ type: 'web', reason: 'operational_nps_alerts' });
      } else {
        shouldFetchWeb = true;
      }
    }
  }

  return { shouldFetchWeb, blockedFetches };
}

function buildDestinations({
  parkCode = null,
  parkName = null,
  lat = null,
  lon = null,
  allExtractedParks = [],
  resolvedMetadata = {},
}) {
  const destinations = [];

  if (Array.isArray(allExtractedParks) && allExtractedParks.length > 0) {
    for (const park of allExtractedParks) {
      if (!park?.parkCode && !park?.parkName) continue;
      destinations.push({
        name: park.parkName || park.parkCode,
        parkCode: park.parkCode || null,
        type: 'nps',
        lat: park.lat ?? null,
        lon: park.lon ?? null,
        source: 'park_extractor',
        confidence: park.parkCode ? 'high' : 'medium',
      });
    }
    return destinations;
  }

  const label =
    parkName ||
    resolvedMetadata.parkName ||
    resolvedMetadata.resolvedPlaceName ||
    null;

  if (parkCode || label) {
    destinations.push({
      name: label || parkCode,
      parkCode: parkCode || null,
      type: parkCode ? 'nps' : resolvedMetadata.resolvedPlaceName ? 'geocoded_place' : 'unknown',
      lat: lat ?? resolvedMetadata.lat ?? null,
      lon: lon ?? resolvedMetadata.lon ?? null,
      source: parkCode ? 'session_metadata' : 'geocoder',
      confidence: parkCode ? 'high' : 'medium',
    });
  }

  return destinations;
}

/**
 * Message used for fetch gating — enriches short follow-ups with trip context.
 */
function resolveFactFetchMessage({
  lastUserMessage,
  conversationUserText = '',
  resolvedMetadata = {},
}) {
  if (!lastUserMessage) return '';

  const needsContext =
    isShortFollowUp(lastUserMessage) &&
    (needsLiveData(lastUserMessage) ||
      hasLocalLogisticsIntent(lastUserMessage) ||
      PERMIT_BOOKING_PATTERNS.test(lastUserMessage));

  if (!needsContext) return lastUserMessage;

  const parkLabel =
    resolvedMetadata.parkName ||
    resolvedMetadata.resolvedPlaceName ||
    null;

  if (parkLabel && !new RegExp(parkLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(lastUserMessage)) {
    return `${lastUserMessage} (for ${parkLabel})`;
  }

  if (conversationUserText && conversationUserText.length > lastUserMessage.length) {
    return `${conversationUserText.slice(-400)}\n${lastUserMessage}`;
  }

  return lastUserMessage;
}

/**
 * Central fetch plan for one chat turn — single source of truth for fact routing.
 */
function planTrailieFetches({
  userMessage,
  parkCode = null,
  parkName = null,
  lat = null,
  lon = null,
  isAnonymous = false,
  isTrustedMcp = false,
  conversationUserText = '',
  resolvedMetadata = {},
  allExtractedParks = [],
}) {
  const authTier = isTrustedMcp ? 'trusted_mcp' : isAnonymous ? 'guest' : 'logged_in';
  const skipWebSearchForGuest = isAnonymous && !isTrustedMcp;

  const fetchMessage = resolveFactFetchMessage({
    lastUserMessage: userMessage,
    conversationUserText,
    resolvedMetadata,
  });

  const destinations = buildDestinations({
    parkCode,
    parkName,
    lat,
    lon,
    allExtractedParks,
    resolvedMetadata,
  });

  const queryTypes = [];
  if (hasItineraryIntent(fetchMessage)) queryTypes.push('itinerary');
  if (hasLocalLogisticsIntent(fetchMessage)) queryTypes.push('local_business');
  if (PERMIT_BOOKING_PATTERNS.test(fetchMessage)) queryTypes.push('permit_booking');
  if (EVENTS_PATTERNS.test(fetchMessage)) queryTypes.push('events');
  if (TRANSIT_PATTERNS.test(fetchMessage)) queryTypes.push('transit');
  if (needsLiveData(fetchMessage)) queryTypes.push('live_sensitive');
  if (!parkCode && hasExplicitNonNpsDestinationSignal(fetchMessage)) {
    queryTypes.push('non_nps_named');
  }
  if (isOpenEndedParkDiscoveryQuery(fetchMessage)) queryTypes.push('open_ended_discovery');

  const travelEligible =
    isTravelRelated(fetchMessage) && fetchMessage.trim().length >= 8;
  const hasCoords = !!(lat && lon);

  const { shouldFetchWeb, blockedFetches: webBlocked } = resolveWebFetch({
    fetchMessage,
    parkCode,
    skipWebSearchForGuest,
  });

  const blockedFetches = [...webBlocked];

  const wantsNps = travelEligible && !!parkCode;
  if (travelEligible && !parkCode) {
    blockedFetches.push({ type: 'nps', reason: 'no_park_code' });
  }

  const wantsWeather = travelEligible && hasCoords;
  if (travelEligible && !hasCoords) {
    blockedFetches.push({ type: 'weather', reason: 'no_coordinates' });
  }

  const wantsAstro = travelEligible && hasCoords && ASTRO_PATTERNS.test(fetchMessage);
  if (travelEligible && ASTRO_PATTERNS.test(fetchMessage) && !hasCoords) {
    blockedFetches.push({ type: 'astro', reason: 'no_coordinates' });
  }

  const wantsEvents = travelEligible && EVENTS_PATTERNS.test(fetchMessage);
  if (wantsEvents) {
    blockedFetches.push({ type: 'events', reason: 'not_implemented_v1' });
  }

  const wantsTransit = travelEligible && TRANSIT_PATTERNS.test(fetchMessage);
  if (wantsTransit) {
    blockedFetches.push({ type: 'transit', reason: 'not_implemented_v1' });
  }

  const wantsPermits = travelEligible && (PERMIT_BOOKING_PATTERNS.test(fetchMessage) || !!parkCode);
  if (travelEligible && PERMIT_BOOKING_PATTERNS.test(fetchMessage) && !parkCode) {
    blockedFetches.push({ type: 'permits', reason: 'no_park_code_for_permit_lookup' });
  }

  const guestNeedsLiveBoundary = skipWebSearchForGuest && needsLiveData(fetchMessage);

  let confidence = 'high';
  if (guestNeedsLiveBoundary) confidence = 'low';
  else if (queryTypes.includes('open_ended_discovery')) confidence = 'medium';
  else if (queryTypes.includes('non_nps_named') && !parkCode) confidence = 'medium';
  else if (!hasCoords && travelEligible) confidence = 'medium';

  return {
    authTier,
    queryTypes,
    fetchMessage,
    destinations,
    shouldFetch: {
      nps: wantsNps,
      weather: wantsWeather,
      web: shouldFetchWeb,
      events: false,
      transit: false,
      permits: wantsPermits && !!parkCode,
      astro: wantsAstro,
      feeFree: travelEligible,
    },
    intentFlags: {
      events: wantsEvents,
      transit: wantsTransit,
      permits: wantsPermits,
    },
    blockedFetches,
    guestNeedsLiveBoundary,
    confidence,
    reasonCodes: blockedFetches.map((b) => b.reason),
  };
}

function getBlockedReason(fetchPlan, type) {
  if (!fetchPlan?.blockedFetches) return null;
  return fetchPlan.blockedFetches.find((entry) => entry.type === type)?.reason || null;
}

function summarizeFetchPlan(fetchPlan) {
  if (!fetchPlan) return null;
  return {
    authTier: fetchPlan.authTier,
    queryTypes: fetchPlan.queryTypes,
    confidence: fetchPlan.confidence,
    destinations: (fetchPlan.destinations || []).map((d) => ({
      name: d.name,
      parkCode: d.parkCode,
      type: d.type,
      confidence: d.confidence,
    })),
    shouldFetch: fetchPlan.shouldFetch,
    intentFlags: fetchPlan.intentFlags,
    blockedFetches: fetchPlan.blockedFetches,
    guestNeedsLiveBoundary: fetchPlan.guestNeedsLiveBoundary,
  };
}

function shouldAppendGuestLiveUpsell(userMessage, { fetchMessage = null } = {}) {
  const msg = fetchMessage || userMessage;
  if (!msg) return { append: false };

  if (hasItineraryIntent(msg) && !hasLocalLogisticsIntent(msg) && !needsLiveData(msg)) {
    return { append: false };
  }

  if (isOpenEndedParkDiscoveryQuery(msg)) {
    return { append: false };
  }

  if (PERMIT_BOOKING_PATTERNS.test(msg) && !hasLocalLogisticsIntent(msg) && !needsLiveData(msg)) {
    return { append: false };
  }

  const category = classifyQueryRegex(msg);

  if (category === 'local-business' || hasLocalLogisticsIntent(msg)) {
    return { append: true, variant: 'local' };
  }
  if (category === 'road-conditions') return { append: true, variant: 'road' };
  if (category === 'trail-conditions') return { append: true, variant: 'trail' };
  if (category === 'wildfire-smoke') return { append: true, variant: 'conditions' };
  if (needsLiveData(msg)) return { append: true, variant: 'local' };

  return { append: false };
}

function formatGuestLiveDataBoundaryBlock() {
  return `\n\n--- GUEST LIVE DATA BOUNDARY ---
The user is in guest mode. Live web search is NOT available for this turn.
For restaurants, hotels, prices, hours, availability, road/trail open-now status, smoke/air quality, or events:
- Do NOT state specific live prices, hours, availability, or current open/closed status from memory.
- Give general planning guidance (areas, strategy, what to verify).
- Say clearly that guest mode cannot verify live results; sign in free to unlock live search on TrailVerse.
- Keep the tone helpful — do not refuse the question entirely.
--- END GUEST LIVE DATA BOUNDARY ---\n`;
}

module.exports = {
  needsLiveData,
  hasLocalLogisticsIntent,
  hasItineraryIntent,
  isItineraryPlanningQuery,
  isShortFollowUp,
  isItineraryRefinementFollowUp,
  resolveFactFetchMessage,
  planTrailieFetches,
  summarizeFetchPlan,
  getBlockedReason,
  shouldAppendGuestLiveUpsell,
  formatGuestLiveDataBoundaryBlock,
  hasExplicitNonNpsDestinationSignal,
};
