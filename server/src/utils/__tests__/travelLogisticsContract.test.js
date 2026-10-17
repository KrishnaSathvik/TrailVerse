'use strict';

const {
  TRAVEL_LOGISTICS_SCHEMA_VERSION,
  emptyTravelLogistics,
  normalizeTravelLogistics,
  assertNoLiveCommercialClaims,
  assertCommercialInventorySafety,
  buildDriveLegId,
  metersToMiles,
} = require('../travelLogisticsContract');

describe('travelLogisticsContract', () => {
  test('empty shell uses schemaVersion 1 and not_requested statuses', () => {
    const t = emptyTravelLogistics();
    expect(t.schemaVersion).toBe(1);
    expect(t.inventoryMode).toBe('planning');
    expect(TRAVEL_LOGISTICS_SCHEMA_VERSION).toBe(1);
    expect(t.transport.airportsStatus).toBe('not_requested');
    expect(t.transport.routeLegsStatus).toBe('not_requested');
    expect(t.stays.insidePark.status).toBe('not_verified');
    expect(t.stays.insidePark.properties).toEqual([]);
    expect(t.stays.gateway.status).toBe('not_requested');
    expect(t.stays.campgrounds.status).toBe('not_requested');
  });

  test('normalize rejects ambiguous top-level version-only objects without schemaVersion', () => {
    const n = normalizeTravelLogistics({ version: 1, transport: {}, stays: {} });
    expect(n.ok).toBe(false);
  });

  test('normalize strips parallel top-level version when schemaVersion present', () => {
    const n = normalizeTravelLogistics({
      schemaVersion: 1,
      version: 99,
      transport: {},
      stays: {},
    });
    expect(n.ok).toBe(true);
    expect(n.value.schemaVersion).toBe(1);
    expect(n.value).not.toHaveProperty('version');
  });

  test('assertNoLiveCommercialClaims fails on livePrice true', () => {
    const t = emptyTravelLogistics();
    t.stays.gateway.status = 'available';
    t.stays.gateway.properties = [{
      propertyId: 'p1',
      name: 'Hotel',
      locationClass: 'gateway',
      provenance: { sourceType: 'google_places', livePrice: true, liveAvailability: false, evidenceStatus: 'verified' },
    }];
    expect(() => assertNoLiveCommercialClaims(t)).toThrow(/livePrice/);
  });

  test('planning inventory rejects price, availability, and retrieved flight rows', () => {
    const t = emptyTravelLogistics();
    t.transport.airportsStatus = 'available';
    t.transport.airports = [{
      airportCode: 'BZN',
      name: 'Bozeman',
      fare: 327,
      departureTime: '2026-09-10T08:05:00-05:00',
      availability: 'available',
    }];

    expect(() => assertCommercialInventorySafety(t)).toThrow(/planning_inventory_commercial_claim/);
  });

  test('live inventory requires valid row provenance', () => {
    const t = emptyTravelLogistics();
    t.inventoryMode = 'live';
    t.stays.gateway.status = 'available';
    t.stays.gateway.properties = [{
      propertyId: 'hotel-1',
      name: 'Example Hotel',
      nightlyRate: 297,
      availability: 'available',
    }];

    expect(() => assertCommercialInventorySafety(t)).toThrow(/live_inventory_provenance_missing/);

    t.stays.gateway.properties[0].provenance = {
      provider: 'inventory-provider',
      sourceType: 'live_inventory',
      fetchedAt: '2026-08-12T12:00:00.000Z',
    };
    expect(() => assertCommercialInventorySafety(t)).not.toThrow();
  });

  test('buildDriveLegId is deterministic', () => {
    const a = buildDriveLegId({ originEntityId: 'a', destinationEntityId: 'b', travelMode: 'drive' });
    const b = buildDriveLegId({ originEntityId: 'a', destinationEntityId: 'b', travelMode: 'drive' });
    expect(a).toBe(b);
    expect(a).toMatch(/^leg:/);
  });

  test('metersToMiles rounds reasonably', () => {
    expect(metersToMiles(1609.344)).toBeCloseTo(1, 2);
  });
});
