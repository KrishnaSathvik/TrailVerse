'use strict';
const { parseTripPushback, recommendationContract } = require('../tripPushback');
const valid = () => ({ completionStatus: 'completed', toolCalls: [{ name: 'recommend_trip_revision', input: {
  reason: 'insufficient_time', explanation: 'There is too little time for all those transfers and meaningful visits.', recommendation: 'Consider two parks instead.',
} }] });
test('pushback starts with judgment and does not echo You asked', () => {
  const result = parseTripPushback(valid(), 'Yellowstone, Grand Teton, Glacier and Banff in five days.');
  expect(result.ok).toBe(true);
  expect(result.text).not.toMatch(/You asked:/i);
  expect(result.text.startsWith('There is too little time')).toBe(true);
});
test.each(['incomplete', 'failed', null])('rejects unfinished decisions: %s', completionStatus => {
  expect(parseTripPushback({ ...valid(), completionStatus }, 'trip').ok).toBe(false);
});
test('rejects conflicting outcomes, malformed args and refusal', () => {
  const both = valid(); both.toolCalls.push({ name: 'create_itinerary', input: {} });
  expect(parseTripPushback(both, 'trip').ok).toBe(false);
  const broken = valid(); broken.toolCalls[0].input = '{';
  expect(parseTripPushback(broken, 'trip').ok).toBe(false);
  expect(parseTripPushback({ ...valid(), refusal: 'refused' }, 'trip').ok).toBe(false);
});
test('transition retains original artifact for attribution', () => {
  const contract = Object.freeze({ requestedArtifact: 'itinerary', requiresCanonicalPlanArtifact: true });
  expect(recommendationContract(contract, 'insufficient_time')).toMatchObject({ originalRequestedArtifact: 'itinerary', requestedArtifact: 'plain_answer', requiresCanonicalPlanArtifact: false });
  expect(contract.requestedArtifact).toBe('itinerary');
});
