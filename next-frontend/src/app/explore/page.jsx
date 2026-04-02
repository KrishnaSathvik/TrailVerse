import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';
import ExplorePageClient from './ExplorePageClient';
import { getApiBaseUrl } from '@/lib/apiBase';

async function getInitialParks() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/parks?page=1&limit=12&nationalParksOnly=true`, {
      next: { revalidate: 86400 }
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

export default async function ExplorePage() {
  const initialPaginatedData = await getInitialParks();

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <ExplorePageClient initialPaginatedData={initialPaginatedData} />
      <Footer />
    </div>
  );
}
