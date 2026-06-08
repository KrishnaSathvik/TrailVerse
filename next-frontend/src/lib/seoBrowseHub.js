import { parkToSlug } from '@/utils/parkSlug';

/** Featured parks for crawlable SEO link blocks (map, explore, park related). */
export const SEO_FEATURED_PARKS = [
  { code: 'yell', name: 'Yellowstone National Park' },
  { code: 'yose', name: 'Yosemite National Park' },
  { code: 'grca', name: 'Grand Canyon National Park' },
  { code: 'zion', name: 'Zion National Park' },
  { code: 'grte', name: 'Grand Teton National Park' },
  { code: 'arch', name: 'Arches National Park' },
  { code: 'brca', name: 'Bryce Canyon National Park' },
  { code: 'glac', name: 'Glacier National Park' },
  { code: 'acad', name: 'Acadia National Park' },
  { code: 'grsm', name: 'Great Smoky Mountains National Park' },
  { code: 'olym', name: 'Olympic National Park' },
  { code: 'deva', name: 'Death Valley National Park' },
];

export function seoParkHref(fullName) {
  return `/parks/${parkToSlug(fullName)}`;
}

export const SEO_STATE_LINKS = [
  { href: '/parks/state/utah', label: 'Utah parks' },
  { href: '/parks/state/california', label: 'California parks' },
  { href: '/parks/state/colorado', label: 'Colorado parks' },
  { href: '/parks/state/wyoming', label: 'Wyoming parks' },
  { href: '/parks/state/arizona', label: 'Arizona parks' },
  { href: '/parks/state/washington', label: 'Washington parks' },
  { href: '/parks/state/montana', label: 'Montana parks' },
  { href: '/parks/state/alaska', label: 'Alaska parks' },
];

export const SEO_ACTIVITY_LINKS = [
  { href: '/discover/activity/hiking', label: 'Hiking' },
  { href: '/discover/activity/camping', label: 'Camping' },
  { href: '/discover/activity/wildlife-watching', label: 'Wildlife watching' },
  { href: '/discover/activity/astronomy', label: 'Stargazing' },
  { href: '/discover/activity/auto-and-atv', label: 'Scenic drives' },
  { href: '/parks-for-photography', label: 'Photography' },
];

/** Slugs from server TYPE_GROUPS in discoverUtils.js */
export const SEO_TYPE_LINKS = [
  { href: '/discover/type/parks', label: 'National parks' },
  { href: '/discover/type/monuments', label: 'National monuments' },
  { href: '/discover/type/historic-sites', label: 'Historic sites' },
  { href: '/discover/type/recreation-areas', label: 'Recreation areas' },
];

export const SEO_INTENT_LINKS = [
  { href: '/parks-for-families', label: 'Family-friendly parks' },
  { href: '/quiet-national-parks', label: 'Quiet escapes' },
  { href: '/dark-sky-parks', label: 'Dark sky parks' },
  { href: '/parks-for-first-timers', label: 'First-time visitors' },
  { href: '/fall-color-parks', label: 'Fall color' },
  { href: '/wildlife-national-parks', label: 'Wildlife viewing' },
];
