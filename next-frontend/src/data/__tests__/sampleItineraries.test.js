/**
 * Sample itineraries are prompt starters backed by real captured share pages —
 * never a second demo system. Every entry must therefore carry a prompt that
 * can be replayed through live Trailie.
 */
import { describe, expect, it } from 'vitest';
import { SAMPLE_ITINERARIES, getSampleItineraryHref } from '../sampleItineraries';

describe('sample itineraries', () => {
  it('gives every entry a replayable prompt', () => {
    for (const item of SAMPLE_ITINERARIES) {
      expect({ slug: item.slug, hasPrompt: Boolean(item.prompt?.trim()) }).toEqual({
        slug: item.slug,
        hasPrompt: true,
      });
    }
  });

  it('keeps captured share pages as the gallery destination', () => {
    const withShare = SAMPLE_ITINERARIES.find((item) => item.shareId);
    expect(getSampleItineraryHref(withShare)).toBe(
      `/plan-ai/shared/${withShare.shareId}?from=/itineraries`
    );
  });

  it('falls back to the live planner carrying the prompt, not an empty planner', () => {
    const href = getSampleItineraryHref({ prompt: 'Plan a 3-day Zion trip' });
    expect(href).toBe('/plan-ai?entry=new-trip&ask=Plan%20a%203-day%20Zion%20trip');
  });

  it('still degrades to a bare planner link with nothing to ask', () => {
    expect(getSampleItineraryHref({})).toBe('/plan-ai');
    expect(getSampleItineraryHref(null)).toBe('/plan-ai');
  });
});
