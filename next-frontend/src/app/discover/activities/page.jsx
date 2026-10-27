import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import DiscoverFullGridPage from '@/components/discover/DiscoverFullGridPage';
import { fetchDiscoverCatalog, fetchDiscoverDetail } from '@/lib/discoverApi';
import { BROWSE_HUB_PAGE_SUFFIX } from '@/lib/browseHub';
import { canonicalPageMetadata, siteCanonical } from '@/lib/seo';
import { pickDiscoverShareImage, shareImageFields } from '@/lib/shareParkImage';

const TITLE = `Browse by Activity | ${BROWSE_HUB_PAGE_SUFFIX}`;
const DESCRIPTION = 'Find national parks and sites by activity—hiking, stargazing, camping, wildlife watching, and more.';

export async function generateMetadata() {
  const detail = await fetchDiscoverDetail('activity', 'hiking').catch(() => null);
  const share = shareImageFields(pickDiscoverShareImage(detail), 'Hiking in national parks');
  return {
    title: TITLE,
    description: DESCRIPTION,
    ...canonicalPageMetadata('/discover/activities'),
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: siteCanonical('/discover/activities'),
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

export default async function DiscoverActivitiesPage() {
  const catalog = await fetchDiscoverCatalog().catch(() => ({ activities: [] }));

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main>
        <DiscoverFullGridPage
          title="Activities"
          items={catalog.activities || []}
          gridKind="activities"
        />
      </main>
      <Footer />
    </div>
  );
}
