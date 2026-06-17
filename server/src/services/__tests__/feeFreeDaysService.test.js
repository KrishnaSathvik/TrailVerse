const { getFeeFreeInfo } = require('../feeFreeDaysService');

describe('getFeeFreeInfo', () => {
  const octItinerary =
    'Plan a 3-day Arches and Canyonlands road trip from Salt Lake City in October for two moderate hikers.';

  test('month-only message does not claim trip overlap', () => {
    expect(getFeeFreeInfo(octItinerary)).toBeNull();
  });

  test('formData Oct 10-12 does not overlap Theodore Roosevelt fee-free day (Oct 27)', () => {
    expect(
      getFeeFreeInfo(octItinerary, { startDate: '2026-10-10', endDate: '2026-10-12' })
    ).toBeNull();
  });

  test('formData spanning July 4 weekend overlaps Independence Day fee-free days', () => {
    const result = getFeeFreeInfo('Yellowstone trip', {
      startDate: '2026-07-03',
      endDate: '2026-07-05',
    });
    expect(result?.hasOverlap).toBe(true);
    expect(result?.days.some((d) => d.label.includes('Independence'))).toBe(true);
  });

  test('explicit October 27 in message overlaps Theodore Roosevelt day', () => {
    const result = getFeeFreeInfo('Visiting parks on October 27, 2026');
    expect(result?.hasOverlap).toBe(true);
    expect(result?.days.some((d) => /Theodore Roosevelt/i.test(d.label))).toBe(true);
  });

  test('fee keyword queries still return upcoming fee-free days', () => {
    const result = getFeeFreeInfo('Are there any fee-free entrance days this year?');
    expect(result?.hasOverlap).toBe(true);
    expect(result?.days.length).toBeGreaterThan(0);
  });
});
