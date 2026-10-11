import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import { indexablePageRobots } from '@/lib/seo';
import NewsletterLanding from './NewsletterLanding';

export const metadata = {
  title: 'Where Next? — One place worth going. Every week.',
  description:
    'Where Next? by TrailVerse: one timely destination each week, with why now, what changed, what to avoid, and a ready-to-use trip idea.',
  robots: indexablePageRobots,
  alternates: {
    canonical: 'https://www.nationalparksexplorerusa.com/newsletter',
  },
  openGraph: {
    title: 'Where Next? by TrailVerse',
    description:
      'One place worth going. Every week. Seasonal destinations, planning changes, and a ready-to-use trip idea.',
    url: 'https://www.nationalparksexplorerusa.com/newsletter',
    siteName: 'TrailVerse',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'Where Next? by TrailVerse' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Where Next? by TrailVerse',
    description: 'One place worth going. Every week.',
    images: ['/og-image-trailverse.jpg'],
  },
};

export default function NewsletterPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main className="info-page">
        <NewsletterLanding />
      </main>
      <Footer />
    </div>
  );
}
