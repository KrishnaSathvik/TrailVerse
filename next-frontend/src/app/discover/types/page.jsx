import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import DiscoverFullGridPage from '@/components/discover/DiscoverFullGridPage';
import { fetchDiscoverCatalog } from '@/lib/discoverApi';
import { BROWSE_HUB_PAGE_SUFFIX } from '@/lib/browseHub';

export const metadata = {
  title: `Browse by Park Type | ${BROWSE_HUB_PAGE_SUFFIX}`,
  description: 'Explore national parks, monuments, historic sites, memorials, and more.'
};

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
