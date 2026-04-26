'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 };
const DEFAULT_ZOOM = 4;
const STORAGE_KEY = 'trailverse-map-v2';

export default function useParkMapState(allParks) {
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedParkCode, setSelectedParkCode] = useState(null);
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);
  const [hasRestored, setHasRestored] = useState(false);

  // Always start with the default US overview — no localStorage restore.
  // This ensures returning from park details / compare always shows all parks.
  useEffect(() => {
    setHasRestored(true);
  }, []);

  useEffect(() => {
    if (!hasRestored || !Array.isArray(allParks) || allParks.length === 0) return;

    const requestedParkCode = searchParams.get('park');
    if (!requestedParkCode) return;

    const matchingPark = allParks.find((park) => park.parkCode?.toLowerCase() === requestedParkCode.toLowerCase());
    if (!matchingPark) return;

    setSelectedParkCode(matchingPark.parkCode);
    setSearchQuery(matchingPark.fullName || '');

    if (matchingPark.latitude && matchingPark.longitude) {
      setMapCenter({
        lat: Number.parseFloat(matchingPark.latitude),
        lng: Number.parseFloat(matchingPark.longitude),
      });
      setMapZoom(10);
    }
  }, [allParks, hasRestored, searchParams]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredParks = !normalizedQuery
    ? allParks || []
    : (allParks || []).filter((park) => {
        const fullName = park.fullName?.toLowerCase() || '';
        const states = park.states?.toLowerCase() || '';
        const designation = park.designation?.toLowerCase() || '';
        const parkCode = park.parkCode?.toLowerCase() || '';

        return (
          fullName.includes(normalizedQuery) ||
          states.includes(normalizedQuery) ||
          designation.includes(normalizedQuery) ||
          parkCode.includes(normalizedQuery)
        );
      });

  const results = [...filteredParks].sort((parkA, parkB) => {
    const aName = parkA.fullName?.toLowerCase() || '';
    const bName = parkB.fullName?.toLowerCase() || '';

    if (normalizedQuery) {
      if (aName === normalizedQuery) return -1;
      if (bName === normalizedQuery) return 1;
      if (aName.startsWith(normalizedQuery) && !bName.startsWith(normalizedQuery)) return -1;
      if (bName.startsWith(normalizedQuery) && !aName.startsWith(normalizedQuery)) return 1;
    }

    return aName.localeCompare(bName);
  });

  const suggestions = normalizedQuery ? results.slice(0, 8) : [];
  const selectedPark = (allParks || []).find((park) => park.parkCode?.toLowerCase() === selectedParkCode?.toLowerCase()) || null;

  const selectPark = useCallback((park) => {
    if (!park) return;

    setSelectedParkCode(park.parkCode);

    if (park.latitude && park.longitude) {
      setMapCenter({
        lat: Number.parseFloat(park.latitude),
        lng: Number.parseFloat(park.longitude),
      });
      // Only zoom in if the user is very zoomed out — avoids the jarring
      // snap when clicking markers at a reasonable zoom level.
      setMapZoom((prev) => (prev < 6 ? 6 : prev));
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedParkCode(null);
    setMapCenter(DEFAULT_CENTER);
    setMapZoom(DEFAULT_ZOOM);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSelectedParkCode(null);
    setMapCenter(DEFAULT_CENTER);
    setMapZoom(DEFAULT_ZOOM);
  }, []);

  const updateViewport = useCallback(({ center, zoom }) => {
    if (center) setMapCenter(center);
    if (typeof zoom === 'number') setMapZoom(zoom);
  }, []);

  return {
    hasRestored,
    mapCenter,
    mapZoom,
    searchQuery,
    selectedPark,
    results,
    suggestions,
    setSearchQuery,
    selectPark,
    clearSelection,
    clearSearch,
    updateViewport,
  };
}
