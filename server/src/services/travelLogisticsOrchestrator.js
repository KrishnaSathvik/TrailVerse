'use strict';

const { resolveLogisticsNeeds } = require('../utils/logisticsNeedsResolver');
const { buildTravelLogistics } = require('../utils/travelLogisticsBuilder');
const {
  assertNoLiveCommercialClaims,
  assertCommercialInventorySafety,
} = require('../utils/travelLogisticsContract');
const {
  listOfficialLodgingByParkCode,
  hasOfficialLodgingCoverage,
} = require('../utils/officialLodgingCatalog');
const {
  resolveAirportGroundTransfers,
} = require('./airportGroundTransferAdapter');
const { adaptGatewayLodging } = require('./gatewayLodgingAdapter');
const { searchNearbyLodging } = require('./placesLodgingService');
const {
  normalizeCampgroundsForLogistics,
} = require('./campgroundStayAdapter');
const { createMapsEvidenceProvider } = require('./providers/mapsEvidenceProvider');
const { getNpsService } = require('./npsService');
const { getBaseTown } = require('./parkPlanningService');

const MAX_AIRPORTS = 3;
const MAX_GATEWAY_PROPERTIES = 5;

function hasActivatedNeed(needs) {
  return Boolean(
    needs.routeLegs
    || needs.airports
    || needs.insideParkLodging
    || needs.gatewayLodging
    || needs.campgrounds
    || needs.vacationRentalHint
  );
}

function parkCodeFromEntityId(entityId) {
  const match = String(entityId || '').toLowerCase().match(/^nps:park:([a-z0-9]+)$/);
  return match ? match[1] : null;
}

function resolvePark(context, planningState) {
  const supplied = context.park || null;
  const destination = planningState?.destination || {};
  const entities = Array.isArray(context.resolvedEntities) ? context.resolvedEntities : [];
  const entity = entities.find((item) => parkCodeFromEntityId(item?.entityId))
    || entities[0]
    || null;
  // This turn's resolved entities own destination identity. Persisted trip
  // state may still name a previous park and must not win the conflict.
  const parkCode = parkCodeFromEntityId(entity?.entityId)
    || supplied?.parkCode
    || destination.parkCode;
  const entityId = entity?.entityId
    || supplied?.entityId
    || (parkCode ? `nps:park:${String(parkCode).toLowerCase()}` : null);

  return {
    ...(supplied || {}),
    parkCode: parkCode ? String(parkCode).toLowerCase() : null,
    parkName: entity?.displayName
      || supplied?.parkName
      || supplied?.fullName
      || destination.parkName
      || null,
    entityId,
    latitude: entity?.latitude ?? supplied?.latitude ?? supplied?.lat ?? null,
    longitude: entity?.longitude ?? entity?.lon ?? supplied?.longitude ?? supplied?.lon ?? null,
  };
}

function routeLabelsByKey(tripScope) {
  const labels = new Map();
  for (const leg of tripScope?.routeLegs || []) {
    if (!leg?.fromEntityId || !leg?.toEntityId) continue;
    labels.set(
      `${String(leg.fromEntityId).toLowerCase()}|${String(leg.toEntityId).toLowerCase()}`,
      {
        originLabel: leg.fromDisplayName || leg.originLabel || null,
        destinationLabel: leg.toDisplayName || leg.destinationLabel || null,
      }
    );
  }
  return labels;
}

function normalizeRouteLegEvidence(routeLegEvidence, tripScope) {
  const labels = routeLabelsByKey(tripScope);
  return (Array.isArray(routeLegEvidence) ? routeLegEvidence : []).map((leg) => {
    const originEntityId = leg?.originEntityId || leg?.fromEntityId || null;
    const destinationEntityId = leg?.destinationEntityId || leg?.toEntityId || null;
    const key = `${String(originEntityId || '').toLowerCase()}|${String(destinationEntityId || '').toLowerCase()}`;
    const knownLabels = labels.get(key) || {};
    return {
      originEntityId,
      destinationEntityId,
      originLabel: leg?.originLabel || leg?.fromDisplayName || knownLabels.originLabel || null,
      destinationLabel:
        leg?.destinationLabel || leg?.toDisplayName || knownLabels.destinationLabel || null,
      durationSeconds: leg?.durationSeconds,
      distanceMeters: leg?.distanceMeters,
      status: leg?.status || 'verified',
    };
  });
}

function defaultMapsGetRoute(parameters, options = {}) {
  const provider = createMapsEvidenceProvider();
  return provider.fetch({ parameters }, options).then((result) => result.raw);
}

async function defaultGetNpsCampgrounds(parkCode, { signal } = {}) {
  const service = getNpsService();
  if (typeof service.getParkCampgroundsEvidence === 'function') {
    const result = await service.getParkCampgroundsEvidence(parkCode, { signal });
    return result?.data || [];
  }
  return service.getParkCampgrounds(parkCode);
}

async function buildTravelLogisticsForTurn(context = {}, deps = {}) {
  const planningState = context.planningState || null;
  const tripScope = context.tripScope
    || planningState?.tripScope
    || context.constraints?.tripScope
    || context.tripState?.tripScope
    || null;
  const needs = context.logisticsNeeds || resolveLogisticsNeeds({
    planningState,
    tripState: context.tripState || null,
    intent: context.intent || null,
    messageText: context.messageText || '',
    tripScope,
  });

  if (!hasActivatedNeed(needs)) return null;

  const park = resolvePark(context, planningState);
  const transportation = planningState?.transportation || context.tripState?.transportation || {};
  const lodging = planningState?.lodging || context.tripState?.lodging || {};
  const maxDailyDriveMinutes = tripScope?.maxDailyDriveMinutes
    ?? planningState?.preferences?.maxDailyDriveMinutes
    ?? context.constraints?.maxDailyDriveMinutes
    ?? null;
  const needsGatewayArea = needs.gatewayLodging || needs.vacationRentalHint;
  const gatewayAreaLabel = needsGatewayArea
    ? (
      context.gatewayAreaLabel
      || planningState?.lodging?.baseTown
      || (park.parkCode ? (deps.getBaseTown || getBaseTown)(park) : null)
    )
    : null;
  const adapterErrors = {};
  let airports = [];
  let departure = {
    city: transportation.departureCity || transportation.startLocation || null,
    airportCode: transportation.departureAirportCode || transportation.airport || null,
  };
  let insideParkCatalog = [];
  let catalogCoverage = false;
  let gatewayPlaces = [];
  let campgroundAdapterOutput = null;

  if (needs.airports) {
    try {
      const airportResult = await (deps.resolveAirportGroundTransfers
        || resolveAirportGroundTransfers)({
        parkLat: park.latitude,
        parkLon: park.longitude,
        parkLabel: park.parkName,
        parkEntityId: park.entityId,
        departureCity: departure.city,
        departureAirportCode: departure.airportCode,
        mapsGetRoute: deps.mapsGetRoute || defaultMapsGetRoute,
        maxAirports: MAX_AIRPORTS,
      });
      airports = (airportResult?.airports || []).slice(0, MAX_AIRPORTS);
      departure = airportResult?.departureContext || departure;
      if (!airportResult?.ok) adapterErrors.airports = true;
    } catch {
      adapterErrors.airports = true;
    }
  }

  if (needs.insideParkLodging) {
    const listCatalog = deps.listOfficialLodgingByParkCode
      || listOfficialLodgingByParkCode;
    const hasCoverage = deps.hasOfficialLodgingCoverage
      || hasOfficialLodgingCoverage;
    insideParkCatalog = listCatalog(park.parkCode);
    catalogCoverage = hasCoverage(park.parkCode);
  }

  if (needs.gatewayLodging) {
    try {
      const providerResult = await (deps.searchNearbyLodging || searchNearbyLodging)({
        lat: park.latitude,
        lng: park.longitude,
        parkName: park.parkName,
        limit: MAX_GATEWAY_PROPERTIES,
      });
      const adapted = (deps.adaptGatewayLodging || adaptGatewayLodging)(providerResult);
      gatewayPlaces = (adapted?.places || []).slice(0, MAX_GATEWAY_PROPERTIES);
      if (!adapted?.ok) adapterErrors.gateway = true;
    } catch {
      adapterErrors.gateway = true;
    }
  }

  if (needs.campgrounds) {
    try {
      const npsCampgrounds = context.npsCampgrounds != null
        ? context.npsCampgrounds
        : await (deps.getNpsCampgrounds || defaultGetNpsCampgrounds)(
          park.parkCode,
          { signal: context.signal }
        );
      campgroundAdapterOutput = (deps.normalizeCampgroundsForLogistics
        || normalizeCampgroundsForLogistics)({
        npsCampgrounds,
        rvFilter: Boolean(needs.rvFilter),
        parkCode: park.parkCode,
      });
      if (campgroundAdapterOutput?.status === 'provider_unavailable') {
        adapterErrors.campgrounds = true;
      }
    } catch {
      adapterErrors.campgrounds = true;
    }
  }

  const result = buildTravelLogistics({
    needs,
    transportMode: transportation.mode || 'unknown',
    departure,
    routeLegEvidence: normalizeRouteLegEvidence(context.routeLegEvidence, tripScope),
    driveCap: { maxDailyDriveMinutes },
    airports,
    parkCode: park.parkCode,
    parkName: park.parkName,
    entityId: park.entityId,
    insideParkCatalog,
    catalogCoverage,
    gatewayPlaces,
    gatewayAreaLabel,
    campgroundAdapterOutput,
    accommodationClass: lodging.type || lodging.accommodationClass || 'unknown',
    stayPreference: lodging.stayPreference || 'unknown',
    adapterErrors,
  });
  assertNoLiveCommercialClaims(result);
  assertCommercialInventorySafety(result);
  return result;
}

module.exports = {
  buildTravelLogisticsForTurn,
};
