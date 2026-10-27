import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import DiscoverFullGridPage from '@/components/discover/DiscoverFullGridPage';
import { fetchDiscoverCatalog, fetchDiscoverDetail } from '@/lib/discoverApi';
import { BROWSE_HUB_PAGE_SUFFIX } from '@/lib/browseHub';
import { canonicalPageMetadata, siteCanonical } from '@/lib/seo';
import { pickDiscoverShareImage, shareImageFields } from '@/lib/shareParkImage';

const TITLE = `Browse by Topic | ${BROWSE_HUB_PAGE_SUFFIX}`;
const DESCRIPTION = 'Find parks by topic—animals, trails, military history, archeology, and more.';

export async function generateMetadata() {
  const catalog = await fetchDiscoverCatalog().catch(() => null);
  const slug = catalog?.topics?.[0]?.slug;
  const detail = slug ? await fetchDiscoverDetail('topic', slug).catch(() => null) : null;
  const share = shareImageFields(pickDiscoverShareImage(detail), 'National park topics');
  return {
    title: TITLE,
    description: DESCRIPTION,
    ...canonicalPageMetadata('/discover/topics'),
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: siteCanonical('/discover/topics'),
      siteName: 'TrailVerse',
      type: 'website',
      images: share.openGraphImages,
    },
    twitter: {
      card: 'summary_large_image',
      title: TITLE,
      description: DESCRIPTION,
      images: share.twitterImages,
    },
  };
}

export default async function DiscoverTopicsPage() {
  const catalog = await fetchDiscoverCatalog().catch(() => ({ topics: [] }));

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main>
        <DiscoverFullGridPage
          title="Topics"
          items={catalog.topics || []}
          gridKind="topics"
        />
      </main>
      <Footer />
    </div>
  );
}
