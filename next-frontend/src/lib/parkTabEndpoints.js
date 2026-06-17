/** UI tab id → API path segment under /api/parks/:code/ */
export const TAB_ID_TO_ENDPOINT = {
  activities: 'activities',
  places: 'places',
  tours: 'tours',
  visitorcenters: 'visitorcenters',
  camping: 'campgrounds',
  parking: 'parkinglots',
  facilities: 'facilities',
  brochures: 'brochures',
  photos: 'gallery',
  videos: 'videos',
  webcams: 'webcams',
  transit: 'transit',
};

/** UI tab id → explore cache / index object key */
export const TAB_ID_TO_CACHE_KEY = {
  activities: 'activities',
  places: 'places',
  tours: 'tours',
  visitorcenters: 'visitorcenters',
  camping: 'campgrounds',
  parking: 'parkinglots',
  facilities: 'facilities',
  brochures: 'brochures',
  photos: 'gallery',
  videos: 'videos',
  webcams: 'webcams',
  transit: 'transit',
};

export function isExploreDataTab(tabId) {
  return Boolean(tabId && TAB_ID_TO_ENDPOINT[tabId]);
}
