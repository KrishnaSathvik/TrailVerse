import { describe, expect, it } from 'vitest';
import { getSharedDayHeading } from '../sharedTripFormat';

describe('getSharedDayHeading', () => {
  it('removes decorative separators from a day label', () => {
    expect(getSharedDayHeading({ label: 'Day 1 · Virgin River & Watchman views' }, 0)).toEqual({
      badge: 'Day 1',
      title: 'Virgin River & Watchman views',
    });
  });

  it.each([
    [{ dayNumber: 1, label: 'Day 1 · Forest' }, 0, { badge: 'Day 1', title: 'Forest' }],
    [{ dayNumber: 2, label: 'Day 2 · Coast' }, 0, { badge: 'Day 2', title: 'Coast' }],
    [{ dayNumber: 3, label: 'Day 3 · Ridge' }, 0, { badge: 'Day 3', title: 'Ridge' }],
    [{ label: 'Legacy forest day' }, 1, { badge: 'Day 2', title: 'Legacy forest day' }],
  ])('prefers canonical day identity and falls back to array position only when absent', (day, index, expected) => {
    expect(getSharedDayHeading(day, index)).toEqual(expected);
  });

  it.each([
    [[1, 2, 3], ['Day 1', 'Day 2', 'Day 3']],
    [[2], ['Day 2']],
    [[2, 3], ['Day 2', 'Day 3']],
    [[3], ['Day 3']],
  ])('keeps canonical identities for complete and filtered day arrays', (dayNumbers, expected) => {
    const headings = dayNumbers
      .map((dayNumber) => ({ dayNumber, label: `Day ${dayNumber} · Plan` }))
      .map(getSharedDayHeading);

    expect(headings.map(({ badge }) => badge)).toEqual(expected);
  });
});
