'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Reports the live query string to the state hub page.
 *
 * State hubs are prerendered (ISR). Calling `useSearchParams()` in the main
 * state component bailed the whole directory out to client-side rendering, so
 * the initial HTML was only "Loading parks…". The parent mounts this bridge only
 * after hydration, so the server HTML stays complete and park-card `?from=`
 * links still carry the current query string.
 */
export default function StateSearchParamsBridge({ onChange }) {
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  useEffect(() => {
    onChange(query);
  }, [query, onChange]);

  return null;
}
