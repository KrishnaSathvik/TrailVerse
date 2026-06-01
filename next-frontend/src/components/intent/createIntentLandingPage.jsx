import { notFound } from 'next/navigation';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import IntentLandingClient from '@/components/intent/IntentLandingClient';
import {
  getIntentLandingByPath,
  getIntentLandingCanonicalUrl,
} from '@/data/intentLandings';
import { fetchIntentLandingParks } from '@/lib/intentLandingApi';
import { parkToSlug } from '@/utils/parkSlug';

/**
 * @param {string} path — e.g. /parks-for-couples
 */
export function createIntentLandingPageExports(path) {
  async function generateMetadata() {
    const landing = getIntentLandingByPath(path);
    if (!landing) return { title: 'Not Found | TrailVerse' };

    const canonical = getIntentLandingCanonicalUrl(landing);

    return {
      title: landing.metadataTitle,
      description: landing.metaDescription,
      alternates: { canonical },
      openGraph: {
        title: landing.metadataTitle,
        description: landing.metaDescription,
        url: canonical,
        siteName: 'TrailVerse',
        type: 'website',
      },
      twitter: {
        card: 'summary',
        title: landing.metadataTitle,
        description: landing.metaDescription,
      },
    };
  }

  function buildCollectionSchema(landing, parks) {
    return {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: landing.title,
      description: landing.metaDescription,
      url: getIntentLandingCanonicalUrl(landing),
      dateModified: landing.updatedAt,
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: parks.length,
        itemListElement: parks.slice(0, 12).map((park, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: park.fullName,
          url: `https://www.nationalparksexplorerusa.com/parks/${parkToSlug(park.fullName)}`,
        })),
      },
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

    const { parks } = await fetchIntentLandingParks(landing);
    const collectionSchema = buildCollectionSchema(landing, parks);
    const faqSchema = buildFaqSchema(landing);

    return (
      <>
        <script type="application/ld+json">{JSON.stringify(collectionSchema)}</script>
        {faqSchema && (
          <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        )}
        <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <Header />
          <main>
            <IntentLandingClient
              landing={landing}
              parks={parks}
              canonicalUrl={getIntentLandingCanonicalUrl(landing)}
            />
          </main>
          <Footer />
        </div>
      </>
    );
  }

  return { generateMetadata, default: IntentLandingPage };
}
