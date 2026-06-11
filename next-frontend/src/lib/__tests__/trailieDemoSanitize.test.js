import { describe, expect, it } from 'vitest';
import {
  ANONYMOUS_WEB_UPSELL_SUFFIX,
  sanitizeTrailieDemoAnswer,
  withDemoGuestUpsellInBubble,
} from '../trailieDemoSanitize';

describe('sanitizeTrailieDemoAnswer', () => {
  it('removes anonymous web-search upsell footer by default', () => {
    const input =
      'Great hikes.\n\n---\n\n🔍 **Want live prices and ratings?** Sign up free to unlock live web search.';
    expect(sanitizeTrailieDemoAnswer(input)).toBe('Great hikes.');
  });

  it('preserves upsell when requested (guest replay matches /plan-ai)', () => {
    const input =
      'Great hikes.\n\n---\n\n🔍 **Want live prices and ratings?** Sign up free to unlock live web search.';
    expect(sanitizeTrailieDemoAnswer(input, { preserveWebUpsell: true })).toBe(input);
  });

  it('appends upsell inside bubble for guest demo scenario', () => {
    expect(withDemoGuestUpsellInBubble('Eat in town.', { showsGuestUpsell: true })).toBe(
      `Eat in town.${ANONYMOUS_WEB_UPSELL_SUFFIX}`
    );
  });

  it('removes nps.gov deferral when live data already answered', () => {
    const input =
      'The Narrows is open.\n\nOn mud conditions specifically, the live data doesn\'t have this week\'s specific mud levels. Your best bet: call the park directly at 435-772-3256 or check [nps.gov/zion/planyourvisit/conditions.htm](https://www.nps.gov/zion/planyourvisit/conditions.htm) for real-time updates.';
    expect(sanitizeTrailieDemoAnswer(input)).toBe('The Narrows is open.');
  });

  it('removes generic NPS alert footer block', () => {
    const input = `Dinner in Springdale.

---
📍 **Important — the following were not addressed above:**
**Active closures:**
- Critical Backcountry Updates/Closures

_Verify at [nps.gov](https://www.nps.gov) before your trip._`;
    expect(sanitizeTrailieDemoAnswer(input)).toBe('Dinner in Springdale.');
  });
});
