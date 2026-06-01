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

        <main>
          <section className="pt-6 pb-10 sm:pt-8 sm:pb-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto text-center">
              <p
                className="text-xs font-semibold uppercase tracking-wider mb-4"
                style={{ color: 'var(--accent-green)' }}
              >
                Planning guides
              </p>
              <h1
                className="text-4xl sm:text-5xl font-bold tracking-tight mb-6"
                style={{ color: 'var(--text-primary)' }}
              >
                National Park Planning Guides
              </h1>
              <p
                className="text-lg sm:text-xl leading-relaxed max-w-3xl mx-auto text-pretty"
                style={{ color: 'var(--text-secondary)' }}
              >
                Still sorting out how to plan? Read the articles on tools, reservations, maps, and
                AI planning. Already know the trip you want—couples, fall color, quiet weekends, kids,
                dogs? Open a list under Parks by vibe: a short answer up top, eight parks we spell out,
                then a ranked grid with a line on why each one fits.
              </p>
            </div>
          </section>

          <section className="pb-10 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                Planning &amp; tools
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {GUIDES.map((guide) => (
                  <GuideCard key={guide.slug} guide={guide} />
                ))}
              </div>
            </div>
          </section>

          <section className="pb-16 sm:pb-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                Parks by vibe
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
