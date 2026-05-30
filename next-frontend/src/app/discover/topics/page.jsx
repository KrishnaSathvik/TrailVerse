import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import DiscoverFullGridPage from '@/components/discover/DiscoverFullGridPage';
import { fetchDiscoverCatalog } from '@/lib/discoverApi';
import { BROWSE_HUB_PAGE_SUFFIX } from '@/lib/browseHub';

export const metadata = {
  title: `Browse by Topic | ${BROWSE_HUB_PAGE_SUFFIX}`,
  description: 'Find parks by topic—animals, trails, military history, archeology, and more.'
};

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
