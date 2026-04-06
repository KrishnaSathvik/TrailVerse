import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import TermsPageClient from './TermsPageClient';

export const metadata = {
  title: 'Terms of Service — TrailVerse',
  description: 'Terms of Service for TrailVerse. Read about usage rights, AI disclaimer, user content, prohibited uses, and liability for our National Parks platform.',
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/terms',
  },
  openGraph: {
    title: 'Terms of Service — TrailVerse',
    description: 'Terms of Service for the TrailVerse National Parks platform.',
    url: 'https://www.nationalparksexplorerusa.com/terms',
    siteName: 'TrailVerse',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Terms of Service — TrailVerse',
    description: 'Terms of Service for the TrailVerse National Parks platform.',
  },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <TermsPageClient />
      <Footer />
    </div>
  );
}
