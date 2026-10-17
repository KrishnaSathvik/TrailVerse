'use strict';

const { fetchGoogleMaps: fetch } = require('./googleMapsTransport');

const DEFAULT_LOGISTICS_LIMIT = 5;
const MAX_RESULTS_TO_ENRICH = 50;
const PLACE_DETAILS_FIELDS = [
  'place_id',
  'name',
  'formatted_address',
  'geometry/location',
  'rating',
  'user_ratings_total',
  'price_level',
  'photos',
  'opening_hours/weekday_text',
  'website',
  'formatted_phone_number',
  'types',
  'vicinity',
].join(',');

function providerUnavailable() {
  return { ok: false, status: 'provider_unavailable', places: [] };
}

function normalizeLimit(limit, fallback = DEFAULT_LOGISTICS_LIMIT) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), MAX_RESULTS_TO_ENRICH);
}

function buildBasicPlace(place = {}) {
  return {
    place_id: place.place_id,
    name: place.name,
    lat: place.geometry?.location?.lat,
    lng: place.geometry?.location?.lng,
    rating: place.rating,
    user_ratings_total: place.user_ratings_total || null,
    address: place.vicinity || place.formatted_address,
  };
}

function buildDetailedPlace(result = {}) {
  return {
    place_id: result.place_id,
    name: result.name,
    lat: result.geometry?.location?.lat,
    lng: result.geometry?.location?.lng,
    rating: result.rating,
    user_ratings_total: result.user_ratings_total,
    price_level: result.price_level,
    address: result.vicinity || result.formatted_address,
    formatted_address: result.formatted_address,
    photos: (result.photos || []).map((photo) => ({
      photo_reference: photo.photo_reference,
      url: `/api/gmaps/photo?photo_reference=${photo.photo_reference}&maxwidth=400`,
    })),
    opening_hours: result.opening_hours ? {
      weekday_text: result.opening_hours.weekday_text,
      open_now: result.opening_hours.open_now,
    } : null,
    website: result.website,
    formatted_phone_number: result.formatted_phone_number,
    phone_number: result.formatted_phone_number,
    types: result.types,
    vicinity: result.vicinity,
  };
}

function sortPlacesByRating(places) {
  return places.sort((a, b) => {
    const ratingDifference = (b.rating || 0) - (a.rating || 0);
    if (ratingDifference !== 0) return ratingDifference;
    return (b.user_ratings_total || 0) - (a.user_ratings_total || 0);
  });
}

async function fetchPlaceDetails(place, apiKey) {
  const params = new URLSearchParams({
    place_id: place.place_id,
    fields: PLACE_DETAILS_FIELDS,
    key: apiKey,
  });

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`,
    );
    const json = await response.json();
    if (json.status === 'OK' && json.result) {
      return buildDetailedPlace(json.result);
    }
  } catch (error) {
    console.error('Error fetching Google place details:', place.name, error);
  }

  return buildBasicPlace(place);
}

function buildSearchUrl({
  lat,
  lng,
  radiusMeters,
  type,
  parkName,
  apiKey,
}) {
  if (type === 'tourist_attraction_park_specific' && parkName) {
    const params = new URLSearchParams({
      query: `${parkName} attractions landmarks points of interest`,
      location: `${lat},${lng}`,
      radius: String(radiusMeters),
      key: apiKey,
    });
    return `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`;
  }

  const searchType = type === 'tourist_attraction_park_specific'
    ? 'tourist_attraction'
    : type;
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius: String(radiusMeters),
    type: searchType,
    key: apiKey,
  });
  return `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`;
}

async function searchNearbyPlaces({
  lat,
  lng,
  radiusMeters = 10000,
  limit = DEFAULT_LOGISTICS_LIMIT,
  type = 'lodging',
  parkName,
} = {}) {
  const apiKey = process.env.GMAPS_SERVER_KEY;
  if (!apiKey || lat == null || lng == null || !type) {
    return providerUnavailable();
  }

  const resultLimit = normalizeLimit(limit);
  const url = buildSearchUrl({
    lat,
    lng,
    radiusMeters,
    type,
    parkName,
    apiKey,
  });

  try {
    const response = await fetch(url);
    const json = await response.json();

    if (json.status === 'ZERO_RESULTS') {
      return { ok: true, status: 'no_results', places: [] };
    }
    if (json.status !== 'OK') {
      console.error('Google Places nearby search failed:', json.status, json.error_message);
      return providerUnavailable();
    }

    if (!Array.isArray(json.results)) {
      return providerUnavailable();
    }

    if (json.results.length === 0) {
      return { ok: true, status: 'no_results', places: [] };
    }

    const nearbyPlaces = json.results;

    const places = [];
    for (const place of nearbyPlaces.slice(0, MAX_RESULTS_TO_ENRICH)) {
      places.push(await fetchPlaceDetails(place, apiKey));
    }

    return {
      ok: true,
      status: 'available',
      places: sortPlacesByRating(places).slice(0, resultLimit),
    };
  } catch (error) {
    console.error('Google Places nearby search failed:', error);
    return providerUnavailable();
  }
}

function searchNearbyLodging(options = {}) {
  return searchNearbyPlaces({ ...options, type: 'lodging' });
}

module.exports = {
  searchNearbyLodging,
  searchNearbyPlaces,
};
