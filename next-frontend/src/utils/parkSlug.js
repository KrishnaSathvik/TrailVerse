import parkSlugsData from '@/data/park-slugs.json';

export function parkToSlug(fullName) {
  if (!fullName) return '';
  return fullName
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// Build reverse lookup: slug → parkCode (lazy-initialized)
let _slugMap = null;

function getSlugMap() {
  if (_slugMap) return _slugMap;
  _slugMap = new Map();
  for (const park of parkSlugsData) {
    const slug = parkToSlug(park.fullName);
    if (slug && park.parkCode) {
      _slugMap.set(slug, park.parkCode);
    }
  }
  return _slugMap;
}

/**
 * Reverse lookup: given a URL slug, return the NPS park code.
 * e.g. "yellowstone-national-park" → "yell"
 */
export function slugToParkCode(slug) {
  if (!slug) return null;
  return getSlugMap().get(slug) || null;
}

// Secondary map: slug-with-"and-"-stripped → correct slug (lazy-initialized)
let _correctionMap = null;

function getCorrectionMap() {
  if (_correctionMap) return _correctionMap;
  _correctionMap = new Map();
  const slugMap = getSlugMap();
  for (const [correctSlug] of slugMap) {
    // Strip all occurrences of "and-" or "-and" to build correction keys
    const stripped = correctSlug.replace(/-and-/g, '-').replace(/-and$/g, '');
    if (stripped !== correctSlug) {
      _correctionMap.set(stripped, correctSlug);
    }
  }
  return _correctionMap;
}

/**
 * Attempt to find the correct slug for a mistyped/old slug.
 * Handles cases where "&" was dropped instead of converted to "and"
 * (e.g. "denali-national-park-preserve" → "denali-national-park-and-preserve").
 * Returns the correct slug or null.
 */
export function findCorrectSlug(badSlug) {
  if (!badSlug) return null;
  return getCorrectionMap().get(badSlug) || null;
}
