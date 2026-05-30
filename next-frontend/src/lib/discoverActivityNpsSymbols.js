/**
 * Maps discover activity iconKey (slugified NPS activity name) → NPS NPMap symbol id.
 * SVG sources: nationalparkservice/symbol-library (public domain).
 */
export const ACTIVITY_NPS_SYMBOL = {
  'arts-and-culture': 'art',
  astronomy: 'star-gazing',
  stargazing: 'star-gazing',
  'auto-and-atv': 'four-wheel-drive-road',
  biking: 'bicycle-trail',
  boating: 'boating',
  camping: 'campground',
  canyoneering: 'climbing',
  caving: 'caving',
  climbing: 'climbing',
  'compass-and-gps': 'maps',
  'dog-sledding': 'dog-sledding',
  fishing: 'fishing',
  flying: 'airfield',
  food: 'food-service',
  golf: 'golfing',
  'guided-tours': 'ranger-led-events',
  'hands-on': 'tactile-exhibit',
  hiking: 'trailhead',
  'horse-trekking': 'horseback-riding',
  'hunting-and-gathering': 'hunting',
  'ice-skating': 'ice-skating',
  'junior-ranger-program': 'junior-ranger-program',
  'living-history': 'historic-feature',
  'museum-exhibits': 'museum',
  paddling: 'canoe-access',
  'park-film': 'park-film',
  playground: 'playground',
  'scuba-diving': 'scuba-diving',
  shopping: 'souvenir-shop',
  skiing: 'downhill-skiing',
  snorkeling: 'snorkeling',
  snowmobiling: 'snowmobile-trail',
  'snow-play': 'sledding',
  snowshoeing: 'snow-shoeing',
  swimming: 'swimming',
  'team-sports': 'exercise-fitness',
  tubing: 'tubing',
  'water-skiing': 'waterskiing',
  'wildlife-watching': 'birding-wildlife-viewing',
  photography: 'photography',
  'self-guided-tours-and-trails': 'self-guiding-trail',
  surfing: 'surfing',
  'water-activities': 'swimming',
  archery: 'archery',
  'metal-detecting': 'metal-detecting',
  'rock-collecting': 'rock-collecting',
  'wind-surfing': 'wind-surfing',
  kayaking: 'kayaking',
  'motorboating': 'motorboating',
  'paddle-boating': 'paddle-boating',
  rowboating: 'rowboating',
  sailing: 'sailing',
  diving: 'diving',
  wading: 'wading',
  'river-rafting': 'river-rafting',
  snowboarding: 'snowboarding',
  skateboarding: 'skateboarding',
  'in-line-skating': 'in-line-skating',
  'cross-country-skiing': 'cross-country-ski-trail',
  'ice-fishing': 'ice-fishing',
  birdwatching: 'birding-wildlife-viewing',
  'wildlife-viewing': 'birding-wildlife-viewing',
};

export const DEFAULT_ACTIVITY_SYMBOL = 'things-to-do';

export function getNpsSymbolForActivity(iconKey) {
  return ACTIVITY_NPS_SYMBOL[iconKey] || DEFAULT_ACTIVITY_SYMBOL;
}

export function getAllActivitySymbolNames() {
  return [...new Set([...Object.values(ACTIVITY_NPS_SYMBOL), DEFAULT_ACTIVITY_SYMBOL])];
}
