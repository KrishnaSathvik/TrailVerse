import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import IconGlyph from '@/components/common/IconGlyph';
import NewsletterWidget from '@/components/blog/NewsletterWidget';

export const metadata = {
  title: 'Newsletter — Trail Stories, Park Guides & Trip Ideas',
  description:
    'Subscribe to the TrailVerse newsletter for national park guides, trip planning ideas, blog highlights, and seasonal travel tips — delivered to your inbox.',
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/newsletter',
  },
  openGraph: {
    title: 'Newsletter — TrailVerse National Parks',
    description:
      'Subscribe to the TrailVerse newsletter for national park guides, trip planning ideas, blog highlights, and seasonal travel tips.',
    url: 'https://www.nationalparksexplorerusa.com/newsletter',
    siteName: 'TrailVerse',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse Newsletter' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Newsletter — TrailVerse National Parks',
    description:
      'Subscribe to the TrailVerse newsletter for national park guides, trip planning ideas, and seasonal travel tips.',
    images: ['/og-image-trailverse.jpg'],
  },
};

const benefits = [
  {
    icon: 'Mountain',
    title: 'Park Guides',
    description: 'In-depth guides for national parks with insider tips, best trails, and seasonal highlights.',
  },
  {
    icon: 'MapPin',
    title: 'Trip Ideas',
    description: 'Curated itineraries and road trip routes to inspire your next outdoor adventure.',
  },
  {
    icon: 'BookOpen',
    title: 'Blog Highlights',
    description: 'The best new articles, community stories, and travel photography from TrailVerse.',
  },
  {
    icon: 'Shield',
    title: 'No Spam, Ever',
    description: 'Only quality content, sent occasionally. Unsubscribe with one click anytime.',
  },
];

export default function NewsletterPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />

      <main>
        {/* Hero */}
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
                    className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Trail stories in your inbox
                  </h1>
                  <p className="text-lg leading-relaxed mb-10" style={{ color: 'var(--text-secondary)' }}>
                    Get national park guides, trip planning ideas, and blog highlights delivered straight to you —
                    written by a traveler who has explored 17+ parks across 23 states.
                  </p>
                </div>

                <div className="max-w-2xl mx-auto">
                  <NewsletterWidget source="newsletter-page" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* What you'll get */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
                What you&apos;ll get
              </h2>
              <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
                Practical content for people who love parks and outdoor travel.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {benefits.map((benefit) => (
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
      </main>

      <Footer />
    </div>
  );
}
