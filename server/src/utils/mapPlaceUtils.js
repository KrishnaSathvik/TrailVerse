/** Mirrors park detail "What to See" place tag cleanup (server-side). */

const PLACE_TAG_BLOCKLIST = new Set([
  'hot spring',
  'hydrothermal features',
  'thermophiles',
]);

function normalizePlaceTag(tag) {
  return String(tag || '').trim();
}

function isJunkPlaceTag(tag, parkName = '') {
  const t = normalizePlaceTag(tag);
  if (!t) return true;
  const lower = t.toLowerCase();
  if (lower.includes('national park')) return true;
  if (lower.length > 40) return true;
  if (PLACE_TAG_BLOCKLIST.has(lower)) return true;
  if (/\b(basin|area)\s*$/i.test(t)) return true;
  const parkLower = String(parkName || '').toLowerCase();
  if (parkLower && lower === parkLower) return true;
  return false;
}

function getDisplayPlaceTags(tags, parkName) {
  if (!Array.isArray(tags)) return [];
  return tags.map(normalizePlaceTag).filter((tag) => tag && !isJunkPlaceTag(tag, parkName));
}

function resolveParkCode(place) {
  return (
    place?.relatedParks?.[0]?.parkCode ||
    place?.parkCode ||
    null
  );
}

/**
 * @param {object} place NPS place record
 * @param {string} parkName
 * @returns {object | null} Slim map pin payload
 */
function normalizePlaceForMap(place, parkName) {
  const lat = Number.parseFloat(place.latitude);
  const lng = Number.parseFloat(place.longitude);
  const parkCode = resolveParkCode(place);
  const title = String(place.title || '').trim();

  if (!title || !parkCode || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    id: place.id,
    title,
    parkCode,
    parkName: parkName || parkCode.toUpperCase(),
    latitude: lat,
    longitude: lng,
    tags: getDisplayPlaceTags(place.tags, parkName),
  };
}

module.exports = {
  normalizePlaceForMap,
  getDisplayPlaceTags,
};
