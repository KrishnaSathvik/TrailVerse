import { Award } from '@components/icons';
import { getTestimonialBadge } from './testimonialBadge';

export default function TestimonialBadge({ testimonial }) {
  const badge = getTestimonialBadge(testimonial);
  if (!badge) return null;

  const isPrimary = badge.variant === 'primary';

  return (
    <div
      className="mt-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs"
      style={
        isPrimary
          ? { backgroundColor: 'var(--primary)', color: 'white' }
          : {
              backgroundColor: 'var(--surface-hover)',
              borderWidth: '1px',
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
            }
      }
    >
      {badge.showAward ? <Award className="h-3 w-3" /> : null}
      {badge.label}
    </div>
  );
}
