/** Semantic icon colors. Values live in themes.css so light and dark stay separate. */

export const STOP_TYPE_COLOR = {
  park: 'var(--icon-stop-park)',
  landmark: 'var(--icon-stop-park)',
  trail: 'var(--icon-stop-hike)',
  hike: 'var(--icon-stop-hike)',
  campground: 'var(--icon-stop-camp)',
  camp: 'var(--icon-stop-camp)',
  visitor_center: 'var(--icon-stop-visitor)',
  lodging: 'var(--icon-stop-lodging)',
  lodge: 'var(--icon-stop-lodging)',
  restaurant: 'var(--icon-stop-dining)',
  food: 'var(--icon-stop-dining)',
  dining: 'var(--icon-stop-dining)',
  transport: 'var(--icon-stop-transport)',
  shuttle: 'var(--icon-stop-transport)',
  driving: 'var(--icon-stop-transport)',
  custom: 'var(--icon-muted)',
};

export function stopTypeColor(type) {
  return STOP_TYPE_COLOR[type] || STOP_TYPE_COLOR.custom;
}

export function iconTint(color, percent = 14) {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

const WATER_ACTIVITIES = new Set([
  'boating', 'fishing', 'paddling', 'swimming', 'snorkeling', 'scuba-diving',
  'surfing', 'water-skiing', 'tubing', 'kayaking', 'motorboating', 'paddle-boating',
  'rowboating', 'sailing', 'diving', 'wading', 'river-rafting', 'wind-surfing',
  'water-activities', 'ice-fishing',
]);

const DISCOVERY_ACTIVITIES = new Set([
  'photography', 'compass-and-gps', 'museum-exhibits', 'guided-tours',
  'arts-and-culture', 'astronomy', 'stargazing', 'park-film', 'living-history',
  'junior-ranger-program', 'self-guided-tours-and-trails',
]);

const TRAVEL_ACTIVITIES = new Set([
  'auto-and-atv', 'flying', 'shopping', 'horse-trekking', 'dog-sledding',
  'snowmobiling',
]);

const EVENT_ACTIVITIES = new Set(['food']);

export function toneForActivity(iconKey) {
  if (WATER_ACTIVITIES.has(iconKey)) return 'water';
  if (DISCOVERY_ACTIVITIES.has(iconKey)) return 'discovery';
  if (TRAVEL_ACTIVITIES.has(iconKey)) return 'travel';
  if (EVENT_ACTIVITIES.has(iconKey)) return 'event';
  return 'nature';
}

export function activityIconColor(iconKey) {
  return `var(--icon-${toneForActivity(iconKey)})`;
}
