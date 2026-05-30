/**
 * Content filters for park Things to Do / What to See tabs (trails, viewpoints).
 */

const TRAIL_PATTERN =
  /\b(trail|hike|hiking|walk|backcountry|back-country|trek|narrows|path)\b/i;

const VIEWPOINT_PATTERN =
  /\b(overlook|viewpoint|view point|vista|scenic view|observation point|scenic overlook|panorama)\b/i;

const HIKE_CATEGORY_PATTERN = /\bhik(e|ing)\b/i;

function activityText(activity) {
  return [
    activity?.title,
    activity?.name,
    activity?.shortDescription,
    activity?.longDescription,
    ...(activity?.activities?.map((a) => a?.name) || []),
  ]
    .filter(Boolean)
    .join(' ');
}

function placeText(place) {
  return [
    place?.title,
    place?.listingDescription,
    place?.bodyText,
    ...(place?.tags || []),
  ]
    .filter(Boolean)
    .join(' ');
}

export function isTrailActivity(activity) {
  const category = activity?.activities?.[0]?.name || '';
  if (HIKE_CATEGORY_PATTERN.test(category)) return true;
  return TRAIL_PATTERN.test(activityText(activity));
}

export function isViewpointPlace(place) {
  return VIEWPOINT_PATTERN.test(placeText(place));
}

export function filterActivitiesByContent(activities, filterId) {
  if (!Array.isArray(activities)) return [];
  if (!filterId || filterId === 'all') return activities;
  if (filterId === 'trails') return activities.filter(isTrailActivity);
  return activities;
}

export function filterPlacesByContent(places, filterId) {
  if (!Array.isArray(places)) return [];
  if (!filterId || filterId === 'all') return places;
  if (filterId === 'viewpoints') return places.filter(isViewpointPlace);
  return places;
}

/** Generic NPS place tags that duplicate topic/geo info and clutter filters. */
const PLACE_TAG_BLOCKLIST = new Set([
  'hot spring',
  'hydrothermal features',
  'thermophiles',
]);

export function normalizePlaceTag(tag) {
  return String(tag || '').trim();
}

/**
 * Tags to hide from What to See chips and place cards (park names, basins/areas, boilerplate).
 * @param {string} tag
 * @param {{ fullName?: string, name?: string }} [park]
 */
export function isJunkPlaceTag(tag, park = null) {
  const t = normalizePlaceTag(tag);
  if (!t) return true;
  const lower = t.toLowerCase();
  if (lower.includes('national park')) return true;
  if (lower.length > 40) return true;
  if (PLACE_TAG_BLOCKLIST.has(lower)) return true;
  // Geographic subdivisions (e.g. Upper Geyser Basin, Old Faithful Area).
  if (/\b(basin|area)\s*$/i.test(t)) return true;
  const parkNames = [park?.fullName, park?.name].filter(Boolean).map((n) => n.toLowerCase());
  if (parkNames.some((name) => lower === name)) return true;
  return false;
}

export function getDisplayPlaceTags(tags, park = null) {
  if (!Array.isArray(tags)) return [];
  return tags.map(normalizePlaceTag).filter((t) => t && !isJunkPlaceTag(t, park));
}

/** @param {'activities' | 'places'} tab */
export function getContentFilterForTab(tab, filterParam) {
  if (!filterParam || filterParam === 'all') return 'all';
  if (tab === 'activities' && filterParam === 'trails') return 'trails';
  if (tab === 'places' && filterParam === 'viewpoints') return 'viewpoints';
  return 'all';
}
