/** /explore hero — matches legacy ExploreParksPage header */
export const EXPLORE_PAGE_BADGE = 'Explore Parks';

export const EXPLORE_SEO_HEADLINE = 'Explore National Parks';

export function exploreSeoSubtitle({ nationalParksOnly = true, nationalParksCount = 64, totalSitesCount } = {}) {
  const scope =
    nationalParksOnly && nationalParksCount > 0
      ? `${nationalParksCount} national parks`
      : totalSitesCount > 0
        ? `${totalSitesCount} parks and sites`
        : '470+ parks and sites';

  return `Discover ${scope} across America. Find your next adventure with real-time weather, reviews, and smart recommendations.`;
}

/** Shown beside the National Parks Only filter on /explore */
export function exploreNationalParksFilterHint(allSitesCount) {
  const countLabel =
    typeof allSitesCount === 'number' && allSitesCount > 0
      ? `all ${allSitesCount}`
      : 'all 470+';
  return `National parks only is on by default. Uncheck to browse ${countLabel} parks and sites. Search always covers the full catalog.`;
}
