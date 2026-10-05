const { fetchGoogleMaps: fetch } = require('./googleMapsTransport');
const { extractUserCity } = require('./factsService');
const { getNearestAirports, getAirportByCode } = require('../utils/airportCoordinates');
const { stopsShareActivityGroup } = require('../utils/activityGroupValidation');

const drivingTimesCache = new Map();
const DRIVING_TIMES_CACHE_MAX = 150;

function setDrivingTimesCacheEntry(key, value) {
  if (drivingTimesCache.has(key)) drivingTimesCache.delete(key);
  drivingTimesCache.set(key, value);
  while (drivingTimesCache.size > DRIVING_TIMES_CACHE_MAX) {
    const oldest = drivingTimesCache.keys().next().value;
    drivingTimesCache.delete(oldest);
  }
}

function stopCoords(stop) {
  const lat = parseFloat(stop?.latitude);
  const lon = parseFloat(stop?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat === 0 && lon === 0) return null;
  return { lat, lon };
}

/**
 * Google driving duration in minutes between two points (cached).
 * @returns {Promise<number|null>}
 */
async function getDrivingMinutesBetween(from, to, logPrefix = '[AI]') {
  const apiKey = process.env.GMAPS_SERVER_KEY;
  if (!apiKey || !from || !to) return null;

  const cacheKey = `${from.lat},${from.lon}→${to.lat},${to.lon}`;
  const cached = drivingTimesCache.get(cacheKey);
  if (cached?.minutes != null) return cached.minutes;

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${from.lat},${from.lon}&destinations=${to.lat},${to.lon}&units=imperial&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' || !data.rows?.[0]?.elements?.[0]) {
      console.warn(`${logPrefix} Distance Matrix API error:`, data.status);
      return null;
    }

    const element = data.rows[0].elements[0];
    if (element.status !== 'OK' || element.duration?.value == null) {
      return null;
    }

    const minutes = Math.max(1, Math.round(element.duration.value / 60));
    setDrivingTimesCacheEntry(cacheKey, {
      minutes,
      text: element.duration.text,
      distText: element.distance?.text,
    });
    return minutes;
  } catch (err) {
    console.warn(`${logPrefix} getDrivingMinutesBetween error:`, err.message);
    return null;
  }
}

const MAX_ITINERARY_DRIVE_LEGS = 24;

/**
 * Phase 9C.1B — adjacency alone must never authorize a driving transition.
 * This function used to walk every stop and call Distance Matrix for ANY
 * two consecutive coordinate-bearing stops, with zero awareness of whether
 * they were separate destinations or waypoints on one continuous activity
 * (Phase 9C.1A recon: a live correctness gap, not hypothetical). Until
 * Phase 9C.1C defines real travel-edge authority (mode + provenance), the
 * only thing this can determine is a NEGATIVE: two stops in the same
 * continuous-activity group definitely do not warrant an independent drive
 * lookup. There is currently no POSITIVE signal anywhere in the codebase
 * that ordinary stop-to-stop adjacency represents ground travel at all
 * (verified inter-destination transfers are a separate, already-correct
 * system — see routeEvidenceDriveBridge.js / roadTripContract.js, untouched
 * by this function). So this always returns false for now; the explicit
 * same-activity check stays as the seam Phase 9C.1C will extend.
 */
function hasAuthoritativeDrivingTransition(day, fromStop, toStop) {
  if (!fromStop || !toStop) return false;
  if (stopsShareActivityGroup(day, fromStop.id, toStop.id)) return false;
  return false; // no positive travel-edge authority signal exists yet (9C.1C)
}

/**
 * Phase 9C.1D.1 — the only same-day candidate origin for a stop.
 *
 * Walks backward within THIS day's own `stops` array for the nearest earlier
 * coordinate-bearing stop. Deliberately never looks past `stops[0]`: the
 * first stop of a day has no same-day predecessor, full stop. A previous
 * day's last stop is a different day's endpoint, not an intra-day one, and
 * must never be produced as a candidate here — cross-destination/cross-day
 * transitions are `routeEvidenceDriveBridge`'s verified territory, untouched
 * by this function.
 *
 * @returns {object|null} the origin stop, or null if none exists.
 */
function resolveIntraDayOriginStop(stops, index) {
  if (!Array.isArray(stops) || index <= 0) return null;
  for (let j = index - 1; j >= 0; j--) {
    if (stopCoords(stops[j])) return stops[j];
  }
  return null;
}

/**
 * Backfill drivingTimeFromPreviousMin on itinerary stops using Google Distance Matrix.
 * Mutates and returns itineraryData.
 *
 * Phase 9C.1B: a stop's OWN, model-authored `drivingTimeFromPreviousMin` is
 * candidate data, not verified route truth (the same principle Phase 9B.1
 * established for coordinates) — it is stripped to null unless THIS pass
 * assigns a verified value below.
 */
async function enrichItineraryDrivingTimes(itineraryData, logPrefix = '[AI]') {
  if (!itineraryData?.days?.length) {
    return itineraryData;
  }

  const hasKey = Boolean(process.env.GMAPS_SERVER_KEY);
  let legsUsed = 0;
  let enriched = 0;

  for (const day of itineraryData.days) {
    if (!Array.isArray(day.stops)) continue;

    for (let i = 0; i < day.stops.length; i++) {
      const stop = day.stops[i];
      const coords = stopCoords(stop);
      // Strip unverified candidate data first — only a verified assignment
      // below may re-populate this field.
      stop.drivingTimeFromPreviousMin = null;
      if (!coords) continue;

      // Phase 9C.1D.1: same-day-only by construction — this never crosses
      // into the previous day's stops, so no day-identity check is needed.
      const originStop = resolveIntraDayOriginStop(day.stops, i);
      const origin = originStop ? stopCoords(originStop) : null;

      if (
        origin && hasKey && legsUsed < MAX_ITINERARY_DRIVE_LEGS
        && hasAuthoritativeDrivingTransition(day, originStop, stop)
      ) {
        const minutes = await getDrivingMinutesBetween(origin, coords, logPrefix);
        if (minutes != null) {
          stop.drivingTimeFromPreviousMin = minutes;
          enriched += 1;
          legsUsed += 1;
        }
      }
    }
  }

  if (enriched > 0) {
    console.log(`${logPrefix} Itinerary stop drive times enriched from Google: ${enriched} legs`);
  }

  return itineraryData;
}

function parkPoint(park) {
  return {
    name: park.parkName,
    lat: park.lat,
    lon: park.lon,
  };
}

function cityPoint(city) {
  return {
    name: city.name,
    lat: city.lat,
    lon: city.lon,
  };
}

/**
 * Parse IATA airport code from user message (fly into SLC, LAS airport, etc.)
 * @param {string} userMessage
 */
function extractAirportFromMessage(userMessage) {
  if (!userMessage) return null;

  const iataAirport = userMessage.match(/\b([A-Z]{3})\s+airport\b/i);
  if (iataAirport) {
    return getAirportByCode(iataAirport[1]);
  }

  const flyIntoCode = userMessage.match(/\bfly(?:ing)?\s+into\s+([A-Z]{3})\b/i);
  if (flyIntoCode) {
    return getAirportByCode(flyIntoCode[1]);
  }

  const viaCode = userMessage.match(/\b(?:from|into|via|through)\s+([A-Z]{3})\b/);
  if (viaCode && getAirportByCode(viaCode[1])) {
    return getAirportByCode(viaCode[1]);
  }

  const flyIntoCity = userMessage.match(/\bfly(?:ing)?\s+into\s+([^.,!?]+)/i);
  if (flyIntoCity) {
    const city = extractUserCity(`from ${flyIntoCity[1].trim()}`);
    if (city) {
      return { name: `${city.name} area`, lat: city.lat, lon: city.lon, code: null };
    }
  }

  return null;
}

function shouldIncludeInParkRoutes(userMessage) {
  if (!userMessage) return false;
  const planning = (
    /\b(plan|itinerary|schedule|day[- ]?by[- ]?day|things to do)\b/i.test(userMessage)
    || /\b\d{1,2}\s*[- ]?day\b/i.test(userMessage)
    || /\b(scenic drive|loop road|drive between|driving between)\b/i.test(userMessage)
  );
  const inParkDistance = (
    /\b(visitor center|visitor centre|trailhead|campground|lodge|shuttle stop)\b/i.test(userMessage)
    && /\b(how far|how long|distance|drive from|drive to|between)\b/i.test(userMessage)
  );
  return planning || inParkDistance;
}

/** Pure status/conditions — skip driving only when logistics are not also asked. */
function isOperationalParkQuery(userMessage) {
  if (!userMessage) return false;
  return (
    /\b(is|are|was|still)\b.*\b(open|closed|accessible)\b/i.test(userMessage)
    || /\b(open|closed|status)\b.*\b(trail|narrows|angel|hike|route)\b/i.test(userMessage)
    || /\b(narrows|angels landing)\b.*\b(open|closed)\b/i.test(userMessage)
    || /\b(weather|temperature|forecast)\b/i.test(userMessage)
    || /\b(how crowded|crowded in|crowds? in)\b/i.test(userMessage)
  );
}

function isOperationalOnlyQuery(userMessage, { parks, userCity, airport }) {
  if (!isOperationalParkQuery(userMessage)) return false;
  if (parks.length > 1) return false;
  if (userCity || airport) return false;
  if (shouldIncludeInParkRoutes(userMessage)) return false;
  if (hasLogisticsIntent(userMessage)) return false;
  return true;
}

function hasLogisticsIntent(userMessage) {
  if (!userMessage) return false;
  return (
    /\b(drive|driving|road trip|fly|flight|airport|getting there|get there|get to|getting to|directions|how to reach|how far|how long|mileage|rental car|gateway town|nearest airport|closest airport)\b/i.test(userMessage)
    || /\b(weekend trip|day trip|vacation to|trip to|visit from|traveling from|coming from|leave from)\b/i.test(userMessage)
    || /\bfrom\s+[a-z]/i.test(userMessage)
  );
}

function isInParkDistanceQuery(userMessage) {
  if (!userMessage) return false;
  return (
    /\b(visitor center|visitor centre|trailhead|campground|lodge)\b/i.test(userMessage)
    && /\b(how far|how long|distance|drive from|drive to|between)\b/i.test(userMessage)
  );
}

/**
 * Only inject driving times when the question involves travel logistics or trip planning.
 */
function shouldInjectDrivingTimes({ userMessage, parks, userCity, airport }) {
  if (!parks?.length) return false;
  if (isOperationalOnlyQuery(userMessage, { parks, userCity, airport })) return false;

  if (parks.length > 1) return true;
  if (userCity || airport) return true;
  if (shouldIncludeInParkRoutes(userMessage)) return true;
  if (hasLogisticsIntent(userMessage)) return true;

  return false;
}

function shouldInjectNearestAirports({ userMessage, userCity, airport }) {
  if (userCity || airport) return false;
  if (isInParkDistanceQuery(userMessage)) return false;
  return shouldIncludeInParkRoutes(userMessage) || hasLogisticsIntent(userMessage);
}

/**
 * Build driving legs for Trailie prompt injection.
 * @returns {Promise<Array<{ from: object, to: object, group: 'access'|'interpark'|'inpark' }>>}
 */
async function buildDrivingTimeLegs({ parks, userCity, userMessage }) {
  if (!parks?.length) return [];

  const legs = [];
  const airport = extractAirportFromMessage(userMessage);
  const singlePark = parks.length === 1;
  const primary = parks[0];

  if (parks.length > 1) {
    const chain = [];
    if (userCity) chain.push(cityPoint(userCity));
    for (const park of parks) chain.push(parkPoint(park));
    for (let i = 0; i < chain.length - 1; i++) {
      legs.push({ from: chain[i], to: chain[i + 1], group: 'access' });
    }
    return legs;
  }

  // Single park — departure city or explicit airport
  if (userCity) {
    legs.push({ from: cityPoint(userCity), to: parkPoint(primary), group: 'access' });
  } else if (airport) {
    legs.push({ from: airport, to: parkPoint(primary), group: 'access' });
  } else if (shouldInjectNearestAirports({ userMessage, userCity, airport })) {
    const nearest = getNearestAirports(primary.lat, primary.lon, 2);
    for (const ap of nearest) {
      legs.push({ from: ap, to: parkPoint(primary), group: 'access' });
    }
  }

  if (singlePark && shouldIncludeInParkRoutes(userMessage)) {
    const inParkLegs = await buildInParkLegs(primary.parkCode, userMessage);
    legs.push(...inParkLegs);
  }

  return legs;
}

async function buildInParkLegs(parkCode, userMessage = '') {
  const { getNpsService } = require('./npsService');
  const code = String(parkCode || '').toLowerCase();
  if (!code) return [];

  try {
    const [visitorCenters, places] = await Promise.all([
      getNpsService().getParkVisitorCenters(code),
      getNpsService().getParkPlaces(code),
    ]);

    const msg = String(userMessage || '').toLowerCase();
    const points = [];
    const vc = (visitorCenters || []).find((c) => c.latitude && c.longitude)
      || (visitorCenters || [])[0];
    if (vc?.latitude != null && vc?.longitude != null) {
      points.push({
        name: vc.name || 'Visitor Center',
        lat: parseFloat(vc.latitude),
        lon: parseFloat(vc.longitude),
      });
    }

    const placeCandidates = (places || [])
      .filter((p) => p.latitude != null && p.longitude != null)
      .filter((p) => {
        if (!isInParkDistanceQuery(userMessage)) return true;
        const title = String(p.title || p.name || '').toLowerCase();
        return msg.split(/\s+/).some((word) => word.length > 4 && title.includes(word));
      })
      .slice(0, isInParkDistanceQuery(userMessage) ? 1 : 3);

    for (const place of placeCandidates) {
      points.push({
        name: place.title || place.name || 'Park stop',
        lat: parseFloat(place.latitude),
        lon: parseFloat(place.longitude),
      });
    }

    if (points.length < 2) return [];

    const legs = [];
    for (let i = 0; i < points.length - 1; i++) {
      legs.push({ from: points[i], to: points[i + 1], group: 'inpark' });
    }
    return legs;
  } catch {
    return [];
  }
}

async function fetchDrivingTimeLegs(legs, logPrefix = '[AI]') {
  if (!legs?.length) return null;

  const apiKey = process.env.GMAPS_SERVER_KEY;
  if (!apiKey) {
    console.warn(`${logPrefix} GMAPS_SERVER_KEY not set — skipping driving times`);
    return null;
  }

  const accessLines = [];
  const inParkLines = [];

  try {
    for (const leg of legs) {
      const { from, to, group } = leg;
      const cacheKey = `${from.lat},${from.lon}→${to.lat},${to.lon}`;

      let result = drivingTimesCache.get(cacheKey);
      if (!result) {
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${from.lat},${from.lon}&destinations=${to.lat},${to.lon}&units=imperial&key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.status !== 'OK' || !data.rows?.[0]?.elements?.[0]) {
          console.warn(`${logPrefix} Distance Matrix API error for ${from.name}→${to.name}:`, data.status);
          continue;
        }

        const element = data.rows[0].elements[0];
        if (element.status !== 'OK') {
          console.warn(`${logPrefix} No route for ${from.name}→${to.name}:`, element.status);
          continue;
        }

        result = { minutes: Math.max(1, Math.round(element.duration.value / 60)), text: element.duration.text, distText: element.distance.text };
        setDrivingTimesCacheEntry(cacheKey, result);
        console.log(`${logPrefix} Driving time fetched: ${from.name}→${to.name} = ${result.distText}, ${result.text}`);
      }

      const line = `• ${from.name} → ${to.name}: ${result.distText}, ~${result.text}`;
      if (group === 'inpark') inParkLines.push(line);
      else accessLines.push(line);
    }

    if (accessLines.length === 0 && inParkLines.length === 0) return null;

    let block = '\n\n--- DRIVING DISTANCES (Google Maps) ---';
    block += '\nThese are real driving times. Use them instead of estimating.';
    if (accessLines.length > 0) {
      block += '\n\nACCESS (airports, departure city, or between parks):';
      block += `\n${accessLines.join('\n')}`;
    }
    if (inParkLines.length > 0) {
      block += '\n\nIN-PARK (visitor center to featured stops — use for day-plan drive times):';
      block += `\n${inParkLines.join('\n')}`;
    }
    block += '\n--- END DRIVING DISTANCES ---\n';
    return block;
  } catch (err) {
    console.error(`${logPrefix} fetchDrivingTimeLegs error:`, err.message);
    return null;
  }
}

/**
 * Build and fetch driving-time prompt block for Trailie.
 */
async function buildDrivingTimeContext({ parks, userCity, userMessage, logPrefix = '[AI]' }) {
  const airport = extractAirportFromMessage(userMessage);
  if (!shouldInjectDrivingTimes({ userMessage, parks, userCity, airport })) {
    return null;
  }
  const legs = await buildDrivingTimeLegs({ parks, userCity, userMessage });
  if (!legs.length) return null;
  return fetchDrivingTimeLegs(legs, logPrefix);
}

module.exports = {
  buildDrivingTimeContext,
  buildDrivingTimeLegs,
  buildInParkLegs,
  extractAirportFromMessage,
  fetchDrivingTimeLegs,
  getDrivingMinutesBetween,
  enrichItineraryDrivingTimes,
  resolveIntraDayOriginStop,
  hasAuthoritativeDrivingTransition,
  shouldInjectDrivingTimes,
  shouldIncludeInParkRoutes,
  isOperationalParkQuery,
  isOperationalOnlyQuery,
  hasLogisticsIntent,
  isInParkDistanceQuery,
};
