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
      // Include parks with "National Park" in their designation or fullName
      // (some parks like National Park of American Samoa have an empty designation)
      filteredParks = allParks.filter(park =>
        (park.designation && park.designation.toLowerCase().includes('national park')) ||
        (park.fullName && park.fullName.toLowerCase().includes('national park'))
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

    // Project only requested fields (e.g. ?fields=parkCode,fullName)
    const fieldsParam = req.query.fields;
    if (fieldsParam) {
      const allowed = fieldsParam.split(',').map(f => f.trim()).filter(Boolean);
      filteredParks = filteredParks.map(park => {
        const proj = {};
        for (const key of allowed) {
          if (park[key] !== undefined) proj[key] = park[key];
        }
        return proj;
      });
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
exports.getParkFacilities = makeTabHandler(npsService.getParkAmenities.bind(npsService), 'facilities');

// In-memory cache for brochure URLs (30 days, max 200 parks)
const brochureCache = new Map();
const BROCHURE_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const BROCHURE_CACHE_MAX = 200;

// Periodically evict expired brochure cache entries (every 6 hours)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of brochureCache) {
    if (now - val.timestamp >= BROCHURE_CACHE_TTL) {
      brochureCache.delete(key);
    }
  }
  // If still over limit, evict oldest entries
  if (brochureCache.size > BROCHURE_CACHE_MAX) {
    const sorted = [...brochureCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    const excess = brochureCache.size - BROCHURE_CACHE_MAX;
    for (let i = 0; i < excess; i++) {
      brochureCache.delete(sorted[i][0]);
    }
  }
}, 6 * 60 * 60 * 1000);

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

    // Keywords that indicate non-brochure PDFs we should skip
    const skipPatterns = /(press-release|news-release|compliance|foia|procurement|contract|solicitation|rfp|rfq|audit|financial|budget|meeting-minutes|agenda|resume|application-form|w-9|w9|1099|tax-form|reimbursement)/i;

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

          // Make absolute URL — use URL resolver for relative paths
          try {
            const baseUrl = `https://www.nps.gov${pagePath}`;
            href = new URL(href, baseUrl).href;
          } catch {
            return;
          }

          // Only include PDFs hosted on nps.gov or home.nps.gov
          if (!/^https?:\/\/(www\.|home\.)?nps\.gov\//i.test(href)) return;

          // Normalize home.nps.gov to www.nps.gov
          href = href.replace(/^https?:\/\/home\.nps\.gov/i, 'https://www.nps.gov');

          // Must be a PDF
          if (!/\.pdf(\?|#|$)/i.test(href)) return;

          // Skip irrelevant documents
          if (skipPatterns.test(href)) return;

          // Skip duplicates
          if (seenUrls.has(href)) return;
          seenUrls.add(href);

          // Get link text as title, clean it up
          let title = $(el).text().trim().replace(/\s+/g, ' ');
          // Remove common noise like "(PDF)" or "[PDF]" suffixes
          title = title.replace(/\s*[\(\[]pdf[\)\]]\s*$/i, '').trim();

          if (!title || title.length < 3 || /^(download|click here|view|more|link|pdf|here)$/i.test(title)) {
            // Try aria-label, title attr, or img alt
            title = $(el).attr('aria-label') || $(el).attr('title') || $(el).find('img').attr('alt') || '';
            title = title.trim();
          }
          if (!title || title.length < 3) {
            // Extract title from filename
            const filename = href.split('/').pop().split('?')[0].replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
            title = filename.replace(/\b\w/g, c => c.toUpperCase()).trim();
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
    const { q, state, activity, limit } = req.query;

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

    // Filter by activity if provided
    if (activity) {
      const activityQuery = activity.toLowerCase();
      parks = parks.filter(park => {
        const activities = park.activities || [];
        return activities.some(a => {
          const name = (typeof a === 'string' ? a : a.name || '').toLowerCase();
          return name.includes(activityQuery);
        });
      });
    }

    // Apply limit if provided
    if (limit) {
      parks = parks.slice(0, parseInt(limit, 10));
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
