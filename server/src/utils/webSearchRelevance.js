/**
 * Score and filter web search hits so unrelated parks/trails drop out before digest.
 */
const { extractAllParksFromMessage } = require('./parkExtractor');

const NPS_PATH_CODE = /nps\.gov\/([a-z]{4})\//i;

/** NPS unit codes that often appear as false positives in broad road/operational queries. */
const OTHER_PARK_CODES = new Set([
  'deva', 'yell', 'yose', 'grca', 'grte', 'arch', 'brca', 'cany', 'care', 'zion',
  'glac', 'romo', 'olym', 'ever', 'acad', 'shen', 'jotr', 'bibe', 'badl', 'havo',
]);

/**
 * @param {string} userMessage
 * @returns {Set<string>}
 */
function mentionedParkCodes(userMessage, parkCode) {
  const codes = new Set(
    extractAllParksFromMessage(userMessage || '').map((p) => p.parkCode.toLowerCase())
  );
  if (parkCode) codes.add(String(parkCode).toLowerCase());
  return codes;
}

/**
 * Trail/landmark phrases from the user message (lowercase).
 * @param {string} userMessage
 * @returns {string[]}
 */
function trailFocusTerms(userMessage) {
  if (!userMessage) return [];
  const lower = userMessage.toLowerCase();
  const terms = [];
  const patterns = [
    /\bthe narrows\b/,
    /\bnarrows\b/,
    /\bangels landing\b/,
    /\bthe subway\b/,
    /\bmystery canyon\b/,
    /\bgoing[- ]?to[- ]?the[- ]?sun\b/,
    /\bhighline trail\b/,
    /\bhalf dome\b/,
    /\bdelicate arch\b/,
    /\bold faithful\b/,
    /\bthe narrows\b/,
  ];
  for (const re of patterns) {
    const m = lower.match(re);
    if (m) terms.push(m[0].trim());
  }
  return [...new Set(terms)];
}

/**
 * @param {{ title?: string, snippet?: string, url?: string }} result
 * @param {{ userMessage: string, parkCode?: string|null, parkName?: string|null, category: string }} ctx
 * @returns {number}
 */
function scoreWebResult(result, ctx) {
  const text = `${result.title || ''} ${result.snippet || ''} ${result.url || ''}`.toLowerCase();
  const url = (result.url || '').toLowerCase();
  let score = 0;

  const codes = mentionedParkCodes(ctx.userMessage, ctx.parkCode);
  const urlMatch = url.match(NPS_PATH_CODE);
  if (urlMatch) {
    const urlCode = urlMatch[1];
    if (codes.size > 0) {
      if (codes.has(urlCode)) score += 35;
      else if (OTHER_PARK_CODES.has(urlCode)) score -= 45;
      else score -= 20;
    }
  }

  if (ctx.parkName) {
    const shortName = ctx.parkName.toLowerCase().replace(/\s+national park$/, '').trim();
    if (shortName.length >= 3 && text.includes(shortName)) score += 12;
  }

  const trails = trailFocusTerms(ctx.userMessage);
  if (ctx.category === 'trail-conditions' && trails.length > 0) {
    if (trails.some((t) => text.includes(t))) score += 28;
    else if (url.includes('alltrails.com')) score -= 30;
    else score -= 8;
  }

  if (ctx.category === 'road-conditions' && codes.size > 0) {
    if (urlMatch && !codes.has(urlMatch[1])) score -= 25;
    if (/going[- ]?to[- ]?the[- ]?sun|logan pass|sun road/i.test(ctx.userMessage)) {
      if (/going[- ]?to[- ]?the[- ]?sun|gtsr|logan pass/i.test(text)) score += 20;
      if (/wildrose|death valley|deva\b/i.test(text) && !codes.has('deva')) score -= 50;
    }
  }

  if (ctx.category === 'operational-status' && trails.length > 0) {
    if (trails.some((t) => text.includes(t))) score += 15;
    else if (trails.some((t) => t.includes('angels')) && /angels landing/i.test(text)) score += 15;
  }

  if (url.includes('nps.gov')) score += 5;
  if (result.source === 'google-places') score += 5;

  return score;
}

/**
 * @param {Array<{title:string,snippet?:string,url?:string,source?:string}>} results
 * @param {Object} ctx
 * @returns {typeof results}
 */
function rankAndFilterWebResults(results, ctx) {
  if (!results?.length) return [];

  const scored = results
    .map((r) => ({ r, score: scoreWebResult(r, ctx) }))
    .sort((a, b) => b.score - a.score);

  const minScore = -12;
  const strongReject = -28;
  const kept = scored
    .filter(({ score }) => score >= minScore)
    .map(({ r }) => r);

  if (kept.length > 0) return kept;

  const soft = scored.filter(({ score }) => score > strongReject).map(({ r }) => r);
  return soft.slice(0, 2);
}

module.exports = {
  rankAndFilterWebResults,
  scoreWebResult,
  mentionedParkCodes,
  trailFocusTerms,
};
