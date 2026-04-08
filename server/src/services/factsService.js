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
 * Fetch web search results using Brave Search API
 */
async function searchBrave(query) {
  const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
    headers: { 'X-Subscription-Token': BRAVE_API_KEY, 'Accept': 'application/json' },
    params: { q: query, count: 5, freshness: 'py' },
    timeout: 5000
  });

  const results = response.data?.web?.results || [];
  return results.map(r => ({
    title: r.title,
    snippet: r.description,
    url: r.url
  }));
}

/**
 * Fetch web search results using Serper API
 */
async function searchSerper(query) {
  const response = await axios.post('https://google.serper.dev/search', {
    q: query,
    num: 5
  }, {
    headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
    timeout: 5000
  });

  const results = response.data?.organic || [];
  return results.map(r => ({
    title: r.title,
    snippet: r.snippet,
    url: r.link
  }));
}

/**
 * Fetch web search results using Tavily API (optimized for AI/RAG)
 */
async function searchTavily(query) {
  const response = await axios.post('https://api.tavily.com/search', {
    api_key: TAVILY_API_KEY,
    query: query,
    max_results: 5,
    search_depth: 'basic',
    include_answer: true
  }, {
    timeout: 5000
  });

  const answer = response.data?.answer || null;
  const results = (response.data?.results || []).map(r => ({
    title: r.title,
    snippet: r.content?.substring(0, 200),
    url: r.url
  }));

  return { answer, results };
}

/**
 * Fetch live web search facts for a user query
 * Uses whichever search API key is configured (Brave > Serper > Tavily)
 * @param {Object} params - { userMessage, parkName, parkCode }
 * @returns {Promise<string|null>} Formatted web search results or null
 */
async function fetchWebSearchFacts({ userMessage, parkName, parkCode }) {
  // Check if any search API is configured
  if (!BRAVE_API_KEY && !SERPER_API_KEY && !TAVILY_API_KEY) {
    console.log('[WebSearch] No search API key configured (set BRAVE_SEARCH_API_KEY, SERPER_API_KEY, or TAVILY_API_KEY)');
    return null;
  }

  try {
    const query = buildSearchQuery(userMessage, parkName);
    console.log(`[WebSearch] Searching: "${query}"`);

    let searchResults = [];
    let aiAnswer = null;

    // Try providers in order of preference
    if (TAVILY_API_KEY) {
      const tavResult = await searchTavily(query);
      searchResults = tavResult.results;
      aiAnswer = tavResult.answer;
    } else if (BRAVE_API_KEY) {
      searchResults = await searchBrave(query);
    } else if (SERPER_API_KEY) {
      searchResults = await searchSerper(query);
    }

    if (searchResults.length === 0 && !aiAnswer) {
      console.log('[WebSearch] No results found');
      return null;
    }

    // Format results for the AI system prompt
    let formatted = 'Live Web Search Results:\n';

    if (aiAnswer) {
      formatted += `Summary: ${aiAnswer}\n\n`;
    }

    formatted += searchResults
      .filter(r => r.title && r.snippet)
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.url}`)
      .join('\n\n');

    formatted += '\n(From live web search — verify details with official sources)';

    console.log(`[WebSearch] Found ${searchResults.length} results`);
    return formatted;
  } catch (error) {
    console.error('[WebSearch] Search error:', error.message);
    return null;
  }
}

/**
 * Determine if web search would benefit the user's question
 * @param {string} userMessage - The user's message
 * @returns {boolean} Whether web search should be performed
 */
function needsWebSearch(userMessage) {
  if (!userMessage) return false;

  // Topics where live web data is especially valuable
  const webSearchKeywords = /(restaurant|food|eat|dining|hotel|lodge|lodging|stay|accommodation|where to sleep|gas station|grocery|store|shop|tour company|outfitter|guide service|shuttle|transport|road condition|road closure|current|latest|recent|update|2025|2026|event|festival|reservation|booking|permit|availability|price|cost|hour|open|close|schedule|season|crowd|busy|best time|review|recommend|tip|gear|rent|fly|drive|airport|nearby|town|gateway)/i;
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
 * @param {Object} params - { userMessage, parkCode, lat, lon, parkName }
 * @returns {Promise<Object>} { weatherFacts, npsFacts, webSearchFacts }
 */
async function fetchRelevantFacts({ userMessage, parkCode, lat, lon, parkName }) {
  const results = { weatherFacts: null, npsFacts: null, webSearchFacts: null };

  try {
    // Determine what facts to fetch
    const shouldFetchWeather = needsWeatherFacts(userMessage) && lat && lon;
    const shouldFetchNPS = needsNPSFacts(userMessage) && parkCode;
    const shouldFetchWeb = needsWebSearch(userMessage);

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
  needsWebSearch
};
