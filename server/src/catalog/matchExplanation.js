/**
 * Human-readable "why this park" copy from trait intent + park traits.
 */
const { buildSearchHaystack } = require('./canonicalPark');
const { haystackMatchesToken } = require('./searchTokens');

const TRAIT_LABELS = {
  ocean: 'ocean views',
  water: 'water features',
  lake: 'lakes',
  forest: 'forests',
  mountains: 'mountains',
  waterfalls: 'waterfalls',
  wildlife: 'wildlife',
  scenic: 'scenic views',
  hiking: 'hiking',
  camping: 'camping',
  familyFriendly: 'family-friendly',
  accessibility: 'accessibility',
  romantic: 'romantic getaways',
  relaxing: 'relaxing atmosphere',
  photography: 'photography',
  winter: 'winter scenery',
  nature: 'nature',
};

/** States/territories with Atlantic, Pacific, or Gulf access (excludes Great Lakes–only). */
const OCEAN_COAST_STATES = new Set([
  'AK', 'AL', 'AS', 'CA', 'CT', 'DE', 'FL', 'GA', 'GU', 'HI', 'LA', 'MA', 'MD', 'ME',
  'MP', 'MS', 'NC', 'NH', 'NJ', 'NY', 'OR', 'PA', 'PR', 'RI', 'SC', 'TX', 'VA', 'VI', 'WA',
]);

/**
 * @param {import('./canonicalPark').CanonicalPark} park
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
 * Drop geographically impossible trait labels (e.g. ocean views for Wyoming).
 * @param {import('./canonicalPark').CanonicalPark} park
 * @param {string[]} matchedTraits
 * @returns {string[]}
 */
function filterGeographicTraits(park, matchedTraits) {
  if (!matchedTraits.includes('ocean') || parkHasOceanCoastAccess(park)) {
    return matchedTraits;
  }
  return matchedTraits.filter((trait) => trait !== 'ocean');
}

/**
 * @param {import('./canonicalPark').CanonicalPark} park
 * @param {Record<string, number>} traitIntent
 * @param {string[]} queryTokens
 * @returns {{ matchReason: string, matchedTraits: string[] }}
 */
function buildMatchExplanation(park, traitIntent, queryTokens = []) {
  const traits = park.traits || {};
  const intentEntries = Object.entries(traitIntent || {});

  const scoredTraits = intentEntries
    .map(([trait, intentWeight]) => ({
      trait,
      parkScore: traits[trait] || 0,
      intentWeight,
      combined: (traits[trait] || 0) * intentWeight,
    }))
    .filter(({ parkScore, intentWeight }) => parkScore >= 0.25 && intentWeight >= 0.35)
    .sort((a, b) => b.combined - a.combined);

  let matchedTraits = scoredTraits.map(({ trait }) => trait);

  if (matchedTraits.length === 0 && queryTokens.length > 0) {
    const haystack = buildSearchHaystack(park);
    matchedTraits = queryTokens.filter((token) =>
      haystackMatchesToken(haystack, token)
    );
  }

  matchedTraits = filterGeographicTraits(park, matchedTraits).slice(0, 5);

  if (matchedTraits.length === 0) {
    return {
      matchReason: 'Matches your search.',
      matchedTraits: [],
    };
  }

  const labels = matchedTraits
    .map((t) => TRAIT_LABELS[t] || t.replace(/([A-Z])/g, ' $1').toLowerCase())
    .filter(Boolean);

  const matchReason =
    labels.length === 1
      ? `Strong match for ${labels[0]}.`
      : `Strong match for ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}.`;

  return { matchReason, matchedTraits };
}

module.exports = {
  TRAIT_LABELS,
  OCEAN_COAST_STATES,
  parkHasOceanCoastAccess,
  filterGeographicTraits,
  buildMatchExplanation,
};
