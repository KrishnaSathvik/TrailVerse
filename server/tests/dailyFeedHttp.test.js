const mockGet = jest.fn();
const mockStatus = jest.fn(() => ({ persistencePending: true }));
jest.mock('../src/services/dailyFeedCoordinator', () => ({
  createDailyFeedCoordinator: () => ({ get: mockGet, status: mockStatus }),
}));
const express = require('express');
const request = require('supertest');
const { getDailyFeed } = require('../src/controllers/dailyFeedController');
const { ensureTodaysFeed } = require('../src/services/dailyFeedScheduler');
const { getFeedDateKey } = require('../src/utils/dailyFeedDate');
const app = express(); app.get('/daily', getDailyFeed);
afterEach(() => jest.clearAllMocks());
test('serves retained draft with original date and private headers', async () => {
  mockGet.mockResolvedValue({ date: getFeedDateKey(), parkOfDay: { parkCode: 'yell' } });
  const response = await request(app).get('/daily');
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(response.body.persistencePending).toBe(true);
  expect(response.body.feedDate).toBe(response.body.data.date);
});
test('controlled failure uses 503 and Retry-After without exposing database details', async () => {
  mockGet.mockRejectedValue(Object.assign(new Error('private database details'), { retryAfter: 120 }));
  const response = await request(app).get('/daily');
  expect(response.status).toBe(503);
  expect(response.headers['retry-after']).toBe('120');
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(JSON.stringify(response.body)).not.toContain('private database details');
});
test('scheduler delegates to the same coordinator without a separate DB read', async () => {
  mockGet.mockResolvedValue({ date: getFeedDateKey(), parkOfDay: { name: 'Yellowstone' } });
  await ensureTodaysFeed({ force: false });
  expect(mockGet).toHaveBeenCalledWith({ force: false, feedDate: getFeedDateKey() });
});
