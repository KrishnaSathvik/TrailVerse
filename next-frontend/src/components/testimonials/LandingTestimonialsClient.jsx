'use client';

import dynamic from 'next/dynamic';
import TestimonialsSectionSkeleton from './TestimonialsSectionSkeleton';

const TestimonialsSection = dynamic(
  () => import('./TestimonialsSection'),
  {
    ssr: false,
    loading: () => <TestimonialsSectionSkeleton />,
  }
);

export default function LandingTestimonialsClient({ initialTestimonials, limit = 3 }) {
  return (
    <TestimonialsSection
      limit={limit}
      initialTestimonials={initialTestimonials}
    />
  );
}
