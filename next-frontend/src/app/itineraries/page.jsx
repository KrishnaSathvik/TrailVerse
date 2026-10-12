import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import { PUBLIC_ITINERARIES } from '@/data/publicItineraries';
import { indexablePageRobots } from '@/lib/seo';
import ItineraryCatalog from './ItineraryCatalog';

export const metadata = {
  title: 'Trailie Sample Itineraries — AI National Park Trip Plans | TrailVerse',
  description:
    'Browse complete, read-only Trailie itineraries. Explore each day and map, then plan a trip of your own.',
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/itineraries',
  },
  robots: indexablePageRobots,
  openGraph: {
    title: 'Trailie Sample Itineraries | TrailVerse',
    description:
      'Explore complete Trailie sample itineraries and plan your own trip.',
    url: 'https://www.nationalparksexplorerusa.com/itineraries',
    siteName: 'TrailVerse',
    type: 'website',
    images: [{ url: '/og/itineraries.jpg', width: 1200, height: 630, alt: 'TrailVerse — Sample trips planned by Trailie' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trailie Sample Itineraries | TrailVerse',
    description:
      'Browse Trailie sample trips, explore their maps, and plan your own.',
    images: ['/og/itineraries.jpg'],
  },
};

export default function ItinerariesPage() {
  const schema = {
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    name: 'Sample itineraries for your next trip',
    url: 'https://www.nationalparksexplorerusa.com/itineraries',
    hasPart: PUBLIC_ITINERARIES.map(sample => ({
      '@type': 'CreativeWork', name: sample.title, description: sample.description,
      url: `https://www.nationalparksexplorerusa.com/itineraries/${sample.slug}`,
    })),
  };
  return <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
    <script type="application/ld+json">{JSON.stringify(schema).replace(/</g, '\u003c')}</script>
    <Header />
    <main className="public-shell min-w-0 py-12 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-green)]">Planned with Trailie</p>
      <h1 className="mt-4 max-w-[48rem] text-4xl font-semibold tracking-tight text-balance sm:text-5xl" style={{ fontFamily: 'var(--font-display)' }}>Sample itineraries for your next trip</h1>
      <p className="mt-5 max-w-[40rem] text-lg leading-8 text-[var(--text-secondary)]">Real trips planned with Trailie. Browse one, explore the itinerary and map, then make your own version.</p>
      <ItineraryCatalog samples={PUBLIC_ITINERARIES} />
    </main>
    <Footer />
  </div>;
}
