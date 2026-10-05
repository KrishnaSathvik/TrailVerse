'use strict';
jest.mock('node-fetch', () => jest.fn());
const fetch = require('node-fetch');
const { geocodePlace } = require('../geocodePlaceService');
const { createEvidenceBroker } = require('../evidenceBrokerService');
const { createGeocodeCoordinateEvidenceProvider } = require('../providers/geocodeCoordinateEvidenceProvider');
const { buildProductionGeoCoordinateResolver } = require('../../utils/productionGeoCoordinateResolver');
const { resolveGeoArtifactForAttempt } = require('../../utils/geoResolutionArtifact');

const previousKey = process.env.GMAPS_SERVER_KEY;
beforeEach(() => { fetch.mockReset(); process.env.GMAPS_SERVER_KEY = 'fake-test-key'; });
afterAll(() => {
  if (previousKey === undefined) delete process.env.GMAPS_SERVER_KEY;
  else process.env.GMAPS_SERVER_KEY = previousKey;
});
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { resolve, promise };
}
const google = (name) => ({ json: async () => ({ status: 'OK', results: [{
  formatted_address: name, geometry: { location: { lat: 44.5, lng: -110.8 } },
}] }) });

test.each(['google', 'open-meteo'])('turn abort reaches %s fetch and accepts no artifact', async (source) => {
  const entered = deferred();
  let networkSignal;
  if (source === 'open-meteo') delete process.env.GMAPS_SERVER_KEY;
  fetch.mockImplementation((_url, { signal }) => {
    networkSignal = signal;
    entered.resolve();
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () =>
      reject(Object.assign(new Error('abort'), { name: 'AbortError' })), { once: true }));
  });
  const forbidden = jest.fn();
  const broker = createEvidenceBroker({
    providers: [createGeocodeCoordinateEvidenceProvider()], acquireLease: forbidden,
    releaseLease: forbidden, queryEvidence: forbidden, persistCandidate: forbidden,
  });
  const resolveStopCoordinates = buildProductionGeoCoordinateResolver({
    dispatchEphemeral: (args) => broker.dispatchEphemeral(args),
  });
  const controller = new AbortController();
  const pending = resolveGeoArtifactForAttempt({
    itineraryData: { days: [{ dayNumber: 1, stops: [{
      id: 'a', name: 'Cancellation Geyser', type: 'geothermal',
      evidenceRef: 'ev:a', canonicalPlaceName: 'Cancellation Geyser',
    }] }] },
    evidenceBundle: { evidence: [{ evidenceId: 'ev:a', entityId: 'nps:park:yell',
      claim: { normalizedValue: { name: 'Cancellation Geyser' } } }] },
    resolveStopCoordinates, requestId: 'turn', signal: controller.signal, attempt: 1, dispatchIndex: 1,
  });
  await entered.promise;
  controller.abort();
  const artifact = await pending;
  expect(networkSignal.aborted).toBe(true);
  expect(artifact.resolvedCount).toBe(0);
  expect(artifact.counts.cancelled).toBe(1);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(forbidden).not.toHaveBeenCalled();
  expect(fetch.mock.calls[0][0]).not.toMatch(/directions|distancematrix|routes/);
});

test('fallback receives the same signal; abort between Google and fallback prevents second fetch', async () => {
  const controller = new AbortController();
  fetch.mockImplementationOnce(async () => {
    controller.abort();
    return { json: async () => ({ status: 'ZERO_RESULTS' }) };
  });
  await expect(geocodePlace('Between Sources', { signal: controller.signal })).rejects.toMatchObject({ code: 'ABORT_ERR' });
  expect(fetch).toHaveBeenCalledTimes(1);

  fetch.mockReset();
  const next = new AbortController();
  fetch.mockResolvedValueOnce({ json: async () => ({ status: 'ZERO_RESULTS' }) });
  fetch.mockResolvedValueOnce({ json: async () => ({ results: [] }) });
  await geocodePlace('Both Sources', { signal: next.signal });
  expect(fetch.mock.calls.map(([, options]) => options.signal)).toEqual([next.signal, next.signal]);
});

test('late network success after abort is not cached', async () => {
  const controller = new AbortController();
  fetch.mockImplementationOnce(async () => { controller.abort(); return google('Uncached Geyser'); });
  await expect(geocodePlace('Uncached Geyser', { signal: controller.signal })).rejects.toMatchObject({ code: 'ABORT_ERR' });
  fetch.mockResolvedValueOnce(google('Uncached Geyser'));
  await geocodePlace('Uncached Geyser');
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('seven-day cache reuse preserves source; aborted caller cannot receive cached success', async () => {
  fetch.mockResolvedValue(google('Cache Geyser'));
  const first = await geocodePlace('Cache Geyser');
  expect(await geocodePlace('Cache Geyser')).toEqual(first);
  expect(fetch).toHaveBeenCalledTimes(1);
  const controller = new AbortController();
  controller.abort();
  await expect(geocodePlace('Cache Geyser', { signal: controller.signal })).rejects.toMatchObject({ code: 'ABORT_ERR' });
  const realNow = Date.now();
  const clock = jest.spyOn(Date, 'now').mockReturnValue(realNow + 7 * 24 * 60 * 60 * 1000 + 1);
  try { await geocodePlace('Cache Geyser'); } finally { clock.mockRestore(); }
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('Google cannot corroborate a place by echoing the query when address is absent', async () => {
  fetch.mockResolvedValue({ json: async () => ({ status: 'OK', results: [{
    geometry: { location: { lat: 44.5, lng: -110.8 } },
  }] }) });
  const result = await geocodePlace('No Provider Address');
  expect(result.name).toBeNull();
});

test('exhausted network failure is classified separately from a clean no-result in ephemeral mode', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  fetch.mockRejectedValue(new Error('private URL and query'));
  try {
    await expect(geocodePlace('Provider Failure', { reportFailure: true }))
      .rejects.toMatchObject({ code: 'geocode_provider_failure', message: 'Geocode provider failed' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private URL');
  } finally { warn.mockRestore(); }
});


test.each(['REQUEST_DENIED', 'OVER_QUERY_LIMIT', 'OVER_DAILY_LIMIT'])('legacy callers retain null for %s with empty fallback', async (status) => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    fetch.mockResolvedValueOnce({ json: async () => ({ status }) });
    fetch.mockResolvedValueOnce({ json: async () => ({ results: [] }) });
    await expect(geocodePlace(`Legacy ${status}`)).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally { warn.mockRestore(); }
});

test('AbortError without an aborted signal remains cancellation and never starts fallback', async () => {
  fetch.mockRejectedValueOnce(Object.assign(new Error('cancelled'), { name: 'AbortError' }));
  await expect(geocodePlace('Abort exception', { reportFailure: true })).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).toHaveBeenCalledTimes(1);
});
