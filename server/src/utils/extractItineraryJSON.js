/**
 * Extracts and strips the [ITINERARY_JSON] block from AI response content.
 * Returns clean content (for frontend) and structured itinerary data (for DB).
 */
function extractItineraryJSON(content) {
  if (!content || typeof content !== 'string') {
    return { cleanContent: content, itineraryData: null };
  }

  const match = content.match(/\[ITINERARY_JSON\]([\s\S]*?)\[\/ITINERARY_JSON\]/);
  if (!match) {
    return { cleanContent: content, itineraryData: null };
  }

  // Strip the block from content regardless of parse success
  const cleanContent = content
    .replace(/\[ITINERARY_JSON\][\s\S]*?\[\/ITINERARY_JSON\]/, '')
    .replace(/\n{3,}/g, '\n\n')  // collapse extra blank lines left behind
    .trim();

  try {
    const itineraryData = JSON.parse(match[1].trim());
    return { cleanContent, itineraryData };
  } catch (err) {
    console.warn('[extractItineraryJSON] Failed to parse JSON block:', err.message);
    return { cleanContent, itineraryData: null };
  }
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

/**
 * Validates a parsed itinerary for feasibility issues.
 * Returns an array of warning strings (empty if no issues).
 */
function validateItineraryFeasibility(itineraryData) {
  if (!itineraryData || !itineraryData.days) return [];

  const warnings = [];
  const MAX_ACTIVE_MINUTES = 14 * 60; // 14 hours max active day

  for (const day of itineraryData.days) {
    if (!day.stops || day.stops.length === 0) continue;
    const dayLabel = day.label || 'Day ' + day.dayNumber;

    let totalMinutes = 0;
    for (const stop of day.stops) {
      // Skip overnight stays — campgrounds/lodging aren't daytime activity
      if (stop.type === 'campground' || stop.type === 'lodging') {
        totalMinutes += (stop.drivingTimeFromPreviousMin || 0);
        continue;
      }
      totalMinutes += (stop.duration || 0) + (stop.drivingTimeFromPreviousMin || 0);
    }

    if (totalMinutes > MAX_ACTIVE_MINUTES) {
      const hours = Math.round(totalMinutes / 60 * 10) / 10;
      warnings.push(`${dayLabel}: ${hours}h of activity + driving — this exceeds a realistic day (14h max). Consider cutting a stop.`);
    }

    // Check for excessive driving
    let totalDriving = 0;
    for (const stop of day.stops) {
      totalDriving += (stop.drivingTimeFromPreviousMin || 0);
    }
    if (totalDriving > 300) { // 5+ hours driving in one day
      const drivingHours = Math.round(totalDriving / 60 * 10) / 10;
      warnings.push(`${dayLabel}: ${drivingHours}h of driving — you'll spend more time in the car than on trails.`);
    }

    // Geographic sequencing: detect backtracking using lat/lon on stops
    const geoStops = day.stops.filter(s => s.latitude != null && s.longitude != null);
    if (geoStops.length >= 3) {
      for (let i = 0; i < geoStops.length - 2; i++) {
        const a = geoStops[i];
        const b = geoStops[i + 1]; // next stop
        const c = geoStops[i + 2]; // stop after next
        const distAB = haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);
        const distAC = haversineDistance(a.latitude, a.longitude, c.latitude, c.longitude);
        // If stop C is significantly closer to stop A than stop B is, route backtracks
        if (distAC > 0 && distAB > 0 && distAC < distAB * 0.5 && distAB > 10) {
          warnings.push(`${dayLabel}: "${c.name || 'Stop ' + (i + 3)}" backtracks ~${Math.round(distAB - distAC)} mi toward "${a.name || 'Stop ' + (i + 1)}". Reorder stops to reduce driving.`);
          break; // one backtrack warning per day is enough
        }
      }
    }
  }

  // Cross-day geographic sequencing: detect when a later day starts far from where the previous day ended
  const daysWithGeo = itineraryData.days.filter(d => d.stops && d.stops.length > 0);
  for (let i = 0; i < daysWithGeo.length - 1; i++) {
    const prevDay = daysWithGeo[i];
    const nextDay = daysWithGeo[i + 1];
    const lastStop = [...prevDay.stops].reverse().find(s => s.latitude != null && s.longitude != null);
    const firstStop = nextDay.stops.find(s => s.latitude != null && s.longitude != null);
    if (lastStop && firstStop) {
      const overnightDist = haversineDistance(lastStop.latitude, lastStop.longitude, firstStop.latitude, firstStop.longitude);
      if (overnightDist > 100) {
        const prevLabel = prevDay.label || 'Day ' + prevDay.dayNumber;
        const nextLabel = nextDay.label || 'Day ' + nextDay.dayNumber;
        warnings.push(`${prevLabel}→${nextLabel}: ${Math.round(overnightDist)} mi between last stop and next morning's first stop. Consider adjusting lodging or reordering days.`);
      }
    }
  }

  return warnings;
}

module.exports = { extractItineraryJSON, validateItineraryFeasibility };
