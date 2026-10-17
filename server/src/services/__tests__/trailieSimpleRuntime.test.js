'use strict';
jest.mock('openai', () => jest.fn(() => ({ responses: { create: jest.fn(() => { throw new Error('Unexpected OpenAI call in offline runtime test'); }) } })));

const { createSimpleRuntime } = require('../trailieSimpleRuntime');
const { stubMemoryVerifier } = require('../../../tests/helpers/memoryAuthority');
const { createSimpleModel } = require('../trailieSimpleModel');
const { createEvidenceReader: createSimpleTravelTools } = require('../trailieSimpleTools');
const { normalizeEvidenceLocation } = require('../../utils/trailieCanonicalLocation');
const { validateSimpleMutation } = require('../trailieSimpleGuard');
const { createSimpleTripStore } = require('../trailieSimpleStore');
const { hashPayload } = require('../../utils/canonicalResponse');

const NOW = new Date('2026-09-29T12:00:00Z');
const generation = value => ({ completionStatus: 'completed', outputText: '', toolCalls: [],
  provider: 'openai', model: 'gpt-6-sol', costStatus: 'priced', costUsd: 0, ...value });
const call = (name, input, id = 'call-1') => generation({ toolCalls: [{ id, name, input }] });
const proposal = input => call('propose_trip_update', input);
const tools = () => ({ definitions: [], execute: jest.fn(async () => ({ status: 'unsupported', evidence: [] })) });
const source = (overrides = {}) => normalizeEvidenceLocation({ evidenceId: 'place-1', entityId: 'place-1', topic: 'activities',
  claim: { identity: 'place-1', normalizedValue: { name: 'Recorded Overlook', latitude: 40, longitude: -110, exposureLevel: 'low' } },
  source: { provider: 'nps', sourceClass: 'official_owner', url: 'https://www.nps.gov/' },
  observation: { observedAt: NOW.toISOString(), expiresAt: '2026-09-30T12:00:00Z' },
  quality: { authorityClass: 'official_owner', conflictStatus: 'none' }, ...overrides });
const stop = { id: 's1', order: 1, type: 'viewpoint', name: 'Recorded Overlook', note: '', why: '',
  startTime: '', timeWindow: 'Morning', duration: 20, evidenceRef: 'place-1' };
const plan = () => ({ intro: 'A short visit.', days: [{ id: 'd1', dayNumber: 1, label: 'Morning', stops: [{ ...stop }], dayStructure: { type: 'rest', startPeriod: 'morning', endPeriod: 'evening', summary: 'A short visit and downtime.', blocks: [{kind:'outing',periods:['morning'],label:'Views',note:'Enjoy the view.',stopIds:['s1']},{kind:'downtime',periods:['midday','evening'],label:'Relax',note:'Lunch, rest and dinner.',stopIds:[]}] } }] });
function harness(outputs, options = {}) {
  const model = jest.fn();
  for (const output of outputs) model.mockResolvedValueOnce(output);
  const travelTools = tools();
  return { model, travelTools, run: createSimpleRuntime({ model, travelTools, verifyMemory: stubMemoryVerifier(), now: () => NOW, ...options }) };
}

test.each(['Would an early flight work?', 'We only want one hotel change.'])('advice records unchanged saved state without a second model call: %s', async message => {
  const saved = plan();
  const h = harness([generation({ outputText: 'Here is the relevant tradeoff.' })]);
  const result = await h.run({ message, snapshot: { plan: saved } });
  expect(result.response.content).toContain('Your saved itinerary is unchanged.');
  expect(result.response.itineraryData).toBeNull();
  expect(result.telemetry.mutationAccepted).toBe(false);
  expect(h.model).toHaveBeenCalledTimes(1);
  expect(saved).toEqual(plan());
});

test('new guidance rejects an invented resource and accepts a sourced resource', () => {
  const candidate = plan();
  candidate.narrativeSections = [{ placement: 'after_plan', heading: 'Shuttle', markdown: 'Check [the schedule](https://www.nps.gov/schedule.htm).' }];
  const args = { proposal: { response: 'Your trip.', plan: candidate }, message: 'Plan a day', evidence: [source()], now: NOW };
  expect(validateSimpleMutation(args).issues).toContain('guidance_link_unsupported');
  args.evidence[0].source.url = 'https://www.nps.gov/schedule.htm';
  expect(validateSimpleMutation(args).issues).not.toContain('guidance_link_unsupported');
  args.evidence[0].observation.expiresAt = '2025-01-01T00:00:00Z';
  expect(validateSimpleMutation(args).issues).toContain('guidance_link_unsupported');
});

test.each(['success', 'conflict', 'failure'])('completed-action reply is withheld until commit: %s', async outcome => {
  let release, entered;
  const waiting = new Promise(resolve => { release = resolve; });
  const committing = new Promise(resolve => { entered = resolve; });
  const store = { load: async () => ({ plan: null, planningState: null, conversation: [] }),
    commit: jest.fn(async () => { entered(); await waiting;
      if (outcome === 'failure') throw new Error('write failed');
      return outcome === 'success' ? { ok: true, tripId: 'saved' } : { ok: false, status: 409 };
    }) };
  const h = harness([call('read_travel', {}), proposal({ response: 'I created your trip.', plan: plan() })], { store });
  h.travelTools.execute.mockResolvedValue({ status: 'fulfilled', evidence: [source()] });
  let published = false;
  const pending = h.run({ message: 'Create a short trip.' }).then(result => { published = true; return result; });
  await committing;
  expect(published).toBe(false);
  release();
  const result = await pending;
  if (outcome === 'success') {
    expect(result).toMatchObject({ persisted: true, response: { content: 'I created your trip.' } });
  } else {
    expect(result.response).toBeNull();
    expect(result.status).toBe(outcome === 'conflict' ? 'conflict' : 'persistence_failed');
  }
});

test('private diagnosis preserves rejection details without changing model input or accepted plan', async () => {
  const fs = require('fs');
  const path = require('path');
  const { PRIVATE_DIR } = require('../../utils/trailieDiagnosisCapture');
  const responseId = 'runtime-day-type-diagnosis-test';
  const previous = process.env.TRAILIE_DIAGNOSIS_CAPTURE;
  const withoutTimestamp = ({ createdAt, ...response }) => response;
  const run = async enabled => {
    process.env.TRAILIE_DIAGNOSIS_CAPTURE = enabled ? 'true' : 'false';
    const rejected = plan();
    rejected.days[0].dayStructure.type = 'arrival'; // No arrival block.
    const h = harness([call('read_travel', {}), proposal({ response: 'A visit.', plan: rejected }),
      proposal({ response: 'A visit.', plan: plan() })]);
    h.travelTools.execute.mockResolvedValue({ status: 'fulfilled', evidence: [source()] });
    const result = await h.run({ message: 'Plan a short visit.', responseId });
    return { result, modelInputs: h.model.mock.calls.map(([input]) => input) };
  };
  try {
    const off = await run(false);
    const on = await run(true);
    expect(on.result.status).toBe('complete');
    expect(on.result.telemetry.mutationRounds).toEqual([{ issues: ['day_type_inconsistent'] }, { issues: [] }]);
    expect(on.modelInputs).toEqual(off.modelInputs);
    expect(withoutTimestamp(on.result.response)).toEqual(withoutTimestamp(off.result.response));
    expect(on.result.mutation).toEqual(off.result.mutation);
    const captured = JSON.parse(fs.readFileSync(path.join(PRIVATE_DIR, `${responseId}__proposal.json`), 'utf8'));
    expect(captured.proposalRounds).toHaveLength(2);
    expect(captured.proposalRounds[0].dayTypeDiagnosis).toMatchObject({ source: 'guard_candidate', days: [{
      dayNumber: 1, conflicts: [{ rule: 'missing_matching_block', expected: { requiredBlockKind: 'arrival' } }],
    }] });
    expect(captured.proposalRounds[1].dayTypeDiagnosis.days[0].conflicts).toEqual([]);
    const write = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('disk unavailable'); });
    let failedCapture;
    try { failedCapture = await run(true); } finally { write.mockRestore(); }
    expect(failedCapture.modelInputs).toEqual(off.modelInputs);
    expect(withoutTimestamp(failedCapture.result.response)).toEqual(withoutTimestamp(off.result.response));
    expect(failedCapture.result.mutation).toEqual(off.result.mutation);
  } finally {
    if (previous == null) delete process.env.TRAILIE_DIAGNOSIS_CAPTURE;
    else process.env.TRAILIE_DIAGNOSIS_CAPTURE = previous;
    for (const kind of ['research', 'proposal', 'terminal']) {
      try { fs.unlinkSync(path.join(PRIVATE_DIR, `${responseId}__${kind}.json`)); } catch { /* absent */ }
    }
  }
});

test('ordinary conversation reaches the model unchanged without preparation or state writes', async () => {
  const snapshot = { planningState: { dates: { startDate: '2026-09-01' } } };
  const before = structuredClone(snapshot);
  const h = harness([generation({ outputText: 'Here is the comparison.' })]);
  const result = await h.run({ message: 'Which would suit us?', snapshot });
  expect(result.status).toBe('complete');
  expect(result.response.content).toBe('Here is the comparison.');
  expect(h.model.mock.calls[0][0].input.at(-1).content).toBe('Which would suit us?');
  expect(snapshot).toEqual(before);
  expect(h.travelTools.execute).not.toHaveBeenCalled();
  expect(result.mutation).toBeNull();
});

test('tool result returns to the model with its call id and source provenance', async () => {
  const h = harness([call('read_travel', { topic: 'alerts' }), generation({ outputText: 'The source reports a closure.' })]);
  h.travelTools.execute.mockResolvedValue({ status: 'fulfilled', evidence: [source()], providerAttemptCount: 1 });
  const result = await h.run({ message: 'What is happening right now?' });
  expect(result.telemetry).toMatchObject({ modelCalls: 2, toolCalls: 1, providerAttempts: 1 });
  const item = h.model.mock.calls[1][0].input.at(-1);
  expect(item).toMatchObject({ type: 'function_call_output', call_id: 'call-1' });
  expect(JSON.parse(item.output).evidence[0]).toEqual(source());
});

test('native Responses adapter retains reasoning and function output items', async () => {
  const client = { responses: { create: jest.fn(async () => ({ status: 'completed', output_text: 'Done', output: [] })) } };
  const model = createSimpleModel({ client });
  const input = [{ role: 'user', content: 'Go' }, { type: 'function_call', name: 'read_travel', call_id: 'c', arguments: '{}' },
    { type: 'function_call_output', call_id: 'c', output: '{"status":"unknown"}' }];
  await model({ input, instructions: 'Help', tools: [] });
  expect(client.responses.create.mock.calls[0][0].input).toEqual(input);
  expect(client.responses.create.mock.calls[0][0].store).toBe(false);
  expect(client.responses.create.mock.calls[0][1].maxRetries).toBe(0);
});

test('memory is updated only after model understanding, and relocation clears old identity', async () => {
  const snapshot = { planningState: { lodging: { booked: true, baseTown: 'Springdale', lat: 37, lon: -113,
    stateOrRegion: 'UT', country: 'US', resolutionSource: 'google', resolutionStatus: 'resolved' } } };
  const h = harness([proposal({ response: 'I updated the lodging base.', memory_updates: [
    { field: 'lodging', value: { baseTown: 'Another town' }, sourceQuote: 'moved to Another town' },
  ] })]);
  const result = await h.run({ message: 'We moved to Another town', snapshot });
  expect(result.mutation.planningState.lodging).toMatchObject({ baseTown: 'Another town', lat: null, lon: null,
    stateOrRegion: null, country: null, resolutionSource: null, resolutionStatus: 'unresolved' });
  expect(snapshot.planningState.lodging.baseTown).toBe('Springdale');
});

test.each([
  { field: 'dates', value: { startDate: '2026-02-30' }, sourceQuote: 'Tomorrow' },
  { field: 'lodging', value: { baseTown: 'Town', lat: 20 }, sourceQuote: 'Tomorrow' },
  { field: 'preferences', value: { avoidExposure: true }, sourceQuote: 'not in message' },
])('invalid or unquoted memory gets at most one correction', async update => {
  const output = proposal({ response: 'Saved', memory_updates: [update] });
  const h = harness([output, output, output]);
  const result = await h.run({ message: 'Tomorrow' });
  expect(result).toMatchObject({ status: 'mutation_rejected', response: null, persisted: false });
  expect(h.model).toHaveBeenCalledTimes(2);
});

test('a concrete correction can succeed without escalation', async () => {
  const h = harness([proposal({ response: 'Done', memory_updates: [{ field: 'dates', value: { startDate: 'bad' }, sourceQuote: 'October 1, 2026' }] }),
    proposal({ response: 'Noted.', memory_updates: [{ field: 'dates', value: { startDate: '2026-10-01' }, sourceQuote: 'October 1, 2026' }] })]);
  expect((await h.run({ message: 'October 1, 2026' })).mutation.planningState.dates.startDate).toBe('2026-10-01');
});

test('plan creation requires grounded identity; forged coordinates cannot survive', () => {
  const p = plan(); p.days[0].stops[0].latitude = 1;
  const args = { proposal: { response: 'Ready', plan: p }, message: 'Plan a day', now: NOW };
  expect(validateSimpleMutation({ ...args, evidence: [] }).ok).toBe(false);
  expect(validateSimpleMutation({ ...args, evidence: [source()] }).ok).toBe(false);
  delete p.days[0].stops[0].latitude;
  const checked = validateSimpleMutation({ ...args, evidence: [source()] });
  expect(checked).toMatchObject({ ok: true });
  expect(checked.plan.days[0].stops[0].location).toMatchObject({lat: 40, lon: -110, status: 'resolved'});
});

test.each(['closed', 'mobility', 'stale', 'duration'])('plan truth guard rejects %s evidence/constraint conflict', kind => {
  const row = source(); const snapshot = { planningState: {} }; const p = plan();
  if (kind === 'closed') row.claim.normalizedValue.closureStatus = 'closed';
  if (kind === 'mobility') { row.claim.normalizedValue.name = 'Recorded Trail'; p.days[0].stops[0].name = 'Recorded Trail';
    row.claim.normalizedValue.walkingDistanceMiles = 3; snapshot.planningState.mobility = { maxWalkMilesPerSegment: 1 }; }
  if (kind === 'stale') row.observation.expiresAt = '2020-01-01';
  if (kind === 'duration') row.claim.normalizedValue.maxVisitDurationMinutes = 10;
  expect(validateSimpleMutation({ proposal: { response: 'Ready', plan: p }, message: 'Plan', evidence: [row], snapshot, now: NOW }).ok).toBe(false);
});

test('patch preserves untouched days byte for byte and honors an explicit scope', () => {
  const prior = plan(); prior.days.push({ ...structuredClone(prior.days[0]), id: 'd2', dayNumber: 2 });
  const input = { response: 'Changed day 2', plan_patch: { response: 'Changed day 2',
    operations: [{ op: 'update_stop', dayNumber: 2, stopId: 's1', stop: { duration: 10 } }] } };
  const args = { proposal: input, message: 'Shorten day 2', snapshot: { plan: prior }, evidence: [source()], now: NOW };
  const checked = validateSimpleMutation({ ...args, scope: { dayNumbers: [2] } });
  expect(checked.ok).toBe(true);
  expect(hashPayload(checked.plan.days[0])).toBe(hashPayload(prior.days[0]));
  expect(validateSimpleMutation({ ...args, scope: { dayNumbers: [1] } }).issues).toContain('patch_outside_authorized_scope');
});

test('unverified inter-stop route explicitly carries unknown duration', () => {
  const p = plan(); p.days[0].stops.push({ ...stop, id: 's2', name: 'Second Overlook', evidenceRef: 'place-2' });
  p.days[0].dayStructure.blocks[0].stopIds = p.days[0].stops.map(s => s.id);
  const second = source({ evidenceId: 'place-2', entityId: 'place-2', claim: { normalizedValue: { name: 'Second Overlook' } } });
  const result = validateSimpleMutation({ proposal: { response: 'Ready', plan: p }, message: 'Plan', evidence: [source(), second], now: NOW });
  expect(result.ok).toBe(true);
  expect(result.plan.days[0].travelEdges[0]).toMatchObject({status: 'unverified', durationSeconds: null});
});

test('cancellation after provider completion never commits', async () => {
  const abort = new AbortController(); const store = { load: async () => ({}), commit: jest.fn() };
  const run = createSimpleRuntime({ model: async () => { abort.abort(); return generation({ outputText: 'Done' }); }, travelTools: tools(), store });
  expect((await run({ message: 'Go', signal: abort.signal })).status).toBe('cancelled');
  expect(store.commit).not.toHaveBeenCalled();
});

test('provider failure does not retry or persist', async () => {
  const model = jest.fn(async () => { throw new Error('secret provider failure'); });
  const run = createSimpleRuntime({ model, travelTools: tools() });
  const result = await run({ message: 'Go' });
  expect(result.status).toBe('model_failed'); expect(model).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(result)).not.toContain('secret');
});

test('two model turns from version N: one accepted, one 409, one notification', async () => {
  let document = { _id: 'trip', userId: 'owner', __v: 3, updatedAt: '2026-09-29T00:00:00Z', conversation: [], plan: null };
  const notify = jest.fn();
  const TripPlan = { findOne: jest.fn(() => ({ lean: async () => structuredClone(document) })),
    findOneAndUpdate: jest.fn(async (query, update) => {
      if (query.__v !== document.__v) return null;
      document = { ...document, ...update.$set, __v: document.__v + 1 }; return structuredClone(document);
    }) };
  const store = createSimpleTripStore({ TripPlan, notify });
  let arrivals = 0; let release; const barrier = new Promise(resolve => { release = resolve; });
  const model = async () => { if (++arrivals === 2) release(); await barrier; return generation({ outputText: 'Answer' }); };
  const run = createSimpleRuntime({ model, travelTools: tools(), store });
  const results = await Promise.all([run({ message: 'One', userId: 'owner', tripId: 'trip' }), run({ message: 'Two', userId: 'owner', tripId: 'trip' })]);
  expect(results.map(r => r.status).sort()).toEqual(['complete', 'conflict']);
  expect(results.find(r => r.status === 'conflict')).toMatchObject({ response: null, httpStatus: 409, persisted: false });
  expect(notify).toHaveBeenCalledTimes(1);
  expect(document.conversation).toHaveLength(2);
});

test('travel provider adapter preserves provenance and refuses undated facts', async () => {
  const broker = { dispatchEphemeral: jest.fn(async () => ({ status: 'fulfilled', normalizedCandidates: [
    { ...source(), observedAt: NOW.toISOString() }, { ...source({ evidenceId: 'undated', observation: undefined }) },
  ] })) };
  const adapter = createSimpleTravelTools({ broker, now: () => NOW });
  const result = await adapter.execute('read_travel', { provider: 'nps', topic: 'activities', entity: { entityId: 'place-1' } },
    { requestId: 'r', userMessage: 'Go' });
  expect(result.evidence).toHaveLength(1); expect(result.evidence[0].source.provider).toBe('nps');
});

test('live evidence observed during a fetch survives freshness validation', async () => {
  let clock = NOW;
  const broker = { dispatchEphemeral: jest.fn(async () => {
    clock = new Date(+NOW + 1500);
    return { status: 'fulfilled', normalizedCandidates: [
      { ...source(), observedAt: clock.toISOString() },
      { ...source(), observedAt: new Date(+clock + 60000).toISOString() },
    ] };
  }) };
  const adapter = createSimpleTravelTools({ broker, now: () => clock });
  const result = await adapter.execute('read_travel', { provider: 'nps', topic: 'activities', entity: { entityId: 'place-1' } },
    { requestId: 'r', userMessage: 'Go' });
  expect(result.evidence).toHaveLength(1);
  expect(+result.evidence[0].observation.observedAt).toBe(+clock);
});

test('model request hides provider choreography and coordinate input', () => {
  const { READ_TOOL } = require('../trailieTravelData');
  expect(Object.keys(READ_TOOL.input_schema.properties)).toEqual(['destination', 'question', 'topics', 'dates', 'constraints', 'context', 'places', 'resources', 'travelMode']);
  expect(JSON.stringify(READ_TOOL.input_schema)).not.toMatch(/latitude|longitude|provider|routeScope/);
});

test('park identity reads omit unrelated profile topics and large reads report truncation', async () => {
  const identity = { ...source(), topic: 'destination_identity', observedAt: NOW.toISOString() };
  const activities = Array.from({ length: 45 }, (_, i) => ({ ...source(), observedAt: NOW.toISOString(),
    claim: { identity: `activity-${i}`, text: 'A'.repeat(2000) } }));
  const broker = { dispatchEphemeral: async () => ({ status: 'fulfilled',
    normalizedCandidates: [identity, ...activities], completeness: { isComplete: true } }) };
  const adapter = createSimpleTravelTools({ broker, now: () => NOW });
  const read = topic => adapter.execute('read_travel', { provider: 'nps', topic, entity: {} }, { requestId: 'r', userMessage: 'Glacier' });
  const result = await read('destination_identity');
  expect(result.evidence).toHaveLength(1);
  expect(result.evidence[0].topic).toBe('destination_identity');
  const large = await read('activities');
  expect(large.evidence.length).toBeGreaterThan(0);
  expect(large.evidence.length).toBeLessThanOrEqual(8);
  expect(Buffer.byteLength(JSON.stringify(large.evidence))).toBeLessThanOrEqual(12000);
  expect(large.omittedEvidenceCount).toBe(45 - large.evidence.length);
  expect(large.completeness.isComplete).toBe(false);
});

test('unavailable research still receives final synthesis', async () => {
  const h = harness([call('read_travel', {}), generation({outputText: 'That detail is unconfirmed; use the available alternative.'})]);
  h.travelTools.execute.mockResolvedValue({status: 'unsupported', evidence: []});
  const result = await h.run({message: 'Research the trip'});
  expect(result.status).toBe('complete');
  expect(h.model).toHaveBeenCalledTimes(2);
  expect(result.response.content).not.toContain('unsupported');
});

test('route provider receives source-owned coordinates, never model-authored ones', async () => {
  const broker = { dispatchEphemeral: jest.fn(async () => ({ status: 'fulfilled', normalizedCandidates: [] })) };
  const adapter = createSimpleTravelTools({ broker, now: () => NOW });
  const args = { provider: 'google_maps', topic: 'driving_time', entity: {}, routeScope: {
    origin: { entityId: 'place-1', latitude: 0, longitude: 0 }, destination: { entityId: 'place-2', latitude: 1, longitude: 1 },
    travelMode: 'driving', departureTimeBucket: NOW.toISOString() } };
  const context = { requestId: 'r', userMessage: 'Go', evidence: [source(), source({ evidenceId: 'place-2',
    claim: { normalizedValue: { latitude: 41, longitude: -111 } } })] };
  context.evidence = context.evidence.map(normalizeEvidenceLocation);
  await adapter.execute('read_travel', args, context);
  expect(broker.dispatchEphemeral.mock.calls[0][0].requirement.routeScope.origin).toMatchObject({ latitude: 40, longitude: -110 });
  expect(broker.dispatchEphemeral.mock.calls[0][0].requirement.routeScope.destination).toMatchObject({ latitude: 41, longitude: -111 });
  broker.dispatchEphemeral.mockClear();
  expect((await adapter.execute('read_travel', args, { ...context, evidence: [] })).status).toBe('route_endpoints_not_grounded');
  expect(broker.dispatchEphemeral).not.toHaveBeenCalled();
});

test('machine-added geocoding context never acquires explicit traveler authority', async () => {
  const broker = { dispatchEphemeral: jest.fn(async () => ({ status: 'fulfilled', normalizedCandidates: [] })) };
  const adapter = createSimpleTravelTools({ broker, now: () => NOW });
  await adapter.execute('read_travel', { provider: 'geocode_coordinate', topic: 'stop_coordinates', entity: {},
    query: 'Recorded place, Context region', queryProvenance: { rawTravelerPlaceText: 'Recorded place',
      explicitTravelerRegion: { name: 'Context region' }, contextualRegions: [{ name: 'Context region' }] } },
  { requestId: 'r', userMessage: 'Find Recorded place' });
  expect(broker.dispatchEphemeral.mock.calls[0][0].requirement.queryProvenance).toMatchObject({
    rawTravelerPlaceText: 'Recorded place', explicitTravelerRegion: null, contextualRegions: [{ name: 'Context region' }],
  });
});

test('a real NPS provider normalizes a model-selected request through the existing broker', async () => {
  const { createEvidenceBroker } = require('../evidenceBrokerService');
  const { createNpsEvidenceProvider } = require('../providers/npsEvidenceProvider');
  const getParkAlertsEvidence = jest.fn(async () => ({ observedAt: NOW.toISOString(), isComplete: true,
    data: [{ id: 'closure', title: 'Recorded closure', description: 'Access remains closed.', category: 'Park Closure', url: 'https://www.nps.gov/alerts' }] }));
  const broker = createEvidenceBroker({ providers: [createNpsEvidenceProvider({ npsClient: { getParkAlertsEvidence }, now: () => NOW })],
    now: () => NOW, refreshHashSecret: 'offline-fixture-secret', recordRefreshEvent: async () => {},
    acquireLease: async () => { throw new Error('Ephemeral reads do not acquire a persistent lease'); },
    releaseLease: async () => { throw new Error('Ephemeral reads do not release a persistent lease'); } });
  const adapter = createSimpleTravelTools({ broker, now: () => NOW });
  const result = await adapter.execute('read_travel', { provider: 'nps', topic: 'alerts_closures', entity: { entityId: 'nps:park:yose' } },
    { requestId: 'r', userMessage: 'Check alerts' });
  expect(getParkAlertsEvidence).toHaveBeenCalledTimes(1);
  expect(result.status).toBe('fulfilled');
  expect(result.evidence.length).toBeGreaterThan(0);
  expect(result.evidence[0].source.sourceClass).toBe('official_owner');
});

test('a grounded route still cannot authorize driving against durable no-car policy', () => {
  const p = plan(); p.days[0].stops.push({ ...stop, id: 's2', order: 2, name: 'Second Overlook', evidenceRef: 'place-2' });
  p.days[0].dayStructure.blocks[0].stopIds = p.days[0].stops.map(s => s.id);
  const second = source({ evidenceId: 'place-2', entityId: 'place-2', claim: { normalizedValue: { name: 'Second Overlook' } } });
  const route = source({ evidenceId: 'route', topic: 'driving_time',
    claim: { normalizedValue: { durationSeconds: 600 } }, scope: { route: { originEntityId: 'place-1', destinationEntityId: 'place-2', travelMode: 'driving' } } });
  p.days[0].travelEdges = [{sourceStopId: 's1', targetStopId: 's2', relationship: 'transfer', modeIntent: 'drive'}];
  const args = { proposal: { response: 'Ready', plan: p }, message: 'Plan', evidence: [source(), second, route], now: NOW };
  expect(validateSimpleMutation({ ...args, snapshot: { planningState: { transportation: { rentalCar: false } } } }).plan.days[0].travelEdges[0]).toMatchObject({ status: 'unverified', durationSeconds: null });
  const checked = validateSimpleMutation({ ...args, snapshot: { planningState: { transportation: { rentalCar: true } } } });
  expect(checked.ok).toBe(true);
  expect(checked.plan.days[0].stops[1].drivingTimeFromPreviousMin).toBe(10);
});

test('research budget reserves synthesis with mutation capability', async () => {
  const h = harness([call('read_travel', {}), generation({ outputText: 'Here is what I can recommend.' })], { maxToolCalls: 1 });
  expect((await h.run({ message: 'Research this' })).status).toBe('complete');
  expect(h.model.mock.calls[1][0]).toMatchObject({ tools: [expect.objectContaining({name: 'propose_trip_update'})], toolChoice: 'auto' });
  expect(h.travelTools.execute).toHaveBeenCalledTimes(1);
});

test('rejected mutation leaves the entire durable trip untouched', async () => {
  const store = { load: async () => ({ plan: plan(), planningState: { preferences: { avoidExposure: true } } }), commit: jest.fn() };
  const invalid = proposal({ response: 'Replaced', plan: plan() });
  const h = harness([invalid, invalid], { store });
  expect((await h.run({ message: 'Edit day 1' })).status).toBe('mutation_rejected');
  expect(store.commit).not.toHaveBeenCalled();
});

test('typed dates must describe a real, internally consistent window', async () => {
  const message = 'September 30 through October 1, 2026, two days';
  const check = async dates => {
    const update = { field: 'dates', value: dates, sourceQuote: message };
    // Synthetic approval isolates deterministic calendar validation here.
    const { receipt } = await stubMemoryVerifier()({ message, updates: [update] });
    return validateSimpleMutation({ message, memoryAuthority: receipt,
      proposal: { response: 'Noted', memory_updates: [update] } });
  };
  expect((await check({ startDate: '2026-09-30', endDate: '2026-10-01', durationDays: 2 })).ok).toBe(true);
  expect((await check({ startDate: '2026-09-01', endDate: '2026-09-30', durationDays: 2 })).issues).toContain('date_duration_mismatch');
  expect((await check({ durationDays: 2.5 })).issues).toContain('duration_days_invalid');
});

test('an empty day skeleton cannot be published as an accepted plan', () => {
  expect(validateSimpleMutation({ message: 'Plan a day', proposal: { response: 'Ready',
    plan: { intro: 'A day', days: [{ id: 'd1', dayNumber: 1, label: 'Day', stops: [] }] },
  } }).issues).toContain('mutation_schema_invalid');
});

test('correction prose is surfaced without saving or another grounding pass',async()=>{
 const h=harness([proposal({response:'Ready',plan:plan()}),generation({outputText:'I could not verify the trail identity, so I have not saved this itinerary.'})]);
 h.travelTools.finalizeProposal=jest.fn(async()=>({evidence:[],unresolved:[{place:'Trail',reason:'unknown identity'}],namedPlaceDiagnostics:[{inputName:'Trail',rejectionReason:'name_mismatch'}]}));
 const r=await h.run({message:'Create a trip'});
 expect(r.status).toBe('complete');expect(r.persisted).toBe(false);
 expect(r.response.artifactStatus).toMatchObject({ status: 'save_failed', code: 'mutation_rejected', phase: 'trip_save' });
 expect(r.telemetry.mutationAccepted).toBe(false);
 expect(r.response.content).toBe('I could not verify the trail identity, so I have not saved this itinerary.');
 expect(h.travelTools.finalizeProposal).toHaveBeenCalledTimes(1);
 const feedback=JSON.parse(h.model.mock.calls[1][0].input.at(-1).output);
 expect(feedback).toMatchObject({existingCanonicalPlan:null,unresolvedPlaces:[{place:'Trail',reason:'unknown identity'}]});
 expect(feedback).not.toHaveProperty('originalProposal');
 expect(feedback.placeRecovery).not.toHaveProperty('groundedPlaces');
 // The proposal remains available exactly once in the prior model function call.
 const priorProposals=h.model.mock.calls[1][0].input.filter(row=>row.type==='function_call' && row.name==='propose_trip_update')
   .map(row=>JSON.parse(row.arguments));
 expect(priorProposals).toHaveLength(1);
 expect(priorProposals).toContainEqual(expect.objectContaining({plan:plan()}));
 expect(r.telemetry.finalization.namedPlaceDiagnostics).toHaveLength(1);
});
test('corrected artifact reuses evidence; correction grounding is narrow (no research)',async()=>{
 const broken=plan();broken.days[0].stops[0].duration=0;
 const h=harness([proposal({response:'Ready',plan:broken}),proposal({response:'Ready',plan:plan()})]);
 h.travelTools.finalizeProposal=jest.fn(async()=>({evidence:[source()]}));
 const r=await h.run({message:'Create a trip'});
 expect(r.status).toBe('complete');expect(r.telemetry.mutationAccepted).toBe(true);
 // Correction may repair only new/changed identities; the session cache keeps
 // already-grounded places from being fetched again.
 expect(h.travelTools.finalizeProposal.mock.calls.map(c=>c[1].narrow)).toEqual([false,true]);
});
test.each([null,{...plan(),itineraryHash:'existing'}])('mutation failure copy distinguishes existing trip: %p',async prior=>{
 const bad=proposal({response:'Ready',plan:plan()});const h=harness([bad,bad]);
 const r=await h.run({message:'Build a trip',snapshot:{plan:prior}});
 expect(r.status).toBe('mutation_rejected');
 if(prior)expect(r.failureContent).toContain('saved trip is unchanged');
 else {expect(r.failureContent).not.toContain('saved trip');expect(r.failureContent).toContain('incomplete itinerary');}
});

test.each([false,true])('reloaded server history reaches model with canonical state present=%s',async(hasPlan)=>{
 const conversation=[{role:'user',content:'Compare Zion and Bryce for beginners'},
 {role:'assistant',content:'Allow five days from Las Vegas.'}];
 const snapshot={conversation,plan:hasPlan?plan():null,planningState:hasPlan?{pace:'relaxed'}:null};
 const store={load:jest.fn(async()=>structuredClone(snapshot)),commit:jest.fn(async()=>({ok:true}))};
 const h=harness([generation({outputText:'Here is the five-day outline.'})],{store});
 await h.run({message:'okay then make it 5 days'});
 const input=h.model.mock.calls[0][0].input;
 for(const m of conversation)expect(input.filter(row=>row.role===m.role && row.content===m.content)).toHaveLength(1);
 expect(input.at(-1).content).toBe('okay then make it 5 days');
 expect(store.load).toHaveBeenCalledTimes(1);
});

test('usable correction prose commits conversation only, preserving the prior canonical trip and memory', async () => {
  const snapshot = { plan: { ...plan(), itineraryHash: 'yellowstone-original' }, planningState: { dates: { durationDays: 3 } } };
  const store = { load: async () => snapshot, commit: jest.fn(async () => ({ ok: true })) };
  const h = harness([proposal({ response: 'Replacement', plan: plan() }), generation({ outputText: 'Here is a five-day alternative. I have not saved the change.' })], { store });
  const result = await h.run({ message: 'make it 5 days' });
  expect(result.status).toBe('complete');
  expect(result.response.artifactStatus.status).toBe('save_failed');
  expect(result.telemetry).toMatchObject({ canonicalBefore: 'yellowstone-original', canonicalAfter: 'yellowstone-original', mutationAccepted: false });
  expect(store.commit).toHaveBeenCalledTimes(1);
  expect(store.commit.mock.calls[0][0]).toMatchObject({ mutation: null, snapshot });
  expect(snapshot.planningState.dates.durationDays).toBe(3);
});

// Recovery provenance is turn-local; assistant recommendations are not requirements.
describe('grounding correction recovery', () => {
  const failed = () => { const p = plan(); p.days[0].stops[0].name = 'Unrecorded Creek'; return p; };
  function recovery(outputs, rows = [source()]) {
    const travelTools = tools();
    travelTools.finalizeProposal = jest.fn(async () => ({ evidence: rows,
      unresolved: [{ place: 'Unrecorded Creek', reason: 'identity_not_found' }] }));
    return harness(outputs, { travelTools });
  }
  const feedback = h => { const value=JSON.parse(h.model.mock.calls[1][0].input.at(-1).output);
    return {...value.placeRecovery,groundedPlaces:value.groundedPlaces}; };
  test('optional planner selection can be replaced by a model-chosen grounded outing', async () => {
    const h = recovery([proposal({response:'Trip',plan:failed()}),proposal({response:'Enjoy the overlook.',plan:plan()})]);
    const r = await h.run({message:'Plan an easy day',history:[{role:'assistant',content:'Try Unrecorded Creek.'}]});
    expect(r.telemetry.mutationAccepted).toBe(true);
    expect(feedback(h).failedPlaces).toContainEqual(expect.objectContaining({name:'Unrecorded Creek',provenance:'planner_selected_place',replacementAllowed:true}));
    expect(feedback(h).groundedPlaces).toContainEqual(expect.objectContaining({name:'Recorded Overlook',evidenceRef:'place-1'}));
  });
  test('repeating the unresolved identity still rejects the correction', async () => {
    const h = recovery([proposal({response:'Trip',plan:failed()}),proposal({response:'Trip',plan:failed()})]);
    const r = await h.run({message:'Plan an easy day'});
    expect(r.status).toBe('mutation_rejected');
    expect(feedback(h).instructions).toMatch(/Do not repeat/);
  });
  test('traveler-required unresolved outing cannot be silently replaced', async () => {
    const h = recovery([proposal({response:'Trip',plan:failed()}),proposal({response:'Done',plan:plan()})]);
    const r = await h.run({message:'Plan the day',history:[{role:'user',content:'I really want to visit Unrecorded Creek.'}]});
    expect(feedback(h).failedPlaces).toContainEqual(expect.objectContaining({provenance:'traveler_required_place',replacementAllowed:false}));
    expect(r.status).toBe('mutation_rejected');
    expect(r.telemetry.mutationIssues).toContain('traveler_required_place_unresolved');
  });
  test('a newly supported experience with a distinct map anchor remains acceptable', async () => {
    const row=source();Object.assign(row.claim.normalizedValue,{name:'Unrecorded Creek',canonicalPlaceName:'Creek Access',experience:{id:'experience:creek',name:'Unrecorded Creek'},mapAnchor:{canonicalPlaceId:'place-1',name:'Creek Access',relationship:'access_point_for'}});
    const travelTools=tools();travelTools.finalizeProposal=jest.fn().mockResolvedValueOnce({evidence:[source()],unresolved:[{place:'Unrecorded Creek',reason:'identity_not_found'}]}).mockResolvedValueOnce({evidence:[row],unresolved:[]});
    const h=harness([proposal({response:'Trip',plan:failed()}),proposal({response:'Creek walk',plan:failed()})],{travelTools});
    const r=await h.run({message:'I want Unrecorded Creek'});
    expect(r.telemetry.mutationAccepted).toBe(true);
    expect(r.mutation.plan.days[0].stops[0].mapAnchor.name).toBe('Creek Access');
  });
  test('a similar-name alternative cannot impersonate the failed experience', async () => {
    const row=source();row.claim.normalizedValue.name='Unrecorded Creek Trailhead';row.claim.normalizedValue.alternativeFor='Unrecorded Creek';
    const h=recovery([proposal({response:'Trip',plan:failed()}),proposal({response:'Trip',plan:failed()})],[row]);
    const r=await h.run({message:'Plan a day'});
    expect(r.status).toBe('mutation_rejected');
    expect(r.telemetry.mutationIssues).toContain('stop_name_identity_mismatch');
  });
});

test('recovery may retain a traveler-requested outing as an explicitly non-spatial experience', async () => {
 const original=plan();original.days[0].stops[0].name='Unrecorded Creek';
 const flexible=plan();flexible.days[0].stops=[];flexible.days[0].dayStructure.blocks[0]={kind:'experience',periods:['morning'],label:'Unrecorded Creek area',note:'Consider an easy nature outing; the specific route and access are unconfirmed.',stopIds:[]};
 const travelTools=tools();
 const usDestination = normalizeEvidenceLocation({
   evidenceId: 'dest-us', entityId: 'nps:park:test', topic: 'destination_identity',
   claim: { identity: 'nps:park:test', normalizedValue: { name: 'Test National Park', countryCode: 'US', latitude: 40, longitude: -110 } },
   source: { provider: 'nps', sourceClass: 'official_owner', url: 'https://www.nps.gov/' },
   observation: { observedAt: NOW.toISOString(), expiresAt: '2026-09-30T12:00:00Z' },
   quality: { authorityClass: 'official_owner', conflictStatus: 'none' },
 });
 travelTools.finalizeProposal=async()=>({evidence:[source(), usDestination],unresolved:[{place:'Unrecorded Creek',reason:'identity_not_found'}]});
 const h=harness([proposal({response:'Trip',plan:original}),proposal({response:'A flexible outing, not a verified mapped trail.',plan:flexible})],{travelTools});
 const r=await h.run({message:'I want to visit Unrecorded Creek'});
 expect(r.telemetry.mutationAccepted).toBe(true);expect(r.mutation.plan.days[0].stops).toEqual([]);expect(r.mutation.plan.days[0].travelEdges).toEqual([]);
});

test('a chat answer never labels a park homepage as its alerts page', async () => {
  const h = harness([generation({ outputText: 'Check the [official Zion alerts](https://www.nps.gov/zion/index.htm) before you go.' })]);
  const result = await h.run({ message: 'Any closures at Zion?', snapshot: {} });
  expect(result.response.content).toContain('[the official NPS park page](https://www.nps.gov/zion/index.htm)');
  expect(result.response.content).not.toContain('official Zion alerts');
  expect(h.model).toHaveBeenCalledTimes(1);
});

describe('two-base duration repair preserves the trip', () => {
  test.each([
    ['Zion', 'Bryce Canyon', 'Springdale', 'Bryce Canyon City'],
    ['Boston', 'Portland', 'Boston Hotel', 'Portland Hotel'],
    ['Olympic', 'Mount Rainier', 'Port Angeles', 'Ashford'],
  ])('%s to %s repairs only the unsupported stop duration', async (first, second, base1, base2) => {
    const evidence = [first, second].map((name, i) => source({ evidenceId: `place-${i + 1}`,
      entityId: `place-${i + 1}`, claim: { identity: `place-${i + 1}`, normalizedValue: {
        name, latitude: 40 + i, longitude: -110, duration: '1-2 Hours',
      } } }));
    const candidate = plan();
    candidate.days = [first, first, second, second].map((name, i) => {
      const day = structuredClone(plan().days[0]);
      Object.assign(day, { id: `d${i + 1}`, dayNumber: i + 1, overnightLocation: i < 2 ? base1 : base2 });
      Object.assign(day.stops[0], { name, evidenceRef: i < 2 ? 'place-1' : 'place-2', duration: i === 2 ? 150 : 60, revisitReason: 'Continue exploring this destination from the same overnight base.' });
      if (i === 2) day.dayStructure.blocks.unshift({ kind: 'transfer', periods: ['morning'], label: `Move to ${base2}`, note: 'Travel time unverified.', stopIds: [] });
      return day;
    });
    const corrected = structuredClone(candidate);
    corrected.days[2].stops[0].duration = 120;
    const snapshot = { planningState: { dates: { durationDays: 4 }, lodging: { maxHotelChanges: 1 } } };
    const store = { load: async () => snapshot, commit: jest.fn(async () => ({ ok: true, tripId: 'two-base' })) };
    const h = harness([call('read_travel', {}), proposal({ response: 'Ready', plan: candidate }),
      proposal({ response: 'Ready', plan: corrected })], { store });
    h.travelTools.execute.mockResolvedValue({ status: 'fulfilled', evidence });
    const result = await h.run({ message: `Four days in ${first} and ${second}, one hotel change.` });
    expect({ status: result.status, rounds: result.telemetry.mutationRounds }).toEqual({ status: 'complete', rounds: [{ issues: ['duration_exceeds_source'] }, { issues: [] }] });
    expect(result.telemetry.mutationRounds).toEqual([{ issues: ['duration_exceeds_source'] }, { issues: [] }]);
    const feedback = JSON.parse(h.model.mock.calls[2][0].input.at(-1).output);
    expect(feedback.durationFindings).toEqual([{ dayNumber: 3, stopId: 's1', stopName: second,
      evidenceRef: 'place-2', proposedMinutes: 150, maximumMinutes: 120, sourceDuration: '1-2 Hours' }]);
    expect(store.commit).toHaveBeenCalledTimes(1);
    expect(result.response.itineraryData.days.map(d => d.overnightLocation)).toEqual([base1, base1, base2, base2]);
    expect(result.response.itineraryData.days.map(d => d.stops[0].name)).toEqual([first, first, second, second]);
    expect(h.model).toHaveBeenCalledTimes(3);
    expect(validateSimpleMutation({ proposal: { response: 'Ready', plan: corrected }, snapshot: { planningState: {
      dates: { durationDays: 5 }, lodging: { maxHotelChanges: 0 },
    } }, evidence, now: NOW }).issues).toEqual(expect.arrayContaining(['plan_day_count_mismatch', 'hotel_change_limit_exceeded']));
  });
});

test('duration repair does not turn a resolved destination alias into a second rejection', async () => {
  const row = source();
  row.source.provider = 'named_place';
  Object.assign(row.claim.normalizedValue, { name: 'Bryce Canyon National Park', requestedName: 'Bryce', duration: '1-2 Hours' });
  const candidate = plan();
  Object.assign(candidate.days[0].stops[0], { name: 'Bryce Canyon National Park', duration: 150 });
  const corrected = structuredClone(candidate); corrected.days[0].stops[0].duration = 120;
  const store = { load: async () => ({}), commit: jest.fn(async () => ({ ok: true, tripId: 'alias' })) };
  const h = harness([call('read_travel', {}), proposal({ response: 'Ready', plan: candidate }),
    proposal({ response: 'Ready', plan: corrected })], { store });
  h.travelTools.execute.mockResolvedValue({ status: 'fulfilled', evidence: [row], unresolved: [{ place: 'Bryce' }] });
  const result = await h.run({ message: 'Visit Bryce' });
  expect(result.telemetry.mutationRounds).toEqual([{ issues: ['duration_exceeds_source'] }, { issues: [] }]);
  expect(result.status).toBe('complete');
  expect(store.commit).toHaveBeenCalledTimes(1);
});

test('booking help returns verified links directly and removes invented links without a repair call', async () => {
  const url = 'https://hotel.example/reservations';
  const row = source(); row.source.url = url;
  const h = harness([call('read_travel', { destination: 'Portland', question: 'Booking help',
    resources: [{ name: 'Harbor Hotel', destination: 'Portland', kind: 'hotel' }] }),
    generation({ outputText: `Check [Harbor Hotel](${url}). Availability is unknown. [Other booking](https://invented.example/book)` })]);
  h.travelTools.execute.mockResolvedValue({ status: 'fulfilled', evidence: [row] });
  const result = await h.run({ message: 'Where can I book Harbor Hotel in Portland?' });
  expect(result.status).toBe('complete');
  expect(result.response.content).toContain(`[Harbor Hotel](${url})`);
  expect(result.response.content).not.toContain('https://invented.example');
  expect(result.telemetry.corrections).toBe(0); expect(h.model).toHaveBeenCalledTimes(2);
  expect(result.response.itineraryData).toBeNull();
});
