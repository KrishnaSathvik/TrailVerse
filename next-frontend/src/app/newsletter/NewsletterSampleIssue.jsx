import Link from 'next/link';
import { SAMPLE_TRAILIE_HREF } from '@/lib/newsletterLanding';

export default function NewsletterSampleIssue() {
  return (
    <section className="info-section" aria-labelledby="sample-issue-heading">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h2
            id="sample-issue-heading"
            className="text-3xl sm:text-4xl font-bold mb-4"
            style={{ color: 'var(--text-primary)' }}
          >
            See what an issue looks like
          </h2>
        </div>

        <article
          className="info-panel"
          style={{ backgroundColor: 'var(--surface)', borderWidth: '1px', borderColor: 'var(--border)' }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-4"
            style={{ color: 'var(--text-secondary)' }}
          >
            Where Next? · Sample issue
          </p>
          <h3 className="text-2xl sm:text-3xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
            Glacier after Labor Day
          </h3>

          <div className="space-y-6 text-sm sm:text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            <section>
              <h4 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Why now</h4>
              <p>
                Shoulder season is when Glacier often feels more spacious: cooler mornings, fewer midday crowds on
                the Going-to-the-Sun corridor, and a better chance to move at a human pace. This preview is
                illustrative — always check current park alerts before you go.
              </p>
            </section>

            <section>
              <h4 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Before you go</h4>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <li>Shuttles</li>
                <li>Parking</li>
                <li>Weather</li>
                <li>Crowds</li>
              </ul>
            </section>

            <section>
              <h4 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>The 3-day version</h4>
              <dl className="space-y-3">
                <div>
                  <dt className="font-semibold" style={{ color: 'var(--text-primary)' }}>Friday</dt>
                  <dd>Arrival and a scenic drive to get oriented.</dd>
                </div>
                <div>
                  <dt className="font-semibold" style={{ color: 'var(--text-primary)' }}>Saturday</dt>
                  <dd>Main hike / destination day.</dd>
                </div>
                <div>
                  <dt className="font-semibold" style={{ color: 'var(--text-primary)' }}>Sunday</dt>
                  <dd>Quieter side of the park.</dd>
                </div>
              </dl>
            </section>
          </div>

          <div className="mt-8">
            <Link
              href={SAMPLE_TRAILIE_HREF}
              className="inline-flex items-center font-semibold focus-visible:ring-2 focus-visible:ring-[var(--accent-green)] rounded-sm"
              style={{ color: 'var(--accent-green)' }}
            >
              Plan it with Trailie →
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}
