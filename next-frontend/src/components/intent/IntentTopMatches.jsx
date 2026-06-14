'use client';

import { useEffect, useState } from 'react';
import ParkCard from '@/components/explore/ParkCard';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { mergeFeaturedParks } from '@/lib/intentLandingApi';

/**
 * Top matches grid — hydrates from SSR when present; otherwise loads via same-origin
 * /api rewrite (reliable on Vercel; avoids empty ISR when build-time backend fetch fails).
 */
export default function IntentTopMatches({ landing, initialParks = [] }) {
  const [parks, setParks] = useState(initialParks);
  const [status, setStatus] = useState(initialParks.length > 0 ? 'ready' : 'idle');

  useEffect(() => {
    if (initialParks.length > 0) {
      setParks(initialParks);
      setStatus('ready');
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({
      q: landing.searchQuery,
      limit: '48',
    });
    if (landing.featuredParkCodes?.length) {
      params.set('pinned', landing.featuredParkCodes.join(','));
    }

    async function load() {
      setStatus('loading');
      try {
        const res = await fetch(`/api/parks/search?${params.toString()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`search ${res.status}`);
        const json = await res.json();
        const raw = json.data ?? json.parks ?? [];
        if (cancelled) return;
        setParks(mergeFeaturedParks(raw, landing.featuredParkCodes, 24));
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [landing.searchQuery, landing.featuredParkCodes, initialParks]);

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="space-y-8">
        <div className="flex justify-center py-6">
          <LoadingSpinner size="md" text="Loading park matches…" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-5 sm:gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-80 rounded-2xl animate-pulse"
              style={{ backgroundColor: 'var(--surface-hover)' }}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    );
  }

  if (status === 'error' || parks.length === 0) {
    return (
      <div
        className="rounded-2xl border px-6 py-10 text-center"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <p className="text-base font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
          Park matches could not be loaded right now.
        </p>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Browse all parks or try again in a moment.
        </p>
        <a
          href="/explore"
          className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold"
          style={{ backgroundColor: 'var(--accent-green)', color: '#fff' }}
        >
          Explore all parks
        </a>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-5 sm:gap-6">
      {parks.map((park, index) => (
        <ParkCard
          key={park.parkCode}
          park={park}
          viewMode="grid"
          index={index}
          showReviews={false}
          analyticsSurface="intent_landing"
          intentSlug={landing.path}
        />
      ))}
    </div>
  );
}
