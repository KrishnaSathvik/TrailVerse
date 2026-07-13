/** Central Open Graph / Twitter share images (1200×630). */

export const OG_SIZE = { width: 1200, height: 630 };

/** @typedef {'landing'|'explore'|'map'|'trailie'|'events'|'itineraries'|'discover'|'compare'|'guides'|'crowd-calendar'|'default'} OgKey */

/** @type {Record<OgKey, { path: string, alt: string }>} */
export const OG_IMAGES = {
  landing: {
    path: '/og/landing.jpg',
    alt: 'TrailVerse — Plan smarter national park trips',
  },
  explore: {
    path: '/og/explore.jpg',
    alt: 'TrailVerse — Explore 470+ parks & sites',
  },
  map: {
    path: '/og/map.jpg',
    alt: 'TrailVerse — Interactive parks map',
  },
  trailie: {
    path: '/og/trailie.jpg',
    alt: 'Trailie — Your national park trip planner on TrailVerse',
  },
  events: {
    path: '/og/events.jpg',
    alt: 'TrailVerse — National park events',
  },
  itineraries: {
    path: '/og/itineraries.jpg',
    alt: 'TrailVerse — Sample trips planned by Trailie',
  },
  discover: {
    path: '/og/discover.jpg',
    alt: 'TrailVerse — Explore parks by activity',
  },
  compare: {
    path: '/og/compare.jpg',
    alt: 'TrailVerse — Compare parks side by side',
  },
  guides: {
    path: '/og/guides.jpg',
    alt: 'TrailVerse — National park planning guides',
  },
  'crowd-calendar': {
    path: '/og/crowd-calendar.jpg',
    alt: 'TrailVerse — National park crowd calendar',
  },
  default: {
    path: '/og-image-trailverse.jpg',
    alt: 'TrailVerse — Explore U.S. parks and public lands',
  },
};

/**
 * Next.js metadata openGraph/twitter image objects for a named OG asset.
 * @param {OgKey} key
 * @param {string} [altOverride]
 */
export function ogImageMeta(key, altOverride) {
  const entry = OG_IMAGES[key] || OG_IMAGES.default;
  const alt = altOverride || entry.alt;
  return {
    openGraphImages: [{ url: entry.path, ...OG_SIZE, alt }],
    twitterImages: [entry.path],
    path: entry.path,
    alt,
  };
}
