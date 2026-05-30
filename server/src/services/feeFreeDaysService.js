/**
 * NPS Fee-Free Entrance Days Service
 *
 * Year-keyed list of fee-free entrance days. Update annually when NPS publishes
 * the next year's schedule (typically January).
 *
 * Source: https://www.nps.gov/planyourvisit/fee-free-parks.htm
 */

const FEE_FREE_DAYS_2026 = [
  { date: '2026-02-16', label: "Presidents' Day" },
  { date: '2026-05-25', label: 'Memorial Day' },
  { date: '2026-06-14', label: "Flag Day" },
  { date: '2026-07-03', label: 'Independence Day weekend' },
  { date: '2026-07-04', label: 'Independence Day weekend' },
  { date: '2026-07-05', label: 'Independence Day weekend' },
  { date: '2026-08-25', label: 'NPS Birthday (110th)' },
  { date: '2026-09-17', label: 'Constitution Day' },
  { date: '2026-10-27', label: "Theodore Roosevelt's Birthday" },
  { date: '2026-11-11', label: 'Veterans Day' },
];

// Projected 2027 schedule — verify against nps.gov when published (review by Jan 2027)
const FEE_FREE_DAYS_2027 = [
  { date: '2027-02-15', label: "Presidents' Day" },
  { date: '2027-05-31', label: 'Memorial Day' },
  { date: '2027-06-14', label: 'Flag Day' },
  { date: '2027-07-03', label: 'Independence Day weekend' },
  { date: '2027-07-04', label: 'Independence Day weekend' },
  { date: '2027-07-05', label: 'Independence Day weekend' },
  { date: '2027-08-25', label: 'NPS Birthday' },
  { date: '2027-09-17', label: 'Constitution Day' },
  { date: '2027-10-27', label: "Theodore Roosevelt's Birthday" },
  { date: '2027-11-11', label: 'Veterans Day' },
];

const FEE_FREE_DAYS_BY_YEAR = {
  2026: FEE_FREE_DAYS_2026,
  2027: FEE_FREE_DAYS_2027,
};

/**
 * Fee-free days for the calendar year of `referenceDate` (defaults to now).
 * Falls back to the most recent configured year if the current year is missing.
 */
function getActiveFeeFreeDays(referenceDate = new Date()) {
  const year = referenceDate.getFullYear();
  if (FEE_FREE_DAYS_BY_YEAR[year]) {
    return FEE_FREE_DAYS_BY_YEAR[year];
  }

  const configuredYears = Object.keys(FEE_FREE_DAYS_BY_YEAR)
    .map(Number)
    .sort((a, b) => b - a);
  const fallbackYear = configuredYears[0];
  if (fallbackYear) {
    console.warn(
      `⚠️ No fee-free days configured for ${year} — using ${fallbackYear} calendar (update feeFreeDaysService.js)`
    );
    return FEE_FREE_DAYS_BY_YEAR[fallbackYear];
  }

  return FEE_FREE_DAYS_2026;
}

// Staleness safety net: warn if all dates for the active calendar are in the past
const activeCalendar = getActiveFeeFreeDays();
const allInPast = activeCalendar.every((d) => new Date(d.date + 'T23:59:59') < new Date());
if (allInPast) {
  console.warn(
    '⚠️ All fee-free days for the active calendar are in the past — add the next year in feeFreeDaysService.js'
  );
}

// Month name → number mapping for date extraction
const MONTH_MAP = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Holiday → approximate date ranges for fuzzy matching
const HOLIDAY_DATE_RANGES = [
  { pattern: /president.?s?.day/i, months: [2], days: [14, 22] },
  { pattern: /memorial\s*day/i, months: [5], days: [24, 31] },
  { pattern: /flag\s*day/i, months: [6], days: [13, 15] },
  { pattern: /independence\s*day|july\s*4|4th\s*of\s*july|fourth\s*of\s*july/i, months: [7], days: [1, 7] },
  { pattern: /nps\s*birthday|national\s*park\s*service\s*birthday/i, months: [8], days: [24, 26] },
  { pattern: /constitution\s*day/i, months: [9], days: [16, 18] },
  { pattern: /theodore\s*roosevelt/i, months: [10], days: [26, 28] },
  { pattern: /veterans?\s*day/i, months: [11], days: [10, 12] },
];

/**
 * Extract month references from user message
 * Returns array of { month, dayStart?, dayEnd? }
 */
function extractDateReferences(message) {
  const msg = message.toLowerCase();
  const refs = [];

  // Check holiday names first — these map to specific month/day ranges
  for (const holiday of HOLIDAY_DATE_RANGES) {
    if (holiday.pattern.test(msg)) {
      refs.push({ month: holiday.months[0], dayStart: holiday.days[0], dayEnd: holiday.days[1] });
    }
  }

  // "Month Day" or "Month Day-Day" patterns (e.g., "June 14", "July 3-5")
  const monthDayPattern = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\b/gi;
  let match;
  while ((match = monthDayPattern.exec(msg)) !== null) {
    const month = MONTH_MAP[match[1].toLowerCase()];
    if (month) {
      refs.push({
        month,
        dayStart: parseInt(match[2]),
        dayEnd: match[3] ? parseInt(match[3]) : parseInt(match[2]),
      });
    }
  }

  // Bare month names (e.g., "in August", "during November")
  const bareMonthPattern = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi;
  while ((match = bareMonthPattern.exec(msg)) !== null) {
    const month = MONTH_MAP[match[1].toLowerCase()];
    if (month && !refs.some(r => r.month === month)) {
      refs.push({ month, dayStart: 1, dayEnd: 31 });
    }
  }

  return refs;
}

/**
 * Check if a fee-free day falls within a date reference range
 */
function dateOverlaps(feeDay, dateRef) {
  const d = new Date(feeDay.date + 'T12:00:00');
  const feeMonth = d.getMonth() + 1;
  const feeDate = d.getDate();

  if (feeMonth !== dateRef.month) return false;
  if (dateRef.dayStart && dateRef.dayEnd) {
    return feeDate >= dateRef.dayStart && feeDate <= dateRef.dayEnd;
  }
  return true; // whole month match
}

/**
 * Get fee-free day info relevant to the user's message
 * @param {string} userMessage - The user's message
 * @returns {{ hasOverlap: boolean, days: Array } | null}
 */
function getFeeFreeInfo(userMessage) {
  if (!userMessage) return null;

  const feeFreeDays = getActiveFeeFreeDays();
  const msg = userMessage.toLowerCase();
  const dateRefs = extractDateReferences(userMessage);

  // Check for explicit fee/free keywords
  const feeKeywords = /\b(fee.?free|free\s*entrance|entrance\s*fee|no\s*fee|free\s*admission|free\s*entry|free\s*parks?)\b/i;
  const askingAboutFreeParks = /\bwhich\b.*\bparks?\b.*\bare\s*free\b/i;
  const askingAboutFees = feeKeywords.test(msg) || askingAboutFreeParks.test(msg);

  // If asking about fees generally, return all upcoming fee-free days
  if (askingAboutFees) {
    const now = new Date();
    const upcoming = feeFreeDays.filter(d => new Date(d.date + 'T23:59:59') >= now);
    if (upcoming.length > 0) {
      return { hasOverlap: true, days: upcoming };
    }
    // Even if all are past, return them so the model can say "no more this year"
    return { hasOverlap: false, days: feeFreeDays };
  }

  // If we extracted date references, check for overlap with fee-free days
  if (dateRefs.length > 0) {
    const overlapping = feeFreeDays.filter(feeDay =>
      dateRefs.some(ref => dateOverlaps(feeDay, ref))
    );
    if (overlapping.length > 0) {
      return { hasOverlap: true, days: overlapping };
    }
  }

  return null;
}

/**
 * Format fee-free info as a prompt block for injection into the system prompt
 * @param {{ hasOverlap: boolean, days: Array }} feeFreeInfo
 * @returns {string}
 */
function formatFeeFreeBlock(feeFreeInfo) {
  if (!feeFreeInfo || feeFreeInfo.days.length === 0) return '';

  const policyYear = new Date(feeFreeInfo.days[0].date + 'T12:00:00').getFullYear();

  const dayLines = feeFreeInfo.days.map(d => {
    const date = new Date(d.date + 'T12:00:00');
    const formatted = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    return `- ${formatted} (${d.label}) — no entrance fee at any NPS site`;
  }).join('\n');

  let block = `\n--- FEE-FREE ENTRANCE DAYS ---\n`;
  if (feeFreeInfo.hasOverlap) {
    block += `The user's trip overlaps these NPS fee-free entrance days:\n`;
  } else {
    block += `NPS fee-free entrance days for reference:\n`;
  }
  block += dayLines;
  block += `\nCRITICAL: Your response MUST include a sentence about the fee-free day(s) in the first paragraph. Example: "Heads up — July 3-5 are fee-free entrance days, so you won't pay an entrance fee at any NPS site that weekend." This is required. Do not skip it.`;
  block += `\nFee-free days apply at all NPS sites that normally charge entrance fees (~100 of 400+ sites).`;
  block += `\nEligibility (${policyYear} policy — verify at nps.gov if user asks about international travel):`;
  block += `\n- US citizens and permanent residents: free entry on fee-free days`;
  block += `\n- Non-US residents: must pay the regular entrance fee, plus a nonresident fee at high-visitation parks`;
  block += `\nIf the user mentions traveling from outside the US, mentions a non-US city of origin, or asks about visa/passport considerations, surface the eligibility caveat prominently.`;
  block += `\nNote: Fee-free days waive entrance fees only. Camping, permits, timed entry reservations, tours, and concessions are NOT waived.`;
  block += `\n--- END FEE-FREE DAYS ---\n`;

  return block;
}

module.exports = {
  getFeeFreeInfo,
  formatFeeFreeBlock,
  getActiveFeeFreeDays,
  FEE_FREE_DAYS_2026,
  FEE_FREE_DAYS_2027,
  FEE_FREE_DAYS_BY_YEAR,
};
