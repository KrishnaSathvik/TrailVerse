const axios = require('axios');
const npsService = require('./npsService');

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const OPENWEATHER_BASE = 'https://api.openweathermap.org/data/2.5';

class EnhancedParkService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
  }

  // Get cached data or fetch new data
  getCachedData(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  setCachedData(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  // Enhanced weather data with seasonal averages
  async getWeatherData(parkOrLocation) {
    const isPark = !!parkOrLocation.parkCode;
    const lat = parseFloat(parkOrLocation.latitude);
    const lon = parseFloat(parkOrLocation.longitude);
    const cacheKey = isPark
      ? `weather-${parkOrLocation.parkCode}`
      : `weather-${lat.toFixed(3)},${lon.toFixed(3)}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      console.log(`Using cached weather data for ${isPark ? parkOrLocation.parkCode : `${lat},${lon}`}`);
      return cached;
    }

    try {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error('Invalid coordinates');
      }

      console.log(`Fetching weather for ${isPark ? parkOrLocation.parkCode : 'location'} at ${lat}, ${lon}`);

      // Check if API key is available
      if (!OPENWEATHER_API_KEY) {
        throw new Error('OpenWeather API key not configured');
      }

      // Get current weather and forecast
      const [currentResponse, forecastResponse] = await Promise.all([
        axios.get(`${OPENWEATHER_BASE}/weather`, {
          params: {
            lat,
            lon,
            appid: OPENWEATHER_API_KEY,
            units: 'imperial'
          },
          timeout: 5000
        }),
        axios.get(`${OPENWEATHER_BASE}/forecast`, {
          params: {
            lat,
            lon,
            appid: OPENWEATHER_API_KEY,
            units: 'imperial'
          },
          timeout: 5000
        })
      ]);

      const current = currentResponse.data;
      const forecast = forecastResponse.data;

      // Calculate seasonal averages from forecast data
      const now = new Date();
      const currentMonth = now.getMonth();
      
      // Calculate realistic seasonal data based on latitude
      let seasonalData = this.calculateLatitudeBasedSeasons(lat);

      // If we have forecast data, calculate more accurate seasonal averages
      if (forecast && forecast.list) {
        const forecastSeasonalData = this.calculateSeasonalAverages(forecast.list, lat);
        // Merge with default seasonal data to ensure all seasons are present
        seasonalData = {
          summer: forecastSeasonalData.summer || seasonalData.summer,
          winter: forecastSeasonalData.winter || seasonalData.winter,
          spring: forecastSeasonalData.spring || seasonalData.spring,
          fall: forecastSeasonalData.fall || seasonalData.fall
        };
      }

      const weatherData = {
        current: {
          temperature: Math.round(current.main.temp),
          temp: Math.round(current.main.temp), // For UI compatibility
          condition: current.weather[0].description,
          humidity: current.main.humidity,
          windSpeed: Math.round(current.wind.speed),
          feelsLike: Math.round(current.main.feels_like),
          uvIndex: current.uvi || 0, // UV Index from OpenWeather API
          visibility: current.visibility ? Math.round(current.visibility / 1609.34) : 10 // Convert meters to miles
        },
        seasonal: seasonalData,
        lastUpdated: new Date().toISOString()
      };

      this.setCachedData(cacheKey, weatherData);
      return weatherData;

    } catch (error) {
      console.error(`Weather API Error for ${cacheKey}:`, error.message);
      
      // Only return fallback if coordinates are valid
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        console.log(`Using fallback weather data for ${cacheKey}`);
        return this.getFallbackWeatherData({ latitude: lat, longitude: lon });
      } else {
        // Re-throw error for invalid coordinates
        throw error;
      }
    }
  }

  // Calculate seasonal averages from forecast data
  calculateSeasonalAverages(forecastList, latitude) {
    const seasonalTemps = { spring: [], summer: [], fall: [], winter: [] };
    
    forecastList.forEach(item => {
      const date = new Date(item.dt * 1000);
      const month = date.getMonth();
      const temp = item.main.temp;
      
      // Northern hemisphere seasons (adjust for southern if needed)
      if (month >= 2 && month <= 4) seasonalTemps.spring.push(temp);
      else if (month >= 5 && month <= 7) seasonalTemps.summer.push(temp);
      else if (month >= 8 && month <= 10) seasonalTemps.fall.push(temp);
      else seasonalTemps.winter.push(temp);
    });

    const seasonalData = {};
    Object.keys(seasonalTemps).forEach(season => {
      const temps = seasonalTemps[season];
      if (temps.length > 0) {
        const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
        const min = Math.min(...temps);
        const max = Math.max(...temps);
        
        seasonalData[season] = {
          avg: Math.round(avg),
          low: Math.round(min),
          high: Math.round(max)
        };
      }
    });

    return seasonalData;
  }

  // Fallback weather data based on park location
  getFallbackWeatherData(parkOrLocation) {
    const lat = parseFloat(parkOrLocation.latitude);
    
    // More realistic latitude-based temperature estimation
    let baseTemp = 70; // Base temperature
    if (lat > 50) baseTemp = 45; // Far northern parks (Alaska, etc.)
    else if (lat > 45) baseTemp = 55; // Northern parks (Montana, etc.)
    else if (lat > 40) baseTemp = 65; // Mid-latitude parks
    else if (lat > 35) baseTemp = 75; // Southern mid-latitude
    else if (lat > 30) baseTemp = 80; // Southern parks
    else baseTemp = 85; // Very southern parks

    // Add some seasonal variation
    const month = new Date().getMonth();
    let seasonalAdjustment = 0;
    if (month >= 5 && month <= 7) seasonalAdjustment = 10; // Summer
    else if (month >= 11 || month <= 1) seasonalAdjustment = -15; // Winter
    else if (month >= 2 && month <= 4) seasonalAdjustment = 5; // Spring
    else seasonalAdjustment = -5; // Fall

    const adjustedTemp = Math.round(baseTemp + seasonalAdjustment);

    return {
      current: {
        temperature: adjustedTemp,
        temp: adjustedTemp, // For UI compatibility
        condition: 'Partly Cloudy',
        humidity: 60,
        windSpeed: 5,
        feelsLike: adjustedTemp,
        uvIndex: 4, // UV Index fallback
        visibility: 10
      },
      seasonal: {
        summer: { high: baseTemp + 15, low: baseTemp - 5, avg: baseTemp + 5 },
        winter: { high: baseTemp - 20, low: baseTemp - 40, avg: baseTemp - 30 },
        spring: { high: baseTemp + 5, low: baseTemp - 15, avg: baseTemp - 5 },
        fall: { high: baseTemp, low: baseTemp - 20, avg: baseTemp - 10 }
      },
      lastUpdated: new Date().toISOString(),
      source: 'fallback'
    };
  }

  // Calculate seasonal temperatures based on latitude
  calculateLatitudeBasedSeasons(latitude) {
    const lat = parseFloat(latitude);
    
    // Base seasonal temperatures that vary by latitude
    let summerBase = 75;
    let winterBase = 35;
    let springBase = 55;
    let fallBase = 50;
    
    // Adjust for latitude (northern parks are colder)
    if (lat > 45) {
      // Northern parks (like Alaska, Montana)
      summerBase = 65;
      winterBase = 15;
      springBase = 45;
      fallBase = 40;
    } else if (lat > 40) {
      // Mid-latitude parks (like Yellowstone, Acadia)
      summerBase = 70;
      winterBase = 25;
      springBase = 50;
      fallBase = 45;
    } else if (lat < 30) {
      // Southern parks (like Everglades, Big Bend)
      summerBase = 85;
      winterBase = 55;
      springBase = 70;
      fallBase = 65;
    }
    
    return {
      summer: { 
        high: summerBase + 10, 
        low: summerBase - 10, 
        avg: summerBase 
      },
      winter: { 
        high: winterBase + 8, 
        low: winterBase - 8, 
        avg: winterBase 
      },
      spring: { 
        high: springBase + 8, 
        low: springBase - 8, 
        avg: springBase 
      },
      fall: { 
        high: fallBase + 8, 
        low: fallBase - 8, 
        avg: fallBase 
      }
    };
  }

  // Enhanced crowd level prediction
  async getCrowdLevel(park, date = new Date()) {
    const cacheKey = `crowd-${park.parkCode}-${date.toDateString()}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    try {
      // Get additional data for better prediction
      const [alerts, events] = await Promise.all([
        npsService.getParkAlerts(park.parkCode).catch(() => []),
        this.getParkEvents(park.parkCode, date).catch(() => [])
      ]);

      const crowdLevel = this.calculateCrowdLevel(park, date, alerts, events);
      this.setCachedData(cacheKey, crowdLevel);
      return crowdLevel;

    } catch (error) {
      console.error(`Crowd prediction error for ${park.parkCode}:`, error.message);
      return this.getBasicCrowdLevel(park, date);
    }
  }

  // Advanced crowd level calculation
  calculateCrowdLevel(park, date, alerts, events) {
    const month = date.getMonth();
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = this.isHoliday(date);
    
    // Base level based on park designation and popularity
    let baseLevel = this.getBaseCrowdLevel(park);
    
    // Seasonal adjustments
    const seasonalMultiplier = this.getSeasonalMultiplier(month, park.latitude);
    baseLevel *= seasonalMultiplier;
    
    // Weekend adjustment
    if (isWeekend) baseLevel *= 1.3;
    
    // Holiday adjustment
    if (isHoliday) baseLevel *= 1.5;
    
    // Event adjustment
    if (events.length > 0) baseLevel *= 1.2;
    
    // Alert adjustment (closures reduce crowds)
    const hasClosures = alerts.some(alert => 
      alert.category === 'Information' && 
      alert.title.toLowerCase().includes('closure')
    );
    if (hasClosures) baseLevel *= 0.7;

    // Convert to crowd level
    const levels = ['Very Low', 'Low', 'Moderate', 'High', 'Very High'];
    let levelIndex = Math.min(Math.floor(baseLevel), levels.length - 1);
    
    // Ensure minimum level for popular parks
    if (park.designation === 'National Park' && levelIndex < 1) {
      levelIndex = 1; // At least Low for National Parks
    }

    return {
      level: levels[levelIndex],
      confidence: this.calculateConfidence(park, date, alerts.length, events.length),
      factors: {
        season: this.getSeasonName(month),
        weekend: isWeekend,
        holiday: isHoliday,
        events: events.length,
        alerts: alerts.length,
        hasClosures
      },
      lastUpdated: new Date().toISOString(),
      source: 'predictive_model'
    };
  }

  // Get base crowd level for park
  getBaseCrowdLevel(park) {
    // Vary base level based on park popularity and designation
    if (park.designation === 'National Park') {
      // Popular parks get higher base levels
      const popularParks = ['yell', 'grca', 'grte', 'yose', 'glac', 'zion', 'arch', 'brca'];
      return popularParks.includes(park.parkCode.toLowerCase()) ? 2.5 : 2.0;
    }
    if (park.designation === 'National Monument') return 1.8;
    if (park.designation === 'National Historic Site') return 1.5;
    return 1.2; // Other designations
  }

  // Get seasonal multiplier based on month and latitude
  getSeasonalMultiplier(month, latitude) {
    const lat = parseFloat(latitude);
    const isNorthern = lat > 30; // Northern hemisphere
    
    if (isNorthern) {
      // Northern hemisphere seasons - more variation
      if (month >= 5 && month <= 8) return 1.3; // Summer (peak season)
      if (month >= 3 && month <= 4) return 1.0; // Spring (shoulder season)
      if (month >= 9 && month <= 10) return 0.9; // Fall (shoulder season)
      return 0.5; // Winter (low season)
    } else {
      // Southern hemisphere (reverse seasons)
      if (month >= 11 || month <= 2) return 1.3; // Summer (peak season)
      if (month >= 8 && month <= 9) return 1.0; // Spring (shoulder season)
      if (month >= 3 && month <= 4) return 0.9; // Fall (shoulder season)
      return 0.5; // Winter (low season)
    }
  }

  // Check if date is a holiday
  isHoliday(date) {
    const holidays = [
      [0, 1],   // New Year's Day
      [6, 17],  // Martin Luther King Jr. Day (3rd Monday)
      [1, 15],  // Presidents' Day (3rd Monday)
      [4, 25],  // Memorial Day (last Monday)
      [6, 4],   // Independence Day
      [8, 0],   // Labor Day (1st Monday)
      [9, 8],   // Columbus Day (2nd Monday)
      [10, 11], // Veterans Day
      [10, 22], // Thanksgiving (4th Thursday)
      [11, 25]  // Christmas
    ];
    
    const month = date.getMonth();
    const day = date.getDate();
    
    return holidays.some(([hMonth, hDay]) => hMonth === month && hDay === day);
  }

  // Calculate confidence in crowd prediction
  calculateConfidence(park, date, alertCount, eventCount) {
    let confidence = 0.7; // Base confidence
    
    // More data = higher confidence
    if (alertCount > 0) confidence += 0.1;
    if (eventCount > 0) confidence += 0.1;
    
    // Popular parks have more predictable patterns
    if (park.designation === 'National Park') confidence += 0.1;
    
    return Math.min(confidence, 0.95);
  }

  // Get season name
  getSeasonName(month) {
    if (month >= 2 && month <= 4) return 'Spring';
    if (month >= 5 && month <= 7) return 'Summer';
    if (month >= 8 && month <= 10) return 'Fall';
    return 'Winter';
  }

  // Basic crowd level fallback
  getBasicCrowdLevel(park, date) {
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    let level = park.designation === 'National Park' ? 'High' : 'Moderate';
    
    if (isWeekend && level === 'Moderate') level = 'High';
    
    return {
      level,
      confidence: 0.5,
      factors: {
        season: this.getSeasonName(date.getMonth()),
        weekend: isWeekend,
        holiday: false,
        events: 0,
        alerts: 0,
        hasClosures: false
      },
      lastUpdated: new Date().toISOString(),
      source: 'basic_model'
    };
  }

  // Get park events for a specific date
  async getParkEvents(parkCode, date) {
    try {
      const events = await npsService.getEventsByPark(parkCode);
      const targetDate = date.toISOString().split('T')[0];
      
      return events.filter(event => {
        const eventDate = event.datestart || event.date;
        return eventDate && eventDate.startsWith(targetDate);
      });
    } catch (error) {
      return [];
    }
  }

  // Best time to visit prediction
  async getBestTimeToVisit(park) {
    const cacheKey = `best-time-${park.parkCode}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    try {
      const weatherData = await this.getWeatherData(park);
      const crowdData = await this.getCrowdLevel(park);
      
      // Analyze weather patterns to find optimal months
      const seasonalData = weatherData.seasonal;
      const optimalMonths = this.findOptimalMonths(seasonalData, park);
      
      const bestTime = {
        months: optimalMonths,
        reasons: this.getBestTimeReasons(optimalMonths, seasonalData, crowdData, park),
        crowdLevel: crowdData.level,
        weather: seasonalData,
        lastUpdated: new Date().toISOString()
      };

      this.setCachedData(cacheKey, bestTime);
      return bestTime;

    } catch (error) {
      console.error(`Best time calculation error for ${park.parkCode}:`, error.message);
      return {
        months: ['April', 'May', 'September', 'October'],
        reasons: ['Moderate temperatures', 'Lower crowds', 'Good weather'],
        crowdLevel: 'Moderate',
        weather: null,
        lastUpdated: new Date().toISOString(),
        source: 'fallback'
      };
    }
  }

  // Find optimal months based on weather and crowd data
  findOptimalMonths(seasonalData, park) {
    const lat = parseFloat(park.latitude);
    const lon = parseFloat(park.longitude);
    const isNorthern = lat > 30;
    
    // Define park-specific optimal months based on location and characteristics
    const parkSpecificMonths = this.getParkSpecificOptimalMonths(park.parkCode, lat, lon);
    if (parkSpecificMonths) {
      return parkSpecificMonths;
    }
    
    // Fallback to latitude-based recommendations
    if (isNorthern) {
      if (lat > 45) {
        // Northern parks (Alaska, northern Canada) - short summer season
        return ['June', 'July', 'August', 'September'];
      } else if (lat > 40) {
        // Mid-latitude parks - shoulder seasons
        return ['April', 'May', 'September', 'October'];
      } else {
        // Southern northern hemisphere - longer favorable season
        return ['March', 'April', 'May', 'October', 'November'];
      }
    } else {
      // Southern hemisphere - reverse seasons
      return ['March', 'April', 'October', 'November'];
    }
  }

  // Get park-specific optimal months based on unique characteristics
  getParkSpecificOptimalMonths(parkCode, lat, lon) {
    const parkRecommendations = {
      // Desert parks - avoid summer heat
      'arch': ['March', 'April', 'May', 'September', 'October', 'November'],
      'jotr': ['March', 'April', 'May', 'September', 'October', 'November'],
      'deva': ['March', 'April', 'May', 'September', 'October', 'November'],
      'sagu': ['March', 'April', 'May', 'September', 'October', 'November'],
      'grca': ['April', 'May', 'September', 'October'],
      
      // Northern mountain parks - short summer season
      'glac': ['June', 'July', 'August', 'September'],
      'dena': ['June', 'July', 'August', 'September'],
      'wrangell': ['June', 'July', 'August', 'September'],
      
      // Tropical/coastal parks - avoid hurricane season
      'ever': ['December', 'January', 'February', 'March', 'April'],
      'bisc': ['December', 'January', 'February', 'March', 'April'],
      'dryt': ['December', 'January', 'February', 'March', 'April'],
      'viis': ['December', 'January', 'February', 'March', 'April'],
      
      // High altitude parks - avoid winter
      'rmnp': ['May', 'June', 'July', 'August', 'September', 'October'],
      'crla': ['May', 'June', 'July', 'August', 'September', 'October'],
      'yose': ['April', 'May', 'June', 'July', 'August', 'September', 'October'],
      
      // Popular summer destinations - prefer shoulder seasons
      'yell': ['April', 'May', 'September', 'October'],
      'grte': ['April', 'May', 'September', 'October'],
      'zion': ['March', 'April', 'May', 'September', 'October', 'November'],
      'brca': ['March', 'April', 'May', 'September', 'October', 'November'],
      
      // Northern coastal parks - avoid winter storms
      'acad': ['May', 'June', 'July', 'August', 'September', 'October'],
      'olym': ['May', 'June', 'July', 'August', 'September', 'October'],
      
      // California parks - Mediterranean climate
      'yose': ['April', 'May', 'June', 'September', 'October'],
      'seki': ['April', 'May', 'June', 'September', 'October'],
      'pinn': ['March', 'April', 'May', 'September', 'October', 'November'],
      
      // Southwest parks - avoid summer heat
      'cany': ['March', 'April', 'May', 'September', 'October', 'November'],
      'meve': ['March', 'April', 'May', 'September', 'October', 'November'],
      'chcu': ['March', 'April', 'May', 'September', 'October', 'November']
    };
    
    return parkRecommendations[parkCode.toLowerCase()];
  }

  // Get reasons why these months are best
  getBestTimeReasons(months, seasonalData, crowdData, park) {
    const reasons = [];
    const parkCode = park.parkCode.toLowerCase();
    
    // Park-specific reasons
    if (parkCode === 'arch' || parkCode === 'jotr' || parkCode === 'deva' || parkCode === 'sagu') {
      reasons.push('Avoid extreme summer heat');
      reasons.push('Comfortable temperatures for hiking');
    } else if (parkCode === 'ever' || parkCode === 'bisc' || parkCode === 'dryt') {
      reasons.push('Avoid hurricane season');
      reasons.push('Best weather for water activities');
    } else if (parkCode === 'glac' || parkCode === 'dena' || parkCode === 'wrangell') {
      reasons.push('Accessible roads and trails');
      reasons.push('Wildlife viewing opportunities');
    } else if (parkCode === 'yell' || parkCode === 'grte' || parkCode === 'zion' || parkCode === 'brca') {
      reasons.push('Shoulder season crowds');
      reasons.push('Pleasant weather for outdoor activities');
    } else if (parkCode === 'acad' || parkCode === 'olym') {
      reasons.push('Avoid winter storms');
      reasons.push('Best coastal weather');
    } else {
      // Generic reasons based on months and park characteristics
      if (months.includes('April') || months.includes('May')) {
        if (park.designation === 'National Park') {
          reasons.push('Spring wildflower blooms');
        } else {
          reasons.push('Mild spring temperatures');
        }
      }
      if (months.includes('September') || months.includes('October')) {
        if (park.designation === 'National Park') {
          reasons.push('Autumn foliage viewing');
        } else {
          reasons.push('Pleasant fall weather');
        }
      }
      if (months.includes('June') || months.includes('July') || months.includes('August')) {
        if (parseFloat(park.latitude) > 45) {
          reasons.push('Short summer season access');
        } else {
          reasons.push('Warm summer weather');
        }
      }
      if (months.includes('December') || months.includes('January') || months.includes('February')) {
        if (parseFloat(park.latitude) < 30) {
          reasons.push('Mild winter conditions');
        } else {
          reasons.push('Winter activities available');
        }
      }
    }
    
    // Add crowd-based reasons
    if (crowdData.level === 'Moderate' || crowdData.level === 'Low') {
      reasons.push('Lower visitor crowds');
    }
    
    // Add weather-based reasons
    if (seasonalData && seasonalData.summer && seasonalData.summer.avg > 80) {
      reasons.push('Avoid summer heat');
    }
    
    return reasons;
  }

  // Enhanced facility data from NPS API
  async getEnhancedFacilities(park) {
    const cacheKey = `facilities-${park.parkCode}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    try {
      const [campgrounds, visitorCenters] = await Promise.all([
        npsService.getParkCampgrounds(park.parkCode).catch(() => []),
        npsService.getParkVisitorCenters(park.parkCode).catch(() => [])
      ]);

      const facilities = {
        visitorCenters: {
          available: visitorCenters.length > 0,
          count: visitorCenters.length,
          locations: visitorCenters.map(vc => vc.name)
        },
        camping: {
          available: campgrounds.length > 0,
          count: campgrounds.length,
          types: [...new Set(campgrounds.map(cg => cg.campgroundType))],
          locations: campgrounds.map(cg => cg.name)
        },
        lodging: {
          available: park.entranceFees && park.entranceFees.length > 0,
          note: 'Check with park for lodging availability'
        },
        restaurants: {
          available: false, // Most parks don't have restaurants
          note: 'Food services vary by park'
        },
        gasStations: {
          available: false,
          note: 'Limited fuel availability in most parks'
        },
        hospitals: {
          available: false,
          note: 'Emergency services vary by location'
        },
        accessibility: {
          wheelchairAccessible: this.assessAccessibility(park),
          accessibleTrails: this.getAccessibleTrails(park),
          services: this.getAccessibilityServices(visitorCenters)
        }
      };

      this.setCachedData(cacheKey, facilities);
      return facilities;

    } catch (error) {
      console.error(`Facilities error for ${park.parkCode}:`, error.message);
      return this.getBasicFacilities(park);
    }
  }

  // Assess accessibility based on park data
  assessAccessibility(park) {
    // Basic assessment - most national parks have some accessibility features
    return park.designation === 'National Park' || park.designation === 'National Monument';
  }

  // Get accessible trails information
  getAccessibleTrails(park) {
    // This would ideally come from NPS API trail data
    return park.designation === 'National Park' ? 
      'Some trails are wheelchair accessible' : 
      'Limited accessibility information available';
  }

  // Get accessibility services from visitor centers
  getAccessibilityServices(visitorCenters) {
    if (visitorCenters.length === 0) {
      return ['Contact park for accessibility information'];
    }
    
    return [
      'Visitor centers are generally accessible',
      'Assistive listening devices may be available',
      'Contact park for specific accessibility needs'
    ];
  }

  // Basic facilities fallback
  getBasicFacilities(park) {
    return {
      visitorCenters: { available: true, count: 1, locations: ['Main Visitor Center'] },
      camping: { available: true, count: 1, types: ['Tent'], locations: ['Main Campground'] },
      lodging: { available: false, note: 'Check with park for lodging availability' },
      restaurants: { available: false, note: 'Food services vary by park' },
      gasStations: { available: false, note: 'Limited fuel availability' },
      hospitals: { available: false, note: 'Emergency services vary' },
      accessibility: {
        wheelchairAccessible: true,
        accessibleTrails: 'Some trails accessible',
        services: ['Contact park for specific needs']
      }
    };
  }

  // Normalize activity names to general categories
  normalizeActivityName(activityName) {
    const name = activityName.toLowerCase();
    
    // Hiking and walking activities (including Front-Country Hiking, Back-Country Hiking, etc.)
    if (name.includes('hike') || name.includes('walk') || name.includes('trail') || 
        name.includes('front-country') || name.includes('back-country') || 
        name.includes('backpack') || name.includes('trek')) {
      return 'Hiking';
    }
    
    // Camping activities
    if (name.includes('camp') || name.includes('backpack')) {
      return 'Camping';
    }
    
    // Photography activities
    if (name.includes('photo') || name.includes('scenic') || name.includes('view')) {
      return 'Photography';
    }
    
    // Wildlife viewing
    if (name.includes('wildlife') || name.includes('bird') || name.includes('animal')) {
      return 'Wildlife Viewing';
    }
    
    // Water activities
    if (name.includes('kayak') || name.includes('canoe') || name.includes('boat') || name.includes('swim')) {
      return 'Water Activities';
    }
    
    // Rock climbing and adventure
    if (name.includes('climb') || name.includes('canyoneer') || name.includes('adventure')) {
      return 'Rock Climbing';
    }
    
    // Stargazing
    if (name.includes('star') || name.includes('astronomy') || name.includes('night')) {
      return 'Stargazing';
    }
    
    // Educational activities
    if (name.includes('program') || name.includes('talk') || name.includes('education') || name.includes('visitor center')) {
      return 'Educational Programs';
    }
    
    // Fishing
    if (name.includes('fish')) {
      return 'Fishing';
    }
    
    // Biking
    if (name.includes('bike') || name.includes('cycle')) {
      return 'Biking';
    }
    
    // Winter activities
    if (name.includes('ski') || name.includes('snowshoe') || name.includes('winter')) {
      return 'Winter Activities';
    }
    
    // Auto and ATV activities
    if (name.includes('auto') || name.includes('atv') || name.includes('driving') || name.includes('scenic drive')) {
      return 'Auto and ATV';
    }
    
    // Arts and Culture
    if (name.includes('arts') || name.includes('culture') || name.includes('cultural')) {
      return 'Arts and Culture';
    }
    
    // Astronomy (separate from stargazing)
    if (name.includes('astronomy')) {
      return 'Astronomy';
    }
    
    // Return null if no category matches
    return null;
  }

        // Find common things to do among parks
        async getCommonActivities(parks) {
          if (parks.length < 2) return { commonToAll: [], mostlyCommon: [] };

          try {
            // Get things to do for all parks (same as park details page uses)
            const activityPromises = parks.map(park => 
              npsService.getParkActivities(park.parkCode).catch(() => [])
            );
            
            const allThingsToDo = await Promise.all(activityPromises);
            
            // Count "things to do" occurrences by exact title (case-insensitive)
            const thingToDoCount = {};
            
            allThingsToDo.forEach((parkThingsToDo, parkIndex) => {
              const parkCode = parks[parkIndex].parkCode;
              const parkTitles = new Set(); // Track unique titles per park
              
              console.log(`Processing ${parkCode}: ${parkThingsToDo.length} things to do`);
              
              parkThingsToDo.forEach((thingToDo, i) => {
                // Compare activity categories (like "Hiking", "Birdwatching") instead of specific titles
                if (thingToDo.activities && Array.isArray(thingToDo.activities)) {
                  thingToDo.activities.forEach(activity => {
                    const activityName = activity.name;
                    if (activityName) {
                      const activityKey = activityName.toLowerCase().trim();
                      
                      // Only count each park once per activity category
                      if (!parkTitles.has(activityKey)) {
                        parkTitles.add(activityKey);

                        if (!thingToDoCount[activityKey]) {
                          thingToDoCount[activityKey] = {
                            title: activityName, // Keep original casing for display
                            count: 0,
                            parks: []
                          };
                        }
                        thingToDoCount[activityKey].count++;
                        thingToDoCount[activityKey].parks.push(parkCode);
                      }
                    }
                  });
                }
              });
            });
      

      // Find things to do common to all parks
      const totalParks = parks.length;
      const commonToAll = Object.values(thingToDoCount)
        .filter(item => item.count === totalParks)
        .map(item => ({
          title: item.title,
          count: item.count,
          percentage: 100,
          parks: item.parks
        }))
        .sort((a, b) => b.count - a.count);

      // Find things to do common to most parks (75% or more)
      const mostlyCommon = Object.values(thingToDoCount)
        .filter(item => item.count >= Math.ceil(totalParks * 0.75) && item.count < totalParks)
        .map(item => ({
          title: item.title,
          count: item.count,
          percentage: Math.round((item.count / totalParks) * 100),
          parks: item.parks
        }))
        .sort((a, b) => b.count - a.count);

      return {
        commonToAll: commonToAll,
        mostlyCommon: mostlyCommon,
        totalParks: parks.length,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting common things to do:', error);
      return { commonToAll: [], mostlyCommon: [] };
    }
  }

  // Get comprehensive enhanced park data for comparison
  async getEnhancedParkData(park) {
    try {
      const [weatherData, crowdData, bestTime, facilities] = await Promise.all([
        this.getWeatherData(park),
        this.getCrowdLevel(park),
        this.getBestTimeToVisit(park),
        this.getEnhancedFacilities(park)
      ]);

      return {
        ...park,
        weather: weatherData,
        crowdLevel: crowdData,
        bestTimeToVisit: bestTime,
        facilities: facilities,
        lastEnhanced: new Date().toISOString()
      };

    } catch (error) {
      console.error(`Error enhancing park data for ${park.parkCode}:`, error.message);
      return {
        ...park,
        weather: this.getFallbackWeatherData(park),
        crowdLevel: this.getBasicCrowdLevel(park),
        bestTimeToVisit: {
          months: ['April', 'May', 'September', 'October'],
          reasons: ['Moderate temperatures', 'Lower crowds'],
          crowdLevel: 'Moderate'
        },
        facilities: this.getBasicFacilities(park),
        lastEnhanced: new Date().toISOString(),
        error: 'Partial data due to API limitations'
      };
    }
  }
}

module.exports = new EnhancedParkService();
