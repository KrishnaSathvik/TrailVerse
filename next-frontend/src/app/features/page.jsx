import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import FeaturesPageClient from './FeaturesPageClient';

export const metadata = {
  title: 'Features — Trailie, Maps, Weather & More | TrailVerse',
  description: 'Explore TrailVerse features: Trailie outdoor trip planning (5 guest messages; sign in for unlimited chat, live web search, and state parks), itinerary builder, PDF export, maps, weather, and 470+ NPS sites.',
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/features',
  },
  openGraph: {
    title: 'Features — TrailVerse National Parks',
    description: 'Trailie trip planning, itinerary builder, PDF export, interactive maps, weather, and community reviews for 470+ NPS parks and sites. Sign in for live web search and state-park planning.',
    url: 'https://www.nationalparksexplorerusa.com/features',
    siteName: 'TrailVerse',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse Features' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Features — TrailVerse National Parks',
    description: 'Trailie trip planning, itinerary builder, PDF export, interactive maps, weather, and community reviews for 470+ NPS parks and sites. Sign in for live web search and state-park planning.',
    images: ['/og-image-trailverse.jpg'],
  },
};

// Static JSON-LD — hardcoded string literals only (no user input)
const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'TrailVerse Features',
  description: 'Trailie trip planning, interactive maps, real-time weather, itinerary builder, PDF export, and community reviews for 470+ NPS parks and sites. Free account unlocks live web search and state parks.',
  url: 'https://www.nationalparksexplorerusa.com/features',
  mainEntity: {
    '@type': 'SoftwareApplication',
    name: 'TrailVerse',
    applicationCategory: 'TravelApplication',
    operatingSystem: 'Web',
    url: 'https://www.nationalparksexplorerusa.com',
    description: 'Free travel planning platform for 470+ NPS parks and sites with Trailie, interactive maps, real-time weather, and community reviews.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: 'Trailie, Trailie Voice, Interactive Maps, Real-Time Weather, Itinerary Builder, PDF Export, Park Comparison, Community Reviews, Event Calendar, ChatGPT App, Claude MCP',
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
