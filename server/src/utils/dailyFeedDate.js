/** Daily feed calendar day and generation window (America/Chicago). */
const FEED_TIMEZONE = 'America/Chicago';
const FEED_GENERATION_HOUR = 7; // 7:00 AM local — fresh briefing for the day

function getZonedParts(date, timeZone = FEED_TIMEZONE) {
  const parts = {};
  for (const piece of new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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

function shiftFeedDate(ymd, dayDelta) {
  const [year, month, day] = ymd.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + dayDelta));
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Feed date key shown to users. Before 7 AM Chicago, still "yesterday's" briefing.
 */
function getFeedDateKey(now = new Date()) {
  const parts = getZonedParts(now);
  const hour = Number(parts.hour);
  const todayYmd = ymdFromParts(parts);
  if (hour < FEED_GENERATION_HOUR) {
    return shiftFeedDate(todayYmd, -1);
  }
  return todayYmd;
}

function isPastFeedWindowStart(now = new Date()) {
  const hour = Number(getZonedParts(now).hour);
  return hour >= FEED_GENERATION_HOUR;
}

/**
 * True when the saved feed was generated on/after 7 AM Chicago for feedDate.
 */
function wasGeneratedAfterFeedWindow(feedDoc, feedDate = getFeedDateKey()) {
  if (!feedDoc) return false;

  const timestamp = feedDoc.updatedAt || feedDoc.createdAt;
  if (!timestamp) return false;

  const parts = getZonedParts(new Date(timestamp));
  const generatedYmd = ymdFromParts(parts);
  const generatedHour = Number(parts.hour);

  if (generatedYmd > feedDate) return true;
  if (generatedYmd < feedDate) return false;
  return generatedHour >= FEED_GENERATION_HOUR;
}

function isFeedComplete(feedDoc) {
  return Boolean(feedDoc?.parkOfDay?.parkCode && feedDoc?.natureFact);
}

function shouldGenerateFeed({ feedDoc, feedDate = getFeedDateKey(), force = false, now = new Date() } = {}) {
  if (force) return true;
  if (!isFeedComplete(feedDoc)) return true;
  if (feedDoc.date !== feedDate) return true;
  if (!isPastFeedWindowStart(now)) return false;
  return !wasGeneratedAfterFeedWindow(feedDoc, feedDate);
}

function isScheduledGenerationMinute(now = new Date()) {
  const parts = getZonedParts(now);
  return Number(parts.hour) === FEED_GENERATION_HOUR && Number(parts.minute) === 0;
}

module.exports = {
  FEED_TIMEZONE,
  FEED_GENERATION_HOUR,
  getFeedDateKey,
  shiftFeedDate,
  isPastFeedWindowStart,
  wasGeneratedAfterFeedWindow,
  isFeedComplete,
  shouldGenerateFeed,
  isScheduledGenerationMinute,
};
