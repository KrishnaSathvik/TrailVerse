'use strict';

/**
 * Phase 11I — public Maps debug routes must not exist.
 * They previously returned key prefixes / full Places URLs with the server key.
 */

const request = require('supertest');
const express = require('express');

const gmaps = require('../gmaps');

const app = express();
app.use('/api/gmaps', gmaps);

describe('gmaps debug endpoints are not public', () => {
  test('GET /api/gmaps/debug is 404', async () => {
    const res = await request(app).get('/api/gmaps/debug');
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/keyPrefix|keyLength|AIza/i);
  });

  test('GET /api/gmaps/debug-places is 404', async () => {
    const res = await request(app).get('/api/gmaps/debug-places');
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(/AIza|maps\.googleapis\.com\/maps\/api\/place/i);
  });
});
