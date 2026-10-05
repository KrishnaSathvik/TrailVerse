/**
 * Extracts and strips the [ITINERARY_JSON] block from AI response content.
 * Returns clean content (for frontend) and structured itinerary data (for DB).
 */

const { normalizeCoordinates } = require('./coordinateValidation');

/**
 * Final safety pass — remove itinerary JSON artifacts even when malformed/truncated.
 * @param {string} content
 * @returns {string}
 */
function stripAnyItineraryJsonArtifacts(content = '') {
  if (!content || typeof content !== 'string') return content;

  let cleaned = content;

  // Complete block
  cleaned = cleaned.replace(/\[ITINERARY_JSON\][\s\S]*?\[\/ITINERARY_JSON\]/gi, '');

  // Truncated block: remove from opening marker to end
  cleaned = cleaned.replace(/\[ITINERARY_JSON\][\s\S]*$/gi, '');

  // Orphan closing marker
  cleaned = cleaned.replace(/\[\/ITINERARY_JSON\]/gi, '');

  // Fenced JSON blocks explicitly labeled as itinerary
  cleaned = cleaned.replace(
    /```(?:json)?\s*(?:\n|\r\n)?\s*(?:ITINERARY_JSON|itinerary[\s_-]?json)[\s\S]*?```/gi,
    ''
  );

  // Defensive cleanup for visible labels
  cleaned = cleaned.replace(/^\s*ITINERARY_JSON\s*:?\s*$/gim, '');

  return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

function extractItineraryJSON(content) {
  if (!content || typeof content !== 'string') {
    return { cleanContent: content, itineraryData: null };
  }

  const match = content.match(/\[ITINERARY_JSON\]([\s\S]*?)\[\/ITINERARY_JSON\]/i);
  let itineraryData = null;

  if (match) {
    try {
      itineraryData = JSON.parse(match[1].trim());
    } catch (err) {
      console.warn('[extractItineraryJSON] Failed to parse JSON block:', err.message);
    }
  }

  const cleanContent = stripAnyItineraryJsonArtifacts(content);
  return { cleanContent, itineraryData };
}

/**
 * Haversine distance between two lat/lon points in miles.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** A stop's coordinates, only if trusted enough for a distance calculation. */
function usableCoords(stop) {
  const norm = normalizeCoordinates({
    latitude: stop.latitude,
    longitude: stop.longitude,
    source: stop.coordinateSource,
  });
  return norm.valid ? norm : null;
}

/**
 * Stage 10 (F-QUAL-1) — validate a parsed itinerary for feasibility issues.
 * Returns STRUCTURED issues (not dead strings), each:
 *   { id, type, severity, dayNumber, stopIds, message, basis }
 *
 * Distance-dependent checks (backtracking / overnight) SKIP stops without
 * trusted coordinates and never calculate distance from fabricated defaults.
 * When a meaningful distance check could not run because coordinates are
 * missing, it emits one low-severity uncertainty notice — never a confirmed
 * failure (F-ACC-2 downstream behavior).
 */
function validateItineraryFeasibility(itineraryData) {
  if (!itineraryData || !itineraryData.days) return [];

  const issues = [];
  const MAX_ACTIVE_MINUTES = 14 * 60; // 14 hours max active day
  let totalStops = 0;

  for (const day of itineraryData.days) {
    if (!day.stops || day.stops.length === 0) continue;
    const dayNumber = day.dayNumber ?? null;
    const dayLabel = day.label || 'Day ' + dayNumber;
    totalStops += day.stops.length;

    let totalMinutes = 0;
    for (const stop of day.stops) {
      if (stop.type === 'campground' || stop.type === 'lodging') {
        totalMinutes += (stop.drivingTimeFromPreviousMin || 0);
        continue;
      }
      totalMinutes += (stop.duration || 0) + (stop.drivingTimeFromPreviousMin || 0);
    }

    if (totalMinutes > MAX_ACTIVE_MINUTES) {
      const hours = Math.round(totalMinutes / 60 * 10) / 10;
      issues.push({
        id: `feas-excessive-activity-d${dayNumber}`,
        type: 'excessive_activity',
        severity: 'warning',
        dayNumber,
        stopIds: day.stops.map((s) => s.id).filter(Boolean),
        message: `${dayLabel}: ${hours}h of activity + driving exceeds a realistic day (14h max). Consider cutting a stop.`,
        basis: 'active_minutes_exceeded',
      });
    }

    let totalDriving = 0;
    for (const stop of day.stops) totalDriving += (stop.drivingTimeFromPreviousMin || 0);
    if (totalDriving > 300) {
      const drivingHours = Math.round(totalDriving / 60 * 10) / 10;
      issues.push({
        id: `feas-excessive-driving-d${dayNumber}`,
        type: 'excessive_driving',
        severity: 'warning',
        dayNumber,
        stopIds: day.stops.map((s) => s.id).filter(Boolean),
        message: `${dayLabel}: ${drivingHours}h of driving — more time in the car than on trails.`,
        basis: 'driving_minutes_exceeded',
      });
    }

    // Geographic sequencing — only over stops with TRUSTED coordinates.
    const geoStops = day.stops.filter((s) => usableCoords(s));
    if (day.stops.length >= 3 && geoStops.length < 3) {
      // Missing location data means this optional route diagnostic is
      // unavailable; it is not itself a user-facing trip problem.
    }
    if (geoStops.length >= 3) {
      for (let i = 0; i < geoStops.length - 2; i++) {
        const a = geoStops[i];
        const b = geoStops[i + 1];
        const c = geoStops[i + 2];
        const distAB = haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);
        const distAC = haversineDistance(a.latitude, a.longitude, c.latitude, c.longitude);
        if (distAC > 0 && distAB > 0 && distAC < distAB * 0.5 && distAB > 10) {
          issues.push({
            id: `feas-backtrack-d${dayNumber}`,
            type: 'backtracking',
            severity: 'warning',
            dayNumber,
            stopIds: [a.id, c.id].filter(Boolean),
            message: `${dayLabel}: "${c.name || 'a later stop'}" backtracks ~${Math.round(distAB - distAC)} mi toward "${a.name || 'an earlier stop'}". Reorder stops to reduce driving.`,
            basis: 'route_backtrack',
          });
          break;
        }
      }
    }
  }

  // Cross-day overnight transition — only when both anchor stops have coords.
  const daysWithStops = itineraryData.days.filter((d) => d.stops && d.stops.length > 0);
  for (let i = 0; i < daysWithStops.length - 1; i++) {
    const prevDay = daysWithStops[i];
    const nextDay = daysWithStops[i + 1];
    const lastStop = [...prevDay.stops].reverse().find((s) => usableCoords(s));
    const firstStop = nextDay.stops.find((s) => usableCoords(s));
    if (lastStop && firstStop) {
      const overnightDist = haversineDistance(
        lastStop.latitude, lastStop.longitude, firstStop.latitude, firstStop.longitude
      );
      if (overnightDist > 100) {
        const prevLabel = prevDay.label || 'Day ' + prevDay.dayNumber;
        const nextLabel = nextDay.label || 'Day ' + nextDay.dayNumber;
        issues.push({
          id: `feas-overnight-d${prevDay.dayNumber}-d${nextDay.dayNumber}`,
          type: 'unrealistic_overnight',
          severity: 'warning',
          dayNumber: nextDay.dayNumber ?? null,
          stopIds: [lastStop.id, firstStop.id].filter(Boolean),
          message: `${prevLabel}→${nextLabel}: ${Math.round(overnightDist)} mi between the last stop and the next morning's first stop. Consider adjusting lodging or reordering days.`,
          basis: 'overnight_gap',
        });
      }
    }
  }

  return issues;
}

/** Legacy string projection for any consumer that still needs plain text. */
function feasibilityIssuesToMessages(issues = []) {
  return (issues || []).map((i) => (typeof i === 'string' ? i : i.message)).filter(Boolean);
}

module.exports = {
  extractItineraryJSON,
  stripAnyItineraryJsonArtifacts,
  validateItineraryFeasibility,
  feasibilityIssuesToMessages,
};
