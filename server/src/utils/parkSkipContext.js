/**
 * Detect parks mentioned only to tell the user to skip them (discovery anti-pattern).
 */

const SKIP_LEAD_RE = /\b(?:skip|avoid|pass on|don't bother(?: with)?|steer clear of|not worth)\b/i;

/** Remove discovery paragraphs that name a catalog park only to say skip/avoid. */
function stripSkipOnlyParkSentences(text) {
  if (!text || typeof text !== 'string') return text;

  let parkKeys = [];
  try {
    const { PARK_NAME_TO_CODE } = require('./parkExtractor');
    parkKeys = [...PARK_NAME_TO_CODE.keys()].sort((a, b) => b.length - a.length);
  } catch {
    return text;
  }

  const paragraphs = text.split(/\n\n+/);
  const kept = paragraphs.filter((paragraph) => {
    const trimmed = paragraph.trim();
    if (!/^(?:Skip|Avoid|Pass on|Don't bother with|Steer clear of)\b/i.test(trimmed)) {
      return true;
    }
    const afterLead = trimmed.replace(
      /^(?:Skip|Avoid|Pass on|Don't bother with|Steer clear of)\s+(?:the\s+)?/i,
      ''
    );
    const lowerAfter = afterLead.toLowerCase();
    const namesPark = parkKeys.some(
      (key) => lowerAfter.startsWith(key) || lowerAfter.startsWith(`${key} `)
    );
    return !namesPark;
  });

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

function isParkMentionInSkipContext(text, index) {
  return SKIP_LEAD_RE.test(sentencePrefixBefore(text, index));
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
    const keys = new Set();
    if (park.parkName) keys.add(String(park.parkName).toLowerCase());
    if (park.parkCode) keys.add(String(park.parkCode).toLowerCase());

    for (const key of keys) {
      if (!key || key.length < 3) continue;
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'gi');
      let match;
      let hasMention = false;
      let allSkip = true;
      while ((match = re.exec(lower)) !== null) {
        hasMention = true;
        if (!isParkMentionInSkipContext(text, match.index)) {
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
  isParkMentionInSkipContext,
  filterParksNotSkipOnly,
};
