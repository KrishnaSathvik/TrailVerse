const {
  buildDrivingTimeLegs,
  extractAirportFromMessage,
  shouldIncludeInParkRoutes,
  shouldInjectDrivingTimes,
  enrichItineraryDrivingTimes,
} = require('../drivingTimesContextService');
const { getNearestAirports } = require('../../utils/airportCoordinates');

jest.mock('node-fetch');
const nodeFetch = require('node-fetch');

describe('drivingTimesContextService', () => {
  const zion = {
    parkCode: 'zion',
    parkName: 'Zion National Park',
    lat: 37.2982,
    lon: -113.0263,
  };

  const yellowstone = {
    parkCode: 'yell',
    parkName: 'Yellowstone',
    lat: 44.428,
    lon: -110.588,
  };

  it('builds inter-park chain with departure city', async () => {
    const legs = await buildDrivingTimeLegs({
      parks: [yellowstone, { parkCode: 'grte', parkName: 'Grand Teton', lat: 43.79, lon: -110.681 }],
      userCity: { name: 'Denver', lat: 39.74, lon: -104.99 },
      userMessage: 'road trip from Denver',
    });

    expect(legs).toHaveLength(2);
    expect(legs[0].from.name).toBe('Denver');
    expect(legs[0].to.name).toBe('Yellowstone');
    expect(legs[1].to.name).toBe('Grand Teton');
  });

  it('skips driving context for trail status questions', async () => {
    const msg = 'Is Angels Landing open?';
    expect(
      shouldInjectDrivingTimes({
        userMessage: msg,
        parks: [zion],
        userCity: null,
        airport: null,
      })
    ).toBe(false);
  });

  it('injects nearest airports only for trip-planning questions', async () => {
    expect(
      shouldInjectDrivingTimes({
        userMessage: 'Plan a 3 day Zion itinerary',
        parks: [zion],
        userCity: null,
        airport: null,
      })
    ).toBe(true);
  });

  it('does not inject airports for generic park questions', async () => {
    expect(
      shouldInjectDrivingTimes({
        userMessage: 'Tell me about Zion',
        parks: [zion],
        userCity: null,
        airport: null,
      })
    ).toBe(false);
  });

  it('prefers explicit airport code over nearest-airport fallback', async () => {
    const legs = await buildDrivingTimeLegs({
      parks: [zion],
      userCity: null,
      userMessage: 'Flying into LAS airport then driving to Zion',
    });

    expect(legs).toHaveLength(1);
    expect(legs[0].from.code).toBe('LAS');
    expect(legs[0].to.name).toBe('Zion National Park');
  });

  it('extracts IATA airport codes from messages', () => {
    expect(extractAirportFromMessage('fly into SLC then rent a car')?.code).toBe('SLC');
    expect(extractAirportFromMessage('via DEN to the park')?.code).toBe('DEN');
  });

  it('flags itinerary queries for in-park routes', () => {
    expect(shouldIncludeInParkRoutes('Plan a 3 day Zion itinerary')).toBe(true);
    expect(shouldIncludeInParkRoutes('What is the weather?')).toBe(false);
  });

  it('ranks commercial airports near Zion', () => {
    const nearest = getNearestAirports(zion.lat, zion.lon, 3);
    const codes = nearest.map((a) => a.code);
    expect(codes).toContain('LAS');
    expect(codes.some((c) => ['SLC', 'CDC', 'LAS'].includes(c))).toBe(true);
  });

  it('enriches itinerary stop drive times from Google', async () => {
    const key = process.env.GMAPS_SERVER_KEY;
    process.env.GMAPS_SERVER_KEY = 'test-key';

    const fetchMock = nodeFetch;
    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({
          status: 'OK',
          rows: [{ elements: [{ status: 'OK', duration: { value: 1500, text: '25 mins' }, distance: { text: '10 mi' } }] }],
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          status: 'OK',
          rows: [{ elements: [{ status: 'OK', duration: { value: 720, text: '12 mins' }, distance: { text: '5 mi' } }] }],
        }),
      });
    fetchMock.mockClear();

    const data = {
      days: [{
        stops: [
          { name: 'Stop A', latitude: 37.1, longitude: -113.0, drivingTimeFromPreviousMin: 0 },
          { name: 'Stop B', latitude: 37.2, longitude: -113.1, drivingTimeFromPreviousMin: 99 },
          { name: 'Stop C', latitude: 37.3, longitude: -113.2 },
        ],
      }],
    };

    await enrichItineraryDrivingTimes(data, '[test]');
    expect(data.days[0].stops[1].drivingTimeFromPreviousMin).toBe(25);
    expect(data.days[0].stops[2].drivingTimeFromPreviousMin).toBe(12);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    if (key) process.env.GMAPS_SERVER_KEY = key;
    else delete process.env.GMAPS_SERVER_KEY;
  });
});
