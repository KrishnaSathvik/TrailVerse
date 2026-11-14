'use strict';

// Production 2026-11-14: every state-filtered park search timed out because the
// live NPS ?stateCode= call ran past the MCP server's 30s budget.
const mockGetParksByState = jest.fn(() => new Promise(() => {}));
const mockCachedParks = [
  { parkCode: 'arch', fullName: 'Arches National Park', designation: 'National Park', states: 'UT' },
  { parkCode: 'glca', fullName: 'Glen Canyon National Recreation Area', designation: 'National Recreation Area', states: 'AZ,UT' },
  { parkCode: 'grca', fullName: 'Grand Canyon National Park', designation: 'National Park', states: 'AZ' },
];
let mockCache = mockCachedParks;
jest.mock('../../services/npsService', () => ({
  getNpsService: () => ({ getCachedParks: () => mockCache, getParksByState: mockGetParksByState, getAllParks: async () => mockCachedParks }),
}));

const { loadCanonicalParks } = require('../parkCatalog');

test('state filter is served from the cached catalog without a live NPS call', async () => {
  const parks = await loadCanonicalParks({ state: 'UT' });
  expect(parks.map((p) => p.id).sort()).toEqual(['arch', 'glca']);
  expect(mockGetParksByState).not.toHaveBeenCalled();
});

test('without a cache it still uses the live state call', async () => {
  mockCache = null;
  mockGetParksByState.mockResolvedValueOnce([mockCachedParks[2]]);
  const parks = await loadCanonicalParks({ state: 'AZ' });
  expect(parks.map((p) => p.id)).toEqual(['grca']);
  expect(mockGetParksByState).toHaveBeenCalledWith('AZ');
});
