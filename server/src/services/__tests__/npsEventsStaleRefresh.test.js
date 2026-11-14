'use strict';

// Production 2026-11-14: 'Snapshot "events-query…elmo" is stale (174064min old), will refresh'
// was logged, but nothing refreshed: the stale copy was served and re-cached.
const { NPSService } = require('../npsService');

const event = (id, title) => ({ id, title, parkfullname: 'El Morro National Monument', dates: ['2099-01-01'], datestart: '2099-01-01', dateend: '2099-01-01' });

function serviceWithStaleSnapshot() {
  const svc = new NPSService({ apiKey: 'test' });
  svc._loadSnapshot = jest.fn(async () => ({ data: [event('old', 'Old walk')], stale: true, itemCount: 1, fetchedAt: '2026-07-16T00:00:00Z' }));
  svc._saveSnapshot = jest.fn(async () => {});
  svc.api = { get: jest.fn(async (_path, { params }) => ({ data: { data: params.pageNumber === 1 ? [event('new', 'New walk')] : [] } })) };
  return svc;
}

const flush = () => new Promise((r) => setTimeout(r, 20));

test('stale filtered snapshot is served now and refreshed in the background', async () => {
  const svc = serviceWithStaleSnapshot();
  const first = await svc.getAllEvents({ parkCode: 'elmo', limit: 10 });
  expect(first.map((e) => e.id)).toEqual(['old']);
  await flush();
  expect(svc.api.get).toHaveBeenCalledWith('/events', expect.objectContaining({ params: expect.objectContaining({ parkCode: 'elmo' }) }));
  expect(svc._saveSnapshot).toHaveBeenCalled();
  const next = await svc.getAllEvents({ parkCode: 'elmo', limit: 10 });
  expect(next.map((e) => e.id)).toEqual(['new']);
});

test('concurrent stale reads trigger one refresh', async () => {
  const svc = serviceWithStaleSnapshot();
  svc._getEndpointCache = () => null; // force both reads through the snapshot path
  await Promise.all([svc.getAllEvents({ parkCode: 'elmo' }), svc.getAllEvents({ parkCode: 'elmo' })]);
  await flush();
  expect(svc.api.get).toHaveBeenCalledTimes(1);
});
