const npsService = require('../services/npsService');

const normalizeActivityName = (activityName = '') => {
  const name = activityName.toLowerCase();

  if (
    name.includes('hike') ||
    name.includes('walk') ||
    name.includes('trail') ||
    name.includes('front-country') ||
    name.includes('back-country') ||
    name.includes('backpack') ||
    name.includes('trek')
  ) {
    return 'Hiking';
  }

  if (name.includes('camp') || name.includes('backpack')) {
    return 'Camping';
  }

  if (name.includes('photo') || name.includes('scenic') || name.includes('view')) {
    return 'Photography';
  }

  if (name.includes('wildlife') || name.includes('bird') || name.includes('animal')) {
    return 'Wildlife Watching';
  }

  if (
    name.includes('kayak') ||
    name.includes('canoe') ||
    name.includes('boat') ||
    name.includes('swim')
  ) {
    return 'Boating';
  }

  if (name.includes('climb') || name.includes('canyoneer') || name.includes('adventure')) {
    return 'Climbing';
  }

  if (name.includes('star') || name.includes('astronomy') || name.includes('night')) {
    return 'Stargazing';
  }

  if (name.includes('fish')) {
    return 'Fishing';
  }

  if (name.includes('bike') || name.includes('cycle')) {
    return 'Biking';
  }

  return null;
};

const buildParkActivityIndex = async () => {
  const allActivities = await npsService.getAllActivities(5000);
  const activityIndex = new Map();

  allActivities.forEach((thingToDo) => {
    const relatedParks = Array.isArray(thingToDo?.relatedParks) ? thingToDo.relatedParks : [];
    if (!relatedParks.length || !Array.isArray(thingToDo.activities)) return;

    thingToDo.activities.forEach((activity) => {
      if (!activity?.name) return;
      const normalized = normalizeActivityName(activity.name);
      if (!normalized) return;

      relatedParks.forEach((park) => {
        const parkCode = park?.parkCode?.toLowerCase();
        if (!parkCode) return;

        if (!activityIndex.has(parkCode)) {
          activityIndex.set(parkCode, new Map());
        }

        activityIndex.get(parkCode).set(normalized, { name: normalized });
      });
    });
  });

  return activityIndex;
};

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

    const includeActivities = req.query.includeActivities === 'true';

    if (skipPagination && includeActivities) {
      const activityIndex = await buildParkActivityIndex();

      filteredParks = filteredParks.map((park) => ({
        ...park,
        activities: Array.from(activityIndex.get(park.parkCode?.toLowerCase())?.values() || [])
      }));
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

// In-memory cache for brochure URLs (30 days)
const brochureCache = new Map();
const BROCHURE_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

// @desc    Get park brochure/PDF links by scraping NPS brochure pages
// @route   GET /api/parks/:parkCode/brochures
// @access  Public
exports.getParkBrochures = async (req, res, next) => {
  try {
    const parkCode = req.params.parkCode.toLowerCase();

    // Check cache
    const cached = brochureCache.get(parkCode);
    if (cached && Date.now() - cached.timestamp < BROCHURE_CACHE_TTL) {
      return res.status(200).json({ success: true, data: cached.data, cached: true });
    }

    const cheerio = require('cheerio');

    // Try multiple known URL patterns for brochure pages
    const pagePaths = [
      `/${parkCode}/planyourvisit/brochures.htm`,
      `/${parkCode}/planyourvisit/park-brochure.htm`,
      `/${parkCode}/planyourvisit/publications.htm`,
      `/${parkCode}/planyourvisit/maps.htm`
    ];

    const brochures = [];
    const seenUrls = new Set();

    for (const pagePath of pagePaths) {
      try {
        const url = `https://www.nps.gov${pagePath}`;
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; TrailVerse/1.0; +https://www.nationalparksexplorerusa.com)',
            'Accept': 'text/html'
          },
          signal: AbortSignal.timeout(8000)
        });

        if (!response.ok) continue;

        const html = await response.text();
        const $ = cheerio.load(html);

        // Find all PDF links on the page
        $('a[href*=".pdf"]').each((_, el) => {
          let href = $(el).attr('href');
          if (!href) return;

          // Make absolute URL
          if (href.startsWith('/')) {
            href = `https://www.nps.gov${href}`;
          } else if (!href.startsWith('http')) {
            href = `https://www.nps.gov/${parkCode}/planyourvisit/${href}`;
          }

          // Skip duplicates
          if (seenUrls.has(href)) return;
          seenUrls.add(href);

          // Get link text as title, clean it up
          let title = $(el).text().trim();
          if (!title || title.length < 2) {
            // Try parent element or alt text
            title = $(el).find('img').attr('alt') || $(el).attr('title') || '';
          }
          if (!title || title.length < 2) {
            // Extract title from filename
            const filename = href.split('/').pop().replace('.pdf', '').replace(/[-_]/g, ' ');
            title = filename.replace(/\b\w/g, c => c.toUpperCase());
          }

          brochures.push({
            title: title.substring(0, 200),
            url: href,
            source: pagePath
          });
        });
      } catch {
        // Page doesn't exist or timed out, try next pattern
        continue;
      }
    }

    // Always add a fallback link to the NPS Plan Your Visit page
    const result = {
      brochures,
      planYourVisitUrl: `https://www.nps.gov/${parkCode}/planyourvisit/index.htm`,
      scrapedAt: new Date().toISOString()
    };

    // Cache the result
    brochureCache.set(parkCode, { data: result, timestamp: Date.now() });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// @desc    Get park permits/reservations from Recreation.gov RIDB API
// @route   GET /api/parks/:parkCode/permits
// @access  Public
exports.getParkPermits = async (req, res, next) => {
  try {
    const ridbService = require('../services/ridbService');
    const { parkCode } = req.params;
    const data = await ridbService.getPermitsForPark(parkCode);
    res.status(200).json({ success: true, count: data.length, data });
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
