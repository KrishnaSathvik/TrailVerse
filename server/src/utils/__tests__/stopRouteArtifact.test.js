'use strict';

const { createEvidenceBroker } = require('../../services/evidenceBrokerService');
const { createMapsEvidenceProvider } = require('../../services/providers/mapsEvidenceProvider');
const { normalizeItineraryTravelEdges } = require('../travelEdgeValidation');
const { finalizeStructuredItinerary } = require('../finalizeItinerary');
const { enrichItineraryWithRouteEvidence } = require('../routeEvidenceDriveBridge');
const { captureDestinationRouteOwnership, captureDriveIntents, planStopRoutes, routeFingerprint,
  buildProductionStopRouteResolver, resolveStopRouteArtifact, departureBucket } = require('../stopRouteArtifact');
const { entityIdForEvidence } = require('../stableEvidenceEntity');

const bucket = '2026-09-17T12:00:00.000Z';
const evidence = ['a', 'b', 'c'].map((id) => ({ evidenceId: `ev:${id}`, evidenceType: 'fact',
  entityId: 'nps:park:yose', source: { provider: 'nps' },
  claim: { normalizedValue: { name: `Example ${id}`, entityId: `nps:park:yose:place:${id}` } } }));
const bundle = Object.freeze({ evidence: Object.freeze(evidence) });
const beforeBundle = JSON.stringify(bundle);
const stop = (id) => ({ id, name: `Example ${id}`, canonicalPlaceName: `Example ${id}`, evidenceRef: `ev:${id}`,
  parkCode: 'yose', evidenceEntityId: 'nps:park:yose', latitude: 37.7 + (id.charCodeAt(0) - 97) / 100, longitude: -119.6,
  coordinateSource: 'resolved_metadata', duration: 60, drivingTimeFromPreviousMin: null });
const edge = (sourceStopId, targetStopId) => ({ sourceStopId, targetStopId, relationship: 'transfer', modeIntent: 'drive' });
function plan() { return { days: [{ id: 'd1', dayNumber: 1, stops: [stop('a'), stop('b')], travelEdges: [edge('a', 'b')] }] }; }
const raw = { durationSeconds: 2820, distanceMeters: 15000, durationInTrafficSeconds: null };
function harness({ candidate = plan(), transportation = { mode: 'drive' }, getRoute = async () => raw, evidenceBundle = bundle, destinationOwned = {} } = {}) {
  const persistent = jest.fn(() => { throw new Error('coordinate routes must not persist'); });
  const events = [];
  const mapsClient = { getRoute: jest.fn(getRoute) };
  const broker = createEvidenceBroker({ providers: [createMapsEvidenceProvider({ mapsClient })],
    persistCandidate: persistent, queryEvidence: persistent, acquireLease: persistent, releaseLease: persistent,
    recordRefreshEvent: async (event) => events.push(event) });
  const dispatchEphemeral = jest.fn((args) => broker.dispatchEphemeral(args));
  const resolver = buildProductionStopRouteResolver({ dispatchEphemeral });
  const ownership = { requestId: 'turn', attempt: 1, dispatchIndex: 1 };
  const options = { itineraryData: candidate, evidenceBundle, getTransportation: () => transportation,
    destinationOwned, departureTimeBucket: bucket, ownership, resolveStopRoute: resolver };
  return { candidate, transportation, ownership, options, resolver, mapsClient, persistent, events, dispatchEphemeral,
    run: (extra = {}) => resolveStopRouteArtifact({ ...options, ...extra }) };
}
afterEach(() => expect(JSON.stringify(bundle)).toBe(beforeBundle));

test('valid route uses stable endpoint ids, projects minutes only, retains distance privately, and freezes artifact', async () => {
  const h = harness();
  const before = JSON.stringify(h.candidate);
  const result = await h.run();
  expect(h.dispatchEphemeral).toHaveBeenCalledTimes(1);
  const call = h.dispatchEphemeral.mock.calls[0][0];
  expect(call.requirement.routeScope).toMatchObject({ origin: { entityId: entityIdForEvidence(evidence[0]) },
    destination: { entityId: entityIdForEvidence(evidence[1]) }, travelMode: 'driving', departureTimeBucket: bucket });
  expect(result.itineraryData.days[0].stops.map((s) => s.drivingTimeFromPreviousMin)).toEqual([null, 47]);
  expect(result.artifact.entries[0]).toMatchObject({ status: 'verified', distanceMeters: 15000, durationSeconds: 2820 });
  expect(Object.isFrozen(result.artifact.entries[0].binding)).toBe(true);
  expect(JSON.stringify(result.artifact)).not.toMatch(/evidenceId|ev:a|ev:b/);
  expect(JSON.stringify(result.itineraryData)).not.toMatch(/distanceFromPreviousMiles|google_maps|routeFingerprint|departureTimeApplied/);
  expect(JSON.stringify(h.candidate)).toBe(before);
  expect(h.persistent).not.toHaveBeenCalled();
  expect(h.events[0].persistedCandidateCount).toBe(0);
  expect(result.artifact.coverage.status).toBe('fully_checked');
});

test.each([
  ['no edge', (h) => { h.candidate.days[0].travelEdges = []; }, null],
  ['no intent', (h) => { delete h.candidate.days[0].travelEdges[0].modeIntent; }, null],
  ['prohibited', (h) => { h.transportation.drivingPolicy = 'prohibited'; }, 'ineligiblePolicy'],
  ['tripScope alone', (h) => { delete h.transportation.mode; h.options.tripScope = { transportMode: 'drive' }; }, 'ineligiblePolicy'],
  ['unknown source', (h) => { h.candidate.days[0].stops[0].evidenceRef = 'missing'; }, 'ineligibleMissingIdentity'],
  ['unknown target', (h) => { h.candidate.days[0].stops[1].evidenceRef = 'missing'; }, 'ineligibleMissingIdentity'],
  ['missing coordinates', (h) => { h.candidate.days[0].stops[0].latitude = null; }, 'ineligibleMissingCoordinates'],
  ['tool coordinates', (h) => { h.candidate.days[0].stops[1].coordinateSource = 'tool'; }, 'ineligibleMissingCoordinates'],
  ['cross destination', (h) => { h.candidate.days[0].stops[1].parkCode = 'sequ';
  h.candidate.days[0].stops[1].evidenceEntityId = 'nps:park:sequ'; }, 'ineligibleMissingIdentity'],
  ['null destinations', (h) => { h.candidate.days[0].stops.forEach((s) => { delete s.parkCode; }); }, 'ineligibleMissingIdentity'],
  ['non-adjacent', (h) => { h.candidate.days[0].stops.splice(1, 0, stop('c')); }, 'ineligibleProjection'],
  ['ambiguous incoming', (h) => { h.candidate.days[0].stops.unshift(stop('c')); h.candidate.days[0].travelEdges.push(edge('c', 'b')); }, 'ineligibleProjection'],
  ['cross day', (h) => { const target = h.candidate.days[0].stops.pop(); h.candidate.days.push({ id: 'd2', stops: [target] }); }, 'ineligibleProjection'],
])('%s never dispatches', async (_label, modify, reason) => {
  const h = harness(); modify(h);
  const result = await h.run();
  expect(h.dispatchEphemeral).not.toHaveBeenCalled();
  if (reason) expect(result.artifact.counts[reason]).toBeGreaterThan(0);
});

test('authoritative frozen record is required, not an arbitrary evidenceRef or park fallback', async () => {
  const h = harness({ evidenceBundle: { evidence: evidence.map((e) => ({ ...e, source: { provider: 'web_search' } })) } });
  expect((await h.run()).artifact.counts.ineligibleMissingIdentity).toBe(1);
  expect(h.dispatchEphemeral).not.toHaveBeenCalled();
});

test('destination ownership prevents dispatch and survives projection unchanged', async () => {
  const candidate = plan(); candidate.days[0].stops[1].drivingTimeFromPreviousMin = 120;
  const h = harness({ candidate, destinationOwned: captureDestinationRouteOwnership(candidate) });
  const result = await h.run();
  expect(result.artifact.counts.destinationOwned).toBe(1);
  expect(h.dispatchEphemeral).not.toHaveBeenCalled();
  expect(result.itineraryData.days[0].stops[1].drivingTimeFromPreviousMin).toBe(120);
});

test.each([
  ['no_result', async () => null, 'noResult'],
  ['provider_failure', async () => { throw Object.assign(new Error('PRIVATE'), { response: { status: 403 } }); }, 'providerFailure'],
  ['malformed', async () => ({ durationSeconds: null, distanceMeters: 100 }), 'providerFailure'],
])('%s retains intent without minutes', async (_label, getRoute, count) => {
  const h = harness({ getRoute }); const result = await h.run();
  expect(result.artifact.counts[count]).toBe(1);
  expect(result.itineraryData.days[0].stops[1].drivingTimeFromPreviousMin).toBeNull();
  expect(result.itineraryData.days[0].travelEdges[0].modeIntent).toBe('drive');
  expect(JSON.stringify(result.artifact)).not.toContain('PRIVATE');
});

test.each(['policy', 'coordinates', 'edge', 'attempt', 'dispatchIndex', 'requestId', 'candidate', 'identity'])('changed %s discards result', async (change) => {
  let h;
  h = harness({ getRoute: async () => {
    if (change === 'policy') h.transportation.drivingPolicy = 'prohibited';
    if (change === 'coordinates') h.candidate.days[0].stops[1].latitude += 0.01;
    if (change === 'edge') h.candidate.days[0].travelEdges = [];
    if (change === 'attempt') h.ownership.attempt = 2;
    if (change === 'dispatchIndex') h.ownership.dispatchIndex = 2;
    if (change === 'requestId') h.ownership.requestId = 'other';
    if (change === 'candidate') h.candidate.days[0].stops[0].name = 'changed';
    if (change === 'identity') h.candidate.days[0].stops[1].evidenceRef = 'ev:c';
    return raw;
  } });
  const result = await h.run();
  expect(result.artifact.counts.discarded).toBe(1);
  expect(result.itineraryData.days[0].stops[1].drivingTimeFromPreviousMin).toBeNull();
});

test('returned attempt-1 ownership cannot attach on attempt 2', async () => {
  const h = harness(); h.ownership.attempt = 2;
  const result = await h.run({ resolveStopRoute: async (args) => {
    const response = await h.resolver(args); response.result.ownership.attempt = 1; return response;
  } });
  expect(result.artifact.counts.discarded).toBe(1);
});

test('fingerprint includes directional edge, candidate, geography, entity, mode, day and bucket', () => {
  const h = harness();
  const entry = planStopRoutes({ ...h.options, transportation: h.transportation }).entries[0];
  const base = routeFingerprint('candidate', entry.binding);
  for (const patch of [{ sourceStopId: 'c' }, { targetStopId: 'c' }, { sourceEntityId: 'other:a' },
    { targetEntityId: 'other:b' }, { sourceCoordinates: { ...entry.binding.sourceCoordinates, latitude: 38 } },
    { targetCoordinates: { ...entry.binding.targetCoordinates, coordinateSource: 'geocoder' } },
    { modeIntent: 'walk' }, { travelMode: 'walking' }, { departureTimeBucket: '2026-09-18T12:00:00.000Z' },
    { dayId: 'd2' }, { date: '2026-09-18' }, { destinationEntityId: 'nps:park:sequ' }]) {
    expect(routeFingerprint('candidate', { ...entry.binding, ...patch })).not.toBe(base);
  }
  expect(routeFingerprint('other candidate', entry.binding)).not.toBe(base);
  expect(departureBucket('2026-09-17T11:20:00Z')).toBe(bucket);
});

test('coalesced physical fetch preserves independent attempt ownership', async () => {
  let finish; const h = harness({ getRoute: () => new Promise((resolve) => { finish = resolve; }) });
  const one = h.run(); const two = h.run({ ownership: { ...h.ownership, attempt: 2 } });
  await Promise.resolve(); await Promise.resolve(); finish(raw);
  const results = await Promise.all([one, two]);
  expect(h.mapsClient.getRoute).toHaveBeenCalledTimes(1);
  expect(results.map((r) => r.artifact.ownership.attempt)).toEqual([1, 2]);
  expect(results.every((r) => r.artifact.counts.verified === 1)).toBe(true);
  expect(h.events).toHaveLength(1);
});

test('abort reaches Maps and discards all accepted minutes including earlier edges', async () => {
  const candidate = plan(); candidate.days[0].stops.push(stop('c')); candidate.days[0].travelEdges.push(edge('b', 'c'));
  const controller = new AbortController(); let calls = 0;
  const h = harness({ candidate, getRoute: async (_parameters, { signal }) => {
    if (++calls === 2) { controller.abort(); expect(signal.aborted).toBe(true); }
    return raw;
  } });
  const result = await h.run({ signal: controller.signal });
  expect(result.artifact.counts).toMatchObject({ cancelled: 2, verified: 0 });
  expect(result.itineraryData.days[0].stops.every((s) => s.drivingTimeFromPreviousMin === null)).toBe(true);
});

test('coverage includes unavailable coordinates instead of treating them as zero-cost verified driving', async () => {
  const candidate = plan(); candidate.days[0].stops.push(stop('c')); candidate.days[0].travelEdges.push(edge('b', 'c'));
  candidate.days[0].stops[2].coordinateSource = 'tool';
  const result = await harness({ candidate }).run();
  expect(result.artifact.counts).toMatchObject({ applicableEdges: 2, eligibleEdges: 1, verified: 1, ineligibleMissingCoordinates: 1 });
  expect(result.artifact.coverage.status).toBe('partially_checked');
});

test('normalization strips prohibited intent but coverage still records policy rejection', async () => {
  const h = harness({ transportation: { drivingPolicy: 'prohibited' } });
  const proposedDriveIntents = captureDriveIntents(h.candidate);
  normalizeItineraryTravelEdges(h.candidate, { transportation: h.transportation });
  expect((await h.run({ proposedDriveIntents })).artifact.counts.ineligiblePolicy).toBe(1);
});

test('finalizer routes normalized candidate then reruns max-drive and timing checks before freeze', async () => {
  const candidate = plan(); candidate.days[0].stops[0].startTime = '09:00'; candidate.days[0].stops[1].startTime = '10:00';
  candidate.days[0].stops.forEach((s) => { s.note = 'reservation'; });
  const h = harness();
  const result = await finalizeStructuredItinerary({ itineraryData: candidate,
    constraints: { hasConstraints: true, maxDailyDriveMinutes: 30, planningState: { transportation: h.transportation } },
    verifyStopRoutes: (args) => h.run(args) });
  expect(result.itineraryData.days[0].stops[1].drivingTimeFromPreviousMin).toBe(47);
  expect(result.feasibilityIssues.map((i) => i.type)).toEqual(expect.arrayContaining(['max_daily_drive_exceeded', 'time_overlap']));
  expect(Object.isFrozen(result.itineraryData)).toBe(true);
});

test('bridge strips model minutes before route verification and never restores them on failure', async () => {
  const candidate = plan(); candidate.days[0].stops[1].drivingTimeFromPreviousMin = 3;
  const bridged = enrichItineraryWithRouteEvidence({ itineraryData: candidate, evidenceBundle: bundle }).itineraryData;
  const result = await harness({ candidate: bridged, getRoute: async () => null }).run();
  expect(result.itineraryData.days[0].stops[1].drivingTimeFromPreviousMin).toBeNull();
});

test('coverage feeds existing honesty instruction without implying full-trip verification', () => {
  const { drivingVerificationInstruction, drivingCoverageClaimConflict } = require('../drivingVerificationCoverage');
  const { buildConstraintBlock } = require('../constraintEngine');
  const constraints = { hasConstraints: true, drivingFeasibilityRequired: true };
  for (const status of ['none_checked', 'partially_checked', 'fully_checked']) {
    const routeCoverage = { status, verifiedEdges: status === 'none_checked' ? 0 : 1 };
    expect(buildConstraintBlock(constraints, { routeCoverage })).toContain(drivingVerificationInstruction(routeCoverage));
    expect(drivingCoverageClaimConflict('All drive times have been verified.', routeCoverage)).toBe(true);
  }
  expect(drivingCoverageClaimConflict('Exact drive times were not checked.', { verifiedEdges: 1 })).toBe(true);
  expect(drivingCoverageClaimConflict('Only the first stop transfer was checked.', { verifiedEdges: 1 })).toBe(false);
  expect(drivingCoverageClaimConflict('Not all drive times were checked.', { verifiedEdges: 1 })).toBe(false);
});

test('activity-group mutation invalidates an in-flight edge via the canonical edge validator', async () => {
  let h;
  h = harness({ getRoute: async () => {
    h.candidate.days[0].activityGroups = [{ id: 'group', stopIds: ['a', 'b'] }]; return raw;
  } });
  expect((await h.run()).artifact.counts.discarded).toBe(1);
});

test('finalizer removes invalid edges before any route request', async () => {
  const h = harness();
  h.candidate.days[0].stops[1].parkCode = 'sequ';
  h.candidate.days[0].stops[1].evidenceEntityId = 'nps:park:sequ';
  const result = await finalizeStructuredItinerary({ itineraryData: h.candidate,
    constraints: { planningState: { transportation: h.transportation } }, verifyStopRoutes: (args) => h.run(args) });
  expect(result.itineraryData.days[0].travelEdges).toEqual([]);
  expect(h.dispatchEphemeral).not.toHaveBeenCalled();
});

test('route minutes can trigger final active-day feasibility', async () => {
  const candidate = plan(); candidate.days[0].stops.forEach((s) => { s.duration = 410; });
  const h = harness();
  const result = await finalizeStructuredItinerary({ itineraryData: candidate,
    constraints: { planningState: { transportation: h.transportation } }, verifyStopRoutes: (args) => h.run(args) });
  expect(result.feasibilityIssues.some((issue) => issue.basis === 'active_minutes_exceeded')).toBe(true);
});

test('counts reconcile across success, no result, and missing geography', async () => {
  const candidate = plan();
  candidate.days[0].stops.push(stop('c'));
  candidate.days[0].travelEdges.push(edge('b', 'c'));
  const h = harness({ candidate, getRoute: async () => null });
  const { counts } = (await h.run()).artifact;
  expect(counts.applicableEdges).toBe(counts.eligibleEdges + counts.ineligibleMissingIdentity
    + counts.ineligibleMissingCoordinates + counts.ineligiblePolicy + counts.ineligibleProjection + counts.destinationOwned);
  expect(counts.eligibleEdges).toBe(counts.verified + counts.noResult + counts.providerFailure + counts.cancelled + counts.discarded);
});
