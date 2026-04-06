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
  },
  twitter: {
    card: 'summary',
    title: 'Features — TrailVerse National Parks',
    description: 'AI trip planning, itinerary builder, PDF export, interactive maps, weather, and community reviews for 470+ National Parks.',
  },
};

export default function FeaturesPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <FeaturesPageClient />
      <Footer />
    </div>
  );
}
