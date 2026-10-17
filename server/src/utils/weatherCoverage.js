'use strict';

/**
 * Stage 10 (F-DATA-2) — explicit multi-park weather coverage.
 *
 * Never imply that every park has weather evidence when only the primary
 * destination was fetched. This produces structured coverage metadata so the
 * reviewer (and the frontend) can distinguish "not requested", "unavailable",
 * "partial", and "complete" — and never convert missing secondary weather into
 * a climate or current-weather assertion.
 */

const WEATHER_COVERAGE_STATUS = {
  COMPLETE: 'complete',
  PARTIAL: 'partial',
  UNAVAILABLE: 'unavailable',
  NOT_REQUESTED: 'not_requested',
};

/** Reviewer section evidence reasons for weather scope. */
const WEATHER_EVIDENCE_REASON = {
  NOT_REQUESTED: 'weather_not_requested_for_scope',
  UNAVAILABLE: 'weather_unavailable_for_scope',
  PARTIAL: 'weather_coverage_partial',
  NO_RELEVANT: 'no_relevant_weather_fact',
};

function uniq(list) {
  return [...new Set((list || []).filter(Boolean))];
}

/**
 * @param {Object} params
 * @param {string[]} params.requestedParkCodes  parks in scope for this itinerary
 * @param {Object[]} params.weatherCanonicalFacts facts actually fetched
 * @param {boolean} params.weatherRequested      whether weather was asked for
 * @returns {{requestedParkCodes: string[], coveredParkCodes: string[],
 *   uncoveredParkCodes: string[], status: string}}
 */
function computeWeatherCoverage({
  requestedParkCodes = [],
  weatherCanonicalFacts = [],
  weatherRequested = false,
} = {}) {
  const requested = uniq(requestedParkCodes);
  const covered = uniq(
    (weatherCanonicalFacts || []).map((f) => f && f.parkCode).filter(Boolean)
  ).filter((code) => requested.length === 0 || requested.includes(code));
  const uncovered = requested.filter((code) => !covered.includes(code));

  let status;
  if (!weatherRequested) {
    status = WEATHER_COVERAGE_STATUS.NOT_REQUESTED;
  } else if ((weatherCanonicalFacts || []).length === 0) {
    status = WEATHER_COVERAGE_STATUS.UNAVAILABLE;
  } else if (requested.length > 0 && uncovered.length > 0) {
    status = WEATHER_COVERAGE_STATUS.PARTIAL;
  } else {
    status = WEATHER_COVERAGE_STATUS.COMPLETE;
  }

  return { requestedParkCodes: requested, coveredParkCodes: covered, uncoveredParkCodes: uncovered, status };
}

module.exports = {
  WEATHER_COVERAGE_STATUS,
  WEATHER_EVIDENCE_REASON,
  computeWeatherCoverage,
};
