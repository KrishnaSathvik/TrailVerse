'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Resets window scroll on route change. No floating scroll-to-top control —
 * that competed with Trailie Voice in the bottom-right.
 */
const ScrollToTop = () => {
  const pathname = usePathname();
  const isChatPage = pathname?.startsWith('/plan-ai') || pathname?.includes('/chat');

  useEffect(() => {
    if (isChatPage) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }, [pathname, isChatPage]);

  return null;
};

export default ScrollToTop;
