import Link from 'next/link';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import {
  SAMPLE_ITINERARIES,
  getSampleItineraryHref,
} from '@/data/sampleItineraries';
import { indexablePageRobots } from '@/lib/seo';
import {
  ARTICLE_DECK,
  ARTICLE_TITLE,
} from '@/lib/articleLayout';

export const metadata = {
  title: 'Trailie Sample Itineraries — AI National Park Trip Plans | TrailVerse',
  description:
    'Browse real Trailie-planned national park itineraries — Yellowstone, Glacier, Yosemite, Utah Mighty 5, Acadia, and more. Open any plan to see the day-by-day itinerary and chat.',
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/itineraries',
  },
  robots: indexablePageRobots,
  openGraph: {
    title: 'Trailie Sample Itineraries | TrailVerse',
    description:
      'Copy-ready national park trip plans created by Trailie — open any itinerary to see the full day-by-day plan and chat.',
    url: 'https://www.nationalparksexplorerusa.com/itineraries',
    siteName: 'TrailVerse',
    type: 'website',
    images: [{ url: '/og/itineraries.jpg', width: 1200, height: 630, alt: 'TrailVerse — Sample trips planned by Trailie' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trailie Sample Itineraries | TrailVerse',
    description:
      'Copy-ready national park trip plans created by Trailie — Yellowstone, Glacier, Yosemite, and more.',
    images: ['/og/itineraries.jpg'],
  },
};

const collectionSchema = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Trailie Sample Itineraries — TrailVerse',
  description:
    'Curated national park trip plans created by Trailie, with day-by-day itineraries and planning chat.',
  url: 'https://www.nationalparksexplorerusa.com/itineraries',
  hasPart: SAMPLE_ITINERARIES.filter((item) => item.shareId).map((item) => ({
    '@type': 'CreativeWork',
    name: item.title,
    description: item.excerpt,
    url: `https://www.nationalparksexplorerusa.com/plan-ai/shared/${item.shareId}`,
  })),
};

function ItineraryCard({ itinerary }) {
  const href = getSampleItineraryHref(itinerary);
  const ready = Boolean(itinerary.shareId);

  return (
    <Link
      href={href}
      className="group flex h-full min-w-0 flex-col rounded-2xl p-5 sm:p-6 lg:p-8 transition-all duration-300 hover:-translate-y-1"
      style={{
        backgroundColor: 'var(--surface)',
        borderWidth: '1px',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow)',
      }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 sm:mb-4">
        {itinerary.badge ? (
          <span
            className="inline-flex w-fit px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold"
            style={{
              backgroundColor: 'var(--accent-green-light)',
              color: 'var(--accent-green)',
            }}
          >
            {itinerary.badge}
          </span>
        ) : null}
        <span
          className="inline-flex w-fit px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-secondary)',
          }}
        >
          Trailie planned
        </span>
      </div>

      {itinerary.parkName ? (
        <p
          className="mb-1.5 text-xs font-medium uppercase tracking-wide"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {itinerary.parkName}
        </p>
      ) : null}

      <h2
        className="text-lg sm:text-xl lg:text-2xl font-bold line-clamp-3 mb-2 sm:mb-3 group-hover:text-forest-500 transition break-words"
        style={{ color: 'var(--text-primary)' }}
      >
        {itinerary.title}
      </h2>

      <p
        className="text-sm sm:text-base leading-relaxed line-clamp-3 flex-1 break-words"
        style={{ color: 'var(--text-secondary)' }}
      >
        {itinerary.excerpt}
      </p>

      <span className="mt-4 sm:mt-5 text-sm font-semibold" style={{ color: 'var(--accent-green)' }}>
        {ready ? 'Open itinerary →' : 'Plan with Trailie →'}
      </span>
    </Link>
  );
}

export default function ItinerariesPage() {
  return (
    <>
      <script type="application/ld+json">{JSON.stringify(collectionSchema)}</script>
      <div className="min-h-screen overflow-x-clip" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Header />

        <main className="min-w-0">
          <section className="pt-5 pb-8 sm:pt-8 sm:pb-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto text-center min-w-0">
              <p
                className="text-xs font-semibold uppercase tracking-wider mb-3 sm:mb-4"
                style={{ color: 'var(--accent-green)' }}
              >
                Trailie itineraries
              </p>
              <h1
                className={`${ARTICLE_TITLE} text-balance`}
                style={{ color: 'var(--text-primary)' }}
              >
                Sample trips planned by Trailie
              </h1>
              <p
                className={`${ARTICLE_DECK} max-w-3xl mx-auto text-pretty`}
                style={{ color: 'var(--text-secondary)' }}
              >
                Real day-by-day national park itineraries created with Trailie. Open any card to
                see the full plan and chat — then start your own trip in seconds.
              </p>
            </div>
          </section>

          <section className="pb-14 sm:pb-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto min-w-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 lg:gap-6">
                {SAMPLE_ITINERARIES.map((itinerary) => (
                  <ItineraryCard key={itinerary.slug} itinerary={itinerary} />
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
