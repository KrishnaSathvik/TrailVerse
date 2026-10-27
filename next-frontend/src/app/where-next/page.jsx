import { Suspense } from 'react';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import { indexablePageRobots, siteCanonical } from '@/lib/seo';
import WhereNextClient from './WhereNextClient';
import NewsletterLanding from '../newsletter/NewsletterLanding';

export const metadata = {
  title: 'Where Next? — Destinations & Newsletter | TrailVerse',
  description:
    'Pick your next destination, see community travel picks, and join the upcoming Where Next? newsletter. No account required.',
  robots: indexablePageRobots,
  alternates: {
    canonical: siteCanonical('/where-next'),
  },
  openGraph: {
    title: 'Where Next? — Destinations & Newsletter | TrailVerse',
    description: 'Tell TrailVerse the one destination you’d visit next.',
    url: siteCanonical('/where-next'),
    siteName: 'TrailVerse',
    type: 'website',
    images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: 'TrailVerse' }],
  },
};

export default function WhereNextPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <Suspense fallback={<div className="min-h-[50vh]" />}>
        <WhereNextClient><NewsletterLanding /></WhereNextClient>
      </Suspense>
      <Footer />
    </div>
  );
}
