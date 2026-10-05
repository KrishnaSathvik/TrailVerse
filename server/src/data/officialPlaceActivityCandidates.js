'use strict';

/**
 * First-party named activity/place candidates for known (non-NPS) destinations.
 * Authority-tagged with official land-manager URLs — not model memory.
 *
 * Seasonal closures are annotated; live open-status remains unknown unless an
 * explicit live_state source confirms it. Planners may recommend candidates
 * with "verify same-day access" language, never "is open" from this catalog alone.
 */

const OFFICIAL_PLACE_ACTIVITY_CANDIDATES = Object.freeze({
  // Named identities checked against owner sources on 2026-09-23; no live opening claims.
  'place:known:seattle-washington-united-states': Object.freeze([
    {
        "name": "Pike Place Market",
        "category": "landmark",
        "activityTypes": [
            "walk",
            "food"
        ],
        "sourceUrl": "https://www.pikeplacemarket.org/",
        "note": "Explore the public market; individual business hours and street access vary.",
        "currentStatus": "unknown",
        "authority": "official_owner"
    },
    {
        "name": "Seattle Center",
        "category": "landmark",
        "activityTypes": [
            "walk",
            "culture"
        ],
        "sourceUrl": "https://www.seattlecenter.com/",
        "note": "Explore the arts campus; check individual attractions and current campus notices.",
        "currentStatus": "unknown",
        "authority": "official_owner"
    },
    {
        "name": "Gas Works Park",
        "category": "viewpoint",
        "activityTypes": [
            "walk",
            "viewpoint"
        ],
        "sourceUrl": "https://www.seattle.gov/parks/parks/gas-works-park",
        "note": "Public park with Seattle views; use public paths and do not enter industrial structures.",
        "currentStatus": "unknown",
        "authority": "official_owner"
    },
    {
        "name": "Olympic Sculpture Park",
        "category": "landmark",
        "activityTypes": [
            "walk",
            "art"
        ],
        "sourceUrl": "https://seattleartmuseum.org/visit/olympic-sculpture-park",
        "note": "Outdoor sculpture collection on the Seattle waterfront.",
        "currentStatus": "unknown",
        "authority": "official_owner"
    },
    {
        "name": "Seattle Art Museum",
        "category": "museum",
        "activityTypes": [
            "museum",
            "art"
        ],
        "sourceUrl": "https://www.seattleartmuseum.org/",
        "note": "Downtown art museum; check admission and opening hours.",
        "currentStatus": "unknown",
        "authority": "official_owner"
    },
    {
        "name": "Chittenden Locks",
        "category": "landmark",
        "activityTypes": [
            "walk",
            "sightseeing"
        ],
        "sourceUrl": "https://www.nws.usace.army.mil/Missions/Civil-Works/Locks-and-Dams/Chittenden-Locks/Operations/",
        "note": "Observe vessels passing through the locks from public visitor areas; verify visitor access.",
        "currentStatus": "unknown",
        "authority": "official_owner"
    }
]),
  'place:known:valley-of-fire-state-park': Object.freeze([
    {
      name: 'Atlatl Rock',
      category: 'viewpoint',
      activityTypes: ['easy_walk', 'petroglyphs', 'viewpoint'],
      difficulty: 'easy',
      exposureLevel: 'low',
      viewpointTraits: ['petroglyphs', 'short_stair_access'],
      sunsetSuitability: 'possible',
      seasonalStatus: 'typically_available',
      currentStatus: 'unknown',
      sourceUrl: 'https://parks.nv.gov/parks/valley-of-fire',
      authority: 'official_owner',
      note: 'Short stair access to petroglyph panels; confirm heat and stairs suitability.',
    },
    {
      name: "Mouse's Tank Trail",
      category: 'trail',
      activityTypes: ['easy_hike', 'petroglyphs', 'walk'],
      difficulty: 'easy',
      exposureLevel: 'low',
      viewpointTraits: ['canyon_walk', 'petroglyphs'],
      sunsetSuitability: 'low',
      seasonalStatus: 'typically_available',
      currentStatus: 'unknown',
      sourceUrl: 'https://parks.nv.gov/parks/valley-of-fire',
      authority: 'official_owner',
      note: 'Short canyon walk to a natural basin; heat-sensitive — prefer early/late.',
    },
    {
      name: 'Elephant Rock',
      category: 'viewpoint',
      activityTypes: ['easy_walk', 'viewpoint', 'photography'],
      difficulty: 'easy',
      exposureLevel: 'low',
      viewpointTraits: ['roadside_formation', 'photography'],
      sunsetSuitability: 'possible',
      seasonalStatus: 'typically_available',
      currentStatus: 'unknown',
      sourceUrl: 'https://parks.nv.gov/parks/valley-of-fire',
      authority: 'official_owner',
      note: 'Short walk to a named sandstone formation near the east entrance corridor.',
    },
    {
      name: 'The Beehives',
      category: 'viewpoint',
      activityTypes: ['easy_walk', 'viewpoint', 'photography'],
      difficulty: 'easy',
      exposureLevel: 'low',
      viewpointTraits: ['sandstone_formations', 'photography'],
      sunsetSuitability: 'possible',
      seasonalStatus: 'typically_available',
      currentStatus: 'unknown',
      sourceUrl: 'https://parks.nv.gov/parks/valley-of-fire',
      authority: 'official_owner',
      note: 'Roadside sandstone formations with short easy walks between pullouts.',
    },
    {
      name: 'Valley of Fire Scenic Drive viewpoints',
      category: 'scenic_drive',
      activityTypes: ['scenic_drive', 'viewpoint', 'photography'],
      difficulty: 'easy',
      exposureLevel: 'low',
      viewpointTraits: ['scenic_drive', 'pullouts'],
      sunsetSuitability: 'possible',
      seasonalStatus: 'typically_available',
      currentStatus: 'unknown',
      sourceUrl: 'https://parks.nv.gov/parks/valley-of-fire',
      authority: 'official_owner',
      note: 'Park road pullouts for scenery; not a substitute for a named easy hike when one is requested.',
    },
    {
      name: 'Cabins / historic CCC cabins area',
      category: 'viewpoint',
      activityTypes: ['easy_walk', 'viewpoint', 'sunset'],
      difficulty: 'easy',
      exposureLevel: 'low',
      viewpointTraits: ['historic', 'open_views'],
      sunsetSuitability: 'supported',
      seasonalStatus: 'typically_available',
      currentStatus: 'unknown',
      sourceUrl: 'https://parks.nv.gov/parks/valley-of-fire',
      authority: 'official_owner',
      note: 'Open views near the historic cabins; useful evening light when trails are heat-limited.',
    },
    {
      name: 'Valley of Fire Visitor Center',
      category: 'visitor_center',
      activityTypes: ['visitor_center', 'exhibits', 'orientation'],
      difficulty: 'easy',
      exposureLevel: 'low',
      viewpointTraits: ['exhibits', 'indoor_break'],
      sunsetSuitability: 'low',
      seasonalStatus: 'typically_available',
      currentStatus: 'unknown',
      sourceUrl: 'https://parks.nv.gov/parks/valley-of-fire',
      authority: 'official_owner',
      note: 'Indoor exhibits and a heat break between outdoor stops; confirm seasonal hours.',
    },
    {
      name: 'Rainbow Vista',
      category: 'viewpoint',
      activityTypes: ['easy_walk', 'viewpoint', 'photography'],
      difficulty: 'easy',
      exposureLevel: 'low',
      viewpointTraits: ['overlook', 'photography'],
      sunsetSuitability: 'possible',
      seasonalStatus: 'typically_available',
      currentStatus: 'unknown',
      sourceUrl: 'https://parks.nv.gov/parks/valley-of-fire',
      authority: 'official_owner',
      note: 'Short walk to a colorful overlook; better in morning or late light.',
    },
  ]),
});

function slugifyLabel(label) {
  return String(label || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Resolve activity candidates for a known-place entity.
 *
 * Entity ids from destination resolution often use the short catalog key
 * (place:known:valley-of-fire) while the activity catalog may be keyed by the
 * fuller display-name slug (place:known:valley-of-fire-state-park). Prefer
 * exact match, then displayName slug, then generic prefix/stem alias — never
 * destination-specific branches.
 */
function candidatesForEntity(entityId, options = {}) {
  const key = String(entityId || '').toLowerCase();
  if (!key) return [];
  const direct = OFFICIAL_PLACE_ACTIVITY_CANDIDATES[key];
  if (direct) return direct;

  const displayName = options.displayName || null;
  if (displayName) {
    const fromDisplay = `place:known:${slugifyLabel(displayName)}`;
    if (OFFICIAL_PLACE_ACTIVITY_CANDIDATES[fromDisplay]) {
      return OFFICIAL_PLACE_ACTIVITY_CANDIDATES[fromDisplay];
    }
  }

  const catalogKeys = Object.keys(OFFICIAL_PLACE_ACTIVITY_CANDIDATES);
  const alias = catalogKeys.find((catalogKey) => (
    catalogKey === key
    || (key.startsWith('place:known:') && catalogKey.startsWith(`${key}-`))
    || (catalogKey.startsWith('place:known:') && key.startsWith(`${catalogKey}-`))
  ));
  return alias ? OFFICIAL_PLACE_ACTIVITY_CANDIDATES[alias] : [];
}

module.exports = {
  OFFICIAL_PLACE_ACTIVITY_CANDIDATES,
  candidatesForEntity,
};
