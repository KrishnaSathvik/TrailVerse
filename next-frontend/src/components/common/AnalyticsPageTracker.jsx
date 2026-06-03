'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { logPageView } from '@/utils/analytics';

/** Sends MongoDB page_view events on App Router navigations. */
export default function AnalyticsPageTracker() {
  const pathname = usePathname();
  const lastTracked = useRef(null);

  useEffect(() => {
    if (!pathname || lastTracked.current === pathname) return;
    lastTracked.current = pathname;
    logPageView();
  }, [pathname]);

  return null;
}
