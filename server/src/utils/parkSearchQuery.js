/**
 * Token-based park search for GET /api/parks/search?q=
 * Operates on CanonicalPark records (see catalog/canonicalPark.js).
 */
const { buildSearchHaystack } = require('../catalog/canonicalPark');
const {
  STOP_WORDS,
  TOKEN_ALIASES,
  tokenizeParkSearchQuery,
  haystackMatchesToken,
} = require('../catalog/searchTokens');

function scoreParkForTokens(park, queryTokens) {
  const haystack = buildSearchHaystack(park);
  return queryTokens.reduce(
    (total, token) => total + (haystackMatchesToken(haystack, token) ? 1 : 0),
    0
  );
}

const KEYWORD_WEIGHT = 1;
const TRAIT_WEIGHT = 2.5;
const MIN_TRAIT_ONLY_SCORE = 0.35;

const {
  buildTraitIntentFromQuery,
  scoreTraitIntent,
  applyIntentAdjustments,
  summarizePrimaryIntents,
} = require('../catalog/queryTraitIntent');
const { buildMatchExplanation } = require('../catalog/matchExplanation');

/**
 * Hybrid rank: keyword token overlap + trait intent fit.
 * Falls back to phrase match when no tokens remain.
 */
function attachSearchMatch(park, traitIntent, queryTokens, query) {
  const primaryIntents = query ? summarizePrimaryIntents(query) : [];
  const explanation = buildMatchExplanation(
    park,
    traitIntent,
    queryTokens,
    primaryIntents
  );
  park.searchMatch = explanation;
  return park;
}

/**
 * Force editorial pins to the top even when below search score threshold.
 * @param {import('../catalog/canonicalPark').CanonicalPark[]} rankedParks
 * @param {import('../catalog/canonicalPark').CanonicalPark[]} catalog
 * @param {string[]} pinnedCodes NPS park codes in display order
 * @param {string} q
 */
function applyPinnedParksToResults(rankedParks, catalog, pinnedCodes, q) {
  if (!pinnedCodes?.length) return rankedParks;

  const queryTokens = tokenizeParkSearchQuery(q);
  const traitIntent = buildTraitIntentFromQuery(q);
  const normalizedPinned = pinnedCodes.map((c) => c.toLowerCase());
  const pinnedSet = new Set(normalizedPinned);
  const byId = new Map(rankedParks.map((p) => [p.id.toLowerCase(), p]));

  const pinned = [];
  for (const code of normalizedPinned) {
    const existing = byId.get(code);
    if (existing) {
      pinned.push(existing);
      continue;
    }
    const park = catalog.find((p) => p.id.toLowerCase() === code);
    if (park) {
      pinned.push(
        attachSearchMatch({ ...park, traits: { ...park.traits } }, traitIntent, queryTokens, q)
      );
    }
  }

  const rest = rankedParks.filter((p) => !pinnedSet.has(p.id.toLowerCase()));
  return [...pinned, ...rest];
}

function rankParksByHybridSearch(parks, traitIntent, queryTokens, query) {
  return parks
    .map((park) => {
      const keywordScore = scoreParkForTokens(park, queryTokens);
      const traitScore = scoreTraitIntent(park, traitIntent);
      let total =
        keywordScore * KEYWORD_WEIGHT + traitScore * TRAIT_WEIGHT;
      total = applyIntentAdjustments(total, park, traitIntent);
      return { park, keywordScore, traitScore, total };
    })
    .filter(
      ({ keywordScore, traitScore }) =>
        keywordScore > 0 || traitScore >= MIN_TRAIT_ONLY_SCORE
    )
    .sort((a, b) => b.total - a.total)
    .map(({ park }) => attachSearchMatch(park, traitIntent, queryTokens, query));
}

function filterParksBySearchQuery(parks, q) {
  const query = q.toLowerCase().trim();
  const queryTokens = tokenizeParkSearchQuery(q);
  const traitIntent = buildTraitIntentFromQuery(q);

  if (queryTokens.length === 0) {
    if (Object.keys(traitIntent).length > 0) {
      return rankParksByHybridSearch(parks, traitIntent, queryTokens, q);
    }
    return parks
      .filter((park) => {
        const haystack = buildSearchHaystack(park);
        return haystack.includes(query);
      })
      .map((park) => attachSearchMatch(park, traitIntent, queryTokens, q));
  }

  return rankParksByHybridSearch(parks, traitIntent, queryTokens, q);
}

module.exports = {
  STOP_WORDS,
  TOKEN_ALIASES,
  tokenizeParkSearchQuery,
  haystackMatchesToken,
  scoreParkForTokens,
  attachSearchMatch,
  applyPinnedParksToResults,
  filterParksBySearchQuery,
};
