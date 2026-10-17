'use strict';
const { validateSimpleMutation } = require('../trailieSimpleGuard');
const { createSimpleRuntime } = require('../trailieSimpleRuntime');
const { createSimpleTravelTools } = require('../trailieTravelData');
const { explainMutationIssues } = require('../../utils/mutationIssueMeanings');

const NOW = new Date('2026-10-07T12:00:00Z');
const stop = (id, name, identity, lat, extra = {}) => ({ id, order: 1, name, type: 'viewpoint', duration: 90, note: 'Original note.', why: 'Views',
  startTime: '09:00', evidenceRef: `simple:${id}`, canonicalPlaceId: identity, canonicalPlaceName: name, resolutionStatus: 'resolved',
  location: { lat, lon: -113.7, source: 'resolved_metadata', authority: 'official_owner', status: 'resolved', sourceRef: `simple:${id}`, sourceEntity: identity },
  ...extra });
// The accepted Glacier shape behind the original rejection: Day 3 = road + Logan Pass.
const acceptedPlan = () => ({ parkName: 'Glacier National Park', days: [
  { dayNumber: 1, label: 'Cedars', stops: [stop('d1-cedars', 'Trail of the Cedars', 'nps:place:cedars', 48.6)] },
  { dayNumber: 3, label: 'Cross the mountains', stops: [
    stop('d3-road', 'Going-to-the-Sun Road', 'google:place:gtsr', 48.7),
    { ...stop('d3-logan', 'Logan Pass', 'nps:place:logan', 48.69), order: 2, note: 'Short walk; Hidden Lake Overlook can be considered.' }],
  travelEdges: [{ sourceStopId: 'd3-road', targetStopId: 'd3-logan', relationship: 'transfer', modeIntent: 'drive', travelMode: 'driving',
    status: 'verified', durationSeconds: 1500, distanceMeters: 20000, source: { evidenceId: 'simple:route', provider: 'google_maps' } }] },
] });
const patch = (operations) => ({ response: 'Updated Day 3.', plan_patch: { response: 'Updated Day 3.', operations } });
const noHikingNote = patch([{ op: 'update_stop', dayNumber: 3, stopId: 'd3-logan', stop: { note: 'Photograph from the pass only; skip trail walks.' } }]);
const validate = (proposal, extra = {}) => validateSimpleMutation({ proposal, snapshot: { plan: acceptedPlan(), planningState: { dates: { durationDays: 2 } } },
  message: 'Make Day 3 almost no hiking.', evidence: [], now: NOW, ...extra });

describe('guard: unchanged accepted stops keep their canonical identity', () => {
  test('a note-only Day 3 patch is accepted with no fresh evidence and keeps identity + verified transfer', () => {
    const v = validate(noHikingNote);
    expect(v).toMatchObject({ ok: true, issues: [], touchedDayNumbers: [3] });
    const day3 = v.plan.days.find(d => d.dayNumber === 3);
    expect(day3.stops.map(s => [s.canonicalPlaceId, s.evidenceRef])).toEqual([['google:place:gtsr', 'simple:d3-road'], ['nps:place:logan', 'simple:d3-logan']]);
    expect(day3.stops[1].note).toBe('Photograph from the pass only; skip trail walks.');
    expect(day3.travelEdges).toEqual([expect.objectContaining({ status: 'verified', durationSeconds: 1500, travelMode: 'driving' })]);
  });
  test('renaming a stop while keeping its old canonicalPlaceId is re-grounded and rejected without evidence', () => {
    const v = validate(patch([{ op: 'update_stop', dayNumber: 3, stopId: 'd3-logan', stop: { name: 'Random Place' } }]));
    expect(v.ok).toBe(false);
    expect(v.issues).toContain('stop_identity_unresolved');
  });
  test('an added stop still requires fresh grounding', () => {
    const v = validate(patch([{ op: 'add_stop', dayNumber: 3, stop: { id: 'd3-new', name: 'Siyeh Bend', type: 'viewpoint', duration: 30 } }]));
    expect(v.issues).toContain('stop_identity_unresolved');
  });
  test('identity is trusted only when every identity-bearing field matches the accepted stop', () => {
    const { acceptedStopsById, preservedIdentitySource } = require('../../utils/stopIdentity');
    const prior = acceptedStopsById(acceptedPlan());
    const same = acceptedPlan().days[1].stops[1];
    expect(preservedIdentitySource({ ...same, note: 'changed note' }, prior)).not.toBeNull();
    for (const change of [{ name: 'Random Place' }, { evidenceRef: 'simple:other' }, { canonicalPlaceId: 'nps:place:other' },
      { location: { ...same.location, lat: 10 } }, { id: 'd3-unknown' }]) {
      expect(preservedIdentitySource({ ...same, ...change }, prior)).toBeNull();
    }
  });
  test('the model-facing schema cannot carry canonical identity or coordinates', () => {
    const v = validate(patch([{ op: 'update_stop', dayNumber: 3, stopId: 'd3-logan', stop: { canonicalPlaceId: 'nps:place:other' } }]));
    expect(v).toMatchObject({ ok: false, issues: ['mutation_schema_invalid'] });
  });
  test('a constraint change this turn re-evaluates touched stops from evidence', () => {
    const v = validate({ ...noHikingNote, memory_updates: [{ field: 'mobility', value: { maxWalkMinutesPerSegment: 20 }, sourceQuote: 'Make Day 3 almost no hiking.' }] });
    expect(v.issues).toContain('stop_identity_unresolved');
  });
});

describe('grounding only touches new or re-identified places', () => {
  const tools = (broker) => createSimpleTravelTools({ broker, now: () => NOW,
    destinationResolver: async () => ({ entityId: 'nps:park:glac', displayName: 'Glacier National Park', latitude: 48.7, longitude: -113.7, sourceClass: 'official_owner' }) });
  test('a note-only patch performs no research, place lookup or routing', async () => {
    const broker = { dispatchEphemeral: jest.fn() };
    const out = await tools(broker).finalizeProposal(noHikingNote, { requestId: 'r1', snapshot: { plan: acceptedPlan() }, evidence: [], userMessage: 'Make Day 3 almost no hiking.' });
    expect(broker.dispatchEphemeral).not.toHaveBeenCalled();
    expect(out.providerAttemptCount).toBe(0);
  });
});

describe('correction round', () => {
  const travelTools = () => ({ definitions: [], execute: jest.fn(), finalizeProposal: jest.fn(async () => ({ evidence: [] })) });
  const call = (input, id) => ({ completionStatus: 'completed', outputText: '', toolCalls: [{ name: 'propose_trip_update', input, id }] });
  const answer = text => ({ completionStatus: 'completed', outputText: text, toolCalls: [] });
  test('gets plain reasons, a no-invention rule and narrow grounding; the outcome is summarized', async () => {
    const tools = travelTools();
    const model = jest.fn()
      .mockResolvedValueOnce(call(patch([{ op: 'update_stop', dayNumber: 3, stopId: 'd3-logan', stop: { name: 'Random Place' } }]), 'c1'))
      .mockResolvedValueOnce(answer('I couldn’t safely save that Day 3 change because one stop couldn’t be revalidated.'));
    const run = createSimpleRuntime({ model, travelTools: tools, now: () => NOW });
    const r = await run({ message: 'Make Day 3 almost no hiking.', snapshot: { plan: acceptedPlan(), planningState: {} } });
    const feedback = JSON.parse(model.mock.calls[1][0].input.find(i => i.type === 'function_call_output').output);
    expect(feedback.issueMeanings).toEqual(expect.arrayContaining([{ code: 'stop_identity_unresolved', meaning: expect.stringMatching(/could not be matched/) }]));
    expect(feedback.correctionPurpose).toMatch(/Never invent a reason such as locked/);
    expect(tools.finalizeProposal.mock.calls[0][1].narrow).toBe(false);
    expect(r.response.artifactStatus).toMatchObject({ status: 'save_failed' });
    expect(r.telemetry.mutationOutcome).toEqual({ mutationStatus: 'rejected_answered', mutationIssues: ['stop_identity_unresolved'], correctionAttempted: true, correctionIssues: [] });
  });
  test('a corrected proposal is re-grounded narrowly and an accepted note-only patch is recorded as accepted', async () => {
    const tools = travelTools();
    const model = jest.fn()
      .mockResolvedValueOnce(call(patch([{ op: 'update_stop', dayNumber: 3, stopId: 'd3-logan', stop: { name: 'Random Place' } }]), 'c1'))
      .mockResolvedValueOnce(call(noHikingNote, 'c2'));
    const run = createSimpleRuntime({ model, travelTools: tools, now: () => NOW });
    const r = await run({ message: 'Make Day 3 almost no hiking.', snapshot: { plan: acceptedPlan(), planningState: {} } });
    expect(tools.finalizeProposal.mock.calls.map(c => c[1].narrow)).toEqual([false, true]);
    expect(r.status).toBe('complete');
    expect(r.response.presentation.refinement).toMatchObject({ isRefinement: true, changedDayNumbers: [3] });
    expect(r.telemetry.mutationOutcome).toMatchObject({ mutationStatus: 'accepted', mutationIssues: ['stop_identity_unresolved'], correctionAttempted: true, correctionIssues: [] });
  });
});

test('every guard code the correction round can see has a plain meaning', () => {
  const meanings = explainMutationIssues(['stop_identity_unresolved', 'frozen_day_changed', 'memory_authority_unverified', 'something_new']);
  expect(meanings.every(m => m.meaning && !/locked|protected/i.test(m.meaning))).toBe(true);
  expect(meanings.find(m => m.code === 'something_new').meaning).toBe('The change did not pass validation.');
});

describe('mutation outcome persistence', () => {
  afterEach(() => jest.resetModules());
  test('writes a bounded record on the turn row and skips when Mongo is not connected', async () => {
    jest.doMock('mongoose', () => ({ ...jest.requireActual('mongoose'), connection: { readyState: 1 } }));
    const updateOne = jest.fn().mockResolvedValue({});
    jest.doMock('../../models/TrailieAiTurn', () => ({ updateOne }));
    const { recordMutationOutcome } = require('../trailieMutationOutcome');
    await recordMutationOutcome({ responseId: 'resp-1', outcome: { mutationStatus: 'rejected', mutationIssues: ['stop_identity_unresolved', 'Bad Code!'], correctionAttempted: true } });
    expect(updateOne).toHaveBeenCalledWith({ responseId: 'resp-1' }, expect.objectContaining({
      $set: { 'validation.mutation': expect.objectContaining({ mutationStatus: 'rejected', mutationIssues: ['stop_identity_unresolved'], correctionAttempted: true, correctionIssues: [] }) },
    }), { upsert: true });
    jest.resetModules();
    jest.doMock('mongoose', () => ({ ...jest.requireActual('mongoose'), connection: { readyState: 0 } }));
    jest.doMock('../../models/TrailieAiTurn', () => ({ updateOne }));
    updateOne.mockClear();
    expect(await require('../trailieMutationOutcome').recordMutationOutcome({ responseId: 'r', outcome: { mutationStatus: 'accepted' } })).toBe(false);
    expect(updateOne).not.toHaveBeenCalled();
  });
});

test('a reloaded guest trip with stored Date fields can still be refined one day at a time', async () => {
  const { createSimpleGuestStore } = require('../trailieSimpleGuestStore');
  const stored = acceptedPlan();
  // Mongo returns Dates for observedAt; they used to hash as {} but clone to strings.
  for (const day of stored.days) for (const s of day.stops) s.sourceReferences = [{ evidenceId: s.evidenceRef, url: null, observedAt: new Date('2026-10-07T10:00:00Z') }];
  const session = { anonymousId: 'guest_x', messages: [{ role: 'assistant', content: 'Trip', canonicalPlan: stored, responseId: 'r1', responseVersion: 1 }], planningState: {} };
  const AnonymousSession = { findOne: () => ({ lean: async () => session }) };
  const snapshot = await createSimpleGuestStore({ AnonymousSession, anonymousId: 'guest_x', turn: null }).load();
  expect(snapshot.plan.days[0].stops[0].sourceReferences[0].observedAt).toBe('2026-10-07T10:00:00.000Z');
  const v = validateSimpleMutation({ proposal: noHikingNote, snapshot: { plan: snapshot.plan, planningState: {} }, message: 'Make Day 3 almost no hiking.', evidence: [], now: NOW });
  expect(v).toMatchObject({ ok: true, issues: [] });
});
