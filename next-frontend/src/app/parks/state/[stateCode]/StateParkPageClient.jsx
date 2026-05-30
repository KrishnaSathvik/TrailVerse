'use client';

import ParkCard from '@/components/explore/ParkCard';
import DiscoverHubHeader from '@/components/discover/DiscoverHubHeader';
import DiscoverNpsGuideSection from '@/components/discover/DiscoverNpsGuideSection';

export default function StateParkPageClient({ stateName, parks, intro, npsGuide }) {
  return (
    <div className="pb-24">
      <div className="max-w-[92rem] mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 pt-6">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {parks.map((park) => (
              <ParkCard key={park.parkCode} park={park} showReviews={false} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
