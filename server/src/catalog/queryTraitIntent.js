/**
 * Map search queries → trait intent weights for hybrid ranking.
 */
const { tokenizeParkSearchQuery, TOKEN_ALIASES } = require('./searchTokens');

/** Query token (or alias) → trait weights */
const QUERY_TO_TRAITS = {
  ocean: { ocean: 1, water: 0.8, scenic: 0.5, relaxing: 0.4 },
  beach: { ocean: 0.9, water: 0.7, relaxing: 0.5 },
  coast: { ocean: 0.85, scenic: 0.5 },
  coastal: { ocean: 0.85, scenic: 0.5 },
  lake: { lake: 1, water: 0.8, scenic: 0.4 },
  forest: { forest: 1, nature: 0.8, hiking: 0.5, wildlife: 0.4 },
  mountains: { mountains: 1, scenic: 0.7, hiking: 0.6, photography: 0.5 },
  waterfall: { waterfalls: 1, water: 0.6, scenic: 0.5, hiking: 0.4 },
  waterfalls: { waterfalls: 1, water: 0.6, scenic: 0.5 },
  wildlife: { wildlife: 1, nature: 0.7, photography: 0.4 },
  scenic: { scenic: 1, photography: 0.7, nature: 0.5 },
  hiking: { hiking: 1, mountains: 0.5, nature: 0.6 },
  hike: { hiking: 1, mountains: 0.4 },
  camping: { camping: 1, familyFriendly: 0.4, nature: 0.5 },
  family: { familyFriendly: 1, camping: 0.4, relaxing: 0.3 },
  romantic: {
    romantic: 1.0,
    relaxing: 0.9,
    scenic: 0.8,
    water: 0.6,
    ocean: 0.5,
    lake: 0.45,
    photography: 0.45,
    nature: 0.35,
  },
  couples: {
    romantic: 1.0,
    relaxing: 0.95,
    scenic: 0.75,
    water: 0.65,
    ocean: 0.55,
    lake: 0.5,
    photography: 0.45,
    nature: 0.4,
    hiking: 0.2,
    camping: 0.05,
  },
  peaceful: { relaxing: 1, scenic: 0.5, romantic: 0.4 },
  calm: { relaxing: 1 },
  relax: { relaxing: 1, peaceful: 0.8, scenic: 0.4 },
  relaxing: { relaxing: 1, peaceful: 0.8 },
  nature: { nature: 1, wildlife: 0.7, forest: 0.6, scenic: 0.5 },
  photography: { photography: 1, scenic: 0.9, wildlife: 0.4, mountains: 0.3 },
  photo: { photography: 1, scenic: 0.8 },
  winter: { winter: 1, mountains: 0.4 },
  snow: { winter: 1 },
  sunset: {
    photography: 1.0,
    scenic: 0.9,
    ocean: 0.45,
    lake: 0.45,
    water: 0.5,
    mountains: 0.4,
  },
  beginner: {
    familyFriendly: 0.8,
    relaxing: 0.75,
    hiking: 0.35,
    accessibility: 0.6,
    scenic: 0.5,
  },
  beginners: {
    familyFriendly: 0.8,
    relaxing: 0.75,
    hiking: 0.35,
    accessibility: 0.6,
    scenic: 0.5,
  },
  quiet: {
    relaxing: 0.9,
    nature: 0.7,
    scenic: 0.55,
    wildlife: 0.35,
  },
  fall: { forest: 0.85, scenic: 0.75, mountains: 0.55, nature: 0.65 },
  foliage: { forest: 0.95, scenic: 0.85, mountains: 0.5, nature: 0.7 },
  autumn: { forest: 0.9, scenic: 0.8, mountains: 0.5, nature: 0.65 },
  astro: { photography: 0.95, scenic: 0.85, quiet: 0.55, nature: 0.5 },
  stargazing: { photography: 0.9, scenic: 0.8, quiet: 0.6, nature: 0.5 },
  families: {
    familyFriendly: 1,
    camping: 0.5,
    scenic: 0.65,
    relaxing: 0.5,
    hiking: 0.35,
    accessibility: 0.45,
  },
  kids: {
    familyFriendly: 1,
    camping: 0.5,
    scenic: 0.6,
    relaxing: 0.45,
    accessibility: 0.4,
  },
  dogs: { familyFriendly: 0.55, scenic: 0.6, relaxing: 0.5, hiking: 0.3, nature: 0.45 },
  pets: { familyFriendly: 0.55, scenic: 0.55, relaxing: 0.45, nature: 0.4 },
  accessible: { accessibility: 1, familyFriendly: 0.55, scenic: 0.55, relaxing: 0.45 },
  accessibility: { accessibility: 1, familyFriendly: 0.5, scenic: 0.5 },
  wheelchair: { accessibility: 1, familyFriendly: 0.5, scenic: 0.45 },
  vibes: {},
};

/** Multi-word phrases → trait intent (checked on full query string). */
const PHRASE_INTENT_WEIGHTS = [
  {
    phrases: ['first time', 'first timer', 'first timers'],
    weights: {
      familyFriendly: 0.9,
      relaxing: 0.7,
      scenic: 0.7,
      hiking: 0.35,
      nature: 0.6,
      accessibility: 0.5,
    },
  },
  {
    phrases: ['beginners', 'beginner'],
    weights: {
      familyFriendly: 0.8,
      relaxing: 0.75,
      hiking: 0.35,
      accessibility: 0.6,
      scenic: 0.5,
    },
  },
  {
    phrases: ['quiet'],
    weights: {
      relaxing: 0.9,
      nature: 0.7,
      scenic: 0.55,
      wildlife: 0.35,
    },
  },
  {
    phrases: ['sunset'],
    weights: {
      photography: 1.0,
      scenic: 0.9,
      ocean: 0.45,
      lake: 0.45,
      water: 0.5,
      mountains: 0.4,
    },
  },
  {
    phrases: [
      'fall color',
      'fall colors',
      'fall foliage',
      'autumn foliage',
      'autumn leaves',
      'leaf peeping',
    ],
    weights: {
      forest: 1,
      scenic: 0.9,
      mountains: 0.65,
      nature: 0.75,
    },
  },
  {
    phrases: ['dark sky', 'dark skies', 'astrophotography', 'stargazing', 'milky way', 'night sky'],
    weights: {
      photography: 1,
      scenic: 0.85,
      quiet: 0.7,
      nature: 0.65,
      winter: 0.35,
    },
  },
  {
    phrases: ['with kids', 'for kids', 'for families', 'family friendly', 'family-friendly'],
    weights: {
      familyFriendly: 1,
      camping: 0.5,
      scenic: 0.65,
      relaxing: 0.5,
      hiking: 0.35,
      accessibility: 0.45,
    },
  },
  {
    phrases: ['dog friendly', 'dog-friendly', 'dogs allowed', 'pet friendly', 'pet-friendly'],
    weights: {
      familyFriendly: 0.55,
      scenic: 0.6,
      relaxing: 0.5,
      hiking: 0.35,
      nature: 0.45,
    },
  },
  {
    phrases: ['wheelchair accessible', 'mobility accessible', 'easy access'],
    weights: {
      accessibility: 1,
      familyFriendly: 0.6,
      scenic: 0.55,
      relaxing: 0.45,
    },
  },
  {
    phrases: ['off season', 'off-season', 'winter trip', 'winter visit'],
    weights: {
      winter: 1,
      quiet: 0.65,
      scenic: 0.55,
      photography: 0.4,
      nature: 0.45,
    },
  },
  {
    phrases: ['first time visitor', 'first-time visitor', 'first visit'],
    weights: {
      familyFriendly: 0.95,
      relaxing: 0.75,
      scenic: 0.75,
      hiking: 0.35,
      nature: 0.6,
      accessibility: 0.55,
    },
  },
  {
    phrases: ['wildlife viewing', 'wildlife watching', 'see wildlife', 'animal watching', 'bird watching'],
    weights: {
      wildlife: 1,
      nature: 0.8,
      photography: 0.45,
      scenic: 0.4,
    },
  },
];

/**
 * @param {Record<string, number>} intent
 * @param {string} token
 */
function applyTokenToIntent(intent, token) {
  const mapping = QUERY_TO_TRAITS[token];
  if (!mapping) return;
  for (const [trait, weight] of Object.entries(mapping)) {
    intent[trait] = Math.max(intent[trait] || 0, weight);
  }
}

/**
 * @param {Record<string, number>} intent
 * @param {string} q
 */
function applyPhraseIntents(intent, q) {
  const lower = q.toLowerCase();
  for (const { phrases, weights } of PHRASE_INTENT_WEIGHTS) {
    if (!phrases.some((phrase) => lower.includes(phrase))) continue;
    for (const [trait, weight] of Object.entries(weights)) {
      intent[trait] = Math.max(intent[trait] || 0, weight);
    }
  }
}

/**
 * @param {string} q
 * @returns {Record<string, number>}
 */
function buildTraitIntentFromQuery(q) {
  const intent = {};
  applyPhraseIntents(intent, q);
  const tokens = tokenizeParkSearchQuery(q);
  const seen = new Set();

  for (const token of tokens) {
    const variants = [token, ...(TOKEN_ALIASES[token] || [])];
    for (const variant of variants) {
      if (seen.has(variant)) continue;
      seen.add(variant);
      applyTokenToIntent(intent, variant);
    }
  }

  return intent;
}

/**
 * @param {import('./canonicalPark').CanonicalPark} park
 * @param {Record<string, number>} intent
 * @returns {number}
 */
function scoreTraitIntent(park, intent) {
  const traits = park.traits || {};
  const entries = Object.entries(intent);
  if (entries.length === 0) return 0;

  return entries.reduce((sum, [trait, weight]) => {
    const parkTrait = traits[trait] || 0;
    return sum + parkTrait * weight;
  }, 0);
}

/**
 * Downrank dry/rugged parks when the user wants romantic or couples trips.
 * @param {number} score
 * @param {import('./canonicalPark').CanonicalPark} park
 * @param {Record<string, number>} intent
 * @returns {number}
 */
/** Headline parks that often feel crowded — downrank when user wants quiet/peaceful trips. */
const BUSY_ICON_PARK_CODES = new Set([
  'yell', 'yose', 'zion', 'grca', 'glac', 'grte', 'arch', 'brca', 'romo', 'dena', 'grsm',
  'jotr', 'olym', 'ever',
]);

/**
 * @param {import('./canonicalPark').CanonicalPark} park
 * @returns {boolean}
 */
function isWeakTripDestination(park) {
  const cat = (park.category || '').toLowerCase();
  if (cat.includes('historic_trail') || cat === 'national_trail') return true;
  if (cat.includes('parkway')) return true;
  if (cat.includes('historic_site') && !(park.traits?.scenic >= 0.5)) return true;
  return false;
}

function applyIntentAdjustments(score, park, intent) {
  const traits = park.traits || {};
  let adjusted = score;

  const wantsQuiet =
    (intent.relaxing || 0) >= 0.85 &&
    ((intent.nature || 0) >= 0.5 || (intent.scenic || 0) >= 0.45);

  if (wantsQuiet && BUSY_ICON_PARK_CODES.has((park.id || '').toLowerCase())) {
    adjusted *= 0.68;
  }

  const isDiscoveryTrip =
    (intent.romantic || 0) >= 0.5 ||
    (intent.relaxing || 0) >= 0.75 ||
    (intent.familyFriendly || 0) >= 0.7;

  if (isDiscoveryTrip && isWeakTripDestination(park)) {
    adjusted *= 0.55;
  }

  const isRomanticIntent =
    (intent.romantic || 0) >= 0.8 || (intent.relaxing || 0) >= 0.9;

  if (!isRomanticIntent) return adjusted;

  const hasWaterOrOcean =
    (traits.water || 0) >= 0.35 ||
    (traits.ocean || 0) >= 0.35 ||
    (traits.lake || 0) >= 0.35;

  const isDryRuggedMatch =
    (traits.scenic || 0) >= 0.7 &&
    (traits.water || 0) < 0.25 &&
    (traits.ocean || 0) < 0.25 &&
    (traits.lake || 0) < 0.25 &&
    ((traits.camping || 0) >= 0.5 || (traits.hiking || 0) >= 0.6);

  if (isDryRuggedMatch && !hasWaterOrOcean) {
    adjusted *= 0.82;
  }

  return adjusted;
}

/** User-facing labels for phrase intents (search → Trailie alignment). */
const PHRASE_INTENT_LABELS = {
  'first time': 'first-time visitors',
  'first timer': 'first-time visitors',
  'first timers': 'first-time visitors',
  beginners: 'beginners',
  beginner: 'beginners',
  quiet: 'quiet',
  sunset: 'sunset',
};

/**
 * Summarize query intents for Trailie — phrase + token level, sorted by weight.
 * @param {string} q
 * @returns {{ label: string, weight: number }[]}
 */
function summarizePrimaryIntents(q) {
  if (!q || typeof q !== 'string') return [];

  const lower = q.toLowerCase();
  const intents = [];

  for (const { phrases, weights } of PHRASE_INTENT_WEIGHTS) {
    const matchedPhrase = phrases.find((phrase) => lower.includes(phrase));
    if (!matchedPhrase) continue;

    const weight = Math.max(...Object.values(weights));
    const label =
      PHRASE_INTENT_LABELS[matchedPhrase] || matchedPhrase.replace(/\s+/g, ' ');

    if (!intents.some((entry) => entry.label === label)) {
      intents.push({ label, weight });
    }
  }

  const tokens = tokenizeParkSearchQuery(q);
  for (const token of tokens) {
    const mapping = QUERY_TO_TRAITS[token];
    if (!mapping) continue;

    const weight = Math.max(...Object.values(mapping));
    if (!intents.some((entry) => entry.label === token)) {
      intents.push({ label: token, weight });
    }
  }

  return intents
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6);
}

module.exports = {
  QUERY_TO_TRAITS,
  PHRASE_INTENT_WEIGHTS,
  buildTraitIntentFromQuery,
  summarizePrimaryIntents,
  scoreTraitIntent,
  applyIntentAdjustments,
};
