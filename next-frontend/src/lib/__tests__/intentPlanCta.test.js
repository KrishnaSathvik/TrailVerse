import { getAllIntentLandingPaths } from '@/data/intentLandings';
import { getIntentPlanCta, INTENT_PLAN_CTAS } from '@/lib/intentPlanCta';

describe('intentPlanCta', () => {
  test('every vibe guide has personalized CTA copy', () => {
    for (const path of getAllIntentLandingPaths()) {
      expect(INTENT_PLAN_CTAS[path]).toBeDefined();
      expect(INTENT_PLAN_CTAS[path].title.length).toBeGreaterThan(5);
      expect(INTENT_PLAN_CTAS[path].planLabel).toMatch(/Trailie|trip/i);
    }
  });

  test('getIntentPlanCta returns configured copy for couples', () => {
    const cta = getIntentPlanCta({ path: '/parks-for-couples' });
    expect(cta.title).toBe('Plan a romantic park getaway');
    expect(cta.planLabel).toBe('Plan couples trip with Trailie');
  });

  test('getIntentPlanCta falls back to quickAnswer for unknown paths', () => {
    const cta = getIntentPlanCta({ path: '/unknown', quickAnswer: 'Custom quick answer.' });
    expect(cta.body).toBe('Custom quick answer.');
  });
});
