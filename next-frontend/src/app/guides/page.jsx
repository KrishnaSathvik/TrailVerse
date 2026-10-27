import InfoPageHeader from '@/components/info/InfoPageHeader';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import GuideCard from '@/components/guides/GuideCard';
import { GUIDES } from '@/data/guides';
import { INTENT_LANDINGS, getIntentLandingCanonicalUrl } from '@/data/intentLandings';

export const metadata = {
  title: 'National Park Planning Guides — Tools, Comparisons & AI Tips | TrailVerse',
    description:
      'Planning guides and ranked park picks — tool comparisons, ChatGPT tips, couples trips, wildlife, dark skies, families, winter, and more across 470+ NPS sites.',
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/guides',
  },
  openGraph: {
    title: 'National Park Planning Guides | TrailVerse',
    description:
      'Planning guides and ranked park picks for national park trips — tools, comparisons, and live search results.',
    url: 'https://www.nationalparksexplorerusa.com/guides',
    siteName: 'TrailVerse',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse — National park planning guides' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'National Park Planning Guides | TrailVerse',
    description:
      'Planning guides and ranked park picks for national park trips — tools, comparisons, and live search results.',
    images: ['/og-image-trailverse.jpg'],
  },
};

const collectionSchema = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'National Park Planning Guides — TrailVerse',
  description:
    'Index of TrailVerse planning articles and ranked park lists by trip type.',
  url: 'https://www.nationalparksexplorerusa.com/guides',
  hasPart: [
    ...GUIDES.map((guide) => ({
      '@type': 'Article',
      headline: guide.title,
      url: `https://www.nationalparksexplorerusa.com/guides/${guide.slug}`,
      dateModified: guide.updatedAt,
    })),
    ...INTENT_LANDINGS.map((landing) => ({
      '@type': 'CollectionPage',
      name: landing.title,
      url: getIntentLandingCanonicalUrl(landing),
      dateModified: landing.updatedAt,
    })),
  ],
};

export default function GuidesHubPage() {
  return (
    <>
      <script type="application/ld+json">{JSON.stringify(collectionSchema)}</script>
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />

        <main className="info-page">
          <InfoPageHeader eyebrow="Planning Guides" icon="BookOpen" iconColor="var(--icon-travel)" title="National Park Planning Guides" description={<>
                Still sorting out how to plan? Read the articles on tools, reservations, maps, and
                AI planning. Already know the trip you want—couples, fall color, quiet weekends, kids,
                dogs? Open a list under Parks by vibe: a short answer up top, eight parks we spell out,
                then a ranked grid with a line on why each one fits.
              </>} />

          <section className="info-section">
            <div className="w-full">
              <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                Planning &amp; tools
              </h2>
              <div className="info-card-grid">
                {GUIDES.map((guide) => (
                  <GuideCard key={guide.slug} guide={guide} />
                ))}
              </div>
            </div>
          </section>

          <section className="info-section">
            <div className="w-full">
              <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                Parks by vibe
              </h2>
              <div className="info-card-grid">
                {INTENT_LANDINGS.map((landing) => (
                  <GuideCard
                    key={landing.path}
                    guide={landing}
                    href={landing.path}
                    ctaLabel="See ranked parks →"
                  />
                ))}
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
}
