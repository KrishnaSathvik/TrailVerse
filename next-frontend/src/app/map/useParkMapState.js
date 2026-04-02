'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const rawState = window.localStorage.getItem(STORAGE_KEY);
      if (!rawState) {
        setHasRestored(true);
        return;
      }

      const parsedState = JSON.parse(rawState);

      if (parsedState.searchQuery) {
        setSearchQuery(parsedState.searchQuery);
      }

      if (parsedState.selectedParkCode) {
        setSelectedParkCode(parsedState.selectedParkCode);
      }

      if (parsedState.mapCenter?.lat && parsedState.mapCenter?.lng) {
        setMapCenter(parsedState.mapCenter);
      }

      if (typeof parsedState.mapZoom === 'number') {
        setMapZoom(parsedState.mapZoom);
      }
    } catch (error) {
      console.error('Failed to restore map state:', error);
    } finally {
      setHasRestored(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !hasRestored) return;

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        searchQuery,
        selectedParkCode,
        mapCenter,
        mapZoom,
      }));
    } catch (error) {
      console.error('Failed to persist map state:', error);
    }
  }, [hasRestored, mapCenter, mapZoom, searchQuery, selectedParkCode]);

  useEffect(() => {
    if (!hasRestored || !Array.isArray(allParks) || allParks.length === 0) return;

    const requestedParkCode = searchParams.get('park');
    if (!requestedParkCode) return;

    const matchingPark = allParks.find((park) => park.parkCode === requestedParkCode);
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
  const selectedPark = (allParks || []).find((park) => park.parkCode === selectedParkCode) || null;

  const selectPark = (park) => {
    if (!park) return;

    setSelectedParkCode(park.parkCode);

    if (park.latitude && park.longitude) {
      setMapCenter({
        lat: Number.parseFloat(park.latitude),
        lng: Number.parseFloat(park.longitude),
      });
      setMapZoom(10);
    }
  };

  const clearSelection = () => {
    setSelectedParkCode(null);
    setMapCenter(DEFAULT_CENTER);
    setMapZoom(DEFAULT_ZOOM);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSelectedParkCode(null);
    setMapCenter(DEFAULT_CENTER);
    setMapZoom(DEFAULT_ZOOM);
  };

  const updateViewport = ({ center, zoom }) => {
    if (center) setMapCenter(center);
    if (typeof zoom === 'number') setMapZoom(zoom);
  };

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
