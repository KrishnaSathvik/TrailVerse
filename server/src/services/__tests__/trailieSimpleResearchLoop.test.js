'use strict';
const { withDayStructure } = require('../../../tests/helpers/dayStructure');
const { createSimpleRuntime } = require('../trailieSimpleRuntime');
const { createSimpleTravelTools } = require('../trailieTravelData');
const { normalizeEvidenceLocation } = require('../../utils/trailieCanonicalLocation');
const NOW = new Date('2026-09-30T12:00:00Z');
const answer = text => ({ completionStatus: 'completed', outputText: text, toolCalls: [] });
const action = (name, input, id = name) => ({ ...answer(''), toolCalls: [{ name, input, id }] });
const request = { destination: 'Example Park', question: 'Plan a visit', topics: ['activities', 'alerts_closures', 'weather_forecast'], travelMode: 'driving' };
const read = () => action('read_travel', request);
const candidate = (topic, name, value = {}) => ({ topic, entityId: name, observedAt: NOW.toISOString(),
  claim: { identity: name, normalizedValue: { name, ...value } }, source: {provider: 'nps', sourceClass: 'official_owner', url: 'https://www.nps.gov/example'} });
const plan = () => withDayStructure({ parkName: 'Example Park', intro: 'A measured day.', days: [{id: 'd1', dayNumber: 1, label: 'Day 1', stops:
  ['First Overlook', 'Second Overlook'].map((name, i) => ({id: `s${i}`, order: i + 1, name, type: 'viewpoint', duration: 30, note: '', why: 'A distinct perspective', startTime: ''})) }] });
function backend(overrides = {}) {
  const broker = { dispatchEphemeral: jest.fn(async ({requirement: r}) => {
    if (r.topic === 'activities') return {status: 'fulfilled', normalizedCandidates: [candidate('activities', 'First Overlook', {coordinates: {latitude: 40, longitude: -110}}), candidate('activities', 'Second Overlook', {latitude: 41, longitude: -111})]};
    if (r.topic === 'driving_time') return {status: 'fulfilled', normalizedCandidates: [{...candidate('driving_time', 'route', {durationSeconds: 600, distanceMeters: 9000}), scope: {route: {originEntityId: r.routeScope.origin.entityId, destinationEntityId: r.routeScope.destination.entityId, travelMode: r.routeScope.travelMode}}}]};
    return {status: 'unsupported', reasonCode: 'provider_not_configured', normalizedCandidates: []};
  }) };
  return { broker, tools: createSimpleTravelTools({broker, now: () => NOW, destinationResolver: async () => ({entityId: 'nps:park:exmp', displayName: 'Example Park', latitude: 40, longitude: -110, sourceClass: 'official_owner'}), ...overrides}) };
}
function harness(outputs, tools, extra = {}) {
  const model = jest.fn(); outputs.forEach(o => model.mockResolvedValueOnce(o));
  return { model, run: createSimpleRuntime({model, travelTools: tools, now: () => NOW, ...extra}) };
}
test('direct answer needs one call and zero research', async () => {
  const b = backend(), h = harness([answer('Choose a slower pace.')], b.tools);
  const r = await h.run({message: 'Help me choose'});
  expect(r.telemetry).toMatchObject({modelCalls: 1, toolCalls: 0}); expect(b.broker.dispatchEphemeral).not.toHaveBeenCalled();
});
test('one managed research phase preserves synthesis and mutation tool', async () => {
  const b = backend(), h = harness([read(), answer('Access is unconfirmed; leave room to adjust.')], b.tools);
  const r = await h.run({message: 'Help me plan'});
  expect(r.status).toBe('complete'); expect(r.telemetry).toMatchObject({modelCalls: 2, toolCalls: 1});
  expect(h.model.mock.calls[1][0].tools.map(t => t.name)).toEqual(['propose_trip_update']);
  expect(r.telemetry.tools[0].unresolved.length).toBeGreaterThan(0);
  expect(r.response.content).not.toMatch(/unsupported|provider_not_configured/);
  expect(b.broker.dispatchEphemeral.mock.calls.some(([r]) => r.requirement.topic === 'weather_forecast')).toBe(true);
});
test('research then creation finalizes coordinates and routes without another model call', async () => {
  const b = backend(), h = harness([read(), action('propose_trip_update', {response: 'Two overlooks with time between them.', plan: plan()})], b.tools);
  const r = await h.run({message: 'Plan a day', snapshot: {planningState: {transportation: {rentalCar: true}}}});
  expect(r.status).toBe('complete'); expect(r.telemetry.modelCalls).toBe(2);
  const day = r.response.itineraryData.days[0];
  expect(day.stops[0].location).toMatchObject({lat: 40, lon: -110, status: 'resolved', authority: 'official_owner'});
  expect(day.stops[0]).not.toHaveProperty('latitude');
  expect(day.travelEdges[0]).toMatchObject({sourceStopId: 's0', targetStopId: 's1', status: 'verified', travelMode: 'driving', durationSeconds: 600});
});
test('rejected researched mutation gets one correction, absolute maximum three', async () => {
  const b = backend(), bad = plan(); bad.days[0].stops[0].duration = -1;
  const h = harness([read(), action('propose_trip_update', {response: 'Ready', plan: bad}), action('propose_trip_update', {response: 'Ready', plan: plan()})], b.tools);
  const r = await h.run({message: 'Plan a day'});
  expect(r.status).toBe('complete'); expect(r.telemetry).toMatchObject({modelCalls: 3, corrections: 1});
  expect(h.model.mock.calls[2][0].tools.map(t => t.name)).toEqual(['propose_trip_update']);
});
test('failed correction preserves prior state and gives useful failure with no false saved artifact', async () => {
  const b = backend(), bad = action('propose_trip_update', {response: 'Saved', memory_updates: [{field:'dates', sourceQuote:'tomorrow', value:{startDate:'invalid'}}]});
  const store = {load: async () => ({plan:plan(),planningState:{dates:{startDate:'2026-10-01'}}}), commit: jest.fn()};
  const h = harness([read(), bad, bad], b.tools, {store});
  const r = await h.run({message:'tomorrow'});
  expect(r).toMatchObject({status:'mutation_rejected', response:null, persisted:false});
  expect(r.failureContent).toContain('unchanged'); expect(store.commit).not.toHaveBeenCalled(); expect(h.model).toHaveBeenCalledTimes(3);
});
test('repeated research cannot restart backend work or consume correction slot', async () => {
  const b = backend(), h = harness([read(), read()], b.tools);
  const r = await h.run({message:'Help'});
  expect(r.status).toBe('complete'); expect(r.telemetry).toMatchObject({modelCalls:2, toolCalls:1, corrections:0});
  expect(r.response.content).toContain('could not confirm');
});
test('budget exhaustion returns partial facts and leaves final synthesis', async () => {
  const b = backend({maxProviderRequests: 1}), h = harness([read(), answer('Here is what is confirmed.')], b.tools);
  const r = await h.run({message:'Help'});
  expect(r.status).toBe('complete'); expect(b.broker.dispatchEphemeral).toHaveBeenCalledTimes(1); expect(r.telemetry.modelCalls).toBe(2);
});
test('source provenance is required even with finite coordinates', () => {
  const raw = {...candidate('activities','Unknown',{latitude:40,longitude:-110}), evidenceId:'x', source:{provider:'search',sourceClass:'unknown'}};
  expect(normalizeEvidenceLocation(raw).claim.normalizedValue.location).toBeUndefined();
});
test('independent source reads overlap, route work waits for coordinates', async () => {
  const releases = [], b = backend();
  b.broker.dispatchEphemeral.mockImplementation(({requirement}) => new Promise(resolve => releases.push({requirement, resolve})));
  const running = b.tools.execute('read_travel', {...request, topics:['activities','alerts_closures']}, {requestId:'parallel', userMessage:'Help'});
  for(let i=0;i<30 && releases.length<3;i++) await Promise.resolve();
  // The two requested topics plus the park's official access discovery, all concurrent.
  expect(releases.map(r => `${r.requirement.topic}/${r.requirement.preferredProviders[0]}`).sort())
    .toEqual(['activities/nps', 'alerts_closures/nps', 'transit/brave']);
  releases.forEach(r => r.resolve({status:'unsupported',normalizedCandidates:[]}));
  expect((await running).unresolved).toHaveLength(2);
});
test('bounded provider timeout still yields synthesis; cancellation never publishes', async () => {
  const b = backend({providerTimeoutMs: 5}); b.broker.dispatchEphemeral.mockImplementation(() => new Promise(() => {}));
  const h = harness([action('read_travel', {...request, topics:['activities']}), answer('The detail is unconfirmed.')], b.tools);
  expect((await h.run({message:'Help'})).status).toBe('complete');
  const abort = new AbortController(); abort.abort();
  expect((await h.run({message:'Help', signal:abort.signal})).status).toBe('cancelled');
});
test('progress precedes commit, accepted artifact follows commit only', async () => {
  const events=[], b=backend(); const store={load:async()=>({}),commit:async()=>{events.push('commit');return {ok:true};}};
  const h=harness([answer('A useful answer')],b.tools,{store});
  const result=await h.run({message:'Help',onProgress:e=>{events.push(e.stage);return true;}}); events.push(result.status);
  expect(events.indexOf('understanding_request')).toBeLessThan(events.indexOf('commit'));
  expect(events.at(-1)).toBe('complete'); expect(result.telemetry.timings.persistenceMs).toBeGreaterThanOrEqual(0);
});

test('backend geocodes source identities before requesting their route', async () => {
  const b = backend(), order=[];
  b.broker.dispatchEphemeral.mockImplementation(async ({requirement:r}) => {
    order.push(r.topic);
    if(r.topic === 'activities') return {status:'fulfilled', normalizedCandidates:['First Overlook','Second Overlook'].map(n=>candidate('activities',n))};
    if(r.topic === 'stop_coordinates') return {status:'fulfilled', normalizedCandidates:[{...candidate('stop_coordinates',r.query,{latitude:40,longitude:-110,providerSource:'google'}),source:{provider:'geocode_coordinate',sourceClass:'external_geocoder'}}]};
    return {status:'unsupported',normalizedCandidates:[]};
  });
  const result=await b.tools.execute('read_travel',{...request,topics:['activities'],places:['First Overlook','Second Overlook']},{requestId:'deps',userMessage:'Plan the trip'});
  expect(order).not.toContain('driving_time'); // Research is not stop-order authority.
  await b.tools.finalizeProposal({ plan: plan() }, { requestId: 'deps', userMessage: 'Plan the trip', snapshot: {} });
  expect(order.indexOf('driving_time')).toBeGreaterThan(order.lastIndexOf('stop_coordinates'));
  expect(result.evidence.filter(e=>e.topic==='activities').every(e=>e.claim.normalizedValue.location.source==='geocoder')).toBe(true);
  const geo=b.broker.dispatchEphemeral.mock.calls.find(([v])=>v.requirement.topic==='stop_coordinates')[0].requirement;
  expect(geo.queryProvenance.explicitTravelerRegion).toBeNull();
  // A fictional park label is not authoritative geographic context.
  expect(geo.queryProvenance.contextualRegions).toEqual([]);
});
test('an unknown geocoder source cannot acquire authority from finite coordinates', () => {
  const row={...candidate('stop_coordinates','x',{latitude:40,longitude:-110,providerSource:'unknown'}),evidenceId:'x',source:{provider:'geocode_coordinate',sourceClass:'external_geocoder'}};
  expect(normalizeEvidenceLocation(row).claim.normalizedValue.location).toBeUndefined();
});
