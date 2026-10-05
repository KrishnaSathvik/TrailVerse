'use strict';
const { validateSimpleMutation } = require('../trailieSimpleGuard');
const { stubMemoryVerifier } = require('../../../tests/helpers/memoryAuthority');
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

test('budget and booking facts require verified current-turn provenance', async () => {
  const message = 'We booked lodging in New town. Our total trip budget is 500 USD.';
  const updates = [
    { field: 'budget', value: { amount: 500, currency: 'USD', scope: 'trip' }, sourceQuote: 'Our total trip budget is 500 USD.' },
    { field: 'lodging', value: { baseTown: 'New town', booked: true }, sourceQuote: 'We booked lodging in New town.' },
  ];
  const { receipt } = await stubMemoryVerifier()({ message, updates });
  const response = validateSimpleMutation({ message, memoryAuthority: receipt,
    proposal: { response: 'Noted.', memory_updates: updates } });
  expect(response.ok).toBe(true);
  expect(response.planningState.budget.amount).toBe(500);
  expect(response.planningState.lodging.booked).toBe(true);
  expect(validateSimpleMutation({ message, proposal: { response: 'Noted.', memory_updates: updates } }).ok).toBe(false);
});
