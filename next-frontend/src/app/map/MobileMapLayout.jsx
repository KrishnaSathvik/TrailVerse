'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@components/common/Header';
import { useTheme } from '@/context/ThemeContext';
import { useAllParks } from '@hooks/useParks';
import { useMapCampgrounds } from '@hooks/useMapCampgrounds';
import { useMapPlaces } from '@hooks/useMapPlaces';
import { useParkRatings } from '@hooks/useParkRatings';
import { parkToSlug } from '@/utils/parkSlug';
import { parkDetailHref } from '@/lib/returnNavigation';
import { useReturnPath } from '@/hooks/useReturnPath';
import { signalNavigation } from '@/lib/navigationProgress';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import MapCanvas from './MapCanvas';
import CampgroundPreviewCard from './CampgroundPreviewCard';
import PlacePreviewCard from './PlacePreviewCard';
import MapLegend from './MapLegend';
import ParkPreviewCard from './ParkPreviewCard';
import ParkSearch from './ParkSearch';
import useParkMapState from './useParkMapState';

export default function MobileMapLayout() {
  const router = useRouter();
  const returnPath = useReturnPath();
  const { isDark } = useTheme();
  const [showPlaces, setShowPlaces] = useState(true);
  const [showCampgrounds, setShowCampgrounds] = useState(true);
  const { data: allParksData, isLoading } = useAllParks();
  const { data: placesData } = useMapPlaces();
  const { data: campgroundsData } = useMapCampgrounds();
  const { data: parkRatings } = useParkRatings();
  const allParks = allParksData?.data || [];
  const allPlaces = placesData?.data || [];
  const allCampgrounds = campgroundsData?.data || [];
  const mapState = useParkMapState(allParks, allCampgrounds, allPlaces);

  const getRating = (parkCode) => {
    if (!Array.isArray(parkRatings)) return null;
    return parkRatings.find((rating) => rating.parkCode === parkCode) || null;
  };

  const goToParkCamping = (campground) => {
    signalNavigation();
    router.push(parkDetailHref(parkToSlug(campground.parkName), returnPath, { tab: 'camping' }));
  };

  const goToParkPlaces = (place) => {
    signalNavigation();
    router.push(parkDetailHref(parkToSlug(place.parkName), returnPath, { tab: 'places' }));
  };

  if (isLoading && allParks.length === 0) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <Header />
        <div className="flex h-[calc(100dvh-72px)] items-center justify-center">
          <div className="text-center">
            <LoadingSpinner size="lg" text="Loading parks…" />
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
          places={allPlaces}
          showPlaces={showPlaces}
          campgrounds={allCampgrounds}
          showCampgrounds={showCampgrounds}
          selectedPark={mapState.selectedPark}
          selectedPlace={mapState.selectedPlace}
          selectedCampground={mapState.selectedCampground}
          mapCenter={mapState.mapCenter}
          mapZoom={mapState.mapZoom}
          onSelectPark={mapState.selectPark}
          onSelectPlace={mapState.selectPlace}
          onSelectCampground={mapState.selectCampground}
          onViewportChange={mapState.updateViewport}
          isDark={isDark}
          fullBleed
        />

        <div className="absolute inset-x-3 top-3 z-20">
          <div className="mx-auto w-full max-w-sm">
            <MapLegend
              isDark={isDark}
              showPlaces={showPlaces}
              onTogglePlaces={() => setShowPlaces((value) => !value)}
              placeCount={allPlaces.length}
              showCampgrounds={showCampgrounds}
              onToggleCampgrounds={() => setShowCampgrounds((value) => !value)}
              campgroundCount={allCampgrounds.length}
              compact
              className="mb-1.5"
            />
            <ParkSearch
              query={mapState.searchQuery}
              suggestions={mapState.suggestions}
              onQueryChange={mapState.setSearchQuery}
              onSelectPark={mapState.selectPark}
              onClear={mapState.clearSearch}
              compact
            />
          </div>
        </div>

        {mapState.selectedPark && (
          <div className="absolute inset-x-0 bottom-0 z-30">
            <ParkPreviewCard
              park={mapState.selectedPark}
              rating={getRating(mapState.selectedPark.parkCode)}
              onClose={mapState.clearSelection}
              onViewDetails={() => {
                signalNavigation();
                router.push(parkDetailHref(parkToSlug(mapState.selectedPark.fullName), returnPath));
              }}
              onCompare={(parkCode) => router.push(`/compare?park=${parkCode}`)}
              compact
            />
          </div>
        )}

        {mapState.selectedCampground && !mapState.selectedPark && !mapState.selectedPlace && (
          <div className="absolute inset-x-0 bottom-0 z-30">
            <CampgroundPreviewCard
              campground={mapState.selectedCampground}
              onClose={mapState.clearSelection}
              onViewPark={goToParkCamping}
              compact
            />
          </div>
        )}

        {mapState.selectedPlace && !mapState.selectedPark && !mapState.selectedCampground && (
          <div className="absolute inset-x-0 bottom-0 z-30">
            <PlacePreviewCard
              place={mapState.selectedPlace}
              onClose={mapState.clearSelection}
              onViewPark={goToParkPlaces}
              compact
            />
          </div>
        )}
      </div>
    </div>
  );
}
