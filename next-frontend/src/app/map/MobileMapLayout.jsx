'use client';

import { useRouter } from 'next/navigation';
import Header from '@components/common/Header';
import { useTheme } from '@/context/ThemeContext';
import { useAllParks } from '@hooks/useParks';
import { useParkRatings } from '@hooks/useParkRatings';
import { parkToSlug } from '@/utils/parkSlug';
import { Loader2 } from '@components/icons';
import MapCanvas from './MapCanvas';
import ParkPreviewCard from './ParkPreviewCard';
import ParkSearch from './ParkSearch';
import useParkMapState from './useParkMapState';

export default function MobileMapLayout() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { data: allParksData, isLoading } = useAllParks();
  const { data: parkRatings } = useParkRatings();
  const allParks = allParksData?.data || [];
  const mapState = useParkMapState(allParks);

  const getRating = (parkCode) => {
    if (!Array.isArray(parkRatings)) return null;
    return parkRatings.find((rating) => rating.parkCode === parkCode) || null;
  };

  if (isLoading && allParks.length === 0) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <Header />
        <div className="flex h-[calc(100dvh-72px)] items-center justify-center">
          <div className="text-center">
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-emerald-600" />
            <p style={{ color: 'var(--text-secondary)' }}>Loading parks...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Header />

      <div className="relative h-[calc(100dvh-72px)] overflow-hidden">
        <MapCanvas
          parks={allParks}
          selectedPark={mapState.selectedPark}
          mapCenter={mapState.mapCenter}
          mapZoom={mapState.mapZoom}
          onSelectPark={mapState.selectPark}
          onViewportChange={mapState.updateViewport}
          isDark={isDark}
          fullBleed
        />

        <div className="absolute inset-x-4 top-4 z-20">
          <div className="mx-auto w-full max-w-sm">
            <div
              className="flex items-center justify-center gap-3 mb-1.5 rounded-full px-3 py-1 mx-auto w-fit text-[11px] backdrop-blur-md border"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--surface) 88%, transparent)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#15803d' }} />National Parks</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#2563eb' }} />Other NPS Sites</span>
            </div>
            <ParkSearch
              query={mapState.searchQuery}
              suggestions={mapState.suggestions}
              totalResults={mapState.results.length}
              onQueryChange={mapState.setSearchQuery}
              onSelectPark={mapState.selectPark}
              onClear={mapState.clearSearch}
              isDark={isDark}
              compact
            />
          </div>
        </div>

        {mapState.selectedPark && (
          <div className="absolute inset-x-4 bottom-4 z-20">
            <ParkPreviewCard
              park={mapState.selectedPark}
              rating={getRating(mapState.selectedPark.parkCode)}
              onClose={mapState.clearSelection}
              onViewDetails={() => router.push(`/parks/${parkToSlug(mapState.selectedPark.fullName)}`)}
              onCompare={(parkCode) => router.push(`/compare?park=${parkCode}`)}
              isDark={isDark}
            />
          </div>
        )}
      </div>
    </div>
  );
}
