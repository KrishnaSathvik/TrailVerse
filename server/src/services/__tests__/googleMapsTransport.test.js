'use strict';
jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('node-fetch', () => jest.fn());
const axios = require('axios');
const fetch = require('node-fetch');
const { getGoogleMaps, fetchGoogleMaps } = require('../googleMapsTransport');
const previous = process.env.GMAPS_FORCE_IPV4;
afterEach(() => { jest.clearAllMocks(); if (previous === undefined) delete process.env.GMAPS_FORCE_IPV4; else process.env.GMAPS_FORCE_IPV4 = previous; });
test.each([undefined, 'false'])('default transport stays unchanged (%s)', flag => {
  if (flag === undefined) delete process.env.GMAPS_FORCE_IPV4; else process.env.GMAPS_FORCE_IPV4 = flag;
  const options = { timeout: 8000, signal: new AbortController().signal };
  getGoogleMaps('https://maps.googleapis.com/maps/api/geocode/json', options);
  fetchGoogleMaps('https://maps.googleapis.com/maps/api/geocode/json', options);
  expect(axios.get.mock.calls[0][1]).toBe(options);
  expect(fetch.mock.calls[0][1]).toBe(options);
});
test.each(['maps.googleapis.com', 'places.googleapis.com', 'routes.googleapis.com'])('opt-in applies IPv4 to %s and preserves request options', host => {
  process.env.GMAPS_FORCE_IPV4 = 'true';
  const options = { timeout: 8000, signal: new AbortController().signal, params: { query: 'Zion' } };
  getGoogleMaps(`https://${host}/test`, options);
  fetchGoogleMaps(`https://${host}/test`, options);
  const a = axios.get.mock.calls[0][1], f = fetch.mock.calls[0][1];
  expect(a).toMatchObject(options); expect(f).toMatchObject(options);
  expect(a.httpsAgent.options.family).toBe(4);
  expect(f.agent).toBe(a.httpsAgent);
});
test('other providers retain their original transport', () => {
  process.env.GMAPS_FORCE_IPV4 = 'true';
  const options = { timeout: 8000 };
  fetchGoogleMaps('https://nominatim.openstreetmap.org/search', options);
  expect(fetch.mock.calls[0][1]).toBe(options);
});
