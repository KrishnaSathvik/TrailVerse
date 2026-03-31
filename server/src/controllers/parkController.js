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

// @desc    Get park with essential details (fast initial load — park info + alerts only)
// @route   GET /api/parks/:parkCode/details
// @access  Public
exports.getParkDetails = async (req, res, next) => {
  try {
    const { parkCode } = req.params;

    const [parkResult, alertsResult] = await Promise.allSettled([
      npsService.getParkByCode(parkCode),
      npsService.getParkAlerts(parkCode)
    ]);

    const park = parkResult.status === 'fulfilled' ? parkResult.value : null;
    const alerts = alertsResult.status === 'fulfilled' ? alertsResult.value : [];

    if (!park) {
      return res.status(404).json({ success: false, error: 'Park not found' });
    }

    res.status(200).json({ success: true, data: { park, alerts } });
  } catch (error) {
    next(error);
  }
};

// --- Individual tab endpoints (lazy-loaded by frontend on tab click) ---

// Helper to create a simple per-park endpoint handler
const makeTabHandler = (serviceFn, label) => async (req, res, next) => {
  try {
    const { parkCode } = req.params;
    const data = await serviceFn(parkCode);
    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    next(error);
  }
};

exports.getParkAlerts = makeTabHandler(npsService.getParkAlerts.bind(npsService), 'alerts');
exports.getParkActivities = makeTabHandler(npsService.getParkActivities.bind(npsService), 'activities');
exports.getParkCampgrounds = makeTabHandler(npsService.getParkCampgrounds.bind(npsService), 'campgrounds');
exports.getParkVisitorCenters = makeTabHandler(npsService.getParkVisitorCenters.bind(npsService), 'visitorCenters');
exports.getParkPlaces = makeTabHandler(npsService.getParkPlaces.bind(npsService), 'places');
exports.getParkTours = makeTabHandler(npsService.getParkTours.bind(npsService), 'tours');
exports.getParkWebcams = makeTabHandler(npsService.getParkWebcams.bind(npsService), 'webcams');
exports.getParkVideos = makeTabHandler(npsService.getParkVideos.bind(npsService), 'videos');
exports.getParkGalleryPhotos = makeTabHandler(npsService.getParkGalleryPhotos.bind(npsService), 'galleryPhotos');
exports.getParkParkingLots = makeTabHandler(npsService.getParkParkingLots.bind(npsService), 'parkingLots');

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
