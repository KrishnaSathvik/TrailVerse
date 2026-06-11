const STOP_WORDS = new Set([
  'best', 'parks', 'park', 'for', 'with', 'and', 'the', 'a', 'an',
  'to', 'in', 'near', 'of', 'me', 'my', 'i', 'want', 'vibes', 'vibe',
  'some', 'any', 'looking', 'place', 'places', 'national', 'good', 'great',
  'first', 'time', 'visitor', 'visitors', 'quiet', 'beginner', 'beginners',
  'crowded', 'less', 'color', 'colors', 'leaves', 'leaf',
  'allowed', 'pets', 'pet', 'visitors', 'visitor', 'trips', 'trip',
]);

const TOKEN_ALIASES = {
  photography: ['photo', 'photos', 'photograph', 'scenic', 'viewpoint', 'views'],
  couples: ['romantic', 'scenic', 'peaceful'],
  romantic: ['couples', 'scenic'],
  hiking: ['hike', 'trail', 'trails'],
  waterfalls: ['waterfall', 'falls', 'cascade'],
  camping: ['campground', 'camp'],
  family: ['kids', 'children', 'kid'],
  winter: ['snow', 'ski', 'cold'],
  ocean: ['coast', 'coastal', 'beach', 'seashore', 'shore', 'island'],
  beach: ['coast', 'coastal', 'seashore', 'shore', 'ocean'],
  peaceful: ['calm', 'relax', 'relaxing'],
  relax: ['peaceful', 'quiet', 'calm'],
  fall: ['foliage', 'autumn'],
  foliage: ['fall', 'autumn'],
  autumn: ['fall', 'foliage'],
  astro: ['stargazing', 'astrophotography', 'night'],
  stargazing: ['astro', 'astrophotography', 'night'],
  families: ['family', 'kids', 'children'],
  kids: ['family', 'children', 'families'],
  dogs: ['pets', 'pet'],
  pets: ['dogs', 'dog'],
  wildlife: ['animals', 'bison', 'bear', 'bears', 'elk', 'moose'],
  viewing: ['watching'],
  accessible: ['accessibility', 'wheelchair', 'mobility'],
  accessibility: ['accessible', 'wheelchair'],
};

function tokenizeParkSearchQuery(q) {
  if (!q || typeof q !== 'string') return [];
  return q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function haystackMatchesToken(haystack, token) {
  if (!token) return false;
  const needles = [token, ...(TOKEN_ALIASES[token] || [])];
  const words = haystack.split(/[^a-z0-9]+/).filter(Boolean);

  return needles.some(
    (needle) =>
      words.some((word) => word === needle || word.startsWith(needle)) ||
      (needle.length >= 4 && haystack.includes(needle))
  );
}

module.exports = {
  STOP_WORDS,
  TOKEN_ALIASES,
  tokenizeParkSearchQuery,
  haystackMatchesToken,
};
