'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { BROWSE_HUB_PATH, BROWSE_HUB_TITLE } from '@/lib/browseHub';
import { resolveReturnNavigation } from '@/lib/returnNavigation';

/**
 * Read ?from= and return { backHref, backLabel } for page back links.
 */
export function useReturnNavigation({
  defaultHref = BROWSE_HUB_PATH,
  defaultLabel = BROWSE_HUB_TITLE,
} = {}) {
  const searchParams = useSearchParams();
  return useMemo(
    () =>
      resolveReturnNavigation(searchParams.get('from'), {
        defaultHref,
        defaultLabel,
      }),
    [searchParams, defaultHref, defaultLabel]
  );
}
