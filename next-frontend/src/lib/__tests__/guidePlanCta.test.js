import { GUIDES } from '@/data/guides';
import { getGuidePlanCta, GUIDE_PLAN_CTAS } from '@/lib/guidePlanCta';

describe('guidePlanCta', () => {
  test('every editorial guide has personalized CTA copy', () => {
    for (const guide of GUIDES) {
      expect(GUIDE_PLAN_CTAS[guide.slug]).toBeDefined();
      expect(GUIDE_PLAN_CTAS[guide.slug].title.length).toBeGreaterThan(5);
      expect(GUIDE_PLAN_CTAS[guide.slug].planLabel).toMatch(/Trailie|trip/i);
    }
  });

  test('getGuidePlanCta returns configured copy for compare guide', () => {
    const cta = getGuidePlanCta({ slug: 'how-to-compare-national-parks-on-trailverse' });
    expect(cta.title).toBe('Compared your picks? Plan the winner');
    expect(cta.compareHref).toBe('/compare');
  });

  test('getGuidePlanCta falls back to quickAnswer for unknown slugs', () => {
    const cta = getGuidePlanCta({ slug: 'unknown', quickAnswer: 'Custom quick answer.' });
    expect(cta.body).toBe('Custom quick answer.');
  });
});
