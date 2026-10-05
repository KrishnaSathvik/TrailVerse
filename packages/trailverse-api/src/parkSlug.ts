import parkSlugsData from './data/park-slugs.json';

type ParkSlugEntry = { parkCode: string; fullName: string };

export function parkToSlug(fullName: string): string {
  if (!fullName) return '';
  return fullName
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

let slugMap: Map<string, string> | null = null;

function getSlugMap(): Map<string, string> {
  if (slugMap) return slugMap;
  slugMap = new Map();
  for (const park of parkSlugsData as ParkSlugEntry[]) {
    const slug = parkToSlug(park.fullName);
    if (slug && park.parkCode) {
      slugMap.set(slug, park.parkCode);
    }
  }
  return slugMap;
}

/** e.g. "yellowstone-national-park" → "yell" */
export function slugToParkCode(slug: string): string | null {
  if (!slug) return null;
  return getSlugMap().get(slug) || null;
}

let correctionMap: Map<string, string> | null = null;

function getCorrectionMap(): Map<string, string> {
  if (correctionMap) return correctionMap;
  correctionMap = new Map();
  for (const [correctSlug] of getSlugMap()) {
    const stripped = correctSlug.replace(/-and-/g, '-').replace(/-and$/g, '');
    if (stripped !== correctSlug) {
      correctionMap.set(stripped, correctSlug);
    }
  }
  return correctionMap;
}

export function findCorrectSlug(badSlug: string): string | null {
  if (!badSlug) return null;
  return getCorrectionMap().get(badSlug) || null;
}

/**
 * Resolve a URL segment to NPS park code.
 * Accepts 4-char codes or full slugs.
 */
export function resolveParkIdentifier(identifier: string): {
  parkCode: string | null;
  slug: string | null;
} {
  const raw = (identifier || '').trim().toLowerCase();
  if (!raw) return { parkCode: null, slug: null };

  if (raw.length <= 4) {
    return { parkCode: raw, slug: null };
  }

  let slug = raw;
  const corrected = findCorrectSlug(raw);
  if (corrected) slug = corrected;

  const parkCode = slugToParkCode(slug);
  return { parkCode, slug };
}
