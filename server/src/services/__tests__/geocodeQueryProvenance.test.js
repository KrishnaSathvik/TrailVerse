'use strict';

jest.mock('node-fetch', () => jest.fn());
const { createGeocodeCoordinateEvidenceProvider } = require('../providers/geocodeCoordinateEvidenceProvider');
let geocodePlace;
beforeEach(() => {
  jest.isolateModules(() => { ({ geocodePlace } = require('../geocodePlaceService')); });
});

const place = 'Valley floor scenic walk';
const query = `${place}, Yosemite National Park`;
const provenance = {
  rawTravelerPlaceText: null,
  groundedPlaceText: place,
  explicitTravelerRegion: null,
  explicitTravelerCountry: null,
  contextualRegions: [],
  contextualPlaceText: 'Yosemite National Park',
};
const california = { name: place, lat: 37.7, lon: -119.6,
  admin1: 'California', countryCode: 'US', country: 'United States', source: 'open-meteo' };

test('system-added suffix stays retrieval context; identical traveler text retains explicit authority across cache hits', async () => {
  const candidates = jest.fn().mockResolvedValue([california]);
  const machine = await geocodePlace(query, { queryProvenance: provenance, geocodeCandidates: candidates });
  expect(machine).toMatchObject({ lat: 37.7, source: 'open-meteo' });
  expect(candidates).toHaveBeenCalledWith(query, expect.any(Object));
  // Same retrieval string, different provenance: the machine result cannot
  // bypass the existing explicit-region constraint on a direct traveler call.
  await expect(geocodePlace(query, { geocodeCandidates: candidates })).resolves.toBeNull();
  expect(candidates).toHaveBeenCalledTimes(2);
  await expect(geocodePlace(query, { queryProvenance: provenance, geocodeCandidates: candidates })).resolves.toEqual(machine);
  expect(candidates).toHaveBeenCalledTimes(2);
});

test('raw traveler region wins over conflicting retrieval suffix and trip context', async () => {
  const utah = { ...california, lat: 37.2, lon: -113, admin1: 'Utah' };
  const result = await geocodePlace(`${place}, Zion National Park`, {
    queryProvenance: { ...provenance, rawTravelerPlaceText: `${place}, California`,
      contextualPlaceText: 'Zion National Park', contextualRegions: [{ code: 'ut', name: 'utah' }] },
    geocodeCandidates: async () => [utah, california],
  });
  expect(result).toMatchObject({ lat: 37.7, selectionReason: 'explicit_traveler_region' });
});

test('explicit traveler fields remain distinct from active-trip context and participate in cache identity', async () => {
  const candidates = jest.fn().mockResolvedValue([california]);
  const options = { geocodeCandidates: candidates, queryProvenance: { ...provenance,
    explicitTravelerRegion: { code: 'ca', name: 'california' }, explicitTravelerCountry: 'US' } };
  await expect(geocodePlace(query, options)).resolves.toMatchObject({ lat: 37.7 });
  await expect(geocodePlace(query, { ...options, queryProvenance: {
    ...options.queryProvenance, explicitTravelerCountry: 'CA',
  } })).resolves.toBeNull();
  expect(candidates).toHaveBeenCalledTimes(2);
});

test('context-only regions still constrain ranking and cannot reuse another context cache entry', async () => {
  const candidates = jest.fn().mockResolvedValue([california]);
  const options = { geocodeCandidates: candidates, queryProvenance: { ...provenance,
    contextualRegions: [{ code: 'ca', name: 'california' }] } };
  await expect(geocodePlace(query, options)).resolves.toMatchObject({ selectionReason: 'active_trip_region_match' });
  await expect(geocodePlace(query, { ...options, queryProvenance: { ...provenance,
    contextualRegions: [{ code: 'ut', name: 'utah' }],
  } })).resolves.toBeNull();
  expect(candidates).toHaveBeenCalledTimes(2);
});

test('evidence-provider request preserves provenance and separates dedupe identities', async () => {
  const injected = jest.fn().mockResolvedValue(california);
  const provider = createGeocodeCoordinateEvidenceProvider({ geocodePlace: injected });
  const machine = provider.buildRequest({ topic: 'stop_coordinates', query, queryProvenance: provenance });
  const traveler = provider.buildRequest({ topic: 'stop_coordinates', query });
  expect(machine.dedupeKey).not.toBe(traveler.dedupeKey);
  expect(machine.publicCanonicalRequest.queryProvenance).toEqual(provenance);
  await provider.fetch(machine);
  expect(injected).toHaveBeenCalledWith(query, expect.objectContaining({ queryProvenance: provenance, reportFailure: true }));
});
