'use strict';
const { validateSimpleMutation } = require('../trailieSimpleGuard');
const now = new Date();
const source = value => ({ evidenceId: 'e', topic: 'activities', claim: { identity: 'official-e',
  normalizedValue: { name: 'Recorded place', ...value } }, source: { provider: 'nps', sourceClass: 'official_owner' },
  observation: { observedAt: now.toISOString(), expiresAt: new Date(+now + 86400000).toISOString() } });
const proposal = { response: 'A visit.', plan: { intro: 'A visit.', days: [{ id: 'd', dayNumber: 1, label: 'Day',
  stops: [{ id: 's', order: 1, type: 'viewpoint', name: 'Recorded place', note: '', startTime: '', duration: 30, evidenceRef: 'e' }] }] } };

test.each([
  [{ mobility: { wheelchair: true } }, { wheelchairAccessible: false }, 'wheelchair_constraint_violation'],
  [{ mobility: { avoidStairs: true } }, { requiresStairs: true }, 'stairs_constraint_violation'],
  [{ travelers: { pets: true } }, { petsAllowed: false }, 'pets_constraint_violation'],
  [{ preferences: { avoidExposure: true } }, { exposureLevel: 'high' }, 'exposure_constraint_violation'],
])('source-backed hard constraints remain enforced: %s', (planningState, value, issue) => {
  expect(validateSimpleMutation({ proposal, snapshot: { planningState }, message: 'Plan a visit', evidence: [source(value)], now }).issues).toContain(issue);
});

test('soft fitness and pace no longer act as deterministic quality gates', () => {
  expect(validateSimpleMutation({ proposal, snapshot: { planningState: { preferences: { fitness: 'beginner', pace: 'relaxed' } } },
    message: 'Plan a visit', evidence: [source({})], now }).ok).toBe(true);
});

test('budget and booking facts require current-turn provenance', () => {
  const response = validateSimpleMutation({ message: 'We booked New town and have 500 dollars.', proposal: {
    response: 'Noted.', memory_updates: [
      { field: 'budget', value: { amount: 500, currency: 'USD', scope: 'trip' }, sourceQuote: '500 dollars' },
      { field: 'lodging', value: { baseTown: 'New town', booked: true }, sourceQuote: 'booked New town' },
    ],
  } });
  expect(response.ok).toBe(true);
  expect(response.planningState.budget.amount).toBe(500);
  expect(response.planningState.lodging.booked).toBe(true);
});
