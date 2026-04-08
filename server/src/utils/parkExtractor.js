/**
 * Park name extraction utility — maps natural-language park references
 * to NPS park codes and coordinates for RAG live data injection.
 */

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
  ['saguaro national park',                     { code: 'sagu', lat: 32.253, lon: -110.500 }],
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
  ['hot springs',            { code: 'hosp', lat: 34.521, lon: -93.042  }],
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
  ['katmai',                 { code: 'katm', lat: 58.598, lon: -154.964 }],
  ['denali',                 { code: 'dena', lat: 63.330, lon: -150.501 }],
  ['lassen',                 { code: 'lavo', lat: 40.493, lon: -121.408 }],
  ['bryce',                  { code: 'brca', lat: 37.593, lon: -112.187 }],
  ['zion',                   { code: 'zion', lat: 37.298, lon: -113.026 }],
]);

// Pre-compute sorted keys (longest first) for greedy matching
const SORTED_KEYS = [...PARK_NAME_TO_CODE.keys()].sort((a, b) => b.length - a.length);

/**
 * Extract a national park reference from a user message.
 * @param {string} message - The raw user message
 * @returns {{ parkCode: string, lat: number, lon: number, parkName: string } | null}
 */
function extractParkFromMessage(message) {
  if (!message) return null;
  const lower = message.toLowerCase();

  for (const key of SORTED_KEYS) {
    if (lower.includes(key)) {
      const entry = PARK_NAME_TO_CODE.get(key);
      // Title-case the matched key for display
      const parkName = key.replace(/\b\w/g, c => c.toUpperCase());
      return { parkCode: entry.code, lat: entry.lat, lon: entry.lon, parkName };
    }
  }

  return null;
}

/**
 * Extract ALL national park references from a user message.
 * Returns an array of unique parks (deduplicated by parkCode).
 * @param {string} message - The raw user message
 * @returns {Array<{ parkCode: string, lat: number, lon: number, parkName: string }>}
 */
function extractAllParksFromMessage(message) {
  if (!message) return [];
  const lower = message.toLowerCase();
  const found = [];
  const usedCodes = new Set();

  for (const key of SORTED_KEYS) {
    if (lower.includes(key)) {
      const entry = PARK_NAME_TO_CODE.get(key);
      if (!usedCodes.has(entry.code)) {
        usedCodes.add(entry.code);
        const parkName = key.replace(/\b\w/g, c => c.toUpperCase());
        found.push({ parkCode: entry.code, lat: entry.lat, lon: entry.lon, parkName });
      }
    }
  }

  return found;
}

module.exports = { extractParkFromMessage, extractAllParksFromMessage, PARK_NAME_TO_CODE };
