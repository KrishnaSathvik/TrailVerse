process.env.OPENWEATHER_API_KEY = 'private-weather-test-sentinel';
jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('../npsService', () => ({ getNpsService: jest.fn() }));
const axios = require('axios');
const service = require('../enhancedParkService');
const { getNpsService } = require('../npsService');
const { getParkWeather } = require('../../controllers/enhancedParkController');
const park = { parkCode: 'acad', latitude: '44.3', longitude: '-68.2' };
const current = { main: { temp: 77, humidity: 60, feels_like: 77 }, weather: [{ description: 'clear sky', icon: '01d' }], wind: { speed: 5 }, visibility: 10000, secret: 'private-weather-test-sentinel' };
const forecast = { list: [{ dt: 1704153600, main: { temp: 82 }, weather: [{ icon: '01d' }], secret: 'private-weather-test-sentinel' }] };
beforeEach(() => { jest.clearAllMocks(); service.cache.flushAll(); });
afterAll(() => service.cache.close());
test('display payload is allowlisted, uses private credential, and caches both provider responses', async () => {
  axios.get.mockResolvedValueOnce({ data: current }).mockResolvedValueOnce({ data: forecast });
  const result = await service.getWeatherData(park, { includeForecast: true });
  expect(result.widget.current.main.temp).toBe(77);
  expect(result.widget.forecast.list[0].main.temp).toBe(82);
  expect(JSON.stringify(result)).not.toContain('private-weather-test-sentinel');
  expect(axios.get.mock.calls[0][1].params.appid).toBe('private-weather-test-sentinel');
  expect(await service.getWeatherData(park, { includeForecast: true })).toEqual(result);
  expect(axios.get).toHaveBeenCalledTimes(2);
});
test('provider failure returns a sanitized error and logs no provider message/config', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  axios.get.mockRejectedValue({ message: 'private-weather-test-sentinel', response: { status: 401 }, config: { appid: 'private-weather-test-sentinel' } });
  await expect(service.getWeatherData(park, { includeForecast: true })).rejects.toThrow('Weather data temporarily unavailable');
  expect(JSON.stringify(log.mock.calls)).not.toContain('private-weather-test-sentinel');
  log.mockRestore();
});
test('legacy consumers retain their existing weather shape', async () => {
  axios.get.mockResolvedValueOnce({ data: current }).mockResolvedValueOnce({ data: forecast });
  expect(await service.getWeatherData(park)).not.toHaveProperty('widget');
});
const response = () => { const res = { status: jest.fn(), json: jest.fn() }; res.status.mockReturnValue(res); return res; };
test('route rejects malformed park codes before NPS/provider access', async () => {
  const res = response(); await getParkWeather({ params: { parkCode: '../x' } }, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(400); expect(getNpsService).not.toHaveBeenCalled();
});
test('route returns 404 for unknown park', async () => {
  getNpsService.mockReturnValue({ getParkByCode: jest.fn().mockResolvedValue(null) });
  const res = response(); await getParkWeather({ params: { parkCode: 'xxxx' } }, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(404); expect(axios.get).not.toHaveBeenCalled();
});
test('route hides upstream errors', async () => {
  getNpsService.mockReturnValue({ getParkByCode: jest.fn().mockRejectedValue(new Error('private-weather-test-sentinel')) });
  const res = response(); await getParkWeather({ params: { parkCode: 'acad' } }, res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(503); expect(JSON.stringify(res.json.mock.calls)).not.toContain('private-weather-test-sentinel');
});
