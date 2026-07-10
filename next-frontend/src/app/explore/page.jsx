import { Suspense } from 'react';
import Header from '@/components/common/Header';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ExploreSeoShell from '@/components/seo/ExploreSeoShell';
import ExplorePageClient from './ExplorePageClient';
import { getApiBaseUrl } from '@/lib/apiBase';
import { canonicalPageMetadata } from '@/lib/seo';

export async function generateMetadata({ searchParams }) {
  const params = await searchParams;
  return canonicalPageMetadata('/explore', params);
}

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

async function getTotalSitesCount() {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/parks?page=1&limit=1&nationalParksOnly=false`,
      { next: { revalidate: 86400 } }
    );

    if (!response.ok) {
      return undefined;
    }

    const json = await response.json();
    return json.total;
  } catch {
    return undefined;
  }
}

export default async function ExplorePage() {
  const [initialPaginatedData, totalSitesCount] = await Promise.all([
    getInitialParks(),
    getTotalSitesCount(),
  ]);
  const initialAllParksData = undefined;

  const nationalParksCount = initialPaginatedData?.total ?? 64;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <ExploreSeoShell
        nationalParksCount={nationalParksCount}
        totalSitesCount={totalSitesCount}
      />
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center">
            <LoadingSpinner size="lg" text="Loading parks…" />
          </div>
        }
      >
        <ExplorePageClient
          initialPaginatedData={initialPaginatedData}
          initialAllParksData={initialAllParksData}
        />
      </Suspense>
    </div>
  );
}
