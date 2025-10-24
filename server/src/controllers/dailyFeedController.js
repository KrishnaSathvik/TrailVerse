const npsService = require('../services/npsService');
const openaiService = require('../services/openaiService');
const enhancedParkService = require('../services/enhancedParkService');
const astronomicalService = require('../services/astronomicalService');
const reliableAstronomicalService = require('../services/reliableAstronomicalService');
const elevationService = require('../services/elevationService');
const parkSizeService = require('../services/parkSizeService');
const User = require('../models/User');
const DailyFeed = require('../models/DailyFeed');

// Database-based caching - no in-memory cache needed

// Haversine distance calculation function
function haversine(a, b) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 3959; // miles
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const distance = 2 * R * Math.asin(Math.sqrt(s));
  
  // Debug: Log distance calculation for troubleshooting
  if (process.env.NODE_ENV === 'development') {
    console.log(`📏 Distance calc: (${a.lat}, ${a.lng}) to (${b.lat}, ${b.lng}) = ${distance.toFixed(2)} miles`);
  }
  
  return distance;
}

// @desc    Get personalized daily feed
// @route   GET /api/feed/daily
// @access  Private
exports.getDailyFeed = async (req, res, next) => {
  try {
    console.log('🌅 Daily Feed API called by user:', req.user._id);
    const userId = req.user._id;
    const userAgent = req.get('User-Agent') || '';
    const deviceType = userAgent.includes('Mobile') ? 'Mobile' : 'Desktop';
    console.log(`📱 Device type: ${deviceType}`);
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Use default location for weather/astro data
    const userLocation = { latitude: 40.7128, longitude: -74.0060 }; // Default to NYC

    const today = new Date().toDateString();
    const todayISO = new Date().toISOString().split('T')[0]; // Format: 2025-10-22
    const forceRefresh = req.query.forceRefresh === 'true' || req.query.refresh === 'true'; // Get from query params
    console.log(`📅 Checking database for daily feed on ${today} (ISO: ${todayISO})`);
    console.log(`🔄 Smart caching: ${forceRefresh ? 'Force refresh requested' : 'Using database cache for same day'}`);
    
    // Check if we have existing daily feed in database (unless force refresh is requested)
    let existingFeed = null;
    if (!forceRefresh) {
      existingFeed = await DailyFeed.findOrCreateDailyFeed(userId, todayISO);
    } else {
      console.log(`🔄 Force refresh: Deleting existing daily feed for user ${userId} on ${todayISO}`);
      // Delete existing feed to force regeneration
      const deleteResult = await DailyFeed.deleteOne({ userId, date: todayISO });
      console.log(`🔄 Force refresh: Delete result:`, {
        deletedCount: deleteResult.deletedCount,
        acknowledged: deleteResult.acknowledged
      });
    }
    
    if (existingFeed) {
      console.log(`📦 Returning daily feed from database for user ${userId} on ${today}`);
      console.log(`📊 Cached feed data structure:`, {
        hasParkOfDay: !!existingFeed.parkOfDay,
        parkName: existingFeed.parkOfDay?.name,
        hasWeatherData: !!existingFeed.weatherData,
        weatherCondition: existingFeed.weatherData?.current?.condition,
        hasAstroData: !!existingFeed.astroData,
        sunrise: existingFeed.astroData?.sunrise,
        hasWeatherInsights: !!existingFeed.weatherInsights,
        hasNatureFact: !!existingFeed.natureFact
      });
      
      // Debug: Log the actual data structure
      console.log(`🔍 Full database data:`, JSON.stringify(existingFeed, null, 2));
      
      // Set cache-busting headers to prevent browser caching
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      return res.status(200).json({
        success: true,
        data: existingFeed,
        cached: true
      });
    }
    
    console.log(`🔄 No existing daily feed found, generating new one for user ${userId} on ${today}`);

    // Get personalized daily feed data with better error handling
    const [parkOfDay] = await Promise.allSettled([
      getPersonalizedParkOfDay(user)
    ]);

    // Get park-specific weather and astro data
    let astroData, weatherData;
    if (parkOfDay.status === 'fulfilled' && parkOfDay.value && parkOfDay.value.parkCode) {
      const parkLocation = {
        latitude: parkOfDay.value.latitude || userLocation.latitude,
        longitude: parkOfDay.value.longitude || userLocation.longitude
      };
      
      console.log(`🌤️ Getting weather/astro for park ${parkOfDay.value.parkCode} at ${parkLocation.latitude}, ${parkLocation.longitude}`);
      
      const [astroResult, weatherResult] = await Promise.allSettled([
        getAstroData(parkLocation, parkOfDay.value.name),
        getWeatherData(parkLocation)
      ]);
      
      astroData = astroResult;
      weatherData = weatherResult;
    } else {
      // No park selected, cannot generate AI content
      throw new Error('No park selected - cannot generate AI-powered content');
    }

    // Extract successful results - all must be successful for AI-powered content
    console.log(`📊 Controller: Processing results:`, {
      parkOfDay: parkOfDay.status,
      astroData: astroData.status,
      weatherData: weatherData.status
    });

    // Verify all required data is available
    if (parkOfDay.status !== 'fulfilled' || !parkOfDay.value) {
      throw new Error('Failed to get park of the day');
    }
    if (astroData.status !== 'fulfilled' || !astroData.value) {
      throw new Error('Failed to get astro data');
    }
    if (weatherData.status !== 'fulfilled' || !weatherData.value) {
      throw new Error('Failed to get weather data');
    }

    const selectedPark = parkOfDay.value;
    
    // Generate park-specific nature fact
    let parkSpecificNatureFact;
    try {
      parkSpecificNatureFact = await getDailyNatureFact(selectedPark.parkCode, selectedPark.name);
    } catch (error) {
      console.error('Failed to generate park-specific nature fact:', error.message);
      throw new Error(`Unable to generate nature fact for ${selectedPark.name}: ${error.message}`);
    }

    // Get AI-generated weather insights (sky insights are already generated in getAstroData)
    console.log('🤖 Generating AI weather insights for:', selectedPark.name);
    const [weatherInsights] = await Promise.allSettled([
      getWeatherInsights(weatherData.value, selectedPark.name)
    ]);
    
    console.log('🤖 AI Weather Insights results:', {
      weatherInsights: weatherInsights.status,
      weatherValue: weatherInsights.status === 'fulfilled' ? weatherInsights.value?.substring(0, 50) + '...' : weatherInsights.reason?.message
    });

    const dailyFeed = {
      date: new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString(), // Add timestamp to ensure uniqueness
      parkOfDay: selectedPark,
      natureFact: parkSpecificNatureFact,
      weatherData: weatherData.value,
      weatherInsights: weatherInsights.status === 'fulfilled' ? weatherInsights.value : null,
      astroData: astroData.value,
      personalizedRecommendations: await getPersonalizedRecommendations(user, selectedPark, weatherData.value, astroData.value)
    };

    console.log(`📊 Controller: Final dailyFeed data:`, {
      parkName: dailyFeed.parkOfDay?.name,
      parkCode: dailyFeed.parkOfDay?.parkCode,
      weatherTemp: dailyFeed.weatherData?.current?.temp,
      weatherCondition: dailyFeed.weatherData?.current?.condition,
      natureFact: dailyFeed.natureFact?.substring(0, 50) + '...',
      astroSunrise: dailyFeed.astroData?.sunrise,
      astroSunset: dailyFeed.astroData?.sunset,
      astroMoonPhase: dailyFeed.astroData?.moonPhase
    });
    
    // Debug: Log the complete data structure being generated
    console.log(`🔍 Complete generated data:`, JSON.stringify(dailyFeed, null, 2));
    
    console.log(`📊 Controller: Complete astroData:`, dailyFeed.astroData);
    console.log(`📊 Controller: Complete natureFact:`, dailyFeed.natureFact);
    console.log(`📊 Controller: Weather Insights:`, dailyFeed.weatherInsights);

    // Log any errors but don't fail the entire request
    if (parkOfDay.status === 'rejected') {
      console.warn('⚠️ Park of day failed:', parkOfDay.reason?.message);
    }
    if (astroData.status === 'rejected') {
      console.warn('⚠️ Astro data failed:', astroData.reason?.message);
    }
    if (weatherData.status === 'rejected') {
      console.warn('⚠️ Weather data failed:', weatherData.reason?.message);
    }

    console.log('🌅 Daily Feed response:', {
      parkName: dailyFeed.parkOfDay.name,
      parkCode: dailyFeed.parkOfDay.parkCode,
      hasWeather: !!dailyFeed.weatherData,
      hasWeatherInsights: !!dailyFeed.weatherInsights,
      hasAstro: !!dailyFeed.astroData,
      natureFact: dailyFeed.natureFact
    });
    
    // Save the daily feed data to database
    console.log(`💾 Saving daily feed data to database for user ${userId} on ${todayISO}`);
    try {
      await DailyFeed.saveDailyFeed(userId, todayISO, dailyFeed);
      console.log(`✅ Daily feed saved to database successfully`);
    } catch (saveError) {
      console.error('❌ Error saving daily feed to database:', saveError);
      // Continue with response even if save fails
    }
    
    // Set cache-busting headers to prevent browser caching
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.status(200).json({
      success: true,
      data: dailyFeed,
      cached: false
    });
  } catch (error) {
    console.error('Error getting daily feed:', error);
    next(error);
  }
};

// @desc    Get park of the day
// @route   GET /api/feed/park-of-day
// @access  Private
exports.getParkOfDay = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    
    const parkOfDay = await getPersonalizedParkOfDay(user);
    
    res.status(200).json({
      success: true,
      data: parkOfDay
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get daily nature fact
// @route   GET /api/feed/nature-fact
// @access  Private
exports.getNatureFact = async (req, res, next) => {
  try {
    const fact = getDailyNatureFact();
    
    res.status(200).json({
      success: true,
      data: { fact }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Test authentication
// @route   GET /api/feed/test-auth
// @access  Private
exports.testAuth = async (req, res, next) => {
  try {
    console.log('🧪 Testing authentication...');
    console.log('🧪 User ID:', req.user._id);
    console.log('🧪 User email:', req.user.email);
    
    res.status(200).json({
      success: true,
      data: {
        authenticated: true,
        userId: req.user._id,
        userEmail: req.user.email,
        message: 'Authentication is working correctly'
      }
    });
  } catch (error) {
    console.error('🧪 Test auth error:', error);
    next(error);
  }
};


// @desc    Debug daily feed data
// @route   GET /api/feed/debug
// @access  Private
exports.debugDailyFeed = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const todayISO = new Date().toISOString().split('T')[0];
    
    console.log('🐛 Debug: Checking daily feed data for user:', userId);
    
    // Check what's in the database
    const dbFeed = await DailyFeed.findOne({ userId, date: todayISO });
    
    if (dbFeed) {
      console.log('🐛 Debug: Found database feed:', {
        hasParkOfDay: !!dbFeed.parkOfDay,
        parkName: dbFeed.parkOfDay?.name,
        hasWeatherData: !!dbFeed.weatherData,
        weatherCondition: dbFeed.weatherData?.current?.condition,
        hasAstroData: !!dbFeed.astroData,
        sunrise: dbFeed.astroData?.sunrise,
        hasWeatherInsights: !!dbFeed.weatherInsights,
        hasNatureFact: !!dbFeed.natureFact,
        generatedAt: dbFeed.generatedAt
      });
    } else {
      console.log('🐛 Debug: No database feed found');
    }
    
    res.status(200).json({
      success: true,
      data: {
        userId,
        todayISO,
        hasDbFeed: !!dbFeed,
        dbFeed: dbFeed ? {
          hasParkOfDay: !!dbFeed.parkOfDay,
          parkName: dbFeed.parkOfDay?.name,
          hasWeatherData: !!dbFeed.weatherData,
          weatherCondition: dbFeed.weatherData?.current?.condition,
          hasAstroData: !!dbFeed.astroData,
          sunrise: dbFeed.astroData?.sunrise,
          hasWeatherInsights: !!dbFeed.weatherInsights,
          hasNatureFact: !!dbFeed.natureFact,
          generatedAt: dbFeed.generatedAt
        } : null
      }
    });
  } catch (error) {
    console.error('🐛 Debug error:', error);
    next(error);
  }
};

// @desc    Test AI insights generation
// @route   GET /api/feed/test-ai
// @access  Private
exports.testAIInsights = async (req, res, next) => {
  try {
    console.log('🧪 Testing AI insights generation...');
    console.log('🧪 OpenAI API Key available:', !!process.env.OPENAI_API_KEY);
    
    const testWeatherData = {
      current: {
        temperature: 75,
        condition: 'clear sky',
        humidity: 60,
        windSpeed: 10,
        visibility: 10
      }
    };
    
    const testAstroData = {
      sunrise: '6:30 AM',
      sunset: '7:30 PM',
      moonPhase: 'Waxing Crescent',
      milkyWayVisibility: 'Good',
      auroraProbability: 'Low'
    };
    
    const testParkName = 'Yellowstone National Park';
    
    console.log('🧪 Testing weather insights...');
    try {
      const weatherInsights = await getWeatherInsights(testWeatherData, testParkName);
      console.log('🧪 Weather insights result:', weatherInsights);
    } catch (error) {
      console.error('🧪 Weather insights error:', error);
    }
    
    console.log('🧪 Testing sky insights...');
    try {
      const skyInsights = await getSkyInsights(testAstroData, testParkName);
      console.log('🧪 Sky insights result:', skyInsights);
    } catch (error) {
      console.error('🧪 Sky insights error:', error);
    }
    
    // Test direct OpenAI call
    console.log('🧪 Testing direct OpenAI call...');
    try {
      const directResponse = await openaiService.chat([
        { role: 'user', content: 'Say "Hello, this is a test" in exactly those words.' }
      ]);
      console.log('🧪 Direct OpenAI response:', directResponse);
    } catch (error) {
      console.error('🧪 Direct OpenAI error:', error);
    }
    
    res.status(200).json({
      success: true,
      data: {
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        testWeatherData,
        testAstroData
      }
    });
  } catch (error) {
    console.error('🧪 Test AI insights error:', error);
    next(error);
  }
};



// Helper functions
function getWeatherIcon(condition) {
  const cond = condition.toLowerCase();
  if (cond.includes('clear') || cond.includes('sunny')) return '01d';
  if (cond.includes('cloud')) return '02d';
  if (cond.includes('rain')) return '10d';
  if (cond.includes('storm')) return '11d';
  if (cond.includes('snow')) return '13d';
  if (cond.includes('mist') || cond.includes('fog')) return '50d';
  return '01d'; // Default to clear
}

async function getPersonalizedParkOfDay(user) {
  try {
    // Get user's saved parks and visited parks
    const savedParks = user.savedParks || [];
    const visitedParks = savedParks.filter(park => park.visited).map(park => park.parkCode);
    const favoriteParks = savedParks.filter(park => park.favorite).map(park => park.parkCode);
    
    // Get user preferences for additional personalization
    let userPreferences = null;
    try {
      const UserPreferences = require('../models/UserPreferences');
      userPreferences = await UserPreferences.getOrCreate(user._id);
    } catch (prefError) {
      console.warn('Could not fetch user preferences:', prefError.message);
    }
    
    // Get all parks with timeout
    const allParks = await Promise.race([
      npsService.getAllParks(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('NPS API timeout')), 10000))
    ]);
    
    // Filter for National Parks only (exact match, not other park types)
    const nationalParks = allParks.filter(park => 
      park.designation && park.designation.toLowerCase() === 'national park'
    );
    
    console.log(`🏞️ Found ${nationalParks.length} National Parks out of ${allParks.length} total parks`);
    
    if (nationalParks.length === 0) {
      console.warn('No National Parks found, using fallback');
      return getFallbackParkOfDay();
    }
    
    // Apply user preferences for park selection
    let candidateParks = nationalParks;
    
    // If user prefers favorites first and has favorites, prioritize them
    if (userPreferences?.preferences?.display?.showFavoritesFirst && favoriteParks.length > 0) {
      const favoriteNationalParks = nationalParks.filter(park => favoriteParks.includes(park.parkCode));
      if (favoriteNationalParks.length > 0) {
        candidateParks = favoriteNationalParks;
        console.log(`⭐ Prioritizing ${favoriteNationalParks.length} favorite parks for user`);
      }
    }
    
    // Filter out visited parks if user prefers not to see them
    const showVisitedParks = userPreferences?.preferences?.display?.showVisitedParks !== false;
    if (!showVisitedParks) {
      candidateParks = candidateParks.filter(park => !visitedParks.includes(park.parkCode));
      console.log(`🚫 Filtering out visited parks for user`);
    }
    
    // If no unvisited National Parks, fall back to visited National Parks
    const unvisitedParks = candidateParks.length > 0 ? candidateParks : 
      nationalParks.filter(park => visitedParks.includes(park.parkCode));
    
    // Use all unvisited parks for selection
    const locationBasedParks = unvisitedParks;
    
    // Use user-specific date-based seed for personalized daily park selection
    const today = new Date().toDateString();
    const userSeed = user._id.toString().slice(-6); // Use last 6 chars of user ID
    const dateSeed = today.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    const seed = dateSeed + parseInt(userSeed, 16); // Combine date and user for personalization
    
    // Create seeded random function
    const seededRandom = (seed) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };
    
    const randomIndex = Math.floor(seededRandom(seed) * locationBasedParks.length);
    const randomPark = locationBasedParks[randomIndex] || nationalParks[Math.floor(seededRandom(seed + 1) * nationalParks.length)];
    
    // Debug logging
    console.log('🎯 Selected Park for Daily Feed:', {
      parkCode: randomPark.parkCode,
      name: randomPark.fullName || randomPark.name,
      designation: randomPark.designation,
      hasImages: randomPark.images && randomPark.images.length > 0,
      imageUrl: randomPark.images?.[0]?.url,
      description: randomPark.description ? randomPark.description.substring(0, 100) + '...' : 'No description',
      personalization: {
        userId: user._id.toString().slice(-6),
        totalParks: nationalParks.length,
        candidateParks: candidateParks.length,
        unvisitedParks: unvisitedParks.length,
        locationBased: locationBasedParks.length,
        userLocation: 'Not used',
        favoriteParks: favoriteParks.length,
        visitedParks: visitedParks.length,
        showFavoritesFirst: userPreferences?.preferences?.display?.showFavoritesFirst || false,
        showVisitedParks: userPreferences?.preferences?.display?.showVisitedParks !== false,
        seed: seed
      }
    });
    
    // Get weather for the park using enhanced weather service (with timeout)
    let weather = null;
    try {
      if (randomPark.latitude && randomPark.longitude) {
        const weatherData = await Promise.race([
          enhancedParkService.getWeatherData(randomPark),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Weather API timeout')), 5000))
        ]);
        weather = {
          temperature: weatherData.current.temperature,
          temp: weatherData.current.temperature, // For UI compatibility
          condition: weatherData.current.condition,
          humidity: weatherData.current.humidity,
          windSpeed: weatherData.current.windSpeed,
          feelsLike: weatherData.current.feelsLike,
          seasonal: weatherData.seasonal
        };
      }
    } catch (weatherError) {
      console.warn('Weather data unavailable for', randomPark.parkCode, ':', weatherError.message);
      weather = null;
    }
    
    // Get must-do activities and crowd level with timeout
    const [mustDo, crowdLevel] = await Promise.allSettled([
      Promise.race([
        getMustDoActivities(randomPark.parkCode),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Activities API timeout')), 3000))
      ]),
      Promise.race([
        getCrowdLevel(randomPark.parkCode),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Crowd API timeout')), 3000))
      ])
    ]);
    
    return {
      parkCode: randomPark.parkCode,
      name: randomPark.fullName || randomPark.name,
      description: randomPark.description || 'Discover amazing natural wonders and breathtaking landscapes.',
      image: randomPark.images?.[0]?.url || '/background1.png',
      latitude: randomPark.latitude,
      longitude: randomPark.longitude,
      elevation: await getRealParkElevation(randomPark),
      acres: getRealParkSize(randomPark),
      weather: weather ? {
        temp: Math.round(weather.temperature),
        condition: weather.condition,
        icon: getWeatherIcon(weather.condition)
      } : null,
      mustDo: mustDo.status === 'fulfilled' ? mustDo.value : ['Visit the park', 'Explore nature', 'Take photos'],
      crowdLevel: crowdLevel.status === 'fulfilled' ? crowdLevel.value : 'Moderate',
      bestTime: getBestTimeOfDay(weather, randomPark)
    };
  } catch (error) {
    console.error('Error getting personalized park:', error);
    // Return fallback park data
    return getFallbackParkOfDay();
  }
}

async function getDailyNatureFact(parkCode, parkName) {
  if (!parkCode || !parkName) {
    throw new Error('Park code and name are required for AI nature fact generation');
  }

  // Generate AI-powered park-specific nature fact
  const prompt = `Generate an interesting, educational nature fact about ${parkName} (park code: ${parkCode}). 
  The fact should be:
  - Specific to this national park
  - Scientifically accurate
  - Engaging and surprising
  - Under 100 words
  - Include specific details about wildlife, geology, ecology, or history
  
  Format as a single, compelling sentence.`;

  const response = await openaiService.chat([
    { role: 'user', content: prompt }
  ]);
  
  const fact = response.trim().replace(/\*\*(.*?)\*\*/g, '$1');
  console.log(`🌿 AI Generated nature fact for park ${parkCode}:`, fact);
  return fact;
}

async function getAstroData(location, parkName) {
  if (!parkName) {
    throw new Error('Park name is required for AI astro data generation');
  }

  console.log(`🌙 Controller: Getting reliable astro data for location:`, location);
  
  const now = new Date();
  const lat = parseFloat(location.latitude) || 40.7128;
  const lng = parseFloat(location.longitude) || -74.0060;
  const elevation = parseFloat(location.elevation) || 0;
  
  console.log(`🌙 Controller: Using reliable API for lat=${lat}, lng=${lng}, elevation=${elevation}m`);
  
  try {
    // Use reliable astronomical API
    console.log(`🌙 Controller: Calling reliableAstronomicalService.getAstronomicalData with:`, { lat, lng, now, elevation });
    const astroData = await reliableAstronomicalService.getAstronomicalData(lat, lng, now, elevation);
    console.log(`🌙 Controller: reliableAstronomicalService returned:`, Object.keys(astroData));
    
    console.log(`🌙 Controller: Precise astro data calculated:`, {
      sunrise: astroData.sunrise,
      sunset: astroData.sunset,
      moonPhase: astroData.moonPhase,
      moonIllumination: astroData.moonIllumination,
      moonAge: astroData.moonAge,
      nextNewMoon: astroData.nextNewMoon,
      nextFullMoon: astroData.nextFullMoon,
      dayLength: astroData.dayLength,
      isPolarDay: astroData.isPolarDay,
      isPolarNight: astroData.isPolarNight,
      sunDeclination: astroData.sunDeclination,
      sunRightAscension: astroData.sunRightAscension,
      milkyWayVisibility: astroData.milkyWayVisibility,
      auroraProbability: astroData.auroraProbability
    });
    
    // Generate AI-powered sky insights with precise data
    let skyInsights = null;
    try {
      const prompt = `Generate engaging sky and stargazing insights for ${parkName} at coordinates ${lat}, ${lng} in ${getMonthName(now.getMonth())}.
      
      Current Astronomical Data:
      - Sunrise: ${astroData.sunrise}
      - Sunset: ${astroData.sunset}
      - Moon Phase: ${astroData.moonPhase} (${astroData.moonIllumination}% illuminated)
      - Milky Way Visibility: ${astroData.milkyWayVisibility}
      - Aurora Probability: ${astroData.auroraProbability}
      - Day Length: ${astroData.dayLength ? astroData.dayLength.toFixed(1) + ' hours' : 'N/A'}
      
      Include:
      - Best stargazing times and conditions
      - What celestial objects are visible
      - Seasonal astronomy highlights
      - Photography tips for the current conditions
      - Moon phase specific recommendations
      
      Keep it under 150 words and make it specific to this location, season, and current astronomical conditions.`;

      const response = await openaiService.chat([
        { role: 'user', content: prompt }
      ]);
      
      skyInsights = response.trim().replace(/\*\*(.*?)\*\*/g, '$1');
      console.log(`🌙 AI Generated precise sky insights for ${parkName}:`, skyInsights);
    } catch (error) {
      console.error('Error generating sky insights in getAstroData:', error);
      skyInsights = `Sunrise: ${astroData.sunrise}, Sunset: ${astroData.sunset}. Moon: ${astroData.moonPhase} (${astroData.moonIllumination}% illuminated). Milky Way visibility: ${astroData.milkyWayVisibility}. Check local conditions for stargazing opportunities.`;
    }
    
    return {
      sunrise: astroData.sunrise,
      sunset: astroData.sunset,
      moonPhase: astroData.moonPhase,
      moonIllumination: astroData.moonIllumination,
      moonAge: astroData.moonAge,
      nextNewMoon: astroData.nextNewMoon,
      nextFullMoon: astroData.nextFullMoon,
      milkyWayVisibility: astroData.milkyWayVisibility,
      auroraProbability: astroData.auroraProbability,
      skyInsights,
      dayLength: astroData.dayLength,
      isPolarDay: astroData.isPolarDay,
      isPolarNight: astroData.isPolarNight
    };
    
  } catch (error) {
    console.error('Error in precise astronomical calculations:', error);
    
    // Fallback to simplified calculations if precise ones fail
    console.log(`🌙 Controller: Falling back to simplified calculations`);
    return getAstroDataFallback(location, parkName);
  }
}

// Fallback function for simplified astronomical calculations
async function getAstroDataFallback(location, parkName) {
  console.log(`🌙 Controller: Using fallback astro calculations for location:`, location);
  
  const now = new Date();
  const month = now.getMonth();
  const lat = parseFloat(location.latitude) || 40.7128;
  const lng = parseFloat(location.longitude) || -74.0060;
  
  // Calculate realistic sunrise/sunset times based on season and location
  let sunriseHour, sunsetHour;
  
  // Base times adjusted for latitude
  const latitudeAdjustment = Math.abs(lat - 40) * 0.1; // Adjust for latitude difference from NYC
  
  if (month >= 2 && month <= 4) { // Spring
    sunriseHour = 6.5 + latitudeAdjustment;
    sunsetHour = 19.0 - latitudeAdjustment;
  } else if (month >= 5 && month <= 7) { // Summer
    sunriseHour = 5.5 + latitudeAdjustment;
    sunsetHour = 20.0 - latitudeAdjustment;
  } else if (month >= 8 && month <= 10) { // Fall
    sunriseHour = 6.5 + latitudeAdjustment;
    sunsetHour = 18.5 - latitudeAdjustment;
  } else { // Winter
    sunriseHour = 7.0 + latitudeAdjustment;
    sunsetHour = 17.5 - latitudeAdjustment;
  }

  const sunrise = new Date(now);
  sunrise.setHours(Math.floor(sunriseHour), (sunriseHour % 1) * 60, 0, 0);
  
  const sunset = new Date(now);
  sunset.setHours(Math.floor(sunsetHour), (sunsetHour % 1) * 60, 0, 0);
  
  // Calculate moon phase based on date (simplified)
  const moonPhase = calculateMoonPhase(now);
  
  // Determine visibility based on moon phase and season
  const milkyWayVisibility = getMilkyWayVisibility(moonPhase, month);
  const auroraProbability = getAuroraProbability(location, month);
  
  // Generate AI-powered sky insights
  let skyInsights = null;
  try {
    const prompt = `Generate engaging sky and stargazing insights for ${parkName} at coordinates ${lat}, ${lng} in ${getMonthName(month)}.
    Include:
    - Best stargazing times and conditions
    - What celestial objects are visible
    - Seasonal astronomy highlights
    - Photography tips for the night sky
    - Any special astronomical events this month
    
    Keep it under 150 words and make it specific to this location and season.`;

    const response = await openaiService.chat([
      { role: 'user', content: prompt }
    ]);
    
    skyInsights = response.trim().replace(/\*\*(.*?)\*\*/g, '$1');
    console.log(`🌙 AI Generated sky insights for ${parkName}:`, skyInsights);
  } catch (error) {
    console.error('Error generating sky insights in getAstroDataFallback:', error);
    skyInsights = `Sunrise: ${sunrise.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}, Sunset: ${sunset.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}. Check local conditions for stargazing opportunities.`;
  }
  
  return {
    sunrise: sunrise.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    sunset: sunset.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    moonPhase,
    milkyWayVisibility,
    auroraProbability,
    skyInsights
  };
}

function calculateMoonPhase(date) {
  // Simplified moon phase calculation
  const moonPhases = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous', 'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
  const dayOfMonth = date.getDate();
  const phaseIndex = Math.floor((dayOfMonth / 3.5) % 8);
  return moonPhases[phaseIndex];
}

function getMilkyWayVisibility(moonPhase, month) {
  // Milky Way is best visible during new moon and in summer months
  if (moonPhase === 'New Moon' && month >= 5 && month <= 8) {
    return 'Excellent';
  } else if (moonPhase === 'New Moon' || (month >= 4 && month <= 9)) {
    return 'Good';
  } else {
    return 'Fair';
  }
}

function getAuroraProbability(location, month) {
  // Aurora is more likely in northern locations and during winter months
  const lat = parseFloat(location?.latitude) || 40;
  
  if (lat > 60 && (month >= 10 || month <= 2)) {
    return 'High';
  } else if (lat > 50 && (month >= 9 || month <= 3)) {
    return 'Moderate';
  } else if (lat > 40) {
    return 'Low';
  } else {
    return 'Very Low';
  }
}

async function getWeatherData(location) {
  try {
    console.log(`🌤️ Controller: Fetching weather for location:`, location);
    
    // Use the enhanced weather service for real weather data with timeout
    const weatherData = await Promise.race([
      enhancedParkService.getWeatherData(location),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Weather API timeout')), 5000))
    ]);
    
    console.log(`🌤️ Controller: Weather service returned:`, {
      temp: weatherData.current.temp,
      temperature: weatherData.current.temperature,
      condition: weatherData.current.condition,
      source: weatherData.source || 'api'
    });

    // If this is fallback data, we might want to use a different approach
    if (weatherData.source === 'fallback') {
      console.log(`⚠️ Controller: Weather service returned fallback data for location:`, location);
    }
    
    return {
      current: {
        temp: weatherData.current.temp || weatherData.current.temperature,
        temperature: weatherData.current.temperature || weatherData.current.temp,
        condition: weatherData.current.condition,
        humidity: weatherData.current.humidity,
        windSpeed: weatherData.current.windSpeed,
        uvIndex: weatherData.current.uvIndex || 0,
        visibility: weatherData.current.visibility || 10
      },
      recommendation: getWeatherRecommendation(weatherData.current.condition, weatherData.current.temperature || weatherData.current.temp)
    };
  } catch (error) {
    console.warn('Weather data unavailable for location:', error.message);
    console.log(`🌤️ Controller: Using fallback weather data for location:`, location);
    // Return fallback weather data instead of null
    return {
      current: {
        temp: 68,
        temperature: 68,
        condition: 'Partly Cloudy',
        humidity: 55,
        windSpeed: 6,
        uvIndex: 4,
        visibility: 10
      },
      recommendation: 'Great day for outdoor activities!'
    };
  }
}

function getWeatherRecommendation(condition, temperature) {
  const temp = parseInt(temperature);
  const cond = condition.toLowerCase();
  
  if (cond.includes('rain') || cond.includes('storm')) {
    return 'Consider indoor activities or bring rain gear!';
  } else if (cond.includes('snow')) {
    return 'Great for winter activities! Dress warmly.';
  } else if (temp > 85) {
    return 'Hot day ahead! Stay hydrated and seek shade.';
  } else if (temp < 40) {
    return 'Cold weather! Bundle up for outdoor adventures.';
  } else if (temp >= 65 && temp <= 80) {
    return 'Perfect weather for outdoor activities!';
  } else {
    return 'Good day for outdoor exploration!';
  }
}

async function getMustDoActivities(parkCode) {
  try {
    // Get real park activities from NPS service
    const parkActivities = await npsService.getParkActivities(parkCode);
    
    if (parkActivities && parkActivities.length > 0) {
      // Return top 3 activities from the park
      return parkActivities.slice(0, 3).map(activity => activity.name);
    }
    
    // If no specific activities, return null to indicate no data available
    return null;
  } catch (error) {
    console.warn('Could not fetch park activities for', parkCode, ':', error.message);
    // Return null instead of generic activities
    return null;
  }
}

async function getCrowdLevel(parkCode) {
  try {
    // Get park data first
    const park = await npsService.getParkByCode(parkCode);
    if (!park) {
      return 'Moderate';
    }
    
    // Use enhanced park service for crowd prediction
    const crowdData = await enhancedParkService.getCrowdLevel(park);
    return crowdData.level;
  } catch (error) {
    console.warn('Could not fetch crowd data:', error.message);
    return 'Moderate';
  }
}

function getBestTimeOfDay(weather, park) {
  const hour = new Date().getHours();
  const temp = weather?.temperature || 70;
  const condition = weather?.condition || 'clear';
  const season = getCurrentSeason();
  const parkName = park?.name?.toLowerCase() || '';
  
  console.log(`🕐 Determining best time for ${parkName} - Weather: ${temp}°F ${condition}, Season: ${season}, Hour: ${hour}`);
  
  // Weather-based recommendations (highest priority)
  if (temp < 32) {
    return 'Afternoon'; // Freezing - warmest part of day
  } else if (temp < 45) {
    return 'Afternoon'; // Cold - afternoon warmth
  } else if (temp > 95) {
    return 'Morning'; // Extreme heat - coolest part
  } else if (temp > 85) {
    return hour < 9 ? 'Morning' : 'Evening'; // Hot - avoid midday
  } else if (condition.includes('rain') || condition.includes('storm') || condition.includes('snow')) {
    return 'Morning'; // Stormy weather - morning usually clearer
  } else if (condition.includes('fog') || condition.includes('mist')) {
    return 'Afternoon'; // Foggy - afternoon usually clearer
  }
  
  // Seasonal considerations
  if (season === 'Winter') {
    return 'Afternoon'; // Winter - warmest part of day
  } else if (season === 'Summer') {
    return hour < 10 ? 'Morning' : 'Evening'; // Summer - avoid midday heat
  }
  
  // Park-specific activity recommendations
  // Wildlife viewing parks - early morning is best for animal activity
  if (parkName.includes('yellowstone') || parkName.includes('grand teton') || 
      parkName.includes('great smoky') || parkName.includes('shenandoah') ||
      parkName.includes('everglades') || parkName.includes('denali')) {
    return 'Morning';
  }
  
  // Desert parks - avoid midday heat, prefer early morning or late afternoon
  if (parkName.includes('death valley') || parkName.includes('joshua tree') || 
      parkName.includes('saguaro') || parkName.includes('arches') ||
      parkName.includes('canyonlands') || parkName.includes('zion')) {
    return hour < 10 ? 'Morning' : 'Evening';
  }
  
  // Mountain parks - afternoon for better weather and visibility
  if (parkName.includes('rocky mountain') || parkName.includes('glacier') || 
      parkName.includes('grand canyon') || parkName.includes('yosemite') ||
      parkName.includes('olympic') || parkName.includes('crater lake')) {
    return 'Afternoon';
  }
  
  // Coastal parks - morning for better weather, afternoon for activities
  if (parkName.includes('acadia') || parkName.includes('olympic') || 
      parkName.includes('channel islands') || parkName.includes('biscayne')) {
    return condition.includes('clear') ? 'Morning' : 'Afternoon';
  }
  
  // Photography-focused parks - golden hour considerations
  if (parkName.includes('arches') || parkName.includes('bryce canyon') ||
      parkName.includes('badlands') || parkName.includes('white sands')) {
    return hour < 10 ? 'Morning' : 'Evening'; // Golden hour photography
  }
  
  // Default time-based logic
  if (hour >= 5 && hour < 10) {
    return 'Morning';
  } else if (hour >= 10 && hour < 16) {
    return 'Afternoon';
  } else if (hour >= 16 && hour < 20) {
    return 'Evening';
  } else {
    return 'Morning';
  }
}

function getCurrentSeason() {
  const month = new Date().getMonth() + 1; // 1-12
  if (month >= 12 || month <= 2) return 'Winter';
  if (month >= 3 && month <= 5) return 'Spring';
  if (month >= 6 && month <= 8) return 'Summer';
  return 'Fall';
}

async function getRealParkElevation(park) {
  try {
    const lat = parseFloat(park.latitude);
    const lng = parseFloat(park.longitude);
    
    if (isNaN(lat) || isNaN(lng)) {
      console.warn('Invalid coordinates for elevation lookup');
      return '1,500ft';
    }
    
    const elevation = await elevationService.getElevation(lat, lng);
    console.log(`🏔️ Real elevation for ${park.name}: ${elevation}`);
    return elevation;
  } catch (error) {
    console.error('Error getting real elevation:', error.message);
    return '1,500ft';
  }
}

function getRealParkSize(park) {
  try {
    const size = parkSizeService.getParkSize(park.name, park.parkCode);
    const formattedSize = parkSizeService.formatSize(size);
    console.log(`📏 Real park size for ${park.name}: ${formattedSize}`);
    return formattedSize;
  } catch (error) {
    console.error('Error getting real park size:', error.message);
    return '500k acres';
  }
}

async function getPersonalizedRecommendations(user, park, weatherData, astroData) {
  try {
    const weather = weatherData?.current;
    const astro = astroData;
    const month = new Date().getMonth();
    const season = getSeason(month);
    
    const prompt = `Generate 3 personalized, actionable ACTIVITY recommendations for visiting ${park.name} today.
    
    Context:
    - Weather: ${weather?.condition || 'Unknown'}, ${weather?.temperature || 'Unknown'}°F
    - Season: ${season}
    - Moon Phase: ${astro?.moonPhase || 'Unknown'}
    - Sunrise: ${astro?.sunrise || 'Unknown'}, Sunset: ${astro?.sunset || 'Unknown'}
    - Park Type: National Park
    
    FOCUS ON ACTIVITIES ONLY:
    - Specific park activities and experiences
    - Timing suggestions (morning, afternoon, evening)
    - Photography opportunities and techniques
    - Wildlife viewing and nature experiences
    - Hiking, scenic drives, or other park activities
    
    DO NOT INCLUDE:
    - Weather analysis (that's for weather insights)
    - Stargazing info (that's for sky insights)
    - General safety tips (that's for weather insights)
    
    Each recommendation should be under 60 words and activity-focused.
    Format as a JSON array of strings.`;

    const response = await openaiService.chat([
      { role: 'user', content: prompt }
    ]);
    
    // Try to parse JSON response
    try {
      const recommendations = JSON.parse(response);
      if (Array.isArray(recommendations)) {
        console.log(`🤖 AI Generated ${recommendations.length} personalized recommendations for ${park.name}`);
        return recommendations.slice(0, 3).map(rec => rec.replace(/\*\*(.*?)\*\*/g, '$1'));
      }
    } catch (parseError) {
      console.warn('Failed to parse AI recommendations as JSON:', parseError.message);
    }
    
    // Fallback: split by lines and clean up
    const lines = response.split('\n').filter(line => line.trim()).slice(0, 3);
    return lines.map(line => line.replace(/^\d+\.\s*/, '').replace(/\*\*(.*?)\*\*/g, '$1').trim());
  } catch (error) {
    console.warn('AI recommendations unavailable:', error.message);
    return [
      `Visit ${park.name} during ${getBestTimeOfDay()} for optimal conditions.`,
      `Bring layers for changing weather and comfortable hiking shoes.`,
      `Don't forget your camera for stunning ${season} photography opportunities!`
    ];
  }
}

async function getWeatherInsights(weatherData, parkName) {
  try {
    const weather = weatherData?.current;
    if (!weather) {
      throw new Error('No weather data available');
    }

    console.log(`🌤️ Generating weather insights for ${parkName} with weather:`, weather);

    const prompt = `Generate WEATHER-FOCUSED insights for ${parkName} based on current conditions.
    
    Current Weather:
    - Temperature: ${weather.temperature}°F
    - Condition: ${weather.condition}
    - Humidity: ${weather.humidity}%
    - Wind Speed: ${weather.windSpeed} mph
    - Visibility: ${weather.visibility} miles
    
    FOCUS ONLY ON:
    - Weather impact on park experience
    - Weather-specific safety considerations
    - What to wear/bring for this weather
    - How weather affects visibility and comfort
    
    DO NOT INCLUDE:
    - General activities (that's for recommendations)
    - Photography tips (that's for recommendations)
    - Stargazing info (that's for sky insights)
    
    Keep under 120 words and be weather-specific only.`;

    const response = await openaiService.chat([
      { role: 'user', content: prompt }
    ]);
    
    const insights = response.trim().replace(/\*\*(.*?)\*\*/g, '$1');
    console.log(`🌤️ AI Generated weather insights for ${parkName}:`, insights);
    return insights;
  } catch (error) {
    console.error('Error generating weather insights:', error);
    return `Current conditions: ${weatherData?.current?.condition || 'Unknown'}, ${weatherData?.current?.temperature || 'Unknown'}°F. Check local conditions before visiting.`;
  }
}

async function getSkyInsights(astroData, parkName) {
  try {
    if (!astroData) {
      throw new Error('No astro data available');
    }

    const prompt = `Generate STARGAZING-FOCUSED insights for ${parkName} based on current sky conditions.
    
    Current Sky Data:
    - Sunrise: ${astroData.sunrise}
    - Sunset: ${astroData.sunset}
    - Moon Phase: ${astroData.moonPhase}
    - Milky Way Visibility: ${astroData.milkyWayVisibility}
    - Aurora Probability: ${astroData.auroraProbability}
    
    FOCUS ONLY ON:
    - Best times for stargazing today
    - What celestial objects are visible
    - Stargazing conditions and visibility
    - Astronomical events or highlights
    - Stargazing equipment recommendations
    
    DO NOT INCLUDE:
    - General activities (that's for recommendations)
    - Photography tips (that's for recommendations)
    - Weather info (that's for weather insights)
    
    Keep under 120 words and be stargazing-specific only.`;

    const response = await openaiService.chat([
      { role: 'user', content: prompt }
    ]);
    
    const insights = response.trim().replace(/\*\*(.*?)\*\*/g, '$1');
    console.log(`🌙 AI Generated sky insights for ${parkName}:`, insights);
    return insights;
  } catch (error) {
    console.error('Error generating sky insights:', error);
    return `Sunrise: ${astroData?.sunrise || 'Unknown'}, Sunset: ${astroData?.sunset || 'Unknown'}. Check local conditions for stargazing opportunities.`;
  }
}

function getSeason(month) {
  if (month >= 2 && month <= 4) return 'Spring';
  if (month >= 5 && month <= 7) return 'Summer';
  if (month >= 8 && month <= 10) return 'Fall';
  return 'Winter';
}

// Fallback functions for when services fail
function getFallbackParkOfDay() {
  return {
    parkCode: 'yose',
    name: 'Yosemite National Park',
    description: 'Discover amazing natural wonders and breathtaking landscapes in one of America\'s most iconic national parks.',
    image: '/background1.png',
    latitude: 37.8651,
    longitude: -119.5383,
    weather: null,
    mustDo: ['Visit Half Dome', 'See Yosemite Falls', 'Explore Mariposa Grove'],
    crowdLevel: 'Moderate',
    bestTime: 'Morning'
  };
}

function getMonthName(month) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return months[month];
}


