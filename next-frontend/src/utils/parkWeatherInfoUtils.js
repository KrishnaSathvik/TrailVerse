import { plainDescription } from './parkVisitInfoUtils';

export const SEASON_ORDER = ['spring', 'summer', 'fall', 'winter'];

const SEASON_LABELS = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  autumn: 'Fall',
  winter: 'Winter',
};

const SEASON_HEADING = /^(?:In the |During )?(Winter|Winters|Spring|Summer|Summers|Fall|Falls|Autumn)\b/i;
const SEASON_TOKEN = /\b(Winter|Winters|Spring|Summer|Summers|Fall|Falls|Autumn)\b/gi;

/** Avoid matching "fall" as Fall season in "temperatures can fall below…". */
function isSeasonTokenAt(text, index, word) {
  const key = normalizeSeasonKey(word);
  const before = text.slice(Math.max(0, index - 32), index);

  if (key === 'fall' && /\b(?:can|will|may|to|also|often|that)\s+$/i.test(before)) {
    return false;
  }

  const isCapitalized =
    text[index] === text[index].toUpperCase() &&
    text[index] !== text[index].toLowerCase();

  if (isCapitalized) return true;

  // Lowercase season words only when clearly a season label (e.g. "In the winter,")
  if (/\b(?:In|During) the $/i.test(before)) return true;
  const after = text.slice(index + word.length, index + word.length + 24);
  if (/^\s*,?\s*temperatures/i.test(after)) return true;
  if (/^\s*\(/i.test(after)) return true;

  return false;
}

/** Include "In the winter" prefix in the season span, not only the season word. */
function adjustSeasonSpanStart(text, start) {
  const window = text.slice(Math.max(0, start - 10), start);
  const inThe = window.match(/\bIn the $/i);
  if (inThe) return start - inThe[0].length;
  const during = window.match(/\bDuring $/i);
  if (during) return start - during[0].length;
  return start;
}

/**
 * Strip NPS boilerplate external forecast links (weather.com, "Today's Weather:", etc.).
 */
export function sanitizeParkWeatherInfo(weatherInfo) {
  if (!weatherInfo || typeof weatherInfo !== 'string') return '';

  let text = weatherInfo
    .replace(/<a[^>]*>[\s\S]*?<\/a>/gi, ' ')
    .replace(/<[^>]+>/gi, ' ');

  text = plainDescription(text);

  text = text.replace(/Today['']?s\s+Weather\s*:?\s*/gi, '');
  text = text.replace(/(?:Current|Local)\s+Weather\s*:?\s*/gi, '');
  text = text.replace(/https?:\/\/\S+/gi, '');
  text = text.replace(/(?:www\.)?weather\.com\/\S*/gi, '');
  text = text.replace(
    /\b(?:check|see|visit|view)\s+(?:today['']?s\s+)?(?:weather|forecast|conditions)\s+(?:at|on)\s+[^.]+?\./gi,
    ''
  );

  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;])/g, '$1')
    .replace(/:\s*([,.;]|$)/g, '$1')
    .trim();
}

function normalizeSeasonKey(word) {
  const lower = word.toLowerCase();
  if (lower === 'autumn' || lower === 'falls') return 'fall';
  if (lower === 'winters') return 'winter';
  if (lower === 'summers') return 'summer';
  return lower;
}

function formatFahrenheit(low, high) {
  const lo = Math.round(low);
  const hi = Math.round(high);
  return `${lo}°F – ${hi}°F`;
}

function formatCelsius(low, high) {
  const lo = Math.round(low);
  const hi = Math.round(high);
  return `${lo}°C – ${hi}°C`;
}

function sentenceHasTemperatures(text) {
  return /(?:\d+\s*(?:-|–|to)\s*\d+|\d+\s+and\s+\d+|\bexceed(?:s)?\s+\d+|averag(?:e|ing)\s+\d+|high\s+is\s+\d+|low\s+of\s+\d+|high\s+\d+|as\s+low\s+as\s+-?\d+)/i.test(
    text
  );
}

function parseCelsiusParen(segment) {
  const paren = segment.match(/\(([^)]+)\)/);
  if (!paren?.[1]) return null;
  const inner = paren[1];
  const cBetween = inner.match(/(-?\d+(?:\.\d+)?)\s+(?:and|to)\s+(-?\d+(?:\.\d+)?)\s*C/i);
  const cDash = inner.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)\s*C/i);
  const cMatch = cBetween || cDash;
  if (!cMatch) return null;
  const low = parseFloat(cMatch[1]);
  const high = parseFloat(cMatch[2]);
  if (Number.isNaN(low) || Number.isNaN(high)) return null;
  return formatCelsius(Math.min(low, high), Math.max(low, high));
}

/** Extract °F and optional °C ranges from a single NPS season segment. */
export function parseSeasonTemperatures(segment) {
  const exceed = segment.match(/exceed(?:s)?\s+(\d+)\s*(?:degrees?\s*)?F/i);
  if (exceed) {
    return { rangeF: `${exceed[1]}°F+`, rangeC: parseCelsiusParen(segment), lowRangeF: null };
  }

  const avgHighLow = segment.match(
    /average\s+high\s+is\s+(-?\d+(?:\.\d+)?)\s*degrees?\s+with\s+a\s+low\s+of\s+(-?\d+(?:\.\d+)?)\s*degrees?\s*F/i
  );
  if (avgHighLow) {
    const low = parseFloat(avgHighLow[1]);
    const high = parseFloat(avgHighLow[2]);
    if (!Number.isNaN(low) && !Number.isNaN(high)) {
      return {
        rangeF: formatFahrenheit(Math.min(low, high), Math.max(low, high)),
        rangeC: parseCelsiusParen(segment),
        lowRangeF: null,
      };
    }
  }

  const highs = segment.match(/highs?\s+averag(?:e|ing)\s+(-?\d+)\s+to\s+(-?\d+)/i);
  const lows = segment.match(/lows?\s+averag(?:e|ing)\s+(-?\d+)\s+to\s+(-?\d+)/i);
  if (highs) {
    const lowH = parseInt(highs[1], 10);
    const highH = parseInt(highs[2], 10);
    let lowRangeF = null;
    if (lows) {
      const lowL = parseInt(lows[1], 10);
      const highL = parseInt(lows[2], 10);
      if (!Number.isNaN(lowL) && !Number.isNaN(highL)) {
        lowRangeF = formatFahrenheit(Math.min(lowL, highL), Math.max(lowL, highL));
      }
    }
    if (!Number.isNaN(lowH) && !Number.isNaN(highH)) {
      return {
        rangeF: formatFahrenheit(Math.min(lowH, highH), Math.max(lowH, highH)),
        rangeC: parseCelsiusParen(segment),
        lowRangeF,
      };
    }
  }

  const highTo = segment.match(/high\s+(\d+)(?:'s|s)?\s+to\s+(\d+)/i);
  if (highTo) {
    return {
      rangeF: formatFahrenheit(parseInt(highTo[1], 10), parseInt(highTo[2], 10)),
      rangeC: parseCelsiusParen(segment),
      lowRangeF: null,
    };
  }

  const asLow = segment.match(/(?:as\s+)?low(?:s)?\s+(?:as\s+)?(-?\d+)\s*(?:degrees?\s*)?F/i);
  const asHigh = segment.match(/(?:as\s+)?high(?:s)?\s+(?:as\s+)?(-?\d+)\s*(?:degrees?\s*)?F/i);
  if (asLow && !asHigh) {
    return { rangeF: `Down to ${asLow[1]}°F`, rangeC: parseCelsiusParen(segment), lowRangeF: null };
  }
  if (asHigh && asLow) {
    return {
      rangeF: formatFahrenheit(parseInt(asLow[1], 10), parseInt(asHigh[1], 10)),
      rangeC: parseCelsiusParen(segment),
      lowRangeF: null,
    };
  }

  const fBetween = segment.match(
    /(?:between|from)\s+(-?\d+)\s+(?:and|to)\s+(-?\d+)\s*(?:degrees?\s*)?F/i
  );
  const fDash =
    segment.match(/(-?\d+)\s*(?:-|–|to)\s*(-?\d+)\s*(?:degrees?\s*)?F/i) ||
    segment.match(/(-?\d+)\s*-\s*(-?\d+)\s*F/i);
  const fMatch = fBetween || fDash;

  let rangeF = null;
  if (fMatch) {
    const low = parseInt(fMatch[1], 10);
    const high = parseInt(fMatch[2], 10);
    if (!Number.isNaN(low) && !Number.isNaN(high)) {
      rangeF = formatFahrenheit(Math.min(low, high), Math.max(low, high));
    }
  }

  return { rangeF, rangeC: parseCelsiusParen(segment), lowRangeF: null };
}

function buildQualitativeSummary(segment) {
  const stripped = segment
    .replace(SEASON_HEADING, '')
    .replace(/^\([^)]+\)\s*/, '')
    .replace(/^Temp:\s*/i, '')
    .replace(/^[,:;\s-]+/, '')
    .trim();

  if (stripped.length < 12) return null;
  const sentence = stripped.split(/(?<=[.!?])\s+/)[0]?.trim() || stripped;
  if (sentence.length > 140) {
    return `${sentence.slice(0, 137).trim()}…`;
  }
  return sentence;
}

/** Human-readable one-line summary for UI rows. */
export function formatSeasonWeatherSummary(season) {
  if (!season) return '';

  if (season.summary && !season.rangeF && !season.rangeC && !season.lowRangeF) {
    return season.summary;
  }

  if (season.rangeF?.endsWith('+')) {
    const temp = season.rangeF.replace('°F+', '°F');
    return `Often above ${temp}`;
  }

  if (season.rangeF?.startsWith('Down to ')) {
    return season.rangeF;
  }

  const parts = [];
  if (season.rangeF) {
    parts.push(season.lowRangeF ? `Highs ${season.rangeF}` : season.rangeF);
  }
  if (season.lowRangeF) parts.push(`Lows ${season.lowRangeF}`);
  if (season.rangeC) parts.push(season.rangeC);
  if (parts.length > 0) return parts.join(' · ');

  return season.summary || '';
}

function parseSeasonSegment(segment) {
  const head = segment.match(SEASON_HEADING);
  if (!head) return null;

  const key = normalizeSeasonKey(head[1]);
  const { rangeF, rangeC, lowRangeF } = parseSeasonTemperatures(segment);
  const qualitative = !rangeF && !rangeC ? buildQualitativeSummary(segment) : null;

  if (!rangeF && !rangeC && !qualitative) return null;

  const season = {
    key,
    label: SEASON_LABELS[key] || head[1],
    rangeF,
    rangeC,
    lowRangeF,
    summary: qualitative,
  };

  return { ...season, summary: formatSeasonWeatherSummary(season) };
}

/** Keep only the first sentence of a season-led span (avoids swallowing footer copy). */
function clipSeasonSpan(text, start, rawEnd) {
  const raw = text.slice(start, rawEnd);

  const tempClose = raw.match(/^[\s\S]*?(?:degrees?\s*)?F\s*\.(?=\s|$)/i);
  if (tempClose) {
    return { segment: tempClose[0].trim(), end: start + tempClose[0].length };
  }

  // Period ends a sentence only when not a decimal (e.g. skip "65.5")
  // Period ends a sentence only when not a decimal (e.g. skip "65.5")
  const firstSentence = raw.match(/^[\s\S]*?\.(?!\d)(?=\s|$)/);
  if (firstSentence) {
    return { segment: firstSentence[0].trim(), end: start + firstSentence[0].length };
  }

  return { segment: raw.trim(), end: rawEnd };
}

/** Split copy into season-led segments (handles paragraphs without periods). */
export function extractSeasonSegments(text) {
  const markers = [...text.matchAll(SEASON_TOKEN)].filter((match) =>
    isSeasonTokenAt(text, match.index, match[1])
  );
  if (markers.length === 0) return [];

  const raw = [];
  for (let i = 0; i < markers.length; i += 1) {
    const start = adjustSeasonSpanStart(text, markers[i].index);
    const rawEnd = i + 1 < markers.length ? adjustSeasonSpanStart(text, markers[i + 1].index) : text.length;
    const { segment, end } = clipSeasonSpan(text, start, rawEnd);
    const key = normalizeSeasonKey(markers[i][1]);

    if (!sentenceHasTemperatures(segment) && !buildQualitativeSummary(segment)) continue;

    raw.push({ segment, start, end, key });
  }

  const byKey = new Map();
  for (const entry of raw) {
    const season = parseSeasonSegment(entry.segment);
    if (!season) continue;

    const existing = byKey.get(entry.key);
    const score = (season.rangeF ? 2 : 0) + (season.rangeC ? 1 : 0) + (season.summary ? 1 : 0);
    const existingScore = existing
      ? (existing.season.rangeF ? 2 : 0) +
        (existing.season.rangeC ? 1 : 0) +
        (existing.season.summary ? 1 : 0)
      : -1;

    if (!existing || score > existingScore) {
      byKey.set(entry.key, { ...entry, season });
    }
  }

  return [...byKey.values()];
}

/** @deprecated Use extractSeasonSegments — kept for tests */
export function splitSeasonSentences(text) {
  return extractSeasonSegments(text).map((e) => e.segment);
}

function removeRanges(text, ranges) {
  const sorted = [...ranges].sort((a, b) => b.start - a.start);
  let result = text;
  for (const { start, end } of sorted) {
    result = `${result.slice(0, start)}${result.slice(end)}`;
  }
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Split NPS weatherInfo into intro, seasonal rows, and trailing notes.
 */
export function parseParkWeatherInfo(weatherInfo) {
  const text = sanitizeParkWeatherInfo(weatherInfo);
  if (!text) {
    return { intro: '', seasons: [], footer: '', useStructured: false };
  }

  const segmentEntries = extractSeasonSegments(text);

  if (segmentEntries.length < 1) {
    return { intro: text, seasons: [], footer: '', useStructured: false };
  }

  const firstStart = Math.min(...segmentEntries.map((e) => e.start));
  const intro = text.slice(0, firstStart).trim().replace(/\s+/g, ' ');

  const footer = removeRanges(
    text.slice(firstStart),
    segmentEntries.map((p) => ({
      start: p.start - firstStart,
      end: p.end - firstStart,
    }))
  );

  const seen = new Set();
  const seasons = [];
  for (const key of SEASON_ORDER) {
    const entry = segmentEntries.find((p) => p.season.key === key && !seen.has(key));
    if (entry) {
      seen.add(key);
      seasons.push(entry.season);
    }
  }
  for (const entry of segmentEntries) {
    if (!seen.has(entry.season.key)) {
      seen.add(entry.season.key);
      seasons.push(entry.season);
    }
  }

  return {
    intro,
    seasons,
    footer: footer.length > 12 ? footer : '',
    useStructured: true,
  };
}
