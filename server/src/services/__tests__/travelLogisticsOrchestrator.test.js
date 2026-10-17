'use strict';

const {
  buildTravelLogisticsForTurn,
} = require('../travelLogisticsOrchestrator');

function baseContext(overrides = {}) {
  return {
    planningState: null,
    tripState: null,
    intent: { primaryIntent: 'park_facts' },
    messageText: 'What are the best hikes in Yosemite?',
    tripScope: null,
    routeLegEvidence: [],
    park: {
      parkCode: 'yell',
      parkName: 'Yellowstone National Park',
      entityId: 'nps:park:yell',
      latitude: 44.6,
      longitude: -110.5,
    },
    ...overrides,
  };
}

function providerDeps(overrides = {}) {
  return {
    mapsGetRoute: jest.fn(async () => ({
      durationSeconds: 7200,
      distanceMeters: 160934,
    })),
    searchNearbyLodging: jest.fn(async () => ({
      ok: true,
      status: 'available',
      places: [{
        place_id: 'gateway-1',
        name: 'Gateway Inn',
        rating: 4.5,
        vicinity: 'West Yellowstone, MT',
      }],
    })),
    getNpsCampgrounds: jest.fn(async () => []),
    getBaseTown: jest.fn(() => 'West Yellowstone, MT'),
    ...overrides,
  };
}

describe('buildTravelLogisticsForTurn', () => {
  test('hike Q&A returns null without calling any provider', async () => {
    const deps = providerDeps();

    const result = await buildTravelLogisticsForTurn(baseContext(), deps);

    expect(result).toBeNull();
    expect(deps.mapsGetRoute).not.toHaveBeenCalled();
    expect(deps.searchNearbyLodging).not.toHaveBeenCalled();
    expect(deps.getNpsCampgrounds).not.toHaveBeenCalled();
  });

  test('fly plus lodge resolves at most three airports and official inside-park lodging', async () => {
    const deps = providerDeps();
    const result = await buildTravelLogisticsForTurn(baseContext({
      intent: { primaryIntent: 'full_trip' },
      messageText: 'Fly from St. Louis and stay in a lodge at Yellowstone',
      planningState: {
        destination: { parkCode: 'yell', parkName: 'Yellowstone National Park' },
        transportation: {
          mode: 'fly',
          departureCity: 'St. Louis',
          departureAirportCode: 'STL',
        },
        lodging: { type: 'lodging', stayPreference: 'lodge' },
      },
    }), deps);

    expect(result.transport.airportsStatus).toBe('available');
    expect(result.transport.airports).toHaveLength(3);
    expect(deps.mapsGetRoute).toHaveBeenCalledTimes(3);
    expect(result.stays.insidePark.status).toBe('verified');
    expect(result.stays.insidePark.properties.length).toBeGreaterThan(0);
    expect(result.stays.insidePark.properties.every(
      (property) => property.locationClass === 'inside_park'
    )).toBe(true);
    expect(deps.searchNearbyLodging).toHaveBeenCalledWith(expect.objectContaining({
      limit: 5,
    }));
    expect(result.stays.gateway.properties.length).toBeLessThanOrEqual(5);
    expect(deps.getNpsCampgrounds).not.toHaveBeenCalled();
  });

  test('camping resolves NPS campgrounds without calling Places lodging', async () => {
    const deps = providerDeps({
      getNpsCampgrounds: jest.fn(async () => [{
        id: 'madison',
        parkCode: 'yell',
        name: 'Madison Campground',
      }]),
    });

    const result = await buildTravelLogisticsForTurn(baseContext({
      intent: { primaryIntent: 'lodging_strategy' },
      messageText: 'We want to camp in Yellowstone',
      planningState: {
        destination: { parkCode: 'yell', parkName: 'Yellowstone National Park' },
        lodging: { type: 'camping', stayPreference: 'campground' },
      },
    }), deps);

    expect(result.stays.campgrounds.status).toBe('available');
    expect(result.stays.campgrounds.properties).toHaveLength(1);
    expect(deps.getNpsCampgrounds).toHaveBeenCalledTimes(1);
    expect(deps.searchNearbyLodging).not.toHaveBeenCalled();
    expect(deps.mapsGetRoute).not.toHaveBeenCalled();
    expect(deps.getBaseTown).not.toHaveBeenCalled();
  });

  test('applies the RV filter before passing normalized campground output to the builder', async () => {
    const deps = providerDeps({
      getNpsCampgrounds: jest.fn(async () => [
        {
          id: 'rv-ready',
          parkCode: 'yell',
          name: 'RV Ready',
          campsites: { electricalHookups: 4 },
        },
        {
          id: 'tent-only',
          parkCode: 'yell',
          name: 'Tent Only',
          campsites: { electricalHookups: 0, rvOnly: 0 },
          amenities: { dumpStation: 'No' },
        },
      ]),
    });

    const result = await buildTravelLogisticsForTurn(baseContext({
      intent: { primaryIntent: 'lodging_strategy' },
      messageText: 'We need RV camping in Yellowstone',
      planningState: {
        destination: { parkCode: 'yell' },
        lodging: { type: 'camping', stayPreference: 'rv' },
      },
    }), deps);

    expect(result.stays.campgrounds.properties).toHaveLength(1);
    expect(result.stays.campgrounds.properties[0]).toMatchObject({
      name: 'RV Ready',
      rvSuitable: true,
    });
    expect(deps.searchNearbyLodging).not.toHaveBeenCalled();
  });

  test('maps gateway failure to provider_unavailable instead of no results', async () => {
    const deps = providerDeps({
      searchNearbyLodging: jest.fn(async () => {
        throw new Error('offline Places failure');
      }),
    });

    const result = await buildTravelLogisticsForTurn(baseContext({
      intent: { primaryIntent: 'lodging_strategy' },
      messageText: 'Find a hotel near Yellowstone',
      planningState: {
        destination: { parkCode: 'yell' },
        lodging: { type: 'lodging', stayPreference: 'hotel' },
      },
    }), deps);

    expect(result.stays.gateway.status).toBe('provider_unavailable');
    expect(result.stays.gateway.areaLabel).toBe('West Yellowstone, MT');
  });

  test('this-turn Zion entity wins over stale Yosemite planning state', async () => {
    const deps = providerDeps();
    const result = await buildTravelLogisticsForTurn(baseContext({
      intent: { primaryIntent: 'flight_strategy' },
      messageText: 'Which airport should I use for Zion?',
      park: {
        parkCode: 'yose',
        parkName: 'Yosemite National Park',
        entityId: 'nps:park:yose',
        latitude: 37.7,
        longitude: -119.6,
      },
      planningState: {
        destination: { parkCode: 'yose', parkName: 'Yosemite National Park' },
        transportation: { mode: 'fly', departureCity: 'Dallas' },
      },
      resolvedEntities: [{
        entityId: 'nps:park:zion',
        displayName: 'Zion National Park',
        latitude: 37.3,
        longitude: -113.05,
      }],
    }), deps);

    expect(result.destination).toMatchObject({
      parkCode: 'zion',
      parkName: 'Zion National Park',
      entityId: 'nps:park:zion',
    });
    expect(deps.mapsGetRoute).toHaveBeenCalled();
  });
});
