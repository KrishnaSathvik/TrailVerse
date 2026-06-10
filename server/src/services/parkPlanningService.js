const npsService = require('./npsService');
const enhancedParkService = require('./enhancedParkService');
const ridbService = require('./ridbService');
const { CROWD_SCORES } = require('../utils/constraintEngine');
const parkCrowdFacts = require('../data/parkCrowdFacts.json');

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** NPS codes aligned with frontend TIER_A_PARK_SLUGS (GSC tier-A parks). */
const TIER_A_PARK_CODES = new Set([
  'acad', 'arch', 'badl', 'bibe', 'blca', 'brca', 'cany', 'care', 'crla', 'cuva',
  'deva', 'dena', 'drto', 'ever', 'glac', 'glba', 'grca', 'grte', 'grsm', 'indu',
  'jotr', 'lavo', 'mora', 'olym', 'romo', 'sequ', 'whsa', 'wrst', 'yell', 'yose', 'zion',
]);

/** Primary gateway city when NPS HQ address is inside the park. */
const PARK_GATEWAY_CITIES = {
  acad: 'Bar Harbor, ME',
  arch: 'Moab, UT',
  badl: 'Wall, SD',
  bibe: 'Terlingua, TX',
  brca: 'Bryce, UT',
  cany: 'Moab, UT',
  crla: 'Chemult, OR',
  dena: 'Healy, AK',
  deva: 'Beatty, NV',
  ever: 'Homestead, FL',
  glac: 'West Glacier, MT',
  glba: 'Gustavus, AK',
  grca: 'Tusayan, AZ',
  grte: 'Jackson, WY',
  grsm: 'Gatlinburg, TN',
  havo: 'Volcano, HI',
  jotr: 'Twentynine Palms, CA',
  olym: 'Port Angeles, WA',
  romo: 'Estes Park, CO',
  sequ: 'Three Rivers, CA',
  whsa: 'Alamogordo, NM',
  yell: 'West Yellowstone, MT',
  yose: 'Mariposa, CA',
  zion: 'Springdale, UT',
};

/** Curated signature stops when NPS Things to Do is sparse or low-signal. */
const PARK_HIGHLIGHTS = {
  acad: 'Park Loop Road and Cadillac Mountain',
  arch: 'Delicate Arch',
  badl: 'Badlands Loop Road overlooks',
  bibe: 'Santa Elena Canyon',
  brca: 'Bryce Amphitheater overlooks',
  cany: 'Island in the Sky overlooks',
  crla: 'Rim Drive viewpoints',
  dena: 'Denali Park Road scenery',
  deva: 'Badwater Basin and Zabriskie Point',
  ever: 'Anhinga Trail and Shark Valley',
  glac: 'Going-to-the-Sun Road',
  grca: 'South Rim viewpoints along Desert View Drive',
  grte: 'Jenny Lake and Mormon Row',
  grsm: 'Cades Cove and Clingmans Dome',
  havo: 'Kīlauea caldera viewpoints',
  jotr: 'Skull Rock and Keys View',
  olym: 'Hurricane Ridge',
  romo: 'Trail Ridge Road',
  sequ: 'Giant Forest and Moro Rock',
  whsa: 'White Sands Dune Drive',
  yell: 'Old Faithful and Grand Prismatic Spring',
  yose: 'Yosemite Valley and Glacier Point',
  zion: 'Angels Landing and Zion Canyon',
};

function shortParkName(fullName) {
  if (!fullName) return 'this park';
  return fullName
    .replace(/ National Park and Preserve$/i, '')
    .replace(/ National Park & Preserve$/i, '')
    .replace(/ National Parks and Preserves$/i, '')
    .replace(/ National Park$/i, '')
    .replace(/ National Preserve$/i, '')
    .replace(/ National Historical Park$/i, '')
    .replace(/ National Monument$/i, '')
    .trim();
}

function compressMonthNames(monthNames) {
  const indices = [...new Set(
    monthNames
      .map((m) => MONTHS.indexOf(m))
      .filter((i) => i >= 0)
  )].sort((a, b) => a - b);

  if (!indices.length) return null;

  const groups = [];
  let start = indices[0];
  let prev = indices[0];

  for (let i = 1; i <= indices.length; i++) {
    const curr = indices[i];
    if (curr === prev + 1) {
      prev = curr;
      continue;
    }
    groups.push([start, prev]);
    start = curr;
    prev = curr;
  }

  return groups
    .map(([s, e]) => (s === e ? MONTHS[s] : `${MONTHS[s]}–${MONTHS[e]}`))
    .join(', ');
}

function inferTripLength(park, activities = []) {
  const designation = park.designation || '';
  const name = park.fullName || '';
  const activityCount = Array.isArray(activities) ? activities.length : 0;
  const stateCount = (park.states || '').split(',').map((s) => s.trim()).filter(Boolean).length;

  if (/National Scenic Trail|Historic Trail|National Historic Trail|Parkway|Memorial Parkway/i.test(`${name} ${designation}`)) {
    return 'Multi-day (visit in segments)';
  }
  if (/Historic Site|National Memorial|Battlefield|Affiliated Area/i.test(designation) && !/National Park/i.test(name)) {
    if (activityCount >= 6) return '1 day';
    return '2–4 hours to 1 day';
  }
  if (/National Historical Park|Military Park|Battlefield Park/i.test(designation)) {
    if (activityCount >= 10) return '2–3 days';
    return '1–2 days';
  }
  if (/National Monument|National Lakeshore|National Seashore|National Recreation Area/i.test(designation)) {
    if (activityCount >= 12) return '2–3 days';
    if (activityCount >= 5) return '1–2 days';
    return 'Half day–1 day';
  }
  if (/National Preserve/i.test(designation)) {
    if (activityCount >= 15) return '3–5 days';
    return '2–4 days';
  }
  if (/National Park/i.test(designation) || /National Park/i.test(name)) {
    if (activityCount >= 20 || stateCount >= 3) return '4–7 days';
    if (activityCount >= 12) return '3–5 days';
    if (activityCount >= 6) return '2–4 days';
    if (activityCount <= 2) return '1–2 days';
    return '2–3 days';
  }
  if (activityCount >= 8) return '1–2 days';
  return 'Half day–2 days';
}

function addressCityLooksLikePark(park) {
  const city = park.addresses?.[0]?.city?.trim();
  if (!city) return false;
  const short = shortParkName(park.fullName).toLowerCase();
  if (/national park|national monument|national preserve|national historical park|national recreation area/i.test(city)) {
    return true;
  }
  if (short && city.toLowerCase() === short) return true;
  const firstWord = short.split(' ')[0];
  return Boolean(firstWord && firstWord.length > 3 && city.toLowerCase().includes(firstWord));
}

function getBaseTown(park) {
  const code = (park.parkCode || '').toLowerCase();
  const gateway = PARK_GATEWAY_CITIES[code];
  const addr = park.addresses?.[0];
  const city = addr?.city?.trim();
  const state = addr?.stateCode?.trim();

  if (gateway && (!city || addressCityLooksLikePark(park))) {
    return gateway;
  }
  if (city && addressCityLooksLikePark(park)) {
    return state ? `Gateway towns in ${state}` : null;
  }
  if (city && state) return `${city}, ${state}`;
  if (gateway) return gateway;
  if (state) return state;
  return null;
}

const SKIP_ACTIVITY = /^(hiking|walking|auto and atv|cycling|climbing|fishing|boating|camping|picnicking|wildlife viewing|bird watching|stargazing|photography|swimming|snow sports|skiing|horseback|rafting|kayaking|canoeing|road biking|mountain biking|backpacking)$/i;
const GENERIC_ACTIVITY = /visitor center|information desk|orientation/i;
const GENERIC_TITLE = /^(backpacking|camping|hiking|scenic driving|auto tour|wildlife viewing|bird watching|find the perfect|shopping|driving|bicycling|boating|fishing|horseback|rock climbing|skiing|stargazing|photography|ride a bike)/i;
const LOW_VALUE_ACTIVITY = /junior ranger|passport stamp|become an? |become a .* expert|film|museum|cemetery|exploration center|history center|learn art|wildlife safety|perfect sunrise|join a ranger|list of|get a .* stamp|view the night sky|go skiing|go ski\b|exhibit|kolb|geology talk|park films?|theater|\(\d+\s*minute/i;
const DISQUALIFY_ACTIVITY = /ski trail|snow pass|snow sports|cross-country ski|ice skating|sledding|snowshoe/i;

function scoreActivityTitle(title) {
  if (!title) return -1;
  const t = title.trim();
  if (DISQUALIFY_ACTIVITY.test(t)) return 0;
  if (SKIP_ACTIVITY.test(t)) return 0;
  if (GENERIC_TITLE.test(t)) return 0;
  if (GENERIC_ACTIVITY.test(t)) return 0;
  if (LOW_VALUE_ACTIVITY.test(t)) return 1;
  if (/watch old faithful|old faithful geyser|grand prismatic spring|delicate arch|angels landing|half dome|moraine lake|going-to-the-sun/i.test(t)) return 30;
  if (/^watch .* (geyser|erupt)/i.test(t)) return 28;
  if (/^hike (the|into|up|to)/i.test(t)) return 20;
  if (/^see the /i.test(t)) return 14;
  if (/^visit (the )?[A-Z]/i.test(t) && !/visitor center/i.test(t)) return 10;
  if (/overlook|falls|arch|canyon|valley|summit|dome|point|grove|basin|meadow|geyser|rim drive|loop road|scenic drive/i.test(t)) return 16;
  if (/\btrail\b/i.test(t)) return 11;
  let score = Math.min(t.length, 8);
  if (t.length > 72) score -= 4;
  return score;
}

function pickFromDescription(park) {
  const desc = (park.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const knownFor = desc.match(/best known for (?:its )?([^,.]+)/i);
  if (knownFor?.[1]) {
    const phrase = knownFor[1].trim();
    if (phrase.length > 3 && phrase.length < 80) {
      return phrase.charAt(0).toUpperCase() + phrase.slice(1);
    }
  }
  return null;
}

function pickDontMiss(park, activities) {
  const code = (park.parkCode || '').toLowerCase();
  const curated = PARK_HIGHLIGHTS[code];
  const list = Array.isArray(activities) ? activities : [];
  const scored = list
    .map((a) => {
      const title = a.title || a.name;
      return { title, score: scoreActivityTitle(title) };
    })
    .filter((x) => x.title && x.score > 0)
    .sort((a, b) => b.score - a.score);

  const ranked = scored.filter((x) => x.score >= 14);
  const top = ranked[0];

  if (top?.title && top.score >= 28) return top.title;
  if (curated && (!top || top.score < 22 || list.length <= 4)) return curated;
  if (top?.title) return top.title;

  const fromDesc = pickFromDescription(park);
  if (fromDesc) return fromDesc;
  if (curated) return curated;

  const moderate = scored.filter((x) => x.score >= 10);
  if (moderate[0]?.title) return moderate[0].title;

  const fallback = list
    .map((a) => a.title || a.name)
    .filter(Boolean)
    .find((t) => scoreActivityTitle(t) >= 5);
  if (fallback) return fallback;

  const short = shortParkName(park.fullName);
  const designation = park.designation || '';
  if (/Historic Site|Memorial|Battlefield/i.test(designation)) {
    return `Historic grounds and interpretive exhibits at ${short}`;
  }
  if (/National Scenic Trail|Historic Trail/i.test(park.fullName || '')) {
    return `Scenic trail segments — see Things to Do for access points`;
  }
  return `Main ${short} highlights — see Things to Do for current listings`;
}

function buildBestTimeLabel(bestTime, crowdScores, parkCode) {
  if (crowdScores) {
    const peak = Math.max(...crowdScores);
    const shoulder = [];
    for (let i = 0; i < 12; i++) {
      const score = crowdScores[i];
      if (score >= 2 && score <= 7 && score < peak) {
        shoulder.push(MONTHS[i]);
      }
    }
    const compressed = compressMonthNames(shoulder);
    if (compressed) return compressed;
  }

  if (bestTime?.months?.length) {
    const compressed = compressMonthNames(bestTime.months);
    if (compressed) return compressed;
  }

  const peakMonth = parkCrowdFacts[parkCode]?.peakMonth;
  if (peakMonth) {
    return `Outside ${peakMonth} peak crowds`;
  }

  return 'Spring and fall shoulder seasons';
}

function getPeakMonth(parkCode, crowdScores) {
  if (crowdScores) {
    const max = Math.max(...crowdScores);
    return MONTHS[crowdScores.indexOf(max)];
  }
  return parkCrowdFacts[parkCode]?.peakMonth || null;
}

function formatVisitsLine(parkCode) {
  const visits = parkCrowdFacts[parkCode]?.visits2025;
  if (!visits) return '';
  if (visits >= 1_000_000) {
    return ` About ${(visits / 1_000_000).toFixed(1)} million recreation visits were recorded in 2025.`;
  }
  if (visits >= 1_000) {
    return ` About ${Math.round(visits / 1_000)}k recreation visits were recorded in 2025.`;
  }
  return '';
}

function buildPermitAnswer(shortName, permits, parkCode) {
  const visitsLine = formatVisitsLine(parkCode);
  const crowd = parkCrowdFacts[parkCode];

  if (permits.length > 0) {
    const names = permits.slice(0, 2).map((p) => p.name).join(' and ');
    const more = permits.length > 2 ? ` (${permits.length} total on Recreation.gov)` : '';
    return `${shortName} has Recreation.gov reservations including ${names}${more}.${visitsLine} Confirm current rules on Recreation.gov and the Permits tab before travel.`;
  }

  if (crowd?.permitSystem) {
    if (/^none required/i.test(crowd.permitSystem)) {
      return `No general park entry reservation is listed for ${shortName}.${visitsLine} Campground, backcountry, and activity permits may still apply — check the Permits tab and the park's official website.`;
    }
    return `${crowd.permitSystem}.${visitsLine} Always confirm on Recreation.gov and the Permits tab before booking travel.`;
  }

  return `Reservation rules vary by season and activity for ${shortName}. Check the Permits tab on this page and Recreation.gov before you travel — campground, tour, or backcountry permits may apply even without park-wide timed entry.`;
}

function hasCrowdCalendarData(parkCode) {
  return Boolean(parkCode && parkCrowdFacts[parkCode]);
}

function getTimingFollowUp(park, parkCode, alertCount) {
  if (hasCrowdCalendarData(parkCode)) {
    return {
      suffix: ' See the crowd calendar for month-by-month visit patterns.',
      link: { linkKey: 'crowd' },
    };
  }
  if (alertCount > 0) {
    return {
      suffix: ' Check the Alerts tab on this page for current closures before you go.',
      link: { linkKey: 'alerts' },
    };
  }
  return {
    suffix: ' See Overview on this page for hours, fees, and getting here.',
    link: { linkKey: 'overview' },
  };
}

function getVisitConditionsSuffix(park, alertCount) {
  if (alertCount > 0) {
    return ' Check Alerts before you go for current road, trail, and weather closures.';
  }
  return '';
}

function spreadFaqLink(link) {
  if (!link) return {};
  if (link.linkKey) return { linkKey: link.linkKey };
  return {
    href: link.href,
    linkLabel: link.linkLabel,
    external: link.external,
  };
}

function buildPeakCrowdAnswer(shortName, park, parkCode, crowdScores, bestTime, alertCount) {
  const peakMonth = getPeakMonth(parkCode, crowdScores);
  const visitsLine = formatVisitsLine(parkCode);
  const crowdLevel = bestTime?.crowdLevel ? ` Typical crowd level: ${bestTime.crowdLevel}.` : '';
  const timingFollowUp = getTimingFollowUp(park, parkCode, alertCount);

  if (peakMonth) {
    return `${peakMonth} is usually the busiest month at ${shortName}.${crowdLevel}${visitsLine}${timingFollowUp.suffix}`;
  }

  const reasons = bestTime?.reasons?.slice(0, 2).join('; ');
  if (reasons) {
    const midFollowUp = alertCount > 0
      ? ' Check the Alerts tab before setting dates.'
      : ' Confirm hours and access on the Overview tab before setting dates.';
    return `Crowds and weather vary by season at ${shortName}. ${reasons}.${crowdLevel}${visitsLine}${midFollowUp}`;
  }

  return `Crowds and weather vary by season at ${shortName}.${crowdLevel}${timingFollowUp.suffix}`;
}

function buildExtraDaysAnswer(shortName, alertCount, park) {
  const conditionsSuffix = getVisitConditionsSuffix(park, alertCount);
  return `Use Things to Do to stack hikes and ranger programs by how long you have. What to See lists landmarks and viewpoints worth a separate stop. Add a buffer day for weather or a long hike you do not want to rush.${conditionsSuffix}`;
}

function buildLodgingAnswer(shortName, states) {
  return `In-park lodges and campgrounds at ${shortName} often book months ahead. Around This Park on this page lists gateway hotels, food, and services in ${states} — reserve early for peak season.`;
}

function buildFaqItems(park, permits, crowdScores, bestTime, alerts = []) {
  const name = park.fullName || 'this park';
  const short = shortParkName(name);
  const code = (park.parkCode || '').toLowerCase();
  const states = park.states || 'the region';
  const visitsLine = formatVisitsLine(code);
  const alertCount = Array.isArray(alerts) ? alerts.length : 0;
  const timingFollowUp = getTimingFollowUp(park, code, alertCount);

  const items = [
    {
      q: `Do you need reservations for ${short}?`,
      a: buildPermitAnswer(short, permits, code),
      linkKey: 'permits',
    },
    {
      q: `When is ${short} busiest?`,
      a: buildPeakCrowdAnswer(short, park, code, crowdScores, bestTime, alertCount),
      ...spreadFaqLink(timingFollowUp.link),
    },
    {
      q: `How should you plan extra time at ${short}?`,
      a: buildExtraDaysAnswer(short, alertCount, park),
      linkKey: 'activities',
    },
    {
      q: `Where should you book lodging for ${short}?`,
      a: buildLodgingAnswer(short, states),
    },
  ];

  if (TIER_A_PARK_CODES.has(code)) {
    items.push({
      q: `Is ${short} good for first-time national park visitors?`,
      a: `${short} is a popular first park thanks to established visitor services and accessible scenery.${visitsLine} Compare it with other beginner-friendly parks if you are still choosing.`,
      href: '/parks-for-first-timers',
      linkLabel: 'First-timer park lists →',
    });
  }

  return items;
}

/**
 * Build park-specific planning snapshot + FAQ from live NPS, crowd, and permit data.
 * @param {object} park - NPS park object
 */
async function buildParkPlanningContent(park) {
  if (!park?.parkCode) {
    return { snapshot: null, faqItems: [] };
  }

  const code = park.parkCode.toLowerCase();
  const crowdScores = CROWD_SCORES[code] || null;

  const [bestTimeResult, activitiesResult, permitsResult, alertsResult] = await Promise.allSettled([
    enhancedParkService.getBestTimeToVisit(park),
    npsService.getParkActivities(code),
    ridbService.getPermitsForPark(code),
    npsService.getParkAlerts(code),
  ]);

  const bestTime = bestTimeResult.status === 'fulfilled' ? bestTimeResult.value : null;
  const activities = activitiesResult.status === 'fulfilled' ? activitiesResult.value : [];
  const permits = permitsResult.status === 'fulfilled' ? permitsResult.value : [];
  const alerts = alertsResult.status === 'fulfilled' ? alertsResult.value : [];

  const snapshot = {
    bestTime: buildBestTimeLabel(bestTime, crowdScores, code),
    tripLength: inferTripLength(park, activities),
    dontMiss: pickDontMiss(park, activities),
    baseTown: getBaseTown(park),
  };

  const faqItems = buildFaqItems(park, permits, crowdScores, bestTime, alerts);

  return {
    snapshot,
    faqItems,
    meta: {
      activityCount: activities.length,
      permitCount: permits.length,
      alertCount: alerts.length,
      hasCrowdScores: !!crowdScores,
      bestTimeSource: bestTime?.source || 'computed',
    },
  };
}

module.exports = {
  buildParkPlanningContent,
  shortParkName,
};
