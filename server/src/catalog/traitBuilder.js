/**
 * Deterministic trait scores (0–1) from park text signals. Phase 2 v1 — no ML.
 */

const TRAIT_BUMP = 0.3;
const ACTIVITY_BUMP = 0.4;
const CATEGORY_BUMP = 0.35;

/** Short keywords where prefix matching causes false positives (e.g. ice → Iceman, ski → skies). */
const EXACT_DESCRIPTION_KEYWORDS = new Set(['ice']);

const OCEAN_SPECIFIC_KEYWORDS = ['ocean', 'seashore', 'tidal', 'marine', 'atlantic', 'pacific', 'gulf', 'coral', 'reef'];
/** Coast/shore/beach language on lakes — not ocean; gated by {@link isLakeShoreContext}. */
const OCEAN_GENERIC_COASTAL_KEYWORDS = ['coast', 'coastal', 'shoreline', 'shore', 'beach'];

/** @type {Record<string, { description?: string[], activities?: string[], categories?: string[] }>} */
const TRAIT_SIGNALS = {
  ocean: {
    description: OCEAN_SPECIFIC_KEYWORDS,
    // Lake/river boating and fishing belong under `water`, not ocean
    activities: ['beach', 'beachcombing', 'surfing'],
    categories: ['national_seashore'],
  },
  water: {
    description: ['river', 'lake', 'bay', 'harbor', 'waterfall', 'creek', 'wetland', 'marsh'],
    activities: ['boating', 'kayak', 'canoe', 'fishing', 'swimming', 'rafting', 'snorkel', 'snorkeling'],
    categories: ['national_lakeshore', 'national_river'],
  },
  lake: {
    description: ['lake', 'lakeshore', 'reservoir'],
    categories: ['national_lakeshore'],
  },
  forest: {
    description: ['forest', 'woodland', 'trees', 'redwood', 'grove', 'timber'],
    activities: ['hiking', 'backpack', 'wilderness'],
  },
  mountains: {
    description: ['mountain', 'alpine', 'peak', 'summit', 'canyon', 'cliff', 'volcanic'],
    activities: ['climbing', 'mountaineer', 'backpack'],
  },
  waterfalls: {
    description: ['waterfall', 'falls', 'cascade'],
  },
  wildlife: {
    description: ['wildlife', 'bird', 'elk', 'bison', 'bear', 'habitat', 'sanctuary'],
    activities: ['wildlife', 'birding', 'bird watch'],
  },
  scenic: {
    description: ['scenic', 'vista', 'viewpoint', 'panoram', 'landscape', 'overlook'],
    activities: ['scenic', 'sightseeing'],
  },
  hiking: {
    description: ['trail', 'hike', 'backcountry'],
    activities: ['hiking', 'backpack', 'walk', 'trek'],
  },
  camping: {
    description: ['campground', 'camping'],
    activities: ['camping', 'camp', 'backpack'],
  },
  familyFriendly: {
    description: ['family', 'kid', 'children', 'junior ranger', 'accessible'],
    activities: ['junior ranger', 'playground'],
  },
  accessibility: {
    description: ['accessible', 'wheelchair', 'ada', 'accessibility', 'barrier-free'],
    activities: ['accessible'],
  },
  romantic: {
    description: ['sunset', 'romantic', 'scenic drive', 'stargaz'],
    activities: ['stargaz'],
  },
  relaxing: {
    description: ['peaceful', 'quiet', 'serene', 'relax', 'hot spring'],
    activities: ['fishing', 'scenic'],
  },
  photography: {
    description: ['photograph', 'scenic', 'sunrise', 'sunset', 'viewpoint', 'landscape'],
    activities: ['photograph', 'scenic'],
  },
  winter: {
    description: ['snow', 'winter', 'skiing', 'snowy', 'ice', 'frozen'],
    activities: ['ski', 'snowshoe', 'winter'],
  },
  nature: {
    description: ['nature', 'preserve', 'wilderness', 'ecosystem', 'prairie', 'desert'],
    categories: ['national_park', 'national_preserve', 'national_monument'],
  },
};

/**
 * @param {Record<string, number>} traits
 * @param {string} trait
 * @param {number} amount
 */
function bumpTrait(traits, trait, amount) {
  traits[trait] = Math.min(1, (traits[trait] || 0) + amount);
}

/**
 * @param {string} text
 * @param {string[]} keywords
 * @returns {boolean}
 */
function textHasAny(text, keywords = []) {
  if (!text) return false;
  return keywords.some((kw) => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = EXACT_DESCRIPTION_KEYWORDS.has(kw)
      ? `\\b${escaped}\\b`
      : `\\b${escaped}\\w*\\b`;
    return new RegExp(pattern, 'i').test(text);
  });
}

/**
 * Activity names are discrete labels — require whole-word match (e.g. Boating ≠ ocean by itself).
 * @param {string} activityText
 * @param {string[]} keywords
 * @returns {boolean}
 */
function activitiesHaveAny(activityText, keywords = []) {
  if (!activityText) return false;
  return keywords.some((kw) => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(activityText);
  });
}

/**
 * Great Lakes / inland shorelines use coast/shore language without being ocean parks.
 * @param {string} description
 * @param {string} category
 * @returns {boolean}
 */
function isLakeShoreContext(description, category) {
  const d = (description || '').toLowerCase();
  const cat = (category || '').toLowerCase();
  if (cat === 'national_lakeshore' || cat === 'national_river') return true;
  if (/\blake\b/.test(d) && !/\b(ocean|pacific|atlantic|gulf|sea)\b/.test(d)) return true;
  return textHasAny(description, [
    'great lake',
    'lake superior',
    'lake michigan',
    'lake huron',
    'lake erie',
    'lake ontario',
    'inland lake',
    'freshwater lake',
    'reservoir',
  ]);
}

/**
 * @param {string} trait
 * @param {string} description
 * @param {string} category
 * @returns {string[]|undefined}
 */
function descriptionKeywordsForTrait(trait, description, category) {
  if (trait !== 'ocean') return TRAIT_SIGNALS[trait]?.description;
  const keywords = [...OCEAN_SPECIFIC_KEYWORDS];
  if (!isLakeShoreContext(description, category)) {
    keywords.push(...OCEAN_GENERIC_COASTAL_KEYWORDS);
  }
  return keywords;
}

/**
 * @param {import('./canonicalPark').CanonicalPark|object} park
 * @returns {import('./canonicalPark').CanonicalParkTraits}
 */
function buildParkTraits(park) {
  const traits = {};
  const description = (park.description || '').toLowerCase();
  const category = (park.category || '').toLowerCase();
  const activityText = (park.activities || [])
    .map((a) => String(a).toLowerCase())
    .join(' ');

  const lakeShore = isLakeShoreContext(description, category);

  for (const [trait, signals] of Object.entries(TRAIT_SIGNALS)) {
    const descKeywords = descriptionKeywordsForTrait(trait, description, category);
    if (textHasAny(description, descKeywords)) {
      bumpTrait(traits, trait, TRAIT_BUMP);
    }
    if (
      signals.activities &&
      !(trait === 'ocean' && lakeShore) &&
      activitiesHaveAny(activityText, signals.activities)
    ) {
      bumpTrait(traits, trait, ACTIVITY_BUMP);
    }
    if (signals.categories?.includes(category)) {
      bumpTrait(traits, trait, CATEGORY_BUMP);
    }
  }

  // Cross-trait hints from strong primary signals
  if (traits.ocean >= 0.5) bumpTrait(traits, 'water', 0.2);
  if (traits.waterfalls >= 0.3) bumpTrait(traits, 'water', 0.2);
  if (traits.hiking >= 0.5) bumpTrait(traits, 'nature', 0.15);
  if (traits.scenic >= 0.5) bumpTrait(traits, 'photography', 0.2);

  for (const key of Object.keys(traits)) {
    traits[key] = Math.round(traits[key] * 100) / 100;
  }

  return traits;
}

module.exports = {
  TRAIT_SIGNALS,
  OCEAN_SPECIFIC_KEYWORDS,
  OCEAN_GENERIC_COASTAL_KEYWORDS,
  isLakeShoreContext,
  buildParkTraits,
};
