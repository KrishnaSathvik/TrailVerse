'use strict';

const { emptyProvenance } = require('../utils/travelLogisticsContract');

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function yes(value) {
  return typeof value === 'string' && value.trim().toLowerCase().startsWith('yes');
}

function no(value) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'no';
}

function determineRvSuitability(campground) {
  const campsites = campground?.campsites;
  const amenities = campground?.amenities;
  const rvFields = ['rvOnly', 'electricalHookups'];

  if (rvFields.some((field) => positiveNumber(campsites?.[field]))) return true;
  if (yes(amenities?.dumpStation)) return true;

  const hasRvCounts = rvFields.some((field) => hasOwn(campsites, field));
  const hasDumpStation = hasOwn(amenities, 'dumpStation');
  if (hasRvCounts || hasDumpStation) {
    const countsAreNonPositive = rvFields.every((field) => (
      !hasOwn(campsites, field) || !positiveNumber(campsites[field])
    ));
    const dumpIsAbsent = !hasDumpStation || no(amenities.dumpStation);
    if (countsAreNonPositive && dumpIsAbsent) return false;
  }

  return null;
}

function values(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (value == null || value === '') return [];
  return [String(value)];
}

function buildAmenitiesSummary(campground) {
  const summary = [];
  const fees = Array.isArray(campground.fees) ? campground.fees : [];
  for (const fee of fees) {
    if (!fee || fee.cost == null || fee.cost === '') continue;
    const label = fee.title || fee.description || 'Campground fee';
    summary.push(`${label}: $${fee.cost}`);
  }

  const campsites = campground.campsites || {};
  if (positiveNumber(campsites.totalSites)) {
    summary.push(`${campsites.totalSites} total sites`);
  }
  if (positiveNumber(campsites.rvOnly)) {
    summary.push(`${campsites.rvOnly} RV-only sites`);
  }
  if (positiveNumber(campsites.electricalHookups)) {
    summary.push(`${campsites.electricalHookups} electrical hookup sites`);
  }

  const amenities = campground.amenities || {};
  for (const value of values(amenities.potableWater)) {
    summary.push(`Potable water: ${value}`);
  }
  for (const value of values(amenities.toilets)) {
    summary.push(`Toilets: ${value}`);
  }
  for (const value of values(amenities.showers)) {
    summary.push(`Showers: ${value}`);
  }
  if (yes(amenities.dumpStation)) summary.push('Dump station');
  if (yes(amenities.campStore)) summary.push('Camp store');
  if (yes(amenities.firewoodForSale)) summary.push('Firewood for sale');

  return summary.length > 0 ? summary : null;
}

function campgroundPropertyId(campground, parkCode) {
  if (campground.id) return `nps-campground:${campground.id}`;
  const nameKey = String(campground.name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const parkKey = String(campground.parkCode || parkCode || 'unknown').trim().toLowerCase();
  return nameKey ? `nps-campground:${parkKey}:${nameKey}` : null;
}

function normalizeCampground(campground, parkCode) {
  if (!campground || typeof campground !== 'object' || !campground.name) return null;
  const propertyId = campgroundPropertyId(campground, parkCode);
  if (!propertyId) return null;

  const normalizedParkCode = String(campground.parkCode || parkCode || '').trim().toLowerCase() || null;
  const officialUrl = campground.url || null;
  const reservationUrl = campground.reservationUrl || null;

  return {
    propertyId,
    parkCode: normalizedParkCode,
    placeId: null,
    name: campground.name,
    propertyType: 'campground',
    locationClass: 'unknown',
    rating: null,
    address: campground.address || null,
    officialUrl,
    reservationUrl,
    mapsUrl: null,
    amenitiesSummary: buildAmenitiesSummary(campground),
    rvSuitable: determineRvSuitability(campground),
    evidenceStatus: 'verified',
    provenance: {
      ...emptyProvenance(),
      sourceType: 'nps',
      sourceName: 'National Park Service',
      evidenceStatus: 'verified',
      officialUrl: officialUrl || reservationUrl,
    },
  };
}

function normalizeCampgroundsForLogistics({
  npsCampgrounds,
  rvFilter = false,
  parkCode = null,
} = {}) {
  if (
    npsCampgrounds
    && typeof npsCampgrounds === 'object'
    && !Array.isArray(npsCampgrounds)
    && (npsCampgrounds.error || npsCampgrounds.unavailable)
  ) {
    return { status: 'provider_unavailable', properties: [] };
  }

  if (npsCampgrounds == null || !Array.isArray(npsCampgrounds)) {
    return { status: 'not_verified', properties: [] };
  }

  let properties = npsCampgrounds
    .map((campground) => normalizeCampground(campground, parkCode))
    .filter(Boolean);

  if (rvFilter) {
    properties = properties.filter((property) => property.rvSuitable === true);
    return { status: 'available', properties };
  }

  return {
    status: properties.length > 0 ? 'available' : 'no_results',
    properties,
  };
}

module.exports = {
  normalizeCampgroundsForLogistics,
};
