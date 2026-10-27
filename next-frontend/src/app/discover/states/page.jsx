import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import DiscoverFullGridPage from '@/components/discover/DiscoverFullGridPage';
import { fetchDiscoverCatalog } from '@/lib/discoverApi';
import { BROWSE_HUB_PAGE_SUFFIX } from '@/lib/browseHub';
import { canonicalPageMetadata, siteCanonical } from '@/lib/seo';
import { fetchParkDirectory } from '@/lib/stateHubs';
import { isNationalPark, pickListedParkImage, shareImageFields } from '@/lib/shareParkImage';

const TITLE = `Browse by State | ${BROWSE_HUB_PAGE_SUFFIX}`;
const DESCRIPTION = 'Find national parks and sites in every U.S. state and territory.';

export async function generateMetadata() {
  const { parks } = await fetchParkDirectory();
  const nationalParks = parks
    .filter(isNationalPark)
    .sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
  const share = shareImageFields(pickListedParkImage(nationalParks), 'National parks by state');
  return {
    title: TITLE,
    description: DESCRIPTION,
    ...canonicalPageMetadata('/discover/states'),
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: siteCanonical('/discover/states'),
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

export default async function DiscoverStatesPage() {
  const catalog = await fetchDiscoverCatalog().catch(() => ({ states: [] }));

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main>
        <DiscoverFullGridPage
          title="States"
          items={catalog.states || []}
          gridKind="states"
        />
      </main>
      <Footer />
    </div>
  );
}
