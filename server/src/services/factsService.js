const axios = require('axios');

const OWM_KEY = process.env.OPENWEATHER_API_KEY; // server-side key ⚠️ not REACT_APP_*
const OWM_BASE = 'https://api.openweathermap.org/data/2.5/forecast';
const NPS_API_BASE = 'https://developer.nps.gov/api/v1';
const NPS_KEY = process.env.NPS_API_KEY;

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
 * @param {Object} params - { parkCode }
 * @returns {Promise<string|null>} Formatted NPS facts or null
 */
async function fetchNPSFacts({ parkCode }) {
  if (!parkCode || !NPS_KEY) {
    console.log('⚠️ NPS facts skipped: missing parkCode or API key');
    return null;
  }

  try {
    const npsApi = axios.create({
      baseURL: NPS_API_BASE,
      params: { api_key: NPS_KEY },
      timeout: 5000
    });

    // Fetch park details and alerts in parallel
    const [detailsRes, alertsRes] = await Promise.allSettled([
      npsApi.get('/parks', { params: { parkCode } }),
      npsApi.get('/alerts', { params: { parkCode } })
    ]);

    const details = detailsRes.status === 'fulfilled' ? detailsRes.value.data.data[0] : null;
    const alerts = alertsRes.status === 'fulfilled' ? alertsRes.value.data.data : [];

    if (!details) {
      console.log(`⚠️ No park details found for ${parkCode}`);
      return null;
    }

    const facts = [];

    // Add park highlights (activities, things to do)
    if (details.activities && details.activities.length > 0) {
      const topActivities = details.activities
        .slice(0, 5)
        .map(a => `- ${a.name}`)
        .join('\n');
      facts.push(`Highlights:\n${topActivities}`);
    }

    // Add active alerts
    const activeAlerts = alerts
      .filter(alert => alert.category && ['Information', 'Caution', 'Closure'].includes(alert.category))
      .slice(0, 3)
      .map(a => `- ${a.title}${a.category ? ` (${a.category})` : ''}`)
      .join('\n');

    if (activeAlerts) {
      facts.push(`Active Alerts:\n${activeAlerts}`);
    } else {
      facts.push('Active Alerts:\nNone reported');
    }

    return facts.filter(Boolean).join('\n\n');
  } catch (error) {
    console.error('NPS facts error:', error.message);
    return null;
  }
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
  const npsKeywords = /(alerts|closures|permits|trails|activities|highlights|campgrounds|visitor center|ranger|events|weather|forecast|climate)/i;
  return npsKeywords.test(userMessage);
}

/**
 * Main function to fetch all relevant facts
 * @param {Object} params - { userMessage, parkCode, lat, lon, parkName }
 * @returns {Promise<Object>} { weatherFacts, npsFacts }
 */
async function fetchRelevantFacts({ userMessage, parkCode, lat, lon, parkName }) {
  const results = { weatherFacts: null, npsFacts: null };

  try {
    // Determine what facts to fetch
    const shouldFetchWeather = needsWeatherFacts(userMessage) && lat && lon;
    const shouldFetchNPS = needsNPSFacts(userMessage) && parkCode;

    console.log('[Facts] Fetching facts:', { shouldFetchWeather, shouldFetchNPS, userMessage: userMessage?.substring(0, 50) });

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

    // Wait for all fact fetching to complete
    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }

    console.log('[Facts] Results:', { hasWeather: !!results.weatherFacts, hasNPS: !!results.npsFacts });
    return results;
  } catch (error) {
    console.error('[Facts] fetchRelevantFacts error:', error.message);
    return results; // Return empty results on error
  }
}

module.exports = {
  fetchWeatherFacts,
  fetchNPSFacts,
  fetchRelevantFacts,
  needsWeatherFacts,
  needsNPSFacts
};
