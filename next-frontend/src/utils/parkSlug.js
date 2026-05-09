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
