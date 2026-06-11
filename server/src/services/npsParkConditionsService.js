/**
 * Official NPS road/conditions — alerts API + conditions.htm excerpt.
 * Used for GTSR-style questions before/alongside web search.
 */
const cheerio = require('cheerio');
const { classifyQueryRegex } = require('./webSearchClassifier');
const {
  isRoadRelatedAlert,
  formatAlertLine,
} = require('../utils/npsAlertUtils');

const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 120;
const cache = new Map();

const NPS_USER_AGENT =
  'Mozilla/5.0 (compatible; TrailVerse/1.0; +https://www.nationalparksexplorerusa.com)';

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  cache.set(key, { value, ts: Date.now() });
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

function needsNpsRoadConditionsBlock(userMessage) {
  if (!userMessage || userMessage.trim().length < 8) return false;
  const category = classifyQueryRegex(userMessage);
  if (category === 'road-conditions') return true;
  if (category === 'operational-status') {
    return /\b(road|highway|pass|route|going[- ]?to[- ]?the[- ]?sun|gtsr|sun road|trail ridge|detour|construction)\b/i.test(
      userMessage
    );
  }
  if (category === 'trail-conditions') {
    return /\b(road|pass|highway|parking lot|visitor center road)\b/i.test(userMessage);
  }
  return false;
}

/**
 * Scrape planyourvisit/conditions.htm road section (authoritative NPS page).
 * @param {string} parkCode
 * @returns {Promise<string|null>}
 */
async function fetchConditionsPageRoadExcerpt(parkCode) {
  const code = String(parkCode).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!code) return null;

  const cacheKey = `conditions_road:${code}`;
  const cached = cacheGet(cacheKey);
  if (cached !== null) return cached;

  const url = `https://www.nps.gov/${code}/planyourvisit/conditions.htm`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': NPS_USER_AGENT, Accept: 'text/html' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      cacheSet(cacheKey, null);
      return null;
    }
    const html = await res.text();
    const $ = cheerio.load(html);

    const lines = [];
    $('h2').each((_, el) => {
      const heading = $(el).text().replace(/\s+/g, ' ').trim();
      if (!/road|snow plow|hiker|biker|status/i.test(heading)) return;

      let node = $(el).next();
      for (let i = 0; i < 12 && node.length; i++) {
        const name = node[0]?.name;
        if (name === 'h2') break;
        if (name === 'p' || name === 'li') {
          const t = node.text().replace(/\s+/g, ' ').trim();
          if (t.length > 15 && t.length < 500) lines.push(t);
        }
        if (name === 'table') {
          node.find('tr').each((__, tr) => {
            const row = $(tr).text().replace(/\s+/g, ' ').trim();
            if (row.length > 10 && row.length < 300) lines.push(row);
          });
        }
        node = node.next();
      }
    });

    // Fallback: paragraphs mentioning roads on the page
    if (lines.length === 0) {
      $('p').each((_, el) => {
        const t = $(el).text().replace(/\s+/g, ' ').trim();
        if (
          /going-to-the-sun|sun road|road closure|road status|seasonal closure|hiker\/biker/i.test(t) &&
          t.length > 20 &&
          t.length < 400
        ) {
          lines.push(t);
        }
      });
    }

    const unique = [...new Set(lines)].slice(0, 8);
    const excerpt = unique.length
      ? unique.map((l) => `- ${l}`).join('\n')
      : null;
    cacheSet(cacheKey, excerpt);
    return excerpt;
  } catch (err) {
    console.warn(`[NpsConditions] conditions.htm fetch failed for ${code}: ${err.message}`);
    cacheSet(cacheKey, null);
    return null;
  }
}

/**
 * Build road/conditions block from NPS alerts + conditions page.
 * @param {{ parkCode: string, parkName?: string, userMessage?: string, parkAlerts?: object[] }} params
 * @returns {Promise<string|null>}
 */
async function fetchNpsRoadConditionsFacts({ parkCode, parkName, userMessage = '', parkAlerts = [] }) {
  if (!parkCode || !needsNpsRoadConditionsBlock(userMessage)) return null;

  const cacheKey = `road_facts:${parkCode}:${userMessage.trim().toLowerCase().slice(0, 80)}`;
  const cached = cacheGet(cacheKey);
  if (cached !== null) return cached;

  const parts = [];
  const label = parkName || parkCode;

  const roadAlerts = (parkAlerts || []).filter((a) => isRoadRelatedAlert(a, userMessage));
  if (roadAlerts.length > 0) {
    parts.push(
      `Road & access alerts (NPS API, authoritative):\n${roadAlerts.slice(0, 5).map(formatAlertLine).join('\n')}`
    );
  }

  const pageExcerpt = await fetchConditionsPageRoadExcerpt(parkCode);
  if (pageExcerpt) {
    parts.push(`Road/status excerpt (nps.gov/${parkCode}/planyourvisit/conditions.htm):\n${pageExcerpt}`);
  }

  if (parts.length === 0) {
    parts.push(
      `Road/status: No road-specific lines parsed from NPS alerts or conditions.htm for ${label}. ` +
        `Use NPS alerts above and any web search digest — do not tell the user to go look up conditions themselves.`
    );
  }

  const block =
    `--- NPS ROAD & CONDITIONS (${label}) ---\n` +
    `${parts.join('\n\n')}\n` +
    `Source: U.S. National Park Service — prefer this block over web search snippets for open/closed road claims.\n` +
    `--- END NPS ROAD & CONDITIONS ---`;

  cacheSet(cacheKey, block);
  console.log(`[NpsConditions] road block for ${parkCode} | alerts=${roadAlerts.length} page=${!!pageExcerpt}`);
  return block;
}

module.exports = {
  needsNpsRoadConditionsBlock,
  fetchNpsRoadConditionsFacts,
  fetchConditionsPageRoadExcerpt,
};
