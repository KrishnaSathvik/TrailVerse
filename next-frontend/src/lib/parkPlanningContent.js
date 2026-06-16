import parkCrowdFacts from '@/data/parkCrowdFacts.json';
import {
  getTimingFollowUp,
  spreadFaqLink,
} from '@/lib/planningConditionsCopy';
import {
  buildExtraDaysFaqAnswer,
  buildPeakCrowdFaqAnswer,
  buildPermitFaqAnswer,
  normalizePlanningFaqTabContext,
  peakCrowdFaqLink,
} from '@/lib/planningFaqTabs';
import { isTierAPark } from '@/lib/parkSeo';
import { parkToSlug } from '@/utils/parkSlug';

/** @typedef {{ bestTime: string; tripLength: string; dontMiss: string; baseTown: string | null }} ParkPlanningSnapshot */

/** Park-vs-park editorial compare links (NPS code pairs). */
const COMPARE_PAIR_SUGGESTIONS = {
  acad: { code: 'shen', label: 'Acadia vs Shenandoah' },
  shen: { code: 'acad', label: 'Shenandoah vs Acadia' },
  yose: { code: 'yell', label: 'Yosemite vs Yellowstone' },
  yell: { code: 'yose', label: 'Yellowstone vs Yosemite' },
  grca: { code: 'zion', label: 'Grand Canyon vs Zion' },
  zion: { code: 'grca', label: 'Zion vs Grand Canyon' },
  arch: { code: 'cany', label: 'Arches vs Canyonlands' },
  cany: { code: 'arch', label: 'Canyonlands vs Arches' },
  grte: { code: 'yell', label: 'Grand Teton vs Yellowstone' },
  glac: { code: 'romo', label: 'Glacier vs Rocky Mountain' },
  romo: { code: 'glac', label: 'Rocky Mountain vs Glacier' },
  crla: { code: 'olym', label: 'Crater Lake vs Olympic' },
  bibe: { code: 'deva', label: 'Big Bend vs Death Valley' },
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

function inferTripLengthClient(park) {
  const designation = park?.designation || '';
  const name = park?.fullName || '';

  if (/National Scenic Trail|Historic Trail|National Historic Trail|Parkway|Memorial Parkway/i.test(`${name} ${designation}`)) {
    return 'Multi-day (visit in segments)';
  }
  if (/Historic Site|National Memorial|Battlefield|Affiliated Area/i.test(designation) && !/National Park/i.test(name)) {
    return '2–4 hours to 1 day';
  }
  if (/National Historical Park|Military Park|Battlefield Park/i.test(designation)) {
    return '1–2 days';
  }
  if (/National Monument|National Lakeshore|National Seashore|National Recreation Area/i.test(designation)) {
    return '1–2 days';
  }
  if (/National Preserve/i.test(designation)) {
    return '2–4 days';
  }
  if (/National Park/i.test(designation) || /National Park/i.test(name)) {
    return '2–4 days';
  }
  return 'Half day–2 days';
}

/** Primary gateway city when NPS HQ address is inside the park (SSR fallback subset). */
const PARK_GATEWAY_CITIES = {
  acad: 'Bar Harbor, ME',
  arch: 'Moab, UT',
  badl: 'Wall, SD',
  bibe: 'Terlingua, TX',
  brca: 'Bryce, UT',
  cany: 'Moab, UT',
  dena: 'Healy, AK',
  deva: 'Beatty, NV',
  glac: 'West Glacier, MT',
  grca: 'Tusayan, AZ',
  grte: 'Jackson, WY',
  grsm: 'Gatlinburg, TN',
  havo: 'Volcano, HI',
  yell: 'West Yellowstone, MT',
  yose: 'Mariposa, CA',
  zion: 'Springdale, UT',
};

function addressCityLooksLikePark(park) {
  const city = park?.addresses?.[0]?.city?.trim();
  if (!city) return false;
  const short = shortParkName(park?.fullName).toLowerCase();
  if (/national park|national monument|national preserve|national historical park|national recreation area/i.test(city)) {
    return true;
  }
  if (short && city.toLowerCase() === short) return true;
  const firstWord = short.split(' ')[0];
  return Boolean(firstWord && firstWord.length > 3 && city.toLowerCase().includes(firstWord));
}

function getBaseTownClient(park) {
  const code = (park?.parkCode || '').toLowerCase();
  const gateway = PARK_GATEWAY_CITIES[code];
  const addr = park?.addresses?.[0];
  const city = addr?.city?.trim();
  const state = addr?.stateCode?.trim();

  if (gateway && (!city || addressCityLooksLikePark(park))) return gateway;
  if (city && addressCityLooksLikePark(park)) {
    return state ? `Gateway towns in ${state}` : null;
  }
  if (city && state) return `${city}, ${state}`;
  if (gateway) return gateway;
  if (state) return state;
  return null;
}

/**
 * Client-only fallback when SSR planning fetch fails — uses park metadata + crowd JSON.
 * @param {{ fullName?: string; parkCode?: string; designation?: string; addresses?: object[] }} park
 * @param {string} [parkSlug]
 * @returns {ParkPlanningSnapshot}
 */
export function getParkPlanningSnapshot(park, parkSlug) {
  const code = (park?.parkCode || '').toLowerCase();
  const crowd = parkCrowdFacts[code];
  const short = shortParkName(park?.fullName);

  let bestTime = 'Spring and fall shoulder seasons';
  if (crowd?.peakMonth) {
    bestTime = `Shoulder seasons outside ${crowd.peakMonth} peak`;
  }

  return {
    bestTime,
    tripLength: inferTripLengthClient(park),
    dontMiss: `${short} highlights — see Things to Do for current listings`,
    baseTown: getBaseTownClient(park),
  };
}

/**
 * @param {{ fullName?: string; parkCode?: string }} park
 * @param {{ parkCode: string; fullName: string }[]} relatedParks
 * @returns {{ label: string; href: string } | null}
 */
export function getParkCompareSuggestion(park, relatedParks = []) {
  const code = (park?.parkCode || '').toLowerCase();
  const pair = COMPARE_PAIR_SUGGESTIONS[code];
  if (pair) {
    return {
      label: pair.label,
      href: `/compare?parks=${code},${pair.code}`,
    };
  }

  const neighbor = relatedParks.find((p) => p.parkCode?.toLowerCase() !== code);
  if (neighbor?.parkCode) {
    const a = shortParkName(park?.fullName);
    const b = shortParkName(neighbor.fullName);
    return {
      label: `${a} vs ${b}`,
      href: `/compare?parks=${code},${neighbor.parkCode.toLowerCase()}`,
    };
  }

  return null;
}

const FAQ_LINK_LABELS = {
  crowd: 'View crowd calendar →',
  permits: 'See Permits tab →',
  activities: 'See Things to Do →',
  alerts: 'See Alerts tab →',
  overview: 'See Overview →',
};

function resolveFaqLinks(park, parkSlug) {
  const code = (park?.parkCode || '').toUpperCase();
  const slug = parkSlug || parkToSlug(park?.fullName || '');
  return {
    crowdHref: `/reports/when-to-go?park=${encodeURIComponent(code)}`,
    permitsHref: `/parks/${slug}?tab=permits`,
    activitiesHref: `/parks/${slug}?tab=activities`,
    alertsHref: `/parks/${slug}?tab=alerts`,
    overviewHref: `/parks/${slug}`,
  };
}

function applyFaqLinkKeys(items, links) {
  return items.map((item) => {
    if (item.href) {
      return {
        ...item,
        linkLabel: item.linkLabel || 'Learn more →',
      };
    }
    if (!item.linkKey) return item;
    const hrefMap = {
      crowd: links.crowdHref,
      permits: links.permitsHref,
      activities: links.activitiesHref,
      alerts: links.alertsHref,
      overview: links.overviewHref,
    };
    const href = hrefMap[item.linkKey];
    if (!href) return item;
    const { linkKey, ...rest } = item;
    return {
      ...rest,
      href,
      linkLabel: FAQ_LINK_LABELS[linkKey] || 'Learn more →',
    };
  });
}

/**
 * Resolve linkKey → href for SSR planning FAQ items.
 * @param {{ q: string; a: string; linkKey?: string; href?: string; linkLabel?: string }[]} faqItems
 */
export function hydratePlanningFaq(faqItems, park, parkSlug) {
  if (!faqItems?.length) return [];
  return applyFaqLinkKeys(faqItems, resolveFaqLinks(park, parkSlug));
}

function buildExtraDaysAnswer(short, alertCount, tabCtx) {
  return buildExtraDaysFaqAnswer({
    shortName: short,
    alertCount,
    hasActivitiesTab: tabCtx.hasActivitiesTab,
    hasPlacesTab: tabCtx.hasPlacesTab,
  });
}

function buildLodgingAnswer(short, states) {
  return `In-park lodges and campgrounds at ${short} often book months ahead. Around This Park on this page lists gateway hotels, food, and services in ${states} — reserve early for peak season.`;
}

function buildPeakCrowdAnswer(short, park, alertCount) {
  return buildPeakCrowdFaqAnswer({
    shortName: short,
    park,
    alertCount,
  });
}

function buildFactualFaq(park, parkSlug, alertCount = 0, tabCtxInput = {}) {
  const name = park?.fullName || 'this park';
  const short = shortParkName(name);
  const code = (park?.parkCode || '').toLowerCase();
  const crowd = parkCrowdFacts[code];
  const links = resolveFaqLinks(park, parkSlug);
  const states = park?.states || 'the region';
  const visitsLine = crowd?.visits2025
    ? ` About ${(crowd.visits2025 / 1_000_000).toFixed(1)} million recreation visits were recorded in 2025.`
    : '';
  const tabCtx = normalizePlanningFaqTabContext({
    alertCount,
    permitCount: tabCtxInput.permitCount ?? 0,
    hasActivitiesTab: tabCtxInput.hasActivitiesTab,
    hasPlacesTab: tabCtxInput.hasPlacesTab,
  });

  const permitAnswer = buildPermitFaqAnswer({
    shortName: short,
    parkCode: code,
    permits: Array.isArray(tabCtxInput.permits) && tabCtxInput.permits.length > 0
      ? tabCtxInput.permits
      : (tabCtx.hasPermitsTab ? [{}] : []),
    hasPermitsTab: tabCtx.hasPermitsTab,
  });

  const timingFollowUp = getTimingFollowUp(park, alertCount);
  const peakLink = peakCrowdFaqLink({
    park,
    alertCount,
    slug: parkSlug || parkToSlug(park?.fullName || ''),
  });

  const items = [
    {
      q: `Do you need reservations for ${short}?`,
      a: permitAnswer,
      ...(tabCtx.hasPermitsTab
        ? { href: links.permitsHref, linkLabel: FAQ_LINK_LABELS.permits }
        : { href: links.overviewHref, linkLabel: FAQ_LINK_LABELS.overview }),
    },
    {
      q: `When is ${short} busiest?`,
      a: buildPeakCrowdAnswer(short, park, alertCount),
      ...(peakLink.href
        ? { href: peakLink.href, linkLabel: peakLink.linkLabel }
        : spreadFaqLink(timingFollowUp.link)),
    },
    {
      q: `How should you plan extra time at ${short}?`,
      a: buildExtraDaysAnswer(short, alertCount, tabCtx),
      ...(tabCtx.hasActivitiesTab
        ? { href: links.activitiesHref, linkLabel: FAQ_LINK_LABELS.activities }
        : {}),
    },
    {
      q: `Where should you book lodging for ${short}?`,
      a: buildLodgingAnswer(short, states),
    },
  ];

  if (isTierAPark(parkSlug || parkToSlug(name))) {
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
 * Client fallback FAQ when SSR planning fetch fails.
 * @param {{ fullName?: string; parkCode?: string; states?: string }} park
 * @param {string} parkSlug
 * @param {ParkPlanningSnapshot} snapshot
 * @returns {{ q: string; a: string; href?: string; linkLabel?: string }[]}
 */
export function getParkPlanningFaq(park, parkSlug, _snapshot, alertCount = 0, tabCtx = {}) {
  return buildFactualFaq(park, parkSlug, alertCount, tabCtx);
}

export { shortParkName };
