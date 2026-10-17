import { cache } from 'react';
import { getApiBaseUrl } from '@/lib/apiBase';

// Deduplicate metadata/page reads within a render, but never cache shared plans
// across requests: owners can revise or revoke a share at any time.
export const getSharedTrip = cache(async (shareId) => {
  const response = await fetch(`${getApiBaseUrl()}/trips/shared/${encodeURIComponent(shareId)}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Shared trip request failed (${response.status})`);
  const payload = await response.json();
  if (!payload.success || !payload.data) throw new Error('Invalid shared trip response');
  return payload.data;
});
