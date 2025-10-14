const npsService = require('../services/npsService');

// @desc    Get all parks with pagination
// @route   GET /api/parks?page=1&limit=12
// @access  Public
exports.getAllParks = async (req, res, next) => {
  try {
    // Parse pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skipPagination = req.query.all === 'true'; // Allow fetching all parks with ?all=true
    
    // Fetch all parks from NPS service (cached internally)
    const allParks = await npsService.getAllParks();
    
    // Apply national parks only filter if requested (strictly "National Park" designation)
    const nationalParksOnly = req.query.nationalParksOnly === 'true';
    let filteredParks = allParks;
    
    if (nationalParksOnly) {
      // Include parks with "National Park" in their designation (61 parks)
      filteredParks = allParks.filter(park => 
        park.designation && park.designation.toLowerCase().includes('national park')
      );
    }
    
    // If client wants all parks (for filtering/searching), return everything
    if (skipPagination) {
      return res.status(200).json({
        success: true,
        count: filteredParks.length,
        total: filteredParks.length,
        page: 1,
        pages: 1,
        data: filteredParks
      });
    }
    
    // Apply pagination to filtered results
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedParks = filteredParks.slice(startIndex, endIndex);
    const totalPages = Math.ceil(filteredParks.length / limit);
    
    res.status(200).json({
      success: true,
      count: paginatedParks.length,
      total: filteredParks.length,
      page,
      pages: totalPages,
      hasMore: page < totalPages,
      data: paginatedParks
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
