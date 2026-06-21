'use strict';

const fetch = require('node-fetch');

const geocodeCache = new Map();
const GEOCODE_CACHE_MAX = 200;
const GEOCODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MONTH_WORDS = new Set([
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
]);

const PLACE_STOPWORDS = new Set([
  'the', 'a', 'an', 'my', 'your', 'this', 'that', 'morning', 'evening', 'night', 'week', 'weekend',
]);

/** Famous US outdoor destinations missing from free geocoders. */
const KNOWN_PLACES = {
  'mono lake': { name: 'Mono Lake, California', lat: 37.939, lon: -119.019 },
  'sierraville': { name: 'Sierraville, California', lat: 39.5896, lon: -120.3674 },
  'death valley': { name: 'Death Valley, California', lat: 36.2396, lon: -116.8113 },
  'valley of fire': { name: 'Valley of Fire, Nevada', lat: 36.4819, lon: -114.5311 },
  'hocking hills': { name: 'Hocking Hills, Ohio', lat: 39.431, lon: -82.537 },
  'smith rock': { name: 'Smith Rock, Oregon', lat: 44.367, lon: -121.141 },
};

function setCache(key, value) {
  if (geocodeCache.has(key)) geocodeCache.delete(key);
  geocodeCache.set(key, { value, expiresAt: Date.now() + GEOCODE_TTL_MS });
  while (geocodeCache.size > GEOCODE_CACHE_MAX) {
    const oldest = geocodeCache.keys().next().value;
    geocodeCache.delete(oldest);
  }
}

function getCache(key) {
  const entry = geocodeCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    geocodeCache.delete(key);
    return null;
  }
  return entry.value;
}

function isMonthOnlyPhrase(text) {
  const t = String(text || '').trim().toLowerCase();
  if (MONTH_WORDS.has(t)) return true;
  return /^(early|mid|late|first|last|next)\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)$/i.test(
    t
  );
}

/**
 * Extract a US place name from messages like "in Sierraville, CA" or "at Moab, Utah".
 * @param {string} userMessage
 * @returns {string|null}
 */
function extractPlaceFromMessage(userMessage) {
  if (!userMessage) return null;

  const namedPlace =
    userMessage.match(
      /\b(?:is|are|was|were)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:good|great|best|ideal|worth|ok|okay)\b/
    )?.[1] ||
    userMessage.match(
      /\b(?:for|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/
    )?.[1];

  if (namedPlace && !isMonthOnlyPhrase(namedPlace)) {
    return namedPlace.trim();
  }

  const patterns = [
    /\b(?:in|at|near|around|outside|outside of)\s+([A-Za-z][A-Za-z\s.'-]{1,48}(?:,\s*[A-Za-z]{2,15})?)/i,
    /\b(?:shoot|photograph|camp|stay|visit|explore|go to|heading to|traveling to|driving to)\s+(?:in\s+)?([A-Za-z][A-Za-z\s.'-]{1,48}(?:,\s*[A-Za-z]{2,15})?)/i,
  ];

  for (const pattern of patterns) {
    const match = userMessage.match(pattern);
    if (!match?.[1]) continue;

    let place = match[1].trim().replace(/[?!.]+$/, '');
    if (isMonthOnlyPhrase(place)) continue;
    const firstWord = place.split(/[\s,]+/)[0].toLowerCase();
    if (MONTH_WORDS.has(firstWord)) continue;
    if (PLACE_STOPWORDS.has(firstWord)) continue;
    if (/^(july|august|september)\s+(first|second|third|fourth|last|1st|2nd|3rd|4th)\s+week/i.test(place)) {
      continue;
    }
    if (place.length < 3) continue;
    return place;
  }

  return null;
}

async function geocodeWithGoogle(query) {
  const apiKey = process.env.GMAPS_SERVER_KEY;
  if (!apiKey) return null;

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('components', 'country:US');

  const response = await fetch(url.toString(), { timeout: 8000 });
  const data = await response.json();
  if (data.status !== 'OK' || !data.results?.[0]) return null;

  const result = data.results[0];
  const loc = result.geometry?.location;
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return null;

  return {
    name: result.formatted_address || query,
    lat: loc.lat,
    lon: loc.lng,
    source: 'google',
  };
}

async function geocodeWithOpenMeteo(query) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', query.replace(/,\s*[A-Za-z]{2,}$/, '').trim());
  url.searchParams.set('count', '5');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const response = await fetch(url.toString(), { timeout: 8000 });
  const data = await response.json();
  const results = data.results || [];
  if (!results.length) return null;

  const stateMatch = query.match(/,\s*([A-Za-z]{2,})\s*$/);
  const stateHint = stateMatch ? stateMatch[1].toLowerCase() : null;

  let pick = results[0];
  if (stateHint) {
    const filtered = results.filter(
      (r) =>
        String(r.admin1 || '').toLowerCase().includes(stateHint) ||
        String(r.country_code || '').toLowerCase() === 'us'
    );
    if (filtered.length) pick = filtered[0];
  }

  if (String(pick.country_code || '').toUpperCase() !== 'US') return null;

  return {
    name: [pick.name, pick.admin1, pick.country].filter(Boolean).join(', '),
    lat: pick.latitude,
    lon: pick.longitude,
    source: 'open-meteo',
  };
}

/**
 * Geocode a place string to coordinates (cached).
 * @param {string} query
 * @returns {Promise<{ name: string, lat: number, lon: number, source: string }|null>}
 */
async function geocodePlace(query) {
  if (!query || query.trim().length < 2) return null;
  const normalized = query.trim().toLowerCase();
  const cached = getCache(normalized);
  if (cached) return cached;

  const known = KNOWN_PLACES[normalized];
  if (known) {
    const result = { ...known, source: 'trailverse-known-place' };
    setCache(normalized, result);
    return result;
  }

  let result = null;
  try {
    result = await geocodeWithGoogle(query);
  } catch (err) {
    console.warn('[Geocode] Google error:', err.message);
  }

  if (!result) {
    try {
      result = await geocodeWithOpenMeteo(query);
    } catch (err) {
      console.warn('[Geocode] Open-Meteo error:', err.message);
    }
  }

  if (result) setCache(normalized, result);
  return result;
}

/**
 * Extract and geocode a place from a user message.
 * @param {string} userMessage
 * @returns {Promise<{ name: string, lat: number, lon: number, source: string, query: string }|null>}
 */
async function resolvePlaceFromMessage(userMessage) {
  const query = extractPlaceFromMessage(userMessage);
  if (!query) return null;
  const geocoded = await geocodePlace(query);
  if (!geocoded) return null;
  return { ...geocoded, query };
}

module.exports = {
  extractPlaceFromMessage,
  geocodePlace,
  resolvePlaceFromMessage,
};
