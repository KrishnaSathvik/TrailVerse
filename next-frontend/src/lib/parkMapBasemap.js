/**
 * Basemap styles for /map — NPS Park Tiles–inspired outdoors cartography.
 * Prefer MapTiler Outdoor (vector, hillshade) when NEXT_PUBLIC_MAPTILER_KEY is set.
 * Falls back to OpenTopoMap raster (free, no key) for local dev.
 */

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

/** Cream paper tone used while tiles load (matches NPS Park Tiles Standard) */
export const PARK_MAP_LOADING_BG = '#f4f0e6';

/** Dark slate while tiles load (NPS Park Tiles Slate–inspired) */
export const PARK_MAP_DARK_LOADING_BG = '#1a1f1c';

function openTopoRasterStyle(isDark) {
  if (isDark) {
    return {
      version: 8,
      name: 'TrailVerse Park Map Dark',
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        carto: {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          ],
          tileSize: 256,
          attribution: '© OpenStreetMap © CARTO',
          maxzoom: 19,
        },
      },
      layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
    };
  }

  return {
    version: 8,
    name: 'TrailVerse Park Map Light',
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      opentopo: {
        type: 'raster',
        tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '© OpenTopoMap (CC-BY-SA)',
        maxzoom: 17,
      },
    },
    layers: [{ id: 'opentopo', type: 'raster', source: 'opentopo' }],
  };
}

/**
 * @param {boolean} isDark
 * @returns {string | object} MapLibre style URL or inline style spec
 */
export function getParkMapStyle(isDark) {
  if (MAPTILER_KEY) {
    return isDark
      ? `https://api.maptiler.com/maps/outdoor-v2-dark/style.json?key=${MAPTILER_KEY}`
      : `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`;
  }

  return openTopoRasterStyle(isDark);
}

/** True only for the 63 official "National Park" designation (not monuments, historic sites, etc.) */
export function isNationalParkDesignation(designation) {
  return designation === 'National Park';
}

/** MapLibre paint expression for park dot color by designation */
export function parkMarkerColorExpression(colors) {
  return [
    'case',
    ['==', ['to-number', ['get', 'isNationalPark']], 1],
    colors.nationalPark,
    colors.otherSite,
  ];
}

/** Green = National Parks, blue = all other NPS units (high contrast at map dot sizes) */
export function getParkMarkerColors(isDark) {
  if (isDark) {
    return {
      nationalPark: '#4ade80',
      otherSite: '#60a5fa',
      selectedRing: '#ffffff',
    };
  }
  return {
    nationalPark: '#2d6a4f',
    otherSite: '#2563eb',
    selectedRing: '#ffffff',
  };
}

/** What to See / places markers — violet, distinct from parks and campgrounds */
export function getPlaceMarkerColors(isDark) {
  if (isDark) {
    return {
      default: '#c4b5fd',
      selected: '#ede9fe',
      ring: '#ffffff',
    };
  }
  return {
    default: '#7c3aed',
    selected: '#8b5cf6',
    ring: '#ffffff',
  };
}

/** Campground markers — amber so they read clearly against park greens/blues */
export function getCampgroundMarkerColors(isDark) {
  if (isDark) {
    return {
      default: '#fbbf24',
      selected: '#fde68a',
      ring: '#ffffff',
    };
  }
  return {
    default: '#d97706',
    selected: '#f59e0b',
    ring: '#ffffff',
  };
}

/** @deprecated Use getParkMarkerColors(false) — kept for imports that expect static light colors */
export const PARK_MARKER = {
  nationalPark: '#2d6a4f',
  otherSite: '#2563eb',
  selectedRing: '#ffffff',
  selectedScale: 1.45,
};
