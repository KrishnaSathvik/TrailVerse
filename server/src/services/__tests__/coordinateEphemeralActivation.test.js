'use strict';

const { createEvidenceBroker } = require('../evidenceBrokerService');
const { createGeocodeCoordinateEvidenceProvider } = require('../providers/geocodeCoordinateEvidenceProvider');
const { buildProductionGeoCoordinateResolver } = require('../../utils/productionGeoCoordinateResolver');
const { resolveGeoArtifactForAttempt, fingerprintCandidateStops } = require('../../utils/geoResolutionArtifact');
const { resolveStopIdentities } = require('../../utils/stopIdentityResolution');
const { hasAuthoritativeCoordinates } = require('../../utils/coordinateValidation');
const { TOPIC_POLICY } = require('../evidencePlannerService');

const bundle = Object.freeze({ requestId: 'turn', evidence: Object.freeze([
  Object.freeze({ evidenceId: 'ev:prismatic', entityId: 'nps:park:yell', topic: 'activities',
    claim: Object.freeze({ normalizedValue: Object.freeze({ name: 'Grand Prismatic Spring' }) }) }),
]) });
const beforeBundle = JSON.stringify(bundle);
const stop = (extra = {}) => ({
  id: 's1', order: 1, name: 'Grand Prismatic Spring', type: 'geothermal', duration: 90, ...extra,
});
const plan = (stops = [stop()]) => resolveStopIdentities({
  itineraryData: { parkName: 'MODEL WRONG PARK', days: [{ dayNumber: 1, stops }] }, evidenceBundle: bundle,
}).itineraryData;
const raw = (extra = {}) => ({
  lat: 44.525, lon: -110.838, name: 'Grand Prismatic Spring, Yellowstone National Park', source: 'google', ...extra,
});
function harness(geocodePlace = jest.fn(async () => raw())) {
  const forbidden = jest.fn(() => { throw new Error('persistent stage entered'); });
  const events = [];
  const broker = createEvidenceBroker({
    providers: [createGeocodeCoordinateEvidenceProvider({ geocodePlace })],
    queryEvidence: forbidden, persistCandidate: forbidden, acquireLease: forbidden,
    releaseLease: forbidden, waitForRefresh: forbidden,
    recordRefreshEvent: async (event) => events.push(event),
  });
  const dispatchEphemeral = jest.fn((args) => broker.dispatchEphemeral(args));
  const resolveStopCoordinates = buildProductionGeoCoordinateResolver({ dispatchEphemeral });
  const run = (itineraryData = plan(), extra = {}) => resolveGeoArtifactForAttempt({
    itineraryData, evidenceBundle: bundle, requestId: 'turn', attempt: 1, dispatchIndex: 1,
    resolveStopCoordinates, ...extra,
  });
  return { run, dispatchEphemeral, geocodePlace, forbidden, events, broker };
}
afterEach(() => expect(JSON.stringify(bundle)).toBe(beforeBundle));

test.each([
  ['authoritative', stop({ latitude: 44, longitude: -110, coordinateSource: 'resolved_metadata' }), 0],
  ['tool-only', stop({ latitude: 1, longitude: 2, coordinateSource: 'tool' }), 1],
  ['missing', stop(), 1],
  ['meal', stop({ type: 'meal' }), 0],
  ['unbound', stop({ name: 'Invented Attraction' }), 0],
])('%s eligibility', async (_label, candidate, expected) => {
  const h = harness();
  await h.run(plan([candidate]));
  expect(h.dispatchEphemeral).toHaveBeenCalledTimes(expected);
  expect(h.forbidden).not.toHaveBeenCalled();
});

test.each([
  ['google', raw(), true],
  ['uncorroborated', raw({ name: 'Old Faithful, Yellowstone National Park' }), false],
  ['conflicting park', raw({ name: 'Grand Prismatic Spring, Yosemite National Park' }), false],
  ['open-meteo', raw({ source: 'open-meteo' }), false],
  ['unknown', raw({ source: 'other' }), false],
  ['catalog', raw({ source: 'trailverse-known-place' }), true],
  ['empty', null, false],
])('%s authority survives real broker/provider normalization', async (_label, result, accepted) => {
  const h = harness(jest.fn(async () => result));
  const artifact = await h.run();
  const resolved = artifact.itineraryData.days[0].stops[0];
  expect(hasAuthoritativeCoordinates(resolved)).toBe(accepted);
  expect(resolved.evidenceRef).toBe('ev:prismatic');
  expect(artifact.resolvedCount).toBe(accepted ? 1 : 0);
  expect(artifact.counts).toMatchObject({
    eligibleStops: 1, dispatches: 1, authoritative: accepted ? 1 : 0,
    rejectedByAuthority: result && !accepted ? 1 : 0, noResult: result ? 0 : 1,
  });
  expect(h.events[0].persistedCandidateCount).toBe(0);
  expect(h.forbidden).not.toHaveBeenCalled();
});

test('query and corroboration context come from frozen binding, never model park/name/coordinates', async () => {
  const h = harness();
  const candidate = plan([stop({ name: 'Grand Prismatic Spring — sunrise', parkName: 'Yosemite National Park',
    latitude: 1, longitude: 2, coordinateSource: 'tool' })]);
  const artifact = await h.run(candidate);
  expect(h.dispatchEphemeral.mock.calls[0][0]).toMatchObject({
    requirement: { query: 'Grand Prismatic Spring, Yellowstone National Park' },
    ownership: { attempt: 1, dispatchIndex: 1, candidateFingerprint: fingerprintCandidateStops(candidate) },
  });
  expect(artifact.resolvedCount).toBe(1);
});

test('failure never promotes tool coordinates and emits bounded counts', async () => {
  const h = harness(jest.fn(async () => { throw new Error('PRIVATE QUERY'); }));
  const artifact = await h.run(plan([stop({ latitude: 1, longitude: 2, coordinateSource: 'tool' })]));
  expect(hasAuthoritativeCoordinates(artifact.itineraryData.days[0].stops[0])).toBe(false);
  expect(artifact.counts.providerFailure).toBe(1);
  expect(JSON.stringify(artifact.counts)).not.toMatch(/QUERY|Spring|ev:/);
});

test('stale returned ownership is rejected', async () => {
  const h = harness();
  const resolver = buildProductionGeoCoordinateResolver({ dispatchEphemeral: async (args) => {
    const result = await h.broker.dispatchEphemeral(args);
    return { ...result, ownership: { ...result.ownership, candidateFingerprint: 'stale' } };
  } });
  const artifact = await h.run(plan(), { resolveStopCoordinates: resolver });
  expect(artifact.resolvedCount).toBe(0);
  expect(artifact.entries[0].errorCode).toBe('coordinate_ownership_mismatch');
});

test('candidate mutation during dispatch discards the completed artifact', async () => {
  const candidate = plan();
  const h = harness(jest.fn(async () => {
    candidate.days[0].stops[0].name = 'Changed candidate';
    return raw();
  }));
  const artifact = await h.run(candidate);
  expect(artifact.resolvedCount).toBe(0);
  expect(artifact.candidateFingerprint).not.toBe(fingerprintCandidateStops(candidate));
  expect(hasAuthoritativeCoordinates(candidate.days[0].stops[0])).toBe(false);
});

test('concurrent attempts share fetch but retain ownership; changed retry cannot inherit geography', async () => {
  let finish;
  const h = harness(jest.fn(() => new Promise((resolve) => { finish = resolve; })));
  const a = plan();
  const b = plan([stop({ id: 'retry-stop', name: 'Grand Prismatic Spring — retry' })]);
  const first = h.run(a);
  const second = h.run(b, { attempt: 2, dispatchIndex: 2 });
  await Promise.resolve();
  finish(raw());
  const [one, two] = await Promise.all([first, second]);
  expect(h.geocodePlace).toHaveBeenCalledTimes(1);
  expect(one.candidateFingerprint).not.toBe(two.candidateFingerprint);
  one.itineraryData.days[0].stops[0].latitude = 999;
  expect(two.itineraryData.days[0].stops[0].latitude).toBe(44.525);
  const unbound = await h.run(plan([stop({ name: 'Entirely different place' })]), { attempt: 3 });
  expect(unbound.resolvedCount).toBe(0);
});

test('planner has no coordinate topic; persistent broker cannot dispatch ephemeral-only provider', async () => {
  expect(TOPIC_POLICY).not.toHaveProperty('stop_coordinates');
  const geocodePlace = jest.fn();
  const provider = createGeocodeCoordinateEvidenceProvider({ geocodePlace });
  for (const topic of Object.keys(TOPIC_POLICY)) expect(provider.supports({ topic, query: 'test' })).toBe(false);
  const broker = createEvidenceBroker({
    providers: [provider], acquireLease: jest.fn(), releaseLease: jest.fn(), queryEvidence: async () => [],
  });
  await broker.resolveEvidence({ requestId: 'turn', requirements: [{
    requirementId: 'r', topic: 'stop_coordinates', query: 'test', preferredProviders: ['geocode_coordinate'],
    entity: { entityId: 'nps:park:yell' }, evidenceTypes: ['fact'],
  }] });
  expect(geocodePlace).not.toHaveBeenCalled();
});

test('abort after one accepted stop discards all geography for the attempt', async () => {
  const controller = new AbortController();
  let call = 0;
  const h = harness(jest.fn(async () => {
    if (++call === 2) controller.abort();
    return raw();
  }));
  const candidate = plan([stop(), stop({ id: 's2', order: 2 })]);
  const artifact = await h.run(candidate, { signal: controller.signal });
  expect(artifact.resolvedCount).toBe(0);
  expect(artifact.itineraryData.days[0].stops.every((s) => !hasAuthoritativeCoordinates(s))).toBe(true);
  expect(artifact.counts.cancelled).toBe(2);
});

test('forged binding is rejected before dispatch and does not inflate dispatch telemetry', async () => {
  const h = harness();
  const candidate = plan();
  candidate.days[0].stops[0].evidenceRef = 'not-in-bundle';
  const artifact = await h.run(candidate);
  expect(artifact.counts).toMatchObject({ eligibleStops: 1, dispatches: 0, providerFailure: 1 });
  expect(h.dispatchEphemeral).not.toHaveBeenCalled();
});
