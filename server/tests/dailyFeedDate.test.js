const {
  getFeedDateKey,
  shiftFeedDate,
  isPastFeedWindowStart,
  wasGeneratedAfterFeedWindow,
  shouldGenerateFeed,
  isScheduledGenerationMinute,
} = require('../src/utils/dailyFeedDate');

describe('dailyFeedDate', () => {
  test('before 7 AM Chicago uses previous calendar day', () => {
    // 6:30 AM CDT on May 29, 2026
    const early = new Date('2026-05-29T11:30:00.000Z');
    expect(getFeedDateKey(early)).toBe('2026-05-28');
    expect(isPastFeedWindowStart(early)).toBe(false);
  });

  test('at/after 7 AM Chicago uses same calendar day', () => {
    // 7:15 AM CDT on May 29, 2026
    const afterWindow = new Date('2026-05-29T12:15:00.000Z');
    expect(getFeedDateKey(afterWindow)).toBe('2026-05-29');
    expect(isPastFeedWindowStart(afterWindow)).toBe(true);
  });

  test('scheduler fires only at 7:00 AM Chicago', () => {
    const atSeven = new Date('2026-05-29T12:00:00.000Z');
    const atSevenOne = new Date('2026-05-29T12:01:00.000Z');
    expect(isScheduledGenerationMinute(atSeven)).toBe(true);
    expect(isScheduledGenerationMinute(atSevenOne)).toBe(false);
  });

  test('shiftFeedDate moves by calendar days', () => {
    expect(shiftFeedDate('2026-05-29', -1)).toBe('2026-05-28');
    expect(shiftFeedDate('2026-05-29', 1)).toBe('2026-05-30');
  });

  test('shouldGenerateFeed waits until 7 AM window for fresh feed', () => {
    const feedDate = '2026-05-29';
    const midnightFeed = {
      date: feedDate,
      parkOfDay: { parkCode: 'yose' },
      natureFact: 'Fact',
      updatedAt: new Date('2026-05-29T05:00:00.000Z'), // midnight Chicago
    };

    const beforeSeven = new Date('2026-05-29T11:30:00.000Z');
    expect(shouldGenerateFeed({ feedDoc: midnightFeed, feedDate, now: beforeSeven })).toBe(false);

    const afterSeven = new Date('2026-05-29T12:15:00.000Z');
    expect(shouldGenerateFeed({ feedDoc: midnightFeed, feedDate, now: afterSeven })).toBe(true);
  });

  test('wasGeneratedAfterFeedWindow recognizes post-7 AM generation', () => {
    const feedDate = '2026-05-29';
    const doc = { updatedAt: new Date('2026-05-29T12:05:00.000Z') };
    expect(wasGeneratedAfterFeedWindow(doc, feedDate)).toBe(true);
  });
});
