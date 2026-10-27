/**
 * Park name extraction utility — maps natural-language park references
 * to NPS park codes and coordinates for RAG live data injection.
 *
 * Two-tier lookup:
 *   1. Hardcoded PARK_NAME_TO_CODE — 64 National Parks + landmark aliases (sync, always available)
 *   2. Dynamic _dynamicMap — all ~470 NPS sites, built lazily from getNpsService().getAllParks() (async, populated at startup)
 */

const { filterParksNotSkipOnly } = require('./parkSkipContext');

const PARK_NAME_TO_CODE = new Map([
  // ── Full names (lowercase) ────────────────────────────────────────
  ['black canyon of the gunnison national park', { code: 'blca', lat: 38.574, lon: -107.722 }],
  ['great smoky mountains national park',       { code: 'grsm', lat: 35.611, lon: -83.489  }],
  ['guadalupe mountains national park',         { code: 'guad', lat: 31.924, lon: -104.870 }],
  ['national park of american samoa',           { code: 'npsa', lat: -14.259, lon: -170.683 }],
  ['gates of the arctic national park',         { code: 'gaar', lat: 67.782, lon: -153.304 }],
  ['wrangell st elias national park',           { code: 'wrst', lat: 61.710, lon: -142.986 }],
  ['theodore roosevelt national park',          { code: 'thro', lat: 46.979, lon: -103.538 }],
  ['hawaii volcanoes national park',            { code: 'havo', lat: 19.432, lon: -155.257 }],
  ['carlsbad caverns national park',            { code: 'cave', lat: 32.147, lon: -104.557 }],
  ['petrified forest national park',            { code: 'pefo', lat: 34.983, lon: -109.783 }],
  ['channel islands national park',             { code: 'chis', lat: 34.008, lon: -119.779 }],
  ['cuyahoga valley national park',             { code: 'cuva', lat: 41.261, lon: -81.558  }],
  ['virgin islands national park',              { code: 'viis', lat: 18.330, lon: -64.730  }],
  ['lassen volcanic national park',             { code: 'lavo', lat: 40.493, lon: -121.408 }],
  ['great sand dunes national park',            { code: 'grsa', lat: 37.732, lon: -105.512 }],
  ['rocky mountain national park',              { code: 'romo', lat: 40.343, lon: -105.684 }],
  ['bryce canyon national park',                { code: 'brca', lat: 37.593, lon: -112.187 }],
  ['grand canyon national park',                { code: 'grca', lat: 36.106, lon: -112.113 }],
  ['yellowstone national park',                 { code: 'yell', lat: 44.428, lon: -110.588 }],
  ['north cascades national park',              { code: 'noca', lat: 48.771, lon: -121.298 }],
  ['crater lake national park',                 { code: 'crla', lat: 42.944, lon: -122.109 }],
  ['death valley national park',                { code: 'deva', lat: 36.505, lon: -117.079 }],
  ['glacier bay national park',                 { code: 'glba', lat: 58.665, lon: -136.900 }],
  ['grand teton national park',                 { code: 'grte', lat: 43.790, lon: -110.681 }],
  ['great basin national park',                 { code: 'grba', lat: 38.983, lon: -114.300 }],
  ['hot springs national park',                 { code: 'hosp', lat: 34.521, lon: -93.042  }],
  ['joshua tree national park',                 { code: 'jotr', lat: 33.873, lon: -115.901 }],
  ['mammoth cave national park',                { code: 'maca', lat: 37.187, lon: -86.100  }],
  ['mount rainier national park',               { code: 'mora', lat: 46.852, lon: -121.726 }],
  ['new river gorge national park',             { code: 'neri', lat: 37.870, lon: -81.077  }],
  ['kenai fjords national park',                { code: 'kefj', lat: 59.920, lon: -150.137 }],
  ['indiana dunes national park',               { code: 'indu', lat: 41.653, lon: -87.052  }],
  ['isle royale national park',                 { code: 'isro', lat: 47.996, lon: -88.909  }],
  ['canyonlands national park',                 { code: 'cany', lat: 38.326, lon: -109.875 }],
  ['capitol reef national park',                { code: 'care', lat: 38.367, lon: -111.262 }],
  ['kobuk valley national park',                { code: 'kova', lat: 67.347, lon: -159.120 }],
  ['mesa verde national park',                  { code: 'meve', lat: 37.230, lon: -108.462 }],
  ['white sands national park',                 { code: 'whsa', lat: 32.779, lon: -106.171 }],
  ['everglades national park',                  { code: 'ever', lat: 25.286, lon: -80.898  }],
  ['dry tortugas national park',                { code: 'drto', lat: 24.628, lon: -82.873  }],
  ['lake clark national park',                  { code: 'lacl', lat: 60.412, lon: -154.323 }],
  ['yosemite national park',                    { code: 'yose', lat: 37.865, lon: -119.538 }],
  ['shenandoah national park',                  { code: 'shen', lat: 38.488, lon: -78.462  }],
  ['wind cave national park',                   { code: 'wica', lat: 43.557, lon: -103.479 }],
  ['pinnacles national park',                   { code: 'pinn', lat: 36.491, lon: -121.198 }],
  ['haleakala national park',                   { code: 'hale', lat: 20.720, lon: -156.149 }],
  ['voyageurs national park',                   { code: 'voya', lat: 48.485, lon: -92.838  }],
  ['big bend national park',                    { code: 'bibe', lat: 29.250, lon: -103.250 }],
  ['biscayne national park',                    { code: 'bisc', lat: 25.483, lon: -80.432  }],
  ['badlands national park',                    { code: 'badl', lat: 43.855, lon: -102.337 }],
  ['congaree national park',                    { code: 'cong', lat: 33.796, lon: -80.784  }],
  ['olympic national park',                     { code: 'olym', lat: 47.802, lon: -123.604 }],
  ['sequoia national park',                     { code: 'sequ', lat: 36.491, lon: -118.565 }],
  // Missing from the catalog entirely, which silently dropped it from every
  // sentence that named it (one of the 64 national parks).
  ['kings canyon national park',                { code: 'kica', lat: 36.887, lon: -118.555 }],
  ['saguaro national park',                     { code: 'sagu', lat: 32.253, lon: -110.500 }],
  // Redesignated from Chiricahua National Monument on Oct 20, 2026 (64th
  // national park; NPS code unchanged). Only the current name is keyed: the
  // derived 'chiricahua' alias still resolves the former monument name, and a
  // longer 'national monument' key would win getParkIdentityByCode's
  // longest-key display name.
  ['chiricahua national park',                  { code: 'chir', lat: 32.012, lon: -109.342 }],
  ['redwood national park',                     { code: 'redw', lat: 41.213, lon: -124.004 }],
  ['glacier national park',                     { code: 'glac', lat: 48.696, lon: -113.718 }],
  ['arches national park',                      { code: 'arch', lat: 38.733, lon: -109.592 }],
  ['acadia national park',                      { code: 'acad', lat: 44.409, lon: -68.247  }],
  ['katmai national park',                      { code: 'katm', lat: 58.598, lon: -154.964 }],
  ['denali national park',                      { code: 'dena', lat: 63.330, lon: -150.501 }],
  ['zion national park',                        { code: 'zion', lat: 37.298, lon: -113.026 }],

  // ── Short aliases (lowercase) ─────────────────────────────────────
  ['great smoky mountains',  { code: 'grsm', lat: 35.611, lon: -83.489  }],
  ['guadalupe mountains',    { code: 'guad', lat: 31.924, lon: -104.870 }],
  ['theodore roosevelt',     { code: 'thro', lat: 46.979, lon: -103.538 }],
  ['hawaii volcanoes',       { code: 'havo', lat: 19.432, lon: -155.257 }],
  ['great sand dunes',       { code: 'grsa', lat: 37.732, lon: -105.512 }],
  ['rocky mountain',         { code: 'romo', lat: 40.343, lon: -105.684 }],
  ['cuyahoga valley',        { code: 'cuva', lat: 41.261, lon: -81.558  }],
  ['lassen volcanic',        { code: 'lavo', lat: 40.493, lon: -121.408 }],
  ['petrified forest',       { code: 'pefo', lat: 34.983, lon: -109.783 }],
  ['north cascades',         { code: 'noca', lat: 48.771, lon: -121.298 }],
  ['new river gorge',        { code: 'neri', lat: 37.870, lon: -81.077  }],
  ['black canyon',            { code: 'blca', lat: 38.574, lon: -107.722 }],
  ['indiana dunes',          { code: 'indu', lat: 41.653, lon: -87.052  }],
  ['mount rainier',          { code: 'mora', lat: 46.852, lon: -121.726 }],
  ['great smokies',          { code: 'grsm', lat: 35.611, lon: -83.489  }],
  ['bryce canyon',           { code: 'brca', lat: 37.593, lon: -112.187 }],
  ['grand canyon',           { code: 'grca', lat: 36.106, lon: -112.113 }],
  ['kenai fjords',           { code: 'kefj', lat: 59.920, lon: -150.137 }],
  ['isle royale',            { code: 'isro', lat: 47.996, lon: -88.909  }],
  ['death valley',           { code: 'deva', lat: 36.505, lon: -117.079 }],
  ['kobuk valley',           { code: 'kova', lat: 67.347, lon: -159.120 }],
  ['crater lake',            { code: 'crla', lat: 42.944, lon: -122.109 }],
  ['grand tetons',           { code: 'grte', lat: 43.790, lon: -110.681 }],
  ['grand teton',            { code: 'grte', lat: 43.790, lon: -110.681 }],
  ['mammoth cave',           { code: 'maca', lat: 37.187, lon: -86.100  }],
  ['dry tortugas',           { code: 'drto', lat: 24.628, lon: -82.873  }],
  ['joshua tree',            { code: 'jotr', lat: 33.873, lon: -115.901 }],
  ['white sands',            { code: 'whsa', lat: 32.779, lon: -106.171 }],
  ['capitol reef',           { code: 'care', lat: 38.367, lon: -111.262 }],
  // Bare "hot springs" omitted — matches activity phrases ("beach or hot springs") and
  // misroutes weather/NPS/images. Use "hot springs national park" or visit the park by name.
  ['great basin',            { code: 'grba', lat: 38.983, lon: -114.300 }],
  ['mesa verde',             { code: 'meve', lat: 37.230, lon: -108.462 }],
  ['mt rainier',             { code: 'mora', lat: 46.852, lon: -121.726 }],
  ['yellowstone',            { code: 'yell', lat: 44.428, lon: -110.588 }],
  ['wind cave',              { code: 'wica', lat: 43.557, lon: -103.479 }],
  ['shenandoah',             { code: 'shen', lat: 38.488, lon: -78.462  }],
  ['canyonlands',            { code: 'cany', lat: 38.326, lon: -109.875 }],
  ['everglades',             { code: 'ever', lat: 25.286, lon: -80.898  }],
  ['haleakala',              { code: 'hale', lat: 20.720, lon: -156.149 }],
  ['big bend',               { code: 'bibe', lat: 29.250, lon: -103.250 }],
  ['biscayne',               { code: 'bisc', lat: 25.483, lon: -80.432  }],
  ['badlands',               { code: 'badl', lat: 43.855, lon: -102.337 }],
  ['yosemite',               { code: 'yose', lat: 37.865, lon: -119.538 }],
  ['voyageurs',              { code: 'voya', lat: 48.485, lon: -92.838  }],
  ['pinnacles',              { code: 'pinn', lat: 36.491, lon: -121.198 }],
  ['congaree',               { code: 'cong', lat: 33.796, lon: -80.784  }],
  ['sequoia',                { code: 'sequ', lat: 36.491, lon: -118.565 }],
  ['saguaro',                { code: 'sagu', lat: 32.253, lon: -110.500 }],
  ['redwood',                { code: 'redw', lat: 41.213, lon: -124.004 }],
  ['olympic',                { code: 'olym', lat: 47.802, lon: -123.604 }],
  ['glacier',                { code: 'glac', lat: 48.696, lon: -113.718 }],
  ['arches',                 { code: 'arch', lat: 38.733, lon: -109.592 }],
  ['acadia',                 { code: 'acad', lat: 44.409, lon: -68.247  }],
  ['wrangell st elias',       { code: 'wrst', lat: 61.710, lon: -142.986 }],
  ['wrangell',               { code: 'wrst', lat: 61.710, lon: -142.986 }],
  ['katmai',                 { code: 'katm', lat: 58.598, lon: -154.964 }],
  ['denali',                 { code: 'dena', lat: 63.330, lon: -150.501 }],
  ['lassen',                 { code: 'lavo', lat: 40.493, lon: -121.408 }],
  ['bryce',                  { code: 'brca', lat: 37.593, lon: -112.187 }],
  ['zion',                   { code: 'zion', lat: 37.298, lon: -113.026 }],

  // ── Famous landmarks (map to their parent park) ───────────────────
  // kind:'landmark' = subordinate place/access subject. Must NOT overwrite the
  // containing park's display identity when the park itself is also named.
  ['going-to-the-sun road',  { code: 'glac', lat: 48.696, lon: -113.718, kind: 'landmark' }],
  ['going to the sun road',  { code: 'glac', lat: 48.696, lon: -113.718, kind: 'landmark' }],
  ['logan pass',             { code: 'glac', lat: 48.696, lon: -113.718, kind: 'landmark' }],
  ['angels landing',         { code: 'zion', lat: 37.298, lon: -113.026, kind: 'landmark' }],
  ['the narrows',            { code: 'zion', lat: 37.298, lon: -113.026, kind: 'landmark' }],
  ['half dome',              { code: 'yose', lat: 37.865, lon: -119.538, kind: 'landmark' }],
  ['glacier point',          { code: 'yose', lat: 37.731, lon: -119.574, kind: 'landmark' }],
  ['mariposa grove',         { code: 'yose', lat: 37.865, lon: -119.538, kind: 'landmark' }],
  ['mist trail',             { code: 'yose', lat: 37.865, lon: -119.538, kind: 'landmark' }],
  ['delicate arch',          { code: 'arch', lat: 38.733, lon: -109.592, kind: 'landmark' }],
  ['old faithful',           { code: 'yell', lat: 44.428, lon: -110.588, kind: 'landmark' }],
  ['grand prismatic',        { code: 'yell', lat: 44.428, lon: -110.588, kind: 'landmark' }],
  ['artist point',           { code: 'yell', lat: 44.428, lon: -110.588, kind: 'landmark' }],
  ['cadillac mountain',      { code: 'acad', lat: 44.409, lon: -68.247, kind: 'landmark' }],
  ['wizard island',          { code: 'crla', lat: 42.944, lon: -122.109, kind: 'landmark' }],
  ['bright angel trail',     { code: 'grca', lat: 36.106, lon: -112.113, kind: 'landmark' }],
  ['skyline drive',          { code: 'shen', lat: 38.488, lon: -78.462, kind: 'landmark' }],
]);

/**
 * Short aliases that also describe activities/features — skip unless the user
 * names the park explicitly (e.g. "hot springs national park").
 */
const ACTIVITY_AMBIGUOUS_KEYS = new Set(['hot springs']);

/**
 * Short aliases were hand-listed, so coverage drifted: "sequoia" resolved while
 * "kings canyon" did not, "mount rainier" while "rainier" did not. Travelers
 * use short names constantly, and a dropped entity silently becomes a dropped
 * comparison. Derive the designation-stripped form for every full name instead
 * of maintaining the list by hand.
 *
 * Collisions and activity-ambiguous words are skipped, and an existing explicit
 * entry always wins.
 */
function deriveShortNameAliases(map) {
  const derived = new Map();
  const collisions = new Set();
  for (const [name, entry] of map) {
    const short = name.replace(/\s+national\s+(?:park|monument|preserve|seashore|lakeshore|recreation area|historical park|historic site|memorial)s?\b.*$/i, '').trim();
    if (!short || short === name || short.length < 4) continue;
    if (map.has(short)) continue;
    // A word that doubles as an activity must keep requiring the full name.
    if (ACTIVITY_AMBIGUOUS_KEYS.has(short)) continue;
    const existing = derived.get(short);
    if (existing && existing.code !== entry.code) {
      // Two parks share a short form — ambiguous, so neither may claim it.
      collisions.add(short);
      continue;
    }
    derived.set(short, entry);
  }
  for (const short of collisions) derived.delete(short);
  for (const [short, entry] of derived) map.set(short, entry);
  return map;
}

deriveShortNameAliases(PARK_NAME_TO_CODE);

// Pre-compute sorted keys (longest first) for greedy matching
const SORTED_KEYS = [...PARK_NAME_TO_CODE.keys()].sort((a, b) => b.length - a.length);

function isActivityPhraseNotPark(message, key) {
  if (!ACTIVITY_AMBIGUOUS_KEYS.has(key) || !message) return false;
  const lower = message.toLowerCase();
  if (/\bhot springs national park\b/.test(lower)) return false;
  if (
    /\b(beach|beaches|lake|lakes|ocean|swim|swimming|coast|coastal|cool|relax|chill|couples?)\b/.test(
      lower
    )
  ) {
    return true;
  }
  if (/\b(which|best|where|suggest|recommend|options?|ideas?|or even)\b/.test(lower)) {
    return true;
  }
  return false;
}

// ── Dynamic NPS Map (lazy-loaded from getNpsService().getAllParks()) ─────

// Designation suffixes to strip when generating short aliases (longest first)
const DESIGNATION_SUFFIXES = [
  'national park and preserve',
  'national park & preserve',
  'national monument and preserve',
  'national monument & preserve',
  'national historical park and ecological preserve',
  'national historical park',
  'national historic site',
  'national historic trail',
  'national heritage area',
  'national recreation area',
  'national scenic trail',
  'national scenic river',
  'national scenic riverway',
  'national scenic riverways',
  'national wild and scenic river',
  'national battlefield park',
  'national battlefield',
  'national military park',
  'national memorial',
  'national monument',
  'national seashore',
  'national lakeshore',
  'national preserve',
  'national reserve',
  'national river',
  'national parkway',
  'national park',
].sort((a, b) => b.length - a.length);

// Generic words that would produce false-positive matches if used as short names
const BLOCKED_SHORT_NAMES = new Set([
  'river', 'rivers', 'lake', 'lakes', 'creek', 'fort', 'forts',
  'trail', 'trails', 'island', 'islands', 'point', 'rock', 'rocks',
  'spring', 'springs', 'falls', 'mount', 'mountain', 'mountains',
  'valley', 'canyon', 'cape', 'north', 'south', 'east', 'west',
  'upper', 'lower', 'great', 'little', 'big', 'new', 'old',
  'white', 'black', 'blue', 'green', 'red', 'golden', 'sand',
  'general', 'national', 'american', 'colonial', 'war', 'civil',
  'gateway', 'harbor', 'port', 'marsh', 'woods', 'forest', 'field',
]);

const MIN_SHORT_NAME_LENGTH = 4;

let _dynamicMap = null;        // Map<string, { code, lat, lon }> — null until loaded
let _dynamicSortedKeys = null; // string[] sorted longest-first
let _loadPromise = null;       // dedup concurrent calls

/**
 * Build the dynamic NPS map from getNpsService().getAllParks().
 * Safe to call multiple times — deduplicates via _loadPromise.
 */
async function loadDynamicMap() {
  if (_dynamicMap) return _dynamicMap;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    try {
      const { getNpsService } = require('../services/npsService');
      const parks = await getNpsService().getAllParks();

      const map = new Map();
      const hardcodedCodes = new Set();
      for (const [, entry] of PARK_NAME_TO_CODE) {
        hardcodedCodes.add(entry.code);
      }

      // Track short names that collide so we can remove them
      const shortNameCodes = new Map(); // shortName -> parkCode (first seen)

      for (const park of parks) {
        if (!park.fullName || !park.parkCode) continue;
        const lat = parseFloat(park.latitude);
        const lon = parseFloat(park.longitude);
        if (isNaN(lat) || isNaN(lon)) continue;

        const code = park.parkCode.toLowerCase();
        const entry = { code, lat, lon };
        const fullName = park.fullName.toLowerCase().trim();

        // Always add full name to dynamic map (unless it's already hardcoded)
        if (!PARK_NAME_TO_CODE.has(fullName)) {
          map.set(fullName, entry);
        }

        // Generate short alias by stripping designation suffix
        let shortName = fullName;
        for (const suffix of DESIGNATION_SUFFIXES) {
          if (shortName.endsWith(suffix)) {
            shortName = shortName.slice(0, -suffix.length).trim();
            break;
          }
        }

        // Only add short name if it differs from full name and passes filters
        if (shortName && shortName !== fullName && shortName.length >= MIN_SHORT_NAME_LENGTH && !BLOCKED_SHORT_NAMES.has(shortName)) {
          // Skip if already in hardcoded map (preserves landmark aliases)
          if (PARK_NAME_TO_CODE.has(shortName)) continue;

          // Handle collisions: if two parks produce the same short name, remove it
          if (shortNameCodes.has(shortName)) {
            if (shortNameCodes.get(shortName) !== code) {
              // Collision — mark for deletion
              shortNameCodes.set(shortName, '__COLLISION__');
              map.delete(shortName);
            }
          } else {
            shortNameCodes.set(shortName, code);
            map.set(shortName, entry);
          }
        }
      }

      _dynamicMap = map;
      _dynamicSortedKeys = [...map.keys()].sort((a, b) => b.length - a.length);
      console.log(`🗺️  Park name extractor ready: ${PARK_NAME_TO_CODE.size} hardcoded + ${map.size} dynamic entries`);
      return _dynamicMap;
    } catch (err) {
      console.warn(`⚠️ Dynamic park map failed to load: ${err.message}`);
      _loadPromise = null; // reset so next call retries
      return null;
    }
  })();

  return _loadPromise;
}

function titleCaseKey(key) {
  return String(key || '').replace(/\b\w/g, (c) => c.toUpperCase());
}

function spansOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

/**
 * Collect catalog key matches (hardcoded + dynamic), longest-first, with
 * non-overlapping span claiming so "Glacier Point" does not also claim "glacier".
 */
/**
 * APOSTROPHE-SAFE ENTITY MATCHING (Gate #5 Turn C).
 *
 * `collectCatalogKeyMatches` tested `message.toLowerCase().includes(key)` against
 * catalog keys such as 'hawaii volcanoes'. The live traveller wrote
 * "Hawai'i Volcanoes" with the ORDINARY ASCII apostrophe, which is not a
 * substring of that key, so the park resolved to nothing — and an explicit
 * three-day itinerary request was silently downgraded to prose.
 *
 * Folding is deliberately narrow: apostrophe-like marks ONLY, applied to the
 * MATCHING view of the text. Display and canonical names are untouched, and no
 * other punctuation is disturbed (park names legitimately contain "&" and "-").
 */
const APOSTROPHE_LIKE = /[\u0027\u2018\u2019\u02BB\u02BC\u00B4\u0060]/g;

/** Matching form of a string: apostrophe-like marks removed. */
function foldApostrophes(value) {
  return String(value == null ? '' : value).replace(APOSTROPHE_LIKE, '');
}

/**
 * Folded view of a message plus a map back to ORIGINAL indices, so the spans
 * `collectCatalogKeyMatches` claims stay aligned with the traveller's real text.
 * Folding removes characters, so positions shift without this.
 */
function foldedIndexView(message) {
  const source = String(message == null ? '' : message);
  let folded = '';
  const indexMap = [];
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    APOSTROPHE_LIKE.lastIndex = 0;
    if (APOSTROPHE_LIKE.test(ch)) continue;
    folded += ch;
    indexMap.push(i);
  }
  return { folded: folded.toLowerCase(), indexMap, length: source.length };
}

/**
 * LOCAL-FEATURE SUFFIXES.
 *
 * A capitalised one of these immediately after a catalog park-name span means
 * the span is part of a longer PROPER NAME — "Petrified Forest Trail",
 * "Death Canyon Trail" — not a destination mention.
 *
 * Capitalisation is the discriminator, and it is doing real work:
 * "Death Valley road conditions" is a topic about a destination, while
 * "Crater Lake Road" is a place inside a different one. Requiring the suffix to
 * be capitalised keeps the first out of this rule entirely.
 */
const LOCAL_FEATURE_SUFFIXES = new Set([
  'trail', 'trails', 'trailhead', 'trailheads', 'road', 'roads', 'drive',
  'loop', 'overlook', 'overlooks', 'viewpoint', 'campground', 'campsite',
  'canyon', 'creek', 'river', 'lake', 'falls', 'spring', 'springs', 'point',
  'peak', 'mountain', 'butte', 'mesa', 'ridge', 'basin', 'valley', 'meadow',
  'pass', 'bridge', 'crossing', 'junction', 'entrance', 'station', 'museum',
  'ranch', 'cabin', 'wash', 'flat', 'flats', 'bend', 'gulch', 'draw',
]);

const LOCAL_FEATURE_PREFIX_STOP = new Set([
  'the', 'a', 'an', 'in', 'at', 'to', 'from', 'of', 'on', 'for', 'and', 'or',
  'visit', 'hike', 'see', 'walk', 'explore', 'near', 'around', 'toward', 'towards',
  'into', 'onto', 'with', 'about', 'is', 'are', 'was', 'were', 'our', 'my', 'your',
  'this', 'that', 'those', 'these', 'plan', 'build', 'map', 'along', 'via',
  'would', 'should', 'could', 'can', 'does', 'did', 'do', 'has', 'have', 'had',
  'will', 'might', 'may', 'if', 'when', 'while', 'after', 'before', 'than',
  'compare', 'versus', 'vs', 'which', 'what', 'where', 'why', 'how', 'who',
  'help', 'give', 'make', 'create', 'need', 'want', 'looking', 'visiting',
  'hiking', 'seeing', 'please', 'just', 'also', 'not', 'but', 'yet', 'so',
  'let', 'lets', "let's", 'between', 'across', 'through',
]);

/**
 * Is this matched span embedded in a longer capitalised local-feature name?
 * Looks at the word immediately following the match in the ORIGINAL text,
 * and at a capitalised content word immediately before it ("Exit Glacier").
 */
function isInsideLocalFeatureName(message, match) {
  const source = String(message);
  const after = source.slice(match.end);
  const next = /^\s+([A-Za-z][A-Za-z-]*)/.exec(after);
  if (next) {
    const word = next[1];
    if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()
      && LOCAL_FEATURE_SUFFIXES.has(word.toLowerCase())) {
      return true;
    }
  }
  const key = String(match.key || '');
  if (/\bnational\b/.test(key) || key.split(/\s+/).filter(Boolean).length >= 2) {
    return false;
  }
  const before = source.slice(0, match.start);
  // A clause-leading selection imperative is command language, not a
  // proper-name prefix. Keep feature suffix/official-name protection above.
  if (/(?:^|[.!?]\s*)(?:please\s+)?(?:pick|choose|select|use)\s+$/i.test(before)) return false;
  const prev = /([A-Za-z][A-Za-z'’-]*)\s*$/.exec(before);
  if (!prev) return false;
  const word = prev[1];
  if (word[0] !== word[0].toUpperCase() || word[0] === word[0].toLowerCase()) return false;
  if (LOCAL_FEATURE_PREFIX_STOP.has(word.toLowerCase())) return false;
  return true;
}

function collectCatalogKeyMatches(message) {
  if (!message) return [];
  const lower = message.toLowerCase();
  // Apostrophe-folded view for matching, with a map back to original offsets so
  // downstream span claiming still refers to the traveller's real text.
  const { folded, indexMap } = foldedIndexView(message);
  const raw = [];

  const isBoundary = (hay, at, len) => {
    const beforeOk = at <= 0 || !/[a-z0-9]/i.test(hay[at - 1]);
    const afterOk = at + len >= hay.length || !/[a-z0-9]/i.test(hay[at + len]);
    return beforeOk && afterOk;
  };

  const findBounded = (hay, needle) => {
    let from = 0;
    while (from <= hay.length - needle.length) {
      const at = hay.indexOf(needle, from);
      if (at < 0) return -1;
      if (isBoundary(hay, at, needle.length)) return at;
      from = at + 1;
    }
    return -1;
  };

  /** Locate a catalog key in the folded view, returning ORIGINAL-text offsets. */
  const locate = (key) => {
    const direct = findBounded(lower, key);
    if (direct >= 0) return { start: direct, end: direct + key.length };
    const foldedKey = foldApostrophes(key).toLowerCase();
    if (!foldedKey) return null;
    const at = findBounded(folded, foldedKey);
    if (at < 0) return null;
    const start = indexMap[at];
    const end = indexMap[at + foldedKey.length - 1] + 1;
    return Number.isInteger(start) && Number.isInteger(end) ? { start, end } : null;
  };

  for (const key of SORTED_KEYS) {
    const span = locate(key);
    if (!span) continue;
    if (isActivityPhraseNotPark(message, key)) continue;
    const entry = PARK_NAME_TO_CODE.get(key);
    raw.push({
      key,
      entry,
      start: span.start,
      end: span.end,
      isLandmark: entry?.kind === 'landmark',
      source: 'hardcoded',
    });
  }

  if (_dynamicMap && _dynamicSortedKeys) {
    for (const key of _dynamicSortedKeys) {
      const span = locate(key);
      if (!span) continue;
      const entry = _dynamicMap.get(key);
      raw.push({
        key,
        entry,
        start: span.start,
        end: span.end,
        isLandmark: false,
        source: 'dynamic',
      });
    }
  }

  // Longest-first (already roughly sorted); claim non-overlapping spans.
  raw.sort((a, b) => (b.key.length - a.key.length) || (a.start - b.start));
  const claimed = [];
  const accepted = [];
  for (const match of raw) {
    if (claimed.some((span) => spansOverlap(span, match))) continue;
    claimed.push({ start: match.start, end: match.end });
    accepted.push({ ...match, featureEmbedded: isInsideLocalFeatureName(message, match) });
  }

  // PRECEDENCE. An explicit canonical mention outranks a park name that only
  // appears inside a longer local-feature name. Feature-embedded matches are
  // not last-resort destinations: a place containing a park word is not that
  // park. Official-place lookup may still infer a unique parent later.
  const primary = accepted.filter((match) => !match.featureEmbedded);
  if (primary.length > 0) return primary;

  // Single-token park aliases named only inside a district phrase still
  // identify that park ("Yosemite Valley", "Zion Canyon"). Multi-word park
  // identities embedded in trails/roads ("Petrified Forest Trail") stay out —
  // those are local features, not destination mentions.
  const embeddedParkMatches = accepted.filter((match) => {
    if (!match.featureEmbedded || match.isLandmark) return false;
    const tokens = String(match.key || '').split(/\s+/).filter(Boolean);
    return tokens.length === 1;
  });
  const embeddedCodes = [...new Set(embeddedParkMatches.map((m) => m.entry && m.entry.code).filter(Boolean))];
  if (embeddedCodes.length === 1) {
    return embeddedParkMatches.filter((m) => m.entry && m.entry.code === embeddedCodes[0]);
  }
  return [];
}

function buildParkExtractionsFromMatches(matches) {
  const byCode = new Map();
  for (const match of matches) {
    const code = String(match.entry?.code || '').toLowerCase();
    if (!code) continue;
    if (!byCode.has(code)) byCode.set(code, { park: [], landmarks: [] });
    const bucket = byCode.get(code);
    if (match.isLandmark) bucket.landmarks.push(match);
    else bucket.park.push(match);
  }

  const found = [];
  for (const [code, bucket] of byCode.entries()) {
    if (bucket.park.length > 0) {
      // Prefer longest park-identity key (fuller official name), then earliest mention.
      const parkMatch = [...bucket.park].sort(
        (a, b) => (b.key.length - a.key.length) || (a.start - b.start)
      )[0];
      found.push({
        parkCode: code,
        lat: parkMatch.entry.lat,
        lon: parkMatch.entry.lon,
        parkName: titleCaseKey(parkMatch.key),
        mentionedPlaces: bucket.landmarks.map((l) => ({
          name: titleCaseKey(l.key),
          key: l.key,
          role: 'subordinate_place',
        })),
        focalPlace: false,
        // Surfaced so downstream destination selection can prefer an active
        // trip destination over a park name that only appeared inside a local
        // feature name ("We're in THRO. Is Petrified Forest Trail open?").
        featureEmbedded: Boolean(parkMatch.featureEmbedded),
        _sortIndex: Math.min(
          parkMatch.start,
          ...bucket.landmarks.map((l) => l.start),
        ),
      });
    } else if (bucket.landmarks.length > 0) {
      const landmarkMatch = [...bucket.landmarks].sort((a, b) => a.start - b.start)[0];
      found.push({
        parkCode: code,
        lat: landmarkMatch.entry.lat,
        lon: landmarkMatch.entry.lon,
        parkName: titleCaseKey(landmarkMatch.key),
        mentionedPlaces: [],
        focalPlace: true,
        featureEmbedded: Boolean(landmarkMatch.featureEmbedded),
        _sortIndex: landmarkMatch.start,
      });
    }
  }

  found.sort((a, b) => a._sortIndex - b._sortIndex);
  return found.map(({ _sortIndex, ...rest }) => rest);
}

/**
 * Extract a national park reference from a user message.
 * Checks hardcoded map first (sync), then dynamic map if loaded.
 * @param {string} message - The raw user message
 * @returns {{ parkCode: string, lat: number, lon: number, parkName: string } | null}
 */
function extractParkFromMessage(message) {
  const all = extractAllParksFromMessage(message);
  return all[0] || null;
}

/**
 * Extract ALL national park references from a user message.
 * Returns an array of unique parks (deduplicated by parkCode).
 *
 * Landmark aliases (passes, trails, overlooks) map to a parent parkCode but
 * must not overwrite that park's display identity when the park itself is named.
 * When only a landmark is named, it may remain the focal place (focalPlace=true).
 *
 * @param {string} message - The raw user message
 * @returns {Array<{ parkCode: string, lat: number, lon: number, parkName: string, mentionedPlaces?: Array, focalPlace?: boolean }>}
 */
function extractAllParksFromMessage(message) {
  if (!message) return [];
  const matches = collectCatalogKeyMatches(message);
  const found = buildParkExtractionsFromMatches(matches);
  return filterParksNotSkipOnly(message, found);
}

/**
 * Offline/test injection for the dynamic NPS catalog.
 * Production uses loadDynamicMap(); tests must not call network.
 * @param {Array<{ key: string, code: string, lat?: number, lon?: number }>} entries
 */
function setDynamicMapForTests(entries = []) {
  const map = new Map();
  for (const entry of entries) {
    const key = String(entry.key || '').toLowerCase().trim();
    const code = String(entry.code || '').toLowerCase().trim();
    if (!key || !code) continue;
    map.set(key, {
      code,
      lat: Number(entry.lat),
      lon: Number(entry.lon),
    });
  }
  _dynamicMap = map;
  _dynamicSortedKeys = [...map.keys()].sort((a, b) => b.length - a.length);
  _loadPromise = Promise.resolve(_dynamicMap);
  return _dynamicMap;
}

function clearDynamicMapForTests() {
  _dynamicMap = null;
  _dynamicSortedKeys = null;
  _loadPromise = null;
}

/**
 * Catalog keys available for mention-order indexing (hardcoded + dynamic).
 * @returns {Array<{ key: string, code: string }>}
 */
function getParkCatalogMentionEntries() {
  const out = [];
  for (const [key, entry] of PARK_NAME_TO_CODE.entries()) {
    out.push({ key, code: entry.code, kind: entry.kind || 'park' });
  }
  if (_dynamicMap) {
    for (const [key, entry] of _dynamicMap.entries()) {
      out.push({ key, code: entry.code, kind: 'park' });
    }
  }
  return out;
}

function getParkIdentityByCode(parkCode) {
  const code = String(parkCode || '').toLowerCase().trim();
  if (!code) return null;
  let best = null;
  for (const [key, entry] of PARK_NAME_TO_CODE.entries()) {
    if (entry.code !== code || entry.kind === 'landmark') continue;
    if (!best || key.length > best.key.length) {
      best = {
        key,
        parkName: titleCaseKey(key),
        code: entry.code,
        lat: entry.lat,
        lon: entry.lon,
        source: 'static_national_park',
        kind: 'national_park',
      };
    }
  }
  if (best) return best;
  if (_dynamicMap) {
    for (const [key, entry] of _dynamicMap.entries()) {
      if (entry.code !== code) continue;
      if (!best || key.length > best.key.length) {
        best = {
          key,
          parkName: titleCaseKey(key),
          code: entry.code,
          lat: Number.isFinite(Number(entry.lat)) ? Number(entry.lat) : null,
          lon: Number.isFinite(Number(entry.lon)) ? Number(entry.lon) : null,
          source: 'dynamic_nps_catalog',
          kind: 'nps_unit',
        };
      }
    }
  }
  return best;
}

module.exports = {
  // Matching-only apostrophe folding (see collectCatalogKeyMatches).
  foldApostrophes,
  extractParkFromMessage,
  extractAllParksFromMessage,
  PARK_NAME_TO_CODE,
  loadDynamicMap,
  setDynamicMapForTests,
  clearDynamicMapForTests,
  getParkCatalogMentionEntries,
  getParkIdentityByCode,
};
