import { parkToSlug } from '@/utils/parkSlug';
import { htmlToPlainText } from '@/utils/htmlUtils';

/** Tier A parks — GSC Performance + blog traffic (May 2026). */
export const TIER_A_PARK_SLUGS = new Set([
  'yosemite-national-park',
  'grand-canyon-national-park',
  'zion-national-park',
  'yellowstone-national-park',
  'grand-teton-national-park',
  'acadia-national-park',
  'glacier-national-park',
  'black-canyon-of-the-gunnison-national-park',
  'death-valley-national-park',
  'arches-national-park',
  'canyonlands-national-park',
  'big-bend-national-park',
  'crater-lake-national-park',
  'glacier-bay-national-park-and-preserve',
  'rocky-mountain-national-park',
  'wrangell-st-elias-national-park-and-preserve',
  'capitol-reef-national-park',
  'bryce-canyon-national-park',
  'joshua-tree-national-park',
  'great-smoky-mountains-national-park',
  'olympic-national-park',
  'everglades-national-park',
  'denali-national-park-and-preserve',
  'sequoia-and-kings-canyon-national-parks',
  'badlands-national-park',
  'lassen-volcanic-national-park',
  'dry-tortugas-national-park',
  'indiana-dunes-national-park',
  'white-sands-national-park',
  'mount-rainier-national-park',
]);

const STATE_CODE_TO_HUB_SLUG = {
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california',
  CO: 'colorado', CT: 'connecticut', DE: 'delaware', DC: 'district-of-columbia',
  FL: 'florida', GA: 'georgia', HI: 'hawaii', ID: 'idaho', IL: 'illinois',
  IN: 'indiana', IA: 'iowa', KS: 'kansas', KY: 'kentucky', LA: 'louisiana',
  ME: 'maine', MD: 'maryland', MA: 'massachusetts', MI: 'michigan', MN: 'minnesota',
  MS: 'mississippi', MO: 'missouri', MT: 'montana', NE: 'nebraska', NV: 'nevada',
  NH: 'new-hampshire', NJ: 'new-jersey', NM: 'new-mexico', NY: 'new-york',
  NC: 'north-carolina', ND: 'north-dakota', OH: 'ohio', OK: 'oklahoma', OR: 'oregon',
  PA: 'pennsylvania', RI: 'rhode-island', SC: 'south-carolina', SD: 'south-dakota',
  TN: 'tennessee', TX: 'texas', UT: 'utah', VT: 'vermont', VA: 'virginia',
  WA: 'washington', WV: 'west-virginia', WI: 'wisconsin', WY: 'wyoming',
  AS: 'american-samoa', GU: 'guam', PR: 'puerto-rico', VI: 'virgin-islands',
};

const TIER_A_HOOKS = {
  'yosemite-national-park': 'Granite icons, waterfall hikes, and seasonal road access matter here.',
  'grand-canyon-national-park': 'South Rim viewpoints, inner-canyon heat, and shuttle timing shape most visits.',
  'zion-national-park': 'Shuttle seasons, Angel\'s Landing permits, and flash-flood awareness are essential.',
  'yellowstone-national-park': 'Geyser basins, wildlife corridors, and summer crowds need daily planning.',
  'grand-teton-national-park': 'Jackson Hole access, Jenny Lake trails, and short alpine seasons define trips.',
  'acadia-national-park': 'Coastal drives, Cadillac Mountain sunrise, and tide-dependent trails stand out.',
  'glacier-national-park': 'Going-to-the-Sun Road timing, lake shuttles, and bear-country prep are top priorities.',
  'black-canyon-of-the-gunnison-national-park': 'Sheer canyon rims, steep overlooks, and limited guardrails reward careful pacing.',
  'death-valley-national-park': 'Extreme heat, remote fuel stops, and starry winter nights define the experience.',
  'arches-national-park': 'Delicate Arch at sunset, timed entry windows, and Moab lodging logistics drive itineraries.',
  'canyonlands-national-park': 'Island in the Sky overlooks and White Rim planning attract most first-time visitors.',
  'big-bend-national-park': 'River canyons, borderland drives, and long distances between trailheads require buffer time.',
  'crater-lake-national-park': 'Rim drives, boat tours, and deep snow closures vary sharply by month.',
  'glacier-bay-national-park-and-preserve': 'Boat tours, wildlife viewing, and Alaska weather windows dominate access.',
  'rocky-mountain-national-park': 'Timed entry, Trail Ridge Road, and elk rut seasons affect every itinerary.',
  'wrangell-st-elias-national-park-and-preserve': 'America\'s largest park rewards flightseeing, bush planes, and multi-day logistics.',
  'capitol-reef-national-park': 'Waterpocket Fold scenery, orchard harvests, and Utah Mighty 5 road trips pair well.',
  'bryce-canyon-national-park': 'Hoodoo amphitheaters, sunrise viewpoints, and high-elevation cold nights surprise many visitors.',
  'joshua-tree-national-park': 'Boulder scrambling, dark-sky camping, and spring wildflower peaks draw weekend trips.',
  'great-smoky-mountains-national-park': 'America\'s busiest park blends smoky vistas, historic structures, and fall foliage drives.',
  'olympic-national-park': 'Rainforest valleys, wild beaches, and Hurricane Ridge weather shifts require flexible plans.',
  'everglades-national-park': 'Airboat alternatives, paddling trails, and wet-season mosquitoes shape comfort levels.',
  'denali-national-park-and-preserve': 'Bus-only interior access, short summer windows, and wildlife viewing define visits.',
  'sequoia-and-kings-canyon-national-parks': 'Giant sequoia groves, mountain passes, and dual-park routing need one combined plan.',
  'badlands-national-park': 'Eroded formations, bighorn sightings, and prairie wind exposure reward early starts.',
  'lassen-volcanic-national-park': 'Hydrothermal features, snow-late openings, and Northern California loop trips fit well.',
  'dry-tortugas-national-park': 'Fort Jefferson ferries, snorkeling, and day-trip vs camping reservations are critical.',
  'indiana-dunes-national-park': 'Lake Michigan beaches, dune climbs, and Chicago weekend access make it approachable.',
  'white-sands-national-park': 'Gypsum dunes, heat safety, and sunset photography sessions are the main draws.',
  'mount-rainier-national-park': 'Wildflower meadows, Paradise visitor hub, and avalanche-aware spring visits need checking.',
};

export function isTierAPark(slug) {
  return TIER_A_PARK_SLUGS.has(slug);
}

export function getStateHubSlug(states) {
  if (!states) return null;
  const code = states.split(',')[0]?.trim().toUpperCase();
  return STATE_CODE_TO_HUB_SLUG[code] || null;
}

export function formatStateList(states) {
  if (!states) return 'the United States';
  return states.split(',').map((s) => s.trim()).filter(Boolean).join(', ');
}

export function buildParkMetaDescription(park, parkSlug) {
  const slug = parkSlug || parkToSlug(park.fullName);
  const states = formatStateList(park.states);
  const hook = TIER_A_HOOKS[slug] || 'Check live alerts, maps, fees, and seasonal tips before you go.';
  const name = park.fullName;
  if (isTierAPark(slug)) {
    return `Plan ${name} (${states}): live NPS alerts, crowd calendar, maps, and Trailie trip planning. ${hook}`;
  }
  const snippet = park.description
    ? htmlToPlainText(park.description).replace(/\s+/g, ' ').trim().slice(0, 120)
    : '';
  const tail = snippet ? `${snippet}…` : 'Activities, camping, weather, and visitor info.';
  return `Explore ${name} in ${states}. ${tail} Plan your visit on TrailVerse.`;
}

/**
 * One-line planning context for Tier A parks — shown inside existing About section only.
 * @returns {string | null}
 */
export function buildParkSeoLeadLine(park, parkSlug) {
  const slug = parkSlug || parkToSlug(park.fullName);
  if (!isTierAPark(slug)) return null;

  const hook = TIER_A_HOOKS[slug];
  if (!hook) return null;

  return hook;
}

function normalizeDesignation(parkOrDesignation) {
  if (typeof parkOrDesignation === 'string') {
    return parkOrDesignation.trim().toLowerCase();
  }
  const fromField = parkOrDesignation?.designation?.trim().toLowerCase();
  if (fromField) return fromField;
  const name = parkOrDesignation?.fullName?.toLowerCase() || '';
  if (name.includes('national park')) return 'national park';
  if (name.includes('national monument')) return 'national monument';
  if (name.includes('national historic site')) return 'national historic site';
  if (name.includes('national historical park')) return 'national historical park';
  if (name.includes('national recreation area')) return 'national recreation area';
  return '';
}

function designationsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes('national park') && b.includes('national park')) return true;
  return false;
}

/**
 * Rank same-state park suggestions: same designation → Tier A → name.
 * @param {object[]} candidates
 * @param {object | string} currentPark — park object or parkCode (legacy)
 */
export function sortRelatedParks(candidates, currentPark) {
  const currentCode = (
    typeof currentPark === 'string' ? currentPark : currentPark?.parkCode
  )?.toLowerCase();
  const currentDesignation = normalizeDesignation(
    typeof currentPark === 'string' ? '' : currentPark
  );

  return [...candidates]
    .filter((p) => p.parkCode?.toLowerCase() !== currentCode)
    .sort((a, b) => {
      const aSame = designationsMatch(normalizeDesignation(a), currentDesignation) ? 0 : 1;
      const bSame = designationsMatch(normalizeDesignation(b), currentDesignation) ? 0 : 1;
      if (aSame !== bSame) return aSame - bSame;

      const aSlug = parkToSlug(a.fullName);
      const bSlug = parkToSlug(b.fullName);
      const aTier = isTierAPark(aSlug) ? 0 : 1;
      const bTier = isTierAPark(bSlug) ? 0 : 1;
      if (aTier !== bTier) return aTier - bTier;

      return (a.fullName || '').localeCompare(b.fullName || '');
    });
}
