'use strict';

jest.mock('axios', () => ({ get: jest.fn() }));
const axios = require('axios');
const { createMapsEvidenceProvider, interpretDistanceMatrixResponse } = require('../providers/mapsEvidenceProvider');
const { createEvidenceBroker } = require('../evidenceBrokerService');
const { enrichItineraryWithRouteEvidence } = require('../../utils/routeEvidenceDriveBridge');

const bucket = '2026-09-17T12:00:00.000Z';
const requirement = {
  requirementId: 'maps-hardening', topic: 'driving_time', evidenceTypes: ['fact'],
  entity: { entityId: 'nps:park:sequ' }, preferredProviders: ['google_maps'],
  routeScope: {
    origin: { entityId: 'nps:park:yose', latitude: 37.7, longitude: -119.6 },
    destination: { entityId: 'nps:park:sequ', latitude: 36.5, longitude: -118.6 },
    travelMode: 'driving', departureTimeBucket: bucket,
  },
};
const element = (extra = {}) => ({ status: 'OK', duration: { value: 120 }, distance: { value: 500 }, ...extra });
const body = (value = element()) => ({ status: 'OK', rows: [{ elements: [value] }] });
const reply = (data) => ({ data });
const denied = () => reply({ status: 'INVALID_REQUEST' });
let previousKey;
let previousDiag;
beforeEach(() => {
  previousKey = process.env.GMAPS_SERVER_KEY;
  previousDiag = process.env.TRAILIE_MAPS_DIAG_PATH;
  process.env.GMAPS_SERVER_KEY = 'fake-offline-key';
  delete process.env.TRAILIE_MAPS_DIAG_PATH;
  axios.get.mockReset();
  axios.get.mockImplementation(() => { throw new Error('Unexpected mocked HTTP request'); });
});
afterEach(() => {
  if (previousKey === undefined) delete process.env.GMAPS_SERVER_KEY;
  else process.env.GMAPS_SERVER_KEY = previousKey;
  if (previousDiag === undefined) delete process.env.TRAILIE_MAPS_DIAG_PATH;
  else process.env.TRAILIE_MAPS_DIAG_PATH = previousDiag;
});
function harness() {
  const provider = createMapsEvidenceProvider();
  const writes = [];
  const events = [];
  const broker = createEvidenceBroker({
    providers: [provider], queryEvidence: async () => writes,
    persistCandidate: async ({ candidate }) => { writes.push(candidate); },
    acquireLease: async () => ({ outcome: 'acquired', lease: { ownerId: 'test', fencingToken: 1 } }),
    releaseLease: async () => {}, recordRefreshEvent: async (event) => events.push(event),
    refreshHashSecret: 'offline-maps-test',
  });
  const dispatch = (extra = {}) => broker.dispatchEphemeral({ requirement, requestId: 'maps-test', ...extra });
  return { provider, broker, writes, events, dispatch };
}

test('base + traffic retain both values; genuine numeric zeros remain valid', () => {
  expect(interpretDistanceMatrixResponse(body(element({ duration_in_traffic: { value: 180 } }))))
    .toMatchObject({ baseDurationSeconds: 120, durationSeconds: 180, durationInTrafficSeconds: 180, distanceMeters: 500 });
  expect(interpretDistanceMatrixResponse(body(element({ duration: { value: 0 }, distance: { value: 0 } }))))
    .toMatchObject({ baseDurationSeconds: 0, durationSeconds: 0, durationInTrafficSeconds: null, distanceMeters: 0 });
});

test.each(['duration', 'distance'])('%s missing/null/empty/nonfinite/negative/non-number is a provider failure', async (field) => {
  for (const value of [undefined, null, '', '12', NaN, Infinity, -1, false]) {
    axios.get.mockResolvedValueOnce(reply(body(element({ [field]: { value }, duration_in_traffic: { value: 180 } }))));
    const h = harness();
    expect(await h.dispatch()).toMatchObject({ status: 'failed', reasonCode: 'provider_invalid_response', providerAttemptCount: 1 });
    expect(h.writes).toHaveLength(0);
  }
  expect(axios.get).toHaveBeenCalledTimes(8); // malformed results are not retried
});

test.each(['ZERO_RESULTS', 'NOT_FOUND'])('%s is explicit no_result, with no fabricated candidate', async (status) => {
  axios.get.mockResolvedValueOnce(reply(body({ status })));
  const h = harness();
  expect(await h.dispatch()).toMatchObject({ status: 'no_result', normalizedCandidates: [], providerAttemptCount: 1,
    metadata: { noResultReason: status } });
});

test.each([
  { status: 'OK' }, { status: 'OK', rows: [] },
  { status: 'OK', rows: [{ elements: [] }] }, body(null), body({}), body({ status: 'BOGUS' }),
  body(element({ duration_in_traffic: { value: null } })),
])('malformed response %j is failure, never no_result', async (data) => {
  axios.get.mockResolvedValueOnce(reply(data));
  expect(await harness().dispatch()).toMatchObject({ status: 'failed', reasonCode: 'provider_invalid_response' });
  expect(axios.get).toHaveBeenCalledTimes(1);
});

test('provider route-length limit is failure rather than clean absence', async () => {
  axios.get.mockResolvedValueOnce(reply(body({ status: 'MAX_ROUTE_LENGTH_EXCEEDED' })));
  expect(await harness().dispatch()).toMatchObject({ status: 'failed', reasonCode: 'provider_unavailable', providerAttemptCount: 1 });
});

test.each([
  [{ code: 'maps_not_configured' }, 'provider_not_configured', false],
  [{ code: 'maps_rate_limited' }, 'provider_rate_limited', false],
  [{ response: { status: 401 } }, 'provider_not_configured', false],
  [{ response: { status: 403 } }, 'provider_not_configured', false],
  [{ response: { status: 429 } }, 'provider_rate_limited', false],
  [{ response: { status: 503 } }, 'provider_unavailable', true],
  [{ code: 'ETIMEDOUT' }, 'provider_timeout', true],
  [{ code: 'ENOTFOUND' }, 'provider_unavailable', true],
  [{ code: 'ERR_CANCELED' }, 'provider_cancelled', false],
])('bounded classification: %j', (error, code, retryable) => {
  expect(createMapsEvidenceProvider().classifyError(error)).toEqual({ code, retryable });
});

test.each([['REQUEST_DENIED', 'provider_not_configured'], ['OVER_QUERY_LIMIT', 'provider_rate_limited']])(
  '%s retains classification through broker', async (status, reasonCode) => {
    axios.get.mockResolvedValueOnce(reply({ status, error_message: 'PRIVATE PROVIDER ERROR' }));
    const result = await harness().dispatch();
    expect(result).toMatchObject({ status: 'failed', reasonCode, providerAttemptCount: 1 });
    expect(JSON.stringify(result)).not.toContain('PRIVATE PROVIDER ERROR');
  });

test.each([false, true])('departure retry=%s records actual semantics and physical attempts', async (retry) => {
  if (retry) axios.get.mockResolvedValueOnce(denied());
  axios.get.mockResolvedValueOnce(reply(body()));
  const h = harness();
  const result = await h.dispatch();
  expect(result).toMatchObject({ status: 'fulfilled', providerAttemptCount: retry ? 2 : 1,
    metadata: { departureTimeApplied: !retry, requestedDepartureTimeBucket: bucket,
      actualDepartureTimeBucket: retry ? null : bucket } });
  expect(result.normalizedCandidates[0].claim.normalizedValue).toMatchObject({
    durationSeconds: 120, baseDurationSeconds: 120, durationInTrafficSeconds: null,
    departureTimeApplied: !retry, requestedDepartureTimeBucket: bucket,
    departureTimeBucket: retry ? null : bucket, actualDepartureTimeBucket: retry ? null : bucket,
  });
  expect(axios.get.mock.calls[0][1].params.departure_time).toBe(Date.parse(bucket) / 1000);
  if (retry) expect(axios.get.mock.calls[1][1].params).not.toHaveProperty('departure_time');
  expect(h.events).toHaveLength(1);
  expect(h.events[0]).toMatchObject({ providerAttemptCount: retry ? 2 : 1, persistedCandidateCount: 0 });
});

test('retry ending in no route still counts both HTTP requests', async () => {
  axios.get.mockResolvedValueOnce(denied()).mockResolvedValueOnce(reply(body({ status: 'ZERO_RESULTS' })));
  expect(await harness().dispatch()).toMatchObject({ status: 'no_result', providerAttemptCount: 2,
    metadata: { departureTimeApplied: false } });
});

test('retry ending in failure counts both requests', async () => {
  axios.get.mockResolvedValueOnce(denied()).mockRejectedValueOnce({ response: { status: 403 } });
  expect(await harness().dispatch()).toMatchObject({ status: 'failed', providerAttemptCount: 2, reasonCode: 'provider_not_configured' });
});

test('outer broker retry adds physical counts without conflating internal retry', async () => {
  axios.get.mockResolvedValueOnce(denied()).mockRejectedValueOnce({ code: 'ETIMEDOUT' })
    .mockResolvedValueOnce(reply(body()));
  expect(await harness().dispatch()).toMatchObject({ status: 'fulfilled', providerAttemptCount: 3, retryCount: 1 });
  expect(axios.get).toHaveBeenCalledTimes(3);
});

test('preflight failure reports zero physical HTTP attempts in broker telemetry', async () => {
  delete process.env.GMAPS_SERVER_KEY;
  const h = harness();
  expect(await h.dispatch()).toMatchObject({ status: 'failed', providerAttemptCount: 0, reasonCode: 'provider_not_configured' });
  expect(h.events[0].providerAttemptCount).toBe(0);
  expect(axios.get).not.toHaveBeenCalled();
});

test.each(['failed response', 'late success', 'request rejection'])('abort at %s never accepts a route or starts fallback', async (phase) => {
  const controller = new AbortController();
  axios.get.mockImplementationOnce(async (_url, { signal }) => {
    expect(signal).toBe(controller.signal);
    controller.abort();
    if (phase === 'request rejection') throw { code: 'ERR_CANCELED' };
    return phase === 'late success' ? reply(body()) : denied();
  });
  const provider = createMapsEvidenceProvider();
  await expect(provider.fetch(provider.buildRequest(requirement), { signal: controller.signal }))
    .rejects.toMatchObject({ code: 'ABORT_ERR', providerAttempts: 1 });
  expect(axios.get).toHaveBeenCalledTimes(1);
});

test('abort during interpretation prevents internal retry', async () => {
  const controller = new AbortController();
  axios.get.mockResolvedValueOnce(reply({ status: 'INVALID_REQUEST', get error_message() {
    controller.abort(); return 'private';
  } }));
  const provider = createMapsEvidenceProvider();
  await expect(provider.fetch(provider.buildRequest(requirement), { signal: controller.signal }))
    .rejects.toMatchObject({ code: 'ABORT_ERR', providerAttempts: 1 });
  expect(axios.get).toHaveBeenCalledTimes(1);
});

test('coalesced physical retry records one execution while keeping caller ownership', async () => {
  let finish;
  axios.get.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
    .mockResolvedValueOnce(reply(body()));
  const h = harness();
  const a = h.dispatch({ ownership: { attempt: 1 } });
  const b = h.dispatch({ ownership: { attempt: 2 } });
  await Promise.resolve();
  finish(denied());
  const results = await Promise.all([a, b]);
  expect(results.map((r) => r.ownership.attempt)).toEqual([1, 2]);
  expect(results.map((r) => r.providerAttemptCount)).toEqual([2, 2]);
  expect(axios.get).toHaveBeenCalledTimes(2);
  expect(h.events).toHaveLength(1);
  expect(h.events[0].providerAttemptCount).toBe(2);
});

test('persistent destination route retains retry semantics and remains bridge-compatible', async () => {
  axios.get.mockResolvedValueOnce(denied()).mockResolvedValueOnce(reply(body()));
  const h = harness();
  await h.broker.resolveEvidence({ requirements: [requirement], requestId: 'persistent-route' });
  expect(h.writes).toHaveLength(1);
  expect(h.writes[0].claim.normalizedValue).toMatchObject({ departureTimeApplied: false, durationSeconds: 120 });
  expect(h.events[0]).toMatchObject({ providerAttemptCount: 2, persistedCandidateCount: 1 });
  const enriched = enrichItineraryWithRouteEvidence({
    itineraryData: { days: [{ stops: [{ entityId: 'nps:park:yose' }, { entityId: 'nps:park:sequ' }] }] },
    evidenceBundle: { evidence: h.writes },
  });
  expect(enriched.itineraryData.days[0].stops[1].drivingTimeFromPreviousMin).toBe(2);
});

test('injected raw normalization cannot coerce missing metrics, and nullable traffic stays null', () => {
  const provider = createMapsEvidenceProvider();
  const request = provider.buildRequest(requirement);
  expect(provider.normalize({ durationSeconds: 120, distanceMeters: 500 }, request)[0].claim.normalizedValue.durationInTrafficSeconds).toBeNull();
  for (const field of ['durationSeconds', 'distanceMeters']) {
    for (const value of [null, undefined, '', NaN, Infinity, -1, '12']) {
      expect(() => provider.normalize({ durationSeconds: 120, distanceMeters: 500, [field]: value }, request))
        .toThrow(expect.objectContaining({ code: 'maps_invalid_response' }));
    }
  }
});

test('walking never claims a supplied departure time was applied', async () => {
  axios.get.mockResolvedValueOnce(reply(body()));
  const provider = createMapsEvidenceProvider();
  const request = provider.buildRequest({ ...requirement, routeScope: { ...requirement.routeScope, travelMode: 'walking' } });
  const fetched = await provider.fetch(request);
  expect(fetched.metadata).toMatchObject({ departureTimeApplied: false, actualDepartureTimeBucket: null });
  expect(axios.get.mock.calls[0][1].params).not.toHaveProperty('departure_time');
});

test('traffic duration is preferred only with the actual driving departure request', async () => {
  axios.get.mockResolvedValueOnce(reply(body(element({ duration_in_traffic: { value: 180 } }))));
  const result = await harness().dispatch();
  expect(result.normalizedCandidates[0].claim.normalizedValue).toMatchObject({
    durationSeconds: 180, baseDurationSeconds: 120, durationInTrafficSeconds: 180, departureTimeApplied: true,
  });
  axios.get.mockResolvedValueOnce(denied())
    .mockResolvedValueOnce(reply(body(element({ duration_in_traffic: { value: 180 } }))));
  expect(await harness().dispatch()).toMatchObject({ status: 'failed', reasonCode: 'provider_invalid_response', providerAttemptCount: 2 });
});

test.each(['no_result', 'malformed', 'failure'])('persistent %s writes no evidence and counts physical retry', async (outcome) => {
  axios.get.mockResolvedValueOnce(denied());
  if (outcome === 'failure') axios.get.mockRejectedValueOnce({ response: { status: 403 } });
  else axios.get.mockResolvedValueOnce(reply(outcome === 'no_result' ? body({ status: 'ZERO_RESULTS' }) : body({ status: 'OK' })));
  const h = harness();
  await h.broker.resolveEvidence({ requirements: [requirement], requestId: 'persistent-miss' });
  expect(h.writes).toHaveLength(0);
  expect(h.events[0]).toMatchObject({ providerAttemptCount: 2, persistedCandidateCount: 0,
    outcome: outcome === 'no_result' ? 'succeeded' : 'failed' });
});

test('broker cancellation reaches HTTP and discards late success with final physical accounting', async () => {
  let finish;
  let networkSignal;
  let started;
  const entered = new Promise((resolve) => { started = resolve; });
  axios.get.mockImplementationOnce((_url, { signal }) => {
    networkSignal = signal;
    started();
    return new Promise((resolve) => { finish = resolve; });
  });
  const controller = new AbortController();
  const h = harness();
  const pending = h.dispatch({ signal: controller.signal });
  await entered;
  controller.abort();
  expect(await pending).toMatchObject({ status: 'cancelled', normalizedCandidates: [] });
  expect(networkSignal.aborted).toBe(true);
  finish(reply(body()));
  await new Promise((resolve) => setImmediate(resolve));
  expect(h.events[0]).toMatchObject({ outcome: 'cancelled', providerAttemptCount: 1, persistedCandidateCount: 0 });
  expect(axios.get).toHaveBeenCalledTimes(1);
});
