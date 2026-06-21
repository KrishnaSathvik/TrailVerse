'use client';

import { useMemo } from 'react';
import { usePark } from '@hooks/useParks';

/**
 * Merge lite map park data with description from a single-park fetch when selected.
 */
export default function useMapPreviewPark(selectedPark) {
  const parkCode = selectedPark?.parkCode;
  const { data: parkDetails } = usePark(parkCode);

  return useMemo(() => {
    if (!selectedPark) return null;
    if (parkDetails?.description) {
      return { ...selectedPark, description: parkDetails.description };
    }
    return selectedPark;
  }, [selectedPark, parkDetails]);
}
