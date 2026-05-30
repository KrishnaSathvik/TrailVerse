/** Keep in sync with server/src/utils/dailyFeedDate.js */
const FEED_TIMEZONE = 'America/Chicago';
const FEED_GENERATION_HOUR = 7;

function getZonedParts(date, timeZone = FEED_TIMEZONE) {
  const parts = {};
  for (const piece of new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date)) {
    if (piece.type !== 'literal') {
      parts[piece.type] = piece.value;
    }
  }
  return parts;
}

function ymdFromParts(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftYmd(ymd, dayDelta) {
  const [year, month, day] = ymd.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + dayDelta));
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getFeedDateKey(now = new Date()) {
  const parts = getZonedParts(now);
  const hour = Number(parts.hour);
  const todayYmd = ymdFromParts(parts);
  if (hour < FEED_GENERATION_HOUR) {
    return shiftYmd(todayYmd, -1);
  }
  return todayYmd;
}

export { FEED_TIMEZONE, FEED_GENERATION_HOUR };
