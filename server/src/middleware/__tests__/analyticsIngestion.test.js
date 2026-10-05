const { EventEmitter } = require('events');
const Analytics = require('../../models/Analytics');
const { trackEvents } = require('../../controllers/analyticsController');
const { trackEvent, trackApiCall, trackPageView } = require('../analytics');
const { logParkSearch, logParkSearchClick } = require('../../services/parkSearchAnalytics');
const browser = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const crawler = 'meta-externalagent/1.1';
function req(ua) {
  return { body: { events: [{ eventType: 'page_view' }, { eventType: 'park_view' }, { eventType: 'user_action' }], sessionId: 'test' },
    get: key => key.toLowerCase() === 'user-agent' ? ua : undefined,
    params: {}, ip: '127.0.0.1', originalUrl: '/api/parks', path: '/api/parks', method: 'GET' };
}
function res() {
  const result = new EventEmitter(); result.statusCode = 500;
  result.status = jest.fn(() => result); result.json = jest.fn(() => result); return result;
}
describe('crawler rejection before analytics persistence', () => {
  beforeEach(() => {
    jest.spyOn(Analytics, 'create').mockResolvedValue({});
    jest.spyOn(Analytics, 'insertMany').mockResolvedValue([]);
  });
  afterEach(() => jest.restoreAllMocks());
  test.each([crawler, 'Googlebot/2.1', 'meta-externalfetcher/1.1'])('drops client batches from %s', async ua => {
    const response = res();
    await trackEvents(req(ua), response);
    expect(Analytics.insertMany).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(200);
  });
  test('retains legitimate browser events and filters bot-labelled rows in a mixed batch', async () => {
    const request = req(browser);
    request.body.events.push({ eventType: 'page_view', userAgent: crawler });
    await trackEvents(request, res());
    expect(Analytics.insertMany).toHaveBeenCalledTimes(1);
    expect(Analytics.insertMany.mock.calls[0][0]).toHaveLength(3);
    expect(Analytics.insertMany.mock.calls[0][0].every(event => !event.isBot)).toBe(true);
  });
  test('bounds batch size without inserting partial batches', async () => {
    const request = req(browser); request.body.events = Array(101).fill({ eventType: 'page_view' });
    const response = res(); await trackEvents(request, response);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(Analytics.insertMany).not.toHaveBeenCalled();
  });
  test.each(['Mozilla/5.0 Safari Technology Preview', undefined])('preserves unclassified legitimate clients: %s', async ua => {
    await trackEvents(req(ua), res());
    expect(Analytics.insertMany).toHaveBeenCalledTimes(1);
  });
  test.each(['page_view', 'user_action', 'api_call', 'error'])('filters server %s for crawlers and preserves users', async event => {
    await trackEvent(req(crawler), event, 'technical');
    expect(Analytics.create).not.toHaveBeenCalled();
    await trackEvent(req(browser), event, 'technical');
    expect(Analytics.create).toHaveBeenCalledTimes(1);
  });
  test.each([trackApiCall, trackPageView])('finish listeners do not persist crawler requests', middleware => {
    const response = res(); const next = jest.fn();
    middleware(req(crawler), response, next); response.emit('finish');
    expect(next).toHaveBeenCalledTimes(1);
    expect(Analytics.create).not.toHaveBeenCalled();
  });
  test('search analytics and clicks use the same crawler exclusion', () => {
    logParkSearch(req(crawler), { query: 'Yellowstone', parks: [] });
    logParkSearchClick(req(crawler), { parkCode: 'yell' });
    expect(Analytics.create).not.toHaveBeenCalled();
    logParkSearch(req(browser), { query: 'Yellowstone', parks: [] });
    logParkSearchClick(req(browser), { parkCode: 'yell' });
    expect(Analytics.create).toHaveBeenCalledTimes(2);
  });
});
