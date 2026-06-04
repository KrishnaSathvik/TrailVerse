'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import TestimonialForm from '@/components/testimonials/TestimonialForm';
import { logEvent } from '@/utils/analytics';

export default function TestimonialSubmitSection() {
  const { showToast } = useToast();
  const [formKey, setFormKey] = useState(0);

  const handleSubmitSuccess = () => {
    logEvent('Testimonial', 'submit_success', 'public_page');
    setFormKey((k) => k + 1);
    showToast(
      'Thank you! Your review will be checked before it appears on this page.',
      'success'
    );
  };

  return (
    <section id="submit-testimonial" className="py-12 sm:py-16 scroll-mt-24">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold mb-2 text-center" style={{ color: 'var(--text-primary)' }}>
          Leave a review
        </h2>
        <p className="text-center text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Name, star rating, and a short write-up — that&apos;s all we need.
        </p>
        <TestimonialForm key={formKey} onSuccess={handleSubmitSuccess} resetOnSuccess />
        <p className="text-center text-sm mt-6" style={{ color: 'var(--text-tertiary)' }}>
          Have an account? You can also manage reviews from your{' '}
          <a href="/profile" className="underline" style={{ color: 'var(--primary)' }}>
            profile
          </a>
          .
        </p>
      </div>
    </section>
  );
}
