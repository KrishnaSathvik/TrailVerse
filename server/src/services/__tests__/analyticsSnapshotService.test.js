const { utcDayBounds, utcMonthBounds } = require('../analyticsSnapshotService');

describe('analyticsSnapshotService period keys', () => {
  test('utcDayBounds uses UTC calendar date', () => {
    const { periodKey, start, end } = utcDayBounds(new Date('2026-08-27T15:00:00Z'));
    expect(periodKey).toBe('2026-08-27');
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  test('utcMonthBounds uses YYYY-MM', () => {
    const { periodKey } = utcMonthBounds(new Date('2026-08-27T15:00:00Z'));
    expect(periodKey).toBe('2026-08');
  });
});
