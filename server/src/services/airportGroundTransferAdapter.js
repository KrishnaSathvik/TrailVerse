'use strict';

const {
  getNearestAirports,
  getAirportByCode,
} = require('../utils/airportCoordinates');
const { buildAirportEntityId } = require('../utils/travelLogisticsContract');

const HARD_MAX_AIRPORTS = 3;

function normalizeLimit(maxAirports) {
  const parsed = Number(maxAirports);
  if (!Number.isFinite(parsed)) return HARD_MAX_AIRPORTS;
  return Math.max(0, Math.min(HARD_MAX_AIRPORTS, Math.floor(parsed)));
}

function buildDepartureContext(departureCity, departureAirportCode) {
  const airport = getAirportByCode(departureAirportCode);
  const normalizedCode = airport?.code
    || (departureAirportCode ? String(departureAirportCode).trim().toUpperCase() : null);
  return {
    city: departureCity || null,
    airportCode: normalizedCode,
    label: airport?.name || normalizedCode || departureCity || null,
  };
}

function validRouteResult(route) {
  return Number.isFinite(Number(route?.durationSeconds))
    && Number.isFinite(Number(route?.distanceMeters));
}

async function resolveAirportGroundTransfers({
  parkLat,
  parkLon,
  parkLabel,
  parkEntityId,
  departureCity = null,
  departureAirportCode = null,
  mapsGetRoute,
  maxAirports = HARD_MAX_AIRPORTS,
} = {}) {
  const departureContext = buildDepartureContext(departureCity, departureAirportCode);
  const limit = normalizeLimit(maxAirports);
  const airports = getNearestAirports(parkLat, parkLon, limit);

  if (airports.length === 0) {
    return { ok: true, status: 'no_results', departureContext, airports: [] };
  }
  if (typeof mapsGetRoute !== 'function' || !parkEntityId) {
    return { ok: false, status: 'provider_unavailable', departureContext, airports: [] };
  }

  const destination = {
    entityId: parkEntityId,
    latitude: Number(parkLat),
    longitude: Number(parkLon),
  };
  const departureTimeBucket = new Date().toISOString();
  const outcomes = await Promise.allSettled(airports.map(async (airport) => {
    const entityId = buildAirportEntityId(airport.code);
    const route = await mapsGetRoute({
      origin: {
        entityId,
        latitude: airport.lat,
        longitude: airport.lon,
      },
      destination,
      travelMode: 'driving',
      departureTimeBucket,
    });

    if (!validRouteResult(route)) return null;
    return {
      airportCode: airport.code,
      entityId,
      name: airport.name,
      groundTransfer: {
        durationSeconds: Number(route.durationSeconds),
        distanceMeters: Number(route.distanceMeters),
        destinationLabel: parkLabel || null,
        evidenceStatus: 'verified',
      },
    };
  }));

  const normalizedAirports = outcomes
    .filter((outcome) => outcome.status === 'fulfilled' && outcome.value)
    .map((outcome) => outcome.value);

  if (normalizedAirports.length > 0) {
    return {
      ok: true,
      status: 'available',
      departureContext,
      airports: normalizedAirports,
    };
  }

  const providerFailed = outcomes.some((outcome) => outcome.status === 'rejected');
  return {
    ok: !providerFailed,
    status: providerFailed ? 'provider_unavailable' : 'no_results',
    departureContext,
    airports: [],
  };
}

module.exports = {
  resolveAirportGroundTransfers,
};
