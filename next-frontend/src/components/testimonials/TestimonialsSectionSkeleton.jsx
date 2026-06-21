import {
  TESTIMONIALS_SECTION_SUBTITLE,
  TESTIMONIALS_SECTION_TITLE,
} from './testimonialsCopy';
import { LANDING_SECTION, LANDING_SECTION_HEADER_MB } from '@/lib/landingLayout';

export default function TestimonialsSectionSkeleton({ showTitle = true }) {
  const cardSkeleton = (
    <div
      className="animate-pulse rounded-2xl p-6 backdrop-blur"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
      }}
    >
      <div className="mb-4 h-4 w-24 rounded bg-gray-300" />
      <div className="mb-4 h-4 rounded bg-gray-300" />
      <div className="mb-4 h-4 rounded bg-gray-300" />
      <div className="mb-6 h-4 w-3/4 rounded bg-gray-300" />
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-gray-300" />
        <div className="h-4 w-24 rounded bg-gray-300" />
      </div>
    </div>
  );

  return (
    <div className={LANDING_SECTION} aria-hidden="true">
      <div className="max-w-[92rem] mx-auto">
        {showTitle ? (
          <div className={`text-center ${LANDING_SECTION_HEADER_MB}`}>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              {TESTIMONIALS_SECTION_TITLE}
            </h2>
            <p className="text-base sm:text-lg max-w-2xl mx-auto px-1" style={{ color: 'var(--text-secondary)' }}>
              {TESTIMONIALS_SECTION_SUBTITLE}
            </p>
          </div>
        ) : null}
        <div className="hidden md:grid md:grid-cols-3 gap-8">{cardSkeleton}</div>
        <div className="md:hidden flex flex-col gap-4">{cardSkeleton}</div>
      </div>
    </div>
  );
}
