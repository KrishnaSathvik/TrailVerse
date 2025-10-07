const npsService = require('../services/npsService');

// @desc    Get all parks
// @route   GET /api/parks
// @access  Public
exports.getAllParks = async (req, res, next) => {
  try {
    const parks = await npsService.getAllParks();
    
    res.status(200).json({
      success: true,
      count: parks.length,
      data: parks
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get park by code
// @route   GET /api/parks/:parkCode
// @access  Public
exports.getParkByCode = async (req, res, next) => {
  try {
    const { parkCode } = req.params;
    const park = await npsService.getParkByCode(parkCode);
    
    if (!park) {
      return res.status(404).json({
        success: false,
        error: 'Park not found'
      });
    }

    res.status(200).json({
      success: true,
      data: park
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get park with full details
// @route   GET /api/parks/:parkCode/details
// @access  Public
exports.getParkDetails = async (req, res, next) => {
  try {
    const { parkCode } = req.params;
    
    // Fetch all data in parallel
    const [park, activities, alerts, campgrounds, visitorCenters] = await Promise.all([
      npsService.getParkByCode(parkCode),
      npsService.getParkActivities(parkCode),
      npsService.getParkAlerts(parkCode),
      npsService.getParkCampgrounds(parkCode),
      npsService.getParkVisitorCenters(parkCode)
    ]);

    if (!park) {
      return res.status(404).json({
        success: false,
        error: 'Park not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        park,
        activities,
        alerts,
        campgrounds,
        visitorCenters
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get park alerts
// @route   GET /api/parks/:parkCode/alerts
// @access  Public
exports.getParkAlerts = async (req, res, next) => {
  try {
    const { parkCode } = req.params;
    const alerts = await npsService.getParkAlerts(parkCode);
    
    res.status(200).json({
      success: true,
      count: alerts.length,
      data: alerts
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Search parks
// @route   GET /api/parks/search
// @access  Public
exports.searchParks = async (req, res, next) => {
  try {
    const { q, state } = req.query;
    
    let parks;
    
    if (state) {
      parks = await npsService.getParksByState(state);
    } else {
      parks = await npsService.getAllParks();
    }

    // Filter by search query if provided
    if (q) {
      const query = q.toLowerCase();
      parks = parks.filter(park => 
        park.fullName.toLowerCase().includes(query) ||
        park.description.toLowerCase().includes(query) ||
        park.states.toLowerCase().includes(query)
      );
    }

    res.status(200).json({
      success: true,
      count: parks.length,
      data: parks
    });
  } catch (error) {
    next(error);
  }
};
