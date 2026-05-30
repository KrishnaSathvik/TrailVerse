import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import DiscoverFullGridPage from '@/components/discover/DiscoverFullGridPage';
import { fetchDiscoverCatalog } from '@/lib/discoverApi';
import { BROWSE_HUB_PAGE_SUFFIX } from '@/lib/browseHub';

export const metadata = {
  title: `Browse by Activity | ${BROWSE_HUB_PAGE_SUFFIX}`,
  description: 'Find national parks and sites by activity—hiking, stargazing, camping, wildlife watching, and more.'
};

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
