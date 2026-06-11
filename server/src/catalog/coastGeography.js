/**
 * Saltwater vs Great Lakes / inland water — shared by traits, search, and match copy.
 */

/** States/territories with Atlantic, Pacific, or Gulf coast (excludes Great Lakes–only). */
const OCEAN_COAST_STATES = new Set([
  'AK', 'AL', 'AS', 'CA', 'CT', 'DE', 'FL', 'GA', 'GU', 'HI', 'LA', 'MA', 'MD', 'ME',
  'MP', 'MS', 'NC', 'NH', 'NJ', 'NY', 'OR', 'PA', 'PR', 'RI', 'SC', 'TX', 'VA', 'VI', 'WA',
]);

/** Explicit saltwater vocabulary — safe to match on any park. */
const SALTWATER_KEYWORDS = [
  'ocean',
  'seashore',
  'pacific',
  'atlantic',
  'gulf of mexico',
  'gulf coast',
  'marine',
  'tidal',
  'coral reef',
];

/**
 * @param {import('./canonicalPark').CanonicalPark|object} park
 * @returns {boolean}
 */
function parkHasOceanCoastAccess(park) {
  const category = (park.category || '').toLowerCase();
  if (category === 'national_seashore') return true;

  const states = (park.states || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  return states.some((s) => OCEAN_COAST_STATES.has(s));
}

/**
 * @param {string} haystack
 * @returns {boolean}
 */
function haystackMentionsSaltwater(haystack) {
  const lower = (haystack || '').toLowerCase();
  return SALTWATER_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Keyword match for `ocean` / `beach` tokens — blocks Great Lakes "coast" false positives.
 * @param {import('./canonicalPark').CanonicalPark|object} park
 * @param {string} haystack
 * @param {string} token
 * @param {(haystack: string, token: string) => boolean} haystackMatchesToken
 * @returns {boolean}
 */
function parkHaystackMatchesWaterToken(park, haystack, token, haystackMatchesToken) {
  const isOceanIntentToken = token === 'ocean' || token === 'beach';
  if (!isOceanIntentToken) {
    return haystackMatchesToken(haystack, token);
  }

  if (parkHasOceanCoastAccess(park)) {
    return haystackMatchesToken(haystack, token);
  }

  return haystackMentionsSaltwater(haystack);
}

module.exports = {
  OCEAN_COAST_STATES,
  SALTWATER_KEYWORDS,
  parkHasOceanCoastAccess,
  haystackMentionsSaltwater,
  parkHaystackMatchesWaterToken,
};
