"use client";
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Reports the live query string to the park page.
 *
 * Park pages are prerendered (ISR). Calling `useSearchParams()` in the main
 * park component made Next bail the whole page out to client-side rendering,
 * so the initial HTML was only "Loading park…". The parent mounts this bridge
 * only after hydration, so the server HTML stays complete and query-driven UI
 * (`?tab=`, `?filter=`, `?write=`, `?from=`) still follows every navigation.
 */
export default function ParkSearchParamsBridge({ onChange }) {
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  useEffect(() => {
    onChange(query);
  }, [query, onChange]);

  return null;
}
