'use strict';

const { parseTripDatesFromMessage, resolveAstroWindow } = require('../tripDateParser');

describe('tripDateParser', () => {
  const ref = new Date('2026-06-21T12:00:00');

  test('parses July first week from trailing phrase', () => {
    const parsed = parseTripDatesFromMessage(
      'can I shoot astrophotography in Sierraville, CA? like July First week?',
      ref
    );
    expect(parsed).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-07',
      numDays: 7,
      label: 'First week of July 2026',
    });
  });

  test('parses first week of month form', () => {
    const parsed = parseTripDatesFromMessage('stargazing first week of August', ref);
    expect(parsed?.startDate).toBe('2026-08-01');
    expect(parsed?.endDate).toBe('2026-08-07');
  });

  test('resolveAstroWindow prefers structured trip dates', () => {
    const window = resolveAstroWindow(
      { startDate: '2026-09-10', endDate: '2026-09-12' },
      'ignored message',
      ref
    );
    expect(window.startDate).toBe('2026-09-10');
    expect(window.endDate).toBe('2026-09-12');
  });
});
