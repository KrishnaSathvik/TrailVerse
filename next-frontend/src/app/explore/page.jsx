import Header from '@/components/common/Header';
import ExplorePageClient from './ExplorePageClient';
import { getApiBaseUrl } from '@/lib/apiBase';

async function getInitialParks() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/parks?page=1&limit=12&nationalParksOnly=true`, {
      next: { revalidate: 86400 }
    });

    if (!response.ok) {
      return undefined;
    }

    return response.json();
  } catch {
    return undefined;
  }
}

async function getInitialAllParks() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/parks?all=true`, {
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      return undefined;
    }

    return response.json();
  } catch {
    return undefined;
  }
}

export default async function ExplorePage() {
  const [initialPaginatedData, initialAllParksData] = await Promise.all([
    getInitialParks(),
    getInitialAllParks(),
  ]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <ExplorePageClient
        initialPaginatedData={initialPaginatedData}
        initialAllParksData={initialAllParksData}
      />
    </div>
  );
}
