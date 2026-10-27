import { OG_IMAGES, OG_SIZE } from '@/lib/ogImages';

const FALLBACK = OG_IMAGES.default;

function parkImageUrl(park) {
  const image = park?.images?.[0];
  if (!image) return '';
  if (typeof image === 'string') return image.trim();
  return String(image.url || '').trim();
}

function stateCodes(park) {
  return String(park?.states || '')
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}

export function isNationalPark(park) {
  return String(park?.designation || '').trim().toLowerCase() === 'national park';
}

function byName(parks) {
  return [...parks].sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
}

/**
 * First park in the given order that has a photo.
 * Callers put the page's featured parks first.
 * @param {object[]} parks
 * @returns {{ url: string, alt: string } | null}
 */
export function pickListedParkImage(parks) {
  for (const park of parks || []) {
    const url = parkImageUrl(park);
    if (!url) continue;
    return { url, alt: park.fullName || 'National park' };
  }
  return null;
}

/**
 * Photo for a state hub. Prefer a national park that belongs only to that state,
 * then any national park in the state, then any site in the state with a photo.
 * @param {object[]} parks
 * @param {string} stateCode
 * @param {string} stateName
 * @returns {{ url: string, alt: string } | null}
 */
export function pickStateParkImage(parks, stateCode, stateName) {
  const code = String(stateCode || '').trim().toUpperCase();
  const inState = (parks || []).filter((park) => stateCodes(park).includes(code) && parkImageUrl(park));
  const exclusiveNational = byName(
    inState.filter((park) => isNationalPark(park) && stateCodes(park).length === 1)
  );
  const anyNational = byName(inState.filter(isNationalPark));
  const anySite = byName(inState);
  const park = exclusiveNational[0] || anyNational[0] || anySite[0];
  if (!park) return null;
  return {
    url: parkImageUrl(park),
    alt: `${park.fullName} in ${stateName}`,
  };
}

/**
 * Featured parks on a discover page, then the rest of that page's parks.
 * @param {{ featured?: { parks?: object[] }, parks?: object[], title?: string }} detail
 */
export function pickDiscoverShareImage(detail) {
  const featured = detail?.featured?.parks || [];
  const listed = detail?.parks || [];
  const seen = new Set();
  const ordered = [];
  for (const park of [...featured, ...listed]) {
    const key = String(park?.parkCode || park?.fullName || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ordered.push(park);
  }
  return pickListedParkImage(ordered);
}

/**
 * @param {{ url: string, alt: string } | null | undefined} share
 * @param {string} fallbackAlt
 */
export function shareImageFields(share, fallbackAlt) {
  const url = share?.url || FALLBACK.path;
  const alt = share?.alt || fallbackAlt || FALLBACK.alt;
  return {
    openGraphImages: [{ url, ...OG_SIZE, alt }],
    twitterImages: [url],
  };
}
