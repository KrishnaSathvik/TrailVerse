import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import DiscoverDetailClient from '@/components/discover/DiscoverDetailClient';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { fetchDiscoverDetail } from '@/lib/discoverApi';
import { BROWSE_HUB_PAGE_SUFFIX } from '@/lib/browseHub';
import { canonicalPageMetadata, siteCanonical } from '@/lib/seo';
import { pickDiscoverShareImage, shareImageFields } from '@/lib/shareParkImage';

export async function generateMetadata({ params, searchParams }) {
  const { slug } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const detail = await fetchDiscoverDetail('topic', slug).catch(() => null);
  if (!detail) return { title: `Topic | ${BROWSE_HUB_PAGE_SUFFIX}` };
  const share = shareImageFields(pickDiscoverShareImage(detail), detail.title);
  return {
    title: `${detail.title} | ${BROWSE_HUB_PAGE_SUFFIX}`,
    description: detail.intro?.slice(0, 160),
    ...canonicalPageMetadata(`/discover/topic/${slug}`, sp),
    openGraph: {
      title: `${detail.title} | ${BROWSE_HUB_PAGE_SUFFIX}`,
      description: detail.intro?.slice(0, 160),
      url: siteCanonical(`/discover/topic/${slug}`),
      siteName: 'TrailVerse',
      type: 'website',
      images: share.openGraphImages,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${detail.title} | ${BROWSE_HUB_PAGE_SUFFIX}`,
      description: detail.intro?.slice(0, 160),
      images: share.twitterImages,
    },
  };
}

export default async function DiscoverTopicPage({ params }) {
  const { slug } = await params;
  const detail = await fetchDiscoverDetail('topic', slug);
  if (!detail) notFound();

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main>
        <Suspense
          fallback={
            <div className="flex min-h-[40vh] items-center justify-center">
              <LoadingSpinner size="lg" text="Loading parks…" />
            </div>
          }
        >
          <DiscoverDetailClient detail={detail} dimension="topic" />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
