'use strict';

const {
  normalizeCampgroundsForLogistics,
} = require('../campgroundStayAdapter');

describe('normalizeCampgroundsForLogistics', () => {
  test('normalizes official NPS campground fields without claiming inside-park lodging authority', () => {
    const result = normalizeCampgroundsForLogistics({
      parkCode: 'yell',
      npsCampgrounds: [{
        id: 'cg-1',
        parkCode: 'YELL',
        name: 'Madison Campground',
        reservationUrl: 'https://www.recreation.gov/camping/campgrounds/234664',
        fees: [{ title: 'Standard Site', cost: '33.00' }],
        campsites: {
          totalSites: '278',
          rvOnly: '12',
          electricalHookups: '0',
        },
        amenities: {
          potableWater: ['Yes - year round'],
          toilets: ['Flush toilets'],
          dumpStation: 'Yes',
        },
      }],
    });

    expect(result.status).toBe('available');
    expect(result.properties).toHaveLength(1);
    expect(result.properties[0]).toMatchObject({
      propertyId: 'nps-campground:cg-1',
      parkCode: 'yell',
      placeId: null,
      name: 'Madison Campground',
      propertyType: 'campground',
      locationClass: 'unknown',
      rating: null,
      address: null,
      officialUrl: null,
      reservationUrl: 'https://www.recreation.gov/camping/campgrounds/234664',
      mapsUrl: null,
      rvSuitable: true,
      evidenceStatus: 'verified',
      provenance: {
        sourceType: 'nps',
        sourceName: 'National Park Service',
        evidenceStatus: 'verified',
        officialUrl: 'https://www.recreation.gov/camping/campgrounds/234664',
        livePrice: false,
        liveAvailability: false,
      },
    });
    expect(result.properties[0].amenitiesSummary).toEqual(expect.arrayContaining([
      'Standard Site: $33.00',
      '278 total sites',
      '12 RV-only sites',
      'Potable water: Yes - year round',
      'Toilets: Flush toilets',
      'Dump station',
    ]));
    expect(result.properties[0]).not.toHaveProperty('price');
  });

  test('returns no_results for a successful empty NPS response', () => {
    expect(normalizeCampgroundsForLogistics({
      npsCampgrounds: [],
      rvFilter: false,
    })).toEqual({
      status: 'no_results',
      properties: [],
    });
  });

  test('returns provider_unavailable for an explicit provider failure signal', () => {
    expect(normalizeCampgroundsForLogistics({
      npsCampgrounds: { error: true },
    })).toEqual({
      status: 'provider_unavailable',
      properties: [],
    });
  });

  test('returns not_verified when no successful result or failure signal is supplied', () => {
    expect(normalizeCampgroundsForLogistics({
      npsCampgrounds: null,
    })).toEqual({
      status: 'not_verified',
      properties: [],
    });
  });

  test('RV filtering keeps only positively suitable campgrounds and does not invent inventory', () => {
    const result = normalizeCampgroundsForLogistics({
      rvFilter: true,
      npsCampgrounds: [
        {
          id: 'rv-sites',
          name: 'RV Sites',
          campsites: { rvOnly: '4', electricalHookups: '0' },
          amenities: { dumpStation: 'No' },
        },
        {
          id: 'tent-only',
          name: 'Tent Only',
          campsites: { rvOnly: '0', electricalHookups: '0', tentOnly: '15' },
          amenities: { dumpStation: 'No' },
        },
        {
          id: 'unknown-rv',
          name: 'Suitability Unknown',
        },
      ],
    });

    expect(result.status).toBe('available');
    expect(result.properties).toHaveLength(1);
    expect(result.properties[0]).toMatchObject({
      propertyId: 'nps-campground:rv-sites',
      rvSuitable: true,
    });
  });

  test('RV filtering returns available with an empty list when provider succeeded but none are suitable', () => {
    expect(normalizeCampgroundsForLogistics({
      rvFilter: true,
      npsCampgrounds: [{
        id: 'tent-only',
        name: 'Tent Only',
        campsites: { rvOnly: '0', electricalHookups: '0', tentOnly: '10' },
        amenities: { dumpStation: 'No' },
      }],
    })).toEqual({
      status: 'available',
      properties: [],
    });
  });

  test('leaves RV suitability null when NPS provides no RV evidence', () => {
    const result = normalizeCampgroundsForLogistics({
      npsCampgrounds: [{ id: 'unknown', name: 'Primitive Camp' }],
      rvFilter: false,
    });

    expect(result.properties[0].rvSuitable).toBeNull();
  });
});
