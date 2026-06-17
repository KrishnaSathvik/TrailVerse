/** @typedef {{ id: string; label: string; icon: import('react').ComponentType }} ExploreTab */

/**
 * @typedef {Record<string, number> & {
 *   transit?: { hasGtfs?: boolean; feeds?: number };
 * }} ExploreTabIndex
 */

/**
 * Whether an explore tab has content worth showing (full cache bundle).
 * @param {string} tabId
 * @param {Record<string, unknown> | null | undefined} cache
 * @param {{ showTransitTab?: boolean }} [options]
 */
export function exploreTabHasData(tabId, cache, { showTransitTab = false } = {}) {
  if (!cache) return false;

  const listHasItems = (key) => {
    const value = cache[key];
    return Array.isArray(value) && value.length > 0;
  };

  switch (tabId) {
    case 'activities':
      return listHasItems('activities');
    case 'places':
      return listHasItems('places');
    case 'tours':
      return listHasItems('tours');
    case 'visitorcenters':
      return listHasItems('visitorcenters');
    case 'camping':
      return listHasItems('campgrounds');
    case 'parking':
      return listHasItems('parkinglots');
    case 'facilities':
      return listHasItems('facilities');
    case 'brochures':
      return listHasItems('brochures');
    case 'photos':
      return listHasItems('gallery');
    case 'videos':
      return listHasItems('videos');
    case 'webcams':
      return listHasItems('webcams');
    case 'transit':
      if (!showTransitTab) return false;
      return Boolean(cache.transit?.hasGtfs && cache.transit?.feeds?.length > 0);
    default:
      return false;
  }
}

/**
 * Whether an explore tab has content (counts from explore-index).
 * @param {string} tabId
 * @param {ExploreTabIndex | null | undefined} index
 * @param {{ showTransitTab?: boolean }} [options]
 */
export function exploreTabHasDataFromIndex(tabId, index, { showTransitTab = false } = {}) {
  if (!index) return false;

  const count = (key) => typeof index[key] === 'number' && index[key] > 0;

  switch (tabId) {
    case 'activities':
      return count('activities');
    case 'places':
      return count('places');
    case 'tours':
      return count('tours');
    case 'visitorcenters':
      return count('visitorcenters');
    case 'camping':
      return count('campgrounds');
    case 'parking':
      return count('parkinglots');
    case 'facilities':
      return count('facilities');
    case 'brochures':
      return count('brochures');
    case 'photos':
      return count('gallery');
    case 'videos':
      return count('videos');
    case 'webcams':
      return count('webcams');
    case 'transit':
      if (!showTransitTab) return false;
      return Boolean(index.transit?.hasGtfs && (index.transit?.feeds ?? 0) > 0);
    default:
      return false;
  }
}

/**
 * @param {ExploreTab[]} allTabs
 * @param {{
 *   alertCount?: number;
 *   permitCount?: number;
 *   requestedTab?: string | null;
 *   exploreIndexReady?: boolean;
 *   exploreIndex?: ExploreTabIndex | null;
 *   exploreReady?: boolean;
 *   exploreCache?: Record<string, unknown> | null;
 *   showTransitTab?: boolean;
 * }} ctx
 */
export function filterVisibleExploreTabs(allTabs, ctx = {}) {
  const {
    alertCount = 0,
    permitCount = 0,
    requestedTab = null,
    exploreIndexReady = false,
    exploreIndex = null,
    exploreReady = false,
    exploreCache = null,
    showTransitTab = false,
  } = ctx;

  const tabOpts = { showTransitTab };
  const indexReady = exploreIndexReady || exploreReady;
  const index = exploreIndex;

  const tabHasExploreData = (tabId) => {
    if (indexReady && index) {
      return exploreTabHasDataFromIndex(tabId, index, tabOpts);
    }
    if (exploreReady && exploreCache) {
      return exploreTabHasData(tabId, exploreCache, tabOpts);
    }
    return false;
  };

  return allTabs.filter((tab) => {
    if (tab.id === 'overview' || tab.id === 'reviews') return true;
    if (tab.id === requestedTab) return true;
    if (tab.id === 'alerts') return alertCount > 0;
    if (tab.id === 'permits') return permitCount > 0;
    if (!indexReady) return false;
    return tabHasExploreData(tab.id);
  });
}
