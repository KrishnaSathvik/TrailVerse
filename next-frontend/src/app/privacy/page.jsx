import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import PrivacyPageClient from './PrivacyPageClient';

export const metadata = {
  title: 'Privacy Policy — TrailVerse',
  description: 'Learn how TrailVerse protects your privacy. We never sell your data. Read about data collection, security, cookies, and your privacy rights.',
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/privacy',
  },
  openGraph: {
    title: 'Privacy Policy — TrailVerse',
    description: 'Learn how TrailVerse protects your privacy and handles your data.',
    url: 'https://www.nationalparksexplorerusa.com/privacy',
    siteName: 'TrailVerse',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Privacy Policy — TrailVerse',
    description: 'Learn how TrailVerse protects your privacy and handles your data.',
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <PrivacyPageClient />
      <Footer />
    </div>
  );
}
