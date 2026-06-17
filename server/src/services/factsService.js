const axios = require('axios');

const { getFeeFreeInfo } = require('./feeFreeDaysService');
const {
  resolveTripWeatherWindow,
  resolveWeatherMode,
  buildEstimatedWeatherFacts,
} = require('./weatherEstimateService');
const { isTravelRelated: isTravelRelatedQuery } = require('../utils/discoveryQuery');
const {
  classifyQueryRegex,
  resolveSearchCategory,
} = require('./webSearchClassifier');
const { summarizeWebResultsForTrailie } = require('./webSearchSummarizer');
const { rankAndFilterWebResults } = require('../utils/webSearchRelevance');
const { createFactSlotMeta } = require('../utils/trailieContextBuilder');
const { fetchNpsRoadConditionsFacts, needsNpsRoadConditionsBlock } = require('./npsParkConditionsService');
const {
  isClosureCategory,
  isCautionCategory,
  isInformationCategory,
} = require('../utils/npsAlertUtils');

const OWM_KEY = process.env.OPENWEATHER_API_KEY; // server-side key ⚠️ not REACT_APP_*
const OWM_BASE = 'https://api.openweathermap.org/data/2.5/forecast';
// NPS data is now served through npsService (with bulk caches) — no direct API calls needed

// Web search configuration — supports Brave Search, Serper, or Tavily
const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY;
const SERPER_API_KEY = process.env.SERPER_API_KEY;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

// Web search cache + timeout tuning
const WEB_SEARCH_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const WEB_SEARCH_CACHE_MAX_SIZE = 200;
const PROVIDER_TIMEOUT_MS = 2500;
const PRIMARY_MIN_RESULTS = 3; // fall back to backups if primary returns fewer than this

/**
 * Simple LRU-ish TTL cache — evicts oldest when size exceeds max.
 */
class TTLCache {
  constructor(maxSize, ttl) {
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cache = new Map();
  }
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    // Bump recency
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }
  set(key, value) {
    if (this.cache.has(key)) this.cache.delete(key);
    this.cache.set(key, { value, timestamp: Date.now() });
    while (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }
}
const webSearchCache = new TTLCache(WEB_SEARCH_CACHE_MAX_SIZE, WEB_SEARCH_CACHE_TTL_MS);

/**
 * Per-category search strategy. Categories with `skip: true` are answered
 * from NPS/RIDB authoritative data — we don't run a web search at all.
 *
 * Freshness: 'pd' = past day, 'pw' = past week, 'pm' = past month, null = no filter
 */
const STRATEGY = {
  // SKIP — handled by NPS/RIDB facts already in the prompt
  'nps-covered':       { skip: true },
  'history-facts':     { skip: true },

  // LIVE — past-week freshness (pd often returns 0 for nps.gov pages indexed older than 24h)
  'operational-status': { primary: 'brave', domains: ['nps.gov'],                                    freshness: 'pw', n: 5 },
  'road-conditions':   { primary: 'brave',  domains: ['nps.gov', 'weather.gov'],                   freshness: 'pw', n: 5 },
  'wildfire-smoke':    { primary: 'brave',  domains: ['inciweb.nwcg.gov', 'nps.gov', 'airnow.gov'], freshness: 'pw', n: 5 },

  // RECENT — past-week freshness
  'trail-conditions':  { primary: 'brave',  domains: ['nps.gov', 'alltrails.com'],                 freshness: 'pw', n: 3 },
  'wildlife-seasonal': { primary: 'tavily', domains: ['nps.gov', 'nationalparkstraveler.org'],     freshness: 'pw', n: 3 },
  'events':            { primary: 'brave',  domains: [],                                            freshness: 'pw', n: 3 },

  // LOCAL — Serper Places, no freshness filter
  'local-business':    { primary: 'serper', domains: [],                                            freshness: null, n: 4 },

  // GENERAL — monthly freshness, open web (retrieval only; summary via OpenAI)
  'planning':          { primary: 'tavily', domains: [],                                            freshness: 'pm', n: 3 }
};

/**
 * Wrap a promise with a timeout. Returns { timedOut, value } — never rejects.
 * On timeout or error, value is null.
 */
function withTimeout(promise, ms, label) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      console.warn(`[WebSearch] ${label} timed out after ${ms}ms`);
      resolve({ timedOut: true, value: null });
    }, ms);
    promise.then(
      (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ timedOut: false, value });
      },
      (error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        console.warn(`[WebSearch] ${label} failed: ${error.message}`);
        resolve({ timedOut: false, value: null });
      }
    );
  });
}

/**
 * Fetch weather facts for a specific location
 * @param {Object} params - { lat, lon, units }
 * @returns {Promise<string|null>} Formatted weather facts or null
 */
async function fetchWeatherFacts({ lat, lon, units = 'imperial' }) {
  if (!lat || !lon || !OWM_KEY) {
    console.log('⚠️ Weather facts skipped: missing coordinates or API key');
    return null;
  }

  try {
    const url = `${OWM_BASE}?lat=${lat}&lon=${lon}&units=${units}&appid=${OWM_KEY}`;
    const response = await axios.get(url, { timeout: 5000 });
    
    if (!response.data || !response.data.list) return null;

    const data = response.data;
    const location = data.city?.name || 'Current location';
    
    // Group forecasts by day (API returns 3-hour intervals for 5 days)
    const dailyForecasts = {};
    
    data.list.forEach(item => {
      const date = new Date(item.dt * 1000).toDateString();
      if (!dailyForecasts[date]) {
        dailyForecasts[date] = {
          temps: [],
          conditions: [],
          humidity: [],
          wind: []
        };
      }
      
      dailyForecasts[date].temps.push(item.main.temp);
      dailyForecasts[date].conditions.push(item.weather[0].description);
      dailyForecasts[date].humidity.push(item.main.humidity);
      dailyForecasts[date].wind.push(item.wind.speed * 2.237); // Convert m/s to mph
    });

    // Generate 3-day forecast summary
    const forecastDays = Object.keys(dailyForecasts).slice(0, 3);
    const forecastText = forecastDays.map(date => {
      const day = dailyForecasts[date];
      const maxTemp = Math.round(Math.max(...day.temps));
      const minTemp = Math.round(Math.min(...day.temps));
      const avgHumidity = Math.round(day.humidity.reduce((a, b) => a + b, 0) / day.humidity.length);
      const avgWind = Math.round(day.wind.reduce((a, b) => a + b, 0) / day.wind.length);
      
      // Get most common condition
      const conditionCounts = {};
      day.conditions.forEach(cond => {
        conditionCounts[cond] = (conditionCounts[cond] || 0) + 1;
      });
      const mostCommonCondition = Object.keys(conditionCounts).reduce((a, b) => 
        conditionCounts[a] > conditionCounts[b] ? a : b
      );
      
      const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'short' });
      return `${dayName}: High ${maxTemp}°F, Low ${minTemp}°F, ${mostCommonCondition}, Humidity ${avgHumidity}%, Wind ${avgWind} mph`;
    }).join('\n');

    return `Weather Forecast at ${location} (LIVE — next 3 days from today):\n${forecastText}\n(Source: OpenWeather 5-day forecast. Use ONLY for trips starting within the next few days — not for distant future dates.)`;
  } catch (error) {
    console.error('Weather facts error:', error.message);
    return null;
  }
}

/**
 * Live forecast or climate estimate depending on trip timing.
 * @returns {Promise<{ text: string|null, meta: { source: string, mode: string } }>}
 */
async function fetchWeatherForTrailie({
  lat,
  lon,
  tripDates = null,
  userMessage = '',
  locationName = 'this area',
  parkCode = null,
}) {
  if (!lat || !lon) {
    return { text: null, meta: null };
  }

  const window = resolveTripWeatherWindow(tripDates, userMessage);
  const mode = window ? resolveWeatherMode(window) : 'live';

  if (mode === 'estimate') {
    const estimate = buildEstimatedWeatherFacts({
      lat,
      lon,
      locationName,
      parkCode,
      tripDates,
      userMessage,
    });
    if (estimate?.text) {
      return {
        text: estimate.text,
        meta: { source: 'TrailVerseClimateEstimate', mode: 'estimate', ...estimate.meta },
      };
    }
  }

  const live = await fetchWeatherFacts({ lat, lon });
  if (live) {
    return {
      text: live,
      meta: { source: 'OpenWeather', mode: 'live' },
    };
  }

  if (window) {
    const estimate = buildEstimatedWeatherFacts({
      lat,
      lon,
      locationName,
      parkCode,
      tripDates,
      userMessage,
    });
    if (estimate?.text) {
      return {
        text: estimate.text,
        meta: { source: 'TrailVerseClimateEstimate', mode: 'estimate', ...estimate.meta },
      };
    }
  }

  return { text: null, meta: null };
}

/**
 * Fetch NPS facts for a specific park
 * Uses npsService (with its caches) instead of direct API calls.
 * @param {Object} params - { parkCode }
 * @returns {Promise<string|null>} Formatted NPS facts or null
 */
async function fetchNPSFacts({ parkCode, parkName = null, userMessage = '' }) {
  if (!parkCode) {
    console.log('⚠️ NPS facts skipped: missing parkCode');
    return null;
  }

  try {
    const npsService = require('./npsService');
    const ridbService = require('./ridbService');

    // Fetch park details, alerts, campgrounds, visitor centers, and permits in parallel
    const [details, alerts, campgrounds, visitorCenters, permits] = await Promise.allSettled([
      npsService.getParkByCode(parkCode),
      npsService.getParkAlerts(parkCode),
      npsService.getParkCampgrounds(parkCode),
      npsService.getParkVisitorCenters(parkCode),
      ridbService.getPermitsForPark(parkCode)
    ]);

    const park = details.status === 'fulfilled' ? details.value : null;
    const parkAlerts = alerts.status === 'fulfilled' ? alerts.value : [];
    const parkCampgrounds = campgrounds.status === 'fulfilled' ? campgrounds.value : [];
    const parkVisitorCenters = visitorCenters.status === 'fulfilled' ? visitorCenters.value : [];
    const parkPermits = permits.status === 'fulfilled' ? permits.value : [];

    if (!park) {
      console.log(`⚠️ No park details found for ${parkCode}`);
      return null;
    }

    const facts = [];

    // Entrance fees
    if (park.entranceFees && park.entranceFees.length > 0) {
      const fees = park.entranceFees
        .slice(0, 3)
        .map(f => `- ${f.title}: $${f.cost}`)
        .join('\n');
      facts.push(`Entrance Fees:\n${fees}`);
    }

    // Activities
    if (park.activities && park.activities.length > 0) {
      const topActivities = park.activities.slice(0, 6).map(a => a.name).join(', ');
      facts.push(`Available Activities: ${topActivities}`);
    }

    // Alerts — NPS API uses "Park Closure", "Caution", "Information" (not always exact "Closure")
    const closures = parkAlerts.filter((a) => isClosureCategory(a.category)).slice(0, 5);
    const cautions = parkAlerts.filter((a) => isCautionCategory(a.category)).slice(0, 3);
    const infos = parkAlerts.filter((a) => isInformationCategory(a.category)).slice(0, 3);

    if (closures.length > 0) {
      facts.push('⚠️ ACTIVE CLOSURES:\n' + closures.map(a => `- ${a.title}`).join('\n'));
    }
    if (cautions.length > 0) {
      facts.push('Cautions:\n' + cautions.map(a => `- ${a.title}`).join('\n'));
    }
    if (infos.length > 0) {
      facts.push('Park Info:\n' + infos.map(a => `- ${a.title}`).join('\n'));
    }
    if (closures.length === 0 && cautions.length === 0 && infos.length === 0) {
      facts.push('Active Closures/Alerts: None reported');
    }

    // Campgrounds — top 5 by site count
    if (parkCampgrounds.length > 0) {
      const sorted = [...parkCampgrounds].sort((a, b) => {
        const aS = parseInt(a.campsites?.totalSites) || 0;
        const bS = parseInt(b.campsites?.totalSites) || 0;
        return bS - aS;
      });
      const cgLines = sorted.slice(0, 5).map(cg => {
        const info = cg.reservationInfo || 'See recreation.gov';
        const fee = cg.fees?.[0]?.cost ? `$${cg.fees[0].cost}/night` : '';
        const url = cg.reservationUrl ? ` — Book: ${cg.reservationUrl}` : '';
        return `- ${cg.name}${fee ? ` (${fee})` : ''}: ${info}${url}`;
      }).join('\n');
      facts.push(`Campgrounds (${parkCampgrounds.length} total, top 5):\n${cgLines}`);
    }

    // Visitor centers
    if (parkVisitorCenters.length > 0) {
      const vc = parkVisitorCenters[0];
      let vcText = `Main Visitor Center: ${vc.name}`;
      if (vc.description) {
        vcText += `\nHours: ${vc.description}`;
      }
      facts.push(vcText);
    }

    // Permits & reservations — from Recreation.gov (RIDB)
    // NOTE: RIDB lists facilities that may not be active every year.
    // Timed entry policies change annually (e.g. Yosemite, Arches dropped for 2026).
    if (parkPermits.length > 0) {
      const permitLines = parkPermits.slice(0, 8).map(p => {
        const isTimedEntry = (p.type || '').toLowerCase().includes('timed entry');
        if (isTimedEntry) {
          return `- ${p.name} [STATUS UNKNOWN — this is a Recreation.gov listing only, NOT confirmation that timed entry is currently required. Many parks dropped timed entry for 2026. Do NOT tell the user timed entry is required. Say "check Recreation.gov to see if timed entry is needed"]: ${p.reservationUrl}`;
        }
        return `- ${p.name}${p.type ? ` [${p.type}]` : ''}: ${p.reservationUrl}`;
      }).join('\n');
      facts.push(
        `Permits & Reservations (from Recreation.gov):\nIMPORTANT: Timed-entry listings below do NOT confirm the requirement is active — many parks (Yosemite, Arches, Glacier, Mt Rainier) dropped timed entry for 2026. Do NOT state timed entry is required. Instead say "check Recreation.gov to see if timed entry is currently needed" and link the URL.\nIf timed entry is NOT required: warn users this means NO crowd control — expect heavier traffic, packed trailheads and parking lots, arrive before 7am for popular spots, and consider visiting on weekdays.\n${permitLines}`
      );
    } else {
      facts.push('Permits: No permit requirements found on Recreation.gov for this park');
    }

    if (needsNpsRoadConditionsBlock(userMessage)) {
      const roadBlock = await fetchNpsRoadConditionsFacts({
        parkCode,
        parkName: parkName || park.fullName,
        userMessage,
        parkAlerts,
      });
      if (roadBlock) facts.push(roadBlock);
    }

    return facts.filter(Boolean).join('\n\n');
  } catch (error) {
    console.error('NPS facts error:', error.message);
    return null;
  }
}

/**
 * Build a smart search query from user message and park context
 * @param {string} userMessage - The user's message
 * @param {string} parkName - Park name for context
 * @returns {string} Optimized search query
 */
function buildSearchQuery(userMessage, parkName) {
  // Strip common filler words and keep the intent
  const cleaned = userMessage
    .replace(/\b(can you|please|tell me|i want to|i'd like to|what are|where are|how do i|show me)\b/gi, '')
    .trim();

  // If parkName is already in the message, use it as-is
  if (parkName && !cleaned.toLowerCase().includes(parkName.toLowerCase())) {
    return `${cleaned} near ${parkName}`.substring(0, 200);
  }
  return cleaned.substring(0, 200);
}

/**
 * Enrich a raw query with park context + category-specific augmentation.
 *
 * - Always prepends park name if missing (gives providers park context)
 * - For road-conditions / wildfire-smoke: appends current year
 * - For trail-conditions: appends "current conditions" if not already time-bound
 * - Strips conversational filler
 *
 * @param {string} rawQuery
 * @param {string} parkName
 * @param {string} category - classifyQuery() return value
 * @returns {string}
 */
function enrichQuery(rawQuery, parkName, category) {
  let q = rawQuery
    .replace(/\b(can you|please|tell me|i want to|i'd like to|what are|where are|how do i|show me|is there|are there)\b/gi, '')
    .trim();

  if (parkName && !q.toLowerCase().includes(parkName.toLowerCase())) {
    q = `${parkName} ${q}`;
  }

  const year = new Date().getFullYear();
  if (category === 'operational-status' || category === 'road-conditions' || category === 'wildfire-smoke') {
    if (!q.includes(String(year))) q = `${q} ${year}`;
  }
  if (category === 'operational-status' && !/nps|national park/i.test(q)) {
    q = `${q} NPS`;
  }
  if (category === 'trail-conditions') {
    if (!/current|latest|now|today/i.test(q)) q = `${q} current conditions`;
  }

  return q.substring(0, 250);
}

/**
 * Classify the user's query into a search strategy category.
 *
 * Order matters: SKIP buckets (nps-covered, history-facts) are checked first
 * so "permits" doesn't fall through to a broader category.
 *
 * @param {string} userMessage
 * @returns {string} One of the keys in STRATEGY
 */
/**
 * Named non-catalog outdoor destinations (state parks, forests, preserves, etc.).
 * Conservative v1 — avoids broad discovery words (best, recommend, near Chicago).
 * @param {string} userMessage
 * @returns {boolean}
 */
function hasExplicitNonNpsDestinationSignal(userMessage) {
  if (!userMessage) return false;
  const msg = userMessage.toLowerCase();

  return (
    /\bstate park\b/.test(msg) ||
    /\bnational forest\b/.test(msg) ||
    /\bstate forest\b/.test(msg) ||
    /\bcounty park\b/.test(msg) ||
    /\bcity park\b/.test(msg) ||
    /\bpreserve\b/.test(msg) ||
    /\brecreation area\b/.test(msg) ||
    /\bconservation area\b/.test(msg) ||
    /\bvalley of fire\b/.test(msg) ||
    /\bhocking hills\b/.test(msg) ||
    /\bred river gorge\b/.test(msg) ||
    /\bcuster\b/.test(msg) ||
    /\bstarved rock\b/.test(msg) ||
    /\bsmith rock\b/.test(msg)
  );
}

/**
 * Topics TrailVerse does not answer from NPS live API — use web search (logged-in).
 */
function hasNonNpsTravelSignals(userMessage) {
  if (!userMessage) return false;
  const msg = userMessage.toLowerCase();

  if (/state\s+park/i.test(msg)) return true;
  if (/\b(vs\.?|versus|compare|between)\b/.test(msg)) return true;
  if (
    /(?:restaurant|food|\beat\b|dine|dining|cafe|coffee|\bbar\b|hotel|motel|lodge|lodging|cabin|airbnb|\bstay\b|accommodation|gas station|grocery|town|gateway|nearby|outfitter|gear shop|rental|shuttle service|tour company|guide service|booking|availability|price|cost|review|rating)/i.test(
      msg
    )
  ) {
    return true;
  }
  if (
    /(road condition|road closure|road open|road status|construction|detour|trail condition|trail report|muddy|washout|wildfire|smoke|air quality|haze|flood)/i.test(
      msg
    )
  ) {
    return true;
  }
  if (/(\bevents?\b|\bfestivals?\b|ranger program|wildflower|bloom|fall color|aurora|northern lights)/i.test(msg)) {
    return true;
  }
  if (/(operational|trail condition|wildfire|\bsmoke\b|air quality)/i.test(msg)) {
    return true;
  }
  if (
    /(best|which|where|suggest|recommend|options?|ideas?|looking for|trying to find|not sure|help me (pick|choose|decide)|or even|somewhere)/i.test(
      msg
    )
  ) {
    return true;
  }
  if (/\b(swim|swimming|beach|beaches|ocean|coast|coastal|lake|lakes|hot spring|relax|chill|romantic|couple|girlfriend|boyfriend|partner)\b/i.test(msg)) {
    return true;
  }
  if (/\b(current|currently|right now|today|tonight|this week|latest|open now|still closed)\b/i.test(msg)) {
    return true;
  }

  const category = classifyQueryRegex(userMessage);
  return !STRATEGY[category]?.skip;
}

/**
 * Pure NPS live-data questions — no web search.
 */
function isNpsAuthoritativeOnly(userMessage) {
  if (!userMessage || userMessage.trim().length < 8) return false;
  if (!isTravelRelated(userMessage)) return false;
  const category = classifyQueryRegex(userMessage);
  if (!STRATEGY[category]?.skip) return false;
  return !hasNonNpsTravelSignals(userMessage);
}

/** Sync regex classification (tests / gating). */
function classifyQuery(userMessage) {
  return classifyQueryRegex(userMessage);
}

/**
 * Fetch web search results using Brave Search API.
 * @param {string} query
 * @param {Object} [options]
 * @param {number} [options.count=5]
 * @param {string|null} [options.freshness=null] - 'pd' | 'pw' | 'pm' | null
 * @param {string[]} [options.domains=[]] - site: allowlist appended to query
 */
function buildBraveQuery(query, domains, parkCode) {
  if (!domains?.length) return query;
  const code = parkCode ? String(parkCode).toLowerCase() : null;
  if (code && domains.includes('nps.gov')) {
    return `${query} site:nps.gov/${code}`;
  }
  if (domains.length === 1) return `${query} site:${domains[0]}`;
  return `${query} (${domains.map((d) => `site:${d}`).join(' OR ')})`;
}

async function searchBrave(query, { count = 5, freshness = null, domains = [], parkCode = null } = {}) {
  const q = buildBraveQuery(query, domains, parkCode);
  const baseParams = { q, count: Math.min(count, 20) };

  async function runSearch(params) {
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      headers: { 'X-Subscription-Token': BRAVE_API_KEY, Accept: 'application/json' },
      params,
      timeout: 5000,
    });
    return response.data?.web?.results || [];
  }

  let raw = [];
  if (freshness) {
    raw = await runSearch({ ...baseParams, freshness });
    if (raw.length === 0) {
      console.log('[WebSearch] Brave freshness filter returned 0 — retrying without freshness');
      raw = await runSearch(baseParams);
    }
  } else {
    raw = await runSearch(baseParams);
  }

  // If multi-domain OR query still thin, retry primary domain only (usually nps.gov).
  if (raw.length < 2 && domains.length > 1) {
    const fallbackQ = buildBraveQuery(query, [domains[0]], parkCode);
    const fallbackParams = { q: fallbackQ, count: baseParams.count };
    const more = await runSearch(freshness ? { ...fallbackParams, freshness } : fallbackParams);
    if (more.length > raw.length) raw = more;
  }

  return raw.map((r) => ({
    title: r.title,
    snippet: r.description,
    url: r.url,
    source: 'brave',
  }));
}

/**
 * Fetch web search results using Serper API (Google).
 * @param {string} query
 * @param {Object} [options]
 * @param {number} [options.num=5]
 * @param {string[]} [options.domains=[]] - site: allowlist appended to query
 */
async function searchSerper(query, { num = 5, domains = [] } = {}) {
  let q = query;
  if (domains.length) {
    q = `${q} (${domains.map(d => `site:${d}`).join(' OR ')})`;
  }
  const response = await axios.post('https://google.serper.dev/search', {
    q,
    num
  }, {
    headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
    timeout: 5000
  });

  const organic = response.data?.organic || [];
  // Also grab Google's knowledge graph / places if present
  const places = response.data?.places || [];

  const results = organic.map(r => ({
    title: r.title,
    snippet: r.snippet,
    url: r.link,
    source: 'google'
  }));

  // Add place results (restaurants, hotels, etc.) — these are gold for local queries
  if (places.length > 0) {
    const placeResults = places.slice(0, 3).map(p => ({
      title: p.title,
      snippet: [p.address, p.rating ? `Rating: ${p.rating}/5` : null, p.phone].filter(Boolean).join(' · '),
      url: p.link || '',
      source: 'google-places'
    }));
    results.unshift(...placeResults);
  }

  return results;
}

/**
 * Fetch web search results using Tavily API (optimized for AI/RAG).
 * @param {string} query
 * @param {Object} [options]
 * @param {number} [options.count=5]
 * @param {string} [options.depth='basic'] - 'basic' | 'advanced'
 * @param {string[]} [options.domains=[]] - Tavily include_domains (native support)
 */
async function searchTavily(query, { count = 5, depth = 'basic', domains = [] } = {}) {
  const body = {
    api_key: TAVILY_API_KEY,
    query,
    max_results: count,
    search_depth: depth,
    include_answer: false
  };
  if (domains.length) body.include_domains = domains;

  const response = await axios.post('https://api.tavily.com/search', body, {
    timeout: 7000
  });

  const results = (response.data?.results || []).map(r => ({
    title: r.title,
    snippet: r.content?.substring(0, 250),
    url: r.url,
    source: 'tavily',
    score: r.score || 0
  }));

  return { results };
}

/**
 * Deduplicate results by URL domain + path, keeping the one with more info
 */
function deduplicateResults(results) {
  const seen = new Map();
  for (const r of results) {
    try {
      const key = new URL(r.url).hostname + new URL(r.url).pathname;
      const existing = seen.get(key);
      if (!existing || (r.snippet && r.snippet.length > (existing.snippet || '').length)) {
        seen.set(key, r);
      }
    } catch {
      seen.set(r.title, r);
    }
  }
  return Array.from(seen.values());
}

/**
 * Fetch live web search facts using the best provider for the query type.
 *
 * Strategy:
 *   - LOCAL queries (restaurants, hotels): Serper (Google Places) primary
 *   - REALTIME queries (closures, events): Brave (fresh index) primary
 *   - PLANNING queries (tips, itineraries): Tavily retrieval primary
 *   - Digest: OpenAI (TrailVerse) summarizes snippets — never third-party AI answers
 *
 * Each provider call is wrapped in a timeout so a slow provider can't block.
 * Backups only run if the primary returns fewer than PRIMARY_MIN_RESULTS — keeps
 * cost down while preserving reliability. Successful responses are cached in-memory
 * for WEB_SEARCH_CACHE_TTL_MS to cut repeat-query costs during busy sessions.
 */
async function fetchWebSearchFacts({ userMessage, parkName, parkCode }) {
  if (!BRAVE_API_KEY && !SERPER_API_KEY && !TAVILY_API_KEY) {
    console.log('[WebSearch] No search API key configured');
    return null;
  }

  const category = await resolveSearchCategory(userMessage);
  const strategy = STRATEGY[category] || STRATEGY.planning;

  // NPS-authoritative only — skip web. Mixed messages (permit + hotel) still search.
  if (strategy.skip && !hasNonNpsTravelSignals(userMessage)) {
    console.log(`[WebSearch] SKIP | category=${category} (NPS/RIDB only)`);
    return null;
  }

  const query = enrichQuery(userMessage, parkName, category);
  const { primary, domains, freshness, n } = strategy;

  // Cache lookup — key includes category + parkCode so same phrase for
  // different parks (or intents) doesn't collide.
  const cacheKey = `${category}:${parkCode || 'none'}:${query.toLowerCase().substring(0, 200)}`;
  const cached = webSearchCache.get(cacheKey);
  if (cached !== undefined) {
    console.log(`[WebSearch] cache HIT | category=${category} query="${query.substring(0, 60)}"`);
    return cached;
  }
  console.log(`[WebSearch] cache MISS | category=${category} query="${query.substring(0, 60)}"`);

  // Build a runner for a named provider (null if key missing).
  const makeRunner = (name) => {
    if (name === 'brave' && BRAVE_API_KEY) {
      return {
        name: 'brave',
        run: () => searchBrave(query, { count: n, freshness, domains, parkCode }).then(r => ({ results: r }))
      };
    }
    if (name === 'serper' && SERPER_API_KEY) {
      return {
        name: 'serper',
        run: () => searchSerper(query, { num: n, domains }).then(r => ({ results: r }))
      };
    }
    if (name === 'tavily' && TAVILY_API_KEY) {
      return {
        name: 'tavily',
        run: () => searchTavily(query, { count: n, domains }).then(r => ({ results: r.results }))
      };
    }
    return null;
  };

  // Ordered provider list: primary first, then the rest as backups.
  const ordered = [primary, 'tavily', 'brave', 'serper']
    .filter((v, i, a) => a.indexOf(v) === i)
    .map(makeRunner)
    .filter(Boolean);

  if (ordered.length === 0) return null;

  const allResults = [];
  const telemetry = [];

  // Run primary first with a hard timeout.
  const primaryRunner = ordered[0];
  const pStart = Date.now();
  const pRes = await withTimeout(primaryRunner.run(), PROVIDER_TIMEOUT_MS, primaryRunner.name);
  telemetry.push({
    provider: primaryRunner.name,
    primary: true,
    timedOut: pRes.timedOut,
    ms: Date.now() - pStart,
    n: pRes.value?.results?.length || 0
  });
  if (pRes.value) {
    allResults.push(...pRes.value.results);
  }

  // Run backups only if the primary was too thin.
  if (allResults.length < PRIMARY_MIN_RESULTS && ordered.length > 1) {
    console.log(`[WebSearch] primary ${primaryRunner.name} returned ${allResults.length} — running backups`);
    const backupCalls = ordered.slice(1).map(p => {
      const start = Date.now();
      return withTimeout(p.run(), PROVIDER_TIMEOUT_MS, p.name).then(r => ({
        provider: p.name,
        ms: Date.now() - start,
        result: r
      }));
    });
    const backupResults = await Promise.allSettled(backupCalls);
    for (const br of backupResults) {
      if (br.status !== 'fulfilled') continue;
      const { provider, ms, result } = br.value;
      telemetry.push({
        provider,
        primary: false,
        timedOut: result.timedOut,
        ms,
        n: result.value?.results?.length || 0
      });
      if (result.value) {
        allResults.push(...result.value.results);
      }
    }
  }

  // Dedup, relevance-rank, cap. 4 top results is plenty for the system prompt.
  const uniqueResults = deduplicateResults(allResults);
  const ranked = rankAndFilterWebResults(uniqueResults, {
    userMessage,
    parkName,
    parkCode,
    category,
  });
  const finalResults = ranked.slice(0, 4);

  let trailieDigest = null;
  if (finalResults.length > 0) {
    trailieDigest = await summarizeWebResultsForTrailie({
      userMessage,
      parkName,
      category,
      results: finalResults,
    });
  }

  console.log(
    `[WebSearch] done | category=${category} final=${finalResults.length} hasDigest=${!!trailieDigest} ` +
    `providers=${telemetry.map(t => `${t.provider}${t.primary ? '*' : ''}:${t.timedOut ? 'TO' : t.n}@${t.ms}ms`).join(' ')}`
  );

  if (finalResults.length === 0) {
    return null;
  }

  const formatted = formatWebResults(finalResults, trailieDigest, category);
  webSearchCache.set(cacheKey, formatted);
  return formatted;
}

/**
 * Format web search results for injection into the AI system prompt.
 * Groups Google Places separately for local-business readability.
 */
function formatWebResults(finalResults, trailieDigest, category) {
  let formatted = `Live Web Search Results (category: ${category})`;
  const providerList = [...new Set(finalResults.map(r => r.source))];
  if (providerList.length) {
    formatted += ` via ${providerList.join(' + ')}`;
  }
  formatted += ':\n';

  if (trailieDigest) {
    formatted += `\nTrailVerse Web Digest (from snippets only — permits ≠ closed unless a source says closed):\n${trailieDigest}\n`;
  }

  const places = finalResults.filter(r => r.source === 'google-places');
  const webResults = finalResults.filter(r => r.source !== 'google-places');

  if (places.length > 0) {
    formatted += '\nNearby Places:\n';
    formatted += places
      .map((p) => {
        const line = `- ${p.title}: ${p.snippet}`;
        return p.url ? `${line}\n   Link: ${p.url}` : line;
      })
      .join('\n');
    formatted += '\n';
  }

  if (webResults.length > 0) {
    formatted += '\nWeb Sources:\n';
    formatted += webResults
      .filter(r => r.title && r.snippet)
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.url}`)
      .join('\n\n');
  }

  formatted += '\n(From live web search — verify details with official sources)';
  formatted +=
    '\nWhen citing a hotel or restaurant from Nearby Places or Web Sources, link the business name to its Link/Source URL on first mention — e.g. [Jackson Lake Lodge](url). Do NOT link business names to TrailVerse /parks/ URLs.';
  return formatted;
}

/**
 * Determine if a message is travel/park related
 * @param {string} userMessage - The user's message
 * @returns {boolean} Whether the message is about travel or parks
 */
function isTravelRelated(userMessage) {
  return isTravelRelatedQuery(userMessage);
}

function isHeadToHeadCompareQuery(userMessage) {
  if (!userMessage) return false;
  return /\b(vs\.?|versus)\b/i.test(userMessage);
}

/**
 * Logged-in web search policy: NPS + catalog for park picks, compare, permits, and open/closed;
 * web search only for logistics that need live off-NPS sources (restaurants, hotels, roads, etc.).
 * Named non-NPS destinations (no parkCode) bypass itinerary/compare/operational gates.
 * @param {string} userMessage
 * @param {{ parkCode?: string|null }} [options]
 * @returns {boolean}
 */
function needsWebSearch(userMessage, { parkCode = null } = {}) {
  if (!userMessage || userMessage.trim().length < 8) return false;
  if (!isTravelRelated(userMessage)) return false;

  const explicitNonNps = !parkCode && hasExplicitNonNpsDestinationSignal(userMessage);
  if (explicitNonNps) {
    return true;
  }

  if (isItineraryPlanningQuery(userMessage)) return false;
  if (isNpsAuthoritativeOnly(userMessage)) return false;
  if (isOpenEndedParkDiscoveryQuery(userMessage)) return false;
  if (isHeadToHeadCompareQuery(userMessage)) return false;

  if (
    isPermitOrReservationQuery(userMessage) &&
    !/\b(restaurant|hotel|lodging|motel|stay|eat|dining|gateway|airbnb)\b/i.test(userMessage)
  ) {
    return false;
  }

  const category = classifyQuery(userMessage);
  // Trail/attraction open-closed — NPS alerts suffice; roads still use web.
  if (category === 'operational-status' && !/\broad\b/i.test(userMessage)) return false;

  return true;
}

/** Day-by-day trip plans — NPS + weather facts suffice; skip web-search signup footer. */
function isItineraryPlanningQuery(userMessage) {
  if (!userMessage) return false;
  return (
    /\b(plan|itinerary|schedule|day[- ]?by[- ]?day|things to do)\b/i.test(userMessage) ||
    /\b\d{1,2}\s*[- ]?day\b/i.test(userMessage)
  );
}

function isOpenEndedParkDiscoveryQuery(userMessage) {
  if (!userMessage) return false;
  if (
    /\b(restaurant|hotel|lodging|motel|eat|dining|dinner|stay|airbnb|gateway town|spots?)\b/i.test(
      userMessage
    )
  ) {
    return false;
  }
  if (/\b(vs\.?|versus)\b/i.test(userMessage)) return false;

  return (
    /\b(best|which|top|recommend|suggest|ideas? for)\b/i.test(userMessage) &&
    (/\b(national\s+)?parks?\b/i.test(userMessage) ||
      /\b(visit|getaway|vibes?)\b/i.test(userMessage) ||
      /\b(couples?|families|first[- ]?timers|photography)\b/i.test(userMessage))
  );
}

function isPermitOrReservationQuery(userMessage) {
  if (!userMessage) return false;
  return /\b(permit|reservation|lottery|timed[- ]?entry|pass required)\b/i.test(userMessage);
}

/**
 * Guest signup CTA — only for live-web logistics (hotels, restaurants, roads).
 * Not for park discovery, compare, permits, or NPS-only questions.
 * @returns {{ append: boolean, variant?: 'local'|'road'|'trail'|'conditions' }}
 */
function shouldAppendAnonymousWebSearchUpsell(userMessage) {
  if (!userMessage) return { append: false };

  if (isItineraryPlanningQuery(userMessage)) {
    return { append: false };
  }

  if (isOpenEndedParkDiscoveryQuery(userMessage)) {
    return { append: false };
  }

  if (isPermitOrReservationQuery(userMessage)) {
    return { append: false };
  }

  const category = classifyQuery(userMessage);

  if (category === 'local-business') return { append: true, variant: 'local' };
  if (category === 'road-conditions') return { append: true, variant: 'road' };
  if (category === 'trail-conditions') return { append: true, variant: 'trail' };
  if (category === 'wildfire-smoke') return { append: true, variant: 'conditions' };

  return { append: false };
}

/**
 * Determine if weather facts are needed based on user message
 * @param {string} userMessage - The user's message
 * @returns {boolean} Whether weather facts should be fetched
 */
function needsWeatherFacts(userMessage) {
  // Always fetch weather when we have coordinates — it's essential context
  // for any park-related query (trip planning, packing, timing, etc.)
  return true;
}

/**
 * Determine if NPS facts are needed based on user message
 * @param {string} userMessage - The user's message
 * @returns {boolean} Whether NPS facts should be fetched
 */
function needsNPSFacts(userMessage) {
  // Always fetch NPS data when we have a parkCode — users benefit from
  // current conditions regardless of the specific question asked
  return true;
}

/**
 * Main function to fetch all relevant facts
 * @param {Object} params - { userMessage, parkCode, lat, lon, parkName, isAnonymous, tripDates }
 * @returns {Promise<Object>} { weatherFacts, npsFacts, webSearchFacts }
 */
async function fetchRelevantFacts({
  userMessage,
  parkCode,
  lat,
  lon,
  parkName,
  isAnonymous = false,
  tripDates = null,
}) {
  const results = {
    weatherFacts: null,
    npsFacts: null,
    webSearchFacts: null,
    feeFreeFacts: null,
    webSearchAttempted: false,
    webSearchUnavailable: false,
  };

  try {
    // Coordinate fallback: if we have a parkCode but no lat/lon, look up from parkExtractor
    if (parkCode && (!lat || !lon)) {
      const { PARK_NAME_TO_CODE } = require('../utils/parkExtractor');
      for (const [, entry] of PARK_NAME_TO_CODE) {
        if (entry.code === parkCode) {
          lat = lat || entry.lat;
          lon = lon || entry.lon;
          break;
        }
      }

      // Secondary fallback: dynamic map may have provided a parkCode that isn't
      // in the hardcoded map — fetch coordinates from NPS API directly
      if (!lat || !lon) {
        try {
          const npsService = require('./npsService');
          const parkDetails = await npsService.getParkByCode(parkCode);
          if (parkDetails) {
            lat = lat || parseFloat(parkDetails.latitude);
            lon = lon || parseFloat(parkDetails.longitude);
          }
        } catch (coordErr) {
          console.warn(`[Facts] Coordinate lookup failed for ${parkCode}: ${coordErr.message}`);
        }
      }
    }

    // Check for fee-free day overlap (sync, no API call)
    results.feeFreeFacts = getFeeFreeInfo(userMessage, tripDates);

    // Determine what facts to fetch
    const shouldFetchWeather = needsWeatherFacts(userMessage) && lat && lon;
    const shouldFetchNPS = needsNPSFacts(userMessage) && parkCode;
    // Skip web search for anonymous users — it's a signup incentive
    const shouldFetchWeb = !isAnonymous && needsWebSearch(userMessage, { parkCode });
    const shouldCheckFeeFree = !!userMessage;

    const fetchStartedAt = new Date().toISOString();

    console.log('[Facts] Fetching facts:', { shouldFetchWeather, shouldFetchNPS, shouldFetchWeb, hasFeeFree: !!results.feeFreeFacts, userMessage: userMessage?.substring(0, 50) });

    // Fetch facts in parallel if needed
    const promises = [];

    if (shouldFetchWeather) {
      promises.push(
        fetchWeatherForTrailie({
          lat,
          lon,
          tripDates,
          userMessage,
          locationName: parkName || 'this area',
          parkCode,
        })
          .then(({ text, meta }) => {
            results.weatherFacts = text;
            results.weatherMeta = meta;
          })
          .catch((err) => {
            console.error('[Facts] Weather fetch error:', err.message);
            results.weatherFacts = null;
            results.weatherMeta = null;
          })
      );
    }

    if (shouldFetchNPS) {
      promises.push(
        fetchNPSFacts({ parkCode, parkName, userMessage }).then(facts => { results.npsFacts = facts; }).catch(err => {
          console.error('[Facts] NPS fetch error:', err.message);
          results.npsFacts = null;
        })
      );
    }

    if (shouldFetchWeb) {
      results.webSearchAttempted = true;
      promises.push(
        fetchWebSearchFacts({ userMessage, parkName, parkCode })
          .then((facts) => {
            results.webSearchFacts = facts;
          })
          .catch((err) => {
            console.error('[Facts] Web search error:', err.message);
            results.webSearchFacts = null;
          })
      );
    }

    // Wait for all fact fetching to complete
    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }

    if (results.webSearchAttempted && !results.webSearchFacts) {
      results.webSearchUnavailable = true;
      console.warn('[Facts] Web search was needed but returned no results (timeout, empty, or API keys missing)');
    }

    const fetchedAt = new Date().toISOString();
    results.factsMeta = {
      weather: createFactSlotMeta(shouldFetchWeather, results.weatherFacts, {
        source: results.weatherMeta?.source || 'OpenWeather',
        fetchedAt: results.weatherFacts ? fetchedAt : null,
        mode: results.weatherMeta?.mode || null,
      }),
      nps: createFactSlotMeta(shouldFetchNPS, results.npsFacts, {
        source: 'NPS',
        fetchedAt: results.npsFacts ? fetchedAt : null,
      }),
      webSearch: shouldFetchWeb
        ? createFactSlotMeta(true, results.webSearchFacts, {
            source: 'Brave|Serper|Tavily',
            fetchedAt: results.webSearchFacts ? fetchedAt : null,
            reason: results.webSearchFacts
              ? null
              : results.webSearchUnavailable
                ? 'web_search_unavailable'
                : 'no_results',
          })
        : createFactSlotMeta(false, null, {
            reason: isAnonymous ? 'guest_account_web_search_disabled' : null,
          }),
      feeFree: createFactSlotMeta(shouldCheckFeeFree, results.feeFreeFacts, {
        source: 'feeFreeDaysService',
        fetchedAt: results.feeFreeFacts ? fetchStartedAt : null,
      }),
    };

    console.log('[Facts] Results:', {
      hasWeather: !!results.weatherFacts,
      hasNPS: !!results.npsFacts,
      hasWebSearch: !!results.webSearchFacts,
      webSearchUnavailable: results.webSearchUnavailable,
      hasFeeFree: !!results.feeFreeFacts,
    });
    return results;
  } catch (error) {
    console.error('[Facts] fetchRelevantFacts error:', error.message);
    return results; // Return empty results on error
  }
}

// ── Candidate Parks (Fix A) ──

const { CITIES } = require('../utils/cityCoordinates');

/**
 * Haversine distance in miles between two lat/lon points
 */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth radius in miles
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Extract a US city from the user's message.
 * Looks for patterns like "from Chicago", "near Denver", "live in Boston", etc.
 * Multi-word city names are checked first (longest match wins).
 * Returns { name, lat, lon } or null.
 */
function extractUserCity(userMessage) {
  if (!userMessage) return null;
  const msg = userMessage.toLowerCase();

  // Patterns that indicate a departure/home city
  const cityPatterns = [
    /\b(?:from|near|around|leaving|departing|starting\s+(?:from|in)|live\s+in|based\s+in|located\s+in|currently\s+in|coming\s+from|driving\s+from|flying\s+from|i'?m\s+in|i\s+am\s+in)\s+(.+?)(?:\s+area)?(?:[.,!?]|$)/gi,
    /\b(?:in\s+the)\s+(.+?)\s+area\b/gi,
  ];

  // Collect all candidate strings from regex matches
  const candidates = [];
  for (const pattern of cityPatterns) {
    let match;
    while ((match = pattern.exec(msg)) !== null) {
      candidates.push(match[1].trim());
    }
  }

  if (candidates.length === 0) return null;

  // Sort city dictionary keys by length descending (longest match first)
  const sortedCityKeys = Object.keys(CITIES).sort((a, b) => b.length - a.length);

  for (const candidate of candidates) {
    // Try to match against known cities — longest match first
    for (const cityKey of sortedCityKeys) {
      if (candidate.startsWith(cityKey) || candidate === cityKey) {
        const city = CITIES[cityKey];
        // Capitalize for display
        const displayName = cityKey.replace(/\b\w/g, c => c.toUpperCase());
        return { name: displayName, lat: city.lat, lon: city.lon, state: city.state };
      }
    }
  }

  return null;
}

/**
 * Get candidate NPS parks, optionally filtered by distance from a user city.
 * Returns tiered results (close/medium/far) when a city is detected,
 * or all candidates when no city is detected.
 */
async function getCandidateParks(userCity) {
  const npsService = require('./npsService');
  const allParks = await npsService.getAllParks();

  const relevantDesignations = [
    'National Park', 'National Park & Preserve',
    'National Seashore', 'National Lakeshore',
    'National Recreation Area', 'National Monument',
    'National Monument & Preserve',
  ];

  let candidates = allParks
    .filter(p => relevantDesignations.some(d =>
      (p.designation || '').toLowerCase() === d.toLowerCase()
    ))
    .map(p => ({
      name: p.fullName, code: p.parkCode, state: p.states,
      designation: p.designation,
      lat: parseFloat(p.latitude), lon: parseFloat(p.longitude),
    }))
    .filter(p => !isNaN(p.lat) && !isNaN(p.lon));

  if (userCity) {
    // Haversine distance, sorted by proximity
    candidates = candidates.map(p => ({
      ...p,
      distMi: Math.round(haversine(userCity.lat, userCity.lon, p.lat, p.lon)),
    }));
    candidates.sort((a, b) => a.distMi - b.distMi);

    const close = candidates.filter(p => p.distMi < 250);   // ~4hr drive
    const medium = candidates.filter(p => p.distMi >= 250 && p.distMi < 450); // ~7hr
    const far = candidates.filter(p => p.distMi >= 450 && p.distMi < 650);    // ~10hr
    return { close, medium, far, userCity: userCity.name };
  }

  // No city detected — return all candidates (ai.js will curate for prompt)
  return { all: candidates, userCity: null };
}

/**
 * Format candidate parks into a prompt block.
 * With a city: tiered by drive time. Without: grouped by region.
 */
function formatCandidateParksBlock(candidateResult) {
  if (!candidateResult) return '';

  const formatPark = (p) => {
    const shortDesig = (p.designation || '')
      .replace('National Park & Preserve', 'NP&P')
      .replace('National Park', 'NP')
      .replace('National Seashore', 'NS')
      .replace('National Lakeshore', 'NL')
      .replace('National Recreation Area', 'NRA')
      .replace('National Monument & Preserve', 'NM&P')
      .replace('National Monument', 'NM');
    const dist = p.distMi ? ` (~${p.distMi}mi)` : '';
    return `- ${p.name} [${shortDesig}] (${p.state}) — ${p.code}${dist}`;
  };

  if (candidateResult.userCity) {
    const { close, medium, far, userCity } = candidateResult;
    if (close.length === 0 && medium.length === 0 && far.length === 0) return '';

    let block = `\n--- CANDIDATE PARKS NEAR ${userCity.toUpperCase()} ---`;
    block += `\nChoose from these NPS sites when suggesting parks. Includes National Parks, Seashores, Lakeshores, Recreation Areas, and Monuments — NOT just the 63 National Parks. Sorted by approximate distance from user's location.`;
    block += `\nIMPORTANT: You MUST suggest at least 2-3 parks from this list, not just one. Include variety — different designations (NP, NL, NS, NRA) and different distance tiers when possible. Even if one park is the top pick, briefly mention 1-2 alternatives so the user has options.\n`;

    // Cap per tier to keep prompt under ~500 tokens
    if (close.length > 0) {
      block += `\nWITHIN ~4 HOURS:\n${close.slice(0, 8).map(formatPark).join('\n')}\n`;
    }
    if (medium.length > 0) {
      block += `\n~4-7 HOURS:\n${medium.slice(0, 6).map(formatPark).join('\n')}\n`;
    }
    if (far.length > 0) {
      block += `\n~7-10 HOURS:\n${far.slice(0, 4).map(formatPark).join('\n')}\n`;
    }
    block += `--- END CANDIDATE PARKS ---\n`;
    return block;
  }

  // No city — curate a representative list grouped by region
  const all = candidateResult.all || [];
  if (all.length === 0) return '';

  // Assign regions based on longitude/latitude
  const regionize = (p) => {
    if (p.state?.includes('AK')) return 'ALASKA';
    if (p.state?.includes('HI')) return 'HAWAII';
    if (p.lon < -115) return 'PACIFIC';
    if (p.lon < -104) return 'MOUNTAIN WEST';
    if (p.lon < -95 && p.lat > 40) return 'MIDWEST';
    if (p.lon < -95 && p.lat <= 40) return 'SOUTHWEST';
    if (p.lat > 39) return 'NORTHEAST';
    return 'SOUTHEAST';
  };

  const regionGroups = {};
  for (const p of all) {
    const region = regionize(p);
    if (!regionGroups[region]) regionGroups[region] = [];
    regionGroups[region].push(p);
  }

  // Curate: up to 6 per region, ensuring designation diversity
  const regionOrder = ['NORTHEAST', 'SOUTHEAST', 'MIDWEST', 'SOUTHWEST', 'MOUNTAIN WEST', 'PACIFIC', 'ALASKA', 'HAWAII'];
  let block = `\n--- CANDIDATE PARKS (from NPS database) ---`;
  block += `\nWhen suggesting parks, choose from this representative list of NPS sites.`;
  block += `\nThis includes National Parks, Seashores, Lakeshores, Recreation Areas, and Monuments — do NOT limit recommendations to just the 63 National Parks.`;
  block += `\nIMPORTANT: Suggest at least 2-3 parks from this list with variety in designations and regions. Even if one is the top pick, mention 1-2 alternatives.\n`;

  for (const region of regionOrder) {
    const parks = regionGroups[region];
    if (!parks || parks.length === 0) continue;

    // Ensure designation diversity: pick NPs first, then non-NP designations
    const nps = parks.filter(p => (p.designation || '').includes('National Park'));
    const nonNps = parks.filter(p => !(p.designation || '').includes('National Park'));
    const curated = [...nps.slice(0, 3), ...nonNps.slice(0, 3)].slice(0, 6);

    block += `\n${region}:\n${curated.map(formatPark).join('\n')}\n`;
  }

  block += `--- END CANDIDATE PARKS ---\n`;
  return block;
}

module.exports = {
  fetchWeatherFacts,
  fetchWeatherForTrailie,
  fetchNPSFacts,
  fetchWebSearchFacts,
  fetchRelevantFacts,
  needsWeatherFacts,
  needsNPSFacts,
  needsWebSearch,
  hasExplicitNonNpsDestinationSignal,
  shouldAppendAnonymousWebSearchUpsell,
  isTravelRelated,
  classifyQuery,
  resolveSearchCategory,
  extractUserCity,
  getCandidateParks,
  formatCandidateParksBlock,
  formatWebResults,
};
