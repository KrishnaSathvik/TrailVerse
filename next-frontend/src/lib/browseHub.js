/** User-facing name for the /discover taxonomy hub (URLs stay /discover for SEO). */
export const BROWSE_HUB_PATH = '/discover';

export const BROWSE_HUB_NAV_LABEL = 'Explore by Activity';

/** Short label for back links and breadcrumbs */
export const BROWSE_HUB_TITLE = 'Explore by Activity';

/** Back-link label for pages whose parent is the /discover hub itself */
export const BROWSE_HUB_BACK_LABEL = 'Discover';

/** Parent index page for each Discover detail dimension (back links on detail/state pages). */
export const DISCOVER_INDEX_BY_DIMENSION = {
  activity: { href: '/discover/activities', label: 'All activities' },
  topic: { href: '/discover/topics', label: 'All topics' },
  type: { href: '/discover/types', label: 'All park types' },
  state: { href: '/discover/states', label: 'All states' },
};

/** Main hub page headline (H1) */
export const BROWSE_HUB_HEADLINE = 'Find your kind of park';

export const BROWSE_HUB_DESCRIPTION =
  "Start with what you're in the mood for—a hike, a historic site, stargazing, or parks in your state—and see everywhere that fits.";

export const BROWSE_HUB_SEO_TITLE = 'Explore Parks by Activity, State & Topic';

export const BROWSE_HUB_META_DESCRIPTION =
  'Find parks by activity, state, park type, or topic—hiking, camping, stargazing, monuments, and more across America.';

export const BROWSE_HUB_OG_TITLE = 'Explore Parks by Activity | TrailVerse';

/** Suffix for detail/grid page titles, e.g. "Hiking | Explore by Activity" */
export const BROWSE_HUB_PAGE_SUFFIX = 'Explore by Activity';

export const BROWSE_HUB_CTA_LABEL = 'Explore by activity & state';
