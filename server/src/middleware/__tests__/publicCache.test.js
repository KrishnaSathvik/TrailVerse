const express = require('express');
const request = require('supertest');
const { cacheMiddleware, clearCache } = require('../cache');

describe('public response cache', () => {
  beforeEach(() => clearCache());
  test('cold/hit header parity, Age, and cached body', async () => {
    const app = express(); let calls = 0;
    app.get('/parks', cacheMiddleware(60), (req, res) => {
      calls++;
      res.set('Cache-Control', 'public, max-age=30, s-maxage=60').json({ calls });
    });
    const cold = await request(app).get('/parks');
    const hit = await request(app).get('/parks');
    expect(hit.headers['cache-control']).toBe(cold.headers['cache-control']);
    expect(hit.headers.age).toBe('0');
    expect(hit.body).toEqual({ calls: 1 });
  });
  test.each(['Authorization', 'Cookie'])('%s requests bypass shared cache and stay private', async header => {
    const app = express(); let calls = 0;
    app.get('/', cacheMiddleware(60), (req, res) => res.set('Cache-Control', 'public, max-age=60').json({ calls: ++calls }));
    await request(app).get('/');
    const privateResult = await request(app).get('/').set(header, 'test');
    expect(privateResult.headers['cache-control']).toBe('private, no-store');
    expect(privateResult.body.calls).toBe(2);
    expect((await request(app).get('/')).body.calls).toBe(1);
  });
  test.each(['private, max-age=60', 'no-store', 'no-cache'])('does not cache %s responses', async policy => {
    const app = express(); let calls = 0;
    app.get('/', cacheMiddleware(60), (req, res) => res.set('Cache-Control', policy).json({ calls: ++calls }));
    await request(app).get('/');
    expect((await request(app).get('/')).body.calls).toBe(2);
  });
  test.each([['Set-Cookie', 'session=private'], ['Vary', 'Authorization'], ['Vary', '*']])('does not replay %s-specific content', async (header, value) => {
    const app = express(); let calls = 0;
    app.get('/', cacheMiddleware(60), (req, res) => res.set(header, value).json({ calls: ++calls }));
    await request(app).get('/');
    expect((await request(app).get('/')).body.calls).toBe(2);
  });
  test.each([404, 500, 200])('never caches failure payloads (HTTP %s)', async status => {
    const app = express(); let calls = 0;
    app.get('/', cacheMiddleware(60), (req, res) => res.status(status).json({ success: false, calls: ++calls }));
    await request(app).get('/');
    const again = await request(app).get('/');
    expect(again.status).toBe(status);
    expect(again.body.calls).toBe(2);
    expect(again.headers['cache-control']).toBe('no-store');
  });
  test('expired entries regenerate and use the route public policy', async () => {
    const app = express(); let calls = 0;
    app.get('/', cacheMiddleware(0.01, { cacheControl: 'public, max-age=60' }), (req, res) => res.json({ calls: ++calls }));
    await request(app).get('/');
    await new Promise(resolve => setTimeout(resolve, 30));
    const result = await request(app).get('/');
    expect(result.body.calls).toBe(2);
    expect(result.headers['cache-control']).toBe('public, max-age=60');
  });
});
