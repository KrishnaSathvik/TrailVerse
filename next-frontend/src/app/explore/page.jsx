import Header from '@/components/common/Header';
import ExploreSeoShell from '@/components/seo/ExploreSeoShell';
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

  const nationalParksCount =
    initialPaginatedData?.total ??
    (Array.isArray(initialAllParksData?.data)
      ? initialAllParksData.data.filter((park) =>
          park.designation?.toLowerCase().includes('national park')
        ).length
      : 64);
  const totalSitesCount = initialAllParksData?.data?.length || initialAllParksData?.total;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <ExploreSeoShell
        nationalParksCount={nationalParksCount}
        totalSitesCount={totalSitesCount}
      />
      <ExplorePageClient
        initialPaginatedData={initialPaginatedData}
        initialAllParksData={initialAllParksData}
      />
    </div>
  );
}
