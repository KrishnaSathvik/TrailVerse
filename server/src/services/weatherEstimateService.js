/**
 * Trailie weather: live OpenWeather forecast (≤5 days) or monthly climate estimates.
 */

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** OpenWeather /forecast horizon — use estimates beyond this. */
const LIVE_FORECAST_MAX_DAYS = 5;

const MONTH_NAME_TO_NUMBER = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 11,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/**
 * Tier-A parks — typical monthly highs/lows (°F) at main visitor areas.
 * Source: NPS/planning norms; rounded for trip-planning (not a live forecast).
 */
const PARK_MONTHLY_CLIMATE = {
  arch: {
    6: { high: 95, low: 60 },
    7: { high: 100, low: 65 },
    8: { high: 97, low: 63 },
    9: { high: 88, low: 55 },
    10: { high: 72, low: 42 },
    11: { high: 55, low: 30 },
  },
  cany: {
    6: { high: 93, low: 58 },
    7: { high: 98, low: 63 },
    8: { high: 95, low: 61 },
    9: { high: 86, low: 53 },
    10: { high: 70, low: 40 },
    11: { high: 52, low: 28 },
  },
  romo: {
    6: { high: 68, low: 40 },
    7: { high: 72, low: 45 },
    8: { high: 70, low: 43 },
    9: { high: 62, low: 35 },
    10: { high: 52, low: 28 },
    11: { high: 40, low: 20 },
  },
  yell: {
    6: { high: 70, low: 38 },
    7: { high: 78, low: 42 },
    8: { high: 76, low: 40 },
    9: { high: 64, low: 32 },
    10: { high: 50, low: 24 },
  },
  yose: {
    6: { high: 82, low: 50 },
    7: { high: 90, low: 55 },
    8: { high: 88, low: 53 },
    9: { high: 78, low: 45 },
    10: { high: 65, low: 35 },
  },
  zion: {
    6: { high: 98, low: 68 },
    7: { high: 102, low: 72 },
    8: { high: 100, low: 70 },
    9: { high: 90, low: 60 },
    10: { high: 78, low: 48 },
  },
  glac: {
    6: { high: 68, low: 40 },
    7: { high: 75, low: 45 },
    8: { high: 73, low: 43 },
    9: { high: 62, low: 35 },
    10: { high: 48, low: 28 },
  },
  grca: {
    6: { high: 92, low: 58 },
    7: { high: 98, low: 64 },
    8: { high: 94, low: 62 },
    9: { high: 86, low: 54 },
    10: { high: 72, low: 42 },
  },
  deva: {
    6: { high: 110, low: 82 },
    7: { high: 116, low: 88 },
    8: { high: 114, low: 86 },
    9: { high: 102, low: 74 },
    10: { high: 88, low: 58 },
  },
  acad: {
    6: { high: 72, low: 52 },
    7: { high: 78, low: 58 },
    8: { high: 76, low: 56 },
    9: { high: 68, low: 48 },
    10: { high: 58, low: 38 },
  },
};

/** Continental baseline monthly highs by latitude band (°F). Lows ≈ high - 28–35. */
const MID_LAT_MONTHLY_HIGH = {
  1: 42,
  2: 46,
  3: 54,
  4: 62,
  5: 72,
  6: 82,
  7: 88,
  8: 86,
  9: 76,
  10: 64,
  11: 50,
  12: 42,
};

const NORTH_LAT_MONTHLY_HIGH = {
  1: 28,
  2: 32,
  3: 40,
  4: 50,
  5: 60,
  6: 70,
  7: 76,
  8: 74,
  9: 64,
  10: 52,
  11: 38,
  12: 28,
};

const SOUTH_LAT_MONTHLY_HIGH = {
  1: 58,
  2: 62,
  3: 70,
  4: 78,
  5: 86,
  6: 94,
  7: 98,
  8: 96,
  9: 88,
  10: 78,
  11: 66,
  12: 58,
};

function parseIsoDate(value) {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * @param {{ startDate?: string, endDate?: string } | null} tripDates
 * @param {string} [userMessage]
 * @returns {{ start: Date, end: Date, month: number } | null}
 */
function resolveTripWeatherWindow(tripDates, userMessage = '') {
  const start = parseIsoDate(tripDates?.startDate);
  if (start) {
    const end = parseIsoDate(tripDates?.endDate) || start;
    return { start, end, month: start.getMonth() + 1 };
  }

  const msg = (userMessage || '').toLowerCase();
  for (const [name, num] of Object.entries(MONTH_NAME_TO_NUMBER)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(msg)) {
      return { start: null, end: null, month: num };
    }
  }

  if (/\b(summer|midsummer)\b/i.test(msg)) return { start: null, end: null, month: 7 };
  if (/\b(winter)\b/i.test(msg)) return { start: null, end: null, month: 1 };
  if (/\b(spring)\b/i.test(msg)) return { start: null, end: null, month: 4 };
  if (/\b(fall|autumn)\b/i.test(msg)) return { start: null, end: null, month: 10 };

  return null;
}

/**
 * @param {{ start?: Date|null, end?: Date|null }} window
 * @returns {'live' | 'estimate'}
 */
function resolveWeatherMode(window) {
  if (!window?.start) return 'estimate';
  const today = startOfDay(new Date());
  const tripStart = startOfDay(window.start);
  const daysUntil = Math.round((tripStart - today) / (24 * 60 * 60 * 1000));
  return daysUntil <= LIVE_FORECAST_MAX_DAYS ? 'live' : 'estimate';
}

function isDesertInterior(lat, lon) {
  return lat >= 31 && lat <= 42 && lon <= -102 && lon >= -118;
}

function isHighElevationRockies(lat, lon) {
  return lat >= 37 && lat <= 47 && lon <= -104 && lon >= -116;
}

function baselineMonthlyHigh(lat, month) {
  if (lat >= 44) return NORTH_LAT_MONTHLY_HIGH[month] ?? 55;
  if (lat < 34) return SOUTH_LAT_MONTHLY_HIGH[month] ?? 75;
  return MID_LAT_MONTHLY_HIGH[month] ?? 65;
}

/**
 * @param {{ lat: number, lon: number, month: number, parkCode?: string }} params
 * @returns {{ high: number, low: number, conditions: string }}
 */
function estimateMonthlyClimate({ lat, lon, month, parkCode }) {
  const code = (parkCode || '').toLowerCase();
  const parkTable = PARK_MONTHLY_CLIMATE[code];
  if (parkTable?.[month]) {
    return {
      ...parkTable[month],
      conditions: describeConditions(month, parkTable[month].high, lat, lon),
    };
  }

  let high = baselineMonthlyHigh(lat, month);
  let low = high - 32;

  if (isDesertInterior(lat, lon)) {
    if (month >= 5 && month <= 9) high += 10;
    else if (month === 4 || month === 10) high += 6;
    low = high - 30;
  } else if (isHighElevationRockies(lat, lon)) {
    if (month >= 5 && month <= 9) high -= 8;
    else high -= 12;
    low = high - 28;
  } else if (lon < -95 && lat > 39) {
    low = high - 22;
  }

  high = Math.round(high);
  low = Math.round(low);

  return {
    high,
    low,
    conditions: describeConditions(month, high, lat, lon),
  };
}

function describeConditions(month, high, lat, lon) {
  if (high >= 95) return 'hot and dry';
  if (high >= 85) return 'warm to hot';
  if (high >= 70) return 'mild to warm';
  if (high >= 50) return 'cool to mild';
  if (month >= 11 || month <= 2) return 'cold — winter conditions likely';
  if (isDesertInterior(lat, lon) && month <= 10 && month >= 3) return 'dry with cool mornings';
  return 'cool';
}

function formatTripDateRange(window) {
  if (!window?.start) {
    return MONTH_NAMES[(window?.month || 1) - 1];
  }
  const opts = { month: 'long', day: 'numeric', year: 'numeric' };
  const startLabel = window.start.toLocaleDateString('en-US', opts);
  if (!window.end || window.end.getTime() === window.start.getTime()) {
    return startLabel;
  }
  const endLabel = window.end.toLocaleDateString('en-US', opts);
  return `${startLabel} – ${endLabel}`;
}

/**
 * @param {{
 *   lat: number,
 *   lon: number,
 *   locationName?: string,
 *   parkCode?: string,
 *   tripDates?: { startDate?: string, endDate?: string } | null,
 *   userMessage?: string,
 * }} params
 * @returns {{ text: string, mode: 'live' | 'estimate', meta: object } | null}
 */
function buildEstimatedWeatherFacts({
  lat,
  lon,
  locationName = 'this area',
  parkCode,
  tripDates,
  userMessage,
}) {
  const window = resolveTripWeatherWindow(tripDates, userMessage);
  if (!window) return null;

  const { high, low, conditions } = estimateMonthlyClimate({
    lat,
    lon,
    month: window.month,
    parkCode,
  });

  const monthName = MONTH_NAMES[window.month - 1];
  const dateLabel = formatTripDateRange(window);
  const spread = high - low;
  const variability =
    spread >= 35
      ? 'Wide day/night swings — pack layers.'
      : spread >= 25
        ? 'Expect cool mornings and warmer afternoons.'
        : 'Temperatures stay fairly steady through the day.';

  let text = `Typical Weather Estimate for ${locationName} (${dateLabel}):\n`;
  text += `- Mode: TRAILVERSE CLIMATE ESTIMATE (not a live forecast)\n`;
  text += `- Typical ${monthName} highs: ${high}°F, lows: ${low}°F (${conditions})\n`;
  text += `- ${variability}\n`;
  text += `Use this for packing and hike timing on future trips. Do NOT present these as live forecast highs for the user's exact dates.`;
  text += ` Say "typically" or "historically in ${monthName}".`;

  if (high >= 90) {
    text += ` Heat risk: start hikes before 7am and avoid exposed midday trails when highs reach the ${high}s.`;
  } else if (high >= 80) {
    text += ` Desert/sun note: carry extra water even when highs are only in the ${high}s°F.`;
  } else if (high < 45) {
    text += ` Cold weather: ice or snow possible at elevation — check road status closer to departure.`;
  }

  return {
    text,
    mode: 'estimate',
    meta: {
      source: 'TrailVerseClimateEstimate',
      month: window.month,
      estimatedHighF: high,
      estimatedLowF: low,
    },
  };
}

module.exports = {
  LIVE_FORECAST_MAX_DAYS,
  resolveTripWeatherWindow,
  resolveWeatherMode,
  estimateMonthlyClimate,
  buildEstimatedWeatherFacts,
  PARK_MONTHLY_CLIMATE,
};
