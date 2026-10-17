'use strict';

const { resolveLogisticsNeeds } = require('../logisticsNeedsResolver');

const base = {
  planningState: null,
  tripState: null,
  intent: { primaryIntent: 'park_facts' },
  messageText: 'What are the best hikes in Yosemite?',
  tripScope: null,
};

describe('resolveLogisticsNeeds', () => {
  test('hike Q&A activates nothing', () => {
    const n = resolveLogisticsNeeds(base);
    expect(n.routeLegs).toBe(false);
    expect(n.airports).toBe(false);
    expect(n.insideParkLodging).toBe(false);
    expect(n.gatewayLodging).toBe(false);
    expect(n.campgrounds).toBe(false);
  });

  test('fly + lodge trip activates airports and lodge slices', () => {
    const n = resolveLogisticsNeeds({
      ...base,
      intent: { primaryIntent: 'full_trip' },
      messageText: '5 days in Yellowstone from St. Louis, we will fly and stay in a lodge',
      planningState: {
        transportation: { mode: 'fly', departureCity: 'St. Louis', departureAirportCode: 'STL' },
        lodging: { type: 'lodging', stayPreference: 'lodge' },
      },
    });
    expect(n.airports).toBe(true);
    expect(n.insideParkLodging).toBe(true);
    expect(n.gatewayLodging).toBe(true);
    expect(n.campgrounds).toBe(false);
  });

  test('drive-only road trip activates routeLegs not airports', () => {
    const n = resolveLogisticsNeeds({
      ...base,
      intent: { primaryIntent: 'full_trip' },
      messageText: 'Road trip Denver to RMNP to Dinosaur, max 4 hours driving a day',
      planningState: { transportation: { mode: 'drive' } },
      tripScope: { routeLegs: [{}, {}], maxDailyDriveMinutes: 240 },
    });
    expect(n.routeLegs).toBe(true);
    expect(n.airports).toBe(false);
  });

  test('camping preference activates campgrounds not Places hotels', () => {
    const n = resolveLogisticsNeeds({
      ...base,
      intent: { primaryIntent: 'lodging_strategy' },
      messageText: 'We want to camp in Yellowstone',
      planningState: { lodging: { type: 'camping', stayPreference: 'campground' } },
    });
    expect(n.campgrounds).toBe(true);
    expect(n.gatewayLodging).toBe(false);
    expect(n.insideParkLodging).toBe(false);
  });

  test('persisted fly+lodge still activates on day-count refinement', () => {
    const n = resolveLogisticsNeeds({
      ...base,
      intent: { primaryIntent: 'refinement' },
      messageText: 'Make it 6 days instead',
      planningState: {
        transportation: { mode: 'fly', departureCity: 'St. Louis' },
        lodging: { type: 'lodging', stayPreference: 'lodge' },
      },
    });
    expect(n.airports).toBe(true);
    expect(n.insideParkLodging).toBe(true);
  });

  test('skill-level "A to B to C" does not activate routeLegs on full_trip', () => {
    const n = resolveLogisticsNeeds({
      ...base,
      intent: { primaryIntent: 'full_trip' },
      messageText: 'Tips from beginner to intermediate to advanced hikes in Yosemite',
      planningState: null,
    });
    expect(n.routeLegs).toBe(false);
    expect(n.airports).toBe(false);
    expect(n.insideParkLodging).toBe(false);
    expect(n.gatewayLodging).toBe(false);
    expect(n.campgrounds).toBe(false);
  });

  test('plain full_trip without transport or stay signals activates nothing', () => {
    const n = resolveLogisticsNeeds({
      ...base,
      intent: { primaryIntent: 'full_trip' },
      messageText: 'Plan 2 days in Zion.',
      planningState: null,
    });
    expect(n.routeLegs).toBe(false);
    expect(n.airports).toBe(false);
    expect(n.insideParkLodging).toBe(false);
    expect(n.gatewayLodging).toBe(false);
    expect(n.campgrounds).toBe(false);
  });
});
