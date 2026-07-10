import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import Header from '@/components/common/Header';
import CompareLandingSeo from '@/components/compare/CompareLandingSeo';
import ComparePageClient from '../ComparePageClient';
import { COMPARE_LANDINGS, getCompareLanding } from '@/data/compareLandings';
import LoadingSpinner from '@/components/common/LoadingSpinner';

export function generateStaticParams() {
  return COMPARE_LANDINGS.map((landing) => ({ slug: landing.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const landing = getCompareLanding(slug);

  if (!landing) {
    return { title: '404 - Page Not Found | TrailVerse' };
  }

  const url = `https://www.nationalparksexplorerusa.com/compare/${landing.slug}`;

  return {
    title: landing.title,
    description: landing.description,
    alternates: { canonical: url },
    openGraph: {
      title: landing.headline,
      description: landing.description,
      url,
      siteName: 'TrailVerse',
      type: 'website',
      images: [{ url: '/og-image-trailverse.jpg', width: 1200, height: 630, alt: landing.headline }],
    },
    twitter: {
      card: 'summary_large_image',
      title: landing.headline,
      description: landing.description,
      images: ['/og-image-trailverse.jpg'],
    },
  };
}

export default async function CompareLandingPage({ params }) {
  const { slug } = await params;
  const landing = getCompareLanding(slug);

  if (!landing) {
    notFound();
  }

  return (
    <div className="min-h-screen overflow-x-clip" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <CompareLandingSeo landing={landing} />
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center">
            <LoadingSpinner size="lg" text="Loading comparison…" />
          </div>
        }
      >
        <ComparePageClient initialParkCodes={landing.codes} />
      </Suspense>
    </div>
  );
}
