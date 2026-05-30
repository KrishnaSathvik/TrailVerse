import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import DiscoverFullGridPage from '@/components/discover/DiscoverFullGridPage';
import { fetchDiscoverCatalog } from '@/lib/discoverApi';
import { BROWSE_HUB_PAGE_SUFFIX } from '@/lib/browseHub';

export const metadata = {
  title: `Browse by State | ${BROWSE_HUB_PAGE_SUFFIX}`,
  description: 'Find national parks and sites in every U.S. state and territory.'
};

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
