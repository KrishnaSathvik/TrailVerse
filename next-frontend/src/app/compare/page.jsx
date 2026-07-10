import { Suspense } from 'react';
import Header from '@/components/common/Header';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ComparePageSeo from './ComparePageSeo';
import ComparePageClient from './ComparePageClient';
import { canonicalPageMetadata } from '@/lib/seo';

export async function generateMetadata({ searchParams }) {
  const params = await searchParams;
  return canonicalPageMetadata('/compare', params);
}

function parseInitialParkCodes(searchParams) {
  const parksParam = searchParams?.parks;
  const legacyPark = searchParams?.park;
  let codes = [];

  if (typeof parksParam === 'string' && parksParam.trim()) {
    codes = parksParam.split(',').map((code) => code.trim().toLowerCase()).filter(Boolean);
  } else if (typeof legacyPark === 'string' && legacyPark.trim()) {
    codes = [legacyPark.trim().toLowerCase()];
  }

  return [...new Set(codes)].slice(0, 4);
}

export default async function ComparePage({ searchParams }) {
  const params = await searchParams;
  const initialParkCodes = parseInitialParkCodes(params);

  return (
    <div className="min-h-screen overflow-x-clip" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Header />
      <ComparePageSeo />
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center">
            <LoadingSpinner size="lg" text="Loading comparison…" />
          </div>
        }
      >
        <ComparePageClient initialParkCodes={initialParkCodes} />
      </Suspense>
    </div>
  );
}
