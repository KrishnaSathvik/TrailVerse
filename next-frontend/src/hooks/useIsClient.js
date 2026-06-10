'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False during SSR and the hydration pass; true after the client has committed.
 * Prefer over useState+useEffect for client-only UI (avoids hydration mismatches).
 */
export function useIsClient() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
