'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  COMPARE_MAX_PARKS,
  loadCompareSelectionCodes,
  parseCompareParkCodes,
} from '@/lib/comparePersistence';

function CompareUrlHydrationInner({
  allParks,
  hydratedRef,
  onHydrate,
  initialParkCodes = [],
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!allParks?.length || hydratedRef.current) return;

    const parksParam = searchParams.get('parks');
    const legacyPark = searchParams.get('park');
    let codes = [];

    if (parksParam) {
      codes = parseCompareParkCodes(parksParam);
    } else if (legacyPark) {
      codes = parseCompareParkCodes(legacyPark);
    }

    if (codes.length === 0 && initialParkCodes.length > 0) {
      codes = [...new Set(initialParkCodes.map((c) => c.trim().toLowerCase()).filter(Boolean))].slice(
        0,
        COMPARE_MAX_PARKS
      );
    }

    if (codes.length === 0) {
      codes = loadCompareSelectionCodes();
    }

    if (codes.length > 0) {
      const parks = codes
        .map((code) => allParks.find((park) => park.parkCode?.toLowerCase() === code))
        .filter(Boolean);
      if (parks.length > 0) {
        onHydrate(parks);
      }
    }

    hydratedRef.current = true;
  }, [allParks, searchParams, hydratedRef, onHydrate, initialParkCodes]);

  return null;
}

export default function CompareUrlHydration(props) {
  return (
    <Suspense fallback={null}>
      <CompareUrlHydrationInner {...props} />
    </Suspense>
  );
}
