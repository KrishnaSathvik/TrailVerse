const npsService = require('../services/npsService');
const enhancedParkService = require('../services/enhancedParkService');
const ParkReview = require('../models/ParkReview');

// @desc    Get enhanced park data for comparison
// @route   GET /api/parks/:parkCode/enhanced
// @access  Public
exports.getEnhancedParkData = async (req, res, next) => {
  try {
    const { parkCode } = req.params;
    
    // Get basic park data first
    const park = await npsService.getParkByCode(parkCode);
    if (!park) {
      return res.status(404).json({
        success: false,
        error: 'Park not found'
      });
    }

    // Get enhanced data
    const enhancedData = await enhancedParkService.getEnhancedParkData(park);

    // Get review statistics
    const reviewStats = await ParkReview.getParkStats(parkCode);

    res.status(200).json({
      success: true,
      data: {
        ...enhancedData,
        reviews: reviewStats
      }
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get enhanced comparison data for multiple parks
// @route   POST /api/parks/compare
// @access  Public
exports.getParkComparison = async (req, res, next) => {
  try {
    // Handle both GET (query params) and POST (body) requests
    let parkCodes;
    if (req.method === 'GET') {
      const parkCodesParam = req.query.parkCodes;
      parkCodes = parkCodesParam ? parkCodesParam.split(',') : [];
    } else {
      parkCodes = req.body.parkCodes;
    }

    if (!parkCodes || !Array.isArray(parkCodes) || parkCodes.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'At least 2 park codes are required for comparison'
      });
    }

    if (parkCodes.length > 4) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 4 parks can be compared at once'
      });
    }

    // Get basic park data for all parks
    console.log(`Looking for parks: ${parkCodes.join(', ')}`);
    
    const parkPromises = parkCodes.map(parkCode => 
      npsService.getParkByCode(parkCode).catch((error) => {
        console.error(`Failed to get park ${parkCode}:`, error.message);
        return null;
      })
    );
    
    const parks = await Promise.all(parkPromises);
    const validParks = parks.filter(park => park !== null);
    
    console.log(`Found ${validParks.length} valid parks out of ${parkCodes.length} requested`);

    if (validParks.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No valid parks found'
      });
    }

    // Get enhanced data for all parks
    const enhancedDataPromises = validParks.map(park => 
      enhancedParkService.getEnhancedParkData(park)
    );

    const enhancedParks = await Promise.all(enhancedDataPromises);

    // Get review statistics for all parks
    const reviewStatsPromises = parkCodes.map(parkCode => 
      ParkReview.getParkStats(parkCode)
    );

    const reviewStats = await Promise.all(reviewStatsPromises);

    // Add review stats to enhanced data
    enhancedParks.forEach((park, index) => {
      park.reviews = reviewStats[index];
    });

    // Get common activities
    const commonActivities = await enhancedParkService.getCommonActivities(validParks);

    // Generate comparison summary
    const comparison = {
      parks: enhancedParks,
      commonActivities,
      comparisonDate: new Date().toISOString(),
      totalParks: enhancedParks.length
    };

    res.status(200).json({
      success: true,
      data: comparison
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get park weather data
// @route   GET /api/parks/:parkCode/weather
// @access  Public
exports.getParkWeather = async (req, res, next) => {
  try {
    const { parkCode } = req.params;
    
    const park = await npsService.getParkByCode(parkCode);
    if (!park) {
      return res.status(404).json({
        success: false,
        error: 'Park not found'
      });
    }

    const weatherData = await enhancedParkService.getWeatherData(park);

    res.status(200).json({
      success: true,
      data: weatherData
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get park crowd level prediction
// @route   GET /api/parks/:parkCode/crowd
// @access  Public
exports.getParkCrowdLevel = async (req, res, next) => {
  try {
    const { parkCode } = req.params;
    const { date } = req.query;
    
    const park = await npsService.getParkByCode(parkCode);
    if (!park) {
      return res.status(404).json({
        success: false,
        error: 'Park not found'
      });
    }

    const targetDate = date ? new Date(date) : new Date();
    const crowdData = await enhancedParkService.getCrowdLevel(park, targetDate);

    res.status(200).json({
      success: true,
      data: crowdData
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get best time to visit park
// @route   GET /api/parks/:parkCode/best-time
// @access  Public
exports.getBestTimeToVisit = async (req, res, next) => {
  try {
    const { parkCode } = req.params;
    
    const park = await npsService.getParkByCode(parkCode);
    if (!park) {
      return res.status(404).json({
        success: false,
        error: 'Park not found'
      });
    }

    const bestTimeData = await enhancedParkService.getBestTimeToVisit(park);

    res.status(200).json({
      success: true,
      data: bestTimeData
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get enhanced facilities data
// @route   GET /api/parks/:parkCode/facilities
// @access  Public
exports.getParkFacilities = async (req, res, next) => {
  try {
    const { parkCode } = req.params;
    
    const park = await npsService.getParkByCode(parkCode);
    if (!park) {
      return res.status(404).json({
        success: false,
        error: 'Park not found'
      });
    }

    const facilities = await enhancedParkService.getEnhancedFacilities(park);

    res.status(200).json({
      success: true,
      data: facilities
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get park comparison summary
// @route   POST /api/parks/compare/summary
// @access  Public
exports.getParkComparisonSummary = async (req, res, next) => {
  try {
    // Handle both GET (query params) and POST (body) requests
    let parkCodes;
    if (req.method === 'GET') {
      const parkCodesParam = req.query.parkCodes;
      parkCodes = parkCodesParam ? parkCodesParam.split(',') : [];
    } else {
      parkCodes = req.body.parkCodes;
    }

    if (!parkCodes || !Array.isArray(parkCodes) || parkCodes.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'At least 2 park codes are required for comparison'
      });
    }

    // Get parks and their enhanced data
    const parks = await Promise.all(
      parkCodes.map(parkCode => 
        npsService.getParkByCode(parkCode).catch(() => null)
      )
    );

    const validParks = parks.filter(park => park !== null);
    if (validParks.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No valid parks found'
      });
    }

    // Get comparison data
    const [enhancedParks, commonActivities] = await Promise.all([
      Promise.all(validParks.map(park => enhancedParkService.getEnhancedParkData(park))),
      enhancedParkService.getCommonActivities(validParks)
    ]);

    // Generate summary
    const summary = {
      totalParks: enhancedParks.length,
      averageRating: enhancedParks.reduce((sum, park) => sum + (park.reviews?.averageRating || 0), 0) / enhancedParks.length,
      commonActivities: commonActivities,
      weatherComparison: compareWeather(enhancedParks),
      crowdComparison: compareCrowdLevels(enhancedParks),
      facilitiesComparison: compareFacilities(enhancedParks),
      bestOverall: findBestOverallPark(enhancedParks)
    };

    res.status(200).json({
      success: true,
      data: summary
    });

  } catch (error) {
    next(error);
  }
};

// Helper methods for comparison summary
function compareWeather(parks) {
  const currentTemps = parks.map(park => ({
    parkCode: park.parkCode,
    parkName: park.fullName,
    temperature: park.weather?.current?.temperature || 'N/A',
    condition: park.weather?.current?.condition || 'N/A'
  }));

  const avgTemp = currentTemps.reduce((sum, park) => {
    const temp = typeof park.temperature === 'number' ? park.temperature : 0;
    return sum + temp;
  }, 0) / currentTemps.length;

  return {
    currentTemperatures: currentTemps,
    averageTemperature: Math.round(avgTemp),
    warmest: currentTemps.reduce((warmest, current) => {
      const currentTemp = typeof current.temperature === 'number' ? current.temperature : -999;
      const warmestTemp = typeof warmest.temperature === 'number' ? warmest.temperature : -999;
      return currentTemp > warmestTemp ? current : warmest;
    }),
    coolest: currentTemps.reduce((coolest, current) => {
      const currentTemp = typeof current.temperature === 'number' ? current.temperature : 999;
      const coolestTemp = typeof coolest.temperature === 'number' ? coolest.temperature : 999;
      return currentTemp < coolestTemp ? current : coolest;
    })
  };
}

function compareCrowdLevels(parks) {
  const crowdLevels = parks.map(park => ({
    parkCode: park.parkCode,
    parkName: park.fullName,
    level: park.crowdLevel?.level || 'Unknown',
    confidence: park.crowdLevel?.confidence || 0
  }));

  const levelOrder = { 'Very Low': 1, 'Low': 2, 'Moderate': 3, 'High': 4, 'Very High': 5 };
  
  const leastCrowded = crowdLevels.reduce((least, current) => {
    const currentLevel = levelOrder[current.level] || 3;
    const leastLevel = levelOrder[least.level] || 3;
    return currentLevel < leastLevel ? current : least;
  });

  const mostCrowded = crowdLevels.reduce((most, current) => {
    const currentLevel = levelOrder[current.level] || 3;
    const mostLevel = levelOrder[most.level] || 3;
    return currentLevel > mostLevel ? current : most;
  });

  return {
    crowdLevels,
    leastCrowded,
    mostCrowded,
    averageLevel: 'Moderate' // Could be calculated more precisely
  };
}

function compareFacilities(parks) {
  const facilities = {
    visitorCenters: parks.map(park => ({
      parkCode: park.parkCode,
      parkName: park.fullName,
      available: park.facilities?.visitorCenters?.available || false,
      count: park.facilities?.visitorCenters?.count || 0
    })),
    camping: parks.map(park => ({
      parkCode: park.parkCode,
      parkName: park.fullName,
      available: park.facilities?.camping?.available || false,
      count: park.facilities?.camping?.count || 0
    })),
    lodging: parks.map(park => ({
      parkCode: park.parkCode,
      parkName: park.fullName,
      available: park.facilities?.lodging?.available || false
    }))
  };

  return facilities;
}

function findBestOverallPark(parks) {
  // Simple scoring system based on ratings and crowd levels
  const scoredParks = parks.map(park => {
    const rating = park.reviews?.averageRating || 0;
    const crowdLevel = park.crowdLevel?.level || 'Moderate';
    const crowdScore = { 'Very Low': 5, 'Low': 4, 'Moderate': 3, 'High': 2, 'Very High': 1 }[crowdLevel] || 3;
    
    const score = (rating * 2) + crowdScore; // Weight rating more heavily
    
    return {
      parkCode: park.parkCode,
      parkName: park.fullName,
      score,
      rating,
      crowdLevel
    };
  });

  return scoredParks.sort((a, b) => b.score - a.score)[0];
}
