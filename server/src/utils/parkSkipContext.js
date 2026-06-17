/**
 * Detect parks mentioned only to tell the user to skip them (discovery anti-pattern).
 */

const SKIP_LEAD_RE = /\b(?:skip|avoid|pass on|don't bother(?: with)?|steer clear of|not worth)\b/i;

const SKIP_DISMISSAL_RE =
  /\b(?:i'd skip it|i would skip it|so i'd skip it|skip it for your|not a fit for your)\b/i;

/** Compare / head-to-head answers may legitimately say "save X for later". */
const POSITIVE_RECOMMEND_RE =
  /\b(?:go with|top pick|best pick|my (?:top |honest )?pick|save [a-z]+ for when)\b/i;

function loadParkKeys() {
  try {
    const { PARK_NAME_TO_CODE } = require('./parkExtractor');
    return [...PARK_NAME_TO_CODE.keys()].sort((a, b) => b.length - a.length);
  } catch {
    return [];
  }
}

function plainTextForParkMatch(text) {
  return String(text || '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .toLowerCase();
}

function paragraphNamesCatalogPark(paragraph, parkKeys) {
  const plain = plainTextForParkMatch(paragraph);
  return parkKeys.some((key) => key.length >= 4 && plain.includes(key));
}

function isSkipOnlyDismissalParagraph(paragraph, parkKeys = loadParkKeys()) {
  const trimmed = paragraph.trim();
  if (!trimmed || !parkKeys.length) return false;

  if (/^(?:Skip|Avoid|Pass on|Don't bother with|Steer clear of)\b/i.test(trimmed)) {
    const afterLead = trimmed.replace(
      /^(?:Skip|Avoid|Pass on|Don't bother with|Steer clear of)\s+(?:the\s+)?/i,
      ''
    );
    const lowerAfter = plainTextForParkMatch(afterLead);
    if (parkKeys.some((key) => lowerAfter.startsWith(key) || lowerAfter.startsWith(`${key} `))) {
      return true;
    }
  }

  if (!SKIP_DISMISSAL_RE.test(trimmed)) return false;
  if (POSITIVE_RECOMMEND_RE.test(trimmed)) return false;
  if (/^[-*•]\s+\*\*/.test(trimmed)) return false;

  return paragraphNamesCatalogPark(trimmed, parkKeys);
}

/** Remove discovery paragraphs that name a catalog park only to say skip/avoid. */
function stripSkipOnlyParkSentences(text) {
  if (!text || typeof text !== 'string') return text;

  const parkKeys = loadParkKeys();
  if (!parkKeys.length) return text;

  const kept = text.split(/\n\n+/).filter((paragraph) => !isSkipOnlyDismissalParagraph(paragraph, parkKeys));

  return kept.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

function sentencePrefixBefore(text, index) {
  const lookback = text.slice(Math.max(0, index - 160), index);
  const breaks = [
    lookback.lastIndexOf('\n\n'),
    lookback.lastIndexOf('\n'),
    lookback.lastIndexOf('. '),
    lookback.lastIndexOf('! '),
    lookback.lastIndexOf('? '),
    lookback.lastIndexOf('— '),
  ];
  const start = Math.max(...breaks);
  return start >= 0 ? lookback.slice(start) : lookback;
}

function sentenceSuffixAfter(text, index, keyLength) {
  const raw = text.slice(index, Math.min(text.length, index + keyLength + 220));
  const sentenceEnd = raw.search(/[.!?\n]/);
  return sentenceEnd === -1 ? raw : raw.slice(0, sentenceEnd);
}

function isParkMentionInSkipContext(text, index, keyLength = 0) {
  const prefix = sentencePrefixBefore(text, index);
  const suffix = sentenceSuffixAfter(text, index, keyLength);
  return SKIP_LEAD_RE.test(prefix) || SKIP_DISMISSAL_RE.test(suffix);
}

function keysForPark(park) {
  const keys = new Set();
  if (park.parkName) keys.add(String(park.parkName).toLowerCase());
  if (park.parkCode) {
    keys.add(String(park.parkCode).toLowerCase());
    try {
      const { PARK_NAME_TO_CODE } = require('./parkExtractor');
      for (const [name, meta] of PARK_NAME_TO_CODE.entries()) {
        if (meta.code === park.parkCode) keys.add(name);
      }
    } catch {
      // ignore
    }
  }
  return [...keys];
}

/**
 * Drop parks whose every mention in `text` sits in a skip/avoid sentence.
 * @param {string} text
 * @param {Array<{ parkCode: string, parkName: string, [key: string]: unknown }>} parks
 */
function filterParksNotSkipOnly(text, parks) {
  if (!text || !parks?.length) return parks || [];
  const lower = text.toLowerCase();

  return parks.filter((park) => {
    for (const key of keysForPark(park)) {
      if (!key || key.length < 3) continue;
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'gi');
      let match;
      let hasMention = false;
      let allSkip = true;
      while ((match = re.exec(lower)) !== null) {
        hasMention = true;
        if (!isParkMentionInSkipContext(text, match.index, match[0].length)) {
          allSkip = false;
          break;
        }
      }
      if (hasMention && allSkip) return false;
    }
    return true;
  });
}

module.exports = {
  stripSkipOnlyParkSentences,
  isSkipOnlyDismissalParagraph,
  isParkMentionInSkipContext,
  filterParksNotSkipOnly,
};
