/**
 * Related-park ranking for park detail "You Might Also Like".
 * Mirrors next-frontend/src/lib/parkSeo.js sortRelatedParks + tier-A slugs.
 */

/** @see next-frontend/src/lib/parkSeo.js TIER_A_PARK_SLUGS */
const TIER_A_PARK_SLUGS = new Set([
  'yosemite-national-park',
  'grand-canyon-national-park',
  'zion-national-park',
  'yellowstone-national-park',
  'grand-teton-national-park',
  'acadia-national-park',
  'glacier-national-park',
  'black-canyon-of-the-gunnison-national-park',
  'death-valley-national-park',
  'arches-national-park',
  'canyonlands-national-park',
  'big-bend-national-park',
  'crater-lake-national-park',
  'glacier-bay-national-park-and-preserve',
  'rocky-mountain-national-park',
  'wrangell-st-elias-national-park-and-preserve',
  'capitol-reef-national-park',
  'bryce-canyon-national-park',
  'joshua-tree-national-park',
  'great-smoky-mountains-national-park',
  'olympic-national-park',
  'everglades-national-park',
  'denali-national-park-and-preserve',
  'sequoia-and-kings-canyon-national-parks',
  'badlands-national-park',
  'lassen-volcanic-national-park',
  'dry-tortugas-national-park',
  'indiana-dunes-national-park',
  'white-sands-national-park',
  'mount-rainier-national-park',
]);

function slugFromFullName(fullName) {
  if (!fullName) return '';
  return fullName
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function normalizeDesignation(park) {
  const designation = (park?.designation || '').toLowerCase();
  const name = (park?.fullName || '').toLowerCase();
  if (designation.includes('national park') || name.includes('national park')) {
    return 'national park';
  }
  if (name.includes('national monument') || designation.includes('national monument')) {
    return 'national monument';
  }
  if (name.includes('national historic') || designation.includes('national historic')) {
    return 'national historic';
  }
  if (name.includes('national recreation area')) return 'national recreation area';
  return designation || '';
}

function designationsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes('national park') && b.includes('national park')) return true;
  return false;
}

function isTierAPark(slug) {
  return TIER_A_PARK_SLUGS.has(slug);
}

/**
 * Rank same-state park suggestions: same designation → Tier A → name.
 * @param {object[]} candidates
 * @param {object} currentPark
 */
function sortRelatedParks(candidates, currentPark) {
  const currentCode = currentPark?.parkCode?.toLowerCase();
  const currentDesignation = normalizeDesignation(currentPark);

  return [...candidates]
    .filter((p) => p.parkCode?.toLowerCase() !== currentCode)
    .sort((a, b) => {
      const aSame = designationsMatch(normalizeDesignation(a), currentDesignation) ? 0 : 1;
      const bSame = designationsMatch(normalizeDesignation(b), currentDesignation) ? 0 : 1;
      if (aSame !== bSame) return aSame - bSame;

      const aSlug = slugFromFullName(a.fullName);
      const bSlug = slugFromFullName(b.fullName);
      const aTier = isTierAPark(aSlug) ? 0 : 1;
      const bTier = isTierAPark(bSlug) ? 0 : 1;
      if (aTier !== bTier) return aTier - bTier;

      return (a.fullName || '').localeCompare(b.fullName || '');
    });
}

function projectRelatedPark(park) {
  const firstImage = Array.isArray(park.images) && park.images.length > 0
    ? [park.images[0]]
    : [];

  return {
    parkCode: park.parkCode,
    fullName: park.fullName,
    states: park.states,
    designation: park.designation,
    images: firstImage,
  };
}

/**
 * @param {object} currentPark
 * @param {object[]} allParks
 * @param {number} limit
 */
function getRelatedParks(currentPark, allParks, limit = 4) {
  if (!currentPark?.states || !Array.isArray(allParks)) {
    return [];
  }

  const parkStates = currentPark.states.split(',').map((s) => s.trim()).filter(Boolean);
  const candidates = allParks.filter(
    (p) =>
      p.parkCode !== currentPark.parkCode &&
      parkStates.some((st) => p.states?.includes(st))
  );

  return sortRelatedParks(candidates, currentPark)
    .slice(0, limit)
    .map(projectRelatedPark);
}

module.exports = {
  getRelatedParks,
  sortRelatedParks,
  projectRelatedPark,
  slugFromFullName,
  TIER_A_PARK_SLUGS,
};
