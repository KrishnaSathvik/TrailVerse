'use strict';

/**
 * Stage 11 — deterministic decision: does this request require a structured
 * (tool-first) itinerary? The PROVIDER never decides this. It reuses the
 * existing planning-intent signal (`userRequestedItinerary`) and excludes
 * response types that are never itineraries (welcome/conversion/discovery).
 */

const STRUCTURED_REASON = {
  REQUESTED: 'itinerary_requested',
  NOT_REQUESTED: 'not_an_itinerary_request',
  DISCOVERY: 'open_ended_discovery',
  WELCOME: 'welcome_message',
  CONVERSION: 'conversion_message',
};

/**
 * @param {Object} params
 * @param {boolean} params.userRequestedItinerary  existing planning-intent signal
 * @param {boolean} [params.openEndedDiscovery]
 * @param {boolean} [params.isWelcomeMessage]
 * @param {boolean} [params.isConversionMessage]
 * @returns {{requiresStructuredItinerary: boolean, reason: string}}
 */
function evaluateStructuredItineraryRequirement({
  userRequestedItinerary = false,
  openEndedDiscovery = false,
  isWelcomeMessage = false,
  isConversionMessage = false,
} = {}) {
  if (isWelcomeMessage) {
    return { requiresStructuredItinerary: false, reason: STRUCTURED_REASON.WELCOME };
  }
  if (isConversionMessage) {
    return { requiresStructuredItinerary: false, reason: STRUCTURED_REASON.CONVERSION };
  }
  if (openEndedDiscovery) {
    return { requiresStructuredItinerary: false, reason: STRUCTURED_REASON.DISCOVERY };
  }
  if (userRequestedItinerary) {
    return { requiresStructuredItinerary: true, reason: STRUCTURED_REASON.REQUESTED };
  }
  return { requiresStructuredItinerary: false, reason: STRUCTURED_REASON.NOT_REQUESTED };
}

module.exports = {
  STRUCTURED_REASON,
  evaluateStructuredItineraryRequirement,
};
