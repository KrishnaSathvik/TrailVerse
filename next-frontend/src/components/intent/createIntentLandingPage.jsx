import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import IntentLandingClient from '@/components/intent/IntentLandingClient';
import IntentLandingParksSection from '@/components/intent/IntentLandingParksSection';
import IntentTopMatchesSkeleton from '@/components/intent/IntentTopMatchesSkeleton';
import {
  getIntentLandingByPath,
  getIntentLandingCanonicalUrl,
} from '@/data/intentLandings';
import { canonicalPageMetadata } from '@/lib/seo';

/**
 * @param {string} path — e.g. /parks-for-couples
 */
export function createIntentLandingPageExports(path) {
  async function generateMetadata({ searchParams }) {
    const landing = getIntentLandingByPath(path);
    if (!landing) return { title: 'Not Found | TrailVerse' };

    const canonical = getIntentLandingCanonicalUrl(landing);
    const params = searchParams ? await searchParams : undefined;

    return {
      title: landing.metadataTitle,
      description: landing.metaDescription,
      openGraph: {
        title: landing.metadataTitle,
        description: landing.metaDescription,
        url: canonical,
        siteName: 'TrailVerse',
        type: 'website',
        images: [{ url: '/og/guides.jpg', width: 1200, height: 630, alt: landing.metadataTitle }],
      },
      twitter: {
        card: 'summary_large_image',
        title: landing.metadataTitle,
        description: landing.metaDescription,
        images: ['/og/guides.jpg'],
      },
      ...canonicalPageMetadata(path, params),
    };
  }

  function buildFaqSchema(landing) {
    if (!landing.faq?.length) return null;
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: landing.faq.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.a,
        },
      })),
    };
  }

  async function IntentLandingPage() {
    const landing = getIntentLandingByPath(path);
    if (!landing) notFound();

    const faqSchema = buildFaqSchema(landing);

    return (
      <>
        {faqSchema && (
          <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        )}
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <Header />
          <main>
            <Suspense
              fallback={
                <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
                  <IntentTopMatchesSkeleton />
                </div>
              }
            >
              <IntentLandingClient
                landing={landing}
                canonicalUrl={getIntentLandingCanonicalUrl(landing)}
              >
                <Suspense fallback={<IntentTopMatchesSkeleton />}>
                  <IntentLandingParksSection landing={landing} />
                </Suspense>
              </IntentLandingClient>
            </Suspense>
          </main>
          <Footer />
        </div>
      </>
    );
  }

  return { generateMetadata, default: IntentLandingPage };
}
