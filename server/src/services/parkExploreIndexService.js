const NodeCache = require('node-cache');
const { getNpsService } = require('./npsService');
const gtfsCatalogService = require('./gtfsCatalogService');

const INDEX_CACHE_TTL_SEC = 24 * 60 * 60; // 24h — counts mirror slow-changing NPS catalog data
const SPARSE_INDEX_CACHE_TTL_SEC = 5 * 60; // retry soon when explore-index looks under-counted
const EXPLORE_INDEX_COUNT_KEYS = [
  'activities',
  'places',
  'tours',
  'visitorcenters',
  'campgrounds',
  'parkinglots',
  'facilities',
  'brochures',
  'gallery',
  'videos',
  'webcams',
];
const indexCache = new NodeCache({
  stdTTL: INDEX_CACHE_TTL_SEC,
  maxKeys: 600,
  checkperiod: 120,
});

async function safeArrayCount(getter) {
  try {
    const data = await getter();
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

async function buildExploreIndex(parkCode) {
  const code = String(parkCode || '').toLowerCase();
  if (!code) {
    throw new Error('parkCode is required');
  }

  const cached = indexCache.get(code);
  if (cached !== undefined) {
    return cached;
  }

  const [
    activities,
    places,
    tours,
    visitorcenters,
    campgrounds,
    parkinglots,
    facilities,
    brochures,
    gallery,
    videos,
    webcams,
    transitFeedCount,
  ] = await Promise.all([
    safeArrayCount(() => getNpsService().getParkActivities(code)),
    safeArrayCount(() => getNpsService().getParkPlaces(code)),
    safeArrayCount(() => getNpsService().getParkTours(code)),
    safeArrayCount(() => getNpsService().getParkVisitorCenters(code)),
    safeArrayCount(() => getNpsService().getParkCampgrounds(code)),
    safeArrayCount(() => getNpsService().getParkParkingLots(code)),
    safeArrayCount(() => getNpsService().getParkAmenities(code)),
    Promise.resolve().then(() => {
      const { getBrochureCountForIndex } = require('../controllers/parkController');
      return getBrochureCountForIndex(code);
    }),
    safeArrayCount(() => getNpsService().getParkGalleryPhotos(code)),
    safeArrayCount(() => getNpsService().getParkVideos(code)),
    safeArrayCount(() => getNpsService().getParkWebcams(code)),
    gtfsCatalogService
      .getFeedsForPark(code)
      .then(({ feeds }) => (Array.isArray(feeds) ? feeds.length : 0))
      .catch(() => 0),
  ]);

  const index = {
    activities,
    places,
    tours,
    visitorcenters,
    campgrounds,
    parkinglots,
    facilities,
    brochures,
    gallery,
    videos,
    webcams,
    transit: {
      hasGtfs: transitFeedCount > 0,
      feeds: transitFeedCount,
    },
  };

  const contentTotal = EXPLORE_INDEX_COUNT_KEYS.reduce(
    (sum, key) => sum + (index[key] || 0),
    0
  );
  const cacheTtlSec = contentTotal <= 2 ? SPARSE_INDEX_CACHE_TTL_SEC : INDEX_CACHE_TTL_SEC;
  indexCache.set(code, index, cacheTtlSec);
  return index;
}

module.exports = {
  buildExploreIndex,
};
