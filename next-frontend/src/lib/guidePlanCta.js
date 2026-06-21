/**
 * Trailie CTA copy for editorial planning guides (/guides/[slug]).
 * @typedef {{ title: string; body: string; planLabel: string; compareLabel?: string; compareHref?: string }} GuidePlanCta
 */

/** @type {Record<string, GuidePlanCta>} */
export const GUIDE_PLAN_CTAS = {
  'best-free-national-park-trip-planner': {
    title: 'Plan a free park trip',
    body:
      'Shortlist parks, compare finalists, and draft a day-by-day route — Trailie pulls live alerts, weather, and permits with no account required.',
    planLabel: 'Plan free with Trailie',
    compareLabel: 'Compare parks',
  },
  'trailverse-vs-alltrails': {
    title: 'Plan the trip, then pick your trails',
    body:
      'Use TrailVerse for park selection and a full itinerary — then check specific hikes in AllTrails the week you go.',
    planLabel: 'Plan trip with Trailie',
    compareLabel: 'Compare finalists',
  },
  'plan-national-parks-in-chatgpt': {
    title: 'Plan in ChatGPT — or on the web',
    body:
      'The TrailVerse ChatGPT app uses live park data. Prefer the full experience? Trailie on the web saves trips and builds the same itineraries.',
    planLabel: 'Plan with Trailie',
    compareLabel: 'Compare parks first',
  },
  'yosemite-vs-yellowstone-first-timers': {
    title: 'Chose your park? Let’s plan it',
    body:
      'Dates, driving days, and must-see stops — Trailie builds a first-timer itinerary for Yosemite or Yellowstone with live alerts and weather.',
    planLabel: 'Plan my first park trip',
    compareLabel: 'Compare Yosemite vs Yellowstone',
    compareHref: '/compare?parks=yose,yell',
  },
  'best-national-park-apps-2026': {
    title: 'Start with one free planner',
    body:
      'Browse 470+ parks, compare options, and draft an AI itinerary — the workflow this roundup recommends for most visitors.',
    planLabel: 'Plan with Trailie',
    compareLabel: 'Compare park finalists',
  },
  'trailverse-vs-recreation-gov-and-nps-app': {
    title: 'Find permits, then plan the days',
    body:
      'TrailVerse surfaces Recreation.gov links on each park page. Tell Trailie your dates and it maps hikes and logistics around what you need to book.',
    planLabel: 'Plan around permits with Trailie',
    compareLabel: 'Compare parks',
  },
  'how-to-compare-national-parks-on-trailverse': {
    title: 'Compared your picks? Plan the winner',
    body:
      'You narrowed the list — share dates and starting city and Trailie turns your compare shortlist into a day-by-day itinerary.',
    planLabel: 'Plan compared parks with Trailie',
    compareLabel: 'Open compare tool',
    compareHref: '/compare',
  },
  'how-to-find-national-park-permits-and-reservations': {
    title: 'Got your permits? Build the itinerary',
    body:
      'Permits booked — Trailie maps the rest: driving days, trail order, and weather windows using live park data.',
    planLabel: 'Plan permit trip with Trailie',
    compareLabel: 'Compare permit-heavy parks',
  },
};

const DEFAULT_CTA = {
  title: 'Start planning',
  body:
    'Browse parks, compare finalists, or ask Trailie to build your itinerary — free to explore, no account required.',
  planLabel: 'Plan with Trailie',
  compareLabel: 'Compare parks',
};

/**
 * @param {{ slug: string; quickAnswer?: string }} guide
 * @returns {GuidePlanCta}
 */
export function getGuidePlanCta(guide) {
  const configured = GUIDE_PLAN_CTAS[guide?.slug];
  if (configured) return configured;

  return {
    ...DEFAULT_CTA,
    body: guide?.quickAnswer || DEFAULT_CTA.body,
  };
}

/** @returns {string[]} */
export function getAllGuideSlugsWithCta() {
  return Object.keys(GUIDE_PLAN_CTAS);
}
