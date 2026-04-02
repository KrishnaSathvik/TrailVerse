'use client';

import { useRouter } from 'next/navigation';
import Header from '@components/common/Header';
import { useTheme } from '@/context/ThemeContext';
import { useAllParks } from '@hooks/useParks';
import { useParkRatings } from '@hooks/useParkRatings';
import { Loader2 } from '@components/icons';
import MapCanvas from './MapCanvas';
import ParkPreviewCard from './ParkPreviewCard';
import ParkSearch from './ParkSearch';
import useParkMapState from './useParkMapState';

export default function DesktopMapLayout() {
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
        <div className="flex h-[calc(100vh-72px)] items-center justify-center">
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

      <div className="relative h-[calc(100vh-72px)] px-6 pb-6 pt-4">
        <MapCanvas
          parks={allParks}
          selectedPark={mapState.selectedPark}
          mapCenter={mapState.mapCenter}
          mapZoom={mapState.mapZoom}
          onSelectPark={mapState.selectPark}
          onViewportChange={mapState.updateViewport}
          isDark={isDark}
        />

        <div className="pointer-events-none absolute inset-x-10 top-8 z-20">
          <div className="mx-auto w-full max-w-2xl pointer-events-auto">
            <ParkSearch
              query={mapState.searchQuery}
              suggestions={mapState.suggestions}
              totalResults={mapState.results.length}
              onQueryChange={mapState.setSearchQuery}
              onSelectPark={mapState.selectPark}
              onClear={mapState.clearSearch}
              isDark={isDark}
            />
          </div>
        </div>

        {mapState.selectedPark && (
          <div className="pointer-events-none absolute bottom-8 right-10 z-20 w-full max-w-[28rem]">
            <ParkPreviewCard
              park={mapState.selectedPark}
              rating={getRating(mapState.selectedPark.parkCode)}
              onClose={mapState.clearSelection}
              onViewDetails={(parkCode) => router.push(`/parks/${parkCode}`)}
              isDark={isDark}
              className="pointer-events-auto"
            />
          </div>
        )}
      </div>
    </div>
  );
}
