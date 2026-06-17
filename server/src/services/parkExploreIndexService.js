const NodeCache = require('node-cache');
const npsService = require('./npsService');
const gtfsCatalogService = require('./gtfsCatalogService');

const INDEX_CACHE_TTL_SEC = 24 * 60 * 60; // 24h — counts mirror slow-changing NPS catalog data
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
    safeArrayCount(() => npsService.getParkActivities(code)),
    safeArrayCount(() => npsService.getParkPlaces(code)),
    safeArrayCount(() => npsService.getParkTours(code)),
    safeArrayCount(() => npsService.getParkVisitorCenters(code)),
    safeArrayCount(() => npsService.getParkCampgrounds(code)),
    safeArrayCount(() => npsService.getParkParkingLots(code)),
    safeArrayCount(() => npsService.getParkAmenities(code)),
    Promise.resolve().then(() => {
      const { getBrochureCountForIndex } = require('../controllers/parkController');
      return getBrochureCountForIndex(code);
    }),
    safeArrayCount(() => npsService.getParkGalleryPhotos(code)),
    safeArrayCount(() => npsService.getParkVideos(code)),
    safeArrayCount(() => npsService.getParkWebcams(code)),
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

  indexCache.set(code, index);
  return index;
}

module.exports = {
  buildExploreIndex,
};
