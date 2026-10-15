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
    <section id="submit-testimonial" className="info-section scroll-mt-24 border-t" style={{ borderColor: 'var(--border)' }}>
      <div className="public-content">
        <h2 className="text-2xl font-bold mb-2 text-left" style={{ color: 'var(--text-primary)' }}>
          Have a TrailVerse story to share?
        </h2>
        <p className="text-left text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Name, star rating, and a short write-up — that&apos;s all we need.
        </p>
        <details className="group">
          <summary style={{ display: 'flex' }} className="public-action public-action-secondary w-fit cursor-pointer list-none px-5 font-semibold">
            Share your story
          </summary>
          <div className="mt-6">
            <TestimonialForm key={formKey} onSuccess={handleSubmitSuccess} resetOnSuccess />
          </div>
        </details>
        <p className="text-left text-sm mt-6" style={{ color: 'var(--text-tertiary)' }}>
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
