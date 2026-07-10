'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@components/common/Header';
import { useTheme } from '@/context/ThemeContext';
import { useAllParksLite } from '@hooks/useParks';
import useMapPreviewPark from './useMapPreviewPark';
import { useCampgroundDetails } from '@hooks/useCampgroundDetails';
import { useMapCampgrounds } from '@hooks/useMapCampgrounds';
import { useMapPlaces } from '@hooks/useMapPlaces';
import { usePlaceDetails } from '@hooks/usePlaceDetails';
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

/** Keeps preview cards inside the map pane so they never slide under the sticky header. */
const DESKTOP_PREVIEW_PANEL =
  'pointer-events-none absolute top-36 bottom-8 right-10 z-30 flex w-full max-w-[28rem] flex-col justify-end';
const DESKTOP_PREVIEW_SCROLL =
  'pointer-events-auto max-h-full overflow-y-auto overscroll-contain rounded-[32px]';

export default function DesktopMapLayout() {
  const router = useRouter();
  const returnPath = useReturnPath();
  const { isDark } = useTheme();
  const [showPlaces, setShowPlaces] = useState(true);
  const [showCampgrounds, setShowCampgrounds] = useState(true);
  const { data: allParksData, isLoading } = useAllParksLite(true);
  const { data: placesData } = useMapPlaces();
  const { data: campgroundsData } = useMapCampgrounds();
  const { data: parkRatings } = useParkRatings();
  const allParks = allParksData?.data || [];
  const allPlaces = placesData?.data || [];
  const allCampgrounds = campgroundsData?.data || [];
  const mapState = useParkMapState(allParks, allCampgrounds, allPlaces);
  const previewPark = useMapPreviewPark(mapState.selectedPark);
  const selectedCampground = mapState.selectedCampground;
  const selectedPlace = mapState.selectedPlace;
  const { data: campgroundDetails } = useCampgroundDetails(
    selectedCampground?.parkCode,
    selectedCampground?.id,
    Boolean(selectedCampground && !mapState.selectedPark && !selectedPlace)
  );
  const { data: placeDetails } = usePlaceDetails(
    selectedPlace?.parkCode,
    selectedPlace?.id,
    Boolean(selectedPlace && !mapState.selectedPark && !selectedCampground)
  );

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

      <div className="relative h-[calc(100dvh-72px)] overflow-hidden px-6 pb-6 pt-4">
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
        />

        <div className="pointer-events-none absolute inset-x-10 top-8 z-20">
          <div className="mx-auto w-full max-w-2xl pointer-events-auto">
            <MapLegend
              isDark={isDark}
              showPlaces={showPlaces}
              onTogglePlaces={() => setShowPlaces((value) => !value)}
              placeCount={allPlaces.length}
              showCampgrounds={showCampgrounds}
              onToggleCampgrounds={() => setShowCampgrounds((value) => !value)}
              campgroundCount={allCampgrounds.length}
              className="mb-2"
            />
            <ParkSearch
              query={mapState.searchQuery}
              suggestions={mapState.suggestions}
              onQueryChange={mapState.setSearchQuery}
              onSelectPark={mapState.selectPark}
              onClear={mapState.clearSearch}
            />
          </div>
        </div>

        {previewPark && (
          <div className={DESKTOP_PREVIEW_PANEL}>
            <div className={DESKTOP_PREVIEW_SCROLL}>
              <ParkPreviewCard
                park={previewPark}
                rating={getRating(previewPark.parkCode)}
                onClose={mapState.clearSelection}
                onViewDetails={() => {
                  signalNavigation();
                  router.push(parkDetailHref(parkToSlug(previewPark.fullName), returnPath));
                }}
                onCompare={(parkCode) => router.push(`/compare?park=${parkCode}`)}
              />
            </div>
          </div>
        )}

        {selectedCampground && !mapState.selectedPark && !selectedPlace && (
          <div className={DESKTOP_PREVIEW_PANEL}>
            <div className={DESKTOP_PREVIEW_SCROLL}>
              <CampgroundPreviewCard
                campground={selectedCampground}
                campgroundDetails={campgroundDetails}
                onClose={mapState.clearSelection}
                onViewPark={goToParkCamping}
                compact={false}
              />
            </div>
          </div>
        )}

        {selectedPlace && !mapState.selectedPark && !selectedCampground && (
          <div className={DESKTOP_PREVIEW_PANEL}>
            <div className={DESKTOP_PREVIEW_SCROLL}>
              <PlacePreviewCard
                place={selectedPlace}
                placeDetails={placeDetails}
                onClose={mapState.clearSelection}
                onViewPark={goToParkPlaces}
                compact={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
