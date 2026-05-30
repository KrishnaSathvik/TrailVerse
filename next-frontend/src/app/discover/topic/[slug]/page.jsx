import { notFound } from 'next/navigation';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import DiscoverDetailClient from '@/components/discover/DiscoverDetailClient';
import { fetchDiscoverDetail } from '@/lib/discoverApi';
import { BROWSE_HUB_PAGE_SUFFIX } from '@/lib/browseHub';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const detail = await fetchDiscoverDetail('topic', slug).catch(() => null);
  if (!detail) return { title: `Topic | ${BROWSE_HUB_PAGE_SUFFIX}` };
  return {
    title: `${detail.title} | ${BROWSE_HUB_PAGE_SUFFIX}`,
    description: detail.intro?.slice(0, 160)
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
        <DiscoverDetailClient detail={detail} dimension="topic" />
      </main>
      <Footer />
    </div>
  );
}
