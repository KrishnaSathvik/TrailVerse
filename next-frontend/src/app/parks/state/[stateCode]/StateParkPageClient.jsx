'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import ParkCard from '@/components/explore/ParkCard';
import DiscoverHubHeader from '@/components/discover/DiscoverHubHeader';
import DiscoverNpsGuideSection from '@/components/discover/DiscoverNpsGuideSection';
import { buildReturnPath } from '@/lib/returnNavigation';
import { DISCOVER_INDEX_BY_DIMENSION } from '@/lib/browseHub';
import StateSearchParamsBridge from './StateSearchParamsBridge';

export default function StateParkPageClient({ stateName, parks, intro, npsGuide, loadError = false }) {
  // `useSearchParams()` here would bail the prerendered page out to client
  // rendering. Server HTML uses the bare pathname; the query string arrives
  // through StateSearchParamsBridge once hydrated.
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const returnPath = useMemo(() => buildReturnPath(pathname, query), [pathname, query]);

  return (
    <div className="pb-24">
      {hydrated ? <StateSearchParamsBridge onChange={setQuery} /> : null}
      <div className="public-shell pt-6">
        <DiscoverHubHeader
          backHref={DISCOVER_INDEX_BY_DIMENSION.state.href}
          backLabel={DISCOVER_INDEX_BY_DIMENSION.state.label}
          title={stateName}
          intro={intro}
          parkCount={parks.length}
        />

        <DiscoverNpsGuideSection guide={npsGuide} />

        <section id="state-all-parks">
          <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
            All parks ({parks.length})
          </h2>
          {loadError && parks.length === 0 ? (
            <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
              We could not load parks for {stateName} right now. Refresh the page to try again.
            </p>
          ) : parks.length === 0 ? (
            <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
              No National Park Service sites are listed for {stateName} right now.
            </p>
          ) : (
            <div className="public-card-grid public-card-grid--four">
              {parks.map((park) => (
                <ParkCard key={park.parkCode} park={park} showReviews={false} fromPath={returnPath} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
