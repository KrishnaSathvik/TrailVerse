'use strict';
const { canonicalMutationContext } = require('../canonicalMutationContext');

test('late days and all canonical constraints survive a long conversation context', () => {
  const plan = { days: Array.from({ length: 7 }, (_, i) => ({ dayNumber: i + 1, stops: [{ id: `stop-${i}`, name: `Place ${i}`, note: 'Existing activity details. '.repeat(60) }] })) };
  const facts = { mobility: { wheelchair: true, avoidStairs: true }, travelers: { pets: true }, preferences: { avoidExposure: true }, lodging: { baseTown: 'Booked base' } };
  const text = canonicalMutationContext({ plan, facts, mutation: 'Redo day seven.' });
  const input = JSON.parse(text.slice(text.indexOf('\n') + 1));
  expect(input.canonicalSavedPlan).toEqual(plan);
  expect(input.canonicalTripFacts).toEqual(facts);
  expect(input.newMutation).toBe('Redo day seven.');
  expect(input.canonicalSavedPlan.days[6].stops[0].id).toBe('stop-6');
});

test('no saved plan does not manufacture a mutation base', () => {
  expect(canonicalMutationContext({ plan: null, mutation: 'Redo tomorrow.' })).toBe('');
});
