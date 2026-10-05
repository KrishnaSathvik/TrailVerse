'use strict';
const { reconcileCanonicalNarrative } = require('../canonicalPlanNarrative');
const plan = { intro: 'Enjoy a waterfall hike.', days: [{ dayNumber: 1, stops: [{ name: 'History Museum', type: 'museum' }] }] };
test('unsupported activity prose is rebuilt without adding a stop', () => {
  const result = reconcileCanonicalNarrative({ itineraryData: plan, text: plan.intro });
  expect(result.regenerated).toBe(true);
  expect(result.text).toBe('Day 1: History Museum.');
  expect(result.itineraryData.days).toEqual(plan.days);
  expect(plan.intro).toBe('Enjoy a waterfall hike.');
});
test('named evidence activities not selected in the plan cannot appear in narration', () => {
  const result = reconcileCanonicalNarrative({ itineraryData: { ...plan, intro: 'Visit Cedar Falls.' }, evidenceBundle: { evidence: [{ topic: 'activities', claim: { normalizedValue: { name: 'Cedar Falls' } } }] } });
  expect(result.regenerated).toBe(true);
});
test('destination context and matching narration are preserved', () => {
  const good = { ...plan, intro: 'Explore Seattle and its History Museum.' };
  const result = reconcileCanonicalNarrative({ itineraryData: good, evidenceBundle: { evidence: [{ topic: 'destination_identity', claim: { normalizedValue: { name: 'Seattle' } } }] } });
  expect(result.itineraryData).toBe(good);
  expect(result.regenerated).toBe(false);
});
