const axios = require('axios');

const { getFeeFreeInfo } = require('./feeFreeDaysService');

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

  // LIVE — past-day freshness, authoritative domains
  'road-conditions':   { primary: 'brave',  domains: ['nps.gov', 'weather.gov'],                   freshness: 'pd', n: 3 },
  'wildfire-smoke':    { primary: 'brave',  domains: ['inciweb.nwcg.gov', 'nps.gov', 'airnow.gov'], freshness: 'pd', n: 3 },

  // RECENT — past-week freshness
  'trail-conditions':  { primary: 'brave',  domains: ['nps.gov', 'alltrails.com'],                 freshness: 'pw', n: 3 },
  'wildlife-seasonal': { primary: 'tavily', domains: ['nps.gov', 'nationalparkstraveler.org'],     freshness: 'pw', n: 3 },
  'events':            { primary: 'brave',  domains: [],                                            freshness: 'pw', n: 3 },

  // LOCAL — Serper Places, no freshness filter
  'local-business':    { primary: 'serper', domains: [],                                            freshness: null, n: 4 },

  // GENERAL — monthly freshness, open web
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

    return `Weather Forecast at ${location} (Next 3 Days):\n${forecastText}\n(From OpenWeather API - 5-day forecast)`;
  } catch (error) {
    console.error('Weather facts error:', error.message);
    return null;
  }
}

/**
 * Fetch NPS facts for a specific park
 * Uses npsService (with its caches) instead of direct API calls.
 * @param {Object} params - { parkCode }
 * @returns {Promise<string|null>} Formatted NPS facts or null
 */
async function fetchNPSFacts({ parkCode }) {
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

    // Alerts — split by category
    const closures = parkAlerts.filter(a => a.category === 'Closure').slice(0, 3);
    const cautions = parkAlerts.filter(a => a.category === 'Caution').slice(0, 3);
    const infos = parkAlerts.filter(a => a.category === 'Information').slice(0, 3);

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

    // Campgrounds
    if (parkCampgrounds.length > 0) {
      const cgLines = parkCampgrounds.slice(0, 3).map(cg => {
        const info = cg.reservationInfo || 'See recreation.gov';
        return `- ${cg.name}: ${info}`;
      }).join('\n');
      facts.push(`Campgrounds (${parkCampgrounds.length} total):\n${cgLines}`);
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

    // Permits & reservations — live data from Recreation.gov (RIDB)
    if (parkPermits.length > 0) {
      const permitLines = parkPermits.slice(0, 8).map(p => {
        const typeLabel = p.type ? ` [${p.type}]` : '';
        return `- ${p.name}${typeLabel}: ${p.reservationUrl}`;
      }).join('\n');
      facts.push(
        `Permits & Reservations Required (book directly on Recreation.gov — cite these URLs as markdown links when mentioning permits):\n${permitLines}`
      );
    } else {
      facts.push('Permits: No permit requirements found on Recreation.gov for this park');
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
  if (category === 'road-conditions' || category === 'wildfire-smoke') {
    if (!q.includes(String(year))) q = `${q} ${year}`;
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
function classifyQuery(userMessage) {
  const msg = userMessage.toLowerCase();

  // SKIP buckets — NPS/RIDB already provides authoritative data for these.
  // Checked first so specific topics don't leak into broader categories.
  if (/(permit|reservation|timed entry|lottery|campsite|campground|visitor center)/i.test(msg)) {
    return 'nps-covered';
  }
  if (/(history|founded|established|famous|known for|significance|when was)/i.test(msg)) {
    return 'history-facts';
  }

  // LIVE buckets — past-day freshness
  if (/(road condition|road closure|road open|road status|closed|open now|open today|open tomorrow|construction)/i.test(msg)) {
    return 'road-conditions';
  }
  if (/(wildfire|fire|smoke|air quality|haze|flood)/i.test(msg)) {
    return 'wildfire-smoke';
  }

  // RECENT buckets — past-week freshness
  if (/(trail condition|trail report|muddy|snow|washout|snowpack|icy)/i.test(msg)) {
    return 'trail-conditions';
  }
  if (/(wildflower|bloom|fall color|foliage|rut|migration|salmon run|northern lights|aurora|meteor|bird|fish|forag|mushroom)/i.test(msg)) {
    return 'wildlife-seasonal';
  }
  if (/(event|festival|ranger program)/i.test(msg)) {
    return 'events';
  }

  // LOCAL bucket — Serper Places, no freshness
  if (/(restaurant|food|eat|dine|dining|cafe|coffee|bar|hotel|motel|lodge|lodging|cabin|airbnb|stay|accommodation|gas station|grocery|store|shop|outfitter|gear|rent|shuttle|tour company|guide service|workshop|class|course|lesson|tour|guided|excursion|experience|operator|kayak|canoe|raft|climb|zipline|horseback|bike|snorkel|dive|surf|ski|paddle)/i.test(msg)) {
    return 'local-business';
  }

  // Default: general planning (monthly freshness, open web)
  return 'planning';
}

/**
 * Fetch web search results using Brave Search API.
 * @param {string} query
 * @param {Object} [options]
 * @param {number} [options.count=5]
 * @param {string|null} [options.freshness=null] - 'pd' | 'pw' | 'pm' | null
 * @param {string[]} [options.domains=[]] - site: allowlist appended to query
 */
async function searchBrave(query, { count = 5, freshness = null, domains = [] } = {}) {
  let q = query;
  if (domains.length) {
    q = `${q} (${domains.map(d => `site:${d}`).join(' OR ')})`;
  }
  const params = { q, count };
  if (freshness) params.freshness = freshness;

  const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
    headers: { 'X-Subscription-Token': BRAVE_API_KEY, 'Accept': 'application/json' },
    params,
    timeout: 5000
  });

  const results = response.data?.web?.results || [];
  return results.map(r => ({
    title: r.title,
    snippet: r.description,
    url: r.url,
    source: 'brave'
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
    include_answer: true
  };
  if (domains.length) body.include_domains = domains;

  const response = await axios.post('https://api.tavily.com/search', body, {
    timeout: 7000
  });

  const answer = response.data?.answer || null;
  const results = (response.data?.results || []).map(r => ({
    title: r.title,
    snippet: r.content?.substring(0, 250),
    url: r.url,
    source: 'tavily',
    score: r.score || 0
  }));

  return { answer, results };
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
 *   - PLANNING queries (tips, itineraries): Tavily (AI summary) primary
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

  const category = classifyQuery(userMessage);
  const strategy = STRATEGY[category];

  // SKIP buckets — authoritative NPS/RIDB data already in the prompt.
  if (strategy.skip) {
    console.log(`[WebSearch] SKIP | category=${category} (covered by NPS/RIDB)`);
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
        run: () => searchBrave(query, { count: n, freshness, domains }).then(r => ({ results: r, aiAnswer: null }))
      };
    }
    if (name === 'serper' && SERPER_API_KEY) {
      return {
        name: 'serper',
        run: () => searchSerper(query, { num: n, domains }).then(r => ({ results: r, aiAnswer: null }))
      };
    }
    if (name === 'tavily' && TAVILY_API_KEY) {
      return {
        name: 'tavily',
        run: () => searchTavily(query, { count: n, domains }).then(r => ({ results: r.results, aiAnswer: r.answer }))
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

  let aiAnswer = null;
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
    if (pRes.value.aiAnswer) aiAnswer = pRes.value.aiAnswer;
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
        if (!aiAnswer && result.value.aiAnswer) aiAnswer = result.value.aiAnswer;
      }
    }
  }

  // Dedup and cap. 4 top results is plenty for the system prompt.
  const uniqueResults = deduplicateResults(allResults);
  const finalResults = uniqueResults.slice(0, 4);

  console.log(
    `[WebSearch] done | category=${category} final=${finalResults.length} hasAnswer=${!!aiAnswer} ` +
    `providers=${telemetry.map(t => `${t.provider}${t.primary ? '*' : ''}:${t.timedOut ? 'TO' : t.n}@${t.ms}ms`).join(' ')}`
  );

  if (finalResults.length === 0 && !aiAnswer) {
    // Don't cache total failures — let the next call retry.
    return null;
  }

  const formatted = formatWebResults(finalResults, aiAnswer, category);
  webSearchCache.set(cacheKey, formatted);
  return formatted;
}

/**
 * Format web search results for injection into the AI system prompt.
 * Groups Google Places separately for local-business readability.
 */
function formatWebResults(finalResults, aiAnswer, category) {
  let formatted = `Live Web Search Results (category: ${category})`;
  const providerList = [...new Set(finalResults.map(r => r.source))];
  if (providerList.length) {
    formatted += ` via ${providerList.join(' + ')}`;
  }
  formatted += ':\n';

  if (aiAnswer) {
    formatted += `\nAI Summary: ${aiAnswer}\n`;
  }

  const places = finalResults.filter(r => r.source === 'google-places');
  const webResults = finalResults.filter(r => r.source !== 'google-places');

  if (places.length > 0) {
    formatted += '\nNearby Places:\n';
    formatted += places.map(p => `- ${p.title}: ${p.snippet}`).join('\n');
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
  return formatted;
}

/**
 * Determine if a message is travel/park related
 * @param {string} userMessage - The user's message
 * @returns {boolean} Whether the message is about travel or parks
 */
function isTravelRelated(userMessage) {
  if (!userMessage) return false;

  // Non-travel topics to reject — don't waste search API calls
  const offTopicPatterns = /(write me|code|program|script|debug|compile|math|equation|calculate|homework|essay|summarize this article|translate|recipe|cook|stock|invest|crypto|bitcoin|medical|diagnos|symptom|legal advice|lawsuit|politics|election|celebrity|gossip|joke|riddle|poem|story|fiction|game|minecraft|fortnite|anime|movie review|song lyric)/i;
  if (offTopicPatterns.test(userMessage)) return false;

  // Travel/outdoor/park related topics — green light
  const travelPatterns = /(park|trail|hike|camp|visit|trip|travel|itinerary|road trip|drive|fly|airport|hotel|lodge|cabin|tent|backpack|scenic|viewpoint|overlook|canyon|mountain|lake|river|waterfall|beach|forest|desert|glacier|wildlife|bear|elk|sunrise|sunset|star|astrophotography|photograph|permit|reservation|entry|fee|ranger|visitor center|campground|trailhead|shuttle|gear|boot|pack|map|route|weather|season|crowd|busy|quiet|shoulder|gateway|town|nearby|restaurant|food|eat|dine|picnic|national|state park|wilderness|outdoor|adventure|explore|nature|forag|mushroom|morel|workshop|class|course|lesson|tour|excursion|activit|experience|fish|kayak|canoe|raft|climb|rappel|zipline|horseback|bike|cycling|bird|birding|snorkel|dive|surf|ski|snowshoe|swim|paddle|guided|instruction)/i;
  return travelPatterns.test(userMessage);
}

/**
 * Determine if web search would benefit the user's question
 * @param {string} userMessage - The user's message
 * @returns {boolean} Whether web search should be performed
 */
function needsWebSearch(userMessage) {
  if (!userMessage) return false;

  // Trust the classifier: if it identifies any specific category (road, wildfire,
  // trail, wildlife, events, local-business, or the SKIP buckets), it's clearly a
  // travel/park-related query. SKIP buckets still short-circuit inside
  // fetchWebSearchFacts, so this just ensures we don't reject good queries at the gate.
  const category = classifyQuery(userMessage);
  if (category !== 'planning') return true;

  // Generic "planning" default — apply the old safety gates to reject off-topic queries
  if (!isTravelRelated(userMessage)) return false;

  // Topics where live web data is especially valuable
  const webSearchKeywords = /(restaurant|food|eat|dining|hotel|lodge|lodging|stay|accommodation|where to sleep|gas station|grocery|store|shop|tour company|outfitter|guide service|shuttle|transport|road condition|road closure|current|latest|recent|update|2025|2026|2027|event|festival|reservation|booking|permit|availability|price|cost|hour|open|close|schedule|season|crowd|busy|best time|review|recommend|tip|gear|rent|fly|drive|airport|nearby|town|gateway|workshop|class|classes|course|lesson|tour|excursion|activit|experience|guided|instruction|training|company|provider|operator|find|search|look for|check|suggest|where can|who offer|sign up|forag|mushroom|morel|fish|kayak|canoe|raft|climb|zipline|horseback|bike|bird|snorkel|dive|surf|ski|snowshoe|paddle|memorial day|labor day|independence day|july 4|4th of july|fourth of july|veterans day|holiday weekend|long weekend|weekend trip|when to visit|when to go|fee.free|entrance fee|free entrance|spring break|summer vacation|fall foliage|winter trip|shoulder season|family vacation|road trip|which park|what park|compare park)/i;
  return webSearchKeywords.test(userMessage);
}

/**
 * Determine if weather facts are needed based on user message
 * @param {string} userMessage - The user's message
 * @returns {boolean} Whether weather facts should be fetched
 */
function needsWeatherFacts(userMessage) {
  const weatherKeywords = /(weather|forecast|temperature|rain|snow|wind|sunny|cloud|storm|hot|cold|precipitation|humidity|climate)/i;
  return weatherKeywords.test(userMessage);
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
 * @param {Object} params - { userMessage, parkCode, lat, lon, parkName, isAnonymous }
 * @returns {Promise<Object>} { weatherFacts, npsFacts, webSearchFacts }
 */
async function fetchRelevantFacts({ userMessage, parkCode, lat, lon, parkName, isAnonymous = false }) {
  const results = { weatherFacts: null, npsFacts: null, webSearchFacts: null, feeFreeFacts: null };

  try {
    // Check for fee-free day overlap (sync, no API call)
    results.feeFreeFacts = getFeeFreeInfo(userMessage);

    // Determine what facts to fetch
    const shouldFetchWeather = needsWeatherFacts(userMessage) && lat && lon;
    const shouldFetchNPS = needsNPSFacts(userMessage) && parkCode;
    // Skip web search for anonymous users — it's a signup incentive
    const shouldFetchWeb = !isAnonymous && needsWebSearch(userMessage);

    console.log('[Facts] Fetching facts:', { shouldFetchWeather, shouldFetchNPS, shouldFetchWeb, hasFeeFree: !!results.feeFreeFacts, userMessage: userMessage?.substring(0, 50) });

    // Fetch facts in parallel if needed
    const promises = [];

    if (shouldFetchWeather) {
      promises.push(
        fetchWeatherFacts({ lat, lon }).then(facts => { results.weatherFacts = facts; }).catch(err => {
          console.error('[Facts] Weather fetch error:', err.message);
          results.weatherFacts = null;
        })
      );
    }

    if (shouldFetchNPS) {
      promises.push(
        fetchNPSFacts({ parkCode }).then(facts => { results.npsFacts = facts; }).catch(err => {
          console.error('[Facts] NPS fetch error:', err.message);
          results.npsFacts = null;
        })
      );
    }

    if (shouldFetchWeb) {
      promises.push(
        fetchWebSearchFacts({ userMessage, parkName, parkCode }).then(facts => { results.webSearchFacts = facts; }).catch(err => {
          console.error('[Facts] Web search error:', err.message);
          results.webSearchFacts = null;
        })
      );
    }

    // Wait for all fact fetching to complete
    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }

    console.log('[Facts] Results:', { hasWeather: !!results.weatherFacts, hasNPS: !!results.npsFacts, hasWebSearch: !!results.webSearchFacts, hasFeeFree: !!results.feeFreeFacts });
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
  fetchNPSFacts,
  fetchWebSearchFacts,
  fetchRelevantFacts,
  needsWeatherFacts,
  needsNPSFacts,
  needsWebSearch,
  isTravelRelated,
  extractUserCity,
  getCandidateParks,
  formatCandidateParksBlock,
};
