/**
 * Maps NPS API park records ↔ CanonicalPark (Phase 1.5 catalog).
 */
const {
  createCanonicalPark,
  normalizeCategory,
} = require('../catalog/canonicalPark');
const { buildParkTraits } = require('../catalog/traitBuilder');

/**
 * @param {object} npsPark - Raw record from npsService / NPS API
 * @returns {import('../catalog/canonicalPark').CanonicalPark}
 */
function npsRecordToCanonical(npsPark) {
  const parkCode = (npsPark.parkCode || npsPark.code || '').toLowerCase();
  const activities = (npsPark.activities || []).map((a) =>
    typeof a === 'string' ? a : (a.name || '')
  ).filter(Boolean);

  const category = normalizeCategory(npsPark.designation || 'park');
  const draft = {
    id: parkCode || npsPark.id,
    sourceId: parkCode,
    name: npsPark.fullName || npsPark.name || '',
    source: 'nps',
    category,
    states: npsPark.states || '',
    description: npsPark.description || '',
    activities,
    amenities: [],
    location: {
      lat: parseFloat(npsPark.latitude) || null,
      lng: parseFloat(npsPark.longitude) || null,
    },
    traits: {},
    sourceRecord: npsPark,
  };
  draft.traits = buildParkTraits(draft);
  return createCanonicalPark(draft);
}

/**
 * API responses stay NPS-shaped until clients adopt CanonicalPark.
 * @param {import('../catalog/canonicalPark').CanonicalPark} park
 * @returns {object}
 */
function canonicalToApiPark(park) {
  const base = park.sourceRecord
    ? { ...park.sourceRecord }
    : {
    parkCode: park.sourceId || park.id,
    fullName: park.name,
    name: park.name,
    designation: park.category,
    states: park.states,
    description: park.description,
    latitude: park.location?.lat,
    longitude: park.location?.lng,
    activities: park.activities.map((name) => ({ name })),
  };

  if (park.searchMatch) {
    base.matchReason = park.searchMatch.matchReason;
    base.matchedTraits = park.searchMatch.matchedTraits;
  }

  return base;
}

/**
 * @param {object[]} npsParks
 * @returns {import('../catalog/canonicalPark').CanonicalPark[]}
 */
function npsRecordsToCanonical(npsParks) {
  return (npsParks || []).map(npsRecordToCanonical);
}

/**
 * @param {import('../catalog/canonicalPark').CanonicalPark[]} parks
 * @returns {object[]}
 */
function canonicalListToApiParks(parks) {
  return parks.map(canonicalToApiPark);
}

module.exports = {
  npsRecordToCanonical,
  npsRecordsToCanonical,
  canonicalToApiPark,
  canonicalListToApiParks,
};
