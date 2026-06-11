/**
 * Human-readable "why this park" copy from trait intent + park traits.
 */
const { buildSearchHaystack } = require('./canonicalPark');
const { haystackMatchesToken } = require('./searchTokens');
const {
  tokenizeNameSearchQuery,
  parkNameMatchesAllTokens,
} = require('./parkNameSearch');
const { getParkMatchBlurb } = require('./parkMatchBlurbs');

/** Short labels only for generic fallback (max 2 traits). */
const TRAIT_LABELS = {
  ocean: 'ocean coast',
  water: 'lakes and rivers',
  lake: 'lake country',
  forest: 'forests',
  mountains: 'mountain scenery',
  waterfalls: 'waterfalls',
  wildlife: 'wildlife',
  scenic: 'big views',
  hiking: 'trails',
  camping: 'camping',
  familyFriendly: 'family-friendly stops',
  accessibility: 'accessible paths',
  romantic: 'romantic scenery',
  relaxing: 'a relaxed pace',
  photography: 'photo-worthy light',
  winter: 'winter landscapes',
  nature: 'wild country',
};

/**
 * @param {{ label: string }[]} primaryIntents
 */
function queryIntentFlags(primaryIntents) {
  const labels = new Set((primaryIntents || []).map((i) => i.label));
  return {
    quiet: labels.has('quiet'),
    couples: labels.has('couples') || labels.has('romantic'),
    beginners:
      labels.has('beginners') ||
      labels.has('beginner') ||
      labels.has('first-time visitors'),
    photography: labels.has('photography') || labels.has('photo'),
    ocean: labels.has('ocean') || labels.has('beach'),
    hiking: labels.has('hiking'),
    family: labels.has('family') || labels.has('families') || labels.has('kids'),
  };
}

/**
 * @param {import('./canonicalPark').CanonicalPark} park
 * @param {string[]} matchedTraits
 * @param {{ label: string }[]} primaryIntents
 */
function buildNaturalMatchReason(park, matchedTraits, primaryIntents) {
  const parkSpecific = getParkMatchBlurb(park, primaryIntents);
  if (parkSpecific) return parkSpecific;

  const flags = queryIntentFlags(primaryIntents);
  const has = (trait) => matchedTraits.includes(trait);
  const cat = (park.category || '').toLowerCase();

  if (flags.quiet && flags.couples) {
    if (has('ocean') || cat.includes('seashore')) {
      return 'Peaceful enough for two — coastal views, scenic drives, and far less chaos than the busiest parks.';
    }
    if (has('lake') || cat.includes('lakeshore')) {
      return 'Lakeshore calm for two — water, cliffs or beaches, and room to breathe between stops.';
    }
    if (has('mountains') && has('scenic')) {
      return 'Big mountain views without the circus — scenic drives and shared overlooks beat rushing trailheads.';
    }
    if (has('waterfalls') || has('water')) {
      return 'Water and wide-open scenery — easy to slow down and enjoy the park together.';
    }
    if (has('forest') || has('wildlife')) {
      return 'Wooded, uncrowded country — wildlife and nature at a pace that works for two.';
    }
    if (has('photography') && has('scenic')) {
      return 'Photogenic and unhurried — great light and viewpoints without fighting tour buses.';
    }
    return 'Quiet and couple-friendly — scenic, relaxed, and not built around peak-season gridlock.';
  }

  if (flags.quiet && flags.beginners) {
    return 'Low-stress and peaceful — good scenery without committing to a hard backcountry trip.';
  }

  if (flags.quiet) {
    return 'Fits a peaceful trip — slower pace and scenery without the worst of the crowd magnets.';
  }

  if (flags.couples) {
    if (has('ocean') || has('lake')) {
      return 'Strong couples pick — shared views, scenic drives, and memorable sunsets.';
    }
    return 'Works well for two — scenic, relaxed, and easy to plan around.';
  }

  if (flags.beginners) {
    return 'Beginner-friendly — approachable scenery and trails without needing expert gear.';
  }

  if (flags.photography) {
    return 'Photo-friendly — strong light, viewpoints, and landscapes worth the drive.';
  }

  if (flags.ocean) {
    return 'Coastal scenery — shorelines and open water without flying to the usual suspects only.';
  }

  if (flags.hiking) {
    return 'Trail-rich — hiking is a real part of the visit, not just a scenic drive-through.';
  }

  if (flags.family) {
    return 'Family-friendly pacing — approachable activities and scenery for mixed ages.';
  }

  const labels = matchedTraits
    .slice(0, 2)
    .map((t) => TRAIT_LABELS[t])
    .filter(Boolean);

  if (labels.length === 2) {
    return `A solid fit — ${labels[0]} and ${labels[1]}.`;
  }
  if (labels.length === 1) {
    return `A solid fit for ${labels[0]}.`;
  }
  return 'Matches what you searched for.';
}

const {
  OCEAN_COAST_STATES,
  parkHasOceanCoastAccess,
} = require('./coastGeography');

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
 * @param {{ label: string, weight: number }[]} [primaryIntents]
 * @param {string} [query]
 * @returns {{ matchReason: string, matchedTraits: string[] }}
 */
function buildMatchExplanation(park, traitIntent, queryTokens = [], primaryIntents = [], query = '') {
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

  const nameTokens = tokenizeNameSearchQuery(query || queryTokens.join(' '));

  if (matchedTraits.length === 0 && nameTokens.length > 0 && parkNameMatchesAllTokens(park, nameTokens)) {
    return {
      matchReason: `Name matches "${nameTokens.join(' ')}".`,
      matchedTraits: [],
    };
  }

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

  const matchReason = buildNaturalMatchReason(park, matchedTraits, primaryIntents);

  return { matchReason, matchedTraits };
}

module.exports = {
  TRAIT_LABELS,
  OCEAN_COAST_STATES,
  parkHasOceanCoastAccess,
  filterGeographicTraits,
  buildMatchExplanation,
};
