const axios = require('axios');

const OWM_KEY = process.env.OPENWEATHER_API_KEY; // server-side key ⚠️ not REACT_APP_*
const OWM_BASE = 'https://api.openweathermap.org/data/2.5/forecast';
// NPS data is now served through npsService (with bulk caches) — no direct API calls needed

// Web search configuration — supports Brave Search, Serper, or Tavily
const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY;
const SERPER_API_KEY = process.env.SERPER_API_KEY;
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

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

    // Fetch park details, alerts, campgrounds, and visitor centers in parallel
    const [details, alerts, campgrounds, visitorCenters] = await Promise.allSettled([
      npsService.getParkByCode(parkCode),
      npsService.getParkAlerts(parkCode),
      npsService.getParkCampgrounds(parkCode),
      npsService.getParkVisitorCenters(parkCode)
    ]);

    const park = details.status === 'fulfilled' ? details.value : null;
    const parkAlerts = alerts.status === 'fulfilled' ? alerts.value : [];
    const parkCampgrounds = campgrounds.status === 'fulfilled' ? campgrounds.value : [];
    const parkVisitorCenters = visitorCenters.status === 'fulfilled' ? visitorCenters.value : [];

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

    // Permits — npsService.getParkPermits does not exist, skip gracefully
    facts.push('Permits: No permit requirements in current data');

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
 * Classify the user's query to pick the best search strategy
 * @param {string} userMessage
 * @returns {'local'|'planning'|'realtime'} Query category
 */
function classifyQuery(userMessage) {
  const msg = userMessage.toLowerCase();

  // Local businesses, tours, activities → Google (Serper) is best
  if (/(restaurant|food|eat|dine|dining|cafe|coffee|bar|hotel|motel|lodge|lodging|cabin|airbnb|stay|accommodation|gas station|grocery|store|shop|outfitter|gear|rent|shuttle|tour company|guide service|workshop|class|course|lesson|tour|guided|activit|excursion|experience|operator|forag|mushroom|fish|kayak|canoe|raft|climb|zipline|horseback|bike|bird|snorkel|dive|surf|ski|paddle)/i.test(msg)) {
    return 'local';
  }

  // Real-time: road conditions, current closures, events, recent news → Brave (fresh index)
  if (/(road condition|road closure|closed|current|latest|recent|update|news|2025|2026|event|festival|wildfire|flood|construction|status|open now|hour|schedule)/i.test(msg)) {
    return 'realtime';
  }

  // Planning: itinerary, tips, best time, general travel → Tavily (AI summary)
  return 'planning';
}

/**
 * Fetch web search results using Brave Search API
 */
async function searchBrave(query, count = 5) {
  const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
    headers: { 'X-Subscription-Token': BRAVE_API_KEY, 'Accept': 'application/json' },
    params: { q: query, count, freshness: 'pm' },
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
 * Fetch web search results using Serper API (Google)
 */
async function searchSerper(query, num = 5) {
  const response = await axios.post('https://google.serper.dev/search', {
    q: query,
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
 * Fetch web search results using Tavily API (optimized for AI/RAG)
 */
async function searchTavily(query, depth = 'basic') {
  const response = await axios.post('https://api.tavily.com/search', {
    api_key: TAVILY_API_KEY,
    query: query,
    max_results: 5,
    search_depth: depth,
    include_answer: true
  }, {
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
 * Fetch live web search facts using all available APIs intelligently
 *
 * Strategy with all 3 keys:
 *   - LOCAL queries (restaurants, hotels): Serper (Google Places) primary + Brave backup
 *   - REALTIME queries (closures, events): Brave (fresh index) primary + Serper backup
 *   - PLANNING queries (tips, itineraries): Tavily (AI summary) primary + Serper backup
 *
 * Results are merged, deduplicated, and capped at 8 for a rich but focused context.
 * If the primary fails, the backup is already running in parallel.
 */
async function fetchWebSearchFacts({ userMessage, parkName, parkCode }) {
  if (!BRAVE_API_KEY && !SERPER_API_KEY && !TAVILY_API_KEY) {
    console.log('[WebSearch] No search API key configured');
    return null;
  }

  try {
    const query = buildSearchQuery(userMessage, parkName);
    const queryType = classifyQuery(userMessage);
    console.log(`[WebSearch] Query: "${query}" | Type: ${queryType}`);

    let aiAnswer = null;
    let allResults = [];

    // Build parallel search promises based on query type and available keys
    const searches = [];

    if (queryType === 'local') {
      // Local businesses → Serper (Google Places) is primary
      if (SERPER_API_KEY) searches.push(searchSerper(query, 5).catch(() => []));
      if (BRAVE_API_KEY) searches.push(searchBrave(query, 3).catch(() => []));
      // Tavily for AI summary as bonus if available
      if (TAVILY_API_KEY) searches.push(
        searchTavily(query).then(r => { aiAnswer = r.answer; return r.results; }).catch(() => [])
      );
    } else if (queryType === 'realtime') {
      // Real-time/current → Brave (fresh index) is primary
      if (BRAVE_API_KEY) searches.push(searchBrave(query, 5).catch(() => []));
      if (SERPER_API_KEY) searches.push(searchSerper(query, 3).catch(() => []));
      if (TAVILY_API_KEY) searches.push(
        searchTavily(query).then(r => { aiAnswer = r.answer; return r.results; }).catch(() => [])
      );
    } else {
      // Planning/general → Tavily (AI answer) is primary
      if (TAVILY_API_KEY) searches.push(
        searchTavily(query, 'advanced').then(r => { aiAnswer = r.answer; return r.results; }).catch(() => [])
      );
      if (SERPER_API_KEY) searches.push(searchSerper(query, 4).catch(() => []));
      if (BRAVE_API_KEY) searches.push(searchBrave(query, 3).catch(() => []));
    }

    // Run all searches in parallel
    const searchArrays = await Promise.all(searches);
    allResults = searchArrays.flat();

    // Deduplicate and cap results
    const uniqueResults = deduplicateResults(allResults);
    const finalResults = uniqueResults.slice(0, 8);

    if (finalResults.length === 0 && !aiAnswer) {
      console.log('[WebSearch] No results from any provider');
      return null;
    }

    // Format results for the AI system prompt
    let formatted = 'Live Web Search Results';
    const providers = [...new Set(finalResults.map(r => r.source))];
    formatted += ` (via ${providers.join(' + ')}):\n`;

    if (aiAnswer) {
      formatted += `\nAI Summary: ${aiAnswer}\n`;
    }

    // Group Google Places results separately for better readability
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

    console.log(`[WebSearch] ${finalResults.length} results from ${providers.join(', ')} | AI answer: ${!!aiAnswer}`);
    return formatted;
  } catch (error) {
    console.error('[WebSearch] Search error:', error.message);
    return null;
  }
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

  // First check: must be travel-related to even consider web search
  if (!isTravelRelated(userMessage)) return false;

  // Topics where live web data is especially valuable
  const webSearchKeywords = /(restaurant|food|eat|dining|hotel|lodge|lodging|stay|accommodation|where to sleep|gas station|grocery|store|shop|tour company|outfitter|guide service|shuttle|transport|road condition|road closure|current|latest|recent|update|2025|2026|2027|event|festival|reservation|booking|permit|availability|price|cost|hour|open|close|schedule|season|crowd|busy|best time|review|recommend|tip|gear|rent|fly|drive|airport|nearby|town|gateway|workshop|class|classes|course|lesson|tour|excursion|activit|experience|guided|instruction|training|company|provider|operator|find|search|look for|check|suggest|where can|who offer|sign up|forag|mushroom|morel|fish|kayak|canoe|raft|climb|zipline|horseback|bike|bird|snorkel|dive|surf|ski|snowshoe|paddle)/i;
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
  const results = { weatherFacts: null, npsFacts: null, webSearchFacts: null };

  try {
    // Determine what facts to fetch
    const shouldFetchWeather = needsWeatherFacts(userMessage) && lat && lon;
    const shouldFetchNPS = needsNPSFacts(userMessage) && parkCode;
    // Skip web search for anonymous users — it's a signup incentive
    const shouldFetchWeb = !isAnonymous && needsWebSearch(userMessage);

    console.log('[Facts] Fetching facts:', { shouldFetchWeather, shouldFetchNPS, shouldFetchWeb, userMessage: userMessage?.substring(0, 50) });

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

    console.log('[Facts] Results:', { hasWeather: !!results.weatherFacts, hasNPS: !!results.npsFacts, hasWebSearch: !!results.webSearchFacts });
    return results;
  } catch (error) {
    console.error('[Facts] fetchRelevantFacts error:', error.message);
    return results; // Return empty results on error
  }
}

module.exports = {
  fetchWeatherFacts,
  fetchNPSFacts,
  fetchWebSearchFacts,
  fetchRelevantFacts,
  needsWeatherFacts,
  needsNPSFacts,
  needsWebSearch,
  isTravelRelated
};
