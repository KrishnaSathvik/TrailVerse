/**
 * Park-specific "why this match" one-liners for search results.
 * Keeps copy distinct per park (especially quiet + couples) instead of repeating trait templates.
 */

/** @type {Record<string, Partial<Record<string, string>>>} */
const PARK_BLURBS = {
  noca: {
    quiet_couples:
      'The American Alps with a fraction of Rainier traffic — turquoise Diablo and Ross Lakes and Highway 20 pullouts you can share without a permit lottery.',
    quiet:
      'Jagged peaks and icy lakes with far fewer visitors than the Northwest icons — most beauty is roadside or short-trail scale.',
    couples:
      'Big mountain drama at a slower pace — lakes, overlooks, and backcountry scale without the mega-park crush.',
  },
  chir: {
    quiet_couples:
      'Hoodoos and sky-island forest in southeast Arizona — Echo Canyon loops and Bonita Canyon Drive, remote enough that you set the pace.',
    quiet:
      'Utah-style rock spires with a fraction of the crowds — spring and fall are the comfortable seasons.',
    couples:
      'Otherworldly rock formations and cooler forest drives — memorable photos without all-day slogs.',
  },
  care: {
    quiet_couples:
      "Utah's quiet Mighty Five corner — Fruita orchards, Cathedral Valley monoliths, and slot canyons without Zion's shuttle lines.",
    quiet:
      'Red-rock canyons at a fraction of Arches or Zion visitation — still plan water and fuel carefully.',
    couples:
      'Scenic drives and short hikes through orchards and reef country — room on the road for an unhurried weekend.',
  },
  voya: {
    quiet_couples:
      'Houseboats, kayaks, and boreal lakes on the Canadian Shield — silence grows with every mile from the launch.',
    quiet:
      'A true water park — most campsites and trails need a boat; emptiness is real if you stay overnight.',
    couples:
      'Lake country built for shared days on the water — aurora potential and genuine quiet away from shore.',
  },
  acad: {
    quiet_couples:
      'Cadillac Mountain sunrise, Park Loop cliffs-and-sea, and carriage roads to bike together — coast and lobster towns in one trip.',
    quiet:
      'Coastal Maine scenery with manageable crowds outside peak weeks — check live alerts before you go.',
    couples:
      'Among the most couple-friendly parks in the system — sunrise, scenic drives, and gentle shared trails.',
  },
  olym: {
    quiet_couples:
      'Rainforest, Pacific coast, and mountain ridges in one park — pick a different mood each day without Yellowstone-scale chaos.',
    quiet:
      'Three ecosystems, one park — Hoh quiet, Hurricane Ridge views, and far less gridlock than the busiest icons.',
    couples:
      'Beaches, mossy forest walks, and mountain overlooks — variety for two without extreme commitment.',
  },
  shen: {
    quiet_couples:
      "Skyline Drive's 70+ overlooks — misty valleys and easy pullouts, a low-key couples road trip from the mid-Atlantic.",
    quiet:
      'Gentle pacing by design — scenic spine driving without committing to hard backcountry.',
    couples:
      'The low-effort romantic weekend — fall color and overlooks without flying to the famous western parks.',
  },
  piro: {
    quiet_couples:
      'Lake Superior cliffs, boat tours, and shoreline trails — water and rock with far fewer faces than the headline parks.',
    quiet:
      'Lakeshore calm on the Upper Peninsula — check boat schedules and weather before you book.',
    couples:
      'Dramatic water and cliff scenery — shared boat days or short hikes between quiet overlooks.',
  },
  redw: {
    quiet_couples:
      'Coastal fog and the tallest trees on Earth — quiet grove walks, then sleepy beach towns nearby.',
    quiet:
      'Forest cathedral walks without the desert-park heat or shuttle chaos — go early for parking ease.',
    couples:
      'Awe-inspiring red groves plus real Pacific views — a slow, memorable pace for two.',
  },
  mora: {
    quiet_couples:
      'Paradise wildflowers and Reflection Lakes beneath the volcano — short loops with outsized scenery for two.',
    quiet:
      'Alpine meadows and glacier views — arrive early in season for breathing room at popular pullouts.',
    couples:
      'Mountain romance without extreme hikes — reflection shots and meadow strolls when summer opens.',
  },
  bibe: {
    quiet_couples:
      'Chisos Basin mountains above Chihuahuan Desert big sky — Santa Elena Canyon at sunset and hot springs on the Rio Grande.',
    quiet:
      'Modest visitation versus western icons — summer heat means early-morning hiking only.',
    couples:
      'Dark-sky potential and canyon drama — remote enough to feel like your own park after dusk.',
  },
  isro: {
    quiet_couples:
      'Boat or seaplane only — no cars, wolves and moose on a Lake Superior island; overnighters get the real quiet.',
    quiet:
      'Among the lowest visitation of any full national park — confirm ferry schedules before mainland lodging.',
    couples:
      'Adventure for two with a hard cap on crowds — wilderness island pacing, not scenic-drive tourism.',
  },
  grba: {
    quiet_couples:
      'Bristlecone pines, Lehman Caves, and a 13,000-foot peak above empty highway country — wide horizons, few neighbors.',
    quiet:
      'Nevada solitude — Wheeler Peak Scenic Drive and alpine trails when the road is open.',
    couples:
      'Underground tours plus high-country views — remote enough that you hear the wind, not tour buses.',
  },
  grte: {
    quiet_couples:
      'Tetons rising straight from the valley — Jenny Lake and Oxbow Bend reflections with almost no foothills in the way.',
    couples:
      'Alpenglow on the peaks at sunrise — big mountain drama with very little effort to see it.',
  },
  viis: {
    quiet_couples:
      'Blue Ridge drives and misty hollows — gentler crowds than Shenandoah on many weekends if you pick your entrance.',
    couples:
      'Historic valley scenery and scenic byways — easy shared stops without extreme elevation.',
  },
  crla: {
    quiet_couples:
      'Impossibly blue Crater Lake from Rim Drive pullouts — slow loops and a lodge on the caldera edge (seasonal access).',
    couples:
      'The deepest lake in the U.S. as a shared scenic drive — check rim road opening before you set dates.',
  },
};

/**
 * @param {{ label: string }[]} primaryIntents
 * @returns {string|null}
 */
function intentBlurbKey(primaryIntents) {
  const labels = new Set((primaryIntents || []).map((i) => i.label));
  const quiet = labels.has('quiet');
  const couples = labels.has('couples') || labels.has('romantic');
  const beginners =
    labels.has('beginners') ||
    labels.has('beginner') ||
    labels.has('first-time visitors');

  if (quiet && couples) return 'quiet_couples';
  if (quiet && beginners) return 'quiet_beginners';
  if (quiet) return 'quiet';
  if (couples) return 'couples';
  if (beginners) return 'beginners';
  return null;
}

/**
 * @param {import('./canonicalPark').CanonicalPark} park
 * @returns {string|null}
 */
function excerptFromDescription(park) {
  const desc = (park.description || '').replace(/\s+/g, ' ').trim();
  if (desc.length < 40) return null;

  const beforeDash = desc.split(/\s[—–]\s/)[0].trim();
  const sentence =
    beforeDash.match(/^[^.!?]+[.!?]/)?.[0]?.trim() ||
    beforeDash.slice(0, 140).replace(/\s+\S*$/, '').trim();

  if (sentence.length < 35) return null;
  if (sentence.length > 145) {
    return `${sentence.slice(0, 142).replace(/\s+\S*$/, '')}…`;
  }
  return sentence;
}

/**
 * @param {import('./canonicalPark').CanonicalPark} park
 * @returns {string|null}
 */
function detectParkAngle(park) {
  const h = `${park.name} ${park.description} ${(park.activities || []).join(' ')}`.toLowerCase();

  if (/hoodoo|echo canyon|chiricahua/.test(h)) return 'hoodoos';
  if (/north cascad|diablo lake|ross lake|american alps/.test(h)) return 'north_cascades';
  if (/capitol reef|fruita|waterpocket/.test(h)) return 'capitol_reef';
  if (/voyageur|houseboat|boreal/.test(h)) return 'voyageurs';
  if (/acadia|cadillac|carriage road|park loop/.test(h)) return 'acadia_coast';
  if (/olympic|hoh rain|hurricane ridge/.test(h)) return 'olympic_multi';
  if (/shenandoah|skyline drive/.test(h)) return 'shenandoah_drive';
  if (/pictured rocks|lake superior.*cliff|porcupine mountain/.test(h)) return 'lakeshore_cliffs';
  if (/redwood|tallest tree/.test(h)) return 'redwoods_coast';
  if (/rainier|paradise meadow|reflection lake/.test(h)) return 'rainier_alpine';
  if (/isle royale|lake superior island/.test(h)) return 'isle_royale';
  if (/big bend|santa elena|chisos/.test(h)) return 'big_bend_desert';
  if (/great basin|bristlecone|lehman cave/.test(h)) return 'great_basin';
  if (/congaree|bottomland|boardwalk/.test(h)) return 'swamp_forest';
  if (/national seashore|seashore/.test(park.category || '')) return 'seashore';
  if (/national lakeshore|lakeshore/.test(park.category || '')) return 'lakeshore';

  return null;
}

/** @type {Record<string, string>} */
const QUIET_COUPLES_ANGLE = {
  hoodoos:
    'Surreal rock spires and sky-island trails — short loops and scenic drives at a pace that works for two.',
  north_cascades:
    'Alpine lakes and jagged peaks — Northwest drama without Rainier-scale weekend crowds.',
  capitol_reef:
    'Orchards, reef country, and slot canyons — Utah scenery without the busiest-park shuttle crush.',
  voyageurs:
    'Lake country by boat — the farther you get from the launch, the more it feels like just the two of you.',
  acadia_coast:
    'Maine coast loops and carriage roads — sunrise, cliffs, and easy shared stops between towns.',
  olympic_multi:
    'Rainforest walks one day, coast the next — three moods in one park without mega-park gridlock.',
  shenandoah_drive:
    'Ridge-line overlooks and gentle Skyline pacing — a couples road trip without hard backcountry.',
  lakeshore_cliffs:
    'Big-water cliffs and shoreline trails — boat days or short hikes with room between stops.',
  redwoods_coast:
    'Foggy groves and Pacific edges — quiet walks among giants, then a slow evening in a coastal town.',
  rainier_alpine:
    'Wildflower meadows and mirror lakes — big volcano views from short, shareable trails.',
  isle_royale:
    'Ferry-only island wilderness — among the lowest crowds anywhere if you stay past the day trippers.',
  big_bend_desert:
    'Desert canyons and mountain basin in one park — sunset at the river, stars after dark.',
  great_basin:
    'Caves, ancient pines, and high desert peaks — wide-open quiet with almost no neighbor parks.',
  swamp_forest:
    'Boardwalks through old-growth bottomland — flat, shady, and nothing like mountain-park chaos.',
  seashore:
    'Shoreline stretches and scenic coastal drives — sand, surf, and pullouts made for two.',
  lakeshore:
    'Great-lakes scale without the famous-park crush — water, cliffs, and unhurried trail time.',
};

/**
 * @param {import('./canonicalPark').CanonicalPark} park
 * @param {{ label: string }[]} primaryIntents
 * @returns {string|null}
 */
function getParkMatchBlurb(park, primaryIntents) {
  const code = (park.id || '').toLowerCase();
  const key = intentBlurbKey(primaryIntents);
  if (!code || !key) return null;

  const entry = PARK_BLURBS[code];
  if (entry?.[key]) return entry[key];

  if (key === 'quiet_couples') {
    const angle = detectParkAngle(park);
    if (angle && QUIET_COUPLES_ANGLE[angle]) return QUIET_COUPLES_ANGLE[angle];
  }

  if (key === 'quiet_couples' || key === 'couples' || key === 'quiet') {
    return excerptFromDescription(park);
  }

  return null;
}

module.exports = {
  PARK_BLURBS,
  intentBlurbKey,
  getParkMatchBlurb,
  detectParkAngle,
  excerptFromDescription,
};
