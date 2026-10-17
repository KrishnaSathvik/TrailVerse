'use strict';

const yellowstoneFlyLodgeGolden = Object.freeze({
  context: {
    intent: { primaryIntent: 'full_trip' },
    messageText: 'Fly from St. Louis and stay in a lodge at Yellowstone',
    planningState: {
      destination: {
        parkCode: 'yell',
        parkName: 'Yellowstone National Park',
      },
      transportation: {
        mode: 'fly',
        departureCity: 'St. Louis',
        departureAirportCode: 'STL',
      },
      lodging: {
        type: 'lodging',
        accommodationClass: 'lodging',
        stayPreference: 'lodge',
        baseTown: 'West Yellowstone, MT',
      },
    },
    tripScope: null,
    routeLegEvidence: [],
    park: {
      parkCode: 'yell',
      parkName: 'Yellowstone National Park',
      entityId: 'nps:park:yell',
      latitude: 44.6,
      longitude: -110.5,
    },
  },
  mockMapsLegs: {
    'airport:BZN': {
      durationSeconds: 6900,
      distanceMeters: 225308,
    },
    'airport:JAC': {
      durationSeconds: 7980,
      distanceMeters: 206000,
    },
    'airport:BIL': {
      durationSeconds: 10140,
      distanceMeters: 282000,
    },
  },
  mockPlacesHotels: {
    ok: true,
    status: 'available',
    places: [
      {
        place_id: 'golden-west-yellowstone-hotel',
        name: 'Golden Gateway Hotel',
        rating: 4.4,
        vicinity: 'West Yellowstone, MT',
        mapsUrl: 'https://www.google.com/maps/place/?q=place_id:golden-west-yellowstone-hotel',
      },
      {
        place_id: 'golden-gardiner-hotel',
        name: 'Golden Gardiner Hotel',
        rating: 4.2,
        vicinity: 'Gardiner, MT',
        mapsUrl: 'https://www.google.com/maps/place/?q=place_id:golden-gardiner-hotel',
      },
    ],
  },
  catalog: {
    covered: true,
    entries: [
      {
        propertyId: 'yell:old-faithful-inn',
        parkCode: 'yell',
        name: 'Old Faithful Inn',
        propertyType: 'lodge',
        locationClass: 'inside_park',
        officialUrl: 'https://www.yellowstonenationalparklodges.com/lodgings/hotel/old-faithful-inn/',
        reservationUrl: 'https://www.yellowstonenationalparklodges.com/lodgings/hotel/old-faithful-inn/',
        source: 'National Park Service',
        sourceUrl: 'https://www.nps.gov/yell/planyourvisit/lodging.htm',
        sourceVerifiedAt: '2026-08-11',
      },
      {
        propertyId: 'yell:canyon-lodge-cabins',
        parkCode: 'yell',
        name: 'Canyon Lodge & Cabins',
        propertyType: 'lodge',
        locationClass: 'inside_park',
        officialUrl: 'https://www.yellowstonenationalparklodges.com/lodgings/cabin/canyon-lodge-cabins/',
        reservationUrl: 'https://www.yellowstonenationalparklodges.com/lodgings/cabin/canyon-lodge-cabins/',
        source: 'National Park Service',
        sourceUrl: 'https://www.nps.gov/yell/planyourvisit/lodging.htm',
        sourceVerifiedAt: '2026-08-11',
      },
    ],
  },
  expected: {
    departureCity: 'St. Louis',
    departureAirportCode: 'STL',
    accommodationClass: 'lodging',
    stayPreference: 'lodge',
    gatewayAreaLabel: 'West Yellowstone, MT',
  },
});

module.exports = {
  yellowstoneFlyLodgeGolden,
};
