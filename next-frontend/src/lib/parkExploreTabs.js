/** @typedef {{ id: string; label: string; icon: import('react').ComponentType }} ExploreTab */

/**
 * Whether an explore tab has content worth showing.
 * @param {string} tabId
 * @param {Record<string, unknown> | null | undefined} cache
 * @param {{ showTransitTab?: boolean }} options
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
 * @param {ExploreTab[]} allTabs
 * @param {{
 *   alertCount?: number;
 *   permitCount?: number;
 *   requestedTab?: string | null;
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
    exploreReady = false,
    exploreCache = null,
    showTransitTab = false,
  } = ctx;

  return allTabs.filter((tab) => {
    if (tab.id === 'overview' || tab.id === 'reviews') return true;
    if (tab.id === requestedTab) return true;
    if (tab.id === 'alerts') return alertCount > 0;
    if (tab.id === 'permits') return permitCount > 0;
    if (!exploreReady) return false;
    return exploreTabHasData(tab.id, exploreCache, { showTransitTab });
  });
}
