'use client';

import { useEffect, useRef } from 'react';
import { ChevronDown } from '@components/icons';

/**
 * On mobile: collapsible browse block. On md+: always expanded, no chrome.
 */
export default function ExploreBrowseNav({ children }) {
  const detailsRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const syncOpen = () => {
      if (detailsRef.current) {
        detailsRef.current.open = mq.matches;
      }
    };
    syncOpen();
    mq.addEventListener('change', syncOpen);
    return () => mq.removeEventListener('change', syncOpen);
  }, []);

  return (
    <details
      ref={detailsRef}
      className="group rounded-2xl border p-4 md:rounded-none md:border-0 md:p-0"
      style={{ borderColor: 'var(--border)' }}
    >
      <summary
        className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold md:hidden [&::-webkit-details-marker]:hidden"
        style={{ color: 'var(--text-primary)' }}
      >
        <span>Browse by state, activity &amp; more</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180"
          style={{ color: 'var(--text-tertiary)' }}
        />
      </summary>
      <div className="mt-4 border-t pt-4 md:mt-0 md:border-0 md:pt-0">{children}</div>
    </details>
  );
}
