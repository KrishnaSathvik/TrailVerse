'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

const MAX_PARKS = 4;

function CompareUrlHydrationInner({ allParks, hydratedRef, onHydrate }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!allParks?.length || hydratedRef.current) return;

    const parksParam = searchParams.get('parks');
    const legacyPark = searchParams.get('park');
    let codes = [];

    if (parksParam) {
      codes = parksParam.split(',').map((code) => code.trim().toLowerCase()).filter(Boolean);
    } else if (legacyPark) {
      codes = [legacyPark.trim().toLowerCase()];
    }

    codes = [...new Set(codes)].slice(0, MAX_PARKS);

    if (codes.length > 0) {
      const parks = codes
        .map((code) => allParks.find((park) => park.parkCode?.toLowerCase() === code))
        .filter(Boolean);
      if (parks.length > 0) {
        onHydrate(parks);
      }
    }

    hydratedRef.current = true;
  }, [allParks, searchParams, hydratedRef, onHydrate]);

  return null;
}

export default function CompareUrlHydration(props) {
  return (
    <Suspense fallback={null}>
      <CompareUrlHydrationInner {...props} />
    </Suspense>
  );
}
