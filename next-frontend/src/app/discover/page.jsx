import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import DiscoverPageClient from './DiscoverPageClient';
import { fetchDiscoverCatalog } from '@/lib/discoverApi';

export default async function DiscoverPage() {
  let initialCatalog;
  try {
    initialCatalog = await fetchDiscoverCatalog();
  } catch {
    initialCatalog = null;
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <main>
        <DiscoverPageClient initialCatalog={initialCatalog} />
      </main>
      <Footer />
    </div>
  );
}
