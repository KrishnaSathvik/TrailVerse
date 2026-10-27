import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import DiscoverFullGridPage from '@/components/discover/DiscoverFullGridPage';
import { fetchDiscoverCatalog, fetchDiscoverDetail } from '@/lib/discoverApi';
import { BROWSE_HUB_PAGE_SUFFIX } from '@/lib/browseHub';
import { canonicalPageMetadata, siteCanonical } from '@/lib/seo';
import { pickDiscoverShareImage, shareImageFields } from '@/lib/shareParkImage';

const TITLE = `Browse by Park Type | ${BROWSE_HUB_PAGE_SUFFIX}`;
const DESCRIPTION = 'Explore national parks, monuments, historic sites, memorials, and more.';

export async function generateMetadata() {
  const detail = await fetchDiscoverDetail('type', 'parks').catch(() => null);
  const share = shareImageFields(pickDiscoverShareImage(detail), 'National parks');
  return {
    title: TITLE,
    description: DESCRIPTION,
    ...canonicalPageMetadata('/discover/types'),
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: siteCanonical('/discover/types'),
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

export default async function DiscoverTypesPage() {
  const catalog = await fetchDiscoverCatalog().catch(() => ({ types: [] }));

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main>
        <DiscoverFullGridPage
          title="Type"
          items={catalog.types || []}
          gridKind="types"
        />
      </main>
      <Footer />
    </div>
  );
}
