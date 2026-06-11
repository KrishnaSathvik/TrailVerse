/**
 * Discovery search policy — aligns catalog ranking with how users phrase questions.
 * Used by GET /api/parks/search, Trailie chat discovery, voice, and MCP.
 */

/**
 * User explicitly asked for National Park designations (not all NPS unit types).
 * @param {string} q
 * @returns {boolean}
 */
function queryWantsNationalParksOnly(q) {
  if (!q || typeof q !== 'string') return false;
  const lower = q.toLowerCase();
  if (
    /\b(nps\s+sites?|all\s+parks?\s+and\s+sites?|national\s+park\s+service\s+sites?)\b/.test(
      lower
    )
  ) {
    return false;
  }
  if (
    /\b(monuments?|lakeshores?|seashores?|historic\s+sites?|memorials?|parkways?)\b/.test(
      lower
    ) &&
    !/\bnational\s+parks?\b/.test(lower)
  ) {
    return false;
  }
  return /\bnational\s+parks?\b/.test(lower);
}

/**
 * @param {import('./canonicalPark').CanonicalPark} park
 * @returns {boolean}
 */
function isNationalParkDesignation(park) {
  const designation =
    park.sourceRecord?.designation || park.sourceRecord?.fullName || park.name || '';
  const lower = String(designation).toLowerCase();
  if (lower.includes('national park')) return true;
  if (park.category === 'national_park') return true;
  const name = (park.name || '').toLowerCase();
  return name.includes('national park');
}

/**
 * July / summer + cool / beat the heat style queries.
 * @param {string} q
 * @returns {boolean}
 */
function queryWantsCoolSummerWeather(q) {
  if (!q || typeof q !== 'string') return false;
  const lower = q.toLowerCase();
  const hasSummerMonth =
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/.test(
      lower
    ) || /\b(summer|midsummer)\b/.test(lower);
  const wantsCool =
    /\b(cool|cooler|chilly|mild|beat the heat|escape the heat|not too hot|avoid the heat|refreshing)\b/.test(
      lower
    );
  return wantsCool || (hasSummerMonth && /\b(cool|cooler|mild|heat)\b/.test(lower));
}

/**
 * @param {import('./canonicalPark').CanonicalPark[]} parks
 * @param {string} q
 * @returns {import('./canonicalPark').CanonicalPark[]}
 */
function applyDiscoveryQueryFilters(parks, q) {
  if (queryWantsNationalParksOnly(q)) {
    return parks.filter(isNationalParkDesignation);
  }
  return parks;
}

/**
 * User asked for swimmable water — lakes, beaches, shore (not just mountain scenery).
 * @param {string} q
 * @returns {boolean}
 */
function queryWantsLakesOrBeaches(q) {
  if (!q || typeof q !== 'string') return false;
  const lower = q.toLowerCase();
  return /\b(lakes?|beaches?|beach|shoreline|shore|swim|swimming|waterfront)\b/.test(lower);
}

/**
 * Couples / romantic trip with saltwater or coast framing.
 * @param {string} q
 * @returns {boolean}
 */
function queryWantsCouplesOcean(q) {
  if (!q || typeof q !== 'string') return false;
  const lower = q.toLowerCase();
  const couples = /\b(couples?|romantic|honeymoon|anniversary)\b/.test(lower);
  const ocean =
    /\b(ocean|coast|coastal|beach|beaches|seashore|shoreline|sea)\b/.test(lower);
  return couples && ocean;
}

/**
 * Prompt hints for Trailie when injecting ranked candidates.
 * @param {string} q
 * @returns {{
 *   nationalParksOnly: boolean,
 *   coolSummer: boolean,
 *   lakesOrBeaches: boolean,
 *   couplesOcean: boolean,
 *   hasRemoteCandidates: boolean,
 * }}
 */
function getDiscoveryQueryHints(q) {
  const query = q || '';
  return {
    nationalParksOnly: queryWantsNationalParksOnly(query),
    coolSummer: queryWantsCoolSummerWeather(query),
    lakesOrBeaches: queryWantsLakesOrBeaches(query),
    couplesOcean: queryWantsCouplesOcean(query),
    hasRemoteCandidates: false,
  };
}

/** Brutal July heat — downrank when user wants cool summer weather. */
const HOT_SUMMER_PARK_CODES = new Set([
  'jotr',
  'deva',
  'grca',
  'cane',
  'arch',
  'brca',
  'zion',
  'sagu',
  'badl',
  'care',
  'chis',
  'whsa',
  'pinn',
  'bibe',
  'lake',
  'meve',
  'nava',
]);

/** Strong cool-summer national park picks. */
const COOL_SUMMER_PARK_CODES = new Set([
  'glac',
  'olym',
  'acad',
  'crla',
  'lavo',
  'noca',
  'mora',
  'isro',
  'voya',
  'wrst',
  'dena',
  'katm',
  'glba',
]);

/** Cool July + lakes/beaches — water-first national parks (not just scenic drives). */
const COOL_LAKE_BEACH_SUMMER_CODES = new Set([
  'olym',
  'crla',
  'acad',
  'isro',
  'lavo',
  'voya',
  'grte',
  'glac',
]);

/** Iconic mountain/scenic-drive parks — slight downrank when user asked for beaches/lakes. */
const MOUNTAIN_SCENIC_DRIVE_CODES = new Set(['glac', 'romo', 'noca', 'grte']);

/** Classic accessible couples coast picks (lower logistics friction). */
const CLASSIC_COUPLES_COAST_CODES = new Set([
  'acad',
  'olym',
  'bisc',
  'viis',
]);

/** Remote or logistics-heavy — still recommend with planning notes. */
const REMOTE_LOGISTICS_PARK_CODES = new Set([
  'wrst',
  'glba',
  'katm',
  'dena',
  'gaar',
  'gate',
  'isro',
  'voya',
  'chis',
  'dryv',
  'arch',
  'olia',
]);

/** One-line planner notes for Trailie discovery prompts. */
const PARK_LOGISTICS_NOTES = {
  wrst:
    'Alaska bush country — usually fly or long drive from Anchorage; multi-day trip, short season.',
  glba:
    'Southeast Alaska — most visitors arrive by cruise or floatplane; not a quick weekend.',
  katm:
    'Alaska interior — fly into Anchorage then bush plane or long drive; bears and weather drive timing.',
  dena:
    'Alaska — one road in; book lodges/transit early; summer window is short.',
  gaar:
    'Arctic Alaska — fly-in only; expert-level logistics and season.',
  gate:
    'Arctic Alaska — fly-in access; extreme remoteness.',
  isro:
    'Lake Superior island — ferry or seaplane from Michigan; short season, reserve boats early.',
  voya:
    'Northern Minnesota — houseboat or long drive from Minneapolis; water-focused but not ocean.',
  chis:
    'California islands — boat or plane from Ventura/Oxnard only; no cars on the islands.',
  dryv:
    'Florida Keys reef — boat or seaplane from Homestead/Key Largo; check weather and permits.',
  glac:
    'Montana — Going-to-the-Sun Road opens mid-summer only; crowds and lodging book early.',
};

/**
 * @param {string} parkCode
 * @returns {string|null}
 */
function getParkLogisticsNote(parkCode) {
  if (!parkCode) return null;
  return PARK_LOGISTICS_NOTES[parkCode.toLowerCase()] || null;
}

/**
 * @param {string} q
 * @param {import('./canonicalPark').CanonicalPark[]} [parks]
 * @returns {ReturnType<typeof getDiscoveryQueryHints>}
 */
function buildDiscoveryQueryHints(q, parks = []) {
  const hints = getDiscoveryQueryHints(q);
  hints.hasRemoteCandidates = parks.some((p) =>
    REMOTE_LOGISTICS_PARK_CODES.has((p.id || '').toLowerCase())
  );
  return hints;
}

module.exports = {
  queryWantsNationalParksOnly,
  isNationalParkDesignation,
  queryWantsCoolSummerWeather,
  queryWantsLakesOrBeaches,
  queryWantsCouplesOcean,
  applyDiscoveryQueryFilters,
  getDiscoveryQueryHints,
  buildDiscoveryQueryHints,
  getParkLogisticsNote,
  HOT_SUMMER_PARK_CODES,
  COOL_SUMMER_PARK_CODES,
  COOL_LAKE_BEACH_SUMMER_CODES,
  MOUNTAIN_SCENIC_DRIVE_CODES,
  CLASSIC_COUPLES_COAST_CODES,
  REMOTE_LOGISTICS_PARK_CODES,
  PARK_LOGISTICS_NOTES,
};
