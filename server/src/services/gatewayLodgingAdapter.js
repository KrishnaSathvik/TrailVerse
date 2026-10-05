'use strict';

const LOGISTICS_RESULT_LIMIT = 5;

function providerUnavailable() {
  return { ok: false, status: 'provider_unavailable', places: [] };
}

function normalizePlace(place) {
  const placeId = place?.place_id || place?.placeId;
  const name = place?.name;
  if (!placeId || !name) return null;

  return {
    placeId,
    name,
    propertyType: 'hotel',
    rating: Number.isFinite(Number(place.rating)) ? Number(place.rating) : null,
    address: place.vicinity || place.address || place.formatted_address || null,
    officialUrl: place.website || place.officialUrl || place.websiteUrl || null,
    mapsUrl: place.mapsUrl
      || `https://www.google.com/maps/place/?q=${encodeURIComponent(`place_id:${placeId}`)}`,
  };
}

function adaptGatewayLodging(providerResult) {
  if (!providerResult?.ok || providerResult.status === 'provider_unavailable') {
    return providerUnavailable();
  }

  if (providerResult.status === 'no_results') {
    return { ok: true, status: 'no_results', places: [] };
  }

  if (providerResult.status === 'available') {
    if (!Array.isArray(providerResult.places)) {
      return providerUnavailable();
    }

    const places = providerResult.places
      .map(normalizePlace)
      .filter(Boolean)
      .slice(0, LOGISTICS_RESULT_LIMIT);

    if (places.length === 0) {
      return providerUnavailable();
    }

    return { ok: true, status: 'available', places };
  }

  const places = (Array.isArray(providerResult.places) ? providerResult.places : [])
    .map(normalizePlace)
    .filter(Boolean)
    .slice(0, LOGISTICS_RESULT_LIMIT);

  return {
    ok: true,
    status: places.length > 0 ? 'available' : 'no_results',
    places,
  };
}

module.exports = {
  adaptGatewayLodging,
};
