'use client';

import ParkCard from '@/components/explore/ParkCard';
import DiscoverHubHeader from '@/components/discover/DiscoverHubHeader';
import DiscoverNpsGuideSection from '@/components/discover/DiscoverNpsGuideSection';
import { useReturnPath } from '@/hooks/useReturnPath';

export default function StateParkPageClient({ stateName, parks, intro, npsGuide, loadError = false }) {
  const returnPath = useReturnPath();
  return (
    <div className="pb-24">
      <div className="public-shell pt-6">
        <DiscoverHubHeader
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
