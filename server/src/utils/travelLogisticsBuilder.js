'use strict';

/**
 * Travel & Stay Logistics v1 — pure builder.
 * No network I/O, no provider clients, no HTTP.
 */

const {
  emptyTravelLogistics,
  emptyProvenance,
  buildDriveLegId,
  metersToMiles,
} = require('./travelLogisticsContract');
const {
  normalizeCampgroundsForLogistics,
} = require('../services/campgroundStayAdapter');

function minutesFromDurationSeconds(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.max(1, Math.round(n / 60));
}

function resolveDepartureStatus(departure = {}) {
  if (departure.city || departure.airportCode) return 'available';
  return 'not_requested';
}

function resolveDriveCapStatus(needsRouteLegs, maxDailyDriveMinutes) {
  if (!needsRouteLegs) return 'not_requested';
  if (maxDailyDriveMinutes != null && Number.isFinite(Number(maxDailyDriveMinutes))) {
    return 'available';
  }
  return 'unknown';
}

function buildFeasibility(durationMinutes, maxDailyDriveMinutes) {
  if (maxDailyDriveMinutes == null || !Number.isFinite(Number(maxDailyDriveMinutes))) {
    return null;
  }
  const cap = Number(maxDailyDriveMinutes);
  const driveMinutes = durationMinutes ?? null;
  const exceedsDailyDriveCap = driveMinutes != null && cap > 0 && driveMinutes > cap;
  return {
    exceedsDailyDriveCap,
    maxDailyDriveMinutes: cap,
    driveDurationMinutes: driveMinutes,
  };
}

function buildRouteLegFromEvidence(evidence, { maxDailyDriveMinutes, travelMode } = {}) {
  const durationMinutes = minutesFromDurationSeconds(evidence.durationSeconds);
  const distanceMeters = Number.isFinite(Number(evidence.distanceMeters))
    ? Number(evidence.distanceMeters)
    : null;
  const distanceMiles = metersToMiles(distanceMeters);
  const evidenceStatus = evidence.status || 'unknown';

  return {
    legId: buildDriveLegId({
      originEntityId: evidence.originEntityId,
      destinationEntityId: evidence.destinationEntityId,
      travelMode: travelMode || 'drive',
    }),
    originEntityId: evidence.originEntityId,
    destinationEntityId: evidence.destinationEntityId,
    originLabel: evidence.originLabel ?? null,
    destinationLabel: evidence.destinationLabel ?? null,
    durationMinutes,
    distanceMeters,
    distanceMiles,
    evidenceStatus,
    feasibility: buildFeasibility(durationMinutes, maxDailyDriveMinutes),
    provenance: {
      ...emptyProvenance(),
      sourceType: 'google_maps',
      sourceName: 'Google Maps',
      evidenceStatus,
    },
  };
}

function buildRouteLegs(routeLegEvidence = [], { maxDailyDriveMinutes, travelMode } = {}) {
  const legs = [];
  for (const evidence of routeLegEvidence) {
    if (!evidence || typeof evidence !== 'object') continue;
    if (!evidence.originEntityId || !evidence.destinationEntityId) continue;
    const durationMinutes = minutesFromDurationSeconds(evidence.durationSeconds);
    if (durationMinutes == null) continue;
    legs.push(buildRouteLegFromEvidence(evidence, { maxDailyDriveMinutes, travelMode }));
  }
  return legs;
}

function buildAirportOption(airport) {
  if (!airport?.airportCode || !airport?.name) return null;
  const transfer = airport.groundTransfer;
  const durationMinutes = minutesFromDurationSeconds(transfer?.durationSeconds);
  const distanceMeters = Number.isFinite(Number(transfer?.distanceMeters))
    ? Number(transfer.distanceMeters)
    : null;
  if (durationMinutes == null || distanceMeters == null) return null;

  const evidenceStatus = transfer.evidenceStatus || airport.evidenceStatus || 'verified';
  return {
    airportCode: String(airport.airportCode).toUpperCase(),
    entityId: airport.entityId || null,
    name: airport.name,
    groundTransfer: {
      durationMinutes,
      distanceMeters,
      distanceMiles: metersToMiles(distanceMeters),
      destinationLabel: transfer.destinationLabel || null,
      evidenceStatus,
    },
    evidenceStatus,
    provenance: {
      ...emptyProvenance(),
      sourceType: 'google_maps',
      sourceName: 'Google Maps',
      evidenceStatus,
    },
  };
}

function buildAirports({ needsAirports, airports, airportError }) {
  if (!needsAirports) return { status: 'not_requested', airports: [] };
  if (airportError) return { status: 'provider_unavailable', airports: [] };

  const options = (Array.isArray(airports) ? airports : [])
    .map(buildAirportOption)
    .filter(Boolean);
  return {
    status: options.length > 0 ? 'available' : 'no_results',
    airports: options,
  };
}

function buildInsideParkStay(entry) {
  return {
    propertyId: entry.propertyId,
    parkCode: entry.parkCode,
    placeId: null,
    name: entry.name,
    propertyType: entry.propertyType || 'lodge',
    locationClass: 'inside_park',
    rating: null,
    address: null,
    officialUrl: entry.officialUrl || null,
    reservationUrl: entry.reservationUrl || null,
    mapsUrl: null,
    amenitiesSummary: null,
    rvSuitable: null,
    evidenceStatus: 'verified',
    provenance: {
      ...emptyProvenance(),
      sourceType: 'curated_catalog',
      sourceName: entry.source || entry.operator || null,
      evidenceStatus: 'verified',
      sourceUpdatedAt: entry.sourceVerifiedAt || null,
      officialUrl: entry.sourceUrl || entry.officialUrl || null,
    },
  };
}

function buildInsideParkStays({
  needsInsideParkLodging,
  parkCode,
  insideParkCatalog,
  catalogCoverage,
}) {
  if (!needsInsideParkLodging) {
    return { status: 'not_verified', properties: [] };
  }

  const code = String(parkCode || '').trim().toLowerCase();
  const catalogRows = Array.isArray(insideParkCatalog) ? insideParkCatalog : [];
  const verifiedNone = catalogCoverage === true && catalogRows.some((entry) => (
    entry
    && entry.verifiedNone === true
    && String(entry.parkCode || '').trim().toLowerCase() === code
  ));
  const properties = catalogRows
    .filter((entry) => (
      entry
      && entry.verifiedNone !== true
      && entry.locationClass === 'inside_park'
      && String(entry.parkCode || '').trim().toLowerCase() === code
      && entry.propertyId
      && entry.name
    ))
    .map(buildInsideParkStay);

  if (catalogCoverage === true && properties.length > 0) {
    return { status: 'verified', properties };
  }
  if (verifiedNone) {
    return { status: 'verified_none', properties: [] };
  }
  return { status: 'not_verified', properties: [] };
}

function buildGatewayStay(place) {
  return {
    propertyId: `google-place:${place.placeId}`,
    parkCode: null,
    placeId: place.placeId,
    name: place.name,
    propertyType: place.propertyType || 'hotel',
    locationClass: 'gateway',
    rating: Number.isFinite(Number(place.rating)) ? Number(place.rating) : null,
    address: place.address || null,
    officialUrl: place.officialUrl || place.websiteUrl || null,
    reservationUrl: null,
    mapsUrl: place.mapsUrl || null,
    amenitiesSummary: Array.isArray(place.amenitiesSummary) ? place.amenitiesSummary : null,
    rvSuitable: null,
    evidenceStatus: 'verified',
    provenance: {
      ...emptyProvenance(),
      sourceType: 'google_places',
      sourceName: 'Google Places',
      evidenceStatus: 'verified',
      observedAt: place.observedAt || null,
      officialUrl: place.officialUrl || place.websiteUrl || place.mapsUrl || null,
    },
  };
}

function buildGatewayStays({
  needsGatewayLodging,
  gatewayPlaces,
  gatewayAreaLabel,
  gatewayError,
}) {
  if (!needsGatewayLodging) {
    return { status: 'not_requested', areaLabel: null, properties: [] };
  }
  if (gatewayError) {
    return {
      status: 'provider_unavailable',
      areaLabel: gatewayAreaLabel || null,
      properties: [],
    };
  }

  const properties = (Array.isArray(gatewayPlaces) ? gatewayPlaces : [])
    .filter((place) => place && place.placeId && place.name)
    .map(buildGatewayStay);

  return {
    status: properties.length > 0 ? 'available' : 'no_results',
    areaLabel: gatewayAreaLabel || null,
    properties,
  };
}

function buildCampgroundStays({
  needsCampgrounds,
  campgroundAdapterOutput,
  npsCampgrounds,
  rvFilter,
  parkCode,
  campgroundError,
}) {
  if (!needsCampgrounds) {
    return { status: 'not_requested', properties: [] };
  }
  if (campgroundError) {
    return { status: 'provider_unavailable', properties: [] };
  }
  if (
    campgroundAdapterOutput
    && typeof campgroundAdapterOutput === 'object'
    && typeof campgroundAdapterOutput.status === 'string'
    && Array.isArray(campgroundAdapterOutput.properties)
  ) {
    return {
      status: campgroundAdapterOutput.status,
      properties: campgroundAdapterOutput.properties,
    };
  }
  return normalizeCampgroundsForLogistics({
    npsCampgrounds,
    rvFilter,
    parkCode,
  });
}

function buildVacationRentalHint({ needsVacationRentalHint, gatewayAreaLabel }) {
  if (!needsVacationRentalHint) {
    return null;
  }

  const label = typeof gatewayAreaLabel === 'string' ? gatewayAreaLabel.trim() : '';
  const areas = label ? [label] : [];
  const areaPhrase = label || 'the park gateway area';
  const externalSearchHint = `Search vacation rentals near ${areaPhrase} on Airbnb, VRBO, or similar platforms. TrailVerse does not list specific properties or prices.`;

  return {
    status: 'available',
    areas,
    externalSearchHint,
  };
}

function buildTravelLogistics(inputs = {}) {
  const {
    needs = {},
    transportMode = 'unknown',
    departure = {},
    routeLegEvidence = [],
    driveCap = {},
    airports = [],
    parkCode = null,
    parkName = null,
    entityId = null,
    insideParkCatalog = [],
    catalogCoverage = false,
    gatewayPlaces = [],
    gatewayAreaLabel = null,
    npsCampgrounds,
    campgroundAdapterOutput = null,
    accommodationClass = 'unknown',
    stayPreference = 'unknown',
    adapterErrors = {},
  } = inputs;

  const result = emptyTravelLogistics();
  const normalizedParkCode = parkCode ? String(parkCode).toLowerCase() : null;
  result.destination = {
    parkCode: normalizedParkCode,
    parkName: parkName || null,
    entityId: entityId || (normalizedParkCode ? `nps:park:${normalizedParkCode}` : null),
  };
  const needsRouteLegs = Boolean(needs.routeLegs);
  const maxDailyDriveMinutes = driveCap.maxDailyDriveMinutes ?? null;

  result.transport.mode = transportMode || 'unknown';
  result.transport.departure = {
    city: departure.city ?? null,
    airportCode: departure.airportCode ?? null,
    status: resolveDepartureStatus(departure),
  };
  result.transport.driveCap = {
    maxDailyDriveMinutes: needsRouteLegs ? maxDailyDriveMinutes : null,
    status: resolveDriveCapStatus(needsRouteLegs, maxDailyDriveMinutes),
  };

  if (needsRouteLegs) {
    const routeLegs = buildRouteLegs(routeLegEvidence, {
      maxDailyDriveMinutes,
      travelMode: transportMode,
    });
    result.transport.routeLegs = routeLegs;
    result.transport.routeLegsStatus = routeLegs.length > 0 ? 'available' : 'no_results';
  }

  const airportSlice = buildAirports({
    needsAirports: Boolean(needs.airports),
    airports,
    airportError: adapterErrors.airports,
  });
  result.transport.airportsStatus = airportSlice.status;
  result.transport.airports = airportSlice.airports;

  result.stays.accommodationClass = accommodationClass || 'unknown';
  result.stays.stayPreference = stayPreference || 'unknown';
  result.stays.insidePark = buildInsideParkStays({
    needsInsideParkLodging: Boolean(needs.insideParkLodging),
    parkCode,
    insideParkCatalog,
    catalogCoverage,
  });
  result.stays.gateway = buildGatewayStays({
    needsGatewayLodging: Boolean(needs.gatewayLodging),
    gatewayPlaces,
    gatewayAreaLabel,
    gatewayError: adapterErrors.gateway,
  });
  result.stays.campgrounds = buildCampgroundStays({
    needsCampgrounds: Boolean(needs.campgrounds),
    campgroundAdapterOutput,
    npsCampgrounds,
    rvFilter: Boolean(needs.rvFilter),
    parkCode,
    campgroundError: adapterErrors.campgrounds,
  });
  result.stays.vacationRentalHint = buildVacationRentalHint({
    needsVacationRentalHint: Boolean(needs.vacationRentalHint),
    gatewayAreaLabel,
  });

  return result;
}

module.exports = {
  buildTravelLogistics,
};
