import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import UnsubscribeClient from './UnsubscribeClient';

export const metadata = {
  title: 'Email Preferences — TrailVerse',
  description: 'Manage your TrailVerse email subscriptions. Unsubscribe from notifications or update your email preferences.',
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/unsubscribe',
  },
  openGraph: {
    title: 'Email Preferences — TrailVerse',
    description: 'Manage your TrailVerse email subscriptions and notification preferences.',
    url: 'https://www.nationalparksexplorerusa.com/unsubscribe',
    siteName: 'TrailVerse',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Email Preferences — TrailVerse',
    description: 'Manage your TrailVerse email subscriptions and notification preferences.',
  },
};

export default function UnsubscribePage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <UnsubscribeClient />
      <Footer />
    </div>
  );
}
