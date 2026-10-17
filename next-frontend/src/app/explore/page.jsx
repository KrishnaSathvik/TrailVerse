import { Suspense } from 'react';
import Header from '@/components/common/Header';
import Link from 'next/link';
import { parkToSlug } from '@/utils/parkSlug';
import ExploreSeoShell from '@/components/seo/ExploreSeoShell';
import ExplorePageClient from './ExplorePageClient';
import { getApiBaseUrl } from '@/lib/apiBase';
import { canonicalPageMetadata } from '@/lib/seo';

export const revalidate = 86400;
export const metadata = canonicalPageMetadata('/explore');

async function getInitialParks() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/parks?page=1&limit=12&nationalParksOnly=true`, {
      next: { revalidate: 86400 }
    });

    if (!response.ok) {
      throw new Error(`Park directory upstream failed: ${response.status}`);
    }

    const json = await response.json();
    if (json?.success === false || !Array.isArray(json?.data)) throw new Error('Invalid park directory');
    return json;
  } catch (error) {
    throw error;
  }
}

async function getTotalSitesCount() {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/parks?page=1&limit=1&nationalParksOnly=false`,
      { next: { revalidate: 86400 } }
    );

    if (!response.ok) {
      throw new Error(`Park directory upstream failed: ${response.status}`);
    }

    const json = await response.json();
    if (json?.success === false || !Number.isFinite(json?.total)) throw new Error('Invalid park count');
    return json.total;
  } catch (error) {
    throw error;
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
          <section className="public-shell py-8" aria-label="Park directory">
            <h2 className="text-xl font-semibold mb-4">Browse park details</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {initialPaginatedData.data.map(park => (
                <li key={park.parkCode}>
                  <Link href={`/parks/${parkToSlug(park.fullName)}`} className="underline">{park.fullName}</Link>
                  <p>{park.states}</p>
                </li>
              ))}
            </ul>
          </section>
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
