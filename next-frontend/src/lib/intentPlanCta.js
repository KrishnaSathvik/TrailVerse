/**
 * Bottom Trailie CTA copy for parks-by-vibe intent landings.
 * @typedef {{ title: string; body: string; planLabel: string; compareLabel?: string }} IntentPlanCta
 */

/** @type {Record<string, IntentPlanCta>} */
export const INTENT_PLAN_CTAS = {
  '/parks-for-couples': {
    title: 'Plan a romantic park getaway',
    body:
      'Share your dates and travel style — Trailie maps scenic overlooks, relaxed hikes, and where to stay from the couples picks above.',
    planLabel: 'Plan couples trip with Trailie',
    compareLabel: 'Compare romantic parks',
  },
  '/parks-for-photography': {
    title: 'Plan your photo road trip',
    body:
      'Golden hour, Milky Way windows, and foreground scouting — tell Trailie your season, gear, and how many shoot days you have.',
    planLabel: 'Plan shoots with Trailie',
    compareLabel: 'Compare photo locations',
  },
  '/ocean-national-parks': {
    title: 'Plan a coastal park trip',
    body:
      'Tides, beach camps, and scenic drives — Trailie builds day-by-day routes through seashores and coastal parks from this list.',
    planLabel: 'Plan coastal trip with Trailie',
    compareLabel: 'Compare coastal parks',
  },
  '/fall-color-parks': {
    title: 'Plan a fall color trip',
    body:
      'Peak foliage shifts week to week. Give Trailie your dates and region — get a route through the best color parks for that window.',
    planLabel: 'Plan fall trip with Trailie',
    compareLabel: 'Compare fall destinations',
  },
  '/quiet-national-parks': {
    title: 'Plan a quieter park escape',
    body:
      'Skip the busiest gates and peak-season chaos. Trailie suggests timing, trails, and parks that match a slower pace.',
    planLabel: 'Plan quiet getaway with Trailie',
    compareLabel: 'Compare quiet finalists',
  },
  '/dark-sky-parks': {
    title: 'Plan a dark-sky shoot',
    body:
      'Moon phase, remote access, and overnight layers matter. Trailie helps line up astro nights at the parks ranked above.',
    planLabel: 'Plan astro trip with Trailie',
    compareLabel: 'Compare dark-sky parks',
  },
  '/parks-for-families': {
    title: 'Plan a family park trip',
    body:
      'Kid-friendly trails, Junior Ranger stops, and sane driving days — tell Trailie ages, dates, and how long you can be in the car.',
    planLabel: 'Plan family trip with Trailie',
    compareLabel: 'Compare family parks',
  },
  '/parks-for-first-timers': {
    title: 'Plan your first national park trip',
    body:
      'Not sure which park fits? Trailie turns this short list into a beginner-friendly itinerary with must-sees and realistic pacing.',
    planLabel: 'Plan my first park trip',
    compareLabel: 'Compare first-timer picks',
  },
  '/dog-friendly-parks': {
    title: 'Plan a dog-friendly park trip',
    body:
      'Leash rules and trail access vary park by park. Trailie plans routes that respect where dogs are actually welcome.',
    planLabel: 'Plan dog-friendly trip',
    compareLabel: 'Compare dog-friendly parks',
  },
  '/winter-national-parks': {
    title: 'Plan a winter park visit',
    body:
      'Road closures, snow gear, and shorter daylight — Trailie maps a winter-safe plan around the parks that shine in cold months.',
    planLabel: 'Plan winter trip with Trailie',
    compareLabel: 'Compare winter parks',
  },
  '/accessible-national-parks': {
    title: 'Plan an accessible park visit',
    body:
      'Paved paths, shuttle routes, and visitor centers with reliable access — share mobility needs and dates for a paced itinerary.',
    planLabel: 'Plan accessible trip with Trailie',
    compareLabel: 'Compare accessible parks',
  },
  '/wildlife-national-parks': {
    title: 'Plan a wildlife viewing trip',
    body:
      'Season, dawn timing, and distance rules — Trailie builds viewing days around the wildlife parks ranked above.',
    planLabel: 'Plan wildlife trip with Trailie',
    compareLabel: 'Compare wildlife parks',
  },
};

const DEFAULT_CTA = {
  title: 'Start planning',
  body:
    'Browse ranked picks, compare finalists, or ask Trailie to build your itinerary — free to explore, no account required.',
  planLabel: 'Plan with Trailie',
  compareLabel: 'Compare parks',
};

/**
 * @param {{ path: string; quickAnswer?: string }} landing
 * @returns {IntentPlanCta}
 */
export function getIntentPlanCta(landing) {
  const configured = INTENT_PLAN_CTAS[landing?.path];
  if (configured) return configured;

  return {
    ...DEFAULT_CTA,
    body: landing?.quickAnswer || DEFAULT_CTA.body,
  };
}
