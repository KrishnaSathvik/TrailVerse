import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import FeaturesPageClient from './FeaturesPageClient';

export const metadata = {
  title: 'Features — AI Trip Planning, Maps, Weather & More | TrailVerse',
  description: 'Explore TrailVerse features: AI trip planning with Claude & GPT-4, drag-and-drop itinerary builder, PDF export, interactive maps, real-time weather, community reviews, and 470+ parks.',
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/features',
  },
  openGraph: {
    title: 'Features — TrailVerse National Parks',
    description: 'AI trip planning, itinerary builder, PDF export, interactive maps, weather, and community reviews for 470+ National Parks.',
    url: 'https://www.nationalparksexplorerusa.com/features',
    siteName: 'TrailVerse',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse Features' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Features — TrailVerse National Parks',
    description: 'AI trip planning, itinerary builder, PDF export, interactive maps, weather, and community reviews for 470+ National Parks.',
    images: ['/og-image-trailverse.jpg'],
  },
};

// Static JSON-LD — hardcoded string literals only (no user input)
const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'TrailVerse Features',
  description: 'AI trip planning, interactive maps, real-time weather, itinerary builder, PDF export, and community reviews for 470+ U.S. national parks.',
  url: 'https://www.nationalparksexplorerusa.com/features',
  mainEntity: {
    '@type': 'SoftwareApplication',
    name: 'TrailVerse',
    applicationCategory: 'TravelApplication',
    operatingSystem: 'Web',
    url: 'https://www.nationalparksexplorerusa.com',
    description: 'Free travel planning platform for all 470+ U.S. national parks with AI trip planning, interactive maps, real-time weather, and community reviews.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: 'AI Trip Planning, Interactive Maps, Real-Time Weather, Itinerary Builder, PDF Export, Park Comparison, Community Reviews, Event Calendar',
  },
  publisher: {
    '@type': 'Organization',
    name: 'TrailVerse',
    url: 'https://www.nationalparksexplorerusa.com',
  },
});

export default function FeaturesPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <Header />
      <FeaturesPageClient />
      <Footer />
    </div>
  );
}
