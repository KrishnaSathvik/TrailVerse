import fixtures from './public-itineraries/index.json';

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// Reviewed, public-safe snapshots only. Never fetch an account trip here.
export const PUBLIC_ITINERARIES = freeze(fixtures);
export const getPublicItinerary = slug => PUBLIC_ITINERARIES.find(item => item.slug === slug) || null;
export const planSimilarHref = sample => `/plan-ai?entry=new-trip&ask=${encodeURIComponent(`Plan a trip similar to this ${sample.plan.days.length}-day ${sample.title} sample. ${sample.prompt}`)}`;
