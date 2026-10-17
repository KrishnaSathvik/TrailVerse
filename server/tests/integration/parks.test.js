// Exercise the public router/controller/cache contract, not app startup or live NPS.
jest.mock('../../src/services/npsService', () => ({ getNpsService: jest.fn() }));
const request = require('supertest');
const express = require('express');
const { getNpsService } = require('../../src/services/npsService');
const { clearCache } = require('../../src/middleware/cache');
const app = express();
// The controller owns a periodic brochure-cache eviction timer. Keep real
// timers during requests, but release module-startup timers at suite teardown.
const startupIntervals = jest.spyOn(global, 'setInterval');
app.use('/api/parks', require('../../src/routes/parks'));
const intervalHandles = startupIntervals.mock.results.filter(result => result.type === 'return').map(result => result.value);
startupIntervals.mockRestore();
afterAll(() => intervalHandles.forEach(clearInterval));
app.use(require('../../src/middleware/errorHandler'));
const parks = [
  { id: 'yose', parkCode: 'yose', fullName: 'Yosemite National Park', states: 'CA', description: 'Yosemite fixture' },
  { id: 'zion', parkCode: 'zion', fullName: 'Zion National Park', states: 'UT', description: 'Zion fixture' },
];
let provider;
beforeEach(() => {
  clearCache();
  provider = {
    getAllParks: jest.fn().mockResolvedValue(parks),
    getParkByCode: jest.fn(code => Promise.resolve(parks.find(park => park.parkCode === code))),
    getParkActivities: jest.fn().mockResolvedValue([{ id: 'hike', name: 'Hiking' }]),
  };
  getNpsService.mockReturnValue(provider);
});

describe('Public parks HTTP integration (offline provider)', () => {
  test('lists parks without authentication', async () => {
    const { body } = await request(app).get('/api/parks').expect(200);
    expect(body).toMatchObject({ success: true, total: 2, count: 2, data: parks });
  });
  test('filters structured state codes', async () => {
    const { body } = await request(app).get('/api/parks?state=CA').expect(200);
    expect(body.data).toEqual([parks[0]]);
  });
  test('paginates using the public response contract', async () => {
    const { body } = await request(app).get('/api/parks?page=2&limit=1').expect(200);
    expect(body).toMatchObject({ page: 2, pages: 2, total: 2, hasMore: false, data: [parks[1]] });
  });
  test('projects requested fields', async () => {
    const { body } = await request(app).get('/api/parks?all=true&fields=parkCode,fullName').expect(200);
    expect(body.data).toEqual(parks.map(({ parkCode, fullName }) => ({ parkCode, fullName })));
  });
  test('gets exact park identity without authentication', async () => {
    const { body } = await request(app).get('/api/parks/yose').expect(200);
    expect(body.data).toEqual(parks[0]);
    expect(provider.getParkByCode).toHaveBeenCalledWith('yose');
  });
  test('returns 404 for missing park', async () => {
    const { body } = await request(app).get('/api/parks/missing').expect(404);
    expect(body).toEqual({ success: false, error: 'Park not found' });
  });
  test('delivers activities for the requested park', async () => {
    const { body } = await request(app).get('/api/parks/yose/activities').expect(200);
    expect(body).toMatchObject({ success: true, count: 1, data: [{ id: 'hike', name: 'Hiking' }] });
    expect(provider.getParkActivities).toHaveBeenCalledWith('yose');
  });
  test('caches anonymous successful lists, with query separation', async () => {
    await request(app).get('/api/parks').expect(200);
    const cached = await request(app).get('/api/parks').expect(200);
    expect(cached.headers.age).toBeDefined();
    expect(provider.getAllParks).toHaveBeenCalledTimes(1);
    await request(app).get('/api/parks?state=CA').expect(200);
    expect(provider.getAllParks).toHaveBeenCalledTimes(2);
  });
  test('does not share cached responses with authenticated requests', async () => {
    await request(app).get('/api/parks').expect(200);
    const response = await request(app).get('/api/parks').set('Authorization', 'Bearer test').expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(provider.getAllParks).toHaveBeenCalledTimes(2);
  });
  test('returns provider errors without caching them', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      provider.getAllParks.mockRejectedValueOnce(new Error('Fixture provider failure'));
      const response = await request(app).get('/api/parks').expect(500);
      expect(response.body).toEqual({ success: false, error: 'Fixture provider failure' });
      expect(response.headers['cache-control']).toBe('no-store');
      await request(app).get('/api/parks').expect(200);
      expect(provider.getAllParks).toHaveBeenCalledTimes(2);
    } finally { log.mockRestore(); }
  });
});
