/**
 * Editorial park pins for natural-language search (mirrors intent landing pages).
 */
const path = require('path');
const pinsByIntent = require(path.join(__dirname, '../../data/search-intent-pins.json'));

function detectSearchIntents(q) {
  const lower = String(q || '').toLowerCase();
  return {
    quiet: /\b(quiet|peaceful|calm|less crowded|underrated|low crowd)\b/.test(lower),
    couples: /\b(couples?|romantic|honeymoon)\b/.test(lower),
    beginners: /\b(beginners?|first[- ]?time|first visit|new to)\b/.test(lower),
    photography: /\b(photography|photo spots?|scenic shots?)\b/.test(lower),
  };
}

/**
 * @param {string} q
 * @returns {string[]} NPS park codes to pin (deduped, order preserved)
 */
function resolveSearchPinsFromQuery(q) {
  if (!q || !String(q).trim()) return [];

  const flags = detectSearchIntents(q);
  const ordered = [];

  if (flags.quiet && flags.couples) {
    ordered.push(...(pinsByIntent.quiet || []).slice(0, 4));
    ordered.push(...(pinsByIntent.couples || []).slice(0, 3));
  } else if (flags.quiet) {
    ordered.push(...(pinsByIntent.quiet || []));
  } else if (flags.couples) {
    ordered.push(...(pinsByIntent.couples || []));
  } else if (flags.beginners) {
    ordered.push(...(pinsByIntent.beginners || []));
  } else if (flags.photography) {
    ordered.push(...(pinsByIntent.photography || []));
  }

  const seen = new Set();
  return ordered.filter((code) => {
    const c = code.toLowerCase();
    if (seen.has(c)) return false;
    seen.add(c);
    return true;
  });
}

module.exports = {
  detectSearchIntents,
  resolveSearchPinsFromQuery,
};
