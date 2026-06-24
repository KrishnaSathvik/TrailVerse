import { isExploreDataTab } from './parkTabEndpoints';

/** @typedef {{ id: string; label: string; icon: import('react').ComponentType }} ExploreTab */

/**
 * @typedef {Record<string, number> & {
 *   transit?: { hasGtfs?: boolean; feeds?: number };
 * }} ExploreTabIndex
 */

/**
 * Whether an explore tab payload has items (after a lazy tab fetch).
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
      return Array.isArray(cache.brochures?.brochures) && cache.brochures.brochures.length > 0;
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
 * @deprecated Prefer lazy tab payloads; kept for FAQ helpers when index is available.
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
 * Park detail tabs — always show the full tab set; empty tabs show copy after lazy fetch.
 * @param {ExploreTab[]} allTabs
 */
export function filterVisibleExploreTabs(allTabs) {
  return allTabs;
}

export { isExploreDataTab };
