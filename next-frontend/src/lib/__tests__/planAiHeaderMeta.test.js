import { describe, expect, it } from 'vitest';
import { derivePlanAiHeaderMeta, PLAN_AI_ENTRY } from '@/lib/planAiHeaderMeta';

describe('derivePlanAiHeaderMeta', () => {
  it('keeps a stable general title without Planning… subtitle', () => {
    const meta = derivePlanAiHeaderMeta({
      entryMode: PLAN_AI_ENTRY.GENERAL,
      hasUserMessages: false,
    });

    expect(meta.title).toBe('Outdoor trip planning');
    expect(meta.subtitle).toBeNull();
  });

  it('does not echo Planning in subtitle when a park is active', () => {
    const meta = derivePlanAiHeaderMeta({
      entryMode: PLAN_AI_ENTRY.GENERAL,
      hasUserMessages: true,
      resolvedParkName: 'Yosemite National Park',
    });

    expect(meta.title).toBe('Planning Yosemite');
    expect(meta.subtitle).toBeNull();
  });

  it('uses trip dates as subtitle when available', () => {
    const meta = derivePlanAiHeaderMeta({
      entryMode: PLAN_AI_ENTRY.PARK,
      parkName: 'Zion National Park',
      formData: { startDate: '2026-07-20', endDate: '2026-07-23' },
    });

    expect(meta.title).toBe('Planning Zion');
    expect(meta.subtitle).toMatch(/Jul/);
    expect(meta.subtitle).not.toMatch(/Planning/i);
  });

  it('keeps road-trip park hint instead of a Planning… status', () => {
    const meta = derivePlanAiHeaderMeta({
      entryMode: PLAN_AI_ENTRY.ROAD_TRIP,
      suggestText: 'Yosemite to Sequoia',
    });

    expect(meta.title).toBe("Let's plan a road trip");
    expect(meta.subtitle).toBe('Yosemite to Sequoia');
  });

  it('uses chat-history title without Planning… subtitle', () => {
    const meta = derivePlanAiHeaderMeta({
      entryMode: PLAN_AI_ENTRY.CHAT_HISTORY,
      resolvedParkName: 'Acadia National Park',
    });

    expect(meta.title).toBe('Planning Acadia');
    expect(meta.subtitle).toBeNull();
  });
});
