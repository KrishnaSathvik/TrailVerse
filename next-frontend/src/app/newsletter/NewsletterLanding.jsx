import { Suspense } from 'react';
import IconGlyph from '@/components/common/IconGlyph';
import { NEWSLETTER_BENEFITS } from '@/lib/newsletterLanding';
import NewsletterSignupSlot from './NewsletterSignupSlot';
import NewsletterSampleIssue from './NewsletterSampleIssue';

export default function NewsletterLanding() {
  return (
    <>
      <section className="pt-3 pb-16 px-4 sm:pt-8 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div
            className="rounded-3xl overflow-hidden backdrop-blur"
            style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}
          >
            <div className="p-8 sm:p-12">
              <div className="text-center max-w-2xl mx-auto">
                <div
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-6"
                  style={{
                    backgroundColor: 'var(--surface-hover)',
                    borderWidth: '1px',
                    borderColor: 'var(--border)',
                  }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--accent-green)' }} />
                  <span
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Newsletter
                  </span>
                </div>

                <h1
                  className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-3"
                  style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
                >
                  Where Next?
                </h1>
                <p
                  className="text-xl sm:text-2xl font-semibold mb-6"
                  style={{ color: 'var(--text-primary)' }}
                >
                  One place worth going. Every week.
                </p>
                <p className="text-lg leading-relaxed mb-10" style={{ color: 'var(--text-secondary)' }}>
                  Seasonal destinations, important planning changes, what to avoid, and a ready-to-use trip
                  idea from TrailVerse.
                </p>
              </div>

              <div className="max-w-2xl mx-auto">
                <Suspense fallback={null}>
                  <NewsletterSignupSlot />
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
              What you&apos;ll get
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {NEWSLETTER_BENEFITS.map((benefit) => (
              <div
                key={benefit.title}
                className="rounded-2xl p-6 backdrop-blur"
                style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
                  style={{ backgroundColor: 'var(--accent-green)' }}
                >
                  <IconGlyph name={benefit.icon} className="h-6 w-6 text-white" />
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
