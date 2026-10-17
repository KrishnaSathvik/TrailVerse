'use strict';

/**
 * Phase 9B.2C / 9B.2C.1 — provider-source + result-corroboration authority
 * policy for evidence-bound coordinate resolution.
 *
 * A geocoder returning coordinates does not by itself prove authority. Two
 * separate questions have to both pass:
 *
 *   1. Is this underlying SOURCE precise enough to answer for a specific
 *      in-park POI at all? (Open-Meteo's geocoding index targets city/town-
 *      level places, not a specific geothermal feature or overlook.)
 *   2. Does the SPECIFIC RESULT actually correspond to the grounded PLACE
 *      we asked about — not merely the park it happens to be in?
 *
 * 9B.2C.1 correction: an earlier version of this policy accepted EITHER a
 * canonical-place match OR a park-name match as sufficient corroboration.
 * That is unsafe — park agreement does not prove stop identity. A wrong POI
 * inside the right park ("Old Faithful" when the grounded stop is "Grand
 * Prismatic Spring") would have passed. The corrected rule:
 *
 *   canonical-place corroboration : REQUIRED, always
 *   park-name agreement           : SUPPORTING evidence only — can reject
 *                                    an explicitly conflicting park mention,
 *                                    or do nothing when absent, but can
 *                                    NEVER independently establish authority.
 *
 * If the result cannot corroborate the specific grounded place, the honest
 * outcome is: identity remains resolved, coordinates remain unresolved. That
 * is preferable to authoritative coordinates for the wrong attraction.
 */

const { COORDINATE_SOURCE } = require('./coordinateValidation');

/**
 * Sources that can never establish authoritative POI-level coordinates,
 * regardless of what they return. Open-Meteo's geocoding API is a city/
 * place-name search over a gazetteer of populated places and administrative
 * regions — it is not built to resolve a specific attraction inside a park,
 * so even a plausible-looking name match is not trustworthy at that
 * granularity. It remains useful as informational candidate data.
 */
const NEVER_AUTHORITATIVE_SOURCES = new Set(['open-meteo']);

/** Sources the corroboration path below is allowed to evaluate at all. */
const CORROBORATION_ELIGIBLE_SOURCES = new Set(['google']);

const GENERIC_SUFFIX_PATTERN = /\b(national park|state park|national monument|national historic site|recreation area)\b/gi;
const MIN_TOKEN_LENGTH = 4; // skip short/common words ("the", "park", "usa") to avoid false-positive matches

function normalizeTokens(value) {
  return String(value || '')
    .toLowerCase()
    .replace(GENERIC_SUFFIX_PATTERN, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

/**
 * Does the geocoder's own returned name/address text mention the SPECIFIC
 * GROUNDED PLACE (`canonicalPlaceName`) — never the park alone? This is the
 * only identity-bearing check; park name is deliberately NOT an input here.
 */
function isPlaceCorroborated({ resolvedName, canonicalPlaceName }) {
  const haystackTokens = new Set(normalizeTokens(resolvedName));
  if (haystackTokens.size === 0) return false;
  const needles = normalizeTokens(canonicalPlaceName);
  if (needles.length === 0) return false;
  // Whole-token membership, not substring containment — "spring" must not
  // match "Springfield" just because one string contains the other.
  return needles.some((needle) => haystackTokens.has(needle));
}

const PARK_MENTION_PATTERN = /([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*)\s+(?:National Park|National Monument|State Park|National Historic Site|Recreation Area)/g;

/**
 * Extract explicit "<Name> National Park"-shaped mentions from the raw
 * (pre-token-stripped) text, and report whether any of them names a
 * DIFFERENT park than the one we expected. Absence of any such mention is
 * not a conflict — there is simply nothing to disagree with. Deliberately
 * conservative: only rejects when a park name is explicitly present and
 * every explicit mention disagrees with the expected park.
 */
function hasConflictingParkMention(resolvedName, parkName) {
  const parkTokens = new Set(normalizeTokens(parkName));
  if (parkTokens.size === 0) return false; // no expected park context to conflict with
  const text = String(resolvedName || '');
  const found = [...text.matchAll(PARK_MENTION_PATTERN)];
  const mentions = found.map((entry) => normalizeTokens(entry[1]));
  if (mentions.length === 0) return false; // nothing explicit mentioned, no conflict detectable
  return mentions.every((tokens) => tokens.length === 0 || !tokens.some((t) => parkTokens.has(t)));
}

/** General token-overlap utility (place OR park) — kept for other callers/diagnostics. */
function isCorroborated({ resolvedName, canonicalPlaceName, parkName }) {
  const haystackTokens = new Set(normalizeTokens(resolvedName));
  if (haystackTokens.size === 0) return false;
  const needles = [...normalizeTokens(canonicalPlaceName), ...normalizeTokens(parkName)];
  return needles.some((needle) => haystackTokens.has(needle));
}

/**
 * @param {Object} params
 * @param {string} params.providerSource  the underlying source that actually
 *   answered ('google' | 'open-meteo' | 'trailverse-known-place'), as
 *   returned by `geocodePlaceService.geocodePlace()` and preserved verbatim
 *   through `geocodeCoordinateEvidenceProvider.js`.
 * @param {string} params.resolvedName    the provider's own returned name/
 *   address text for the result (e.g. Google's `formatted_address`).
 * @param {string} params.canonicalPlaceName  the grounded place identity
 *   (from `stopIdentityResolution.js`'s evidence binding — never raw model
 *   stop-name text).
 * @param {string} [params.parkName]      authoritative park context — used
 *   ONLY to reject a conflicting park mention, never to establish identity.
 * @returns {{ authoritative: boolean, coordinateSource: string, reason: string }}
 */
function evaluateGeocodeAuthority({ providerSource, resolvedName, canonicalPlaceName, parkName }) {
  if (providerSource === 'trailverse-known-place') {
    // Our own curated catalog is already a deliberate trust decision (same
    // treatment as knownOutdoorLocations.js) — no further corroboration.
    return { authoritative: true, coordinateSource: COORDINATE_SOURCE.CATALOG, reason: 'trusted_catalog' };
  }
  if (NEVER_AUTHORITATIVE_SOURCES.has(providerSource)) {
    return { authoritative: false, coordinateSource: COORDINATE_SOURCE.UNKNOWN, reason: 'source_insufficient_for_poi' };
  }
  if (!CORROBORATION_ELIGIBLE_SOURCES.has(providerSource)) {
    return { authoritative: false, coordinateSource: COORDINATE_SOURCE.UNKNOWN, reason: 'unrecognized_source' };
  }
  // The SPECIFIC PLACE must corroborate — this is mandatory and cannot be
  // substituted by park agreement alone.
  if (!isPlaceCorroborated({ resolvedName, canonicalPlaceName })) {
    return { authoritative: false, coordinateSource: COORDINATE_SOURCE.UNKNOWN, reason: 'uncorroborated_place' };
  }
  // Park context is secondary: it can only REJECT (an explicit, conflicting
  // park mention), never independently grant authority.
  if (hasConflictingParkMention(resolvedName, parkName)) {
    return { authoritative: false, coordinateSource: COORDINATE_SOURCE.UNKNOWN, reason: 'conflicting_park_context' };
  }
  return { authoritative: true, coordinateSource: COORDINATE_SOURCE.GEOCODER, reason: 'corroborated_google_result' };
}

module.exports = {
  evaluateGeocodeAuthority,
  isCorroborated,
  isPlaceCorroborated,
  hasConflictingParkMention,
};
