'use strict';

const { buildTravelLogistics } = require('../travelLogisticsBuilder');
const { assertNoLiveCommercialClaims } = require('../travelLogisticsContract');

describe('buildTravelLogistics drive legs', () => {
  test('maps evidence becomes verified legs with miles and cap feasibility', () => {
    const out = buildTravelLogistics({
      needs: { routeLegs: true, airports: false, insideParkLodging: false, gatewayLodging: false, campgrounds: false, rvFilter: false, vacationRentalHint: false, reasons: [] },
      transportMode: 'drive',
      departure: { city: 'Denver', airportCode: null },
      routeLegEvidence: [{
        originEntityId: 'city:denver',
        destinationEntityId: 'nps:park:romo',
        originLabel: 'Denver',
        destinationLabel: 'Rocky Mountain NP',
        durationSeconds: 6300,
        distanceMeters: 104607,
        status: 'verified',
      }],
      driveCap: { maxDailyDriveMinutes: 240 },
      adapterErrors: {},
    });
    expect(out.transport.routeLegsStatus).toBe('available');
    expect(out.transport.routeLegs).toHaveLength(1);
    expect(out.transport.routeLegs[0].durationMinutes).toBe(105);
    expect(out.transport.routeLegs[0].distanceMiles).toBeGreaterThan(60);
    expect(out.transport.routeLegs[0].feasibility.exceedsDailyDriveCap).toBe(false);
    expect(out.transport.airportsStatus).toBe('not_requested');
    assertNoLiveCommercialClaims(out);
  });

  test('leg over cap sets feasibility.exceedsDailyDriveCap without requiring itinerary', () => {
    const out = buildTravelLogistics({
      needs: { routeLegs: true, airports: false, insideParkLodging: false, gatewayLodging: false, campgrounds: false, rvFilter: false, vacationRentalHint: false, reasons: [] },
      transportMode: 'drive',
      departure: { city: null, airportCode: null },
      routeLegEvidence: [{
        originEntityId: 'nps:park:romo',
        destinationEntityId: 'nps:park:dino',
        originLabel: 'RMNP',
        destinationLabel: 'Dinosaur',
        durationSeconds: 24180,
        distanceMeters: 500000,
        status: 'verified',
      }],
      driveCap: { maxDailyDriveMinutes: 240 },
      adapterErrors: {},
    });
    expect(out.transport.routeLegs[0].feasibility.exceedsDailyDriveCap).toBe(true);
    expect(out.transport.routeLegs[0].durationMinutes).toBe(403);
  });

  test('needs.routeLegs false leaves routeLegsStatus not_requested', () => {
    const out = buildTravelLogistics({
      needs: { routeLegs: false, airports: false, insideParkLodging: false, gatewayLodging: false, campgrounds: false, rvFilter: false, vacationRentalHint: false, reasons: [] },
      transportMode: 'unknown',
      departure: { city: null, airportCode: null },
      routeLegEvidence: [{ originEntityId: 'a', destinationEntityId: 'b', durationSeconds: 100, distanceMeters: 1000, status: 'verified' }],
      driveCap: { maxDailyDriveMinutes: null },
      adapterErrors: {},
    });
    expect(out.transport.routeLegsStatus).toBe('not_requested');
    expect(out.transport.routeLegs).toEqual([]);
  });
});

describe('buildTravelLogistics airports', () => {
  test('builds AirportOption cards with normalized ground-transfer miles and minutes', () => {
    const out = buildTravelLogistics({
      needs: { routeLegs: false, airports: true },
      departure: { city: 'St. Louis', airportCode: 'STL' },
      airports: [{
        airportCode: 'BZN',
        entityId: 'airport:BZN',
        name: 'Bozeman Yellowstone (BZN)',
        groundTransfer: {
          durationSeconds: 6900,
          distanceMeters: 225308,
          destinationLabel: 'Yellowstone National Park',
          evidenceStatus: 'verified',
        },
      }],
      adapterErrors: {},
    });

    expect(out.transport.airportsStatus).toBe('available');
    expect(out.transport.airports).toHaveLength(1);
    expect(out.transport.airports[0]).toMatchObject({
      airportCode: 'BZN',
      entityId: 'airport:BZN',
      name: 'Bozeman Yellowstone (BZN)',
      groundTransfer: {
        durationMinutes: 115,
        distanceMeters: 225308,
        distanceMiles: expect.any(Number),
        destinationLabel: 'Yellowstone National Park',
        evidenceStatus: 'verified',
      },
      evidenceStatus: 'verified',
      provenance: {
        sourceType: 'google_maps',
        sourceName: 'Google Maps',
        evidenceStatus: 'verified',
        livePrice: false,
        liveAvailability: false,
      },
    });
    expect(out.transport.airports[0].groundTransfer.distanceMiles).toBeGreaterThan(139);
    expect(out.destination).toEqual({
      parkCode: null,
      parkName: null,
      entityId: null,
    });
    assertNoLiveCommercialClaims(out);
  });

  test('uses no_results only after a successful empty airport result', () => {
    const out = buildTravelLogistics({
      needs: { airports: true },
      airports: [],
      adapterErrors: {},
    });

    expect(out.transport.airportsStatus).toBe('no_results');
    expect(out.transport.airports).toEqual([]);
  });

  test('uses provider_unavailable when the airport adapter failed', () => {
    const out = buildTravelLogistics({
      needs: { airports: true },
      airports: [{
        airportCode: 'STALE',
        entityId: 'airport:STALE',
        name: 'Stale Airport',
      }],
      adapterErrors: { airports: new Error('Maps unavailable') },
    });

    expect(out.transport.airportsStatus).toBe('provider_unavailable');
    expect(out.transport.airports).toEqual([]);
  });
});

describe('buildTravelLogistics stays', () => {
  test('unknown park without catalog coverage is not_verified, not verified_none', () => {
    const out = buildTravelLogistics({
      needs: { routeLegs: false, airports: false, insideParkLodging: true, gatewayLodging: false, campgrounds: false, rvFilter: false, vacationRentalHint: false, reasons: [] },
      transportMode: 'unknown',
      departure: { city: null, airportCode: null },
      parkCode: 'xxxx',
      insideParkCatalog: [],
      catalogCoverage: false,
      adapterErrors: {},
    });

    expect(out.stays.insidePark.status).toBe('not_verified');
    expect(out.stays.insidePark.properties).toEqual([]);
  });

  test('official catalog properties become verified inside-park stays', () => {
    const out = buildTravelLogistics({
      needs: { routeLegs: false, airports: false, insideParkLodging: true, gatewayLodging: false, campgrounds: false, rvFilter: false, vacationRentalHint: false, reasons: [] },
      parkCode: 'yell',
      insideParkCatalog: [{
        propertyId: 'yell:old-faithful-inn',
        parkCode: 'yell',
        name: 'Old Faithful Inn',
        propertyType: 'lodge',
        locationClass: 'inside_park',
        officialUrl: 'https://www.yellowstonenationalparklodges.com/lodgings/hotel/old-faithful-inn/',
        source: 'Yellowstone National Park Lodges',
      }],
      catalogCoverage: true,
      adapterErrors: {},
    });

    expect(out.stays.insidePark.status).toBe('verified');
    expect(out.stays.insidePark.properties).toHaveLength(1);
    expect(out.stays.insidePark.properties[0]).toMatchObject({
      propertyId: 'yell:old-faithful-inn',
      locationClass: 'inside_park',
      evidenceStatus: 'verified',
    });
    assertNoLiveCommercialClaims(out);
  });

  test('Places enrichment cannot set inside_park on gateway-only place', () => {
    const out = buildTravelLogistics({
      needs: { routeLegs: false, airports: false, insideParkLodging: true, gatewayLodging: true, campgrounds: false, rvFilter: false, vacationRentalHint: false, reasons: [] },
      parkCode: 'yell',
      insideParkCatalog: [{
        propertyId: 'yell:old-faithful-inn',
        parkCode: 'yell',
        name: 'Old Faithful Inn',
        propertyType: 'lodge',
        locationClass: 'inside_park',
        officialUrl: 'https://www.yellowstonenationalparklodges.com/lodgings/hotel/old-faithful-inn/',
      }],
      catalogCoverage: true,
      gatewayPlaces: [{
        placeId: 'ChxFake',
        name: 'Fake Lodge Outside',
        rating: 4.9,
        address: 'West Yellowstone',
        mapsUrl: 'https://maps.google.com/?cid=1',
        locationClass: 'inside_park',
      }],
      adapterErrors: {},
    });

    expect(out.stays.insidePark.properties.every((property) => (
      property.locationClass === 'inside_park'
    ))).toBe(true);
    expect(out.stays.gateway.status).toBe('available');
    expect(out.stays.gateway.properties).toHaveLength(1);
    expect(out.stays.gateway.properties.every((property) => (
      property.locationClass === 'gateway'
    ))).toBe(true);
    expect(out.stays.gateway.properties.every((property) => (
      property.locationClass !== 'inside_park'
    ))).toBe(true);
  });
});

describe('buildTravelLogistics campgrounds', () => {
  test('accepts pre-normalized campground adapter output', () => {
    const property = {
      propertyId: 'nps-campground:cg-adapted',
      parkCode: 'yell',
      placeId: null,
      name: 'Adapted Campground',
      propertyType: 'campground',
      locationClass: 'unknown',
      rating: null,
      address: null,
      officialUrl: null,
      reservationUrl: null,
      mapsUrl: null,
      amenitiesSummary: null,
      rvSuitable: null,
      evidenceStatus: 'verified',
      provenance: {
        sourceType: 'nps',
        sourceName: 'National Park Service',
        evidenceStatus: 'verified',
        observedAt: null,
        sourceUpdatedAt: null,
        officialUrl: null,
        livePrice: false,
        liveAvailability: false,
      },
    };
    const out = buildTravelLogistics({
      needs: { campgrounds: true, rvFilter: false },
      campgroundAdapterOutput: { status: 'available', properties: [property] },
      adapterErrors: {},
    });

    expect(out.stays.campgrounds).toEqual({
      status: 'available',
      properties: [property],
    });
  });

  test('consumes normalized NPS campground cards when campground logistics are requested', () => {
    const out = buildTravelLogistics({
      needs: { campgrounds: true, rvFilter: false },
      parkCode: 'yell',
      npsCampgrounds: [{
        id: 'cg-1',
        name: 'Madison Campground',
        reservationUrl: 'https://www.recreation.gov/camping/campgrounds/234664',
        campsites: { totalSites: '278', rvOnly: '12' },
      }],
      adapterErrors: {},
    });

    expect(out.stays.campgrounds.status).toBe('available');
    expect(out.stays.campgrounds.properties).toHaveLength(1);
    expect(out.stays.campgrounds.properties[0]).toMatchObject({
      propertyId: 'nps-campground:cg-1',
      parkCode: 'yell',
      propertyType: 'campground',
      locationClass: 'unknown',
      rvSuitable: true,
    });
    assertNoLiveCommercialClaims(out);
  });

  test('applies the RV suitability filter when requested', () => {
    const out = buildTravelLogistics({
      needs: { campgrounds: true, rvFilter: true },
      parkCode: 'yell',
      npsCampgrounds: [
        {
          id: 'rv',
          name: 'RV Campground',
          campsites: { electricalHookups: '8' },
        },
        {
          id: 'unknown',
          name: 'Unknown Campground',
        },
      ],
      adapterErrors: {},
    });

    expect(out.stays.campgrounds.status).toBe('available');
    expect(out.stays.campgrounds.properties.map((property) => property.propertyId))
      .toEqual(['nps-campground:rv']);
  });

  test('marks campground provider errors unavailable and discards stale input', () => {
    const out = buildTravelLogistics({
      needs: { campgrounds: true, rvFilter: false },
      npsCampgrounds: [{ id: 'stale', name: 'Stale Campground' }],
      adapterErrors: { campgrounds: new Error('NPS unavailable') },
    });

    expect(out.stays.campgrounds).toEqual({
      status: 'provider_unavailable',
      properties: [],
    });
  });

  test('does not adapt campgrounds when the need gate is off', () => {
    const out = buildTravelLogistics({
      needs: { campgrounds: false, rvFilter: true },
      npsCampgrounds: [{ id: 'rv', name: 'RV Campground', campsites: { rvOnly: '4' } }],
      adapterErrors: {},
    });

    expect(out.stays.campgrounds).toEqual({
      status: 'not_requested',
      properties: [],
    });
  });
});

describe('buildTravelLogistics vacation rental hint', () => {
  test('vacation_rental need yields gateway area guidance and external search hint without inventory', () => {
    const out = buildTravelLogistics({
      needs: {
        routeLegs: false,
        airports: false,
        insideParkLodging: false,
        gatewayLodging: false,
        campgrounds: false,
        rvFilter: false,
        vacationRentalHint: true,
        reasons: ['stay_preference_vacation_rental'],
      },
      parkCode: 'yell',
      gatewayAreaLabel: 'West Yellowstone, MT',
      adapterErrors: {},
    });

    expect(out.stays.vacationRentalHint).toMatchObject({
      status: 'available',
      areas: ['West Yellowstone, MT'],
      externalSearchHint: expect.stringMatching(/West Yellowstone, MT/i),
    });
    expect(out.stays.vacationRentalHint).not.toHaveProperty('properties');
    expect(JSON.stringify(out.stays.vacationRentalHint)).not.toMatch(/\$\d|priceUsd|nightlyRate/i);
    assertNoLiveCommercialClaims(out);
  });

  test('leaves vacationRentalHint null when the need gate is off', () => {
    const out = buildTravelLogistics({
      needs: {
        routeLegs: false,
        airports: false,
        insideParkLodging: false,
        gatewayLodging: false,
        campgrounds: false,
        rvFilter: false,
        vacationRentalHint: false,
        reasons: [],
      },
      gatewayAreaLabel: 'West Yellowstone, MT',
      adapterErrors: {},
    });

    expect(out.stays.vacationRentalHint).toBeNull();
  });
});
