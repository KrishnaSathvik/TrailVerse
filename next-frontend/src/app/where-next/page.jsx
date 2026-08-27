import { Suspense } from 'react';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import { indexablePageRobots, siteCanonical } from '@/lib/seo';
import WhereNextClient from './WhereNextClient';

export const metadata = {
  title: 'Where do you want to go next? — TrailVerse',
  description:
    'Pick the one place you’d love to visit next and see what other travelers are dreaming about. National parks and anywhere else — no account required.',
  robots: indexablePageRobots,
  alternates: {
    canonical: siteCanonical('/where-next'),
  },
  openGraph: {
    title: 'Where do you want to go next? — TrailVerse',
    description: 'Tell TrailVerse the one destination you’d visit next.',
    url: siteCanonical('/where-next'),
    siteName: 'TrailVerse',
    type: 'website',
    images: [{ url: '/og/explore.jpg', width: 1200, height: 630, alt: 'TrailVerse' }],
  },
};

export default function WhereNextPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <Suspense fallback={<div className="min-h-[50vh]" />}>
        <WhereNextClient />
      </Suspense>
      <Footer />
    </div>
  );
}
