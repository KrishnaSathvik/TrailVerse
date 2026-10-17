'use strict';

/**
 * DRIVING TIME GOLDENS UPDATED 2026-08-26.
 *
 * Single-destination plans, lodging-strategy and airport-strategy turns used to
 * expect a `driving_time` requirement with no route scope. The 2026-08-26
 * evidence audit measured what that requirement actually did: `google_maps.supports()`
 * is false without a `routeScope`, the topic declares no fallback provider, and
 * so it was planned, cache-looked-up and coverage-evaluated on every turn,
 * never satisfied, and permanently reported `coverage: 'partial'`.
 *
 * TRANSIT / EVENTS GOLDENS UPDATED 2026-08-27.
 *
 * Both were planned on every itinerary turn. Neither has a structured provider,
 * so together they forced BOTH sequential web waves — measured at 3,378 ms, 75%
 * of the evidence wall on the THRO benchmark — and for that turn they produced
 * nothing usable: `events` never met its own authority floor, and the `transit`
 * official-page follow returned the park's Accessibility page, because Theodore
 * Roosevelt has no shuttle. Both are now planned on demand, and FORBIDDEN on an
 * ordinary itinerary turn that asks for neither.
 *
 * These goldens encoded that defect. `driving_time` is now expected ONLY where a
 * real route scope exists — an inter-destination leg, or an origin the traveler
 * supplied — and is FORBIDDEN elsewhere. Post-generation drive minutes are
 * unaffected: `routeEvidenceDriveBridge` still computes them from canonical stops.
 */

const yosemite = {
  entityId: 'nps:park:yose', entityType: 'national_park', displayName: 'Yosemite National Park',
  parentEntityId: null, latitude: 37.8651, longitude: -119.5383, resolutionConfidence: 1,
};
const sequoia = {
  entityId: 'nps:park:sequ', entityType: 'national_park', displayName: 'Sequoia National Park',
  parentEntityId: null, latitude: 36.4864, longitude: -118.5658, resolutionConfidence: 1,
};

module.exports = Object.freeze([
  { id: 'general-season', prompt: 'Is Yosemite worth visiting in October?', entities: [yosemite], intent: 'general_qa', topics: ['destination_identity', 'overview', 'climate_normals'], forbidden: ['roads', 'weather_forecast', 'hotel_live'], legacyProviders: ['nps', 'weather'], legacyQueryTypes: [] },
  {
    id: 'priority-backup-access',
    prompt: "I'm visiting Glacier with only one full day. What should I prioritize, and what's a good backup plan if Logan Pass access or parking doesn't work out?",
    entities: [{
      entityId: 'nps:park:glac', entityType: 'national_park', displayName: 'Glacier National Park',
      parentEntityId: null, latitude: 48.696, longitude: -113.718, resolutionConfidence: 1,
    }],
    intent: 'general_qa',
    topics: [
      'destination_identity',
      'roads',
      'alerts_closures',
      'transit',
      'parking',
      'permits_reservations',
      'weather_forecast',
      'activities',
      'fees',
    ],
    forbidden: ['driving_time', 'astronomy', 'fee_free_dates', 'events'],
    legacyProviders: ['nps', 'weather', 'transit', 'permits'],
    legacyQueryTypes: [],
  },
  { id: 'destination', prompt: 'What are the best national parks for a first-time visitor?', entities: [], intent: 'destination_discovery', topics: ['destination_identity', 'overview', 'activities'], legacyProviders: [], legacyQueryTypes: [] },
  { id: 'place', prompt: 'Things to do in Yosemite', entities: [yosemite], intent: 'place_discovery', topics: ['destination_identity', 'activities'], legacyProviders: ['nps'], legacyQueryTypes: [] },
  { id: 'compare', prompt: 'Compare Yosemite and Sequoia for hiking.', entities: [yosemite, sequoia], intent: 'compare', topicCounts: { destination_identity: 2, overview: 2, activities: 2 }, legacyProviders: ['nps'], legacyQueryTypes: [] },
  { id: 'lodging-strategy', prompt: 'Where should I stay near Yosemite?', entities: [yosemite], intent: 'lodging_strategy', topics: ['destination_identity', 'lodging_strategy'], forbidden: ['hotel_live', 'driving_time'], legacyProviders: ['nps'], legacyQueryTypes: ['local_business'] },
  { id: 'hotel-live', prompt: 'Find a room near Yosemite tonight under $250', entities: [yosemite], intent: 'hotel_live_search', topics: ['destination_identity', 'lodging_strategy'], forbidden: ['hotel_live'], legacyProviders: ['nps', 'web'], legacyQueryTypes: ['local_business', 'live_sensitive'] },
  { id: 'flight-strategy', prompt: 'Which airport is best for Yosemite?', entities: [yosemite], intent: 'flight_strategy', topics: ['destination_identity'], forbidden: ['flight_live', 'flight_strategy', 'driving_time'], legacyProviders: ['nps'], legacyQueryTypes: [] },
  { id: 'flight-live', prompt: 'Find me flights to Yosemite tomorrow', entities: [yosemite], intent: 'flight_live_search', topics: ['destination_identity'], forbidden: ['flight_live', 'flight_strategy', 'driving_time'], legacyProviders: ['nps', 'web'], legacyQueryTypes: ['live_sensitive'] },
  { id: 'transport', prompt: 'How does the Yosemite shuttle work?', entities: [yosemite], intent: 'transport', topics: ['destination_identity', 'transit'], legacyProviders: ['nps', 'transit'], legacyQueryTypes: ['transit'] },
  { id: 'food', prompt: 'Best restaurants near Yosemite', entities: [yosemite], intent: 'local_business_food', topics: ['destination_identity', 'local_business'], legacyProviders: ['nps', 'web'], legacyQueryTypes: ['local_business'] },
  { id: 'events', prompt: 'What ranger programs are happening in Yosemite this weekend?', entities: [yosemite], intent: 'activities_tours_events', topics: ['destination_identity', 'activities', 'events', 'weather_forecast', 'permits_reservations'], legacyProviders: ['nps', 'weather', 'events', 'permits'], legacyQueryTypes: ['permit_booking', 'events'] },
  { id: 'permit', prompt: 'Do I need a permit for Half Dome?', entities: [yosemite], intent: 'permit_camping', topics: ['destination_identity', 'permits_reservations'], legacyProviders: ['nps', 'permits'], legacyQueryTypes: ['permit_booking'] },
  { id: 'simple', prompt: 'Plan a 3-day trip to Yosemite.', entities: [yosemite], intent: 'simple_itinerary', topics: ['destination_identity', 'activities', 'alerts_closures', 'roads', 'weather_forecast', 'permits_reservations', 'fees', 'hours', 'visitor_services', 'astronomy', 'fee_free_dates'], forbidden: ['driving_time', 'transit', 'events'], legacyProviders: ['nps', 'weather', 'events', 'permits', 'astro', 'feeFree'], legacyQueryTypes: ['itinerary', 'permit_booking', 'events', 'live_sensitive'] },
  { id: 'future-simple', prompt: 'Plan Yosemite next year', entities: [yosemite], intent: 'simple_itinerary', dates: { mode: 'season', validFrom: '2027-06-01T00:00:00.000Z', validThrough: '2027-08-31T23:59:59.000Z' }, topics: ['destination_identity', 'activities', 'alerts_closures', 'roads', 'climate_normals', 'permits_reservations', 'fees', 'hours', 'visitor_services', 'astronomy', 'fee_free_dates'], forbidden: ['weather_forecast', 'driving_time', 'transit', 'events'], legacyProviders: ['nps', 'weather', 'events', 'permits', 'astro', 'feeFree'], legacyQueryTypes: ['itinerary', 'permit_booking', 'events'] },
  { id: 'full', prompt: 'Plan a 7-day trip through Yosemite and Sequoia.', entities: [yosemite, sequoia], intent: 'full_trip', requiredTopics: ['destination_identity', 'activities', 'alerts_closures', 'roads', 'weather_forecast', 'permits_reservations', 'driving_time', 'lodging_strategy', 'local_business'], legacyProviders: ['nps', 'weather', 'web', 'events', 'permits', 'astro', 'feeFree'], legacyQueryTypes: ['itinerary', 'local_business', 'permit_booking', 'events', 'live_sensitive'] },
  { id: 'deep', prompt: 'Do deep research on a winter trip to Yosemite.', entities: [yosemite], intent: 'deep_research', requiredTopics: ['destination_identity', 'activities', 'alerts_closures', 'roads', 'climate_normals', 'permits_reservations', 'lodging_strategy'], forbidden: ['driving_time'], legacyProviders: ['nps', 'weather', 'web', 'events', 'permits', 'astro', 'feeFree'], legacyQueryTypes: ['itinerary', 'local_business', 'permit_booking', 'events'] },
  { id: 'live-road', prompt: "I'm in Yosemite now. Is Tioga Road open?", entities: [yosemite], intent: 'live_in_trip_assistance', topics: ['destination_identity', 'roads', 'alerts_closures'], assert: { topic: 'roads', freshnessClass: 'live', maxStaleSeconds: 0, criticality: 'hard' }, legacyProviders: ['nps'], legacyQueryTypes: ['live_sensitive'] },
  { id: 'refinement', prompt: 'Make day 2 easier', entities: [yosemite], priorTripState: { hasActiveTrip: true, hasItinerary: true }, intent: 'trip_refinement', topics: ['destination_identity', 'activities'], legacyProviders: ['nps'], legacyQueryTypes: [] },
  { id: 'meta', prompt: 'What can Trailie help me with?', entities: [], intent: 'meta_help', topics: [], legacyProviders: [], legacyQueryTypes: [] },
  { id: 'unsupported', prompt: 'Write a Python function to sort an array.', entities: [], intent: 'unsupported_non_travel', topics: [], legacyProviders: [], legacyQueryTypes: [] },
]);
