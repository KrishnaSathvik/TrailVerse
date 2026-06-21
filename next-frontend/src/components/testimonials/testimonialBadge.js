/**
 * Single source of truth for testimonial badge labels/styles.
 * Used by client carousel cards and any server-rendered lists.
 *
 * @param {{ source?: string; featured?: boolean }} testimonial
 * @returns {{ label: string; variant: 'muted' | 'primary'; showAward: boolean } | null}
 */
export function getTestimonialBadge(testimonial) {
  const source = testimonial?.source;

  if (source === 'press') {
    return { label: 'Press mention', variant: 'muted', showAward: false };
  }

  if (source === 'social-media') {
    return { label: 'Social mention', variant: 'muted', showAward: false };
  }

  if (testimonial?.featured) {
    return { label: 'Featured', variant: 'primary', showAward: true };
  }

  return null;
}
