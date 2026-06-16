'use client';

import { useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { buildReturnPath } from '@/lib/returnNavigation';

/**
 * Current page path (pathname + query) for ?from= on outbound links.
 */
export function useReturnPath() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return useMemo(
    () => buildReturnPath(pathname, searchParams.toString()),
    [pathname, searchParams]
  );
}
