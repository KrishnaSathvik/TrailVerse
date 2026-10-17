'use strict';
// Explicit Playwright-only provider boundary. The application/router/database
// remain real; public park data is deterministic and never contacts NPS or AI.
if (process.env.NODE_ENV !== 'test') throw new Error('E2E bootstrap requires NODE_ENV=test');
const { setNpsAdapterForTests } = require('../src/services/npsService');
const parks = [{
  id: 'e2e-yellowstone', parkCode: 'yell', fullName: 'Yellowstone National Park', name: 'Yellowstone',
  designation: 'National Park', states: 'WY,MT,ID', latitude: '44.6', longitude: '-110.5',
  description: 'Explore Yellowstone National Park, its geysers, wildlife, and scenic trails. Offline browser-test fixture.',
  url: 'https://www.nps.gov/yell/', images: [], activities: [{ id: 'hiking', name: 'Hiking' }],
  topics: [], addresses: [], contacts: { phoneNumbers: [], emailAddresses: [] },
  entranceFees: [], operatingHours: [], directionsInfo: 'Check official park information.',
}];
const adapter = {
  getAllParks: async () => parks,
  getParkByCode: async code => parks.find(park => park.parkCode === String(code).toLowerCase()) || null,
  getCachedParks: () => parks,
};
for (const name of ['getParkAlerts', 'getParkActivities', 'getParkCampgrounds', 'getParkVisitorCenters',
  'getParkPlaces', 'getParkTours', 'getParkWebcams', 'getParkVideos', 'getParkGalleryPhotos',
  'getParkParkingLots', 'getParkBrochures', 'getParkPermits', 'getAllActivities', 'getAllAlerts',
  'getAllCampgrounds', 'getAllVisitorCenters', 'getAllPlaces', 'getAllTours', 'getAllWebcams',
  'getAllParkingLots', 'getActivities', 'getTopics']) adapter[name] = async () => [];
setNpsAdapterForTests(adapter);
