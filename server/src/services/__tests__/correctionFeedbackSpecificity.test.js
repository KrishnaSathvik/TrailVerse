'use strict';

/**
 * A rejected proposal must reach its single correction round with structured,
 * specific reasons: which stops failed which restriction, the evidence behind
 * it, and which grounded places are eligible. No extra model calls, no planner.
 */

const { withDayStructure } = require('../../../tests/helpers/dayStructure');
const { createSimpleRuntime } = require('../trailieSimpleRuntime');
const { normalizeEvidenceLocation } = require('../../utils/trailieCanonicalLocation');
const { explainMutationIssues } = require('../../utils/mutationIssueMeanings');

const NOW = new Date('2026-10-12T12:00:00Z');
const observation = { observedAt: NOW.toISOString(), expiresAt: new Date(+NOW + 86400000).toISOString() };
const row = (evidenceId, name, sourceClass, value = {}) => normalizeEvidenceLocation({
  evidenceId, topic: 'activities', entityId: evidenceId,
  claim: { identity: evidenceId, normalizedValue: { name, latitude: 37.2, longitude: -112.9, ...value } },
  source: { provider: sourceClass === 'official_owner' ? 'nps' : 'named_place', sourceClass }, observation,
});
const EVIDENCE = [
  row('commercial-mesa', 'Checkerboard Mesa', 'commercial_structured'),
  row('nps-parus', "Pa'rus Trail", 'official_owner', { category: 'thingstodo', exposureLevel: 'low' }),
  row('nps-angels', 'Angels Landing', 'official_owner', { category: 'thingstodo', exposureLevel: 'high' }),
  row('nps-museum', 'Zion Human History Museum', 'official_owner', { category: 'museum', exposureLevel: 'low' }),
];
const answer = (text) => ({ completionStatus: 'completed', outputText: text, toolCalls: [] });
const propose = (stops) => ({ ...answer(''), toolCalls: [{ id: 'p1', name: 'propose_trip_update', input: {
  response: 'A gentle day.',
  plan: withDayStructure({ parkName: 'Zion National Park', intro: 'A gentle day.', days: [{ id: 'd1', dayNumber: 1, label: 'Day 1',
    stops: stops.map(([name, evidenceRef], i) => ({ id: `s${i}`, order: i + 1, name, evidenceRef, type: 'viewpoint', duration: 45, note: '', why: 'Scenery', startTime: '' })) }] }),
} }] });

function harness(outputs) {
  const model = jest.fn();
  outputs.forEach((o) => model.mockResolvedValueOnce(o));
  const travelTools = { definitions: [], execute: jest.fn(),
    finalizeProposal: jest.fn(async () => ({ evidence: EVIDENCE })) };
  return { model, run: createSimpleRuntime({ model, travelTools, now: () => NOW }) };
}
const correctionPayload = (model) => {
  const input = model.mock.calls[1][0].input;
  return JSON.parse(input[input.length - 1].output);
};

test('rejected stops are named with the evidence behind each verdict', async () => {
  const h = harness([propose([['Checkerboard Mesa', 'commercial-mesa'], ['Angels Landing', 'nps-angels']]), answer('I could not confirm enough low-exposure outings.')]);
  const result = await h.run({ message: 'No exposed hikes please.',
    snapshot: { planningState: { validationConstraints: { avoidExposure: true } } } });
  expect(h.model).toHaveBeenCalledTimes(2); // budget unchanged: one correction
  const payload = correctionPayload(h.model);
  expect(payload.activeRestrictions).toEqual({ avoidExposure: true });
  expect(payload.restrictionFindings).toEqual(expect.arrayContaining([
    expect.objectContaining({ stopName: 'Checkerboard Mesa', reasonCodes: ['constraint_eligibility_unknown'], evidence: expect.objectContaining({ exposureLevel: null }) }),
    expect.objectContaining({ stopName: 'Angels Landing', reasonCodes: ['exposure_constraint_violation'], evidence: expect.objectContaining({ exposureLevel: 'high' }) }),
  ]));
  const meanings = Object.fromEntries(payload.issueMeanings.map((m) => [m.code, m.meaning]));
  expect(meanings.constraint_eligibility_unknown).toMatch(/restrictionFindings/);
  expect(meanings.constraint_eligibility_unknown).toMatch(/flexible experience/);
  expect(meanings.exposure_constraint_violation).not.toBe('The change did not pass validation.');
  // A valid plan cannot be produced → the model's explanation is preserved.
  expect(result.response.content).toBe('I could not confirm enough low-exposure outings.');
});

test('grounded places carry eligibility labels from the validator authority', async () => {
  const h = harness([propose([['Checkerboard Mesa', 'commercial-mesa']]), answer('Explained.')]);
  await h.run({ message: 'No exposed hikes please.', snapshot: { planningState: { validationConstraints: { avoidExposure: true } } } });
  const labels = Object.fromEntries(correctionPayload(h.model).groundedPlaces.map((p) => [p.name, p.restrictionEligibility]));
  expect(labels).toEqual({ 'Checkerboard Mesa': 'unconfirmed', "Pa'rus Trail": 'meets', 'Angels Landing': 'conflicts', 'Zion Human History Museum': 'meets' });
});

test('a corrected proposal using only eligible places is accepted within the same budget', async () => {
  const h = harness([propose([['Checkerboard Mesa', 'commercial-mesa']]),
    propose([["Pa'rus Trail", 'nps-parus'], ['Zion Human History Museum', 'nps-museum']])]);
  const result = await h.run({ message: 'No exposed hikes please.', snapshot: { planningState: { validationConstraints: { avoidExposure: true } } } });
  expect(result.status).toBe('complete');
  expect(h.model).toHaveBeenCalledTimes(2);
  expect(result.response.itineraryData.days[0].stops.map((s) => s.name)).toEqual(["Pa'rus Trail", 'Zion Human History Museum']);
});

test('without restrictions the payload carries no eligibility labels', async () => {
  const h = harness([propose([['A Different Name', 'commercial-mesa']]), answer('Explained.')]);
  await h.run({ message: 'Plan a day.' });
  const payload = correctionPayload(h.model);
  expect(payload.activeRestrictions).toBeNull();
  expect(payload.groundedPlaces.every((p) => !('restrictionEligibility' in p))).toBe(true);
});

test('correction grounding keeps normalized planning facts but omits raw source passages', async () => {
  const sourceDetails = [{ title: 'Official trail page', description: 'A long raw source passage.' }];
  const evidence = row('nps-source-rich', 'Source Rich Trail', 'official_owner', {
    category: 'thingstodo', exposureLevel: 'low',
    operationalFacts: [{ kind: 'closure', status: 'closed', text: 'Closed for repairs.' }],
    sourceDetails,
  });
  const model = jest.fn()
    .mockResolvedValueOnce(propose([['A Different Name', 'nps-source-rich']]))
    .mockResolvedValueOnce(answer('Explained.'));
  const travelTools = { definitions: [], execute: jest.fn(), finalizeProposal: jest.fn(async () => ({ evidence: [evidence] })) };
  const run = createSimpleRuntime({ model, travelTools, now: () => NOW });

  await run({ message: 'Plan a day.' });

  const value = correctionPayload(model).groundedPlaces[0].value;
  expect(value).not.toHaveProperty('sourceDetails');
  expect(value.operationalFacts).toEqual([{ kind: 'closure', status: 'closed', text: 'Closed for repairs.' }]);
});

test('an official record with a generic category is still judged for exposure (guard relevance hole)', async () => {
  const h = harness([propose([['Angels Landing', 'nps-angels']]), answer('Explained.')]);
  const result = await h.run({ message: 'No exposed hikes please.', snapshot: { planningState: { validationConstraints: { avoidExposure: true } } } });
  expect(result.telemetry.mutationRounds[0].issues).toContain('exposure_constraint_violation');
  expect(result.response.itineraryData).toBeFalsy();
});

test('unknown codes keep the generic meaning', () => {
  expect(explainMutationIssues(['some_unlisted_code'])[0].meaning).toBe('The change did not pass validation.');
});
