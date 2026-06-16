import { notFound } from 'next/navigation';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import DiscoverDetailClient from '@/components/discover/DiscoverDetailClient';
import { fetchDiscoverDetail } from '@/lib/discoverApi';
import { BROWSE_HUB_PAGE_SUFFIX } from '@/lib/browseHub';
import { canonicalPageMetadata, siteCanonical } from '@/lib/seo';

export async function generateMetadata({ params, searchParams }) {
  const { slug } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const detail = await fetchDiscoverDetail('activity', slug).catch(() => null);
  if (!detail) return { title: `Activity | ${BROWSE_HUB_PAGE_SUFFIX}` };
  return {
    title: `${detail.title} | ${BROWSE_HUB_PAGE_SUFFIX}`,
    description: detail.intro?.slice(0, 160),
    ...canonicalPageMetadata(`/discover/activity/${slug}`, sp),
    openGraph: {
      title: `${detail.title} | ${BROWSE_HUB_PAGE_SUFFIX}`,
      description: detail.intro?.slice(0, 160),
      url: siteCanonical(`/discover/activity/${slug}`),
      siteName: 'TrailVerse',
      type: 'website',
    },
  };
}

export default async function DiscoverActivityPage({ params }) {
  const { slug } = await params;
  const detail = await fetchDiscoverDetail('activity', slug);
  if (!detail) notFound();

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main>
        <DiscoverDetailClient detail={detail} dimension="activity" />
      </main>
      <Footer />
    </div>
  );
}
