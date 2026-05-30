"use client";

import React, { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import TestimonialsSection from '@/components/testimonials/TestimonialsSection';
import TestimonialForm from '@/components/testimonials/TestimonialForm';
import {
  TESTIMONIALS_PAGE_INTRO,
  TESTIMONIALS_SECTION_SUBTITLE,
  TESTIMONIALS_SECTION_TITLE
} from '@/components/testimonials/testimonialsCopy';
import { logEvent } from '@/utils/analytics';

const TestimonialsPage = () => {
  const { showToast } = useToast();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleSubmitSuccess = () => {
    logEvent('Testimonial', 'submit_success', 'public_page');
    setRefreshTrigger((n) => n + 1);
    showToast('Thank you! Your review will be checked before it appears on this page.', 'success');
  };

  return (
    <>
      <section className="pt-8 sm:pt-20 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
            {TESTIMONIALS_SECTION_TITLE}
          </h1>
          <p className="text-xl max-w-3xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
            {TESTIMONIALS_SECTION_SUBTITLE} {TESTIMONIALS_PAGE_INTRO}
          </p>
        </div>
      </section>

      <TestimonialsSection
        limit={20}
        showTitle={false}
        refreshTrigger={refreshTrigger}
        showEmptyMessage
      />

      <section id="submit-testimonial" className="py-12 sm:py-16 scroll-mt-24">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold mb-2 text-center" style={{ color: 'var(--text-primary)' }}>
            Leave a review
          </h2>
          <p className="text-center text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            Name, star rating, and a short write-up — that&apos;s all we need.
          </p>
          <TestimonialForm onSuccess={handleSubmitSuccess} resetOnSuccess />
          <p className="text-center text-sm mt-6" style={{ color: 'var(--text-tertiary)' }}>
            Have an account? You can also manage reviews from your{' '}
            <a href="/profile" className="underline" style={{ color: 'var(--primary)' }}>
              profile
            </a>
            .
          </p>
        </div>
      </section>
    </>
  );
};

export default TestimonialsPage;
