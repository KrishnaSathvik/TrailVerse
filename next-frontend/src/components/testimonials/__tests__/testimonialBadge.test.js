import { describe, expect, it } from 'vitest';
import { getTestimonialBadge } from '../testimonialBadge';

describe('getTestimonialBadge', () => {
  it('returns press badge for press source', () => {
    expect(getTestimonialBadge({ source: 'press', featured: true })).toEqual({
      label: 'Press mention',
      variant: 'muted',
      showAward: false,
    });
  });

  it('returns social badge for social-media source', () => {
    expect(getTestimonialBadge({ source: 'social-media', featured: true })).toEqual({
      label: 'Social mention',
      variant: 'muted',
      showAward: false,
    });
  });

  it('returns featured badge only when not press or social', () => {
    expect(getTestimonialBadge({ source: 'user-submission', featured: true })).toEqual({
      label: 'Featured',
      variant: 'primary',
      showAward: true,
    });
  });

  it('returns null for non-featured community reviews', () => {
    expect(getTestimonialBadge({ source: 'user-submission', featured: false })).toBeNull();
  });
});
