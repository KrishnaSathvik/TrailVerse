/**
 * Park-name oriented search — prefix typing ("grand te" → Grand Teton).
 */
const { STOP_WORDS } = require('./searchTokens');

/**
 * Tokens for name prefix matching (allows 2-char fragments like "te").
 * @param {string} q
 * @returns {string[]}
 */
function tokenizeNameSearchQuery(q) {
  if (!q || typeof q !== 'string') return [];
  return q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

/**
 * Score sequential word-prefix matches on the park display name.
 * "grand te" → Grand Teton National Park (grand + teton).
 * @param {import('./canonicalPark').CanonicalPark} park
 * @param {string[]} nameTokens
 * @returns {number}
 */
function scoreParkNamePrefix(park, nameTokens) {
  if (!nameTokens.length) return 0;

  const nameWords = (park.name || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (!nameWords.length) return 0;

  let qi = 0;
  for (const word of nameWords) {
    if (qi >= nameTokens.length) break;
    const token = nameTokens[qi];
    if (word === token || word.startsWith(token)) {
      qi += 1;
    }
  }

  if (qi === nameTokens.length) return nameTokens.length * 2;
  return qi > 0 ? qi * 0.25 : 0;
}

/**
 * @param {import('./canonicalPark').CanonicalPark} park
 * @param {string[]} nameTokens
 * @returns {boolean}
 */
function parkNameMatchesAllTokens(park, nameTokens) {
  if (!nameTokens.length) return false;
  const nameWords = (park.name || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  return nameTokens.every((token) =>
    nameWords.some((word) => word === token || word.startsWith(token))
  );
}

module.exports = {
  tokenizeNameSearchQuery,
  scoreParkNamePrefix,
  parkNameMatchesAllTokens,
};
