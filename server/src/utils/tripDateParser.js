'use strict';

const MONTHS = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toIsoDate(year, monthIndex, day) {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function inferYearForMonth(monthIndex, referenceDate) {
  const ref = referenceDate || new Date();
  const refMonth = ref.getMonth();
  const refYear = ref.getFullYear();
  if (monthIndex < refMonth) return refYear + 1;
  return refYear;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function parseExplicitYear(text) {
  const m = text.match(/\b(20\d{2})\b/);
  return m ? parseInt(m[1], 10) : null;
}

function monthFromToken(token) {
  if (!token) return null;
  return MONTHS[String(token).toLowerCase()] ?? null;
}

/**
 * Parse natural-language trip windows from a user message.
 * @param {string} userMessage
 * @param {Date} [referenceDate=new Date()]
 * @returns {{ startDate: string, endDate: string, numDays: number, label: string }|null}
 */
function parseTripDatesFromMessage(userMessage, referenceDate = new Date()) {
  if (!userMessage || !userMessage.trim()) return null;
  const msg = userMessage.toLowerCase();
  const explicitYear = parseExplicitYear(msg);
  let match;

  // best week in July 2026 (astro — week centered near typical new-moon window)
  match = msg.match(
    /\bbest week in\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(20\d{2})\b/i
  );
  if (match) {
    const monthIndex = monthFromToken(match[1]);
    const year = parseInt(match[2], 10);
    if (monthIndex != null) {
      return {
        startDate: toIsoDate(year, monthIndex, 10),
        endDate: toIsoDate(year, monthIndex, 16),
        numDays: 7,
        label: `Best astro week in ${match[1]} ${year} (near new moon)`,
      };
    }
  }

  // in July 2026 / during July 2026 (explicit year)
  match = msg.match(
    /\b(?:in|during|for)\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(20\d{2})\b/i
  );
  if (match) {
    const monthIndex = monthFromToken(match[1]);
    const year = parseInt(match[2], 10);
    if (monthIndex != null) {
      const lastDay = daysInMonth(year, monthIndex);
      return {
        startDate: toIsoDate(year, monthIndex, 1),
        endDate: toIsoDate(year, monthIndex, lastDay),
        numDays: lastDay,
        label: `${match[1]} ${year}`,
      };
    }
  }

  // first week of July / July first week / july 1st week
  match =
    msg.match(/\b(?:the\s+)?(first|1st)\s+week\s+of\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i) ||
    msg.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(?:the\s+)?(first|1st)\s+week\b/i);

  if (match) {
    const monthToken = /\bweek\s+of\b/i.test(match[0]) ? match[2] : match[1];
    const monthIndex = monthFromToken(monthToken);
    if (monthIndex == null) return null;
    const year = explicitYear ?? inferYearForMonth(monthIndex, referenceDate);
    const startDate = toIsoDate(year, monthIndex, 1);
    const endDate = toIsoDate(year, monthIndex, 7);
    return {
      startDate,
      endDate,
      numDays: 7,
      label: `First week of ${monthToken.charAt(0).toUpperCase()}${monthToken.slice(1)} ${year}`,
    };
  }

  // last week of July
  match = msg.match(
    /\b(?:the\s+)?last\s+week\s+of\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i
  );
  if (match) {
    const monthIndex = monthFromToken(match[1]);
    if (monthIndex == null) return null;
    const year = explicitYear ?? inferYearForMonth(monthIndex, referenceDate);
    const lastDay = daysInMonth(year, monthIndex);
    const startDay = Math.max(1, lastDay - 6);
    return {
      startDate: toIsoDate(year, monthIndex, startDay),
      endDate: toIsoDate(year, monthIndex, lastDay),
      numDays: lastDay - startDay + 1,
      label: `Last week of ${match[1].charAt(0).toUpperCase()}${match[1].slice(1)} ${year}`,
    };
  }

  // mid-July / mid July 2026
  match = msg.match(
    /\bmid[-\s]?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i
  );
  if (match) {
    const monthIndex = monthFromToken(match[1]);
    if (monthIndex == null) return null;
    const year = explicitYear ?? inferYearForMonth(monthIndex, referenceDate);
    return {
      startDate: toIsoDate(year, monthIndex, 10),
      endDate: toIsoDate(year, monthIndex, 20),
      numDays: 11,
      label: `Mid-${match[1].charAt(0).toUpperCase()}${match[1].slice(1)} ${year}`,
    };
  }

  // July 1-7 / July 1 to 7 / July 1–7, 2026
  match = msg.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\s*(?:-|–|to|through)\s*(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?\b/i
  );
  if (match) {
    const monthIndex = monthFromToken(match[1]);
    if (monthIndex == null) return null;
    const year = match[4] ? parseInt(match[4], 10) : explicitYear ?? inferYearForMonth(monthIndex, referenceDate);
    const startDay = parseInt(match[2], 10);
    const endDay = parseInt(match[3], 10);
    if (startDay > endDay) return null;
    return {
      startDate: toIsoDate(year, monthIndex, startDay),
      endDate: toIsoDate(year, monthIndex, endDay),
      numDays: endDay - startDay + 1,
      label: `${match[1]} ${startDay}–${endDay}, ${year}`,
    };
  }

  // next weekend
  if (/\bnext\s+weekend\b/i.test(msg)) {
    const ref = new Date(referenceDate);
    const day = ref.getDay();
    const daysUntilSaturday = (6 - day + 7) % 7 || 7;
    const start = new Date(ref);
    start.setDate(ref.getDate() + daysUntilSaturday);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      numDays: 2,
      label: 'Next weekend',
    };
  }

  // in July / during July (whole month shorthand → first two weeks for astro relevance)
  match = msg.match(
    /\b(?:in|during|for)\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i
  );
  if (match && !/\bweek\b/i.test(msg)) {
    const monthIndex = monthFromToken(match[1]);
    if (monthIndex == null) return null;
    const year = explicitYear ?? inferYearForMonth(monthIndex, referenceDate);
    const lastDay = daysInMonth(year, monthIndex);
    return {
      startDate: toIsoDate(year, monthIndex, 1),
      endDate: toIsoDate(year, monthIndex, lastDay),
      numDays: lastDay,
      label: `${match[1].charAt(0).toUpperCase()}${match[1].slice(1)} ${year}`,
    };
  }

  return null;
}

/**
 * Resolve astro window from structured trip dates or message parsing.
 * @param {{ startDate?: string, endDate?: string }|null} tripDates
 * @param {string} userMessage
 * @param {Date} [referenceDate]
 */
function resolveAstroWindow(tripDates, userMessage, referenceDate = new Date()) {
  if (tripDates?.startDate) {
    const startDate = tripDates.startDate;
    const endDate = tripDates.endDate || tripDates.startDate;
    const start = new Date(`${startDate}T12:00:00`);
    const end = new Date(`${endDate}T12:00:00`);
    const numDays = Math.max(1, Math.round((end - start) / (86400000)) + 1);
    return {
      startDate,
      endDate,
      numDays,
      label: startDate === endDate ? startDate : `${startDate} to ${endDate}`,
    };
  }
  return parseTripDatesFromMessage(userMessage, referenceDate);
}

module.exports = {
  parseTripDatesFromMessage,
  resolveAstroWindow,
  inferYearForMonth,
  MONTHS,
};
