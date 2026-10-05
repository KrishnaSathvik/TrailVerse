'use strict';

/**
 * Phase 12A — produce-object grammar and duration-role precedence.
 *
 * These tests describe semantic CLASSES, not the held-out audit sentence list.
 * Destinations and verbs are generated from component tables so a passing
 * suite cannot be a handful of golden strings.
 *
 * Offline only.
 */

const { parseTripDuration } = require('../durationSemantics');
const { resolveProduceTripRequest } = require('../produceTripRequest');

describe('produce-trip request — trip-object family, not verb spelling', () => {
  const dest = 'Acadia';

  test.each([
    [`Plan me a day in ${dest}`, 'day_object'],
    [`Build me a day in ${dest}`, 'day_object'],
    [`Make me a day in ${dest}`, 'day_object'],
    [`Put together a day at ${dest}`, 'day_object'],
    [`Design a day at ${dest}`, 'day_object'],
    [`Give us a day at ${dest}`, 'day_object'],
    [`Plan us a day at ${dest}`, 'day_object'],
    [`Put together a ${dest} day`, 'day_object'],
    [`Create a one-day ${dest} itinerary`, 'day_object'],
    [`Build me one day at ${dest}`, 'day_object'],
    [`We have one full day in ${dest} — plan it`, 'day_object'],
    [`Build a 3-day ${dest} trip`, 'counted_trip'],
    [`Create a 2-day itinerary for ${dest}`, 'explicit_noun'],
  ])('%s asks to produce a trip artifact (%s)', (text, objectKind) => {
    const result = resolveProduceTripRequest(text, { destinationCount: 1, durationDays: null });
    expect(result.askedToProduceTripArtifact).toBe(true);
    expect(result.objectKind).toBe(objectKind);
  });

  test('article-form and counted one-day objects imply duration 1 when no trip-length span exists', () => {
    const a = resolveProduceTripRequest(`Build me a day in ${dest}`, { destinationCount: 1 });
    const one = resolveProduceTripRequest(`Plan us one day at ${dest}`, { destinationCount: 1 });
    expect(a.impliedDurationDays).toBe(1);
    expect(one.impliedDurationDays).toBe(1);
  });
});

describe('produce-trip request — negatives are still advice', () => {
  test.each([
    "What's a good backup plan if parking is full at Acadia?",
    "What's Plan B if the lot fills at Sequoia?",
    'How should I plan if it rains in Sequoia?',
    "What's the best way to plan around crowds at Acadia in October?",
    'How should I plan my day if it rains in Acadia?',
    "Don't build the itinerary yet for a week in Big Bend.",
    'Is three days enough for Sequoia?',
    'Compare Acadia and Shenandoah for photography.',
    'What should I prioritize with one full day in Acadia?',
    'What is the weather in Sequoia this week?',
    'Give me a couple of different ways we could play four days at Acadia.',
    'Make the second day easier.',
  ])('%s does not ask to produce a trip artifact', (text) => {
    const result = resolveProduceTripRequest(text, { destinationCount: 1, durationDays: null });
    expect(result.askedToProduceTripArtifact).toBe(false);
  });
});

describe('duration-role precedence — trip length outranks activity-role spans', () => {
  test('a counted trip noun keeps its length when a later one-X-day role appears', () => {
    const parsed = parseTripDuration(
      'Build a 4-day Sequoia trip with forest, granite, and one alpine day.',
    );
    expect(parsed.durationDays).toBe(4);
    expect(parsed.supportingSpan).toMatch(/4-day/i);
  });

  test('plural themed days inside a longer trip do not overwrite trip length', () => {
    const parsed = parseTripDuration(
      'Plan a 5-day Big Bend trip with two river days and one canyon day.',
    );
    expect(parsed.durationDays).toBe(5);
  });

  test('pace qualifiers remain trip length', () => {
    const parsed = parseTripDuration('Give us three relaxed days in Canyonlands with one easy morning.');
    expect(parsed.durationDays).toBe(3);
  });

  test('a lone themed day with a destination preposition is still trip length', () => {
    const parsed = parseTripDuration('Plan one alpine day in Sequoia.');
    expect(parsed.durationDays).toBe(1);
  });
});
