'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import npsApi from '@/services/npsApi';
import {
  COMPARE_MAX_PARKS,
  loadCompareSelectionCodes,
  parseCompareParkCodes,
} from '@/lib/comparePersistence';

function CompareUrlHydrationInner({
  hydratedRef,
  onHydrate,
  initialParkCodes = [],
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (hydratedRef.current) return;

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

    if (codes.length === 0) {
      hydratedRef.current = true;
      return;
    }

    let cancelled = false;

    npsApi.fetchParksByCodes(codes).then((parks) => {
      if (cancelled) return;
      if (parks.length > 0) {
        onHydrate(parks);
      }
      hydratedRef.current = true;
    });

    return () => {
      cancelled = true;
    };
  }, [searchParams, hydratedRef, onHydrate, initialParkCodes]);

  return null;
}

export default function CompareUrlHydration(props) {
  return (
    <Suspense fallback={null}>
      <CompareUrlHydrationInner {...props} />
    </Suspense>
  );
}
