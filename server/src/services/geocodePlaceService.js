'use strict';

const { fetchGoogleMaps: fetch } = require('./googleMapsTransport');

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

/** Famous US outdoor destinations missing from free geocoders / NPS park catalog. */
const KNOWN_PLACES = {
  'mono lake': { name: 'Mono Lake, California', lat: 37.939, lon: -119.019 },
  'sierraville': { name: 'Sierraville, California', lat: 39.5896, lon: -120.3674 },
  'death valley': { name: 'Death Valley, California', lat: 36.2396, lon: -116.8113 },
  'valley of fire': { name: 'Valley of Fire State Park', lat: 36.4819, lon: -114.5311 },
  'hocking hills': { name: 'Hocking Hills, Ohio', lat: 39.431, lon: -82.537 },
  'smith rock': { name: 'Smith Rock, Oregon', lat: 44.367, lon: -121.141 },
  'flaming gorge': { name: 'Flaming Gorge', lat: 40.9147, lon: -109.421 },
  'flaming gorge national recreation area': {
    name: 'Flaming Gorge National Recreation Area',
    lat: 40.9147,
    lon: -109.421,
  },
};

const US_STATE_NAMES = Object.freeze({
  al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california',
  co: 'colorado', ct: 'connecticut', de: 'delaware', fl: 'florida', ga: 'georgia',
  hi: 'hawaii', id: 'idaho', il: 'illinois', in: 'indiana', ia: 'iowa',
  ks: 'kansas', ky: 'kentucky', la: 'louisiana', me: 'maine', md: 'maryland',
  ma: 'massachusetts', mi: 'michigan', mn: 'minnesota', ms: 'mississippi',
  mo: 'missouri', mt: 'montana', ne: 'nebraska', nv: 'nevada', nh: 'new hampshire',
  nj: 'new jersey', nm: 'new mexico', ny: 'new york', nc: 'north carolina',
  nd: 'north dakota', oh: 'ohio', ok: 'oklahoma', or: 'oregon', pa: 'pennsylvania',
  ri: 'rhode island', sc: 'south carolina', sd: 'south dakota', tn: 'tennessee',
  tx: 'texas', ut: 'utah', vt: 'vermont', va: 'virginia', wa: 'washington',
  wv: 'west virginia', wi: 'wisconsin', wy: 'wyoming', dc: 'district of columbia',
});

const US_STATE_NAME_TO_CODE = Object.freeze(
  Object.fromEntries(Object.entries(US_STATE_NAMES).map(([code, name]) => [name, code]))
);

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
    /\b(?:in|at|near|around|outside|outside of)\s+([A-Za-z][A-Za-z\s.'-]{1,48}(?:,\s*[A-Za-z]{2,20})?)/i,
    /\b(?:shoot|photograph|camp|stay|visit|explore|go to|heading to|traveling to|driving to)\s+(?:in\s+)?([A-Za-z][A-Za-z\s.'-]{1,48}(?:,\s*[A-Za-z]{2,20})?)/i,
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

function checkAbort(signal) {
  if (signal?.aborted) throw Object.assign(new Error('Geocode cancelled'), { code: 'ABORT_ERR' });
}

/** Parse a coordinate; null/empty/non-finite → null. Never coerce missing → 0. */
function parseFiniteCoord(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Placeholder zeros are not a geographic center.
 * Only accept 0,0 when the caller marks the bias as explicitly authoritative.
 */
function isUsableCoordinatePair(lat, lon, { allowZeroIsland = false } = {}) {
  const a = parseFiniteCoord(lat);
  const b = parseFiniteCoord(lon);
  if (a == null || b == null) return false;
  if (!allowZeroIsland && a === 0 && b === 0) return false;
  return true;
}

function normalizeRegionToken(raw) {
  if (raw == null || raw === '') return null;
  const text = String(raw).trim().toLowerCase().replace(/\./g, '');
  if (!text) return null;
  if (US_STATE_NAMES[text]) {
    return { code: text, name: US_STATE_NAMES[text] };
  }
  if (US_STATE_NAME_TO_CODE[text]) {
    return { code: US_STATE_NAME_TO_CODE[text], name: text };
  }
  // Multi-word / comma-separated handled by normalizeRegionList.
  return { code: null, name: text };
}

function normalizeRegionList(value) {
  if (value == null || value === '') return [];
  const parts = Array.isArray(value)
    ? value.flatMap((v) => String(v).split(/[,|/]/))
    : String(value).split(/[,|/]/);
  const out = [];
  const seen = new Set();
  for (const part of parts) {
    const token = normalizeRegionToken(part);
    if (!token) continue;
    const key = token.code || token.name;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
}

function extractExplicitRegionFromPlaceText(placeText) {
  const match = String(placeText || '').match(/,\s*([A-Za-z][A-Za-z\s.'-]{1,24})\s*$/);
  if (!match) return null;
  const regions = normalizeRegionList(match[1]);
  return regions[0] || null;
}

function barePlaceName(placeText) {
  return String(placeText || '').replace(/,\s*[A-Za-z][A-Za-z\s.'-]{1,24}\s*$/, '').trim();
}

function candidateRegionTokens(candidate = {}) {
  const parts = [
    candidate.admin1,
    candidate.state,
    candidate.stateCode,
    candidate.region,
    candidate.formattedAddress,
    candidate.name,
  ].filter(Boolean);
  return normalizeRegionList(parts);
}

function regionsCompatible(candidateRegions, activeRegions) {
  if (!activeRegions?.length || !candidateRegions?.length) return false;
  for (const active of activeRegions) {
    for (const cand of candidateRegions) {
      if (active.code && cand.code && active.code === cand.code) return true;
      if (active.name && cand.name && active.name === cand.name) return true;
      if (active.code && cand.name && US_STATE_NAMES[active.code] === cand.name) return true;
      if (cand.code && active.name && US_STATE_NAMES[cand.code] === active.name) return true;
    }
  }
  return false;
}

function squaredDistance(aLat, aLon, bLat, bLon) {
  const dLat = aLat - bLat;
  const dLon = aLon - bLon;
  return (dLat * dLat) + (dLon * dLon);
}

function pushUniqueRegions(target, values) {
  for (const region of normalizeRegionList(values)) {
    const key = region.code || region.name;
    if (!key || target.some((r) => (r.code || r.name) === key)) continue;
    target.push(region);
  }
}

/**
 * Build reusable active-trip place-resolution context from authoritative state.
 * Does not invent coordinates from names; may fill coords from park catalog by code.
 */
function buildActivePlaceResolutionContext(input = {}) {
  const activeTripContext = input.activeTripContext || input.tripContext || null;
  const planningState = input.planningState || null;
  const resolvedMetadata = input.resolvedMetadata || input.metadata || null;
  const primary = activeTripContext?.primaryDestination
    || input.primaryDestination
    || input.lockedPlanDestination
    || activeTripContext?.lockedPlanDestination
    || null;
  const destState = planningState?.destination || null;
  const scopeDests = Array.isArray(planningState?.tripScope?.destinations)
    ? planningState.tripScope.destinations
    : [];
  const scopePrimary = scopeDests.find((d) => d && (d.parkCode || d.displayName || d.name)) || null;

  const parkCode = primary?.parkCode
    || destState?.parkCode
    || scopePrimary?.parkCode
    || resolvedMetadata?.parkCode
    || input.parkCode
    || null;
  const name = primary?.name
    || destState?.parkName
    || scopePrimary?.displayName
    || scopePrimary?.name
    || resolvedMetadata?.parkName
    || input.destinationName
    || null;

  const rawLat = parseFiniteCoord(
    input.lat ?? input.latitude
      ?? primary?.lat ?? primary?.latitude
      ?? scopePrimary?.latitude ?? scopePrimary?.lat
      ?? resolvedMetadata?.lat ?? resolvedMetadata?.latitude
  );
  const rawLon = parseFiniteCoord(
    input.lon ?? input.longitude
      ?? primary?.lon ?? primary?.longitude
      ?? scopePrimary?.longitude ?? scopePrimary?.lon
      ?? resolvedMetadata?.lon ?? resolvedMetadata?.longitude
  );
  const zeroIslandPlaceholder = rawLat === 0 && rawLon === 0 && input.allowZeroIsland !== true;
  let lat = zeroIslandPlaceholder ? null : rawLat;
  let lon = zeroIslandPlaceholder ? null : rawLon;

  // Fill from park catalog only when coordinates were absent — never when the
  // caller supplied placeholder 0,0 (that means "no coordinate bias").
  if (!zeroIslandPlaceholder && lat == null && lon == null && parkCode) {
    try {
      const { getParkIdentityByCode } = require('../utils/parkExtractor');
      const identity = getParkIdentityByCode(parkCode);
      if (identity && isUsableCoordinatePair(identity.lat, identity.lon)) {
        lat = identity.lat;
        lon = identity.lon;
      }
    } catch {
      // Catalog lookup is best-effort; region text may still bias.
    }
  }

  const regions = [];
  pushUniqueRegions(regions, input.states || input.state || input.stateCode || input.regions);
  pushUniqueRegions(regions, primary?.states || primary?.state || primary?.stateCode);
  pushUniqueRegions(regions, destState?.state || destState?.states || destState?.region);
  pushUniqueRegions(regions, scopePrimary?.states || scopePrimary?.state || scopePrimary?.stateCode);
  pushUniqueRegions(regions, resolvedMetadata?.states || resolvedMetadata?.state);

  const confirmedLodging = planningState?.lodging?.booked
    ? {
      baseTown: planningState.lodging.baseTown || null,
      stateOrRegion: planningState.lodging.stateOrRegion || null,
      country: planningState.lodging.country || null,
      booked: true,
    }
    : (input.confirmedLodging || null);

  const canonicalPlanPlaces = Array.isArray(input.canonicalPlanPlaces)
    ? input.canonicalPlanPlaces
    : [];

  const hasDestination = Boolean(parkCode || name || regions.length || isUsableCoordinatePair(lat, lon));
  if (!hasDestination && !confirmedLodging) {
    return null;
  }

  return {
    destination: {
      name: name || null,
      stateOrRegion: regions[0]?.name || regions[0]?.code || null,
      country: input.country || 'US',
      parkCode: parkCode || null,
      coordinates: isUsableCoordinatePair(lat, lon)
        ? { lat, lon }
        : { lat: null, lon: null },
    },
    regions,
    tripScope: planningState?.tripScope?.type
      || planningState?.tripScope
      || input.tripScope
      || null,
    confirmedLodging,
    canonicalPlanPlaces,
    resolutionSource: activeTripContext?.resolutionSource || input.resolutionSource || null,
  };
}

/**
 * Build geocode bias from active trip / resolved destination geography.
 * Prefer coordinates when real; always keep textual region when known.
 * Zero/null coordinates never become a 0,0 bias.
 */
function buildGeocodeBiasFromTripContext(context = {}) {
  const structured = context?.destination
    ? context
    : buildActivePlaceResolutionContext(context);
  if (!structured) return null;

  const lat = parseFiniteCoord(structured.destination?.coordinates?.lat
    ?? context.lat ?? context.latitude);
  const lon = parseFiniteCoord(structured.destination?.coordinates?.lon
    ?? context.lon ?? context.longitude);
  const regions = structured.regions?.length
    ? structured.regions
    : normalizeRegionList(
      context.state || context.stateCode || context.states
        || context.primaryDestination?.states
        || context.primaryDestination?.state
        || context.destination?.states
        || context.destination?.state
    );

  const bias = {
    states: regions,
    state: regions[0]?.name || regions[0]?.code || null,
    coordinateBias: null,
  };

  if (isUsableCoordinatePair(lat, lon, { allowZeroIsland: context.allowZeroIsland === true })) {
    bias.lat = lat;
    bias.lon = lon;
    bias.coordinateBias = { lat, lon };
  }

  if (!bias.state && !bias.coordinateBias) return null;
  return bias;
}

async function geocodeCandidatesWithGoogle(query, signal, bias = null) {
  checkAbort(signal);
  const apiKey = process.env.GMAPS_SERVER_KEY;
  if (!apiKey) return [];

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('components', 'country:US');
  if (bias?.coordinateBias
    && isUsableCoordinatePair(bias.coordinateBias.lat, bias.coordinateBias.lon)) {
    const lat = bias.coordinateBias.lat;
    const lon = bias.coordinateBias.lon;
    const delta = 1.5;
    url.searchParams.set('bounds', `${lat - delta},${lon - delta}|${lat + delta},${lon + delta}`);
  }

  const response = await fetch(url.toString(), { timeout: 8000, signal });
  checkAbort(signal);
  if (response.ok === false) throw new Error('Google geocode request failed');
  const data = await response.json();
  checkAbort(signal);
  if (data.status === 'ZERO_RESULTS') return [];
  if (data.status !== 'OK') throw new Error('Google geocode provider failed');
  if (!Array.isArray(data.results) || !data.results.length) return [];

  return data.results.slice(0, 8).map((result, index) => {
    const loc = result.geometry?.location;
    const comps = result.address_components || [];
    const admin1 = comps.find((c) => c.types?.includes('administrative_area_level_1'));
    return {
      name: result.formatted_address || null,
      lat: loc?.lat,
      lon: loc?.lng,
      admin1: admin1?.long_name || null,
      stateCode: admin1?.short_name || null,
      country: 'United States',
      countryCode: 'US',
      source: 'google',
      providerRank: index,
    };
  }).filter((c) => isUsableCoordinatePair(c.lat, c.lon, { allowZeroIsland: true }));
}

async function geocodeCandidatesWithOpenMeteo(query, signal) {
  checkAbort(signal);
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', barePlaceName(query) || query);
  url.searchParams.set('count', '8');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const response = await fetch(url.toString(), { timeout: 8000, signal });
  checkAbort(signal);
  if (response.ok === false) throw new Error('Open-Meteo geocode request failed');
  const data = await response.json();
  checkAbort(signal);
  if (data.error) throw new Error('Open-Meteo geocode provider failed');
  const results = data.results || [];
  return results.map((r, index) => ({
    name: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
    admin1: r.admin1 || null,
    state: r.admin1 || null,
    country: r.country || null,
    countryCode: r.country_code || null,
    source: 'open-meteo',
    providerRank: index,
  })).filter((c) => isUsableCoordinatePair(c.lat, c.lon, { allowZeroIsland: true }));
}

/**
 * Rank geocode candidates using active-trip compatibility before provider order.
 */
function rankGeocodeCandidates(candidates, tripContext, {
  query = '',
  bias = null,
  explicitRegion = null,
  explicitCountry = null,
} = {}) {
  const list = (Array.isArray(candidates) ? candidates : []).filter((candidate) => !explicitCountry
    || [candidate.countryCode, candidate.country].some((value) => value
      && String(value).trim().toLowerCase() === String(explicitCountry).trim().toLowerCase()));
  const activeRegions = (bias?.states?.length
    ? bias.states
    : (tripContext?.regions || [])).slice();
  const coordBias = bias?.coordinateBias
    || (isUsableCoordinatePair(
      tripContext?.destination?.coordinates?.lat,
      tripContext?.destination?.coordinates?.lon
    )
      ? tripContext.destination.coordinates
      : null);
  const bareQuery = barePlaceName(query).toLowerCase();
  const hasActiveTrip = Boolean(
    tripContext?.destination?.parkCode
      || tripContext?.destination?.name
      || activeRegions.length
      || coordBias
  );

  const scored = list.map((candidate, index) => {
    const regions = candidateRegionTokens(candidate);
    const name = String(candidate.name || '').toLowerCase();
    const placePart = barePlaceName(candidate.name || '').toLowerCase();
    const exactName = placePart === bareQuery
      || placePart.startsWith(`${bareQuery},`)
      || name.startsWith(`${bareQuery},`)
      || name === bareQuery;
    const regionMatch = regionsCompatible(regions, activeRegions);
    const explicitMatch = explicitRegion
      ? regionsCompatible(regions, [explicitRegion])
      : false;
    const countryOk = !candidate.countryCode
      || String(candidate.countryCode).toUpperCase() === 'US'
      || String(candidate.country || '').toLowerCase().includes('united states');
    let proximity = null;
    if (coordBias && isUsableCoordinatePair(candidate.lat, candidate.lon, { allowZeroIsland: true })) {
      proximity = squaredDistance(coordBias.lat, coordBias.lon, Number(candidate.lat), Number(candidate.lon));
    }
    const providerRank = Number.isFinite(Number(candidate.providerRank))
      ? Number(candidate.providerRank)
      : index;

    let score = 0;
    if (exactName) score += 100;
    if (explicitMatch) score += 90;
    if (regionMatch) score += 70;
    if (countryOk) score += 10;
    if (proximity != null) score += Math.max(0, 40 - Math.min(40, proximity * 8));
    score += Math.max(0, 8 - providerRank);

    return {
      candidate,
      score,
      exactName,
      regionMatch,
      explicitMatch,
      proximity,
      providerRank,
      countryOk,
    };
  });

  scored.sort((a, b) => {
    // Explicit traveler geography outranks active-trip inference and provider order.
    if (explicitRegion) {
      if (a.explicitMatch !== b.explicitMatch) return a.explicitMatch ? -1 : 1;
    }
    if (b.score !== a.score) return b.score - a.score;
    if (a.proximity != null && b.proximity != null && a.proximity !== b.proximity) {
      return a.proximity - b.proximity;
    }
    return a.providerRank - b.providerRank;
  });

  const regionMatches = scored.filter((s) => s.regionMatch).length;
  const best = scored[0] || null;

  let selectionReason = 'provider_rank';
  let resolutionStatus = 'resolved';
  let resolutionConfidence = 'low';

  if (!best) {
    return {
      selected: null,
      scored,
      regionMatches: 0,
      selectionReason: 'no_candidates',
      resolutionStatus: 'unresolved',
      resolutionConfidence: 'none',
    };
  }

  if (explicitRegion) {
    if (best.explicitMatch) {
      selectionReason = 'explicit_traveler_region';
      resolutionConfidence = 'high';
    } else {
      return {
        selected: null,
        scored,
        regionMatches,
        selectionReason: 'explicit_region_mismatch',
        resolutionStatus: 'context_mismatch',
        resolutionConfidence: 'none',
      };
    }
  } else if (hasActiveTrip && activeRegions.length) {
    if (best.regionMatch) {
      selectionReason = 'active_trip_region_match';
      resolutionConfidence = best.proximity != null ? 'high' : 'medium';
    } else if (coordBias && best.proximity != null && best.proximity < 4) {
      // ~2° — same broad geography without admin label match
      selectionReason = 'active_trip_proximity';
      resolutionConfidence = 'medium';
    } else {
      return {
        selected: null,
        scored,
        regionMatches,
        selectionReason: 'context_mismatch',
        resolutionStatus: 'context_mismatch',
        resolutionConfidence: 'none',
      };
    }
  } else if (hasActiveTrip && coordBias) {
    if (best.proximity != null && best.proximity < 4) {
      selectionReason = 'active_trip_proximity';
      resolutionConfidence = 'medium';
    } else {
      return {
        selected: null,
        scored,
        regionMatches,
        selectionReason: 'context_mismatch',
        resolutionStatus: 'context_mismatch',
        resolutionConfidence: 'none',
      };
    }
  } else {
    selectionReason = 'provider_rank';
    resolutionConfidence = best.exactName ? 'medium' : 'low';
  }

  return {
    selected: best.candidate,
    scored,
    regionMatches,
    selectionReason,
    resolutionStatus,
    resolutionConfidence,
  };
}

async function fetchGeocodeCandidates(query, { signal, bias = null } = {}) {
  let providerFailed = false;
  let candidates = [];
  try {
    candidates = await geocodeCandidatesWithGoogle(query, signal, bias);
  } catch (err) {
    checkAbort(signal);
    if (err?.name === 'AbortError' || err?.code === 'ABORT_ERR') throw err;
    providerFailed = true;
    console.warn('[Geocode] Google provider failure');
  }

  checkAbort(signal);
  if (!candidates.length) {
    try {
      candidates = await geocodeCandidatesWithOpenMeteo(query, signal);
    } catch (err) {
      checkAbort(signal);
      if (err?.name === 'AbortError' || err?.code === 'ABORT_ERR') throw err;
      providerFailed = true;
      console.warn('[Geocode] Open-Meteo provider failure');
    }
  }

  return { candidates, providerFailed };
}

/**
 * Geocode a place string to coordinates (cached).
 * @param {string} query
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {boolean} [options.reportFailure]
 * @param {{ lat?: number, lon?: number, state?: string, states?: Array, coordinateBias?: object }} [options.bias]
 * @param {object} [options.queryProvenance] Required when query is machine-built.
 * @param {string|null} [options.queryProvenance.rawTravelerPlaceText] Original traveler text; null for grounded system identities.
 * @param {string|null} [options.queryProvenance.groundedPlaceText] Evidence-bound place identity, without appended context.
 * @param {{code?: string, name?: string}|null} [options.queryProvenance.explicitTravelerRegion] Normalized traveler assertion only.
 * @param {string|null} [options.queryProvenance.explicitTravelerCountry] Traveler country name or code.
 * @param {Array<{code?: string, name?: string}>} [options.queryProvenance.contextualRegions] Active-trip inference, not explicit authority.
 * @param {string|null} [options.queryProvenance.contextualPlaceText] Appended retrieval context, never parsed as traveler text.
 * @returns {Promise<{ name: string, lat: number, lon: number, source: string }|null>}
 */
async function geocodePlace(query, {
  signal,
  reportFailure = false,
  bias = null,
  tripContext = null,
  geocodeCandidates = null,
  queryProvenance = null,
} = {}) {
  checkAbort(signal);
  if (!query || query.trim().length < 2) return null;
  const normalized = query.trim().toLowerCase();
  const biasKey = bias?.coordinateBias
    ? `@${Number(bias.coordinateBias.lat).toFixed(2)},${Number(bias.coordinateBias.lon).toFixed(2)}`
    : (bias?.state ? `@${String(bias.state).toLowerCase()}` : '');
  // The provider query is retrieval text. Only the separately retained traveler
  // text/fields may confer explicit geography authority. Legacy direct callers
  // still supply raw place text as their first argument.
  const rawTravelerPlaceText = queryProvenance ? queryProvenance.rawTravelerPlaceText : query;
  const rankingText = rawTravelerPlaceText || queryProvenance?.groundedPlaceText || '';
  const explicitRegion = queryProvenance?.explicitTravelerRegion
    || extractExplicitRegionFromPlaceText(rawTravelerPlaceText);
  const explicitCountry = queryProvenance?.explicitTravelerCountry || null;
  const rankingBias = queryProvenance?.contextualRegions?.length
    ? { ...bias, states: queryProvenance.contextualRegions } : bias;
  const cacheKey = `${normalized}${biasKey}|${JSON.stringify({
    queryProvenance, explicitRegion, explicitCountry, bias: rankingBias, tripContext,
  })}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const known = KNOWN_PLACES[normalized] || KNOWN_PLACES[barePlaceName(normalized)];
  if (known) {
    const result = { ...known, source: 'trailverse-known-place' };
    setCache(cacheKey, result);
    return result;
  }

  let candidates;
  let providerFailed = false;
  if (typeof geocodeCandidates === 'function') {
    candidates = await geocodeCandidates(query, { signal, bias, tripContext });
    if (!Array.isArray(candidates)) candidates = [];
  } else {
    const fetched = await fetchGeocodeCandidates(query, { signal, bias });
    candidates = fetched.candidates;
    providerFailed = fetched.providerFailed;
  }

  checkAbort(signal);
  if (!candidates.length && providerFailed && reportFailure) {
    throw Object.assign(new Error('Geocode provider failed'), { code: 'geocode_provider_failure' });
  }

  const ranked = rankGeocodeCandidates(candidates, tripContext, {
    query: rankingText, bias: rankingBias, explicitRegion, explicitCountry,
  });
  if (!ranked.selected) {
    if (providerFailed && reportFailure) {
      throw Object.assign(new Error('Geocode provider failed'), { code: 'geocode_provider_failure' });
    }
    return null;
  }

  const result = {
    name: ranked.selected.name,
    lat: ranked.selected.lat,
    lon: ranked.selected.lon,
    source: ranked.selected.source || 'geocode',
    admin1: ranked.selected.admin1 || ranked.selected.state || null,
    stateCode: ranked.selected.stateCode || null,
    selectionReason: ranked.selectionReason,
    resolutionStatus: ranked.resolutionStatus,
    resolutionConfidence: ranked.resolutionConfidence,
  };
  setCache(cacheKey, result);
  return result;
}

function matchKnownPlace(userMessage) {
  const lower = String(userMessage || '').toLowerCase();
  let best = null;
  for (const [key, value] of Object.entries(KNOWN_PLACES)) {
    if (!lower.includes(key)) continue;
    if (!best || key.length > best.key.length) best = { key, ...value };
  }
  return best;
}

function buildResolutionTelemetry({
  inputPlaceText,
  tripContext,
  bias,
  querySent,
  candidateCount,
  regionMatches,
  selected,
  selectionReason,
  resolutionConfidence,
  resolutionStatus,
  contextualRetryUsed,
}) {
  return {
    inputPlaceText: inputPlaceText || null,
    activeDestination: tripContext?.destination?.name || tripContext?.destination?.parkCode || null,
    activeRegions: (tripContext?.regions || bias?.states || []).map((r) => r.code || r.name),
    coordinateBias: bias?.coordinateBias || null,
    textualRegionBias: bias?.state || null,
    querySent: querySent || null,
    candidateCount: candidateCount ?? 0,
    candidateRegionMatches: regionMatches ?? 0,
    selectedCandidate: selected
      ? { name: selected.name, lat: selected.lat, lon: selected.lon, source: selected.source }
      : null,
    selectionReason: selectionReason || null,
    resolutionConfidence: resolutionConfidence || null,
    resolutionStatus: resolutionStatus || null,
    contextualRetryUsed: Boolean(contextualRetryUsed),
  };
}

/**
 * Extract and geocode a place from a user message using active-trip context.
 * @param {string} userMessage
 * @param {object} [options]
 * @param {object} [options.tripContext]
 * @param {object} [options.bias]
 * @param {Function} [options.geocodeCandidates] - offline fixture injector
 */
async function resolvePlaceFromMessage(userMessage, options = {}) {
  const tripContext = options.tripContext
    || options.context
    || buildActivePlaceResolutionContext(options);
  const bias = options.bias || buildGeocodeBiasFromTripContext(tripContext || options);
  const known = matchKnownPlace(options.placeQuery || userMessage);
  if (known) {
    const result = {
      name: known.name,
      lat: known.lat,
      lon: known.lon,
      source: 'trailverse-known-place',
      query: known.key,
      resolutionStatus: 'resolved',
      resolutionConfidence: 'high',
      selectionReason: 'known_place',
      tripContext,
      bias,
      telemetry: buildResolutionTelemetry({
        inputPlaceText: known.key,
        tripContext,
        bias,
        querySent: known.key,
        candidateCount: 1,
        regionMatches: 0,
        selected: known,
        selectionReason: 'known_place',
        resolutionConfidence: 'high',
        resolutionStatus: 'resolved',
        contextualRetryUsed: false,
      }),
    };
    return result;
  }

  const query = options.placeQuery || extractPlaceFromMessage(userMessage);
  if (!query) return null;

  const explicitRegion = extractExplicitRegionFromPlaceText(query);
  // Explicit traveler geography outranks contextual query rewriting.
  let geocodeQuery = query;
  const textualRegion = bias?.state || tripContext?.regions?.[0]?.name || null;
  if (!explicitRegion && textualRegion && !/,\s*[A-Za-z]{2,}\s*$/.test(query)) {
    geocodeQuery = `${query}, ${textualRegion}`;
  }

  const runOnce = async (q, { contextualRetryUsed }) => {
    let candidates = [];
    let providerFailed = false;
    try {
      if (typeof options.geocodeCandidates === 'function') {
        candidates = await options.geocodeCandidates(q, {
          signal: options.signal,
          bias,
          tripContext,
        });
        if (!Array.isArray(candidates)) candidates = [];
      } else {
        const fetched = await fetchGeocodeCandidates(q, { signal: options.signal, bias });
        candidates = fetched.candidates;
        providerFailed = fetched.providerFailed;
      }
    } catch (err) {
      if (err?.name === 'AbortError' || err?.code === 'ABORT_ERR') throw err;
      providerFailed = true;
    }

    if (!candidates.length && providerFailed) {
      return {
        result: null,
        telemetry: buildResolutionTelemetry({
          inputPlaceText: query,
          tripContext,
          bias,
          querySent: q,
          candidateCount: 0,
          regionMatches: 0,
          selected: null,
          selectionReason: 'provider_failure',
          resolutionConfidence: 'none',
          resolutionStatus: 'provider_failure',
          contextualRetryUsed,
        }),
        resolutionStatus: 'provider_failure',
        providerFailed: true,
      };
    }

    const ranked = rankGeocodeCandidates(candidates, tripContext, {
      query: q,
      bias,
      explicitRegion,
    });
    const telemetry = buildResolutionTelemetry({
      inputPlaceText: query,
      tripContext,
      bias,
      querySent: q,
      candidateCount: candidates.length,
      regionMatches: ranked.regionMatches,
      selected: ranked.selected,
      selectionReason: ranked.selectionReason,
      resolutionConfidence: ranked.resolutionConfidence,
      resolutionStatus: ranked.resolutionStatus,
      contextualRetryUsed,
    });

    if (!ranked.selected) {
      return {
        result: null,
        telemetry,
        resolutionStatus: ranked.resolutionStatus,
        providerFailed: false,
      };
    }

    return {
      result: {
        name: ranked.selected.name,
        lat: ranked.selected.lat,
        lon: ranked.selected.lon,
        source: ranked.selected.source || 'geocode',
        admin1: ranked.selected.admin1 || ranked.selected.state || null,
        stateCode: ranked.selected.stateCode || null,
        query,
        resolutionStatus: ranked.resolutionStatus,
        resolutionConfidence: ranked.resolutionConfidence,
        selectionReason: ranked.selectionReason,
        tripContext,
        bias,
        telemetry,
      },
      telemetry,
      resolutionStatus: ranked.resolutionStatus,
      providerFailed: false,
    };
  };

  // Prefer contextual query first when region bias exists; one deterministic
  // fallback to the bare place text if the contextual form yields nothing.
  let first = await runOnce(geocodeQuery, { contextualRetryUsed: false });
  if (!first.result && geocodeQuery !== query && first.resolutionStatus !== 'provider_failure') {
    const second = await runOnce(query, { contextualRetryUsed: true });
    // If bare query would accept a context-mismatched first hit, keep mismatch.
    if (second.result) return second.result;
    if (second.resolutionStatus === 'provider_failure') {
      return {
        name: null,
        lat: null,
        lon: null,
        source: null,
        query,
        resolutionStatus: 'provider_failure',
        resolutionConfidence: 'none',
        selectionReason: 'provider_failure',
        tripContext,
        bias,
        telemetry: second.telemetry,
      };
    }
    return {
      name: null,
      lat: null,
      lon: null,
      source: null,
      query,
      resolutionStatus: first.resolutionStatus || 'unresolved',
      resolutionConfidence: 'none',
      selectionReason: first.telemetry?.selectionReason || 'unresolved',
      tripContext,
      bias,
      telemetry: first.telemetry,
    };
  }

  if (first.result) return first.result;

  if (first.resolutionStatus === 'provider_failure') {
    return {
      name: null,
      lat: null,
      lon: null,
      source: null,
      query,
      resolutionStatus: 'provider_failure',
      resolutionConfidence: 'none',
      selectionReason: 'provider_failure',
      tripContext,
      bias,
      telemetry: first.telemetry,
    };
  }

  return {
    name: null,
    lat: null,
    lon: null,
    source: null,
    query,
    resolutionStatus: first.resolutionStatus || 'unresolved',
    resolutionConfidence: 'none',
    selectionReason: first.telemetry?.selectionReason || 'unresolved',
    tripContext,
    bias,
    telemetry: first.telemetry,
  };
}

module.exports = {
  extractPlaceFromMessage,
  geocodePlace,
  matchKnownPlace,
  resolvePlaceFromMessage,
  buildGeocodeBiasFromTripContext,
  buildActivePlaceResolutionContext,
  rankGeocodeCandidates,
  parseFiniteCoord,
  isUsableCoordinatePair,
  normalizeRegionList,
  extractExplicitRegionFromPlaceText,
  KNOWN_PLACES,
};
