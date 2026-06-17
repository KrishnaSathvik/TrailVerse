import { buildDayByDayPlanFollowUp } from '@/lib/buildDayByDayPlanFollowUp';

describe('buildDayByDayPlanFollowUp', () => {
  test('uses primary park when available', () => {
    expect(
      buildDayByDayPlanFollowUp({ parkName: 'Rocky Mountain National Park' })
    ).toContain('Rocky Mountain National Park');
    expect(
      buildDayByDayPlanFollowUp({ parkName: 'Rocky Mountain National Park' })
    ).toContain('Ask me anything you still need');
  });

  test('falls back to generic top pick when no park metadata', () => {
    expect(buildDayByDayPlanFollowUp()).toContain('top recommendation');
  });
});
