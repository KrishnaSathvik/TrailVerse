import InfoPageHeader from '@/components/info/InfoPageHeader';
import { Suspense } from 'react';
import IconGlyph from '@/components/common/IconGlyph';
import { NEWSLETTER_BENEFITS } from '@/lib/newsletterLanding';
import NewsletterSignupSlot from './NewsletterSignupSlot';
import NewsletterSampleIssue from './NewsletterSampleIssue';

export default function NewsletterLanding() {
  return (
    <>
      <InfoPageHeader title="Where Next?" description="One place worth going. Every week.">
        <p className="text-[var(--text-secondary)]">Seasonal destinations, important planning changes, what to avoid, and a ready-to-use trip idea from TrailVerse.</p>
      </InfoPageHeader>
      <section className="info-section" aria-label="Newsletter signup">
        <div className="public-form lg:!mx-0">
          <Suspense fallback={null}><NewsletterSignupSlot /></Suspense>
        </div>
      </section>

      <section className="info-section">
        <div className="w-full">
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
              What you&apos;ll get
            </h2>
          </div>

          <div className="info-card-grid">
            {NEWSLETTER_BENEFITS.map((benefit) => (
              <div
                key={benefit.title}
                className="public-editorial-section py-6 h-full"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="info-icon">
                  <IconGlyph name={benefit.icon} className="h-6 w-6 text-current" />
                </div>
                <h3 className="text-xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                  {benefit.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <NewsletterSampleIssue />
    </>
  );
}
