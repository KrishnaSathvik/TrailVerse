const cheerio = require('cheerio');
const { buildScheduleDateFields, formatMonthDayLabel } = require('./gtfsFeedService');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Official NPS pages when catalog systemUrl or GTFS is outdated */
const NPS_TRANSIT_PAGE_OVERRIDES = {
  glac: 'https://www.nps.gov/glac/planyourvisit/shuttle-service-2026.htm',
};

/** Ferries: hours come from the operator, not NPS GTFS */
const FERRY_OPERATOR_LINKS = {
  stli: {
    label: 'Statue City Cruises',
    url: 'https://www.statuecitycruises.com/',
  },
  alca: {
    label: 'Alcatraz City Cruises',
    url: 'https://www.alcatrazcruises.com/',
  },
};

const MONTH_INDEX = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function stripHtmlText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseMonthDayYear(monthName, day, year, fallbackYear) {
  const month = MONTH_INDEX[String(monthName || '').toLowerCase()];
  const d = Number(day);
  const y = Number(year) || fallbackYear;
  if (month == null || Number.isNaN(d) || Number.isNaN(y)) return null;
  return new Date(Date.UTC(y, month, d, 23, 59, 59, 999));
}

function normalizeSeasonText(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDateRangeFromText(text) {
  const fallbackYear = new Date().getUTCFullYear();
  const normalized = normalizeSeasonText(text);

  const serviceBegins = normalized.match(
    /(?:service\s+begins|begins)\s+([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/i
  );
  const throughEnd = normalized.match(
    /\b(?:through|to)\b[^.]*?([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/i
  );
  if (serviceBegins && throughEnd) {
    return {
      start: parseMonthDayYear(serviceBegins[1], serviceBegins[2], serviceBegins[3], fallbackYear),
      end: parseMonthDayYear(throughEnd[1], throughEnd[2], throughEnd[3], fallbackYear),
      label: `${serviceBegins[0].trim()} ${throughEnd[0].trim()}`,
    };
  }

  const longRange = normalized.match(
    /([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})[\s\S]{0,40}?(?:through|to)\s*(?:[A-Za-z]+\s*,?\s*)?([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/i
  );
  if (longRange) {
    return {
      start: parseMonthDayYear(longRange[1], longRange[2], longRange[3], fallbackYear),
      end: parseMonthDayYear(longRange[4], longRange[5], longRange[6], fallbackYear),
      label: longRange[0].trim(),
    };
  }

  const shortRange = normalized.match(
    /([A-Za-z]+)\s+(\d{1,2})\s*-\s*([A-Za-z]+)\s+(\d{1,2})(?:,?\s*(\d{4}))?/i
  );
  if (shortRange) {
    const year = shortRange[5] ? Number(shortRange[5]) : fallbackYear;
    return {
      start: parseMonthDayYear(shortRange[1], shortRange[2], year, fallbackYear),
      end: parseMonthDayYear(shortRange[3], shortRange[4], year, fallbackYear),
      label: shortRange[0].trim(),
    };
  }

  const beginning = normalized.match(/beginning\s+([A-Za-z]+)\s+(\d{1,2})/i);
  const throughOnly = normalized.match(/through\s+([A-Za-z]+)\s+(\d{1,2})/i);
  if (beginning && throughOnly) {
    const startYear = fallbackYear;
    let endYear = fallbackYear;
    const startMonth = MONTH_INDEX[String(beginning[1]).toLowerCase()];
    const endMonth = MONTH_INDEX[String(throughOnly[1]).toLowerCase()];
    if (startMonth != null && endMonth != null && endMonth < startMonth) endYear += 1;
    return {
      start: parseMonthDayYear(beginning[1], beginning[2], startYear, fallbackYear),
      end: parseMonthDayYear(throughOnly[1], throughOnly[2], endYear, fallbackYear),
      label: `${beginning[0].trim()} ${throughOnly[0].trim()}`,
    };
  }
  if (throughOnly) {
    return {
      start: null,
      end: parseMonthDayYear(throughOnly[1], throughOnly[2], fallbackYear, fallbackYear),
      label: throughOnly[0].trim(),
    };
  }

  return null;
}

function extractFrequencyLabel(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ');
  const everyRange = normalized.match(/every\s+(\d{1,3})\s*(?:to|-)\s*(\d{1,3})\s*minutes?/i);
  if (everyRange) {
    return `About every ${everyRange[1]}–${everyRange[2]} min`;
  }
  const everySingle = normalized.match(/(?:every|approximately every)\s+(\d{1,3})\s*minutes?/i);
  if (everySingle) {
    const minutes = Number(everySingle[1]);
    if (minutes >= 5 && minutes <= 120) return `About every ${minutes} min`;
  }
  const interval = normalized.match(/(\d{1,3})[\s-]+minute\s+intervals?/i);
  if (interval) {
    const minutes = Number(interval[1]);
    if (minutes >= 5 && minutes <= 120) return `About every ${minutes} min`;
  }
  return null;
}

function stripYearsFromScheduleLine(line) {
  return String(line || '')
    .replace(/,?\s*\d{4}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLineKey(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\d{4}/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isDuplicateLine(a, b) {
  const na = normalizeLineKey(a);
  const nb = normalizeLineKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length < nb.length ? na : nb;
  const longer = na.length < nb.length ? nb : na;
  return shorter.length >= 18 && longer.includes(shorter);
}

function isMarketingSnippet(line) {
  return /proceeds from|percent of the cost|entrance passes cover|that connects the park and neighboring/i.test(
    String(line || '')
  );
}

function isUsefulScheduleSnippet(line) {
  const text = String(line || '').trim();
  if (text.length < 12 || text.length > 160) return false;
  if (isMarketingSnippet(text)) return false;
  return true;
}

function dedupeScheduleSnippets(snippets) {
  const byKey = new Map();
  for (const raw of snippets) {
    if (!isUsefulScheduleSnippet(raw)) continue;
    const line = stripYearsFromScheduleLine(raw);
    const key = normalizeLineKey(line);
    const existing = byKey.get(key);
    if (!existing || line.length > existing.length) byKey.set(key, line);
  }
  return [...byKey.values()].slice(0, 3);
}

function pickPrimaryScheduleLine(snippets) {
  const deduped = dedupeScheduleSnippets(snippets);
  const priority = [/daily service/i, /7 days a week/i, /in operation/i, /service begins/i, /shuttle service begins/i];
  for (const pattern of priority) {
    const match = deduped.find((line) => pattern.test(line));
    if (match) return match;
  }
  return deduped[0] || null;
}

function filterSupplementalScheduleLines(snippets, primaryLine) {
  return dedupeScheduleSnippets(snippets).filter((line) => !isDuplicateLine(line, primaryLine));
}

function buildNpsScheduleCopy(snippets) {
  const primaryLine = pickPrimaryScheduleLine(snippets);
  return {
    detail: primaryLine,
    scheduleLines: filterSupplementalScheduleLines(snippets, primaryLine),
  };
}

function isOperatingDaysRedundant(operatingDaysLabel, detail, scheduleLines = []) {
  if (!operatingDaysLabel) return false;
  const corpus = [detail, ...(scheduleLines || [])].join(' ').toLowerCase();
  const label = String(operatingDaysLabel).toLowerCase();
  if (label === 'daily' && /daily|7 days a week|7 days\/week|every day/.test(corpus)) return true;
  if (corpus.includes(label)) return true;
  return false;
}

function pruneRedundantOperatingFields(operating) {
  if (!operating) return operating;
  const next = { ...operating };
  if (isOperatingDaysRedundant(next.operatingDaysLabel, next.detail, next.scheduleLines)) {
    next.operatingDaysLabel = null;
  }
  if (next.detail && Array.isArray(next.scheduleLines)) {
    next.scheduleLines = next.scheduleLines.filter((line) => !isDuplicateLine(line, next.detail));
  }
  return next;
}

function extractScheduleSnippets(text) {
  const snippets = [];
  const patterns = [
    /Daily Service:\s*[^.]+/gi,
    /Shuttle service begins\s*[^.]+/gi,
    /in operation[^.]+/gi,
    /7 days a week[^.]+/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const line = match[0].replace(/\s+/g, ' ').trim();
      if (line.length > 12) snippets.push(line);
    }
  }
  return dedupeScheduleSnippets(snippets);
}

function excerptSeasonText(bodyText) {
  const text = String(bodyText || '');
  if (!text) return '';
  const lower = text.toLowerCase();
  const markers = ['shuttle service begins', 'service begins', 'daily service:', 'in operation'];
  for (const marker of markers) {
    const idx = lower.indexOf(marker);
    if (idx < 0) continue;
    const endIdx = lower.indexOf('.', idx);
    const sliceEnd = endIdx > idx ? endIdx + 1 : idx + 360;
    return text.slice(Math.max(0, idx - 30), sliceEnd);
  }
  return text.slice(0, 1200);
}

function inferSeasonFromSnippets(snippets, bodyText = '', today = new Date()) {
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const sources = [...snippets];
  if (bodyText) sources.unshift(excerptSeasonText(bodyText));
  let bestNotStarted = null;

  for (const snippet of sources) {
    const range = extractDateRangeFromText(snippet);
    if (!range) continue;

    if (range.start && todayUtc < range.start.getTime()) {
      const candidate = {
        inSeason: false,
        notStarted: true,
        rangeLabel: range.label || snippet,
        seasonStart: range.start,
        seasonEnd: range.end,
      };
      if (!bestNotStarted || (range.end && !bestNotStarted.seasonEnd)) {
        bestNotStarted = candidate;
      }
      continue;
    }

    if (
      range.start &&
      range.end &&
      todayUtc > range.end.getTime() &&
      todayUtc >= range.start.getTime()
    ) {
      return { inSeason: false, rangeLabel: range.label || snippet };
    }

    if (range.start && range.end && todayUtc >= range.start.getTime() && todayUtc <= range.end.getTime()) {
      return { inSeason: true, rangeLabel: range.label || snippet };
    }

    if (!range.start && range.end && todayUtc <= range.end.getTime()) {
      return { inSeason: true, rangeLabel: range.label || snippet };
    }
  }

  if (bestNotStarted) return bestNotStarted;
  return { inSeason: null, rangeLabel: null };
}

function isOperationalScheduleDetail(detail) {
  return /7 days a week|daily service|in operation|through [a-z]+ \d{1,2}|service begins/i.test(
    String(detail || '')
  );
}

function buildPreSeasonDetail(season, agencyTimeZone) {
  const opens = formatMonthDayLabel(season?.seasonStart, agencyTimeZone);
  const ends = formatMonthDayLabel(season?.seasonEnd, agencyTimeZone);
  if (opens && ends) {
    return `Service begins ${opens} and continues through ${ends}.`;
  }
  if (opens) {
    return `Service begins ${opens}.`;
  }
  return null;
}

function buildOperatingFromNps({
  snippets,
  pageUrl,
  operatorLink,
  ferry,
  bodyText = '',
  agencyTimeZone = null,
}) {
  const season = inferSeasonFromSnippets(snippets, bodyText);
  const scheduleCopy = buildNpsScheduleCopy(snippets);
  const frequencyLabel =
    extractFrequencyLabel(bodyText) ||
    snippets.map((line) => extractFrequencyLabel(line)).find(Boolean) ||
    null;
  const todaySchedule = buildScheduleDateFields(agencyTimeZone);

  if (ferry && operatorLink) {
    return {
      source: 'nps',
      pageUrl,
      scheduleLines: scheduleCopy.scheduleLines,
      frequencyLabel,
      scheduleDateYmd: todaySchedule.scheduleDateYmd,
      scheduleDateLabel: todaySchedule.scheduleDateLabel,
      operatorLink,
      headline: 'Ferries operating',
      detail: 'Ferry times are set by the authorized operator, not NPS GTFS. Check the operator site for today’s departures.',
      serviceStatus: 'scheduled_check_nps',
      seasonStatus: 'unknown',
    };
  }

  if (season.inSeason === true) {
    return pruneRedundantOperatingFields({
      source: 'nps',
      pageUrl,
      scheduleLines: scheduleCopy.scheduleLines,
      frequencyLabel,
      operatingDaysLabel: null,
      scheduleDateYmd: todaySchedule.scheduleDateYmd,
      scheduleDateLabel: todaySchedule.scheduleDateLabel,
      headline: 'In season (per NPS)',
      detail: scheduleCopy.detail || 'NPS lists this transit system as operating for the current season.',
      serviceStatus: 'scheduled_check_nps',
      seasonStatus: 'in_season',
    });
  }

  if (season.notStarted) {
    let seasonStart = season.seasonStart;
    let seasonEnd = season.seasonEnd;
    if ((!seasonStart || !seasonEnd) && bodyText) {
      const range = extractDateRangeFromText(excerptSeasonText(bodyText));
      seasonStart = seasonStart || range?.start;
      seasonEnd = seasonEnd || range?.end;
    }
    const preSeason = { ...season, seasonStart, seasonEnd };
    const detail = buildPreSeasonDetail(preSeason, agencyTimeZone);
    return {
      source: 'nps',
      pageUrl,
      scheduleLines: [],
      frequencyLabel: null,
      scheduleDateYmd: null,
      scheduleDateLabel: null,
      seasonOpensLabel: null,
      headline: 'Season not started',
      detail: detail || 'See the official NPS transit page for opening dates.',
      serviceStatus: 'season_not_started',
      seasonStatus: 'not_started',
    };
  }

  if (season.inSeason === false) {
    return {
      source: 'nps',
      pageUrl,
      scheduleLines: [],
      frequencyLabel: null,
      scheduleDateYmd: null,
      scheduleDateLabel: null,
      headline: 'Off season (per NPS)',
      detail: scheduleCopy.detail || 'NPS indicates this transit is not in its operating season.',
      serviceStatus: 'season_ended',
      seasonStatus: 'ended',
    };
  }

  const operational = isOperationalScheduleDetail(scheduleCopy.detail);
  return pruneRedundantOperatingFields({
    source: 'nps',
    pageUrl,
    scheduleLines: scheduleCopy.scheduleLines,
    frequencyLabel,
    operatingDaysLabel: null,
    scheduleDateYmd: todaySchedule.scheduleDateYmd,
    scheduleDateLabel: todaySchedule.scheduleDateLabel,
    headline: operational ? 'In season (per NPS)' : 'Check NPS for hours',
    detail: scheduleCopy.detail || 'Schedule details are on the official NPS transit page.',
    serviceStatus: 'scheduled_check_nps',
    seasonStatus: operational ? 'in_season' : 'unknown',
  });
}

class NpsTransitPageService {
  constructor() {
    this._cache = new Map();
  }

  resolvePageUrl(parkCode, systemUrl) {
    return NPS_TRANSIT_PAGE_OVERRIDES[parkCode] || systemUrl || null;
  }

  shouldPreferNpsOverGtfs(operating) {
    if (!operating) return false;
    // Trust live GTFS when it has today's schedule or a clear day-off signal.
    if (operating.serviceStatus === 'running_today') return false;
    if (operating.serviceStatus === 'not_running_today') return false;
    // Stale catalog file, but GTFS still has usable trip times for today.
    if (operating.serviceStatus === 'scheduled_check_nps' && operating.todayWindow) return false;
    return true;
  }

  async getTransitSummary({ parkCode, systemUrl, preferNps = false, agencyTimeZone = null }) {
    const normalized = String(parkCode || '').toLowerCase();
    const operatorLink = FERRY_OPERATOR_LINKS[normalized] || null;
    const pageUrl = this.resolvePageUrl(normalized, systemUrl);

    if (!preferNps && !operatorLink) return null;
    if (!pageUrl && !operatorLink) return null;

    if (operatorLink && !pageUrl) {
      return buildOperatingFromNps({
        snippets: [],
        pageUrl: null,
        operatorLink,
        ferry: true,
        agencyTimeZone,
      });
    }

    const cacheKey = `${pageUrl}#v6`;
    const cached = this._cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return { ...cached.value, cached: true };
    }

    try {
      const response = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'TrailVerse/1.0 (+https://www.nationalparksexplorerusa.com)',
          Accept: 'text/html',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`NPS page HTTP ${response.status}`);

      const html = await response.text();
      const $ = cheerio.load(html);
      const bodyText = stripHtmlText($('#main').html() || $.root().html() || html);
      const snippets = extractScheduleSnippets(bodyText);
      const value = buildOperatingFromNps({
        snippets,
        pageUrl,
        operatorLink,
        ferry: Boolean(operatorLink && normalized === 'stli'),
        bodyText,
        agencyTimeZone,
      });

      this._cache.set(cacheKey, { ts: Date.now(), value });
      return { ...value, cached: false };
    } catch (error) {
      if (operatorLink) {
        return buildOperatingFromNps({
          snippets: [],
          pageUrl,
          operatorLink,
          ferry: true,
          agencyTimeZone,
        });
      }
      return null;
    }
  }
}

module.exports = new NpsTransitPageService();
module.exports.FERRY_OPERATOR_LINKS = FERRY_OPERATOR_LINKS;
module.exports.pruneRedundantOperatingFields = pruneRedundantOperatingFields;
