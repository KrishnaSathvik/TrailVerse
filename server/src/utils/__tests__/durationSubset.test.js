'use strict';

const { parseTripDuration } = require('../durationSemantics');

test.each([
  'My parents are joining us for the last two days.',
  'Make the first three days easier.',
  'Keep the remaining two nights flexible.',
])('a trip subset does not overwrite its duration: %s', text => {
  expect(parseTripDuration(text).durationDays).toBeNull();
});

test('an explicit total survives a later subset and ordinary counts still work', () => {
  expect(parseTripDuration('Four days in Zion; parents join for the last two days.').durationDays).toBe(4);
  expect(parseTripDuration('Our trip lasts two days.').durationDays).toBe(2);
  expect(parseTripDuration('We have three relaxed days.').durationDays).toBe(3);
});
